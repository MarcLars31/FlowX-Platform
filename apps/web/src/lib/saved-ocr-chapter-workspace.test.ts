import test from "node:test";
import assert from "node:assert/strict";
import { buildDocumentChapterWorkspace } from "./document-chapter-workspace";
import { chapterWorkspaceView } from "./chapter-main-posts";
import { groupProductsByMainPost, resolvePostParents, type HierarchyRow } from "./project-post-hierarchy";
import { productPostMeasurement, visibleProjectRequirements } from "./project-requirement-views";
import { compactProjectRequirement } from "./project-overview";
import { chapterHeaderPages, type ChapterPage } from "./pdf-chapter-navigation";

// Saved uploads have two distinct IDs. OCR flags apply even to rows with an
// explicit, scoped parentSourcePostId. DN100's own "Lengde m²" needs review.
const base = { source_document_id: "physical-pdf", source_technical_description_document_id: "extraction", source_page: 2 };
const flags = ["ocr-source", "unverified-post-source", "unverified-price-columns"];
const parent: HierarchyRow = { ...base, id: "pipes", source_page: 1, value_text: "INNENDØRS RØRLEDNING - BRANNSLOKKING - KOMPLETT",
  source_excerpt: "30.332.7 RØRLEDNING\nMateriale: Stål\nTrykk: PN12",
  value_json: { postNumber: "30.332.7", sourcePostId: "source-main", sourceOrder: 4, reviewFlags: [...flags, "project-information"] } };
const children: HierarchyRow[] = [25, 32, 40, 50, 65, 80, 100].map((dn, index) => ({ ...base, id: `dn${dn}`, value_text: `DN${dn}`,
  source_excerpt: `30.332.7.${index + 1} DN${dn}\nLengde ${dn === 100 ? "m²" : "m " + [126, 384, 114, 223, 64, 143][index]}`,
  value_json: { postNumber: `30.332.7.${index + 1}`, sourcePostId: `source-${dn}`, parentSourcePostId: "source-main", parentPostNumber: "30.332.7",
    sourceOrder: index + 6, quantity: dn === 100 ? null : [126, 384, 114, 223, 64, 143][index], unit: dn === 100 ? null : "m",
    reviewFlags: [...flags, ...(dn === 100 ? ["missing-quantity", "project-information"] : [])] } }));
const pages: ChapterPage[] = [1, 2, 3].map(page_number => ({ document_id: "physical-pdf", page_number, heading_layout: { lines: [
  { text: `Prosjekt: Eksempel Side ${page_number}`, x: 40, y: 117, height: 18 },
  { text: page_number === 2 ? "30 VVS-instal lasjoner" : "30 VVS-installasjoner", x: 40, y: 149, height: 19 },
  { text: "Postnr NS3420 kode/Spesifikasjon Enh. Mengde Pris Sum", x: 40, y: 175, height: 19 }
] } }));

test("saved OCR upload uses the physical PDF chapter and retains all seven explicit children", () => {
  const rows = [parent, ...children], before = structuredClone(rows);
  const workspace = buildDocumentChapterWorkspace(rows, pages);
  assert.deepEqual(workspace.chapters.map(c => [c.number, c.title]), [["30", "VVS-installasjoner"]]);
  assert.deepEqual(workspace.chapters[0].mainPosts?.map(g => [g.sourceId, g.number, g.requirementIds, g.review]),
    [[parent.id, "30.332.7", children.map(r => r.id), true]]);
  for (const mode of ["pdf", "main"] as const) {
    const view = chapterWorkspaceView(workspace, mode);
    const ids = view.chapters.flatMap(c => c.sections.flatMap(s => s.requirementIds));
    assert.deepEqual(ids, children.map(r => r.id));
    assert.ok(view.chapters.every(c => c.kind !== "review"));
  }
  assert.equal(chapterWorkspaceView(workspace, "main").chapters[0].title, parent.value_text);
  assert.match(workspace.sources.pipes.text, /PN12/);
  assert.ok(workspace.chapters[0].sections.some(s => s.textSourceIds?.includes(parent.id)));
  assert.deepEqual(visibleProjectRequirements(rows.map(compactProjectRequirement)).map(r => r.id), children.map(r => r.id));
  assert.deepEqual(productPostMeasurement(children[6]), { visible: true, missingQuantity: true });
  assert.deepEqual(rows, before);
});

