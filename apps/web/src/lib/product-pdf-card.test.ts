import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ProjectPostSpecification } from "../components/ProjectPostSpecification";
import { MainPostDetailsButton, MainPostDetailsDialog } from "../components/MainPostDetailsButton";
import { SectionPosts } from "../components/ChapterWorkspaceNavigation";
import { projectRequirementDetails } from "./project-requirement-details";
import { projectRequirementQuantity } from "./project-requirement-quantity";
import { buildDocumentChapterWorkspace } from "./document-chapter-workspace";
import { chapterWorkspaceView } from "./chapter-main-posts";

const flags = ["ocr-source", "unverified-post-source", "unverified-price-columns"];
const parent = { id: "main", source_document_id: "sprinkler", source_page: 1,
  value_text: "INNENDØRS RØRLEDNING", source_excerpt: "30.332.7 INNENDØRS RØRLEDNING\nMateriale: Stål\nTrykk: PN12",
  value_json: { postNumber: "30.332.7", sourcePostId: "source-main", sourceOrder: 4, reviewFlags: [...flags, "project-information"] } };
const child = { id: "pipe", source_document_id: "sprinkler", source_page: 2,
  value_text: "DN25, ink. deler og oppheng", source_excerpt: "30.332.7.1 DN25, ink. deler og oppheng\nLengde\tm 126",
  value_json: { postNumber: "30.332.7.1", parentSourcePostId: "source-main", sourceOrder: 6, unit: "m", quantity: 126, reviewFlags: flags } };

test("product card shows only the saved amount and source links without OCR control text", () => {
  const before = structuredClone(child);
  const render = (quantity: number | null) => renderToStaticMarkup(createElement(ProjectPostSpecification, {
    id: child.id, details: projectRequirementDetails(child), description: child.source_excerpt,
    quantity: projectRequirementQuantity({ ...child.value_json, quantity }), section: "quantity",
    sourcePdfHref: "/sprinkler.pdf#page=2", sourcePdfFileName: "Sprinkler2.pdf"
  }));
  const html = render(126);
  assert.match(html, /126 m/);
  assert.match(html, /Sprinkler2.pdf/);
  assert.match(html, /href="\/sprinkler.pdf#page=2"[^>]*>Vis original-PDF/);
  assert.doesNotMatch(html, /Kontroller PDF-posten|Pris- och summakolumnerna|Lengde|Kommentarer til posten/);
  assert.match(render(0), /0 m/);
  assert.match(render(null), /Antal saknas/);
  assert.doesNotMatch(render(null), /126 m|0 m/);
  assert.deepEqual(child, before);
});

test("an explicitly linked OCR main post opens separately in both lists with its own complete source", () => {
  const rows = [parent, child], before = structuredClone(rows);
  const workspace = buildDocumentChapterWorkspace(rows);
  for (const mode of ["pdf", "main"] as const) {
    const chapter = chapterWorkspaceView(workspace, mode).chapters[0];
    const group = chapter.mainPosts![0];
    assert.equal(group.review, true);
    const source = workspace.sources[group.sourceId!];
    assert.equal(source.id, parent.id);
    const list = renderToStaticMarkup(createElement(SectionPosts, { rows: [child], groups: chapter.mainPosts,
      sources: workspace.sources, assignments: new Map(), disabled: false, onSelect: () => true }));
    assert.match(list, /Åpne hovedpost 30.332.7/);
    assert.match(list, /126 m/);
    assert.doesNotMatch(list, /Trykk: PN12/);
    const button = renderToStaticMarkup(createElement(MainPostDetailsButton, { group, source }));
    assert.match(button, /aria-haspopup="dialog"/);
    const dialog = renderToStaticMarkup(createElement(MainPostDetailsDialog, { id: "source-dialog", source, onClose: () => {} }));
    assert.match(dialog, /Hovedpost 30.332.7/);
    assert.match(dialog, /Trykk: PN12/);
    assert.match(dialog, /PDF-side 1/);
    assert.doesNotMatch(dialog, /126|DN25/);
    assert.equal(renderToStaticMarkup(createElement(MainPostDetailsButton, { group, source: undefined })), "");
  }
  assert.deepEqual(rows, before);
});
