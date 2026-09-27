import assert from "node:assert/strict";
import test from "node:test";
import { pdfChaptersByPage } from "./pdf-chapters";
import { extractTechnicalDescriptionFromPages } from "./extractor";
import { enrichProjectRequirements } from "@/lib/project-requirement-enrichment";

const title = "1404 LB - 40.434 Elkraftfordeling til driftstekniske installasjoner";
const table = "Postnr: NS 3420 kode/Spesifikasjon Enh. Mengde Pris Sum";
const page = (pageNumber: number, text: string) => ({ pageNumber, text, method: "text" as const, confidence: .98 });

test("reads full ISY headers in both visual and stream order and retains their first page", () => {
  const chapters = pdfChaptersByPage([
    page(1498, `${title}\n${table}\n1404.40.434.10 PUNKT`),
    page(1497, `1404.40.434.9 PUNKT\nSum:\n${title}\n${table}`),
    page(1499, "Fortsettelse av krav.\n12 bar"),
    page(1500, `1404 LB - 40.442 Belysningsutstyr\n${table}`)
  ]);
  assert.deepEqual(chapters.get(1498), { title, sourcePage: 1497 });
  assert.deepEqual(chapters.get(1499), chapters.get(1498));
  assert.equal(chapters.get(1500)?.title, "1404 LB - 40.442 Belysningsutstyr");
});

test("supports explicit chapter paths and Multiconsult table headers without inferring body chapters", () => {
  const chapters = pdfChaptersByPage([
    page(1, "33 SPRINKLER\n12 bar\nAntall stk 39"),
    page(2, "Kapittel: 30 VVS - 33 Brannslokking - 332 Installasjon med sprinkler\n33.332.1 SPRINKLER"),
    page(3, `Multiconsult\nSide 294\n30 VVS-installasjoner\n${table}\n30.332.5 VANNLEDNING\n12 bar`),
    page(4, `30 VVS-instal lasjoner\n${table}\n30.332.6 SPRINKLER`)
  ]);
  assert.equal(chapters.has(1), false);
  assert.equal(chapters.get(2)?.title, "30 VVS - 33 Brannslokking - 332 Installasjon med sprinkler");
  assert.equal(chapters.get(3)?.title, "30 VVS-installasjoner");
  assert.deepEqual(chapters.get(4), chapters.get(3));
});

test("extracts and restores chapter membership for saved posts using their original PDF page", () => {
  const pages = [page(1498, `${title}\n${table}\n1404.40.434.10 WL1.330A\nPUNKT\nAntall stk 1\nLokalisering: Sprinkler\nSum:`),
    page(1499, `${title}\n${table}\nAndre krav:\nAlle kabler skal medtas.\nSum:`)];
  const line = extractTechnicalDescriptionFromPages(pages).materialLines[0];
  assert.equal(line.sourceChapter?.title, title);
  assert.deepEqual(line.sourcePages, [1498, 1499]);
  const rows = enrichProjectRequirements([
    { id: "old", source_technical_description_document_id: "pdf", source_page: 1498, value_text: "PUNKT", value_json: { postNumber: "1404.40.434.10" } },
    { id: "manual", source_technical_description_document_id: "pdf", source_page: 1499, value_text: "Egen post" }
  ], [{ id: "pdf", source_pages: pages }]);
  assert.equal((rows[0].value_json as Record<string, { title: string }>).sourceChapter.title, title);
  assert.equal((rows[1].value_json as Record<string, { title: string }>).sourceChapter.title, title);
});
