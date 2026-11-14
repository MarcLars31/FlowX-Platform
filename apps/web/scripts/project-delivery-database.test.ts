import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const manager=id(1),alice=id(2),bob=id(3),org=id(4),project=id(5),first=id(6),second=id(7),oldDoc=id(8),newDoc=id(9);
async function fixture(){
 const db=new PGlite();
 await db.exec(`create role authenticated;create role anon;create schema auth;
 create table auth.users(id uuid primary key);insert into auth.users values('${manager}'),('${alice}'),('${bob}');
 create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.user',true),'')::uuid $$;
 create function can_access_project(uuid) returns boolean language sql as $$ select $1='${project}'::uuid and auth.uid() in ('${manager}'::uuid,'${alice}'::uuid,'${bob}'::uuid) $$;
 create function is_organization_admin(uuid) returns boolean language sql as $$ select false $$;
 create function has_permission(uuid,text) returns boolean language sql as $$ select true $$;
 create function write_audit_log(uuid,text,text,uuid,jsonb,jsonb,jsonb) returns void language sql as $$ select $$;
 create table organizations(id uuid primary key);insert into organizations values('${org}');
 create table projects(id uuid primary key,organization_id uuid,owner_user_id uuid,owner_id uuid,created_by uuid,status text default 'active',current_stage text default 'product_matching');
 insert into projects(id,organization_id,owner_user_id,owner_id,created_by) values('${project}','${org}','${manager}','${manager}','${manager}');
 create table organization_members(id uuid primary key default gen_random_uuid(),organization_id uuid,user_id uuid,status text);
 insert into organization_members(organization_id,user_id,status) values('${org}','${manager}','active'),('${org}','${alice}','active'),('${org}','${bob}','active');
 create table project_members(project_id uuid,organization_member_id uuid,organization_id uuid,user_id uuid,role text,project_role text,status text,unique(project_id,user_id));
 create table technical_description_documents(id uuid primary key,project_id uuid,organization_id uuid,status text,file_sha256 text default 'hash');
 insert into technical_description_documents(id,project_id,organization_id,status) values('${oldDoc}','${project}','${org}','extracted');
 create table project_documents(id uuid,project_id uuid,file_sha256 text,processing_status text,deleted_at timestamptz);
 insert into project_documents values('${oldDoc}','${project}','hash','completed',null);
 create table project_requirements(id uuid primary key,project_id uuid,organization_id uuid,status text,category text,value_json jsonb,edit_revision bigint default 0,deleted_at timestamptz,source_technical_description_document_id uuid,source_document_id uuid);
 insert into project_requirements(id,project_id,organization_id,status,category,value_json,source_technical_description_document_id) values
 ('${first}','${project}','${org}','extracted_unreviewed','pipe','{"postNumber":"30.332.7.1"}','${oldDoc}'),
 ('${second}','${project}','${org}','extracted_unreviewed','pipe','{"postNumber":"30.332.8"}','${oldDoc}');
 create table project_product_suggestions(id uuid primary key default gen_random_uuid(),project_id uuid,organization_id uuid,requirement_id uuid,status text,product_snapshot jsonb,updated_at timestamptz default now());
 create table product_post_comments(id uuid,project_id uuid,organization_id uuid,requirement_id uuid);
 grant usage on schema auth to authenticated;grant execute on all functions in schema auth to authenticated;
 grant select,update on projects to authenticated;grant select,insert,update,delete on project_requirements,project_product_suggestions to authenticated;
 `);
 await db.exec(readFileSync(new URL('../../../supabase/migrations/20261004120000_project_delivery_control.sql',import.meta.url),'utf8'));
 await db.exec(readFileSync(new URL('../../../supabase/migrations/20261004220000_remove_product_delivery_gate.sql',import.meta.url),'utf8'));
 await db.exec(readFileSync(new URL('../../../supabase/migrations/20261007120000_post_list_assignments.sql',import.meta.url),'utf8'));
 await db.query("select set_config('test.user',$1,false)",[manager]);
 return db;
}
test('database scopes chapter/group edits, defends legacy writes and races, and retains view access',async()=>{
 const db=await fixture();try{
 const assign=(scope:string,user=alice,type='chapter')=>db.query('select save_work_package($1,$2,null)',[project,JSON.stringify({scope_type:type,scope_value:scope,assigned_to:user})]);
 await assign('pipe',bob,'group');await assign('30.332.7');
 await db.exec('set role authenticated');await db.query("select set_config('test.user',$1,false)",[alice]);
 assert.equal((await db.query<{ok:boolean}>('select can_edit_project_requirement($1) ok',[first])).rows[0].ok,true);
 assert.equal((await db.query<{ok:boolean}>('select can_edit_project_requirement($1) ok',[second])).rows[0].ok,false);
 await db.query("update project_requirements set value_json=value_json||'{\"test\":true}' where id=$1",[first]);
 await assert.rejects(db.query("update project_requirements set category='valve' where id=$1",[second]),/assigned to another/);
 await assert.rejects(db.query("insert into project_product_suggestions(project_id,organization_id,requirement_id,status) values($1,$2,$3,'selected')",[project,org,second]),/assigned to another/);
 await assert.rejects(assign('30.332.8'),/Manager access/);
 await assert.rejects(db.query('update projects set assignments_enforced=false where id=$1',[project]),/Only the project manager/);
 assert.equal((await db.query('select * from project_work_packages')).rows.length,2);
 await db.query("select set_config('test.user',$1,false)",[bob]);
 assert.equal((await db.query<{ok:boolean}>('select can_edit_project_requirement($1) ok',[first])).rows[0].ok,false);
 }finally{await db.close();}
});

