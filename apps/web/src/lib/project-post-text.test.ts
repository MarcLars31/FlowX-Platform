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

test("one card retains complete source tables and numbered headings", () => {
  const row = requirementSnapshot(withEffectiveRequirements(requirementSnapshot(savedRow())));
  {
    const html = renderToStaticMarkup(createElement(ProjectPostSpecification, {
      id: row.id, description: row.value_text, details: projectRequirementDetails(row), quantity: { quantity: null, unit: "?" }
    }));
    assert.match(html, /30\.0 OMFANG/);
    assert.doesNotMatch(html, /<h4|<table|<strong|font-semibold/);
    assert.match(html, /Romnavn Romnummer LAeq LAF,max/);
    assert.equal((html.match(/Tabell [1-5] Krav/g) ?? []).length, 5);
    assert.ok(html.indexOf("NS8175:2012") < html.indexOf("Tabell 1:"));
    assert.ok(html.indexOf("Tabell 5 Krav") < html.indexOf("30.6.1 VIBRASJONER"));
    assert.equal((html.match(/Adkomst platform/g) ?? []).length, 1);
    assert.doesNotMatch(html, /Flattened legacy|Legacy field|UNDERPOST/);
  }
});

test("SF6.41A information posts keep separate PDF fields, wrapped values and every lettered clause", () => {
  const source = `120000.25.242.8 SF6.41A
TETTING MED FERDIG PRODUKT
Produkt: Brannekspanderende tetting
Lokalisering: Se modell
Konstruksjon: Utsparinger i lettklinker inntil 250 mm +
tosidig puss
Funksjonskrav: Branntetting, EI 60 A2-s1,d0
Type gjennomføring: Se i modell
Utsparingsmål: Se underposter
Produktmål: Valgfritt
Utførelsesmetode: Valgfritt
Fyllingsgrad: Valgfritt
Andre krav:
a) Omfang og prisgrunnlag
Posten omfatter også krav gitt i Postnr. 100.27.200.1.
x) Mengderegler
Avregnes etter medgåtte mengder`;
  const raw = { id: "field-post", source_page: 16, source_excerpt: source, value_text: "TETTING MED FERDIG PRODUKT", value_json: {
    postNumber: "120000.25.242.8", nsCode: "SF6.41A", chapterInformation: false, reviewFlags: ["project-information", "unknown-category"],
    sourceText: source, technicalSpecification: source, attributes: { konstruksjon: "Utsparinger i lettklinker inntil 250 mm + tosidig puss" }
  } };
  const row = requirementSnapshot(withEffectiveRequirements(requirementSnapshot(raw)));
  const details = projectRequirementDetails(row);
  const own = projectRequirementSourceSections(details.sourceExcerpt ?? "", details.postNumber).find(section => section.relation === "current");
  const fields = own!.text.split("\n").filter(line => /^[^:]+: .+/.test(line));
  {
    const html = renderToStaticMarkup(createElement(ProjectPostSpecification, {
      id: raw.id, description: raw.value_text, details, quantity: { quantity: null, unit: "?" }
    }));
    assert.match(html, /Produkt: Brannekspanderende tetting\nLokalisering: Se modell/);
    assert.match(html, /<pre[^>]*whitespace-pre-wrap/);
    assert.match(html, /Konstruksjon: Utsparinger i lettklinker inntil 250 mm \+\ntosidig puss/);
    for (const text of ["SF6.41A", "TETTING MED FERDIG PRODUKT", ...fields, "Andre krav:", "a) Omfang og prisgrunnlag", "Posten omfatter også krav gitt i Postnr. 100.27.200.1.", "x) Mengderegler", "Avregnes etter medgåtte mengder"]) {
      assert.equal(html.split(text).length - 1, 1, `Rendered once: ${text}`);
    }
    assert.ok(html.indexOf("Fyllingsgrad:") < html.indexOf("Andre krav:"));
    assert.ok(html.indexOf("Omfang og prisgrunnlag") < html.indexOf("Posten omfatter"));
    assert.ok(html.indexOf("Posten omfatter") < html.indexOf("x) Mengderegler"));
  }
});