test("reviewed navigation does not relax assignment/inheritance, infer parents or merge scopes", () => {
  assert.equal(resolvePostParents([parent, ...children]).parents.size, 0);
  const childValue = children[0].value_json as Record<string, unknown>;
  const parentValue = parent.value_json as Record<string, unknown>;
  for (const change of [
    { parentSourcePostId: "missing" }, { parentSourcePostId: undefined }, { postScope: "other-table" },
    { parentRequirementId: "missing" }, { reviewFlags: [...flags, "unassigned-source-text"] }
  ]) {
    const groups = groupProductsByMainPost([parent, { ...children[0], value_json: { ...childValue, ...change } }]);
    assert.equal(groups[0].sourceId, null);
    assert.equal(groups[0].review, true);
  }
  const duplicate = { ...parent, id: "duplicate" };
  assert.equal(groupProductsByMainPost([parent, duplicate, children[0]])[0].sourceId, null);
  const cyclicParent = { ...parent, value_json: { ...parentValue, parentRequirementId: children[0].id } };
  assert.equal(groupProductsByMainPost([cyclicParent, children[0]])[0].sourceId, null);
  const unassignedParent = { ...parent, value_json: { ...parentValue, reviewFlags: ["unassigned-source-text"] } };
  assert.equal(groupProductsByMainPost([unassignedParent, children[0]])[0].sourceId, null);
});

test("absent headers use an actual OCR main title while unplaced text stays accessible", () => {
  const text = { ...base, id: "unplaced", source_excerpt: "Fristående text för kontroll", value_json: { reviewFlags: ["unassigned-source-text"] } };
  const workspace = buildDocumentChapterWorkspace([parent, ...children, text]);
  assert.equal(workspace.chapters[0].title, parent.value_text);
  assert.equal(workspace.chapters[0].kind, "main-post");
  assert.equal(workspace.chapters.at(-1)?.title, "PDF-text att kontrollera");
  assert.match(workspace.sources.unplaced.text, /Fristående/);
});

test("OCR whitespace normalization keeps distinct chapter titles and documents separate", () => {
  assert.deepEqual(chapterHeaderPages(pages).get("physical-pdf")?.map(p => p.path[0].title), Array(3).fill("VVS-installasjoner"));
  const different = structuredClone(pages[1]) as typeof pages[number] & { heading_layout: { lines: { text: string }[] } };
  different.heading_layout.lines[1].text = "30 Varmeinstallasjoner";
  assert.equal(chapterHeaderPages([pages[0], different]).get("physical-pdf")?.[1].path[0].title, "Varmeinstallasjoner");
  assert.equal(chapterHeaderPages([pages[0], { ...pages[1], document_id: "another" }]).get("another")?.[0].path[0].title, "VVS-instal lasjoner");
});

test("missing-quantity source lines cannot promote prose, inherited measurements or empty verified columns", () => {
  const value = children[6].value_json as Record<string, unknown>;
  const checks = [
    { source_excerpt: "Lengde m² er omtalt i kravteksten." },
    { source_excerpt: "Lengde m²\nUNDERPOST\nKrav uten mengde" },
    { source_excerpt: "", value_json: { ...value, technicalSpecification: "Lengde m²" } },
    { value_json: { ...value, pdfColumnValues: { unit: "", quantity: "" } } },
    { value_json: { ...value, reviewFlags: [...flags, "missing-quantity", "unassigned-source-text"] } }
  ];
  for (const change of checks) assert.equal(productPostMeasurement({ ...children[6], ...change }).visible, false);
});
