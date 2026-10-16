import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { checkpointPrefix, decodeCheckpoint, textCheckpointWriter, payloadHash, type Checkpoint } from "./import-checkpoint.server";
import { extractTechnicalDescriptionPages } from "../modules/technical-description-extractor/pdf";
import type { TechnicalDescriptionPage } from "../modules/technical-description-extractor/types";

test("cached pages are bound to their job, bytes and page numbers",()=>{
 const job={id:randomUUID(),project_id:randomUUID(),organization_id:randomUUID()};
 const bytes=Buffer.from(JSON.stringify([{pageNumber:1,text:"source"}]));
 const row={job_id:job.id,storage_path:checkpointPrefix(job)+"text/test.json",payload_sha256:payloadHash(bytes),page_numbers:[1]} as Checkpoint;
 assert.equal(decodeCheckpoint<{pageNumber:number;text:string}>(job,row,bytes)[0].text,"source");
 assert.throws(()=>decodeCheckpoint({...job,id:randomUUID()},row,bytes),/INTEGRITY/);
 assert.throws(()=>decodeCheckpoint(job,row,Buffer.from("tampered")),/INTEGRITY/);
 assert.throws(()=>decodeCheckpoint(job,{...row,page_numbers:[2]},bytes),/PAGE_MISMATCH/);
});
test("a real interrupted digital PDF resumes unread pages and keeps identical extraction",async()=>{
 const pdf=await PDFDocument.create();const font=await pdf.embedFont(StandardFonts.Helvetica);
 for(let i=1;i<=4;i++)pdf.addPage().drawText(`33.500.${i} SPRINKLER Antall stk ${i} Materiale messing. This is a readable digital source page with requirements.`,{x:20,y:600,size:9,font});
 const bytes=await pdf.save();const cached:TechnicalDescriptionPage[]=[];
 await assert.rejects(extractTechnicalDescriptionPages(bytes,{onPage:async page=>{cached.push(page);if(page.pageNumber===2)throw new Error("interruption");}}),/interruption/);
 const newlyRead:number[]=[];
 const resumed=await extractTechnicalDescriptionPages(bytes,{cachedPages:cached,onPage:async page=>{newlyRead.push(page.pageNumber);}});
 assert.deepEqual(newlyRead,[3,4]);
 assert.deepEqual(resumed,await extractTechnicalDescriptionPages(bytes));
});

test("an unusually large digital page bypasses the cache limit without aborting extraction",async()=>{
 const cached:number[]=[];const writer=textCheckpointWriter(async pages=>{assert.ok(Buffer.byteLength(JSON.stringify(pages))<=3_500_000);cached.push(...pages.map(page=>page.pageNumber));});
 for(const [i,text] of ["small","x".repeat(4_100_000),"small"].entries())await writer.add({pageNumber:i+1,text,method:"text",confidence:0.98});
 await writer.flush();assert.deepEqual(cached,[1,3]);
});
