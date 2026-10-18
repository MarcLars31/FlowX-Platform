import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { extractTechnicalDescriptionFromPages } from "./extractor";
import { pdfPostInventoryFromItems, textPostInventory } from "./post-inventory";
import { reconcileSourcePosts } from "./post-coverage";
import type { TechnicalDescriptionMaterialLine, TechnicalDescriptionPage, TechnicalDescriptionWarning } from "./types";
import { visibleProjectRequirements } from "@/lib/project-requirement-views";
import { projectRequirementDetails } from "@/lib/project-requirement-details";
import { ProjectPostSpecification } from "@/components/ProjectPostSpecification";
import { clientTechnicalDescriptionResult } from "@/lib/technical-description-client-result";

const page = (pageNumber: number, text: string): TechnicalDescriptionPage => ({pageNumber,text,method:"text",confidence:.98});
const item = (str: string, x: number, y: number, width = str.length * 5) => ({str,transform:[10,0,0,10,x,y],height:10,width});

test("every explicit post survives without an amount, NS code, long title or product classification", () => {
  const result = extractTechnicalDescriptionFromPages([page(1, [
    "Postnr: Beskrivelse Enh. Antall Pris Sum", "30.1.3 El.",
    "30.2 Generelle krav", "Alt skal være inkludert.", "30.2.1",
    "30.2.2 Ukjent krav", "Kravet gjelder også uten mengde.", "30.2.3 Ventil stk 0",
    "30.2.4 Ventil stk 2"
  ].join("\n"))]);
  assert.deepEqual(result.materialLines.map(line => line.postNumber), ["30.1.3","30.2","30.2.1","30.2.2","30.2.3","30.2.4"]);
  assert.equal(result.materialLines[0].quantity, undefined);
  assert.equal(result.materialLines[1].quantity, undefined);
  assert.ok(result.materialLines[2].reviewFlags.includes("empty-post-body"));
  assert.equal(result.materialLines[4].quantity, 0);
  assert.equal(result.materialLines[5].quantity, 2);
  assert.equal(visibleProjectRequirements(result.materialLines.map(line => ({id:line.id,value_json:line}))).length, 6);
  assert.deepEqual(result.postChecks?.[0].observedPostNumbers, result.materialLines.map(line => line.postNumber));
  assert.deepEqual(result.postChecks?.[0].unresolvedPostNumbers, []);
});

test("a negated demolition instruction is retained without being classified as removal", () => {
  const result = extractTechnicalDescriptionFromPages([page(1,"30.1.3 Eksisterende rør\nRørene skal ikke demonteres.")]);
  assert.equal(result.materialLines[0].operation, "unknown");
  assert.equal(result.materialLines[0].quantity, undefined);
});

test("physical post inventory ignores references, numeric subheadings and quantities in other columns", () => {
  const inventory = pdfPostInventoryFromItems([
    item("Postnr:",50,740,32), item("NS 3420 kode/Spesifikasjon",160,740),
    item("30.1.3",44,700), item("Bygningsmessige arbeider",100,700),
    item("Se post 99.99.99",100,680), item("33.332.7",44,640),
    item("1.1.1. ARMATURER",100,640), item("Antall",100,620), item("2",420,620),
    item("Sum denne side:",420,60)
  ])!;
  assert.equal(inventory.method,"column");
  assert.deepEqual(inventory.posts.map(post=>post.postNumber),["30.1.3","33.332.7"]);
  assert.match(inventory.posts[1].sourceText,/1\.1\.1\. ARMATURER/);
  assert.doesNotMatch(inventory.posts[0].sourceText,/ARMATURER/);
});

