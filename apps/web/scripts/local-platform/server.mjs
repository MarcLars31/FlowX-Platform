import { createServer } from 'node:http';
import { randomBytes, createHmac, createHash, scryptSync, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { openDatabase } from './database.mjs';
import { RestAdapter } from './rest.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
export function passwordHash(password, salt = randomBytes(16).toString('hex')) {
  return `${salt}:${scryptSync(password, salt, 32).toString('hex')}`;
}
function passwordMatches(password, stored) {
  const [salt] = stored.split(':');
  const actual = Buffer.from(passwordHash(password, salt));
  const expected = Buffer.from(stored);
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}
function userView(user) {
  return { id: user.id, email: user.email, app_metadata: user.raw_app_meta_data, user_metadata: user.raw_user_meta_data, aud: 'authenticated', role: 'authenticated' };
}
function fail(message, status = 400) { return Object.assign(new Error(message), { status }); }

export async function credentialsAt(directory) {
  await mkdir(directory, { recursive: true });
  const path = resolve(directory, 'credentials.json');
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const credentials = { password: randomBytes(24).toString('base64url'), jwtSecret: randomBytes(32).toString('hex'), anonKey: `sb_publishable_local_${randomBytes(24).toString('hex')}`, serviceKey: `sb_secret_local_${randomBytes(32).toString('hex')}`, instance: randomBytes(24).toString('hex') };
  await writeFile(path, JSON.stringify(credentials), { flag: 'wx', mode: 0o600 });
  return credentials;
}

export async function startBackend({ directory, repository, credentials, port = 54329 }) {
  const db = await openDatabase(directory, repository, passwordHash(credentials.password));
  // A stopped local web process cannot still own a worker lease. Resume its jobs.
  await db.exec("update public.technical_description_jobs set status='queued',phase='queued',lease_until=null,next_attempt_at=now() where status='running'");
  await db.query("insert into local_runtime.settings(key,value) values('scheduler-token',$1) on conflict(key) do update set value=excluded.value", [credentials.instance + credentials.instance.slice(0, 24)]);
  await db.exec(`create or replace function public.authorize_import_scheduler(requested_token text) returns boolean
    language sql stable security definer set search_path=pg_catalog as $$
      select exists(select 1 from local_runtime.settings where key='scheduler-token' and value=requested_token);
    $$;
    revoke all on function public.authorize_import_scheduler(text) from public,anon,authenticated;
    grant execute on function public.authorize_import_scheduler(text) to service_role;`);
  const adapter = new RestAdapter(db);
  const uploads = new Map();
  const fileDirectory = resolve(directory, 'files');
  await mkdir(fileDirectory, { recursive: true });
  const signature = text => createHmac('sha256', credentials.jwtSecret).update(text).digest('base64url');
  function accessToken(user) {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const claims = { sub: user.id, role: 'authenticated', app_metadata: user.raw_app_meta_data, aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 };
    const data = `${header}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}`;
    return `${data}.${signature(data)}`;
  }
  async function authenticatedUser(request) {
    const token = request.headers.authorization?.replace(/^Bearer /, '') ?? '';
    const [header, payload, signed] = token.split('.');
    if (!header || !payload || !signed) throw fail('Authentication required', 401);
    const expected = Buffer.from(signature(`${header}.${payload}`)), supplied = Buffer.from(signed);
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) throw fail('Invalid local session', 401);
    let claims;
    try { claims = JSON.parse(Buffer.from(payload, 'base64url').toString()); } catch { throw fail('Invalid local session', 401); }
    if (!claims.sub || claims.exp <= Date.now() / 1000) throw fail('Expired local session', 401);
    const user = (await db.query('select * from auth.users where id=$1', [claims.sub])).rows[0];
    if (!user) throw fail('Unknown local user', 401);
    return user;
  }
  async function session(user) {
    const refresh = randomBytes(32).toString('base64url');
    await db.query("insert into local_runtime.sessions values($1,$2,now()+interval '30 days')", [hash(refresh), user.id]);
    return { access_token: accessToken(user), refresh_token: refresh, expires_in: 3600, token_type: 'bearer', user: userView(user) };
  }
  const asRole = async (user, admin, callback) => db.transaction(async tx => {
    await tx.exec(admin ? 'SET LOCAL ROLE service_role' : 'SET LOCAL ROLE authenticated');
    await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [user?.id ?? '']);
    await tx.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: user?.id, role: admin ? 'service_role' : 'authenticated', app_metadata: user?.raw_app_meta_data ?? {} })]);
    return callback(tx);
  });
  async function body(request, maximum = 35 * 1024 * 1024) {
    const chunks = []; let size = 0;
    for await (const chunk of request) { size += chunk.length; if (size > maximum) throw fail('Local request too large', 413); chunks.push(chunk); }
    return Buffer.concat(chunks);
  }
  async function jsonBody(request) {
    const raw = await body(request, 16 * 1024 * 1024);
    return raw.length ? JSON.parse(raw.toString()) : {};
  }
  const json = (response, value, status = 200) => { response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); response.end(JSON.stringify(value)); };
  let chain = Promise.resolve();
  const server = createServer((request, response) => {
    chain = chain.then(async () => {
      if (!['127.0.0.1', '::ffff:127.0.0.1', '::1'].includes(request.socket.remoteAddress)) throw fail('Loopback only', 403);
      if (!/^(127\.0\.0\.1|localhost):\d+$/.test(request.headers.host ?? '')) throw fail('Invalid local host', 403);
      const origin = request.headers.origin;
      if (origin && !['http://127.0.0.1:3100', 'http://localhost:3100'].includes(origin)) throw fail('Invalid local origin', 403);
      if (origin) {
        response.setHeader('Access-Control-Allow-Origin', origin);
        response.setHeader('Vary', 'Origin');
        response.setHeader('Access-Control-Allow-Headers', 'content-type,cache-control,apikey,authorization,x-upsert');
        response.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
      }
      if (request.method === 'OPTIONS') { response.writeHead(204); response.end(); return; }
      const url = new URL(request.url, 'http://127.0.0.1');
      if (url.pathname === '/health') { json(response, { local: true, instance: credentials.instance }); return; }
      const admin = request.headers.apikey === credentials.serviceKey;
      const signedUpload = url.pathname.startsWith('/storage/v1/object/upload/sign/') && url.searchParams.has('token');
      if (!admin && request.headers.apikey !== credentials.anonKey && !signedUpload) throw fail('Invalid local API key', 401);
      if (url.pathname === '/auth/v1/token') {
        const input = await jsonBody(request); let user;
        if (url.searchParams.get('grant_type') === 'refresh_token') {
          user = (await db.query('select u.* from auth.users u join local_runtime.sessions s on s.user_id=u.id where s.token_hash=$1 and s.expires_at>now()', [hash(String(input.refresh_token))])).rows[0];
          if (!user) throw Object.assign(fail('Invalid refresh token', 401), { code: 'refresh_token_not_found' });
          await db.query('delete from local_runtime.sessions where token_hash=$1', [hash(String(input.refresh_token))]);
        } else {
          const account = (await db.query('select u.*,a.password_hash from auth.users u join local_runtime.accounts a on a.user_id=u.id where lower(u.email)=$1', [String(input.email).toLowerCase()])).rows[0];
          if (!account || !passwordMatches(String(input.password), account.password_hash)) throw fail('Invalid login credentials', 400);
          user = account;
        }
        json(response, await session(user)); return;
      }
      if (url.pathname === '/auth/v1/user') { json(response, userView(await authenticatedUser(request))); return; }
      if (url.pathname === '/auth/v1/logout') { const user = await authenticatedUser(request); await db.query('delete from local_runtime.sessions where user_id=$1', [user.id]); json(response, {}); return; }
      if (url.pathname.startsWith('/auth/v1/')) throw fail('This hosted authentication operation is not available locally; no email was sent.', 501);
      const user = admin || signedUpload ? null : await authenticatedUser(request);
      if (url.pathname.startsWith('/rest/v1/')) {
        const resource = decodeURIComponent(url.pathname.slice('/rest/v1/'.length));
        const payload = ['GET', 'HEAD', 'DELETE'].includes(request.method) ? undefined : await jsonBody(request);
        let total;
        const data = await asRole(user, admin, async tx => {
          const previous = adapter.db; adapter.db = tx;
          try { return await adapter.request(resource, request.method, url.searchParams, payload, request.headers.prefer ?? '', count => { total = count; }); }
          finally { adapter.db = previous; }
        });
        if (total !== undefined) {
          const offset = Number(url.searchParams.get('offset') ?? 0);
          response.setHeader('Content-Range', `${data.length ? `${offset}-${offset + data.length - 1}` : '*'}/${total}`);
        }
        if (request.method === 'HEAD') { response.writeHead(200); response.end(); }
        else json(response, data);
        return;
      }
      const storage = /^\/storage\/v1\/object\/(upload\/sign\/)?([^/]+)(?:\/(.+))?$/.exec(url.pathname);
      if (storage) {
        const bucket = decodeURIComponent(storage[2]), name = storage[3]?.split('/').map(decodeURIComponent).join('/');
        if (storage[1] && request.method === 'POST' && admin) {
          const token = randomBytes(32).toString('base64url');
          uploads.set(token, { bucket, name, expires: Date.now() + 120_000 });
          json(response, { url: `/object/upload/sign/${storage[2]}/${storage[3]}?token=${token}` }); return;
        }
        if (request.method === 'DELETE' && !name) {
          const { prefixes } = await jsonBody(request);
          if (!Array.isArray(prefixes)) throw fail('Invalid storage deletion');
          for (const path of prefixes) {
            const removed = await asRole(user, admin, tx => tx.query('delete from storage.objects where bucket_id=$1 and name=$2 returning id', [bucket, path]));
            if (removed.rows.length) await unlink(resolve(fileDirectory, hash(`${bucket}/${path}`))).catch(error => { if (error.code !== 'ENOENT') throw error; });
          }
          json(response, []); return;
        }
        if (!name || name.split('/').some(part => !part || part === '.' || part === '..')) throw fail('Invalid storage path');
        const file = resolve(fileDirectory, hash(`${bucket}/${name}`));
        if (request.method === 'GET') {
          const metadata = await asRole(user, admin, tx => tx.query('select metadata from storage.objects where bucket_id=$1 and name=$2', [bucket, name]));
          if (!metadata.rows.length) throw fail('File not found', 404);
          const bytes = await readFile(file);
          response.writeHead(200, { 'Content-Type': metadata.rows[0].metadata?.mimetype ?? 'application/octet-stream', 'Content-Length': bytes.length, 'Cache-Control': 'no-store' }); response.end(bytes); return;
        }
        if (!['POST', 'PUT'].includes(request.method)) throw fail('Unsupported storage operation', 405);
        if (signedUpload) {
          const token = url.searchParams.get('token'), pending = uploads.get(token);
          if (!pending || pending.expires < Date.now() || pending.bucket !== bucket || pending.name !== name) throw fail('Invalid local upload token', 403);
          uploads.delete(token);
        }
        let bytes = await body(request), contentType = request.headers['content-type'] ?? 'application/octet-stream';
        if (contentType.startsWith('multipart/form-data')) {
          const form = await new Request('http://127.0.0.1', { method: 'POST', headers: { 'content-type': contentType }, body: bytes }).formData();
          const file = [...form.values()].find(value => typeof value !== 'string');
          if (!file) throw fail('Missing upload file');
          bytes = Buffer.from(await file.arrayBuffer()); contentType = file.type;
        }
        await asRole(user, admin || signedUpload, async tx => {
          const upsert = request.headers['x-upsert'] === 'true' && !signedUpload;
          await tx.query(`insert into storage.objects(bucket_id,name,owner,metadata) values($1,$2,$3,$4)${upsert ? ' on conflict(bucket_id,name) do update set metadata=excluded.metadata' : ''}`, [bucket, name, user?.id ?? null, JSON.stringify({ mimetype: contentType, size: bytes.length })]);
          await writeFile(file, bytes);
        });
        json(response, { Key: `${bucket}/${name}`, key: `${bucket}/${name}` }); return;
      }
      throw fail('Unknown local endpoint', 404);
    }).catch(error => {
      const status = error.status ?? (error.code === '42501' ? 403 : error.code === '23505' ? 409 : 400);
      console.error('local_backend_request_failed', request.method, request.url?.split('?')[0], error.code ?? '', error.message);
      if (!response.headersSent) json(response, { message: error.message, code: error.code ?? 'LOCAL_BACKEND_ERROR' }, status);
      else response.end();
    });
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); }).catch(async error => { await db.close(); throw error; });
  return { db, server, close: async () => { await new Promise(resolve => server.close(resolve)); await chain; await db.close(); } };
}
