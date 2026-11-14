import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readFile, readdir, mkdir } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';

export const CUSTOMER_EMAIL = 'utveckling@scipx.local';
export const ADMIN_EMAIL = 'admin@scipx.local';

export async function openDatabase(directory, repository, passwordHash) {
  await mkdir(directory, { recursive: true });
  const db = new PGlite({ dataDir: resolve(directory, 'database'), extensions: { pgcrypto } });
  try {
    const initialized = (await db.query("select to_regclass('local_runtime.migrations') as table_name")).rows[0].table_name;
    if (!initialized) {
      await db.exec(await readFile(resolve(repository, 'supabase/scripts/test-bootstrap.sql'), 'utf8'));
      await db.exec(`create schema local_runtime;
        create table local_runtime.migrations(name text primary key, checksum text not null);
        create table local_runtime.accounts(user_id uuid primary key references auth.users(id), password_hash text not null);
        create table local_runtime.sessions(token_hash text primary key,user_id uuid references auth.users(id),expires_at timestamptz not null);
        create table local_runtime.settings(key text primary key,value text not null);`);
    }
    const migrations = resolve(repository, 'supabase/migrations');
    for (const name of (await readdir(migrations)).filter(name => name.endsWith('.sql')).sort()) {
      // Hosted pg_cron/pg_net are replaced by the local launcher's maintenance timer.
      if (name === '20260927154000_import_scheduler.sql') continue;
      const sql = await readFile(resolve(migrations, name), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const existing = (await db.query('select checksum from local_runtime.migrations where name=$1', [name])).rows[0];
      if (existing) {
        if (existing.checksum !== checksum) throw new Error(`Applied local migration changed: ${name}. Add a new migration; the local data has been preserved.`);
        continue;
      }
      // Existing repository migrations include their own transaction boundaries.
      try { await db.exec(sql); }
      catch (error) { throw new Error(`Local migration ${name}: ${error.message}`); }
      await db.query('insert into local_runtime.migrations values($1,$2)', [name, checksum]);
    }
    if (!(await db.query("select 1 from local_runtime.settings where key='seeded-v1'")).rows.length) {
      for (const name of ['20260806_demo_data.sql', '20260806_demo_sprinkler_catalog.sql', '20260807_demo_supplier_and_matching_catalog.sql']) {
        await db.exec(await readFile(resolve(repository, 'supabase/seed', name), 'utf8'));
      }
      const organization = 'd0000000-0000-4000-8000-000000000003';
      await db.query("update organizations set name='ScipX utvecklingsmiljö' where id=$1", [organization]);
      await db.query("insert into organization_subscriptions(organization_id,plan_key,status) values($1,'test','active') on conflict(organization_id) do nothing", [organization]);
      for (const seat of ['admin', 'full_user', 'mini_user', 'read_only']) {
        await db.query('insert into organization_seat_limits(organization_id,seat_type,seat_limit) values($1,$2,50) on conflict(organization_id,seat_type) do update set seat_limit=50', [organization, seat]);
      }
      for (const [email, name, role] of [[CUSTOMER_EMAIL, 'Lokal utvecklare', 'customer'], [ADMIN_EMAIL, 'Lokal administratör', 'platform_admin']]) {
        const user = randomUUID();
        await db.query('insert into auth.users(id,email,raw_user_meta_data,raw_app_meta_data) values($1,$2,$3,$4)', [user, email, JSON.stringify({ full_name: name }), JSON.stringify({ role, local_test_account: true })]);
        await db.query('insert into local_runtime.accounts values($1,$2)', [user, passwordHash]);
        await db.query("insert into organization_members(organization_id,user_id,role_id,status) select $1,$2,id,'active' from roles where slug='organization_owner' and organization_id is null limit 1", [organization, user]);
        if (role === 'customer') {
          await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
          await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub: user, role: 'authenticated', app_metadata: { role } })]);
          const project = (await db.query("select create_project_with_defaults($1,null,'Lokalt testprojekt',requested_customer_name=>'Exempelkund',requested_country_code=>'NO',requested_standard=>'NS',requested_owner_user_id=>$2) id", [organization, user])).rows[0].id;
          for (const [index, title] of ['Rörledning DN25', 'Avstängningsventil DN25', 'Sprinklerhuvud K80'].entries()) {
            await db.query("insert into project_requirements(id,organization_id,project_id,category,requirement_key,value_text,value_json,status) values($1,$2,$3,$4,$5,$6,$7,'extracted_unreviewed')", [randomUUID(), organization, project, index === 2 ? 'sprinkler_head' : 'pipe', `local-example-${index}`, title, JSON.stringify({ postNumber: `31.${index + 1}`, sourceChapter: { title: '31 VVS – lokalt exempel' }, quantity: index === 0 ? 20 : 4, unit: index === 0 ? 'm' : 'stk', localTestData: true })]);
          }
        }
      }
      await db.query("insert into local_runtime.settings values('seeded-v1','true')");
    }
    // Supabase's service role has the same grants; the bootstrap only defines the role.
    await db.exec(`grant usage on schema public,storage,auth to service_role;
      grant all on all tables in schema public,storage,auth to service_role;
      grant all on all sequences in schema public,storage,auth to service_role;
      grant execute on all functions in schema public,storage,auth to service_role;
      grant usage on schema storage to authenticated;
      grant select,insert,update,delete on storage.objects to authenticated;
      alter table storage.objects enable row level security;`);
    await db.query("select set_config('request.jwt.claim.sub','',false)");
    await db.query("select set_config('request.jwt.claims','{}',false)");
    return db;
  } catch (error) { await db.close(); throw error; }
}
