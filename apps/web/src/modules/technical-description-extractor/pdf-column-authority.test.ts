import test from "node:test";
import assert from "node:assert/strict";
import { normalizedPageLines } from "./document-parser";
import { pdfPostInventoryFromItems } from "./post-inventory";
import { sitePostTableFromPdfItems } from "./pdf-post-table";
import { priceColumnsFromPdfItems } from "./pdf-price-columns";
import { layoutTextFromPdfItems } from "./pdf-layout";
import { pdfPostMeasurementCells } from "./pdf-post-measurements";
import { extractTechnicalDescriptionFromPages } from "./extractor";
import { productTechnicalSpecification } from "@/lib/ahlsell-requirement-context";
import { buildChapterWorkspace } from "@/lib/project-chapter-workspace";
import { pdfPostDisplayText } from "@/lib/pdf-post-display-text";
import { mergeClientOcrPages } from "@/lib/technical-description-ocr-payload";
import { linkPostHierarchy } from "./post-hierarchy";
import type { TechnicalDescriptionMaterialLine } from "./types";

const item=(str:string,x:number,y:number,width=str.length*5)=>({str,transform:[10,0,0,10,x,y],width,height:10});
const headers=[item("Postnr",40,760,40),item("NS-kode/Spesifikasjon",120,760,130),item("Enh.",390,760),item("Mengde",440,760),item("Pris",500,760),item("Sum",550,760)];
function page(pageNumber:number,body:ReturnType<typeof item>[]) {
  const original=[...headers,...body], separated=priceColumnsFromPdfItems(original,
    [25,110,380,425,485,540,590].map(x=>({x0:x,x1:x,y0:-780,y1:-550})));
  return {pageNumber,text:layoutTextFromPdfItems(separated.items),method:"text" as const,confidence:.98,
    postTable:sitePostTableFromPdfItems(separated.items,true,separated.audit.tables),
    postInventory:pdfPostInventoryFromItems(separated.items),priceColumns:separated.audit,
    sourcePostColumns:pdfPostMeasurementCells(original,separated.audit.tables)};
}
test("unknown table cells preserve technical values even when a unit precedes them",()=>{
  const source="Lengde m\t100,00\tTrykk 0,5 bar\tTemperatur 68 °C";
  assert.equal(normalizedPageLines(source)[0],source);
  assert.equal(pdfPostDisplayText(source),source);
});
test("physical wrapped suffix may share the chapter root; complete siblings stay separate",()=>{
  const input=page(83,[item("30.31.315.",40,700,48),item("UF1.114261A",120,700),item("30.1",40,689),item("SERVANT – KOMPLETT",120,689),
    item("30.31.316.1",40,670),item("Neste post",120,670)]);
  assert.deepEqual(input.postInventory?.posts.map(p=>p.postNumber),["30.31.315.30.1","30.31.316.1"]);
  assert.deepEqual(input.postTable?.posts.map(p=>p.postNumber),["30.31.315.30.1","30.31.316.1"]);
});
test("generic post column prevents system references from splitting requirements",()=>{
  const input=page(73,[item("30.31.315.17.1",40,700),item("UD6.11113932A",120,700),item("PUMPE INNENDØRS",120,680),
    item("stk",390,660),item("1",440,660),item("15,00",500,660),item("15,00",550,660),
    item("310.001 .04-JPA001",120,640),item("Modbus RTU kort skal inngå.",120,620),item("Trykk: 0,5 bar",120,600)]);
  const result=extractTechnicalDescriptionFromPages([input]);
  assert.deepEqual(result.materialLines.map(p=>p.postNumber),["30.31.315.17.1"]);
  const line=result.materialLines[0];
  assert.match(line.requirementText!,/Modbus RTU/);
  assert.match(productTechnicalSpecification({value_json:line}),/Modbus RTU/);
  assert.doesNotMatch(line.sourceText,/15,00/);
  assert.equal(line.quantity,1);
});
test("full heading body is shared by display and matching even for a legacy truncated specification",()=>{
  const requirementText="Uavhengig 3. partskontroll utføres av godkjent firma.\nPrisen inkluderer oppfyllelse av krav i post 30.1 og 30.2.";
  const row={value_json:{postNumber:"30.33.332.24",technicalSpecification:"30.33.332.24 KONTROLL AV FERDIGSTILT ANLEGG",
    headingSplit:{version:1,status:"separated",title:"KONTROLL AV FERDIGSTILT ANLEGG",requirementText}}};
  assert.match(productTechnicalSpecification(row),/Uavhengig 3\. partskontroll/);
  assert.ok(productTechnicalSpecification(row).endsWith(requirementText));
});
test("chapter cells stop continuations and hierarchy includes parents before their children",()=>{
  const result=extractTechnicalDescriptionFromPages([
    page(1,[item("02",40,720),item("Regningsarbeid",120,720),item("02.7",40,680),item("TIMEARBEID",120,680),item("timer",390,660),item("250,00",440,660),item("0,00",500,660),item("0,00",550,660)]),
    page(2,[item("20",40,720),item("Bygning",120,720),item("20.24",40,680),item("Fast bygginnredning",120,680),item("20.24.1",40,640),item("Innredning",120,640),item("stk",390,620),item("2",440,620),item("0,00",500,620),item("0,00",550,620)])]);
  const work=result.materialLines.find(l=>l.postNumber==="02.7")!;
  assert.doesNotMatch(work.sourceText,/20 Bygning/);
  assert.equal(work.parentPostNumber,"02");
  const child=result.materialLines.find(l=>l.postNumber==="20.24")!;
  assert.equal(child.parentPostNumber,"20");
  assert.ok(child.parentSourcePostId);
  const workspace=buildChapterWorkspace(result.materialLines.map(l=>({id:l.id,value_text:l.title,source_page:l.sourcePage,source_document_id:"test",value_json:{...l,sourcePostId:l.id}})));
  assert.equal(workspace.chapters.some(c=>c.id==="unlinked"),false);
  assert.deepEqual(workspace.chapters.map(c=>c.number),["02","20"]);
});

