// Development-only PostgREST adapter. SQL/RPCs and RLS come from the real migrations.
// Unsupported syntax fails explicitly instead of returning fabricated data.
export function identifier(value) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(value)) throw new Error(`Unsupported SQL identifier: ${value}`);
  return `"${value}"`;
}

export function splitList(value) {
  const result = []; let depth = 0, quoted = false, start = 0;
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (ch === '"' && value[i - 1] !== '\\') quoted = !quoted;
    if (!quoted) {
      if (ch === '(' || ch === '{') depth++;
      if (ch === ')' || ch === '}') depth--;
      if (ch === ',' && depth === 0) { result.push(value.slice(start, i).trim()); start = i + 1; }
    }
  }
  if (quoted || depth !== 0) throw new Error('Malformed REST expression');
  return [...result, value.slice(start).trim()].filter(Boolean);
}
const unquote = value => value.startsWith('"') ? JSON.parse(value) : value;

export class RestAdapter {
  constructor(db) { this.db = db; this.relations = null; }

  async foreignKeys() {
    if (!this.relations) this.relations = (await this.db.query(`select c.conname name, a.relname source, b.relname target,
      sa.attname source_column, ta.attname target_column
      from pg_constraint c join pg_class a on a.oid=c.conrelid join pg_class b on b.oid=c.confrelid
      join pg_namespace n on n.oid=a.relnamespace
      join pg_attribute sa on sa.attrelid=a.oid and sa.attnum=c.conkey[1]
      join pg_attribute ta on ta.attrelid=b.oid and ta.attnum=c.confkey[1]
      where c.contype='f' and n.nspname='public' and array_length(c.conkey,1)=1`)).rows;
    return this.relations;
  }

  async columns(table) {
    return (await this.db.query("select column_name,data_type,udt_name from information_schema.columns where table_schema='public' and table_name=$1", [table])).rows;
  }

