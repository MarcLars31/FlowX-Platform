import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {PGlite} from "@electric-sql/pglite";

test("source PDF cleanup is transactional, isolated, leased and retryable; attachments and post data survive", async () => {
 const db=new PGlite();
 const org="10000000-0000-4000-8000-000000000001",p="20000000-0000-4000-8000-000000000001",other="20000000-0000-4000-8000-000000000002";
 const d="30000000-0000-4000-8000-000000000001",attached="30000000-0000-4000-8000-000000000002",d2="30000000-0000-4000-8000-000000000003";
 try {
  await db.exec(`create role anon;create role authenticated;create role service_role;
   create table projects(id uuid primary key,organization_id uuid,current_stage text,status text,deleted_at timestamptz);
   create table project_documents(id uuid primary key,organization_id uuid,project_id uuid references projects(id) on delete cascade,document_type text,storage_bucket text,storage_path text);
   create table project_requirements(id int,project_id uuid,description text);
   insert into projects values('${p}','${org}','product_matching','analysis',null),('${other}','${org}','product_matching','analysis',null);
   insert into project_requirements values(1,'${p}','Saved requirement');`);
  await db.exec(readFileSync(new URL('../../../supabase/migrations/20261011140000_project_pdf_lifecycle.sql',import.meta.url),'utf8'));
  await db.exec(`insert into project_documents values('${d}','${org}','${p}','technical_description','project-files','${org}/${p}/source-pdfs/source.pdf'),
   ('${attached}','${org}','${p}','attachment','project-files','${org}/${p}/attachment.pdf'),
   ('${d2}','${org}','${other}','technical_description','project-files','${org}/${other}/source.pdf');`);
  const count=async()=>Number((await db.query<{n:number}>('select count(*) n from project_pdf_cleanup')).rows[0].n);
  assert.equal(await count(),0,"active originals stay available");
  await db.exec(`begin;update projects set current_stage='completed' where id='${p}';rollback;`);
  assert.equal(await count(),0,"failed completion cannot schedule deletion");
  await db.exec(`update projects set current_stage='completed' where id='${p}'`);
  assert.equal(await count(),1,"only this project's source original is queued");
  await db.exec(`update projects set status='proposal_ready' where id='${p}'`);
  assert.equal(await count(),1,"repeated completion is idempotent");
  await db.exec('set role authenticated');
  await assert.rejects(db.query('select * from project_pdf_cleanup'),/permission denied/);
  await assert.rejects(db.query('select * from claim_project_pdf_cleanup(null)'),/permission denied/);
  await db.exec('reset role');
  const [job]=(await db.query<{id:string;lease_id:string}>(`select * from claim_project_pdf_cleanup('${p}')`)).rows;
  assert.ok(job.lease_id);
  assert.equal((await db.query('select * from claim_project_pdf_cleanup(null)')).rows.length,0,"concurrent workers cannot own one job");
  await db.query(`select finish_project_pdf_cleanup('${job.id}','00000000-0000-4000-8000-000000000000',true)`);
  assert.equal(await count(),1,"old leases cannot change state");
  await db.query(`select finish_project_pdf_cleanup('${job.id}','${job.lease_id}',false)`);
  assert.equal((await db.query('select * from claim_project_pdf_cleanup(null)')).rows.length,0,"failed deletions back off");
  await db.exec("update project_pdf_cleanup set available_at=now()-interval '1 minute'");
  const [retry]=(await db.query<{id:string;lease_id:string}>('select * from claim_project_pdf_cleanup(null)')).rows;
  await db.query(`select finish_project_pdf_cleanup('${retry.id}','${retry.lease_id}',true)`);
  assert.equal(await count(),0);
  assert.equal((await db.query<{storage_path:string|null}>(`select storage_path from project_documents where id='${d}'`)).rows[0].storage_path,null);
  assert.ok((await db.query<{storage_path:string}>(`select storage_path from project_documents where id='${attached}'`)).rows[0].storage_path);
  assert.equal((await db.query('select * from project_requirements')).rows.length,1);
  await db.exec(`update project_documents set storage_bucket='project-files',storage_path='${org}/${p}/source-pdfs/late.pdf' where id='${d}'`);
  assert.equal(await count(),1,"late import on closed project is also cleaned");
  await db.exec(`delete from projects where id='${other}'`);
  assert.equal((await db.query(`select * from projects where id='${other}'`)).rows.length,0,"before-delete trigger must not cancel deletion");
  assert.equal(await count(),2,"cleanup survives cascaded metadata deletion");
  assert.equal((await db.query(`select * from project_documents where id='${d2}'`)).rows.length,0);
 } finally {await db.close();}
});
