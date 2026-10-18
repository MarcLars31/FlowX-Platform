import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ProjectPostSpecification } from "../components/ProjectPostSpecification";
import { currentPostRequirement } from "./current-post-requirement";
import { withEffectiveRequirements } from "./effective-requirements";
import { requirementSnapshot } from "./requirement-snapshot";
import { projectRequirementDetails } from "./project-requirement-details";
import { projectRequirementSourceSections } from "./project-requirement-source";
import { projectInformationBlocks } from "./project-information-layout";

const source = `100.30.300.1 30 VVS-INSTALLASJONER STASJON
30.0 OMFANG
Installasjoner er beskrevet i følgende poster:
• sanitærinstallasjoner,
• varmeinstallasjoner.
30.6 LYDKRAV
Kravene

FORTSETTELSE SIDE 4
er basert på NS8175:2012 klasse C.
Tabell 1: Angir krav til støy innendørs.
Tabell 2: Angir krav til sikkerhetsventilasjon.
Tabell 3: Angir krav til lydkilder.
Tabell 4: Angir krav for basen.
Tabell 5: Angir krav til sikkerhetsventilasjon for basen.
Tabell 1 Krav til høyeste støynivå fra tekniske installasjoner.
Romnavn Romnummer LAeq LAF,max
Adkomst platform BP.01 38 40

FORTSETTELSE SIDE 5
Røykventrom BU1.10 75 77
(gjelder ikke ved
drift av røykvifter)
Tabell 2 Krav til støynivå fra sikkerhetsventilasjon.
Romnavn Romnummer LAF,max
Ventesone BP.02 67

FORTSETTELSE SIDE 6
Øvrige rømningsveier 83
Tabell 3 Krav til lydeffektnivå for spesifikke kilder.
Lydkilde (ventil, rist, o.l.) L wA
Utendørs
Inngang A - Inntak AHU 01 60
Innendørs
Avkast AHU 01 57
Tabell 4 Krav til høyeste støynivå fra tekniske installasjoner.
Romnavn Romnummer LAeq LAF,max
Driftsbase L3S.06 45 47
sporvedlikehold

FORTSETTELSE SIDE 7
Operativt M3T2.01 33 35
driftslederkontor

FORTSETTELSE SIDE 8
VVS sjakt Flere 75 77
Tabell 5 Krav til lydeffektnivå for spesifikke kilder.
Lydkilde (ventil, rist, o.l.) L wA
Inntak/avkast 50
30.6.1 VIBRASJONER OG STRUKTURLYD
Utstyret skal vibrasjonsisoleres.`;

function savedRow() {
  return { id: "post", source_page: 1, source_excerpt: source, value_text: "30 VVS-INSTALLASJONER STASJON", value_json: {
    postNumber: "100.30.300.1", chapterInformation: true,
    textStorage: { version: 1, references: { sourceText: "source_excerpt" } },
    technicalSpecification: "100.30 Tekniske bestemmelser\n\nUNDERPOST\n100.30.300 VVS-installasjoner\n\nUNDERPOST\n" + source,
    attributes: { "tabell 5": "Flattened legacy table attribute must not replace the source", "er basert på ns8175": "Legacy field must not move prose to the end" }
  } };
}

test("the saved post keeps all own sections through the exact detail API projection", () => {
  const raw = savedRow();
  const before = JSON.stringify(raw);
  const response = requirementSnapshot(withEffectiveRequirements(requirementSnapshot(raw)));
  const current = currentPostRequirement(response);
  assert.equal(current.source_excerpt, source);
  assert.equal(currentPostRequirement(current).source_excerpt, source);
  assert.equal(projectRequirementDetails(response).sourceExcerpt, source);
  const sections = projectRequirementSourceSections(source, raw.value_json.postNumber);
  assert.equal(sections[0].relation, "current");
  assert.ok(sections[0].text.startsWith("30 VVS-INSTALLASJONER STASJON\n30.0 OMFANG"));
  assert.equal(JSON.stringify(raw), before);
});

