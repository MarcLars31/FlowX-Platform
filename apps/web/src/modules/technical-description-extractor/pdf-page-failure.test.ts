import test from "node:test";
import assert from "node:assert/strict";
import {extractPagesFromDocument} from "./pdf";
test("a damaged middle page is marked for review and later pages survive",async()=>{
 const saved:number[]=[];
 const document={numPages:3,getPage:async(n:number)=>({getTextContent:async()=>{if(n===2)throw Error('corrupt content');return {items:[{str:'Own post content '.repeat(20),hasEOL:true,transform:[1,0,0,12,40,700],width:400,height:12}]};},getViewport:()=>({width:600,height:800,transform:[1,0,0,-1,0,800],convertToViewportPoint:(x:number,y:number)=>[x,800-y]}),getAnnotations:async()=>[],getOperatorList:async()=>({fnArray:[],argsArray:[]}),cleanup(){}})};
 const pages=await extractPagesFromDocument(document as unknown as Parameters<typeof extractPagesFromDocument>[0],{onPage:async page=>{saved.push(page.pageNumber)}});
 assert.deepEqual(saved,[1,2,3]);assert.equal(pages[1].status,'failed');assert.equal(pages[1].errorCode,'text_extraction_failed');assert.ok(pages[2].text.includes('Own post'));
 await assert.rejects(extractPagesFromDocument(document as unknown as Parameters<typeof extractPagesFromDocument>[0],{onPage:async()=>{throw Error('checkpoint unavailable')}}),/checkpoint unavailable/);
});
