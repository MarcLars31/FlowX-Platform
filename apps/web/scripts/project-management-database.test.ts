import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const manager=id(1), lead=id(2), worker=id(3), colleague=id(4), other=id(5), org=id(6), project=id(7), department=id(8), secondDepartment=id(9), first=id(10), second=id(11), third=id(12), doc=id(13);
async function fixture() {
  const db = new PGlite();
  await db.exec(`create role authenticated; create role anon; create role service_role; create schema auth;
  create schema storage; create table storage.objects(bucket_id text,name text); alter table storage.objects enable row level security;
  create policy old_storage_read on storage.objects for select to authenticated using(true);
  grant usage on schema storage to authenticated; grant select on storage.objects to authenticated;
  insert into storage.objects values('project-files','${org}/${project}/source.pdf');
  create table auth.users(id uuid primary key,email text); insert into auth.users values ${[manager,lead,worker,colleague,other].map((x,i)=>`('${x}','user${i}@example.test')`).join(',')};
  create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.user',true),'')::uuid $$;
  create function can_access_project(uuid) returns boolean language sql as $$ select $1='${project}'::uuid and auth.uid() in ('${manager}'::uuid,'${lead}'::uuid,'${worker}'::uuid,'${colleague}'::uuid,'${other}'::uuid) $$;
  create function is_organization_admin(uuid) returns boolean language sql as $$ select false $$;
  create function has_permission(uuid,text) returns boolean language sql as $$ select true $$;
  create function write_audit_log(uuid,text,text,uuid,jsonb,jsonb,jsonb) returns void language sql as $$ select $$;
  create table organizations(id uuid primary key); insert into organizations values('${org}');
  create table profiles(id uuid primary key,display_name text,email text); insert into profiles select id,'User',email from auth.users;
  create table projects(id uuid primary key,organization_id uuid,name text,owner_user_id uuid,owner_id uuid,created_by uuid,project_manager_id uuid,deleted_at timestamptz,status text default 'active',current_stage text default 'product_matching');
  insert into projects(id,organization_id,name,owner_user_id,owner_id,created_by) values('${project}','${org}','Test project','${manager}','${manager}','${manager}');
  create table organization_members(id uuid primary key default gen_random_uuid(),organization_id uuid,user_id uuid,status text);
  insert into organization_members(organization_id,user_id,status) select '${org}',id,'active' from auth.users;
  create table teams(id uuid primary key,organization_id uuid,name text,status text); insert into teams values('${department}','${org}','Rør','active'),('${secondDepartment}','${org}','Elektro','active');
  create table team_members(team_id uuid,organization_member_id uuid,team_role text,primary key(team_id,organization_member_id));
  insert into team_members select case when user_id='${other}' then '${secondDepartment}'::uuid else '${department}'::uuid end,id,'member' from organization_members where user_id<>'${manager}';
  create table project_members(project_id uuid,organization_member_id uuid,project_role text,organization_id uuid,user_id uuid,role text,status text,unique(project_id,user_id));
  insert into project_members select '${project}',id,'editor','${org}',user_id,'editor','active' from organization_members;
  create table technical_description_documents(id uuid primary key,project_id uuid,organization_id uuid,status text,file_sha256 text default 'hash');
  insert into technical_description_documents values('${doc}','${project}','${org}','extracted','hash');
  create table project_documents(id uuid,project_id uuid,file_sha256 text,processing_status text,deleted_at timestamptz);
  insert into project_documents values('${doc}','${project}','hash','completed',null);
  create table project_requirements(id uuid primary key,project_id uuid,organization_id uuid,status text,category text,value_text text,value_json jsonb,edit_revision bigint default 0,deleted_at timestamptz,source_technical_description_document_id uuid,source_document_id uuid);
  insert into project_requirements(id,project_id,organization_id,status,category,value_text,value_json,source_technical_description_document_id) values
  ('${first}','${project}','${org}','extracted_unreviewed','pipe','Pipe','{"postNumber":"1.1","sourceChapter":{"title":"Rør"}}','${doc}'),
  ('${second}','${project}','${org}','extracted_unreviewed','pipe','Valve','{"postNumber":"1.2","sourceChapter":{"title":"Rør"}}','${doc}'),
  ('${third}','${project}','${org}','extracted_unreviewed','cable','Cable','{"postNumber":"2.1","sourceChapter":{"title":"Elektro"}}','${doc}');
  create table project_product_suggestions(id uuid primary key default gen_random_uuid(),project_id uuid,organization_id uuid,requirement_id uuid,status text,product_snapshot jsonb,updated_at timestamptz default now());
  create table product_post_comments(id uuid,project_id uuid,organization_id uuid,requirement_id uuid);
  grant usage on schema auth to authenticated; grant execute on all functions in schema auth to authenticated;
  grant select,update on projects to authenticated; grant select,insert,update,delete on project_requirements,project_product_suggestions to authenticated;
  grant select on project_documents,technical_description_documents to authenticated;
  alter table project_requirements enable row level security; create policy existing_read on project_requirements for select to authenticated using(can_access_project(project_id));
  create policy existing_write on project_requirements for update to authenticated using(can_access_project(project_id));
  alter table project_documents enable row level security; create policy existing_read on project_documents for select to authenticated using(can_access_project(project_id));
  alter table technical_description_documents enable row level security; create policy existing_read on technical_description_documents for select to authenticated using(can_access_project(project_id));
  `);
  for (const file of ['20261004120000_project_delivery_control.sql','20261004220000_remove_product_delivery_gate.sql','20261007120000_post_list_assignments.sql','20261025120000_department_project_management.sql']) {
    await db.exec(readFileSync(new URL(`../../../supabase/migrations/${file}`,import.meta.url),'utf8'));
  }
  await as(db,manager);
  return db;
}
async function as(db:PGlite,user:string) { await db.exec('set role authenticated'); await db.query("select set_config('test.user',$1,false)",[user]); }
const settings={deadline:'2026-12-31',departments:[{department_id:department,supervisor_id:lead},{department_id:secondDepartment,supervisor_id:other}]};
const configure=(db:PGlite,value=settings,revision=-1)=>db.query('select save_project_management($1,$2,$3)',[project,JSON.stringify(value),revision]);
const assign=(db:PGlite,changes:unknown[])=>db.query('select assign_project_work($1,$2)',[project,JSON.stringify(changes)]);
const chapter=(scope=first,dept=department,revision=-1,due='2026-12-15')=>({scope_type:'pdf_chapter',scope_value:scope,department_id:dept,revision,due_date:due});
const post=(scope=first,user=worker,revision=-1)=>({scope_type:'post',scope_value:scope,department_id:department,assigned_to:user,revision});
async function setup(db:PGlite) { await configure(db); await assign(db,[chapter(),chapter(third,secondDepartment)]); await as(db,lead); await assign(db,[post()]); }
const task=(db:PGlite,done:boolean,revision=-1)=>db.query('select update_project_task($1,$2,$3,$4)',[project,first,revision,done]);
const message=(db:PGlite,payload:unknown,rid=first)=>db.query('select write_project_message($1,$2,$3)',[project,rid,JSON.stringify(payload)]);