test('PDF chapter ownership stays within its document and exact post ownership overrides it without including children',async()=>{
 const db=await fixture();try{
  await db.query(`update project_requirements set value_json=value_json||'{"sourceChapter":{"title":"40.411 Cable routing"}}'`);
  await db.query(`insert into project_requirements(id,project_id,organization_id,status,category,value_json,source_document_id) values($1,$2,$3,'extracted_unreviewed','pipe',$4,$5)`,[id(20),project,org,JSON.stringify({postNumber:'30.332.7.1',sourceChapter:{title:'40.411 Cable routing'}}),newDoc]);
  await db.query(`insert into project_requirements(id,project_id,organization_id,status,category,value_json,source_technical_description_document_id) values($1,$2,$3,'extracted_unreviewed','pipe',$4,$5)`,[id(21),project,org,JSON.stringify({postNumber:'30.332.7.1.1',sourceChapter:{title:'40.411 Cable routing'}}),oldDoc]);
  const save=(type:string,scope:string,person=alice)=>db.query<{saved:{id:string;scope_value:string;revision:number}}>('select save_work_package($1,$2,null) saved',[project,JSON.stringify({scope_type:type,scope_value:scope,assigned_to:person})]);
  await save('group','pipe',bob);
  const chapter=(await save('pdf_chapter',second)).rows[0].saved;
  assert.equal(chapter.scope_value,first,'any chapter row resolves to the same canonical anchor');
  await assert.rejects(save('pdf_chapter',first,bob),/Assignment changed/);
  await save('post',first,bob);
  await db.exec('set role authenticated'); await db.query("select set_config('test.user',$1,false)",[alice]);
  const canEdit=async(rid:string)=>(await db.query<{ok:boolean}>('select can_edit_project_requirement($1) ok',[rid])).rows[0].ok;
  assert.equal(await canEdit(first),false,'exact assignment overrides chapter');
  assert.equal(await canEdit(second),true);
  assert.equal(await canEdit(id(21)),true,'child does not inherit the exact post override');
  assert.equal(await canEdit(id(20)),false,'same chapter and number in another document are not included');
  await assert.rejects(save('post',second,bob),/Manager access/);
  await db.query("select set_config('test.user',$1,false)",[manager]);
  const payload={id:chapter.id,scope_type:'pdf_chapter',scope_value:chapter.scope_value,assigned_to:bob};
  await db.exec('reset role');
  await db.query(`insert into project_requirements(id,project_id,organization_id,status,category,value_json,source_technical_description_document_id) values($1,$2,$3,'extracted_unreviewed','pipe',$4,$5)`,[id(0),project,org,JSON.stringify({sourceChapter:{title:'40.411 Cable routing'}}),oldDoc]);
  await assert.rejects(save('pdf_chapter',id(0)),/Assignment changed/,'new rows cannot create a second assignment for the same chapter');
  await db.query('select save_work_package($1,$2,0)',[project,JSON.stringify(payload)]);
  await assert.rejects(db.query('select save_work_package($1,$2,0)',[project,JSON.stringify(payload)]),/Assignment changed/);
  await assert.rejects(save('post',id(999)),/does not belong/);
 }finally{await db.close();}
});

