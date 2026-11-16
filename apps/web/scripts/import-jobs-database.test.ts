import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";

test("durable import jobs isolate owners, deduplicate enqueue, recover expired leases and recheck revoked permissions",async()=>{
  const db=new PGlite();
  const org=randomUUID(), user=randomUUID(), other=randomUUID(), project=randomUUID(), upload=randomUUID();
  try {
    await db.exec(`create role authenticated; create role anon; create role service_role;
      create schema auth;
      create table auth.users(id uuid primary key);
      create table organizations(id uuid primary key);
      create table projects(id uuid primary key,organization_id uuid,deleted_at timestamptz);
      create table test_members(user_id uuid,organization_id uuid,active boolean);
      create function auth.uid() returns uuid language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;
      create function has_permission(uuid,text) returns boolean language sql stable security definer as $$ select exists(select 1 from public.test_members where user_id=auth.uid() and organization_id=$1 and active) $$;
      create function can_access_project(uuid) returns boolean language sql stable security definer as $$ select exists(select 1 from public.projects where id=$1 and deleted_at is null and public.has_permission(organization_id,'project.view')) $$;
      create function create_project_with_defaults(requested_organization_id uuid,requested_project_number text,requested_name text,requested_owner_user_id uuid default null,requested_system_type text default null) returns uuid language plpgsql as $$ declare p uuid:=gen_random_uuid(); begin insert into public.projects values(p,requested_organization_id,null); return p; end $$;
      insert into organizations values('${org}'); insert into auth.users values('${user}'),('${other}');
      insert into test_members values('${user}','${org}',true),('${other}','${org}',true);
      insert into projects values('${project}','${org}',null);
      select set_config('request.jwt.claim.sub','${user}',false);`);
    await db.exec(readFileSync(new URL('../../../supabase/migrations/20260927153000_durable_import_jobs.sql',import.meta.url),'utf8'));
    const enqueue=async(u=upload,p:string|null=project)=> (await db.query<{job:{id:string;project_id:string}}>("select to_jsonb(enqueue_technical_description_job($1,$2,$3,'local.pdf',true,null)) as job",[org,p,u])).rows[0].job;
    const one=await enqueue(); assert.equal((await enqueue()).id,one.id);
    const two=await enqueue(randomUUID(),null); assert.notEqual(two.project_id,project);
    const claim=async(id:string|null=null)=>(await db.query<{job:{id:string;lease_id:string;attempts:number}|null}>("select to_jsonb(claim_technical_description_job($1)) as job",[id])).rows[0].job;
    const first=await claim(one.id); assert.equal(first?.attempts,1);
    assert.equal(await claim(two.id),null,"global one-import budget");
    const allowed=async(lease:string)=>(await db.query<{allowed:boolean}>("select authorize_technical_description_job($1,$2) as allowed",[one.id,lease])).rows[0].allowed;
    await db.exec(`select set_config('request.jwt.claim.sub','${other}',false)`);
    assert.equal(await allowed(first!.lease_id),true,"uses submitter, not caller identity");
    assert.equal((await db.query<{id:string}>("select auth.uid() as id")).rows[0].id,other,"restores request identity");
    await db.exec(`update test_members set active=false where user_id='${user}'`);
    assert.equal(await allowed(first!.lease_id),false,"revoked permissions stop background work");
    await db.exec(`update technical_description_jobs set lease_until=now()-interval '1 second' where id='${one.id}'`);
    const recovered=await claim(one.id); assert.equal(recovered?.attempts,2); assert.notEqual(recovered?.lease_id,first?.lease_id);
    assert.equal(await allowed(first!.lease_id),false,"expired worker loses its authority");
    await db.exec(`update technical_description_jobs set attempts=5,lease_until=now()-interval '1 second' where id='${one.id}'`);
    assert.equal(await claim(one.id),null);
    assert.equal((await db.query<{status:string}>("select status from technical_description_jobs where id=$1",[one.id])).rows[0].status,'failed');
    await db.exec("set role authenticated");
    assert.equal((await db.query("select id from technical_description_jobs")).rows.length,0,"other member cannot read owner's jobs");
    await assert.rejects(claim(one.id),/permission denied/);
    await assert.rejects(db.query("select retry_technical_description_job($1)",[one.id]),/denied/);
    await db.exec(`reset role; update test_members set active=true where user_id='${user}'; select set_config('request.jwt.claim.sub','${user}',false); set role authenticated;`);
    assert.equal((await db.query("select id from technical_description_jobs")).rows.length,2);
    await db.query("select retry_technical_description_job($1)",[one.id]);
    assert.equal((await db.query<{status:string}>("select status from technical_description_jobs where id=$1",[one.id])).rows[0].status,'queued');
  } finally {await db.close();}
});

