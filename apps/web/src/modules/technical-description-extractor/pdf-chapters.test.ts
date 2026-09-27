import assert from "node:assert/strict";
import test from "node:test";
import { pdfChaptersByPage } from "./pdf-chapters";
import { extractTechnicalDescriptionFromPages } from "./extractor";
import { enrichProjectRequirements } from "@/lib/project-requirement-enrichment";

const title = "1404 LB - 40.434 Elkraftfordeling til driftstekniske installasjoner";
const table = "Postnr: NS 3420 kode/Spesifikasjon Enh. Mengde Pris Sum";
const page = (pageNumber: number, text: string) => ({ pageNumber, text, method: "text" as const, confidence: .98 });

const distributionTitle = "1402 VT - 40.421 Fordelingssystemer";
const parentTitle = "1402 VT - 40 Elkraftinstallasjoner";
const orientationText = `421 Fordelingssystemer\nOrientering\nKapittelet omfatter:\nPrisbærende poster for høyspenningsutstyr. Hulltaking og tettinger beskrives i kapittel 26.\n${parentTitle}`;

test("restores abbreviated chapter headers using the full name from the same building and document", () => {
  const chapters = pdfChaptersByPage([
    page(1, "1401 HM - 40 Elkraftinstallasjoner"), page(2, "1401 HM - 40."),
    page(330, "1401 HM - 50 Tele- og automatiseringsinstallasjoner"), page(332, "1401 HM - 50."),
    page(455, "1402 VT - 40 Elkraftinstallasjoner"), page(456, "1402 VT - 40."),
    page(2222, "1410 UT - 75 Utendørs tele og automatisering"), page(2223, "1410 UT - 75.")
  ]);
  for (const [named, abbreviated] of [[1, 2], [330, 332], [455, 456], [2222, 2223]]) {
    assert.deepEqual(chapters.get(abbreviated), chapters.get(named));
  }
  assert.equal(chapters.get(2)?.title, "1401 HM - 40 Elkraftinstallasjoner");
  assert.equal(chapters.get(456)?.sourcePage, 455);
});

test("does not borrow names from another building, a subchapter, a different document or an ambiguous code", () => {
  for (const other of ["1402 VT - 40 Elkraftinstallasjoner", "1401 HM - 40.411 Systemer for kabelføring"]) {
    const chapters = pdfChaptersByPage([page(1, other), page(2, "1401 HM - 40.")]);
    assert.equal(chapters.get(2)?.title, "1401 HM - 40.");
  }
  pdfChaptersByPage([page(1, "1401 HM - 40 Elkraftinstallasjoner")]);
  assert.equal(pdfChaptersByPage([page(2, "1401 HM - 40.")]).get(2)?.title, "1401 HM - 40.");
  const ambiguous = pdfChaptersByPage([page(1, "1401 HM - 40 Navn A"), page(2, "1401 HM - 40 Navn B"), page(3, "1401 HM - 40.")]);
  assert.equal(ambiguous.get(3)?.title, "1401 HM - 40.");
});

test("places page 524's orientation under the chapter confirmed by page 525", () => {
  const pages = [page(523, `1402.40.412.11 WC1.13119A\nJORDINGSMATERIELL\nAntall stk 2\nSum:\n1402 VT - 40.412 Systemer for jording\n${table}`),
    page(524, orientationText),
    page(525, `1402.40.421.1 WZA\nInstallasjoner for elkraft og ekom\nAndre krav:\nAlle vern skal ha signalkontakt.\n${distributionTitle}\nPostnr: Beskrivelse`)];
  const lines = extractTechnicalDescriptionFromPages(pages).materialLines;
  const orientation = lines.find(line => line.sourcePage === 524)!;
  assert.equal(lines.length, 3);
  assert.equal(orientation.sourceChapter?.title, distributionTitle);
  assert.equal(orientation.sourceChapter?.sourcePage, 524);
  assert.equal(orientation.postNumber, undefined);
  assert.deepEqual(orientation.reviewFlags, ["project-information"]);
  assert.match(orientation.sourceText, /Hulltaking og tettinger/);
  assert.doesNotMatch(lines[0].sourceText, /Orientering/);
  assert.equal(lines[2].sourceChapter?.sourcePage, 524);
});

test("keeps consecutive orientation continuation pages together before the confirmed chapter", () => {
  const chapters = pdfChaptersByPage([page(524, orientationText),
    page(525, `Videre krav til fordelingssystemene.\n${parentTitle}`),
    page(526, distributionTitle)]);
  for (const number of [524, 525, 526]) assert.deepEqual(chapters.get(number), { title: distributionTitle, sourcePage: 524 });
});

test("does not infer an orientation chapter across gaps, other buildings, conflicting names or intervening chapters", () => {
  for (const following of [page(526, distributionTitle), page(525, distributionTitle.replace("1402 VT", "1401 HM")),
    page(525, distributionTitle.replace("Fordelingssystemer", "Andre systemer")),
    page(525, distributionTitle.replace("421", "422")), page(525, "421 Fordelingssystemer")]) {
    const chapters = pdfChaptersByPage([page(524, orientationText), following, page(527, distributionTitle)]);
    assert.equal(chapters.get(524)?.title, parentTitle);
  }
});

test("keeps a new chapter's orientation as information instead of appending it to the preceding product", () => {
  const nextTitle = "1404 LB - 40.442 Belysningsutstyr";
  const lines = extractTechnicalDescriptionFromPages([
    page(1, `1404.40.434.9 WL1.330A\nPUNKT\nAntall stk 1\nAndre krav: Nei\nSum:\n${title}\n${table}`),
    page(2, `442 Belysningsutstyr\nOrientering\nKapittelet inneholder:\nAlle lysarmaturer skal leveres komplett med kabler og festemateriell.\nProsjekt: Test\n${nextTitle}`),
    page(3, `1404.40.442.1 WT1.1A\nLYSARMATUR\nAntall stk 3\nSum:\n${nextTitle}\n${table}`)
  ]).materialLines;
  assert.equal(lines.length, 3);
  assert.doesNotMatch(lines[0].sourceText, /Orientering/);
  assert.equal(lines[1].postNumber, undefined);
  assert.equal(lines[1].sourceChapter?.title, nextTitle);
  assert.deepEqual(lines[1].reviewFlags, ["project-information"]);
  assert.match(lines[1].sourceText, /komplett med kabler og festemateriell/);
});

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