test("complete positioned OCR uses post cells; incomplete positions retain the original reading",()=>{
  const items=[...headers,item("30.31.315.17.1",40,700),item("PUMPE INNENDØRS",120,700),
    item("Antall",120,680),item("stk",390,680),item("1",440,680),item("15,00",500,680),item("15,00",550,680),
    item("310.001 .04-JPA001",120,650),item("Modbus RTU skal medtas.",120,630)];
  const words=items.map(i=>({text:i.str,bbox:{x0:i.transform[4],x1:i.transform[4]+i.width,y0:800-i.transform[5],y1:810-i.transform[5]}}));
  const text=items.map(i=>i.str).join("\n");
  const server={pageNumber:1,text:"",method:"text" as const,confidence:0,status:"failed" as const};
  const [ocr]=mergeClientOcrPages([server],[{pageNumber:1,text,words,confidence:.98}]);
  assert.ok(ocr.postTable);
  const result=extractTechnicalDescriptionFromPages([ocr]);
  assert.deepEqual(result.materialLines.map(p=>p.postNumber),["30.31.315.17.1"]);
  assert.match(result.materialLines[0].sourceText,/Modbus RTU/);
  const [uncertain]=mergeClientOcrPages([server],[{pageNumber:1,text:text+"\nEkstra kravtext utan koordinater",words,confidence:.98}]);
  assert.equal(uncertain.postTable,undefined);
  assert.match(uncertain.text,/Ekstra kravtext utan koordinater/);
  assert.equal(uncertain.priceColumns?.status,"review");
});

test("hierarchy resolves recovered parents only after inventory and keeps ambiguous parents unlinked",()=>{
  const common={category:"unknown" as const,operation:"unknown" as const,attributes:{},standardRefs:[],confidence:1,reviewFlags:[] as string[]};
  const root={...common,id:"root",postNumber:"20",sourcePage:1,description:"Bygning",sourceText:"20 Bygning"};
  const child={...common,id:"child",postNumber:"20.24",sourcePage:2,description:"Innredning",sourceText:"20.24 Innredning"};
  const lines:TechnicalDescriptionMaterialLine[]=[root,child];linkPostHierarchy(lines);
  assert.equal(lines[1].parentSourcePostId,"root");
  const repeated:TechnicalDescriptionMaterialLine[]=[{...root,id:"first"},{...root,id:"second"},{...child,parentSourcePostId:undefined,parentPostNumber:undefined}];
  linkPostHierarchy(repeated);
  assert.equal(repeated[2].parentSourcePostId,undefined);
  assert.ok(repeated[2].reviewFlags.includes("ambiguous-parent-post"));
});