test('department RLS applies to legacy reads, source files and direct edits; manager sees all',async()=>{
  const db=await fixture(); try {
    await setup(db); await as(db,worker);
    assert.deepEqual((await db.query<{id:string}>('select id from project_requirements order by id')).rows.map(r=>r.id),[first,second]);
    assert.equal((await db.query('select * from project_documents')).rows.length,0);
    assert.equal((await db.query('select * from technical_description_documents')).rows.length,0);
    assert.equal((await db.query('select * from storage.objects')).rows.length,0);
    await db.query("update project_requirements set value_text='Updated own post' where id=$1",[first]);
    await assert.rejects(db.query("update project_requirements set value_json=jsonb_set(value_json,'{sourceChapter,title}','\"Elektro\"') where id=$1",[first]),/Only managers/);
    await assert.rejects(db.query("update project_requirements set value_text='Not mine' where id=$1",[second]),/assigned to another/);
    await assert.rejects(assign(db,[post(second)]),/supervisor/);
    await as(db,other); assert.deepEqual((await db.query<{id:string}>('select id from project_requirements')).rows.map(r=>r.id),[third]);
    await assert.rejects(db.query('select read_project_work_thread($1,$2)',[project,first]),/access denied/);
    await as(db,manager); assert.equal((await db.query('select * from project_requirements')).rows.length,3);
    assert.equal((await db.query('select * from project_documents')).rows.length,1);
    assert.equal((await db.query('select * from storage.objects')).rows.length,1);
    await assert.rejects(db.query('select save_work_package($1,$2,null)',[project,JSON.stringify({scope_type:'post',scope_value:first,assigned_to:other})]),/department project management/);
  } finally { await db.close(); }
});

