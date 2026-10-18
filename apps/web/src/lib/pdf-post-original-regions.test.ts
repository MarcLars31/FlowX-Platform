import assert from "node:assert/strict";
import test from "node:test";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {originalPdfPostRegions,originalPdfSourcePages} from "./pdf-post-original-regions";
import {ProjectPostSpecification} from "../components/ProjectPostSpecification";
import {projectRequirementDetails} from "./project-requirement-details";

const item=(str:string,x:number,y:number,height=10,width=40)=>({str,transform:[height,0,0,height,x,y],height,width});
const header=item("Postnr:",30,750), footer=item("Sum denne side:",120,50);
const items=[header,item("Beskrivelse",120,750),item("30.1.1",30,700),item("1.1.1. ARMATURER",120,700),
  item("Krav uten antall.",120,680),item("30.1.2",30,600),item("Neste post",120,600),footer];

test("original crop selects the physical post and retains its own subsection, without requiring an amount",()=>{
 const result=originalPdfPostRegions(items,"30.1.1",false,842,0);
 assert.equal(result.wholePage,false);
 const body=result.regions.find(r=>r.kind==="post")!;
 assert.ok(body.top>710&&body.bottom<677&&body.bottom>610);
 assert.equal(result.regions[0].kind,"header");
 assert.equal(originalPdfPostRegions(items,"1.1.1",false,842,0).wholePage,true);
});
test("wrapped post identifiers use one source region",()=>{
 const rows=[header,item("120000.25.",30,700,10,60),item("242.6",30,688),item("SF6.41A",120,700),footer];
 assert.equal(originalPdfPostRegions(rows,"120000.25.242.6",false,842,0).wholePage,false);
});
test("a continuation includes the top of the body and stops before the next post",()=>{
 const rows=[header,item("Fortsatt kravtekst",120,710),item("30.1.2",30,600),item("Neste",120,600),footer];
 const result=originalPdfPostRegions(rows,"30.1.1",true,842,0);
 assert.equal(result.wholePage,false);
 const body=result.regions.find(r=>r.kind==="post")!;
 assert.ok(body.top>720&&body.bottom<707&&body.bottom>610);
 assert.equal(originalPdfPostRegions(rows,"30.1.1",false,842,0).wholePage,true);
});
test("uncertain, scanned, rotated and duplicate-number pages remain entirely visible",()=>{
 for(const [rows,post,rotation] of [[[],"30.1.1",0],[items,null,0],[items,"missing",0],[items,"30.1.1",90],[[...items,item("30.1.1",30,400)],"30.1.1",0]] as const){
  assert.deepEqual(originalPdfPostRegions(rows,post,false,842,0,rotation),{regions:[{top:842,bottom:0,kind:"page"}],wholePage:true});
 }
});
test("a last line or tall heading crossing the boundary triggers a whole page, never a clipped requirement",()=>{
 for(const extra of [item("Siste kravlinje",120,615),item("Stor overskrift",120,700,24)]){
  assert.equal(originalPdfPostRegions([...items,extra],"30.1.1",false,842,0).wholePage,true);
 }
});
test("source pages are unique, ordered and retain every valid continuation",()=>{
 assert.deepEqual(originalPdfSourcePages(40,[41,40,0,NaN,41,-1,1.5]),[40,41]);
});
test("both card variants use original PDF with a plain, complete copyable fallback and no added bold or layout",()=>{
 const source="30.1.1 SF6.41A\nTETTING MED FERDIG PRODUKT\nKonstruksjon: Inntil 250 mm +\ntosidig puss\nAntall\nAndre krav:\na) Omfang og prisgrunnlag\nAlt inkludert.\nx) Mengderegler\nAvregnes etter medgåtte mengder";
 const row={source_page:9,source_excerpt:source,value_json:{postNumber:"30.1.1",sourceText:source,sourcePages:[9,10]}};
 const before=JSON.stringify(row);
 for(const informationOnly of [false,true]){
  const html=renderToStaticMarkup(createElement(ProjectPostSpecification,{id:"source",details:projectRequirementDetails(row),description:"TETTING",quantity:{quantity:2,unit:"st"},sourcePdfHref:"/api/projects/test/documents/pdf/file#page=9",informationOnly}));
  assert.match(html,/Original-PDF/);assert.match(html,/Visa sparad kravtext/);
  assert.ok(html.includes(source.replace("30.1.1 ","")));assert.equal(html.split("Avregnes etter medgåtte mengder").length-1,1);
  assert.doesNotMatch(html,/<strong|<b>|<table|<h4|2 st|font-bold|font-semibold/);
 }
 assert.equal(JSON.stringify(row),before);
});

test("a nearby site heading stays outside the cropped column header",()=>{
 const rows=[item("Sted: Testbygning",42,731.280041,9.960375),item("Postnr:",51.96,712.920044,9.960375,31.57),
  item("30.1.1",44,688,9.96),item("SF6.41A",103,688,9.96),item("Alle krav gjelder.",103,665),footer];
 const result=originalPdfPostRegions(rows,"30.1.1",false,842,0);
 assert.equal(result.wholePage,false);
 assert.ok(result.regions[0].top<728.29);
});
