import assert from "node:assert/strict";
import test from "node:test";
import { structuredPostBlocks } from "./structured-post-layout";
import { projectRequirementDetails } from "./project-requirement-details";

test("selected post keeps PDF field order, wrapped prose and lettered requirements", () => {
  const details = projectRequirementDetails({ value_json: {
    postNumber: "33.332.4.3", nsCode: "UE2.11111512", attributes: { trykk: "PN16", materiale: "Messing" },
    technicalSpecification: "33.332.4.3 UE2.11111512\nSPRINKLER\nAntall stk 5\nMateriale: Messing\nLokalisering: I underetasje\ni Kulturhuset.\nTrykk: PN16\nAndre krav:\na) Omfang og prisgrunnlag\nAlle deler inngår.\nb) Materialer\n- Festedeler\n- Dekkskive"
  } });
  assert.deepEqual(structuredPostBlocks(details, "SPRINKLER"), [
    { kind: "quantity", text: "Antall stk 5" },
    { kind: "field", label: "Materiale", text: "Messing" },
    { kind: "field", label: "Lokalisering", text: "I underetasje i Kulturhuset." },
    { kind: "field", label: "Trykk", text: "PN16" },
    { kind: "field", label: "Andre krav", text: "" },
    { kind: "heading", text: "a) Omfang og prisgrunnlag" },
    { kind: "text", text: "Alle deler inngår." },
    { kind: "heading", text: "b) Materialer" },
    { kind: "bullet", text: "- Festedeler" },
    { kind: "bullet", text: "- Dekkskive" }
  ]);
});

test("keeps free product prose and quantity after a list in PDF order", () => {
  const details = projectRequirementDetails({ source_excerpt: "VEGGSKAP\nLeveres og monteres for\noppbevaring av reservedeler.\n\nSkal inneholde:\n- 2 stk reservehoder\n- 1 monteringsnøkkel\nAntall stk 2" });
  const blocks = structuredPostBlocks(details, "VEGGSKAP");
  assert.deepEqual(blocks[0], { kind: "text", text: "Leveres og monteres for oppbevaring av reservedeler." });
  assert.deepEqual(blocks.at(-1), { kind: "quantity", text: "Antall stk 2" });
  assert.equal(blocks.filter(block => block.kind === "bullet").length, 2);
});

test("retains own requirements and page continuations without inherited prose", () => {
  const details = projectRequirementDetails({ value_json: { postNumber: "33.1.1", technicalSpecification: "33.1 RØR\nDimensjon: Se under\nAndre krav:\na) Omfang\nAlle deler inngår.\n\nUNDERPOST\n33.1.1\nDimensjon: DN25\nLengde m 12\n\nFORTSETTELSE SIDE 2\nc) Utførelse\nFestes i tak." } });
  const blocks = structuredPostBlocks(details, "RØR");
  assert.deepEqual(blocks.filter(block => block.kind === "field" && block.label === "Dimensjon").map(block => block.text), ["DN25"]);
  assert.ok(blocks.some(block => block.kind === "page" && block.text === "Side 2"));
  assert.equal(blocks.filter(block => block.kind === "field" && block.label === "Andre krav").length, 0);
  assert.ok(blocks.some(block => block.text === "Festes i tak."));
});

test("falls back to saved structured requirements when source text is missing", () => {
  const details = projectRequirementDetails({ value_json: { attributes: { materiale: "Stål", "andre krav": "Korrosjonsklasse C4.", "pdf-kommentar": "Sjekk plassering" } } });
  assert.deepEqual(structuredPostBlocks(details, "RØR"), [
    { kind: "field", label: "Materiale", text: "Stål" },
    { kind: "field", label: "Andre krav", text: "Korrosjonsklasse C4." }
  ]);
});

test("removes a split leading post number without removing in-text references", () => {
  const details = projectRequirementDetails({ value_json: { postNumber: "1401.40.411.38", nsCode: "WC2.522A", technicalSpecification: "1401.40.411.\n38\nWC2.522A\nKABELSTIGE\nLengde m 501,10\nSe post 1401.40.411.38 for detaljer." } });
  const blocks = structuredPostBlocks(details, "KABELSTIGE");
  assert.equal(blocks[0].kind, "quantity");
  assert.equal(blocks[1].text, "Se post 1401.40.411.38 for detaljer.");
});


test("Sprinkler2 marking scope on the next page is actually rendered in the product card", async () => {
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { ProjectPostSpecification } = await import("../components/ProjectPostSpecification");
  const source = '30.332.27 Merking ventil (skilt):\n\nFORTSETTELSE SIDE 16\nOmfang er skilt for 3stk DN25 dreneringsventiler, hvor 2 er\nplassert over himling og 1 under nederste mellomrepos av\ntrapp.\nDrenering 33 Sprinkleranlegg\nRund sum RS';
  const details = projectRequirementDetails({ source_page: 15, value_json: { postNumber: '30.332.27', sourceText: source, technicalSpecification: source } });
  const html = renderToStaticMarkup(createElement(ProjectPostSpecification, { id: 'r', details, description: 'Merking ventil (skilt)', quantity: { quantity: 1, unit: 'RS' } }));
  assert.match(html, /Omfang er skilt for 3stk DN25 dreneringsventiler/);
  assert.match(html, /plassert over himling og 1 under nederste mellomrepos av\ntrapp/);
  assert.match(html, /Drenering 33 Sprinkleranlegg/);
  assert.match(html, /Side 15–16/);
  assert.match(html, /FORTSETTELSE SIDE 16/);
  assert.equal(html.match(/Rund sum RS/g)?.length, 1);
  assert.equal(html.match(/Merking ventil \(skilt\)/g)?.length, 1);
});

