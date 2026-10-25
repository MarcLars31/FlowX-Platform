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
  create table document_pages(id uuid,project_id uuid,text text);alter table document_pages enable row level security;
  create policy old_pages_read on document_pages for select to authenticated using(true);grant select on document_pages to authenticated;
  insert into document_pages values('${doc}','${project}','Private sibling PDF text');
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
  for (const file of ['20261004120000_project_delivery_control.sql','20261004220000_remove_product_delivery_gate.sql','20261007120000_post_list_assignments.sql','20261025120000_department_project_management.sql','20261025160000_source_post_hierarchy.sql']) {
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


const main=id(20), nested=id(21), nestedProduct=id(22);
async function hierarchy(db:PGlite) {
  await db.exec('reset role');
  await db.query(`insert into project_requirements(id,project_id,organization_id,status,category,value_text,value_json,source_technical_description_document_id)
    values($1,$2,$3,'extracted_unreviewed','pipe','Rør hovedpost',$4,$5),($6,$2,$3,'extracted_unreviewed','pipe','Nested main',$7,$5),($8,$2,$3,'extracted_unreviewed','pipe','Nested product',$9,$5)`,
    [main,project,org,JSON.stringify({postNumber:'1',sourceOrder:0,sourceChapter:{title:'31 Rør'}}),doc,nested,JSON.stringify({postNumber:'1.3',parentRequirementId:main,sourceOrder:3,sourceChapter:{title:'31 Rør'}}),nestedProduct,JSON.stringify({postNumber:'1.3.1',parentRequirementId:nested,sourceOrder:4,unit:'m',quantity:2,sourceChapter:{title:'31 Rør'}})]);
  await db.query(`update project_requirements set value_json=value_json || jsonb_build_object('parentRequirementId',$1::text,'sourceOrder',1,'unit','m','quantity',90,'sourceChapter',jsonb_build_object('title','31 Rør')) where id in ($2,$3)`,[main,first,second]);
  await as(db,manager);await configure(db);
}
const mainAssignment=(scope=main,dept=department,revision=-1)=>({scope_type:'main_post',scope_value:scope,department_id:dept,revision});
test('chapter, nearest main, product override, explicit unassigned and return to inheritance are atomic',async()=>{
 const db=await fixture();try {
  await hierarchy(db);await assign(db,[chapter(),mainAssignment(),mainAssignment(nested,secondDepartment)]);
  await as(db,lead);await assign(db,[post(first)]);
  await as(db,manager);await assign(db,[chapter(first,secondDepartment,0)]);
  const owner=async(rid:string)=>(await db.query<{department_id:string;assigned_to:string;assignment_mode:string}>('select department_id,assigned_to,assignment_mode from project_work_packages where id=work_package_for_requirement($1)',[rid])).rows[0];
  assert.equal((await owner(first)).assigned_to,worker);assert.equal((await owner(second)).department_id,department);assert.equal((await owner(nestedProduct)).department_id,secondDepartment);
  await assign(db,[{scope_type:'post',scope_value:first,revision:0,assignment_mode:'unassigned'}]);
  assert.equal((await owner(first)).assignment_mode,'unassigned');
  await as(db,worker);assert.equal((await db.query('select * from project_requirements where id=$1',[first])).rows.length,0);
  await as(db,manager);await assign(db,[{scope_type:'post',scope_value:first,revision:1,assignment_mode:'inherit'}]);
  assert.equal((await owner(first)).department_id,department);
  await assert.rejects(assign(db,[{scope_type:'post',scope_value:first,revision:0,assignment_mode:'unassigned'}]),/changed/);
  await assign(db,[mainAssignment(main,secondDepartment,0)]);
  assert.equal((await owner(first)).department_id,secondDepartment);
 }finally{await db.close();}
});
test('department snapshot includes only permitted products plus minimal main labels and stable chapter anchors',async()=>{
 const db=await fixture();try {
  await hierarchy(db);await assign(db,[chapter(),mainAssignment(nested,secondDepartment)]);
  await as(db,worker);
  const data=(await db.query<{value:{posts:{id:string;mainPost:{id:string;title:string}}[];assignments:{chapter_key?:string}[]}}>('select read_project_management($1) value',[project])).rows[0].value;
  assert.ok(data.posts.some(p=>p.id===first&&p.mainPost.id===main));assert.ok(!data.posts.some(p=>p.id===nestedProduct));
  assert.ok(data.assignments.some(p=>p.chapter_key));
  assert.equal((await db.query('select * from document_pages')).rows.length,0);
  const context=(await db.query<{value:{id:string;value_json:Record<string,unknown>}[]}>('select read_post_hierarchy_context($1) value',[project])).rows[0].value;
  assert.ok(context.some(row=>row.id===main));assert.ok(!context.some(row=>row.id===nestedProduct));
  assert.ok(context.every(row=>!('quantity' in row.value_json) && !('sourceText' in row.value_json)));
  await assert.rejects(db.query('select post_ancestor_ids($1)',[nestedProduct]),/permission denied/);
 }finally{await db.close();}
});
test('missing explicit parent, duplicate number, cross-document parent and cycles cannot form arbitrary groups',async()=>{
 const db=await fixture();try {
  await hierarchy(db);await db.exec('reset role');
  await db.query("update project_requirements set value_json=value_json || $2::jsonb where id=$1",[first,JSON.stringify({parentRequirementId:id(999),parentPostNumber:'1'})]);
  assert.equal((await db.query<{value:string|null}>('select post_main_id($1) value',[first])).rows[0].value,null);
  await db.query("update project_requirements set value_json=(value_json-'parentRequirementId') || $2::jsonb where id=$1",[first,JSON.stringify({parentPostNumber:'1'})]);
  const duplicate=id(23);
  await db.query("insert into project_requirements select $1,project_id,organization_id,status,category,value_text,value_json,edit_revision,deleted_at,source_technical_description_document_id,source_document_id from project_requirements where id=$2",[duplicate,main]);
  assert.equal((await db.query<{value:string|null}>('select post_main_id($1) value',[first])).rows[0].value,null);
  await db.query("update project_requirements set status='superseded' where id=$1",[duplicate]);
  assert.equal((await db.query<{value:string|null}>('select post_main_id($1) value',[first])).rows[0].value,main);
  await db.query("update project_requirements set source_technical_description_document_id=$2 where id=$1",[first,id(99)]);
  assert.equal((await db.query<{value:string|null}>('select post_main_id($1) value',[first])).rows[0].value,null);
  await db.query("update project_requirements set source_technical_description_document_id=$2 where id=$1",[first,doc]);
  await db.query("update project_requirements set value_json=value_json || $2::jsonb where id=$1",[main,JSON.stringify({parentRequirementId:first})]);
  await db.query("update project_requirements set value_json=value_json || $2::jsonb where id=$1",[first,JSON.stringify({parentRequirementId:main})]);
  assert.equal((await db.query<{value:string|null}>('select post_main_id($1) value',[first])).rows[0].value,null);
  await as(db,manager);await assert.rejects(assign(db,[mainAssignment(first)]),/Verified main/);
 }finally{await db.close();}
});
test('a supervisor cannot acquire another department through a main-post assignment or reset',async()=>{
 const db=await fixture();try {
  await hierarchy(db);await assign(db,[chapter(),mainAssignment(nested,secondDepartment)]);await as(db,lead);
  await assert.rejects(assign(db,[{...mainAssignment(),assigned_to:worker}]),/Department scope/);
  await assert.rejects(assign(db,[{...mainAssignment(nested,secondDepartment,0),assignment_mode:'inherit'}]),/Manager access/);
 }finally{await db.close();}
});
