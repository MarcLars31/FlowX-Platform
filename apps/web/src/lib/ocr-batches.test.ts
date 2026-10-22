import assert from "node:assert/strict";
import test from "node:test";
import { ocrBatchWriter, OCR_BATCH_BYTES, OCR_BATCH_PAGES, resumeOcrImport, utf8Bytes } from "./ocr-batches";
import { parseClientOcrPages, type ClientOcrPage } from "./technical-description-ocr-payload";

test("301 OCR pages cross the API in bounded groups, including multibyte text", async () => {
  const written: ClientOcrPage[]=[];
  const writer=ocrBatchWriter(async pages=>{
    const json=JSON.stringify(pages);
    assert.ok(utf8Bytes(json)<=OCR_BATCH_BYTES);
    assert.ok(pages.length<=OCR_BATCH_PAGES);
    written.push(...parseClientOcrPages(json,301,{maxPages:OCR_BATCH_PAGES,maxBytes:OCR_BATCH_BYTES})!);
  });
  for(let pageNumber=1;pageNumber<=301;pageNumber++)await writer.add({pageNumber,text:"\u00f8".repeat(150_000),confidence:0.9});
  await writer.flush();
  assert.equal(written.length,301);
  assert.deepEqual(written.map(page=>page.pageNumber),Array.from({length:301},(_,i)=>i+1));
});
test("an interrupted browser resumes only the remaining pages and retries one failed group", async()=>{
  const saved=new Set<number>(); let calls=0; let interrupted=true;
  const fetcher:typeof fetch=async (_url,init)=>{
    calls++; const pages=JSON.parse(init!.body as string) as ClientOcrPage[];
    if(interrupted && calls===3)return Response.json({error:"network interruption"},{status:503});
    for(const page of pages){assert.ok(!saved.has(page.pageNumber));saved.add(page.pageNumber);}
    return Response.json({status:"awaiting_ocr"});
  };
  const extracted:number[]=[];
  const extract:Parameters<typeof resumeOcrImport>[3]=async(_file,pages,_progress,onPage)=>{
    for(const pageNumber of pages){extracted.push(pageNumber);await onPage!({pageNumber,text:"sprinkler",confidence:0.9});}return [];
  };
  const all=Array.from({length:301},(_,i)=>i+1); const file=new File(["pdf"],"test.pdf");
  await assert.rejects(resumeOcrImport(file,"job",all,extract,fetcher),/interruption/);
  assert.equal(saved.size,20);
  interrupted=false;extracted.length=0;
  await resumeOcrImport(file,"job",all.filter(page=>!saved.has(page)),extract,fetcher);
  assert.equal(saved.size,301);assert.equal(extracted[0],21);
});
test("byte limits use UTF-8 and reject invalid page counts before accepting OCR",()=>{
  const json=JSON.stringify([{pageNumber:1,text:"\u00f8".repeat(100),confidence:1}]);
  assert.throws(()=>parseClientOcrPages(json,1,{maxBytes:json.length}),/stort/);
  assert.throws(()=>parseClientOcrPages(json,Number.NaN),/sidnummer/);
});
