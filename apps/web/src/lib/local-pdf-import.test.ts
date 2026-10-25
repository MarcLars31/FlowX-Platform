import assert from "node:assert/strict";
import test from "node:test";
import { extractTechnicalDescriptionFromPages } from "@/modules/technical-description-extractor/extractor";
import { productPostMeasurement } from "./project-requirement-views";
import { readLocalPdf, type LocalPdfImportResult } from "./local-pdf-import";

const file = new File(["%PDF fixture"], "Sprinkler2.pdf", { type: "application/pdf" });
const blank = (pageNumber: number) => ({ pageNumber, text: "", method: "text" as const, confidence: 0, status: "failed" as const });
const postText = "30 VVS-installasjoner\n30.332.6 UB1.33114699900A\nINNENDØRS RØRLEDNING - BRANNSLOKKING - SLANGE\nAntall stk 132\nSlokkeanlegg: Sprinkler\nMateriale: Stål - rustfritt\nDimensjon: DN25";
const initial = (pages = [blank(1), blank(2)]) => ({ result: extractTechnicalDescriptionFromPages(pages, { fileName: file.name }), ocrPageNumbers: pages.map(page => page.pageNumber) });
const response = (data: LocalPdfImportResult) => async (url: RequestInfo | URL, options?: RequestInit) => {
  assert.equal(url, "/api/local/pdf");
  assert.equal((options?.headers as Record<string, string>)["x-scipx-local-design"], "1");
  return Response.json(data);
};

test("a PDF with no digital text automatically recovers and displays product posts through local OCR", async () => {
  const updates: LocalPdfImportResult[] = [];
  const result = await readLocalPdf(file, () => {}, update => updates.push(update), {
    fetch: response(initial()),
    extractOcr: async (_file, pages, _progress, onPage) => {
      assert.deepEqual(pages, [1, 2]);
      await onPage!({ pageNumber: 1, text: postText, confidence: .95 });
      await onPage!({ pageNumber: 2, text: "30 VVS-installasjoner\n30.332.7 UB1.31114399900\nINNENDØRS RØRLEDNING - BRANNSLOKKING - KOMPLETT\nLengde m 240\nMateriale: Stål", confidence: .94 });
      return [];
    }
  });
  assert.equal(updates[0].result.materialLines.length, 0);
  const products = result.result.materialLines.filter(line => productPostMeasurement({ id: line.id, value_json: line }).visible);
  assert.ok(products.some(line => line.postNumber === "30.332.6" && line.quantity === 132 && line.unit === "st"));
  assert.ok(updates[1].result.materialLines.length > 0);
  assert.deepEqual(result.ocrPageNumbers, []);
});

test("readable digital PDFs skip OCR", async () => {
  const data = { result: extractTechnicalDescriptionFromPages([{ pageNumber: 1, text: postText, method: "text", confidence: .98 }]), ocrPageNumbers: [] };
  await readLocalPdf(file, () => {}, () => {}, { fetch: response(data), extractOcr: async () => { throw new Error("OCR must not run"); } });
});

test("a later OCR failure retains completed product pages and identifies the remaining page", async () => {
  const updates: LocalPdfImportResult[] = [];
  await assert.rejects(readLocalPdf(file, () => {}, update => updates.push(update), {
    fetch: response(initial()), extractOcr: async (_file, _pages, _progress, onPage) => {
      await onPage!({ pageNumber: 1, text: postText, confidence: .94 });
      throw new Error("OCR interrupted");
    }
  }), /OCR interrupted/);
  assert.ok(updates.at(-1)!.result.materialLines.some(line => line.postNumber === "30.332.6"));
  assert.deepEqual(updates.at(-1)!.ocrPageNumbers, [2]);
});
