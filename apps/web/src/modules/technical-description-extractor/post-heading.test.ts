import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { splitPostHeading, type HeadingLayout } from "./post-heading";
import { extractTechnicalDescriptionPages } from "./pdf";
import { extractTechnicalDescriptionFromPages } from "./extractor";
import { requirementSnapshot } from "@/lib/requirement-snapshot";
import { projectRequirementDetails } from "@/lib/project-requirement-details";
import { buildChapterWorkspace } from "@/lib/project-chapter-workspace";
import { compactProjectRequirement } from "@/lib/project-overview";

const title="KONTROLL AV FERDIGSTILT ANLEGG";
// Synthetic middle sentence; the first and last clauses are the user's regression case.
const body="Uavhengig 3. partskontroll utføres av\net uavhengig kontrollforetak.\nPrisen inkluderer oppfyllelse av krav i post 30.1 og 30.2.";
const source=title+"\n"+body;
test("separates the complete control heading while retaining every requirement and reference",()=>{
  for(const input of [source,source.replaceAll("\n"," ")]){
    const result=splitPostHeading(input);
    assert.equal(result.title,title);
    assert.equal(result.requirementText.replaceAll("\n"," "),body.replaceAll("\n"," "));
    assert.equal(result.status,"separated");
    assert.equal(result.originalText,input);
  }
});
test("mixed-case headings can span any number of physical lines before a font/size transition",()=>{
  const rows=["Kontroll av ferdigstilt anlegg", "med dokumentasjon og alle tilhørende", "tekniske installasjoner i bygget", "Uavhengig kontroll utføres av fagperson.", "Hele rapporten skal leveres."];
  const layout:HeadingLayout={version:1,lines:rows.map((text,i)=>({text,x:100,y:i*16,width:300,height:i<3?12:10,font:i<3?"heading-font":"body-font"}))};
  const result=splitPostHeading(rows.join("\n"),layout);
  assert.equal(result.title,rows.slice(0,3).join(" "));
  assert.equal(result.requirementText,rows.slice(3).join("\n"));
  assert.equal(result.status,"separated");
  assert.equal(splitPostHeading(rows.join(" "),layout).title,result.title);
});
test("uppercase alone neither splits ambiguous text nor loses the original body",()=>{
  const input="Generell beskrivelse\nYtterligere opplysninger om anleggets plassering.";
  const result=splitPostHeading(input);
  assert.equal(result.status,"review");
  assert.equal(result.originalText,input);
  assert.equal(result.requirementText,input);
  const long=["INNENDØRS RØRLEDNING FOR",...Array.from({length:8},(_,i)=>`KRETS ${i+1} OG TILHØRENDE UTSTYR`)];
  assert.equal(splitPostHeading(long.join("\n")).title,long.join(" "));
});
test("corrected data is shared by navigation, workspace and detail without changing manual wording",()=>{
  const saved={id:"control",value_text:source.replaceAll("\n"," "),display_name:source.replaceAll("\n"," "),source_page:1,source_excerpt:"30.3 "+source,
    value_json:{postNumber:"30.3",unit:"RS",quantity:1,sourceText:"30.3 "+source,productResolution:{status:"not_required"}},edit_revision:0};
  const row=requirementSnapshot(saved);
  assert.equal(row.value_text,title);
  assert.equal((row.value_json as Record<string,unknown>).description,body);
  assert.equal(row.source_excerpt,saved.source_excerpt);
  assert.deepEqual(row.value_json.productResolution,saved.value_json.productResolution);
  assert.equal(compactProjectRequirement(saved).value_text,title);
  const workspace=buildChapterWorkspace([{...saved,value_json:{...saved.value_json,unit:null,quantity:null}}]);
  assert.equal(workspace.sources.control.title,title);
  assert.equal(workspace.sources.control.text,body);
  assert.equal(projectRequirementDetails(row).sourceExcerpt,body);
  assert.deepEqual(requirementSnapshot(row),row);
  assert.equal(requirementSnapshot({...saved,value_text:"Min granskade rubrik",display_name:"Egen rubrik"}).value_text,"Min granskade rubrik");
});
test("post references, including a wrapped 30.1 og 30.2, cannot create new nodes",()=>{
  for(const text of [source,source.replace("post 30.1", "post\n30.1")]) {
    const result=extractTechnicalDescriptionFromPages([{pageNumber:1,method:"text",confidence:.99,text:"30.3 "+text+"\nRund sum RS\n30.4 NESTE POST\nAntall stk 1"}]);
    const control=result.materialLines.find(line=>line.postNumber==="30.3")!;
    assert.equal(control.description,title);
    assert.ok(control.sourceText.includes(text));
    assert.equal(result.materialLines.some(line=>line.postNumber==="30.1"||line.postNumber==="30.2"),false);
    const nodes=result.structure!.chapters.flatMap(node=>[node,...node.children]);
    assert.equal(nodes.find(node=>node.number==="30.3")?.kind,"post");
  }
});
test("a real PDF separates multiline heading, complete body, RS, price and sum before persisting",async()=>{
  const pdf=await PDFDocument.create(),page=pdf.addPage([700,800]);
  const regular=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold);
  const draw=(text:string,x:number,y:number,heading=false)=>page.drawText(text,{x,y,size:10,font:heading?bold:regular});
  for(const [text,x] of [["Postnr.",30],["Beskrivelse",120],["Enh.",465],["Mengde",510],["Pris",565],["Sum",625]] as const)draw(text,x,740);
  for(const x of [25,110,455,500,555,615,685])page.drawLine({start:{x,y:750},end:{x,y:480},thickness:.5});
  draw("30.3",30,710);draw("KONTROLL AV FERDIGSTILT",120,710,true);draw("ANLEGG",120,696,true);
  for(const [i,line] of body.split("\n").entries())draw(line,120,670-i*14);
  draw("RS",465,610);draw("150,00",565,610);draw("150,00",625,610);
  const pages=await extractTechnicalDescriptionPages(await pdf.save());
  const result=extractTechnicalDescriptionFromPages(pages);
  const line=result.materialLines.find(line=>line.postNumber==="30.3")!;
  assert.equal(line.description,title);assert.equal(line.title,title);
  assert.equal(line.requirementText,body);
  assert.equal(line.unit,"RS");assert.equal(line.quantity,1);
  assert.doesNotMatch(line.requirementText!,/150,00|\bRS\b/);
  assert.equal(line.headingSplit?.status,"separated");
  assert.equal(result.structure!.chapters.find(node=>node.number==="30.3")?.description,body);
});