test('snapshots and cross-project overview return only the current department, including concurrent help counts',async()=>{
  const db=await fixture(); try {
    await setup(db); await as(db,worker); await message(db,{kind:'help',body:'Dimensjon?'}); await message(db,{kind:'help',body:'Materiale?'});
    const snapshot=(await db.query<{data:{posts:{id:string;openHelp:number;ownDeadline:null;deadlineRevision:number}[];departments:{id:string}[]}}>('select read_project_management($1) data',[project])).rows[0].data;
    assert.deepEqual(snapshot.posts.map(p=>p.id).sort(),[first,second]);
    assert.equal(snapshot.posts.find(p=>p.id===first)?.openHelp,2);
    assert.equal(snapshot.posts.find(p=>p.id===first)?.deadlineRevision,0);
    assert.deepEqual(snapshot.departments.map(d=>d.id),[department]);
    const overview=(await db.query<{data:{total:number;help:number}[]}>('select project_management_overview($1) data',[org])).rows[0].data;
    assert.equal(overview[0].total,2); assert.equal(overview[0].help,1);
    assert.deepEqual((await db.query<{data:unknown[]}>('select project_management_overview($1) data',[id(999)])).rows[0].data,[]);
    await as(db,manager); await configure(db,{...settings,deadline:'2026-11-01'},0);
    assert.equal((await db.query<{due:string}>('select pm_due_date($1)::text due',[second])).rows[0].due,'2026-12-15');
  } finally { await db.close(); }
});

test('a post assigned without a date stays undated when the chapter gains a deadline',async()=>{
  const db=await fixture(); try {
    await configure(db,{...settings,deadline:''}); await assign(db,[{...chapter(),due_date:null}]);
    await assign(db,[{...chapter(first,department,0),operation:'deadline'}]);
    assert.equal((await db.query<{due:null}>('select pm_due_date($1) due',[first])).rows[0].due,null);
    await as(db,lead); await assert.rejects(db.query('select set_project_work_deadline($1,$2,0,$3)',[project,first,'2026-12-01']),/Manager access/);
  } finally { await db.close(); }
});

test('chapter redistribution preserves explicit post owner and previously assigned dates; bulk failure rolls back',async()=>{
  const db=await fixture(); try {
    await setup(db); await assign(db,[{scope_type:'pdf_chapter',scope_value:first,department_id:department,assigned_to:colleague,revision:0}]);
    const owners=await db.query<{assigned_to:string}>('select assigned_to from project_work_packages where id=work_package_for_requirement($1)',[first]);
    assert.equal(owners.rows[0].assigned_to,worker);
    await assert.rejects(assign(db,[{...post(second),due_date:'2026-12-01'}]),/Only managers/);
    await as(db,manager); await assign(db,[{...chapter(first,department,1,'2026-12-10'),operation:'deadline'}]);
    assert.equal((await db.query<{due:string}>('select pm_due_date($1)::text due',[first])).rows[0].due,'2026-12-15');
    await db.query('select set_project_work_deadline($1,$2,0,$3)',[project,first,'2026-12-30']);
    assert.equal((await db.query<{due:string}>('select pm_due_date($1)::text due',[first])).rows[0].due,'2026-12-30');
    await db.query('select set_project_work_deadline($1,$2,1,null)',[project,first]);
    assert.equal((await db.query<{due:string}>('select pm_due_date($1)::text due',[first])).rows[0].due,'2026-12-15');
    assert.equal((await db.query<{assigned_to:string}>('select assigned_to from project_work_packages where id=work_package_for_requirement($1)',[first])).rows[0].assigned_to,worker);
    await as(db,lead);
    await assert.rejects(assign(db,[post(second),post(third)]),/Department scope denied/);
    assert.equal((await db.query("select * from project_work_packages where scope_type='post' and scope_value=$1",[second])).rows.length,0);
    await assert.rejects(assign(db,[post(first,worker,-1)]),/changed/);
  } finally { await db.close(); }
});

