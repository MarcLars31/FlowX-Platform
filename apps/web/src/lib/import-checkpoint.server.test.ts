import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { checkpointPrefix, decodeCheckpoint, textCheckpointWriter, payloadHash, type Checkpoint } from "./import-checkpoint.server";
import { extractTechnicalDescriptionPages } from "../modules/technical-description-extractor/pdf";
import type { TechnicalDescriptionPage } from "../modules/technical-description-extractor/types";
import { setImmediate } from "node:timers/promises";

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

test("checkpoint I/O overlaps the next pages with one writer, bounded buffering and a final drain",async()=>{
 const releases:Array<()=>void>=[], saved:number[]=[], batches:number[][]=[];
 let active=0,maxActive=0,flushed=false;
 const writer=textCheckpointWriter(async pages=>{
  active++;maxActive=Math.max(maxActive,active);batches.push(pages.map(page=>page.pageNumber));
  await new Promise<void>(resolve=>releases.push(resolve));
  saved.push(...pages.map(page=>page.pageNumber));active--;
 });
 const page=(pageNumber:number):TechnicalDescriptionPage=>({pageNumber,text:"source",method:"text",confidence:.99});
 for(let i=1;i<=199;i++)await writer.add(page(i));
 assert.equal(batches.length,1,"page 199 can be parsed while the first checkpoint is still saving");
 assert.equal(saved.length,0);
 let buffered=false;
 const second=writer.add(page(200)).then(()=>{buffered=true;});
 await setImmediate();
 assert.equal(buffered,false,"a full second batch waits for the first write");
 releases[0]();await second;
 assert.deepEqual(saved,Array.from({length:100},(_,i)=>i+1));
 assert.equal(batches.length,2);
 const final=writer.flush().then(()=>{flushed=true;});
 await setImmediate();assert.equal(flushed,false,"completion must wait for the last checkpoint");
 releases[1]();await final;
 assert.equal(maxActive,1);assert.deepEqual(saved,Array.from({length:200},(_,i)=>i+1));
 await writer.flush();assert.equal(batches.length,2,"repeated flush does not duplicate checkpoints");
});

test("an in-flight checkpoint failure aborts the drain and cannot start later writes",async()=>{
 let rejectWrite!:(error:Error)=>void,writes=0;
 const writer=textCheckpointWriter(async()=>{writes++;await new Promise<void>((_,reject)=>{rejectWrite=reject;});});
 for(let i=1;i<=101;i++)await writer.add({pageNumber:i,text:"source",method:"text",confidence:.99});
 rejectWrite(new Error("storage unavailable"));
 await assert.rejects(writer.flush(),/storage unavailable/);
 await assert.rejects(writer.add({pageNumber:102,text:"source",method:"text",confidence:.99}),/storage unavailable/);
 assert.equal(writes,1,"pending pages remain unacknowledged so a job retry can read them again");
});

test("pipelined checkpoints retain page order and the UTF-8 storage limit",async()=>{
 const batches:TechnicalDescriptionPage[][]=[];
 const writer=textCheckpointWriter(async pages=>{batches.push(pages);});
 const pages=Array.from({length:7},(_,i)=>({pageNumber:i+1,text:"å".repeat(900_000),method:"text" as const,confidence:.99}));
 for(const page of pages)await writer.add(page);
 await writer.flush();
 assert.deepEqual(batches.flat(),pages);
 assert.ok(batches.every(batch=>batch.length<=100 && Buffer.byteLength(JSON.stringify(batch))<=3_500_000));
});
