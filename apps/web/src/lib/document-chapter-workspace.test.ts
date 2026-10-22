import assert from "node:assert/strict";
import test from "node:test";
import { buildDocumentChapterWorkspace } from "./document-chapter-workspace";
import { chapterHeaderPages, chapterContains, compactChapterPageLayout, type ChapterPage } from "./pdf-chapter-navigation";
import { extractTechnicalDescriptionFromPages } from "@/modules/technical-description-extractor/extractor";
import { parseStructuredPostStart } from "@/modules/technical-description-extractor/document-parser";

function page(number:number, text:string[], document="a", ocr=false):ChapterPage {
  return {document_id:document,page_number:number,heading_layout:{lines:text.map((text,index)=>({text,x:40,y:(ocr?40:-780)+index*18,height:10,width:400}))}};
}
function row(id:string,number:string,title:string,p=1,product=false,doc="a") {
  return {id,source_document_id:doc,source_page:p,value_text:title,value_json:{postNumber:number,sourceText:title,description:title,...(product?{unit:"m",quantity:100}:{})}};
}
const table="Postnr NS-kode/Spesifikasjon Enh. Mengde Pris Sum";

test("physical main/subchapter headers group posts once, including continuation pages",()=>{
  const pages=[page(1,["Prosjekt: Eksempel Side 31-1","Kapittel: 31 Sanitær",table]),
    page(2,["Prosjekt: Eksempel Side 31-2","2 Ledningsnett for sanitærinstallasjoner","GENERELT"]),
    page(3,["Kravtekst 100,00 m, 0,5 bar og 68 °C", "Prisen inkluderer krav i post 30.1 og 30.2."]),
    page(4,["Prosjekt: Eksempel Side 32-1","Kapittel: 32 Varme",table])];
  const rows=[row("info","31","Sanitær"),row("pipes","31.2.1","Rør",2),row("one","31.2.1.1","DN25",2,true),row("two","31.2.1.2","DN32",3,true),row("heat","32.1","Varmerør",4,true)];
  const before=JSON.stringify(rows),w=buildDocumentChapterWorkspace(rows,pages);
  assert.deepEqual(w.chapters.map(c=>c.number),["31","32"]);
  assert.equal(w.chapters[0].sections[0].number,"31.2");
  assert.deepEqual(w.chapters[0].sections[0].requirementIds,["one","two"]);
  assert.equal(JSON.stringify(rows),before);
  assert.equal(w.sources.pipes.text,"Rør");
});

test("D1, compound headers, alpha scopes, station scopes and OCR retain their hierarchy",()=>{
  const cases=[
    {header:["D1 BESKRIVENDE DEL","02 ANDRE FELLESKOSTNADER - 01 Innregulering","Side D1-4"],root:"02",section:"02.01",post:"D1.02.01.2"},
    {header:["Kapittel: 31 SANITÆR - 310 SANITÆR GENERELT"],root:"31",section:"31.310",post:"31.310.1"},
    {header:["Kapittel: A VVS - 31 Sanitær - 310A Sanitær generelt"],root:"A",section:"A.31.310A",post:"31.310A.1"},
    {header:["Stasjon: 1301 Skøyen - 90 Gjennomgående arbeider - 30 VVS - 315 Utstyr"],root:"1301",section:"1301.90.30.315",post:"1301.90.30.315.1"},
    {header:["Kapittel: B1 Byggetrinn 1"],root:"B1",section:"B1",post:"B1.30.31.1"},
    {header:["1401 HM - 33.332 Installasjon for brannslokking med sprinkler"],root:"1401",section:"1401.33.332",post:"1401.33.332.5.1"}
  ];
  for(const c of cases) for(const ocr of [false,true]) {
    const w=buildDocumentChapterWorkspace([row("p",c.post,"Rør",1,true)],[page(1,["Prosjekt: Eksempel Side D1-1",...c.header,table],"a",ocr)]);
    assert.equal(w.chapters[0].number,c.root);
    assert.equal(w.chapters[0].sections[0].number,c.section);
    assert.deepEqual(w.chapters[0].sections[0].requirementIds,["p"]);
  }
});

test("dates, body references, price words and technical headings do not create chapters",()=>{
  const pages=[page(1,["Eksempel Side 20-1","11042025 Eksempel Doc. no.","20 Teknisk bygg",table,"30.1 og 30.2 er referanser","68 °C"]),
    page(2,["Prisen inkluderer oppfyllelse av krav i post 30.1 og 30.2.","31 Sanitær"] )];
  const w=buildDocumentChapterWorkspace([row("p","20.1","Rør",1,true)],pages);
  assert.deepEqual(w.chapters.map(c=>c.number),["20"]);
  assert.equal(chapterHeaderPages([pages[1]]).size,0);
  assert.equal(chapterContains("31","310.1"),false);
  assert.equal(chapterContains("01.1","1.1.2"),true);
});

test("no chapter evidence uses main post numbers, isolating different documents",()=>{
  const w=buildDocumentChapterWorkspace([row("a","30.1","DN25",1,true),row("b","30.2","DN32",2,true),row("c","30.1","DN40",1,true,"b")]);
  assert.equal(w.chapters.length,2);
  assert.ok(w.chapters.every(c=>c.kind==="main-post"));
  assert.deepEqual(new Set(w.chapters.flatMap(c=>c.sections.flatMap(s=>s.requirementIds))),new Set(["a","b","c"]));
});

test("same chapter number with different scope/title and uncertain prose stay separate",()=>{
  const pages=[page(1,["Prosjekt: Eksempel Side 1","02 Regningsarbeid",table]),page(2,["Prosjekt: Eksempel Side 2","02 Riving",table])];
  const w=buildDocumentChapterWorkspace([row("a","1.02.1","Timer",1,true),row("b","2.02.1","Riving",2,true),
    {...row("uncertain","","Uavklart tekst",3),value_json:{sourceText:"Prisen inkluderer krav i post 30.1 og 30.2.",reviewFlags:["unassigned-source-text"]}}],pages);
  assert.deepEqual(w.chapters.filter(c=>c.kind!=="review").map(c=>c.title),["Regningsarbeid","Riving"]);
  assert.match(w.sources.uncertain.text,/Prisen inkluderer/);
  assert.equal(w.chapters.at(-1)?.kind,"review");
});

test("compact stored page geometry yields the same chapter paths as full geometry",()=>{
  const full=page(1,["Prosjekt: Eksempel Side 31-1","Kapittel: 31 Sanitær",table,...Array.from({length:50},(_,i)=>"Kravtekst "+i)]);
  const compact={...full,heading_layout:compactChapterPageLayout(full.heading_layout)};
  assert.deepEqual(chapterHeaderPages([compact]),chapterHeaderPages([full]));
  assert.ok(compact.heading_layout.lines.length<20);
});

test("structured parsing safely stops at the final page line",()=>{
  assert.equal(parseStructuredPostStart(["31.1"],1),undefined);
  for(const text of ["01.1 AB1\nFORSIKRING AV ANSVAR\nRund sum RS", "31.1\nUB1.111\nRØR\nLengde m 100,00", "31.1\n31.2"]) {
    assert.doesNotThrow(()=>extractTechnicalDescriptionFromPages([{pageNumber:1,text,method:"text",confidence:1}]));
  }
});
