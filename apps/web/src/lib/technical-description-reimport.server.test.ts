import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {processTechnicalDescription} from "./technical-description-processor";
import {TECHNICAL_IMPORT_VERSION} from "./technical-description-persistence";

test("fresh OCR bypasses both duplicate shortcuts and refreshes source and warnings without duplicate rows",async()=>{
 type Row=Record<string,unknown> & {id:string};
 const project=randomUUID(),org=randomUUID(),doc=randomUUID(),pdoc=randomUUID();
 const original="30.1.1 UC1.1\nVENTIL\nMateriale: Kobber",extra="Leveres med brakett.";
 const dbRows:Record<string,Row[]>={
  projects:[{id:project,organization_id:org,name:"Saved project"}],project_modules:[{id:randomUUID(),project_id:project,module_code:"sprinkler"}],
  technical_description_documents:[{id:doc,status:"extracted"}],
  project_documents:[{id:pdoc,storage_path:"saved.pdf",upload_status:"uploaded",processing_status:"completed",import_summary:{version:TECHNICAL_IMPORT_VERSION,documentId:doc,lineCount:1,requirementCount:1,result:{cached:true}}}],
  requirement_sets:[{id:randomUUID(),version:1,status:"draft"}],
  project_requirements:[{id:"saved-requirement",source_page:1,source_excerpt:original,status:"approved",value_json:{postNumber:"30.1.1",quantity:7,sourceText:original,technicalSpecification:original,reviewFlags:["manual-warning"],chosenProduct:"product-A"}}],
  requirement_candidates:[{id:"saved-candidate",page_number:1,raw_text:original,normalized_value:{postNumber:"30.1.1",quantity:7,reviewFlags:[]}}],
  technical_description_material_lines:[{id:"saved-material",source_page:1,post_number:"30.1.1",source_text:original,quantity:7,review_flags:[]}]
 };
 let inserts=0,extractions=0;
 const select=async(table:string,filters:Record<string,string>)=>(dbRows[table]??[]).filter(row=>!filters.id||row.id===filters.id.slice(3)).map(row=>{
  const alias=filters.select?.match(/stored_value:(\w+)/)?.[1];return {...structuredClone(row),...(alias?{stored_value:structuredClone(row[alias])}:{})};
 });
 const db={selectUserRows:select,selectAllUserRows:select,
  async updateUserRowsReturning(table:string,filters:Record<string,string>,changes:Record<string,unknown>){const row=dbRows[table].find(row=>row.id===filters.id.slice(3))!;Object.assign(row,changes);return structuredClone(row);},
  async insertUserRows(table:string,rows:Row[]){if(["project_requirements","requirement_candidates","technical_description_material_lines"].includes(table))inserts+=rows.length;(dbRows[table]??=[]).push(...structuredClone(rows));},
  async insertUserRowReturning(table:string,changes:Record<string,unknown>){const row={...changes,id:randomUUID()};(dbRows[table]??=[]).push(row);return structuredClone(row);}
 };
 const authorization={user:{id:randomUUID()},context:{organization:{id:org,name:"test"},permissions:["project.requirement.create"] as const}};
 const request=(ocr:boolean)=>{const form=new FormData();form.set("projectId",project);form.set("responseMode","summary");form.set("file",new File(["%PDF-1.7\n"],"test.pdf",{type:"application/pdf"}));
  if(ocr)form.set("ocrPages",JSON.stringify([{pageNumber:1,text:original+"\n"+extra,confidence:.5}]));return new Request("http://localhost/api/test",{method:"POST",body:form});};
 const options={extractPages:async()=>{extractions++;return [{pageNumber:1,text:original,method:"text" as const,confidence:.99,status:"success" as const}];}};
 const persistence=db as unknown as NonNullable<Parameters<typeof processTechnicalDescription>[2]>;
 const cached=await processTechnicalDescription(request(false),authorization,persistence,options);
 assert.equal(cached.status,200);assert.equal((await cached.json()).duplicate,true);assert.equal(extractions,0);
 for(let run=0;run<2;run++){
  const response=await processTechnicalDescription(request(true),authorization,persistence,options);
  assert.equal(response.status,201,JSON.stringify(await response.json()));
  assert.equal(dbRows.project_requirements.length,1);assert.equal(dbRows.requirement_candidates.length,1);assert.equal(dbRows.technical_description_material_lines.length,1);
  const row=dbRows.project_requirements[0],value=row.value_json as Record<string,unknown>;
  assert.equal(row.id,"saved-requirement");assert.equal(row.status,"approved");assert.equal(value.quantity,7);assert.equal(value.chosenProduct,"product-A");
  assert.match(row.source_excerpt as string,/Leveres med brakett/);assert.equal((row.source_excerpt as string).split(extra).length-1,1);
  assert.ok((value.reviewFlags as string[]).includes("ocr-source"));assert.ok((value.reviewFlags as string[]).includes("manual-warning"));
 }
 assert.equal(extractions,2);assert.equal(inserts,0);
});
