import test from "node:test";
import assert from "node:assert/strict";
import { importJobPersistence } from "./import-job-persistence.server";

test("import writes return only needed state, keep scope checks and cannot copy the original PDF", async () => {
  const savedFetch=globalThis.fetch;
  const savedUrl=process.env.NEXT_PUBLIC_SUPABASE_URL, savedKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL='https://storage.example.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY='test-only-service-key';
  const requests: {url:URL;body:unknown}[]=[];
  globalThis.fetch=(async(input,init)=>{
    requests.push({url:new URL(String(input)),body:JSON.parse(String(init?.body))});
    return Response.json([{id:'saved',upload_status:'uploaded',processing_status:'extracting'}]);
  }) as typeof fetch;
  try {
    const db=importJobPersistence({organization_id:'org',project_id:'project'},Date.now()+60_000);
    await db.insertUserRowReturning('document_pages',{organization_id:'org',project_id:'project',extracted_text:'long source'});
    await db.updateUserRowsReturning('project_documents',{organization_id:'eq.org',project_id:'eq.project',id:'eq.doc'},{processing_status:'completed'});
    assert.equal(requests[0].url.searchParams.get('select'),'id');
    assert.equal(requests[1].url.searchParams.get('select'),'id,upload_status,processing_status');
    assert.equal(requests[1].url.searchParams.get('organization_id'),'eq.org');
    await assert.rejects(db.insertUserRowReturning('document_pages',{organization_id:'other',project_id:'project'}),/IMPORT_ORGANIZATION_SCOPE/);
    await assert.rejects(db.updateUserRowsReturning('project_documents',{organization_id:'eq.org',project_id:'eq.other'},{}),/IMPORT_PROJECT_SCOPE/);
    await assert.rejects(db.uploadUserStorageObject('project-files','org/project/technical-description/file',new Uint8Array(),'application/pdf'),/IMPORT_PERMANENT_STORAGE_DISABLED/);
    assert.equal(requests.length,2);
  } finally {
    globalThis.fetch=savedFetch;
    if(savedUrl===undefined)delete process.env.NEXT_PUBLIC_SUPABASE_URL;else process.env.NEXT_PUBLIC_SUPABASE_URL=savedUrl;
    if(savedKey===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=savedKey;
  }
});
