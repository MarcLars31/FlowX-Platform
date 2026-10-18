import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ProjectPostSpecification } from "../components/ProjectPostSpecification";
import { projectRequirementDetails } from "./project-requirement-details";
import { currentPostRequirement } from "./current-post-requirement";
import { requirementSnapshot } from "./requirement-snapshot";
import { withEffectiveRequirements } from "./effective-requirements";

function card(row: Record<string, unknown>) {
  return renderToStaticMarkup(createElement(ProjectPostSpecification, {
    id: "test", details: projectRequirementDetails(row), description: String(row.value_text ?? "Ventil"),
    quantity: { quantity: 2, unit: "stk" }, sourcePdfHref: "/original.pdf#page=9", sourcePdfFileName: "Beskrivelse.pdf"
  }));
}
test("source PDF is a separate link; neighbors and common requirements never enter the product body", () => {
  const source = "33.1 Felles montasjekrav\nAlle festedeler inngår.\nUNDERPOST\n33.1.1 VENTIL\nLokalisering: Rom 2\nSe post 33.1.2 for tilkobling.";
  const row = { source_page: 9, value_json: { postNumber: "33.1.1", technicalSpecification: source } };
  const before = structuredClone(row), html = card(row);
  const body = html.match(/aria-label="Produktpost"[^>]*>([\s\S]*?)<\/div>/)![1];
  assert.match(body, /VENTIL\nLokalisering: Rom 2\nSe post 33.1.2 for tilkobling/);
  assert.doesNotMatch(body, /Felles montasjekrav|Alle festedeler|UNDERPOST/);
  assert.match(html, /<details aria-label="Felles krav"/);
  assert.match(html, /Alle festedeler inngår/);
  assert.match(html, /href="\/original.pdf#page=9"[^>]*>Vis original-PDF/);
  assert.doesNotMatch(html, /<canvas|<iframe|<object|<img|<details[^>]*open|Hele original/);
  assert.deepEqual(row, before);
});
test("an uncertain OCR identity retains all clauses through repeated API projections, outside the own body", () => {
  const source = "700.30.731| FH2.2231A\n1.12 PIGGING AV BERG - VOLUM\nAndre krav:\na) Omfang\nUtføres etter avtale.\nc) Utførelse\nGrenseverdier\nVA-ledning 20 10\nd) Toleranser\nKrav til bergoverflate.";
  const original = { source_page: 750, source_excerpt: source, value_text: "PIGGING AV BERG", value_json: {
    postNumber: "700.30.731.1.12", technicalSpecification: "700.30 VVS-installasjoner\nUNDERPOST\n" + source,
    pdfColumnValues: { unit: "m³", quantity: "10,0" }, reviewFlags: ["ocr-source"]
  } };
  const before = structuredClone(original);
  let row: Record<string, unknown> = requirementSnapshot(original);
  for (let i = 0; i < 3; i++) row = requirementSnapshot(withEffectiveRequirements(currentPostRequirement(row)));
  const details = projectRequirementDetails(row), html = card(row);
  assert.deepEqual(details.sourceUnassignedReadings, [source]);
  assert.match(html, /Postgrensen er usikker/);
  assert.match(html, /Kildetekst med usikker postgrense/);
  assert.equal(html.split("Krav til bergoverflate.").length - 1, 1);
  assert.match(html, /VA-ledning 20 10/);
  assert.match(html, /Enh\.: m³/);
  assert.doesNotMatch(html.match(/aria-label="Produktpost"[^>]*>([\s\S]*?)<\/div>/)![1], /700\.30\.731\|/);
  assert.deepEqual(original, before);
});
test("legacy amount remains once and equal amounts in prose are never removed", () => {
  const html = card({ value_json: { postNumber: "33.1.1", technicalSpecification: "33.1.1 VENTIL\nAntall stk 2 0,00 0,00\nDet skal følge med 2 stk skruer.\nAndre krav:\nAlle deler inngår." } });
  assert.equal(html.split("Antall stk 2").length - 1, 1);
  assert.doesNotMatch(html, /Antall: 2/);
  assert.match(html, /Det skal følge med 2 stk skruer/);
  assert.match(html, /Alle deler inngår/);
});
test("unrecognized section identities stay separate and marked, with no discarded source blocks", () => {
  const details = projectRequirementDetails({ value_json: { postNumber: "33.1.1", pdfDescriptionText: "33.1.1 VENTIL\nUNDERPOST\n33.1.2 PUMPE\nDokumentasjon kreves." } });
  const html = renderToStaticMarkup(createElement(ProjectPostSpecification, {id:"test",details,description:"Ventil",quantity:{quantity:2,unit:"stk"}}));
  assert.doesNotMatch(html.match(/aria-label="Produktpost"[^>]*>([\s\S]*?)<\/div>/)![1], /PUMPE|33\.1\.2/);
  assert.match(html, /Kildetekst med usikker postgrense/);
  assert.match(html, /Dokumentasjon kreves/);
});
