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

test("unclassified legacy cells remain in own, inherited, uncertain and reimport source text", () => {
  const source = "Areal m 2 2300,00 0,00 0,00\n\n22.25.2 TH2.121\nHALVHARDT BELEGG PÅ GULV\nAreal m2 2300,00 0,00 0,00";
  const details = {
    ...projectRequirementDetails({ value_json: { postNumber: "22.25.2",
      technicalSpecification: "22.25.2 TH2.121\nHALVHARDT BELEGG PÅ GULV\nAreal m 2 2300,00 0,00 0,00" } }),
    inheritedSpecification: "22.25 GULV\nAreal m2 2300,00 0,00 0,00",
    sourceUnassignedReadings: [source],
    sourceReimportReadings: [source],
  };
  const before = structuredClone(details);
  const html = renderToStaticMarkup(createElement(ProjectPostSpecification, {
    id: "area", details, description: "HALVHARDT BELEGG PÅ GULV",
    quantity: { quantity: 2300, unit: "m2" },
  }));
  assert.equal(html.split("Areal m² 2300,00").length - 1, 6);
  assert.match(html, /0,00 0,00/);
  assert.match(html, /TH2\.121/);
  assert.match(html, /HALVHARDT BELEGG PÅ GULV/);
  assert.match(html, /Felles krav/);
  assert.match(html, /Kildetekst med usikker postgrense/);
  assert.match(html, /Ny PDF-läsning att granska/);
  assert.deepEqual(details, before);
});

test("the full floor specification is visible at the top while the selected post keeps only its own summary below", () => {
  const text = "TH2.121\nHALVHARDT BELEGG PÅ GULV\nAreal m 2 2300,00 0,00 0,00\nMateriale: Vinyl på rull\nLeggemåte: Hellimt\nLokalisering: iht. rombehandlingsplan\nType belegg: Halvhardt belegg fra anerkjent leverandør,\nGerflor Premium Comfort 8226 Indiana Fidji, 17 dB\nUndergulv: avrettet gulv\nEmisjonskrav til belegget: iht. Svanemerking\nEgenskaper ved brannpåvirkning: iht. branntekniske\nrapport\nAndre krav: Nei";
  const details = projectRequirementDetails({ value_json: { postNumber: "22.25.2",
    nsCode: "TH2.121", technicalSpecification: `22.25.2 ${text}`, quantity: 2300, unit: "m2" } });
  const before = structuredClone(details);
  const props = { id: "area", details, description: "HALVHARDT BELEGG PÅ GULV",
    quantity: { quantity: 2300, unit: "m2" }, currentPostIsHeading: true };
  const heading = renderToStaticMarkup(createElement(ProjectPostSpecification, { ...props, section: "heading" }));
  const detail = renderToStaticMarkup(createElement(ProjectPostSpecification, { ...props, section: "detail" }));
  assert.match(heading, /TH2\.121\nHALVHARDT BELEGG PÅ GULV\nAreal m² 2300,00/);
  for (const clause of ["Materiale: Vinyl på rull", "Leggemåte: Hellimt", "17 dB",
    "Undergulv: avrettet gulv", "iht. Svanemerking", "iht. branntekniske\nrapport", "Andre krav: Nei"]) {
    assert.ok(heading.includes(clause));
    assert.ok(!detail.includes(clause));
  }
  assert.doesNotMatch(heading, /<details/);
  assert.match(heading, /0,00 0,00/);
  assert.match(detail, /Antall: 2300/);
  assert.deepEqual(details, before);
});

test("switching an underpost leaves the common heading above its individual specification and quantity", () => {
  const parent = "22.25.2 TH2.121\nHALVHARDT BELEGG PÅ GULV\nMateriale: Vinyl på rull\nLeggemåte: Hellimt";
  const headings: string[] = [];
  for (const suffix of [1, 2]) {
    const row = { value_json: { postNumber: `22.25.2.${suffix}`, parentPostNumber: "22.25.2",
      technicalSpecification: `${parent}\nUNDERPOST\n22.25.2.${suffix} Rom ${suffix}\nAreal m2 ${suffix}00,00 0,00 0,00` } };
    const details = projectRequirementDetails(row);
    const props = { id: "child", details, description: `Rom ${suffix}`, quantity: { quantity: suffix * 100, unit: "m2" } };
    const heading = renderToStaticMarkup(createElement(ProjectPostSpecification, { ...props, section: "heading" }));
    const detail = renderToStaticMarkup(createElement(ProjectPostSpecification, { ...props, section: "detail" }));
    assert.match(heading, /Fra post 22\.25\.2/);
    assert.match(heading, /Materiale: Vinyl på rull\nLeggemåte: Hellimt/);
    assert.doesNotMatch(heading, /<details|Rom [12]/);
    assert.ok(detail.includes(`Areal m² ${suffix}00,00`));
    assert.doesNotMatch(detail, /Materiale:|Leggemåte:/);
    assert.match(detail, /0,00 0,00/);
    headings.push(heading);
  }
  assert.equal(headings[0], headings[1]);
});
