import test from "node:test";
import assert from "node:assert/strict";
import {projectPdfStoragePath,retainProjectPdf} from "./project-pdf-storage";
import * as persistence from "./supabase-user-rest";
import {importJobPersistence} from "./import-job-persistence.server";
import {cleanupProjectSourcePdfs} from "./project-pdf-cleanup.server";
const org="10000000-0000-4000-8000-000000000001",project="20000000-0000-4000-8000-000000000001";
test("retaining an identical original recovers after upload success / metadata failure",async()=>{
 const calls:string[]=[];let upload=0;
 const db={...persistence,uploadUserStorageObject:async()=>{
  if (++upload>1) throw new persistence.UserSupabaseError("duplicate",409,"Duplicate"); calls.push("upload");
 },updateUserRowsReturning:async(_table:string,filters:Record<string,string>,body:Record<string,unknown>)=>{
  assert.equal(filters.project_id,`eq.${project}`);assert.equal(filters.organization_id,`eq.${org}`);
  assert.match(String(body.storage_path),/source-pdfs\/[a-f0-9]{64}\.pdf$/);calls.push("link");
  if(upload===1)throw new Error("Database unavailable");return {id:"doc"};
 }} as unknown as typeof persistence;
 const input={organizationId:org,projectId:project,documentId:"doc"},bytes=new TextEncoder().encode("%PDF-1.4");
 await assert.rejects(retainProjectPdf(db,input,bytes),/Database unavailable/);
 await retainProjectPdf(db,input,bytes);
 assert.deepEqual(calls,["upload","link","link"]);
 assert.throws(()=>projectPdfStoragePath(org,"../other","a".repeat(64)),/Invalid/);
});
test("worker uploads only the current job's exact PDF bytes and refuses other paths",async context=>{
 context.mock.method(globalThis,"fetch",async()=>Response.json({}));
 const oldUrl=process.env.SUPABASE_URL,oldKey=process.env.SUPABASE_SECRET_KEY;
 process.env.SUPABASE_URL="https://storage.example";process.env.SUPABASE_SECRET_KEY="test";
 try {
  const db=importJobPersistence({organization_id:org,project_id:project},Date.now()+10000),bytes=new TextEncoder().encode("%PDF-1.4");
  await assert.rejects(db.uploadUserStorageObject("project-files",`${org}/${project}/source-pdfs/wrong.pdf`,bytes,"application/pdf"),/IMPORT_STORAGE_SCOPE/);
  await retainProjectPdf({...db,updateUserRowsReturning:async()=>({id:"doc"}) as never},{organizationId:org,projectId:project,documentId:"doc"},bytes);
 }finally{if(oldUrl===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=oldUrl;if(oldKey===undefined)delete process.env.SUPABASE_SECRET_KEY;else process.env.SUPABASE_SECRET_KEY=oldKey;}
});
test("cleanup confirms deletion only after Storage success and never deletes another project's path",async context=>{
 const oldUrl=process.env.SUPABASE_URL,oldKey=process.env.SUPABASE_SECRET_KEY;
 process.env.SUPABASE_URL="https://storage.example";process.env.SUPABASE_SECRET_KEY="test";
 const finished:boolean[]=[];let storageCalls=0;
 context.mock.method(globalThis,"fetch",async(input:unknown,init?:RequestInit)=>{
  const url=String(input);
  if(url.includes("claim_project_pdf_cleanup"))return Response.json([
   {id:"first",lease_id:"lease",organization_id:org,project_id:project,storage_bucket:"project-files",storage_path:`${org}/${project}/a.pdf`},
   {id:"second",lease_id:"lease2",organization_id:org,project_id:project,storage_bucket:"project-files",storage_path:`${org}/other/b.pdf`}]);
  if(url.includes("finish_project_pdf_cleanup")){finished.push(JSON.parse(String(init?.body)).successful);return Response.json(null);}
  storageCalls++;return new Response("unavailable",{status:503});
 });
 try{await cleanupProjectSourcePdfs(project);assert.equal(storageCalls,1);assert.deepEqual(finished,[false,false]);}
 finally{if(oldUrl===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=oldUrl;if(oldKey===undefined)delete process.env.SUPABASE_SECRET_KEY;else process.env.SUPABASE_SECRET_KEY=oldKey;}
});
