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

test("retains inherited and own requirements plus page continuations", () => {
  const details = projectRequirementDetails({ value_json: { postNumber: "33.1.1", technicalSpecification: "33.1 RØR\nDimensjon: Se under\nAndre krav:\na) Omfang\nAlle deler inngår.\n\nUNDERPOST\n33.1.1\nDimensjon: DN25\nLengde m 12\n\nFORTSETTELSE SIDE 2\nc) Utførelse\nFestes i tak." } });
  const blocks = structuredPostBlocks(details, "RØR");
  assert.deepEqual(blocks.filter(block => block.kind === "field" && block.label === "Dimensjon").map(block => block.text), ["Se under", "DN25"]);
  assert.ok(blocks.some(block => block.kind === "page" && block.text === "Side 2"));
  assert.equal(blocks.filter(block => block.kind === "field" && block.label === "Andre krav").length, 1);
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