  async request(resource, method, params, payload, prefer = '', onCount) {
    if (resource.startsWith('rpc/')) return this.rpc(resource.slice(4), payload ?? Object.fromEntries(params));
    identifier(resource);
    const values = [];
    const bind = value => { values.push(value); return `$${values.length}`; };
    const fields = value => {
      const match = /^([a-z_][a-z0-9_]*)(?:(->>?)([a-z_][a-z0-9_]*))?$/i.exec(value);
      if (!match) throw new Error(`Unsupported REST field: ${value}`);
      return `${identifier(match[1])}${match[2] ? `${match[2]}${bind(match[3])}::text` : ''}`;
    };
    const predicate = (key, value) => {
      if (key === 'or' || key === 'and') {
        if (!value.startsWith('(') || !value.endsWith(')')) throw new Error('Malformed REST group');
        return `(${splitList(value.slice(1, -1)).map(part => {
          const nested = /^(or|and)\((.*)\)$/.exec(part);
          if (nested) return predicate(nested[1], `(${nested[2]})`);
          const dot = part.indexOf('.');
          return predicate(part.slice(0, dot), part.slice(dot + 1));
        }).join(key === 'or' ? ' OR ' : ' AND ')})`;
      }
      if (value.startsWith('not.')) return `NOT (${predicate(key, value.slice(4))})`;
      const dot = value.indexOf('.'), op = value.slice(0, dot), raw = value.slice(dot + 1);
      const field = fields(key);
      if (op === 'is') {
        if (!['null', 'true', 'false'].includes(raw)) throw new Error('Invalid IS filter');
        return `${field} IS ${raw.toUpperCase()}`;
      }
      if (op === 'in') {
        if (!raw.startsWith('(') || !raw.endsWith(')')) throw new Error('Invalid IN filter');
        const items = splitList(raw.slice(1, -1)).map(unquote);
        return items.length ? `${field} IN (${items.map(bind).join(',')})` : 'false';
      }
      const operators = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=', like: 'LIKE', ilike: 'ILIKE', cs: '@>', cd: '<@', ov: '&&' };
      if (!operators[op]) throw new Error(`Unsupported REST operator: ${op}`);
      return `${field} ${operators[op]} ${bind(op === 'like' || op === 'ilike' ? unquote(raw).replaceAll('*', '%') : unquote(raw))}`;
    };
    const selections = splitList(params.get('select') ?? '*');
    const embedded = [], selected = [];
    for (const selection of selections) {
      const relation = /^(?:(\w+):)?(\w+)(?:!(\w+))?(?:!(inner))?\((.*)\)$/.exec(selection);
      if (relation) { embedded.push({ alias: relation[1] ?? relation[2], table: relation[2], hint: relation[3] === 'inner' ? null : relation[3], inner: relation[3] === 'inner' || relation[4] === 'inner', select: relation[5] }); continue; }
      if (selection === '*') { selected.push('*'); continue; }
      const colon = selection.indexOf(':');
      selected.push(colon < 0 ? fields(selection) : `${fields(selection.slice(colon + 1))} AS ${identifier(selection.slice(0, colon))}`);
    }
    const constraints = [], ignored = new Set(['select', 'order', 'limit', 'offset', 'on_conflict']);
    for (const [key, value] of params) {
      if (!ignored.has(key) && !key.includes('.')) constraints.push(predicate(key, value));
    }
    const foreignKeys = embedded.length ? await this.foreignKeys() : [];
    for (const relation of embedded) {
      const options = foreignKeys.filter(fk => ((fk.source === resource && fk.target === relation.table) || (fk.target === resource && fk.source === relation.table)) && (!relation.hint || [fk.name, fk.source_column].includes(relation.hint)));
      if (options.length !== 1) throw new Error(`Ambiguous or missing local relation ${resource}.${relation.table}`);
      relation.fk = options[0]; relation.forward = relation.fk.source === resource;
      relation.own = relation.forward ? relation.fk.source_column : relation.fk.target_column;
      relation.other = relation.forward ? relation.fk.target_column : relation.fk.source_column;
      // Keep the link column internally when a projection omits it.
      if (!selected.includes('*') && !selected.includes(identifier(relation.own))) selected.push(identifier(relation.own));
      if (relation.inner) {
        const relationConstraints = [];
        for (const [key, value] of params) if (key.startsWith(`${relation.alias}.`)) relationConstraints.push(predicate(key.slice(relation.alias.length + 1), value));
        constraints.push(`${identifier(relation.own)} IN (SELECT ${identifier(relation.other)} FROM public.${identifier(relation.table)}${relationConstraints.length ? ` WHERE ${relationConstraints.join(' AND ')}` : ''})`);
      }
    }
    const where = constraints.length ? ` WHERE ${constraints.join(' AND ')}` : '';
    const table = `public.${identifier(resource)}`;
    let sql;
    if (method === 'GET' || method === 'HEAD') {
      if (prefer.includes('count=exact')) {
        const count = await this.db.query(`SELECT count(*)::integer AS total FROM (SELECT ${selected.length ? selected.join(',') : '*'} FROM ${table}${where}) counted`, values);
        onCount?.(count.rows[0].total);
      }
      const order = params.get('order') ? ` ORDER BY ${splitList(params.get('order')).map(part => {
        const [column, direction = 'asc', nulls] = part.split('.');
        if (!['asc', 'desc'].includes(direction) || (nulls && !['nullsfirst', 'nullslast'].includes(nulls))) throw new Error('Invalid order');
        return `${fields(column)} ${direction}${nulls ? ` NULLS ${nulls === 'nullsfirst' ? 'FIRST' : 'LAST'}` : ''}`;
      }).join(',')}` : '';
      const numeric = (name, fallback) => {
        const value = Number(params.get(name) ?? fallback);
        if (!Number.isSafeInteger(value) || value < 0) throw new Error('Invalid pagination');
        return value;
      };
      sql = `SELECT ${selected.length ? selected.join(',') : '*'} FROM ${table}${where}${order} LIMIT ${bind(numeric('limit', 1000))} OFFSET ${bind(numeric('offset', 0))}`;
    } else if (method === 'POST' || method === 'PATCH') {
      const rows = Array.isArray(payload) ? payload : [payload];
      if (!rows.length) return [];
      if (rows.some(row => !row || typeof row !== 'object' || Array.isArray(row))) throw new Error('Invalid row payload');
      const keys = [...new Set(rows.flatMap(row => Object.keys(row)))];
      const columns = await this.columns(resource);
      const value = (key, raw) => {
        const column = columns.find(column => column.column_name === key);
        if (!column) throw new Error(`Unknown column ${resource}.${key}`);
        return bind(raw != null && ['json', 'jsonb'].includes(column.data_type) ? JSON.stringify(raw) : raw);
      };
      if (method === 'PATCH') {
        if (rows.length !== 1 || !keys.length) throw new Error('Invalid update');
        sql = `UPDATE ${table} SET ${keys.map(key => `${identifier(key)}=${value(key, rows[0][key])}`).join(',')}${where} RETURNING *`;
      } else {
        const conflict = params.get('on_conflict');
        let resolution = '';
        if (prefer.includes('resolution=ignore-duplicates')) resolution = ` ON CONFLICT${conflict ? ` (${splitList(conflict).map(identifier).join(',')})` : ''} DO NOTHING`;
        if (prefer.includes('resolution=merge-duplicates')) {
          const conflictKeys = splitList(conflict ?? 'id');
          const changes = keys.filter(key => !conflictKeys.includes(key));
          resolution = ` ON CONFLICT (${conflictKeys.map(identifier).join(',')}) DO ${changes.length ? `UPDATE SET ${changes.map(key => `${identifier(key)}=excluded.${identifier(key)}`).join(',')}` : 'NOTHING'}`;
        }
        sql = keys.length ? `INSERT INTO ${table} (${keys.map(identifier).join(',')}) VALUES ${rows.map(row => `(${keys.map(key => Object.hasOwn(row, key) ? value(key, row[key]) : 'DEFAULT').join(',')})`).join(',')}${resolution} RETURNING *` : `INSERT INTO ${table} DEFAULT VALUES RETURNING *`;
      }
    } else if (method === 'DELETE') sql = `DELETE FROM ${table}${where} RETURNING *`;
    else throw new Error('Unsupported REST method');
    const result = (await this.db.query(sql, values)).rows;
    for (const relation of embedded) {
      for (const row of result) {
        const query = new URLSearchParams({ select: relation.select, [relation.other]: `eq.${row[relation.own]}` });
        for (const [key, value] of params) if (key.startsWith(`${relation.alias}.`)) query.set(key.slice(relation.alias.length + 1), value);
        const children = row[relation.own] == null ? [] : await this.request(relation.table, 'GET', query);
        row[relation.alias] = relation.forward ? children[0] ?? null : children;
      }
    }
    return result;
  }