test("physical inventory joins post cells split inside a numeric segment and retains single-number headings", () => {
  const inventory = pdfPostInventoryFromItems([item("Postnr:",50,740,32),
    item("120000",44,710), item("Bygning",103,710),
    item("120000.3",44,680,50), item("0.310.1",44,669), item("Krav",103,680),
    item("120000.3",44,630,50), item("0.310.2",44,619), item("El.",103,630)
  ])!;
  assert.deepEqual(inventory.posts.map(post=>post.postNumber),["120000","120000.30.310.1","120000.30.310.2"]);
  assert.match(inventory.posts[1].sourceText,/Krav/);
  assert.doesNotMatch(inventory.posts[1].sourceText,/El\./);
});

test("an independently inventoried post omitted by the normal parser is recovered with source and visible review", () => {
  const input: TechnicalDescriptionPage = {...page(6,"Sprinkler report\nCalculation date\n30.1.3 Krav"),
    postInventory:{method:"column",posts:[{postNumber:"30.1.3",sourceText:"30.1.3\nBygningsmessige arbeider.\nAlt skal være inkludert."}]}};
  const result = extractTechnicalDescriptionFromPages([input]);
  assert.equal(result.materialLines.length,1);
  const line=result.materialLines[0];
  assert.equal(line.postNumber,"30.1.3");
  assert.equal(line.sourceText,input.postInventory!.posts[0].sourceText);
  assert.equal(line.quantity,undefined);
  assert.ok(line.reviewFlags.includes("recovered-source-post"));
  assert.deepEqual(result.postChecks?.[0].recoveredPostNumbers,["30.1.3"]);
  assert.deepEqual(result.postChecks?.[0].representedPostNumbers,["30.1.3"]);
  const details=projectRequirementDetails({id:line.id,value_json:line,value_text:line.description,source_excerpt:line.sourceText});
  const html=renderToStaticMarkup(createElement(ProjectPostSpecification,{id:line.id,description:line.description,details,quantity:{quantity:null,unit:"?"}}));
  assert.match(html,/Kontroller PDF-posten/);
  assert.match(html,/bevarats från PDF-källan/);
  assert.match(html,/Alt skal være inkludert/);
});

test("a number mentioned by another post or occurring on another page cannot satisfy source coverage", () => {
  const lines: TechnicalDescriptionMaterialLine[]=[{id:"1",postNumber:"30.1.1",description:"Krav",sourcePage:1,
    sourceText:"30.1.1 Se post 30.1.2",quantity:2,unit:"st",attributes:{},standardRefs:[],category:"other",operation:"install",confidence:.98,reviewFlags:[]}];
  const warnings: TechnicalDescriptionWarning[]=[];
  const checks=reconcileSourcePosts([
    {...page(1,""),postInventory:{method:"column",posts:[{postNumber:"30.1.2",sourceText:"30.1.2 Egen kravtext"}]}},
    {...page(2,""),postInventory:{method:"column",posts:[{postNumber:"30.1.1",sourceText:"30.1.1 Ett annat krav"}]}}
  ],lines,warnings);
  assert.equal(lines.length,3);
  assert.deepEqual(checks.map(check=>check.recoveredPostNumbers),[["30.1.2"],["30.1.1"]]);
  assert.ok(lines.slice(1).every(line=>line.quantity===undefined));
});

test("repeated post numbers with their own quantities remain separate and are marked for review", () => {
  const result=extractTechnicalDescriptionFromPages([
    page(1,"30.1.1 Ventil A stk 2\n30.1.1 Ventil B stk 5"),
    page(2,"30.1.1 Ventil C stk 7")
  ]);
  assert.deepEqual(result.materialLines.map(line=>line.quantity),[2,5,7]);
  assert.equal(new Set(result.materialLines.map(line=>line.id)).size,3);
  assert.ok(result.materialLines.every(line=>line.reviewFlags.includes("duplicate-post-number")));
  assert.deepEqual(result.postChecks?.map(check=>check.representedPostNumbers),[["30.1.1","30.1.1"],["30.1.1"]]);
});

