import assert from "node:assert/strict";
import test from "node:test";
import { mergePdfSourceText } from "./pdf-source-text-merge";
import { mergeClientOcrPages } from "./technical-description-ocr-payload";
import { refreshImportedReviewFlags } from "./technical-description-review-flags";
import { extractTechnicalDescriptionFromPages } from "../modules/technical-description-extractor/extractor";
import { sitePostTableFromPdfItems } from "../modules/technical-description-extractor/pdf-post-table";
import { productPostNavigationGroups } from "./product-post-tree";
import { groupProjectRequirementViews, visibleProjectRequirements } from "./project-requirement-views";
import type { TechnicalDescriptionPage } from "../modules/technical-description-extractor/types";

const page = (pageNumber: number, text: string): TechnicalDescriptionPage => ({pageNumber,text,method:"text",confidence:.98});
test("OCR preserves a digital material requirement and both conflicting values without guessing", () => {
  const digital = "30.1.3\nUC1.1\nVENTIL\nMateriale: Kobber\nTrykk: 12 bar\nAndre krav: Komplett levering.";
  const ocr = "30.1.3\nUC1.1\nVENTIL\nTrykk: 16 bar\nAndre krav: Komplett levering.\nLeveres med brakett.";
  const pages = mergeClientOcrPages([{...page(1,digital),ocrReason:"image-body",postInventory:{method:"column",posts:[{postNumber:"30.1.3",sourceText:digital}]}}],
    [{pageNumber:1,text:ocr,confidence:.9}]);
  const result = extractTechnicalDescriptionFromPages(pages), line = result.materialLines.find(line=>line.postNumber==="30.1.3")!;
  for (const text of ["Materiale: Kobber","12 bar","16 bar","Leveres med brakett"]) assert.ok(line.sourceText.includes(text));
  assert.ok(line.reviewFlags.includes("merged-source-text"));
  assert.deepEqual(pages[0].sourceReadings,{digital,ocr});
});

test("source merge preserves each reading's line occurrences and order", () => {
  const originals = ["A\nX\nA\nKrav: 12 bar", "A\nY\nA\nKrav: 16 bar"];
  const merged = mergePdfSourceText(...originals as [string,string]).text.split("\n");
  for (const source of originals) { let cursor=-1; for (const line of source.split("\n")) { cursor=merged.indexOf(line,cursor+1);assert.ok(cursor>=0); } }
});

test("separate unquantified posts on adjacent pages never overwrite each other's location", () => {
  const result=extractTechnicalDescriptionFromPages([page(1,"30.1.3 Ventil i rom A\nLokalisering: Rom A"),page(2,"30.1.3 Ventil i rom B\nLokalisering: Rom B")]);
  assert.equal(result.materialLines.length,2);
  assert.deepEqual(result.materialLines.map(line=>line.attributes.lokalisering),["Rom A","Rom B"]);
  assert.ok(result.materialLines.every(line=>line.reviewFlags.includes("duplicate-post-number")));
});

test("a repeated number and a changed own field are not evidence of a continuation", () => {
  const result=extractTechnicalDescriptionFromPages([page(1,"30.1.3 Ventil\nLokalisering: Rom A"),page(2,"30.1.3\nLokalisering: Rom B")]);
  assert.equal(result.materialLines.length,2);
});

test("Antall and Antal use the verified amount column without touching equal description quantities", () => {
  const item=(str:string,x:number,y:number,width=str.length*5)=>({str,transform:[10,0,0,10,x,y],height:10,width});
  for (const label of ["Antall","Antal","Mengde"]) {
    const table=sitePostTableFromPdfItems([item("Sted: 1201 Test",42,735),item("Postnr:",49,713,32),item("Beskrivelse",198,713),
      item("Enh.",362,713,20),item(label,395,713,36),item("Pris",457,713),item("Sum",521,713),
      item("1201.30.1",44,680),item("Ventil",97,680),item("Antall st 5 for reservedeler",97,660),item("stk",365,680),item("2",420,680)])!;
    assert.equal(table.quantityColumnsVerified,true);assert.equal(table.posts[0].quantity?.quantity,2);
    assert.match(table.text,/Antall st 5 for reservedeler/);
  }
});

test("ordinary view information never uses a demolition bucket", () => {
  const rows=[{id:"requirements",value_json:{reviewFlags:["project-information"]}},{id:"valve",value_json:{quantity:2,unit:"st"}}];
  const groups=groupProjectRequirementViews(rows);
  assert.equal("removal" in groups,false);assert.deepEqual(groups.information,[rows[0]]);
  assert.deepEqual(visibleProjectRequirements(rows),[rows[1]]);
});

