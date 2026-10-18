import assert from "node:assert/strict";
import test from "node:test";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {projectRequirementDetails} from "./project-requirement-details";
import {ProjectPostSpecification} from "../components/ProjectPostSpecification";
import {extractTechnicalDescriptionFromPages} from "../modules/technical-description-extractor/extractor";
import {pdfReadingBody} from "./pdf-page-source-merge";
import {withoutPdfPageSumFooters} from "./pdf-post-text";
import {buildProductPostTree,flattenProductPostTree} from "./product-post-tree";
import {planSourcePostRows,sourcePostRefreshChanges,refreshSourcePostRows} from "./technical-description-source-persistence";
import {expandRequirementText} from "./requirement-text-storage";

test("short digital and OCR requirements before a table's first number both survive once",()=>{
 const text="Postnr: NS 3420 kode/Spesifikasjon Enh. Mengde Pris Sum\nAlle festemidler skal inkluderes.\n30.1.1 UC1.1\nVENTIL\nAntall st 2";
 for(const method of ["text","ocr"] as const){
  const result=extractTechnicalDescriptionFromPages([{pageNumber:1,text,method,confidence:.98,postInventory:{method:"column",posts:[{postNumber:"30.1.1",sourceText:"30.1.1 UC1.1\nVENTIL\nAntall st 2"}]}}]);
  assert.equal(result.materialLines.filter(l=>l.sourceText.includes("Alle festemidler skal inkluderes.")).length,1);
  assert.equal(result.materialLines.filter(l=>l.postNumber==="30.1.1").length,1);
 }
});

test("footer removal preserves Sum requirements and only removes entire total rows",()=>{
 const text="30.1.1 UC1.1\nVENTIL\nSum: Alle kostnader skal inngå.\nSkal leveres med brakett.\nSum denne side: 200,00\nAkkumulert Kapittel 30: 200,00";
 for(const source of [pdfReadingBody(text),withoutPdfPageSumFooters(text),extractTechnicalDescriptionFromPages([{pageNumber:1,text,method:"text",confidence:.98}]).materialLines.map(l=>l.sourceText).join("\n")]){
  assert.match(source,/Sum: Alle kostnader skal inngå\./);assert.match(source,/Skal leveres med brakett\./);
  assert.doesNotMatch(source,/Sum denne side|Akkumulert Kapittel/);
 }
});

test("a later descendant cannot reorder the PDF, while contiguous descendants keep their hierarchy",()=>{
 for(const numbers of [["30.1","30.2","30.1.1"],["30.1","30.1.1","30.2"],["30.1.1","30.2","30.1"],["30.1","30.1.1","30.2","30.1.2"]]){
  const rows=numbers.map((postNumber,index)=>({id:String(index),source_page:1,value_json:{postNumber,sourceOrder:index+1}}));
  const tree=buildProductPostTree(rows);assert.deepEqual(flattenProductPostTree(tree).map(r=>r.id),rows.map(r=>r.id));
  if(numbers[1]==="30.1.1")assert.equal(tree[0].children.length,1);
 }
});

test("new OCR wording updates one physical source occurrence and is idempotent across all three tables",()=>{
 for(const [table,source,page,value] of [["project_requirements","source_excerpt","source_page","value_json"],["requirement_candidates","raw_text","page_number","normalized_value"],["technical_description_material_lines","source_text","source_page",""]]){
  const old="30.1.1 Ventil\nMateriale: Kobber",next=old+"\nLeveres med brakett.";
  const payload={id:"original",[source]:old,[page]:1,post_number:"30.1.1",quantity:7,unit:"st",status:"approved",...(value?{[value]:{postNumber:"30.1.1",quantity:7,unit:"st",sourceText:old,technicalSpecification:old,reviewFlags:["manual-warning"],chosenProduct:"saved"}}:{review_flags:["manual-warning"]})};
  const incoming={...payload,[source]:next,...(value?{[value]:{postNumber:"30.1.1",sourceText:next,technicalSpecification:next,quantity:2,unit:"st",reviewFlags:["ocr-source"]}}:{quantity:2,review_flags:["ocr-source"]})};
  const plan=planSourcePostRows(table,"document",[incoming],[payload]);assert.equal(plan.missing.length,0);assert.equal(plan.rows[0].id,"original");
  const changes=sourcePostRefreshChanges(table,payload,plan.rows[0]),updated:Record<string,unknown>={...payload,...changes};
  assert.equal(updated[source],next);assert.equal(updated.status,"approved");
  if(value){const v=updated[value] as Record<string,unknown>;assert.equal(v.quantity,7);assert.equal(v.chosenProduct,"saved");assert.ok((v.reviewFlags as string[]).includes("reextracted-requirement-conflict"));}
  else assert.equal(updated.quantity,7);
  assert.deepEqual(sourcePostRefreshChanges(table,updated,plan.rows[0]),{});
  assert.equal(planSourcePostRows(table,"document",[incoming],[updated]).missing.length,0);
 }
});

test("repeated physical occurrences retain distinct IDs and exact occurrences are matched before changed OCR",()=>{
 const row=(text:string)=>({source_page:1,source_excerpt:text,value_json:{postNumber:"30.1.1"}});
 const first=planSourcePostRows("project_requirements","doc",[row("A"),row("B")],[]).rows;
 assert.notEqual(first[0].id,first[1].id);
 const repeat=planSourcePostRows("project_requirements","doc",[row("B"),row("A with new OCR")],first);
 assert.equal(repeat.missing.length,0);assert.equal(repeat.rows[0].id,first[1].id);assert.equal(repeat.rows[1].id,first[0].id);
 assert.ok((repeat.rows[1].value_json as unknown as {reviewFlags:string[]}).reviewFlags.includes("ambiguous-source-identity"));
 const other=planSourcePostRows("project_requirements","other-document",[row("A")],[]);
 assert.notEqual(other.rows[0].id,first[0].id);
});