test("new queued imports satisfy the real project-creation RPC and production required fields", async () => {
  const db = new PGlite();
  const org = randomUUID(), user = randomUUID(), member = randomUUID(), upload = randomUUID();
  const migration = (name: string) => readFileSync(new URL(`../../../supabase/migrations/${name}.sql`, import.meta.url), "utf8");
  try {
    await db.exec(`
      create role authenticated; create role anon; create role service_role;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create table organizations(id uuid primary key, name text not null);
      create table organization_members(id uuid primary key, organization_id uuid, user_id uuid, status text);
      create function is_organization_member(uuid) returns boolean language sql stable as $$ select exists(select 1 from public.organization_members where organization_id=$1 and user_id=auth.uid() and status='active') $$;
      create function has_permission(uuid,text) returns boolean language sql stable as $$ select public.is_organization_member($1) $$;
      create table projects(
        id uuid primary key default gen_random_uuid(), organization_id uuid not null references organizations(id),
        name text not null, customer text not null, country text not null, standard text not null, system_type text not null,
        project_number text, description text, customer_name text, project_type text, country_code text, language_code text not null,
        currency_code text, currency text, owner_id uuid, owner_user_id uuid, project_manager_id uuid, created_by uuid, assigned_to uuid,
        status text not null, current_stage text not null, access_level text not null, team_id uuid, supplier text, delivery_country text,
        progress integer not null, deleted_at timestamptz);
      create function can_access_project(uuid) returns boolean language sql stable as $$ select exists(select 1 from public.projects where id=$1 and deleted_at is null and public.is_organization_member(organization_id)) $$;
      create table teams(id uuid, organization_id uuid, status text);
      create table project_settings(organization_id uuid, project_id uuid, country_code text, language_code text not null, currency_code text);
      create table project_modules(organization_id uuid, project_id uuid, module_code text, name text);
      create table project_members(project_id uuid, organization_member_id uuid, role text, project_role text, status text, added_by uuid);
      create function add_owner() returns trigger language plpgsql as $$ begin
        insert into public.project_members(project_id,organization_member_id) select new.id,id from public.organization_members where organization_id=new.organization_id and user_id=new.created_by;
        return new; end $$;
      create trigger projects_add_creator_membership after insert on projects for each row execute function add_owner();
      create function write_audit_log(uuid,text,text,uuid,jsonb,jsonb) returns void language sql as $$ select $$;
      insert into organizations values('${org}','Ahlsell Norge');
      insert into auth.users values('${user}');
      insert into organization_members values('${member}','${org}','${user}','active');
      select set_config('request.jwt.claim.sub','${user}',false);
    `);
    await db.exec(migration("20260806160000_fix_atomic_project_creation"));
    await db.exec(migration("20260927153000_durable_import_jobs"));
    const enqueue = async (project: string | null = null, uploadId = upload) => (await db.query<{job:{id:string;project_id:string;created_project:boolean}}>(
      "select to_jsonb(public.enqueue_technical_description_job($1,$2,$3,'technical.pdf',true,null)) as job", [org, project, uploadId]
    )).rows[0].job;
    await assert.rejects(enqueue(), (error: {code?: string; message?: string}) => error.code === "23502" && /customer/.test(error.message ?? ""),
      "reproduces the production failure with the original queue and real creation RPC");
    assert.equal((await db.query("select id from projects")).rows.length, 0, "failed enqueue rolls back project creation");
    await db.exec(migration("20260927160000_fix_import_project_defaults"));
    const job = await enqueue();
    assert.equal(job.created_project, true);
    assert.equal((await enqueue()).id, job.id, "same upload is idempotent");
    const project = (await db.query<Record<string, unknown>>("select * from projects where id=$1", [job.project_id])).rows[0];
    assert.equal(project.customer, "Ahlsell Norge");
    assert.equal(project.country, "Sweden", "retains the existing synchronous import default");
    assert.equal(project.standard, "Fastställs från det tekniska underlaget");
    assert.equal(project.system_type, "Fastställs från underlaget");
    assert.equal(project.owner_user_id, user);
    assert.equal(project.access_level, "own");
    assert.equal((await db.query<{role:string}>("select project_role as role from project_members where project_id=$1", [job.project_id])).rows[0].role, "owner");
    const existingJob = await enqueue(job.project_id, randomUUID());
    assert.equal(existingJob.created_project, false);
    assert.deepEqual((await db.query("select * from projects where id=$1", [job.project_id])).rows[0], project,
      "import into an existing project preserves all metadata");
    await db.exec("select set_config('request.jwt.claim.sub','',false)");
    await assert.rejects(enqueue(), (error: {code?: string}) => error.code === "42501", "anonymous import stays denied");
  } finally { await db.close(); }
});