test("continued field prose is shown once and reviewed corrections remain authoritative", () => {
  const details = projectRequirementDetails({ value_json: { attributes: { lokalisering: 'Over himling i første etasje.', trykk: '16 bar' },
    technicalSpecification: 'Lokalisering: Over himling i\n\nFORTSETTELSE SIDE 2\nførste etasje.\nTrykk: 12 bar\nAndre krav:\nAlle festedeler skal følge med.' } });
  const blocks = structuredPostBlocks(details, 'RØR');
  assert.deepEqual(blocks.filter(b => b.kind === 'field' && b.label === 'Lokalisering'), [{ kind: 'field', label: 'Lokalisering', text: 'Over himling i første etasje.' }]);
  assert.equal(blocks.some(b => b.kind === 'text' && b.text === 'første etasje.'), false);
  assert.ok(blocks.some(b => b.kind === 'field' && b.label === 'Trykk' && b.text === '16 bar'));
  assert.ok(blocks.some(b => b.text.includes('Alle festedeler skal følge med.')));
});


test("free clauses after an ordinary field survive even when its saved value is corrected", () => {
  const details = projectRequirementDetails({ value_json: { attributes: { materiale: 'Messing' },
    technicalSpecification: 'Materiale: Stål\nDet skal medfølge dokumentasjon.\nAlle festedeler skal leveres.' } });
  const blocks = structuredPostBlocks(details, 'VENTIL');
  assert.deepEqual(blocks[0], { kind: 'field', label: 'Materiale', text: 'Messing' });
  assert.ok(blocks.some(block => block.kind === 'text' && block.text.includes('Det skal medfølge dokumentasjon.')));
  assert.ok(blocks.some(block => block.kind === 'text' && block.text.includes('Alle festedeler skal leveres.')));
});


test("plain fallback retains source spelling once without a false next page", async () => {
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { ProjectPostSpecification } = await import("../components/ProjectPostSpecification");
  const { projectRequirementPageLabel } = await import("./project-requirement-details");
  const source = '33.500.2 | UE2.11111232\nSPRINKLER\nAntall stk 67\nFelsomhetsgrad: Standard-respons "A"\nUtlesningstemperatur: 68 °C\nDokumentasjon: Datablad skal følge med.\nAndre krav: Nei\n\nFORTSETTELSE SIDE 2\nRambøll Norge AS 07.08.2026';
  const row = { status: 'user_confirmed', source_page: 1, source_excerpt: source, value_json: {
    postNumber: '33.500.2', nsCode: 'UE2.11111232', sourceText: source, technicalSpecification: source,
    attributes: { 'følsomhetsgrad': 'Standard-respons "A"', 'utløsningstemperatur': '68 °C' }
  } };
  const before = JSON.stringify(row);
  const details = projectRequirementDetails(row);
  const html = renderToStaticMarkup(createElement(ProjectPostSpecification, { id: 'r', details, description: 'SPRINKLER', quantity: { quantity: 67, unit: 'st' }, quantityText: 'Antall stk 67' }));
  assert.equal(projectRequirementPageLabel(details), 'Side 1');
  assert.equal(html.match(/UE2\.11111232/g)?.length, 1);
  assert.equal(html.match(/SPRINKLER/g)?.length, 1);
  assert.equal(html.match(/68 °C/g)?.length, 1);
  assert.equal(html.match(/Felsomhetsgrad/g)?.length, 1);
  assert.doesNotMatch(html, /Rambøll|Side 2/);
  assert.equal(html.match(/Utlesningstemperatur/g)?.length, 1);
  assert.match(html, /Datablad skal følge med/);
  assert.equal(JSON.stringify(row), before);
});

test("legacy header cleanup preserves genuine page continuations and reviewed values", () => {
  const source = '33.500.2 UE2.11111232\nSPRINKLER\nUtlesningstemperatur: 68 °C\n\nFORTSETTELSE SIDE 2\nRambøll Norge AS 07.08.2026\nDatablad godkjennes av Rambøll Norge AS.\nTrykk: PN16';
  const row = { reviewed_at: '2026-10-01', source_page: 1, value_json: { postNumber: '33.500.2', nsCode: 'UE2.11111232', technicalSpecification: source,
    attributes: { 'utløsningstemperatur': '79 °C', trykk: 'PN16' } } };
  const blocks = structuredPostBlocks(projectRequirementDetails(row), 'SPRINKLER');
  assert.deepEqual(blocks.filter(b => b.kind === 'field' && /temperatur/i.test(b.label)), [{ kind: 'field', label: 'Utløsningstemperatur', text: '79 °C' }]);
  assert.ok(blocks.some(b => b.kind === 'page' && b.text === 'Side 2'));
  assert.ok(blocks.some(b => b.text === 'Datablad godkjennes av Rambøll Norge AS.'));
  assert.ok(blocks.some(b => b.kind === 'field' && b.label === 'Trykk' && b.text === 'PN16'));
});
