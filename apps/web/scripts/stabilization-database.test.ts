import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {stabilizationDatabase,testOrganization} from "./stabilization-test-database";

test("full schema: source versions, durable jobs and import lifecycle",async t=>{
 const db=await stabilizationDatabase();
 try {
  await t.test("new content at the same URL retains the old source and queues the new version",async()=>{
   const insert=async(hash:string)=>(await db.query<{id:string}>("insert into documents(title,canonical_url,pdf_sha256,processing_requested) values('Datasheet','https://supplier.example/current.pdf',$1,true) returning id",[hash.repeat(64)])).rows[0].id;
   const first=await insert('a'),second=await insert('b');
   const versions=(await db.query<{id:string;is_current_version:boolean;supersedes_document_id:string}>("select id,is_current_version,supersedes_document_id from documents where id in ($1,$2)",[first,second])).rows;
   assert.equal(versions.find(v=>v.id===first)?.is_current_version,false);
   assert.equal(versions.find(v=>v.id===second)?.supersedes_document_id,first);
   assert.equal((await db.query("select * from product_document_jobs where document_id in ($1,$2)",[first,second])).rows.length,2);
   await assert.rejects(insert('b'),/unique|duplicate/i);
   assert.equal((await db.query<{id:string}>("select id from documents where canonical_url='https://supplier.example/current.pdf' and is_current_version")).rows[0].id,second);
  });
  await t.test("abandoned product attempt can be retried without modifying completed history",async()=>{
   const id=(await db.query<{id:string}>("select id from documents where is_current_version and canonical_url='https://supplier.example/current.pdf'")).rows[0].id;
   await db.query("select begin_product_document_processing($1,'initial','initial','v1',null)",[id]);
   await assert.rejects(db.query("select begin_product_document_processing($1,'manual_retry','early','v1',null)",[id]),/active processing/);
   await db.query("update product_document_processing_attempts set started_at=now()-interval '100 days' where document_id=$1",[id]);
   await db.query("select begin_product_document_processing($1,'manual_retry','recovery','v2',null)",[id]);
   const attempts=(await db.query<{status:string}>("select status from product_document_processing_attempts where document_id=$1 order by attempt_number",[id])).rows;
   assert.deepEqual(attempts.map(a=>a.status),['failed','processing']);
  });
  const {org,user,project}=await testOrganization(db);
  const enqueue=async()=> {
   const upload=randomUUID();
   await db.query("select register_temporary_pdf_upload($1,$2,$3)",[org,user,upload]);
   return (await db.query<{id:string}>("select (enqueue_technical_description_job($1,$2,$3,'scan.pdf',false,null)).id",[org,project,upload])).rows[0].id;
  };
  await t.test("abandoned OCR frees capacity and owner can cancel pending work",async()=>{
   for(let i=0;i<3;i++)await enqueue();
   await db.query("update technical_description_jobs set status='awaiting_ocr',updated_at=now()-interval '100 days' where project_id=$1",[project]);
   const next=await enqueue();
   assert.equal((await db.query("select id from technical_description_jobs where project_id=$1 and status='cancelled'",[project])).rows.length,3);
   await db.query("select cancel_technical_description_job($1)",[next]);
   assert.equal((await db.query<{status:string}>("select status from technical_description_jobs where id=$1",[next])).rows[0].status,'cancelled');
  });
  await t.test("two organizations can parse but only one persists; expired leases cannot write",async()=>{
   const first=await enqueue(),sameOrganization=await enqueue();
   const other=await testOrganization(db);
   const otherUpload=randomUUID();
   await db.query("select register_temporary_pdf_upload($1,$2,$3)",[other.org,other.user,otherUpload]);
   const second=(await db.query<{id:string}>("select (enqueue_technical_description_job($1,$2,$3,'other.pdf',false,null)).id",[other.org,other.project,otherUpload])).rows[0].id;
   const claim=async(id:string)=>(await db.query<{job:{id:string;lease_id:string}|null}>("select to_jsonb(claim_technical_description_job($1)) job",[id])).rows[0].job;
   const a=await claim(first);assert.equal(a?.id,first);
   assert.equal(await claim(sameOrganization),null);
   const b=await claim(second);assert.equal(b?.id,second);
   const enter=async(id:string,lease:string)=>(await db.query<{ok:boolean}>("select enter_pdf_import_write_phase($1,$2) ok",[id,lease])).rows[0].ok;
   assert.equal(await enter(first,a!.lease_id),true);
   assert.equal(await enter(second,b!.lease_id),false);
   await db.query("update technical_description_jobs set lease_until=now()-interval '1 second' where id=$1",[first]);
   assert.equal(await enter(first,a!.lease_id),false);
   assert.equal(await enter(second,b!.lease_id),true);
   const recovered=await claim(first);assert.notEqual(recovered?.lease_id,a!.lease_id);
   assert.equal(await enter(first,a!.lease_id),false);
   await db.query("update technical_description_jobs set status='cancelled',lease_until=null where id=any($1::uuid[])",[[first,sameOrganization,second]]);
   await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);
  });
  await t.test("product job leases recover and replaced documents cannot be requeued",async()=>{
   const doc=(await db.query<{id:string}>("select id from documents where canonical_url='https://supplier.example/current.pdf' and is_current_version")).rows[0].id;
   const old=(await db.query<{id:string}>("select id from documents where canonical_url='https://supplier.example/current.pdf' and not is_current_version")).rows[0].id;
   await assert.rejects(db.query("select enqueue_product_document_job($1)",[old]),/superseded/);
   const first=(await db.query<{job:{document_id:string;lease_id:string}}>("select to_jsonb(claim_product_document_job($1)) job",[doc])).rows[0].job;
   assert.equal(first.document_id,doc);
   assert.equal((await db.query<{job:unknown}>("select to_jsonb(claim_product_document_job($1)) job",[doc])).rows[0].job,null);
   await db.query("update product_document_jobs set lease_until=now()-interval '1 second' where document_id=$1",[doc]);
   const retry=(await db.query<{job:{lease_id:string}}>("select to_jsonb(claim_product_document_job($1)) job",[doc])).rows[0].job;
   assert.notEqual(retry.lease_id,first.lease_id);
   assert.equal((await db.query("update product_document_jobs set status='completed' where document_id=$1 and lease_id=$2 returning document_id",[doc,first.lease_id])).rows.length,0);
   await db.query("update product_document_jobs set status='completed',lease_until=null where document_id=$1",[doc]);
  });
  await t.test("atomic project settings preserve omitted preferences",async()=>{
   await db.exec('set role authenticated');
   await db.query("select set_project_supplier_preferences($1,'Old manufacturer','Keep distributor')",[project]);
   await db.query("select update_project_settings_atomic($1,$2,$3)",[project,JSON.stringify({supplier:'New manufacturer'}),JSON.stringify({manufacturer:'New manufacturer'})]);
   assert.equal((await db.query<{supplier_name:string}>("select supplier_name from project_supplier_options where project_id=$1 and supplier_kind='distributor' and selection_role='preferred'",[project])).rows[0].supplier_name,'Keep distributor');
   await assert.rejects(db.query("select update_organization_settings_atomic($1,$2)",[org,JSON.stringify({name:'Must not persist',retention_days:100000})]),/Invalid retention/);
   assert.equal((await db.query<{name:string}>("select name from organizations where id=$1",[org])).rows[0].name,'Regression organization');
   await db.exec('reset role');
  });
  await t.test("fresh permission snapshots are scoped and immediately reflect revocation",async()=>{
   await db.exec('set role authenticated');
   const context=(await db.query<{context:{organization:{id:string};permissions:string[]}}>("select current_organization_context($1) context",[randomUUID()])).rows[0].context;
   assert.equal(context.organization.id,org);assert.ok(context.permissions.includes('project.update'));
   await db.exec('reset role');
   const administrator=randomUUID();
   await db.query("insert into auth.users(id,email) values($1,$2)",[administrator,`${administrator}@example.test`]);
   await db.query("insert into organization_members(organization_id,user_id,role_id,status) select $1,$2,id,'active' from roles where slug='organization_owner' and organization_id is null limit 1",[org,administrator]);
   await db.query("select set_config('request.jwt.claim.sub',$1,false)",[administrator]);
   await db.query("update organization_members set status='disabled' where organization_id=$1 and user_id=$2",[org,user]);
   await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);
   await db.exec('set role authenticated');
   assert.equal((await db.query<{context:unknown}>("select current_organization_context($1) context",[org])).rows[0].context,null);
   await db.exec('reset role');
   await db.query("select set_config('request.jwt.claim.sub',$1,false)",[administrator]);
   await db.query("update organization_members set status='active' where organization_id=$1 and user_id=$2",[org,user]);
   await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);
  });
  await t.test("reviews reject a stale revision and forbidden cross-project edits",async()=>{
   const row=(await db.query<{id:string;edit_revision:number}>("insert into project_requirements(organization_id,project_id,category,requirement_key,value_text,value_json) values($1,$2,'pipe','post','Old text','{}') returning id,edit_revision",[org,project])).rows[0];
   await db.exec('set role authenticated');
   await db.query("select review_project_requirement($1,$2,$3,$4)",[project,row.id,row.edit_revision,JSON.stringify({value_text:'Reviewed text'})]);
   await assert.rejects(db.query("select review_project_requirement($1,$2,$3,$4)",[project,row.id,row.edit_revision,JSON.stringify({value_text:'Stale text'})]),(error:unknown)=>(error as {code:string}).code==='40001');
   await assert.rejects(db.query("select review_project_requirement($1,$2,$3,$4)",[randomUUID(),row.id,row.edit_revision+1,'{}']),(error:unknown)=>(error as {code:string}).code==='42501');
   assert.equal((await db.query<{value_text:string}>("select value_text from project_requirements where id=$1",[row.id])).rows[0].value_text,'Reviewed text');
   await db.exec('reset role');
  });
  await t.test("retention is enforced in SQL before deletion",async()=>{
   await db.query("update projects set deleted_at=now(),deleted_by=$2 where id=$1",[project,user]);
   await db.exec('set role authenticated');
   await db.query("select update_organization_settings_atomic($1,$2)",[org,JSON.stringify({retention_days:30})]);
   await assert.rejects(db.query("select permanently_delete_project($1,'Regression project')",[project]),(error:unknown)=>(error as {code:string}).code==='55000');
   await db.query("select update_organization_settings_atomic($1,$2)",[org,JSON.stringify({retention_days:0})]);
   await db.exec('reset role');
   await db.query("update projects set deleted_at=null,deleted_by=null where id=$1",[project]);
  });
  await t.test("temporary cleanup retains active inputs, retries deletion and excludes another owner's job",async()=>{
   const upload=randomUUID();
   const path=(await db.query<{path:string}>("select register_temporary_pdf_upload($1,$2,$3) path",[org,user,upload])).rows[0].path;
   const job=(await db.query<{id:string}>("select (enqueue_technical_description_job($1,$2,$3,'test.pdf',false,null)).id",[org,project,upload])).rows[0].id;
   await db.query("update temporary_pdf_uploads set expires_at=now()-interval '2 days' where storage_path=$1",[path]);
   assert.equal((await db.query<{storage_path:string}>("select * from claim_temporary_pdf_cleanup()")).rows.some(row=>row.storage_path===path),false);
   await db.query("select set_config('request.jwt.claim.sub',$1,false)",[randomUUID()]);
   await assert.rejects(db.query("select cancel_technical_description_job($1)",[job]),(error:unknown)=>(error as {code:string}).code==='42501');
   await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);
   await db.query("select cancel_technical_description_job($1)",[job]);
   const claim=(await db.query<{storage_path:string;lease_id:string}>("select * from claim_temporary_pdf_cleanup()")).rows.find(row=>row.storage_path===path)!;
   assert.equal(claim.storage_path,path);
   assert.equal((await db.query<{storage_path:string}>("select * from claim_temporary_pdf_cleanup()")).rows.some(row=>row.storage_path===path),false);
   await db.query("update temporary_pdf_uploads set lease_until=now()-interval '1 second' where storage_path=$1",[path]);
   const retry=(await db.query<{storage_path:string;lease_id:string}>("select * from claim_temporary_pdf_cleanup()")).rows.find(row=>row.storage_path===path)!;
   await db.query("select finish_temporary_pdf_cleanup_batch($1)",[JSON.stringify([{storage_path:path,lease_id:claim.lease_id}])]);
   assert.equal((await db.query("select storage_path from temporary_pdf_uploads where storage_path=$1",[path])).rows.length,1);
   await db.query("select finish_temporary_pdf_cleanup_batch($1)",[JSON.stringify([{storage_path:path,lease_id:retry.lease_id}])]);
  });
  await t.test("cleaned fresh uploads retain a tombstone and receive a final sweep after expiry",async()=>{
   const upload=randomUUID();
   const path=(await db.query<{path:string}>("select register_temporary_pdf_upload($1,$2,$3) path",[org,user,upload])).rows[0].path;
   await db.query("select request_temporary_pdf_cleanup($1)",[path]);
   const entry=(await db.query<{storage_path:string;lease_id:string}>("select * from claim_temporary_pdf_cleanup()")).rows.find(row=>row.storage_path===path)!;
   await db.query("select finish_temporary_pdf_cleanup_batch($1)",[JSON.stringify([entry])]);
   await assert.rejects(db.query("select enqueue_technical_description_job($1,$2,$3,'late.pdf',false,null)",[org,project,upload]),/Upload expired/);
   await db.query("update temporary_pdf_uploads set expires_at=now()-interval '1 second',lease_until=now()-interval '1 second' where storage_path=$1",[path]);
   const final=(await db.query<{storage_path:string;lease_id:string}>("select * from claim_temporary_pdf_cleanup()")).rows.find(row=>row.storage_path===path)!;
   await db.query("select finish_temporary_pdf_cleanup_batch($1)",[JSON.stringify([final])]);
   assert.equal((await db.query("select * from temporary_pdf_uploads where storage_path=$1",[path])).rows.length,0);
   await assert.rejects(db.query("select enqueue_technical_description_job($1,$2,$3,'late.pdf',false,null)",[org,project,upload]),/Upload expired/);
  });
  await t.test("login limits follow the account across distinct clients and are private",async()=>{
   for(let i=0;i<8;i++)assert.equal((await db.query<{allowed:boolean}>("select consume_login_rate_limit($1,$2) allowed",[String(i).padStart(64,'a'),'b'.repeat(64)])).rows[0].allowed,true);
   assert.equal((await db.query<{allowed:boolean}>("select consume_login_rate_limit($1,$2) allowed",['c'.repeat(64),'b'.repeat(64)])).rows[0].allowed,false);
   await db.exec('set role authenticated');
   await assert.rejects(db.query('select * from login_rate_limits'),/permission denied/);
   await db.exec('reset role');
  });
  await t.test("permanent deletion removes import FKs and preserves checkpoint cleanup paths",async()=>{
   const job=await enqueue(),checkpoint=randomUUID();
   const path=`${org}/${project}/${job}/text/test.json`;
   await db.query("insert into technical_description_checkpoints(id,job_id,kind,source_sha256,cache_version,payload_sha256,storage_path,page_numbers,ready) values($1,$2,'text',$3,'test',$3,$4,array[1],true)",[checkpoint,job,'a'.repeat(64),path]);
   await db.query("update projects set deleted_at=now(),deleted_by=$2 where id=$1",[project,user]);
   // Even the owner cannot directly delete a post from the trash; only the checked parent operation can cascade.
   await assert.rejects(db.query("delete from project_requirements where project_id=$1",[project]),/assigned to another person/);
   await db.exec('set role authenticated');
   await db.query("select permanently_delete_project($1,'Regression project')",[project]);
   await db.exec('reset role');
   assert.equal((await db.query("select * from technical_description_jobs where project_id=$1",[project])).rows.length,0);
   assert.equal((await db.query("select * from project_pdf_cleanup where storage_path=$1",[path])).rows.length,1);
  });
  await t.test("customer sessions cannot claim product jobs or cleanup other files",async()=>{
   await db.exec('set role authenticated');
   await assert.rejects(db.query('select claim_product_document_job()'),/permission denied/);
   await assert.rejects(db.query('select claim_temporary_pdf_cleanup()'),/permission denied/);
   await db.exec('reset role');
  });
 }finally{await db.close();}
});
