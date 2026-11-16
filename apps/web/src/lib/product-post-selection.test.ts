import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { productPostNavigationGroups } from "./product-post-tree";
import { productPostSelectionGroup } from "./product-post-selection";
import { ProductPostRequirements } from "../components/ProductPostRequirements";
import { ProjectPostSpecification } from "../components/ProjectPostSpecification";
import { projectRequirementDetails } from "./project-requirement-details";
import { pdfPostDisplayText } from "./pdf-post-display-text";

const parent = "03.33.332.2.1.9";
function child(id: string, suffix: number, quantity: number, document = "pdf") {
  return { id, source_page: suffix < 4 ? 10 : 11, source_technical_description_document_id: document, value_text: `DN65x${suffix * 10}`,
    value_json: { postNumber: `${parent}.${suffix}`, parentPostNumber: parent, parentDescription: "DIMENSJONSOVERGANG",
      quantity, unit: "stk", sourceChapter: { title: "03.33.332 Rørnett for sprinkler", sourcePage: 1 },
      technicalSpecification: `${parent} UB1.341711434100034\nRØRDEL\nMateriale: Stål\nTrykk: PN10\nUNDERPOST\n${parent}.${suffix} DN65x${suffix * 10}\nAntall stk ${quantity} 0,00 0,00` } };
}
const rows = [child("a", 1, 2), child("b", 3, 1), child("c", 4, 14)];

test("all underposts, including a page continuation, share one explicit main post", () => {
  const groups = productPostNavigationGroups(rows);
  for (const row of rows) {
    const group = productPostSelectionGroup(groups, row.id)!;
    assert.equal(group.postNumber, parent);
    assert.equal(group.description, "DIMENSJONSOVERGANG");
    assert.deepEqual(group.requirements.map(row => row.id), ["a", "b", "c"]);
  }
});
test("same numbers from other PDFs and unrelated posts stay separate", () => {
  const separate = { id: "rs", source_page: 12, value_json: { postNumber: "03.33.332.7", unit: "RS", quantity: 1,
    sourceChapter: rows[0].value_json.sourceChapter } };
  const groups = productPostNavigationGroups([...rows, child("another", 1, 99, "other-pdf"), separate]);
  assert.deepEqual(productPostSelectionGroup(groups, "a")!.requirements.map(row => row.id), ["a", "b", "c"]);
  assert.deepEqual(productPostSelectionGroup(groups, "another")!.requirements.map(row => row.id), ["another"]);
  assert.equal(productPostSelectionGroup(groups, "rs"), undefined);
});
test("a real priced main post remains selectable alongside its children", () => {
  const main = { ...rows[0], id: "main", source_page: 9, value_json: { ...rows[0].value_json, postNumber: parent, parentPostNumber: "03.33.332", quantity: 1 } };
  const groups = productPostNavigationGroups([main, ...rows]);
  assert.deepEqual(productPostSelectionGroup(groups, "main")!.requirements.map(row => row.id), ["main", "a", "b", "c"]);
  assert.deepEqual(productPostSelectionGroup(groups, "b")!.requirements.map(row => row.id), ["main", "a", "b", "c"]);
});
test("common requirements precede the table; selection and amounts belong to individual children", () => {
  const group = productPostSelectionGroup(productPostNavigationGroups(rows), "b")!;
  const table = createElement(ProductPostRequirements, { group, activeRequirementId: "b", disabled: false, onSelect: () => true });
  const html = renderToStaticMarkup(createElement(ProjectPostSpecification, {
    id: "b", details: projectRequirementDetails(rows[1]), description: rows[1].value_text,
    quantity: { quantity: 1, unit: "stk" }, relatedPosts: table
  }));
  assert.equal((html.match(/type="checkbox"/g) ?? []).length, 3);
  assert.equal((html.match(/ checked=""/g) ?? []).length, 1);
  assert.match(html, /aria-label="Velg post 03\.33\.332\.2\.1\.9\.3" checked=""/);
  assert.ok(html.indexOf("Trykk: PN10") < html.indexOf("<table"));
  for (const amount of [2, 1, 14]) assert.ok(html.includes(`>${amount}</td>`));
  assert.match(html, /0,00 0,00/);
  assert.match(html, /Antall stk 1/);
});
test("legacy display preserves cells without coordinate evidence, including zeroes and thousands", () => {
  for (const amount of ["0", "2", "1 234,50", "1 000 000"]) {
    assert.equal(pdfPostDisplayText(`Antall stk ${amount} 0,00 0,00`), `Antall stk ${amount} 0,00 0,00`);
    assert.equal(pdfPostDisplayText(`Antall stk ${amount}`), `Antall stk ${amount}`);
  }
  assert.equal(pdfPostDisplayText("Antall stk\t\t0,00\t0,00"), "Antall stk\t\t0,00\t0,00");
  assert.equal(pdfPostDisplayText("Antall stk\t2\t000\t000"), "Antall stk\t2\t000\t000");
  assert.equal(pdfPostDisplayText("Antall stk 2 0 0"), "Antall stk 2 0 0");
  const prose = "Det skal følge med 2 stk skruer.\nMaksimal pris 2 0,00 0,00\nAntall stk 1 000 000";
  assert.equal(pdfPostDisplayText(prose), prose);
});