  async rpc(name, payload = {}) {
    identifier(name);
    const functions = (await this.db.query(`select p.oid,p.proargnames names,p.pronargs-p.pronargdefaults required,p.proretset returns_set,
      array(select format_type(t,null) from unnest(p.proargtypes::oid[]) t) types
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=$1`, [name])).rows;
    const keys = Object.keys(payload);
    const candidates = functions.filter(fn => keys.every(key => (fn.names ?? []).includes(key)) && (fn.names ?? []).slice(0, fn.required).every(key => keys.includes(key)));
    if (candidates.length !== 1) throw new Error(`Unknown or ambiguous RPC ${name}(${keys.join(',')})`);
    const fn = candidates[0], values = [];
    const args = keys.map(key => {
      const type = fn.types[fn.names.indexOf(key)];
      // Types are obtained from PostgreSQL's catalog, not from the request.
      values.push(payload[key] != null && ['json', 'jsonb'].includes(type) ? JSON.stringify(payload[key]) : payload[key]);
      return `${identifier(key)} => $${values.length}::${type}`;
    });
    const call = `public.${identifier(name)}(${args.join(',')})`;
    const result = await this.db.query(fn.returns_set ? `SELECT * FROM ${call}` : `SELECT to_jsonb(${call}) AS value`, values);
    return fn.returns_set ? result.rows : result.rows[0]?.value ?? null;
  }
}