test("extraction and navigation preserve a non-numeric source order", () => {
  const result=extractTechnicalDescriptionFromPages([page(1,"30.1.5 Ventil A\n30.1.2 Ventil B")]);
  assert.deepEqual(result.materialLines.map(line=>line.postNumber),["30.1.5","30.1.2"]);
  const rows=result.materialLines.map(line=>({id:line.id,source_page:line.sourcePage,value_json:line}));
  assert.deepEqual(productPostNavigationGroups(rows).flatMap(group=>group.requirements.map(row=>row.id)),rows.map(row=>row.id));
});

test("unplaced OCR table text stays visible and is not assigned a guessed post number", () => {
  const result=extractTechnicalDescriptionFromPages([{...page(3,"Ansvarsmatrise\nGEN AFS FOB\nTransport og montasje skal inngå.\nx) Mengderegler\nDenne post skal ikke prises."),method:"ocr"}]);
  const text=result.materialLines.map(line=>line.sourceText).join("\n");
  assert.match(text,/Transport og montasje/);assert.match(text,/Denne post skal ikke prises/);
  assert.ok(result.materialLines.some(line=>!line.postNumber&&line.reviewFlags.includes("unassigned-source-text")));
});

test("new import warnings preserve raw stored edits and retry a concurrent correction", async () => {
  let stored: Record<string,unknown>={reviewFlags:["manual-warning"],quantity:7,sourceText:"User correction",textStorage:{version:1,references:{technicalSpecification:"source_excerpt"}}};
  let revision=1, writes=0;
  const db={
    async selectUserRows<T>() { return [{id:"saved",updated_at:String(revision),stored_value:structuredClone(stored)}] as T[]; },
    async updateUserRowsReturning<T>(_table:string,filters:Record<string,string>,changes:Record<string,unknown>) {
      assert.equal(filters.updated_at,`eq.${revision}`);
      if (++writes===1) { stored={...stored,quantity:9};revision++;throw new Error("Supabase update of project_requirements returned no row."); }
      stored=changes.value_json as Record<string,unknown>;return {id:"saved"} as T;
    }
  };
  await refreshImportedReviewFlags("project_requirements",{project_id:"eq.project"},[{id:"saved",value_json:{reviewFlags:["unverified-post-source","project-information"]}}],
    [{id:"saved",source_review_flags:["manual-warning"]}],db);
  assert.equal(stored.quantity,9);assert.equal(stored.sourceText,"User correction");assert.ok(stored.textStorage);
  assert.deepEqual(stored.reviewFlags,["manual-warning","unverified-post-source"]);assert.equal(writes,2);
});

test("digital-only continuation before the first numbered OCR post survives", () => {
  const own="30.1.3\nUC1.1\nVENTIL";
  const pages=mergeClientOcrPages([{...page(2,`Materiale: Kobber\n${own}`),postInventory:{method:"column",posts:[{postNumber:"30.1.3",sourceText:own}]}}],
    [{pageNumber:2,text:own,confidence:.9}]);
  assert.match(pages[0].text,/Materiale: Kobber/);
});

test("raised cubic exponent stays with the unit and never becomes an amount", () => {
  const item=(str:string,x:number,y:number,height=10,width=str.length*5)=>({str,transform:[height,0,0,height,x,y],height,width});
  const table=sitePostTableFromPdfItems([item("Sted: 700 Test",42,735),item("Postnr:",49,713,10,32),item("Beskrivelse",198,713),
    item("Enh.",362,713,10,20),item("Mengde",395,713,10,36),item("Pris",457,713),item("Sum",521,713),
    item("700.30.1",44,680),item("Volum",97,660),item("m",365,660),item("3",371,665,6),item("10,0",415,660)])!;
  assert.equal(table.posts[0].quantity?.quantity,10);assert.equal(table.posts[0].quantity?.unit,"m3");
});

test("a publisher header cannot truncate a real page continuation", () => {
 const result=extractTechnicalDescriptionFromPages([
  page(100,"36.362 Kanalnett\nKanaler for inntak og avkast utformes slik at fukt og\nSum denne side:\nKapittel: 36 Luftbehandling"),
  page(101,"Helse Sørøst 21.04.2026\nProsjekt: Diakonhjemmet Side 36-18\nKapittel: 36 Luftbehandling\nPostnr: NS 3420 kode/Spesifikasjon Enh. Mengde Pris Sum\nkondens lar seg drenere bort til avløp. Luftinntak,\nluftinntaksrister skal være utformet slik at risiko for\nsnøinndrev og gjenfrysing elimineres.\n36.362.2 VV1.113\nREKTANGULÆR VENTILASJONSKANAL\nLengde m 80")]);
 const previous=result.materialLines.find(line=>line.postNumber==="36.362")!;
 assert.match(previous.sourceText,/snøinndrev og gjenfrysing elimineres/);
 assert.ok(!previous.sourceText.includes("Helse Sørøst"));
});