test("a repeated label on a true page continuation is covered on both pages without duplicating the post", () => {
  const result=extractTechnicalDescriptionFromPages([
    page(1,"Postnr: Beskrivelse\n30.1.1 UC1.1\nVENTIL\nMateriale: Messing\nSum:"),
    page(2,"Postnr: Beskrivelse\n30.1.1\nAntall stk 2\nAndre krav: Alle deler inngår.")
  ]);
  assert.equal(result.materialLines.length,1);
  assert.equal(result.materialLines[0].quantity,2);
  assert.deepEqual(result.materialLines[0].sourcePages,[1,2]);
  assert.deepEqual(result.postChecks?.map(check=>check.representedPostNumbers),[["30.1.1"],["30.1.1"]]);
});

test("text/OCR inventories retain genuine posts but do not claim verification of unreadable content", () => {
  assert.deepEqual(textPostInventory("33.332.7\n1.1.1. ARMATURER\nSe post\n44.44.44\n21.04.2026").posts.map(p=>p.postNumber),["33.332.7"]);
  const result=extractTechnicalDescriptionFromPages([{...page(1,"30.1.3 El."),method:"ocr",confidence:.5,status:"partial"}]);
  assert.equal(result.materialLines.length,1);
  assert.equal(result.postChecks?.[0].status,"requires_review");
  assert.ok(result.warnings.some(w=>w.code==="POST_INVENTORY_UNVERIFIED"));
  const summary=clientTechnicalDescriptionResult(result,{summaryOnly:true});
  assert.equal(summary.warningSummary.observedPostCount,1);
  assert.equal(summary.warningSummary.representedPostCount,1);
  assert.equal(summary.warningSummary.postPageCount,1);
  assert.equal(summary.postChecks,undefined);
});

test("real PDF extraction inventories a generic post column without Sted or quantities", async () => {
  const { PDFDocument, StandardFonts } = await import("pdf-lib");
  const { extractTechnicalDescriptionPages } = await import("./pdf");
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const sheet = pdf.addPage([595,842]);
  for (const cell of [item("Postnr:",50,740,32), item("NS 3420 kode/Spesifikasjon",160,740),
    item("30.1.3",44,700),item("Bygningsmessige arbeider.",100,700),
    item("Alle arbeider skal vaere inkludert i tilbudet.",100,680),
    item("33.332.7",44,620),item("1.1.1. ARMATURER",100,620),
    item("Det skal medtas soneventiler for hver etasje.",100,600),item("Sum denne side:",420,60)]) {
    sheet.drawText(cell.str,{font,size:10,x:cell.transform[4],y:cell.transform[5]});
  }
  const pages=await extractTechnicalDescriptionPages(await pdf.save());
  assert.equal(pages[0].postTable,undefined);
  assert.deepEqual(pages[0].postInventory?.posts.map(post=>post.postNumber),["30.1.3","33.332.7"]);
  const result=extractTechnicalDescriptionFromPages(pages);
  assert.deepEqual(result.materialLines.map(line=>line.postNumber),["30.1.3","33.332.7"]);
  assert.equal(result.postChecks?.[0].status,"checked");
  assert.deepEqual(result.postChecks?.[0].unresolvedPostNumbers,[]);
  assert.ok(result.materialLines.every(line=>line.quantity===undefined));
});

test("OCR replacement cannot discard an independently readable digital post number", async () => {
  const {mergeClientOcrPages}=await import("@/lib/technical-description-ocr-payload");
  const pages=mergeClientOcrPages([{...page(1,"30.1.3"),status:"partial",
    postInventory:{method:"column",posts:[{postNumber:"30.1.3",sourceText:"30.1.3 El."}]}}],
    [{pageNumber:1,text:"30.1.4 Neste post\n"+"Andre krav gjelder ogsa. ".repeat(5),confidence:.9}]);
  const result=extractTechnicalDescriptionFromPages(pages);
  assert.deepEqual(result.materialLines.map(line=>line.postNumber),["30.1.3","30.1.4"]);
  assert.ok(result.materialLines.find(line=>line.postNumber==="30.1.3")?.reviewFlags.includes("merged-source-text"));
  assert.equal(result.postChecks?.[0].status,"requires_review");
});