test('required help, replies, resolution, completion and reopening are independent of technical review',async()=>{
  const db=await fixture(); try {
    await setup(db); await as(db,worker);
    await assert.rejects(message(db,{kind:'help',body:'  '}),/Describe/);
    await message(db,{kind:'help',body:'Hvilken dimensjon skal brukes?'});
    await assert.rejects(task(db,true),/Resolve help/);
    await message(db,{kind:'help',body:'Another'});
    const [h,h2]=(await db.query<{id:string;revision:number}>('select id,revision from project_help_requests order by created_at,id')).rows;
    await as(db,colleague); await assert.rejects(message(db,{kind:'resolve',help_id:h.id,revision:0}),/edit denied/);
    await as(db,lead); await message(db,{kind:'reply',help_id:h.id,body:'Bruk DN20.'});
    await message(db,{kind:'resolve',help_id:h.id,revision:0});
    await assert.rejects(message(db,{kind:'resolve',help_id:h.id,revision:0}),/changed/);
    await as(db,worker); await assert.rejects(task(db,true),/Resolve help/);
    await message(db,{kind:'resolve',help_id:h2.id,revision:0}); await task(db,true);
    assert.equal((await db.query('select * from project_post_workflows')).rows.length,0);
    await assert.rejects(message(db,{kind:'help',body:'Need help'}),/Reopen/);
    await task(db,false,0); await assert.rejects(task(db,true,0),/changed/);
    await message(db,{kind:'reply',body:'Et vanlig spørsmål uten blokkering.'}); await task(db,true,1);
  } finally { await db.close(); }
});

test('notifications group a batch, isolate recipients, and worker leases retry safely',async()=>{
  const db=await fixture(); try {
    await setup(db); await as(db,lead); await assign(db,[post(first,worker,0),post(second,worker)]);
    await as(db,worker);
    const notifications=await db.query<{kind:string}>('select kind from project_work_notifications');
    assert.equal(notifications.rows.length,2); assert.ok(notifications.rows.every(n=>n.kind==='assignment'));
    await assert.rejects(db.query('select claim_project_work_emails()'),/permission denied/);
    await message(db,{kind:'help',body:'Hjelp takk'});
    await db.exec('reset role');
    const counts=await db.query<{item_count:number}>('select item_count from project_work_email_outbox where recipient_id=$1 order by item_count',[worker]);
    assert.deepEqual(counts.rows.map(x=>x.item_count),[1,2]);
    await db.exec('set role service_role');
    const claimed=(await db.query<{jobs:{id:string;lease:string}[]}>('select claim_project_work_emails() jobs')).rows[0].jobs;
    assert.ok(claimed.length>0); assert.deepEqual((await db.query<{jobs:unknown[]}>('select claim_project_work_emails() jobs')).rows[0].jobs,[]);
    await db.query('select finish_project_work_email($1,$2,false,$3)',[claimed[0].id,claimed[0].lease,'http_503']);
    await db.exec('reset role');
    const retry=(await db.query<{sent_at:null;attempts:number;lease:null}>('select sent_at,attempts,lease from project_work_email_outbox where id=$1',[claimed[0].id])).rows[0];
    assert.deepEqual(retry,{sent_at:null,attempts:1,lease:null});
  } finally { await db.close(); }
});

test('deactivated department members lose read and write access without trusting client state',async()=>{
  const db=await fixture(); try {
    await setup(db); await db.exec('reset role'); await db.query("update organization_members set status='inactive' where user_id=$1",[worker]);
    await as(db,worker); assert.equal((await db.query('select * from project_requirements')).rows.length,0);
    await assert.rejects(task(db,true),/edit denied/);
    await as(db,lead); await assert.rejects(assign(db,[post(second,worker)]),/Active member/);
  } finally { await db.close(); }
});