test("same-font paragraph spacing separates a heading even when the verb wraps later",()=>{
  const lines=["LEKKASJESIKRING AV VANNINSTALLASJONER","Komplett lekkasjedeteksjon system med magnetventiler","(2stk), lekkasjefølere og styringsenhet. All kabling","skal medtas."];
  const layout:HeadingLayout={version:1,lines:lines.map((text,i)=>({text,x:97,y:[0,22.08,33.12,44.16][i],width:250,height:9.96,font:"F3"}))};
  const result=splitPostHeading(lines.join("\n"),layout);
  assert.equal(result.title,lines[0]);assert.equal(result.requirementText,lines.slice(1).join("\n"));
  const two=["MONTERING AV UTSTYR","Montering av ventiler og givere levert av automasjon"];
  assert.equal(splitPostHeading(two.join("\n"),{version:1,lines:layout.lines.slice(0,2).map((line,i)=>({...line,text:two[i]}))}).title,two[0]);
});
test("a measured uppercase post is not a main chapter and internal numbered sections remain body text",()=>{
  const result=extractTechnicalDescriptionFromPages([{pageNumber:1,method:"text",confidence:.99,text:"30.12 "+source+"\nRund sum RS\n30.13 NESTE POST\nAntall stk 1"}]);
  assert.equal(result.structure!.chapters.find(node=>node.number==="30.12")?.kind,"post");
  assert.equal(result.project.chapter,undefined);
  const split=splitPostHeading("VVS-INSTALLASJONER\n30.0 OMFANG\nDette kapittel omfatter tekniske arbeider.");
  assert.equal(split.title,"VVS-INSTALLASJONER");assert.match(split.requirementText,/30\.0 OMFANG/);
});

test("multiline chapter headings are not duplicated and do not consume their requirement body",()=>{
  const result=extractTechnicalDescriptionFromPages([{pageNumber:1,method:"text",confidence:.99,
    text:"30.332 DRIFT AV TEKNISKE\nINSTALLASJONER\nDet skal leveres dokumentasjon.\n30.332.1 SPRINKLER\nAntall stk 1"}]);
  const chapter=result.structure!.chapters.find(node=>node.number==="30.332")!;
  assert.equal(chapter.title,"DRIFT AV TEKNISKE INSTALLASJONER");
  assert.equal(chapter.description,"Det skal leveres dokumentasjon.");
  assert.equal(chapter.children[0].number,"30.332.1");
});
test("repairing a derived legacy heading never overwrites an independently edited body",()=>{
  const row=requirementSnapshot({id:"manual-body",value_text:source.replaceAll("\n"," "),source_excerpt:"30.3 "+source,
    value_json:{postNumber:"30.3",description:"Min sparade korrigerade kravtext"}});
  assert.equal(row.value_json.description,"Min sparade korrigerade kravtext");
  assert.equal(row.value_text,source.replaceAll("\n"," "));
});