test('unnumbered posts can be assigned but foreign projects and inactive people are rejected',async()=>{
 const db=await fixture();try{
  await db.query("update project_requirements set value_json='{}' where id=$1",[first]);
  const save=(scope:string,person=alice)=>db.query('select save_work_package($1,$2,null)',[project,JSON.stringify({scope_type:'post',scope_value:scope,assigned_to:person})]);
  await save(first);
  await db.query("select set_config('test.user','',false)");
  await db.query("insert into project_requirements(id,project_id,organization_id,status,value_json) values($1,$2,$3,'extracted_unreviewed','{}')",[id(98),id(99),org]);
  await db.query("select set_config('test.user',$1,false)",[manager]);
  await assert.rejects(save(id(98)),/does not belong/);
  await db.query("update organization_members set status='inactive' where user_id=$1",[bob]);
  await assert.rejects(save(first,bob),/Active organization member/);
 }finally{await db.close();}
});
test('delivery readiness validates components and decisions, and rejects a stale product revision',async()=>{
 const db=await fixture();try{
 await db.query("insert into project_product_suggestions(project_id,organization_id,requirement_id,status,product_snapshot) values($1,$2,$3,'selected',$4)",[project,org,first,JSON.stringify({productNumber:'main',accessories:[{productNumber:'part',quantity:2,quantityBasis:'total',unit:'st'}]})]);
 const review={state:'ready',comment:'',components:[{id:'p',label:'Part',status:'missing',optional:false,note:'',productNumber:''}],deviations:[],alternatives:[],calculations:[]};
 const save=(value:unknown,revision=-1,productRevision=0)=>db.query('select save_post_delivery($1,$2,$3,$4,$5)',[project,first,revision,productRevision,JSON.stringify(value)]);
 await assert.rejects(save(review),/Unresolved delivery component/);
 review.components[0]={...review.components[0],status:'separate',productNumber:'part'};
 await save({...review,state:'draft'});
 await save(review,0);await assert.rejects(save(review,-1),/Delivery review changed/);
 await db.query("update projects set status='completed' where id=$1",[project]);
 await assert.rejects(save(review,0,9),/Product post changed/);
 assert.equal((await db.query('select * from project_post_workflows')).rows.length,1);
 }finally{await db.close();}
});
test('new documents remain pending, activation is scoped and replacement invalidates old product approvals',async()=>{
 const db=await fixture();try{
 await db.query('insert into technical_description_documents(id,project_id,organization_id,status) values($1,$2,$3,$4)',[newDoc,project,org,'extracted']);
 await db.query("insert into project_requirements(id,project_id,organization_id,status,value_json,source_technical_description_document_id) values($1,$2,$3,'extracted_unreviewed','{}',$4)",[id(10),project,org,newDoc]);
 assert.equal((await db.query<{status:string}>('select status from project_requirements where id=$1',[id(10)])).rows[0].status,'superseded');
 await db.query("insert into project_product_suggestions(project_id,organization_id,requirement_id,status) values($1,$2,$3,'selected')",[project,org,first]);
 await db.query("select set_config('test.user',$1,false)",[alice]);
 const activate=()=>db.query('select activate_delivery_document($1,$2,0,$3)',[project,newDoc,JSON.stringify({role:'specification',revision_label:'B',replaces_document_id:oldDoc})]);
 await assert.rejects(activate(),/Manager access/);
 await db.query("select set_config('test.user',$1,false)",[manager]);await activate();
 assert.equal((await db.query<{status:string}>('select status from project_product_suggestions')).rows[0].status,'rejected');
 assert.equal((await db.query<{status:string}>('select status from project_requirements where id=$1',[id(10)])).rows[0].status,'extracted_unreviewed');
 await assert.rejects(activate(),/Document changed/);
 }finally{await db.close();}
});

test('managed projects can finish without a delivery checklist while only managers can complete them',async()=>{
 const db=await fixture();try{
 await db.query('select save_work_package($1,$2,null)',[project,JSON.stringify({scope_type:'chapter',scope_value:'30.332.7',assigned_to:alice})]);
 await db.query("insert into project_product_suggestions(project_id,organization_id,requirement_id,status,product_snapshot) values($1,$2,$3,'selected',$4)",[project,org,first,JSON.stringify({productNumber:'main'})]);
 await db.exec('set role authenticated');
 await db.query("select set_config('test.user',$1,false)",[alice]);
 await assert.rejects(db.query("update projects set status='completed' where id=$1",[project]),/Only the project manager/);
 await assert.rejects(db.query("update projects set current_stage='completed' where id=$1",[project]),/Only the project manager/);
 await db.query("select set_config('test.user',$1,false)",[manager]);
 await db.query("update projects set status='completed',current_stage='completed' where id=$1",[project]);
 await db.query("update projects set status='active',current_stage='product_matching' where id=$1",[project]);
 await db.query('select save_post_delivery($1,$2,-1,0,$3)',[project,first,JSON.stringify({state:'draft',components:[],deviations:[],alternatives:[],calculations:[]})]);
 await db.query("update project_requirements set edit_revision=edit_revision+1 where id=$1",[first]);
 await db.query("update projects set status='completed',current_stage='completed' where id=$1",[project]);
 assert.equal((await db.query<{status:string}>('select status from projects where id=$1',[project])).rows[0].status,'completed');
 assert.equal((await db.query('select * from project_post_workflows')).rows.length,1);
 }finally{await db.close();}
});
