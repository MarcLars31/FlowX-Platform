import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { extractTechnicalDescriptionPages } from "./pdf";
import { extractTechnicalDescriptionFromPages } from "./extractor";
import { pdfPostMeasurementCells, measuredPostColumns } from "./pdf-post-measurements";
import { visibleProjectRequirements } from "@/lib/project-requirement-views";
const item = (str:string,x:number,y:number,width=str.length*5,height=10)=>({str,transform:[height,0,0,height,x,y],width,height});
const header = [item("Postnr:",45,713),item("Beskrivelse",198,713),item("Enh.",365,713),item("Mengde",398,713),item("Pris",460,713),item("Sum",524,713)];
test("physical cells retain hours, litres, unusual units and empty quantities independently of prose, prices and Sted",()=>{
 const cells=pdfPostMeasurementCells([...header,
  item("30.1",45,680),item("Antall 2 st",100,680),item("time",366,680),item("130,00",407,680),item("0,00",477,680),
  item("30.2",45,600),item("Mengde",100,590),item("liter",370,590),item("110,0",416,590),
  item("30.3",45,500),item("3",375,500),item("1,0",426,500),
  item("30.4",45,400),item("RS",369,400),item("0,00",477,400),item("[ 0,00 ]",537,400),
  item("30.5",45,300),item("pakke",365,300),
  item("30.6",45,200),item("Antall st 99",100,180),item("999",477,180),item("Sum denne side:",421,67)
 ])!;
 assert.deepEqual(cells.slice(1),[
  {postNumber:"30.1",unit:"time",quantity:"130,00"},{postNumber:"30.2",unit:"liter",quantity:"110,0"},
  {postNumber:"30.3",unit:"3",quantity:"1,0"},{postNumber:"30.4",unit:"RS",quantity:""},
  {postNumber:"30.5",unit:"pakke",quantity:""},{postNumber:"30.6",unit:"",quantity:""}
 ]);
 assert.equal(visibleProjectRequirements(cells.slice(1).map((c,i)=>({id:String(i),value_json:{pdfColumnValues:c}}))).length,5);
});
test("ambiguous headers and repeated occurrences never give fabricated empty or measured cells",()=>{
 assert.equal(pdfPostMeasurementCells(header.filter(i=>i.str!=="Pris")),undefined);
 const page={pageNumber:1,text:"",method:"text" as const,confidence:1,sourcePostColumns:[{postNumber:"30.1",unit:"st",quantity:"1"},{postNumber:"30.1",unit:"st",quantity:"2"}]};
 assert.equal(measuredPostColumns([page],{postNumber:"30.1",sourcePage:1}),undefined);
 assert.equal(measuredPostColumns([{...page,method:"ocr",sourcePostColumns:[{postNumber:"30.1",unit:"",quantity:""}]}],{postNumber:"30.1",sourcePage:1}),undefined);
});
test("a real PDF import passes raw physical cells through to product visibility without changing its text",async()=>{
 const doc=await PDFDocument.create(),page=doc.addPage([595,842]),font=await doc.embedFont(StandardFonts.Helvetica);
 for(const i of [...header,item("30.1",45,680),item("KOORDINERENDE YTELSER",100,680),item("Tid",100,650),item("time",366,650),item("130,00",407,650),item("0,00",477,650),item("Alle krav skal bevares.",100,620),item("30.2",45,550),item("Bare kravtekst. Antall 2 st for annet utstyr.",100,530),item("Sum denne side:",421,67)])page.drawText(i.str,{x:i.transform[4],y:i.transform[5],size:10,font});
 const pages=await extractTechnicalDescriptionPages(await doc.save());
 const result=extractTechnicalDescriptionFromPages(pages);
 const measured=result.materialLines.find(r=>r.postNumber==="30.1")!;
 assert.deepEqual(measured.pdfColumnValues,{unit:"time",quantity:"130,00"});
 assert.match(measured.sourceText,/Alle krav skal bevares/);
 assert.deepEqual(visibleProjectRequirements(result.materialLines.map(r=>({id:r.id,value_json:r}))).map(r=>r.value_json.postNumber),["30.1"]);
});