test("a stored exact identity preserves an internal numbered heading and excludes another post", () => {
  const own = "33.332.7\n1.1.1. ARMATURER\nDet skal medtas soneventiler.";
  assert.equal(projectRequirementSourceSections(own, "33.332.7")[0].text, "1.1.1. ARMATURER\nDet skal medtas soneventiler.");
  const child = currentPostRequirement({ source_excerpt: "", value_json: { postNumber: "33.1.2", technicalSpecification: "33.1.1 VENTIL\nTrykk: PN16" } });
  assert.equal(child.source_excerpt, "");
});

test("tables retain captions, empty room cells, numeric columns, wrapped rows and continuation pages", () => {
  const blocks = projectInformationBlocks(source);
  const tables = blocks.filter(b => b.kind === "table");
  assert.deepEqual(tables.filter(t => t.caption).map(t => t.caption.match(/^Tabell \d/)?.[0]), ["Tabell 1", "Tabell 2", "Tabell 3", "Tabell 4", "Tabell 5"]);
  assert.deepEqual(tables[0].columns, ["Romnavn", "Romnummer", "LAeq", "LAF,max"]);
  const rows = tables.flatMap(t => t.rows.map(r => r.cells));
  assert.ok(rows.some(r => JSON.stringify(r) === JSON.stringify(["Adkomst platform", "BP.01", "38", "40"])));
  assert.ok(rows.some(r => JSON.stringify(r) === JSON.stringify(["Øvrige rømningsveier", "", "83"])));
  assert.ok(rows.some(r => JSON.stringify(r) === JSON.stringify(["Inngang A - Inntak AHU 01", "60"])));
  assert.ok(rows.some(r => JSON.stringify(r) === JSON.stringify(["sporvedlikehold", "", "", ""])));
  assert.ok(rows.some(r => r[0] === "drift av røykvifter)"));
  assert.equal(blocks.at(-2)?.kind, "heading");
  assert.deepEqual(blocks.at(-1), { kind: "text", text: "Utstyret skal vibrasjonsisoleres." });
});

test("both card variants render the source once in PDF order, including the opening chapters", () => {
  const row = requirementSnapshot(withEffectiveRequirements(requirementSnapshot(savedRow())));
  for (const informationOnly of [false, true]) {
    const html = renderToStaticMarkup(createElement(ProjectPostSpecification, {
      id: row.id, description: row.value_text, details: projectRequirementDetails(row), quantity: { quantity: null, unit: "?" }, informationOnly
    }));
    assert.match(html, /<h4[^>]*>30\.0 OMFANG<\/h4>/);
    assert.match(html, /<th[^>]*scope="col"[^>]*>Romnummer<\/th>/);
    assert.equal((html.match(/<caption /g) ?? []).length, 5);
    assert.ok(html.indexOf("NS8175:2012") < html.indexOf("Tabell 1:"));
    assert.ok(html.indexOf("Tabell 5 Krav") < html.indexOf("30.6.1 VIBRASJONER"));
    assert.equal((html.match(/Adkomst platform/g) ?? []).length, 1);
    assert.doesNotMatch(html, /Flattened legacy|Legacy field|UNDERPOST|Tekniske bestemmelser/);
  }
});

test("unrecognized tables retain their text and are never assigned guessed columns", () => {
  const blocks = projectInformationBlocks("Tabell 1: Se vedlegg.\nUkjent kolonneformat\nData 10 20\n30.6 LYDKRAV\nAlle krav gjelder.");
  assert.equal(blocks.some(b => b.kind === "table"), false);
  assert.ok(blocks.some(b => b.kind === "text" && b.text.includes("Data 10 20")));
  assert.ok(blocks.some(b => b.kind === "heading" && b.text === "30.6 LYDKRAV"));
});