test("source reconciliation preserves a concurrent manual correction and compact text references",async()=>{
 const old="30.1.1 Ventil",next=old+"\nLeveres med brakett.";
 let value:Record<string,unknown>={postNumber:"30.1.1",quantity:7,reviewFlags:[],textStorage:{version:1,references:{sourceText:"source_excerpt",technicalSpecification:"source_excerpt"}}};
 let source=old,revision=1,writes=0;
 const db={async selectUserRows<T>(){return [{id:"saved",updated_at:String(revision),source_page:1,source_excerpt:source,stored_value:structuredClone(value)}] as T[];},
  async updateUserRowsReturning<T>(_table:string,filters:Record<string,string>,changes:Record<string,unknown>){
   assert.equal(filters.updated_at,`eq.${revision}`);
   if(++writes===1){value={...value,quantity:9};revision++;throw Error("Supabase update of project_requirements returned no row.");}
   source=changes.source_excerpt as string;value=changes.value_json as Record<string,unknown>;return {id:"saved"} as T;
  }};
 await refreshSourcePostRows("project_requirements",{project_id:"eq.project"},[{id:"saved",source_excerpt:next,value_json:{postNumber:"30.1.1",quantity:2,reviewFlags:["ocr-source"]}}],
 [{id:"saved",source_excerpt:old,stored_value:value}],db);
 assert.equal(writes,2);assert.equal(value.quantity,9);assert.equal(source,next);
 const expanded=expandRequirementText({source_excerpt:source,value_json:value});assert.equal(expanded.value_json.technicalSpecification,next);
});

test("already represented chapter titles are not emitted twice",()=>{
 const result=extractTechnicalDescriptionFromPages([{pageNumber:1,method:"text",confidence:.98,text:"Kapittel: 32 Varmeanlegg\nPostnr: NS 3420 kode/Spesifikasjon Enh. Mengde Pris Sum\n32 Varmeanlegg\n32.1 Ventil\nAntall st 2"}]);
 assert.equal(result.materialLines.filter(line=>line.sourceText.replace(/\s+/g," ")==="32 Varmeanlegg").length,1);
});
test("OCR total-row borders are stripped without stripping prose",()=>{
 for(const footer of ["Sum denne side: | 009)","Sum denne side: | ood","Akkumulert Kapittel 31 Sanitær: | 009)"]){
  assert.equal(withoutPdfPageSumFooters("Krav før\n"+footer+"\nPublisher"),"Krav før");
 }
 assert.equal(withoutPdfPageSumFooters("Sum denne side: skal inkluderes."),"Sum denne side: skal inkluderes.");
});

test("conflicting OCR preserves corrected layout and keeps the alternative separately without duplication",()=>{
 const old="30.1.1 Ventil\nTrykk: 12 bar\n  | X | KONTROLLERT KRAV";
 const incoming={source_excerpt:"30.1.1 Ventil\nTrykk: 16 bar\nEn ny kravtekst.",value_json:{postNumber:"30.1.1",reviewFlags:["ocr-source"]}};
 const saved={id:"saved",source_excerpt:old,value_json:{postNumber:"30.1.1",sourceText:old,reviewFlags:[],pdfDescriptionText:old}};
 const changes=sourcePostRefreshChanges("project_requirements",saved,incoming);
 assert.equal(changes.source_excerpt,undefined);
 const value=changes.value_json as Record<string,unknown>;
 assert.equal(value.pdfDescriptionText,old);assert.deepEqual(value.sourceReimportReadings,[incoming.source_excerpt]);
 assert.deepEqual(sourcePostRefreshChanges("project_requirements",{...saved,...changes},incoming),{});
});

test("conflicting reimport text is accessible for review on the saved post card",()=>{
 const reading="Trykk: 16 bar\nEn ny kravtekst.";
 const details=projectRequirementDetails({source_page:1,source_excerpt:"30.1.1 Ventil\nTrykk: 12 bar",value_json:{postNumber:"30.1.1",sourceReimportReadings:[reading],reviewFlags:["reextracted-requirement-conflict"]}});
 const html=renderToStaticMarkup(createElement(ProjectPostSpecification,{id:"saved",details,description:"Ventil",quantity:{quantity:null,unit:"?"},informationOnly:true}));
 assert.match(html,/Ny PDF-läsning att granska/);assert.match(html,/En ny kravtekst/);assert.equal(html.split("Trykk: 16 bar").length-1,1);
});
test("unchanged source order retains legacy positions, while a new physical occurrence gets current positions",()=>{
 const row=(id:string,postNumber:string,sourceOrder:number)=>({id,source_page:1,source_excerpt:postNumber,value_json:{postNumber,sourceOrder}});
 const before=[row("a","30.1",.1),row("b","30.2",.2)];
 const unchanged=planSourcePostRows("project_requirements","doc",[row("x","30.1",1),row("y","30.2",2)],before);
 assert.deepEqual(unchanged.rows.map(r=>r.value_json.sourceOrder),[.1,.2]);
 const added=planSourcePostRows("project_requirements","doc",[row("x","30.1",1),row("n","30.1.1",2),row("y","30.2",3)],before);
 assert.equal(added.missing.length,1);assert.deepEqual(added.rows.map(r=>r.value_json.sourceOrder),[1,2,3]);
});
