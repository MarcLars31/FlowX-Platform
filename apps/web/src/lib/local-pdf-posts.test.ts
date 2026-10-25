import assert from "node:assert/strict";
import test from "node:test";
import { extractTechnicalDescriptionFromPages } from "@/modules/technical-description-extractor/extractor";
import { localPdfPosts } from "./local-pdf-posts";

test("Sprinkler2 pipe dimensions stay under their main post, including a leaf whose quantity OCR missed", () => {
  const result = extractTechnicalDescriptionFromPages([{pageNumber:1,method:"ocr",confidence:.95,text:
    "30.332.7 UB1.31114399900\nINNENDØRS RØRLEDNING - BRANNSLOKKING - KOMPLETT\nMateriale: Stål\n30.332.7.1 DN25, ink. deler og oppheng\nLengde m 126\n30.332.7.7 DN100, ink. deler og oppheng"}]);
  const main = result.materialLines.find(line => line.postNumber === "30.332.7")!;
  const missing = result.materialLines.find(line => line.postNumber === "30.332.7.7")!;
  // A source ID allows a provisional group; the OCR review flags stay intact.
  missing.parentSourcePostId = main.id;
  const view = localPdfPosts(result.materialLines);
  assert.equal(view.products.length, 2);
  assert.equal(view.groups.length, 1);
  assert.equal(view.groups[0].number, "30.332.7");
  assert.equal(view.groups[0].review, true);
  assert.ok(main.reviewFlags.includes("unverified-post-source"));
  assert.ok(view.groups[0].requirementIds.includes(missing.id));
  assert.equal(missing.quantity, undefined);
  assert.ok(view.sourceRows.some(line => line.id === main.id));
});


test("an OCR parent ID that is absent never falls back to its printed number", () => {
  const result = extractTechnicalDescriptionFromPages([{pageNumber:1,method:"ocr",confidence:.95,text:
    "30.332.7 UB1.31114399900\nINNENDØRS RØRLEDNING - BRANNSLOKKING - KOMPLETT\nMateriale: Stål\n30.332.7.1 DN25, ink. deler og oppheng\nLengde m 126"}]);
  const child = result.materialLines.find(line => line.postNumber === "30.332.7.1")!;
  child.parentSourcePostId = "absent";
  const view = localPdfPosts(result.materialLines);
  assert.equal(view.products.length, 1);
  assert.equal(view.groups[0].sourceId, null);
  assert.equal(view.groups[0].review, true);
  assert.deepEqual(view.groups[0].requirementIds, [child.id]);
});
