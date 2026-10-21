import test from "node:test";
import assert from "node:assert/strict";
import { buildChapterWorkspace, initialSectionPost } from "./project-chapter-workspace";
const row = (id: string, post: string, parent?: string, measured = false, document = "pdf-a", sourceOrder = 0) => ({
  id, value_text: "Samma rubrik", source_document_id: document, source_page: 1,
  value_json: { postNumber: post, parentPostNumber: parent, sourceOrder, sourceText: `${post}\nOriginaltext\n\na) Ursprungligt krav`,
    ...(measured ? { unit: "m", quantity: 12 } : {}) }
});
test("stable IDs isolate identical headings and post numbers in different documents", () => {
  const rows = [row("a", "30"), row("a-sub", "30.1", "30", false, "pdf-a", 1), row("a-post", "30.1.1", "30.1", true, "pdf-a", 2),
    row("b", "30", undefined, false, "pdf-b"), row("b-sub", "30.1", "30", false, "pdf-b", 1), row("b-post", "30.1.1", "30.1", true, "pdf-b", 2)];
  const workspace = buildChapterWorkspace(rows);
  assert.deepEqual(workspace.chapters.map(chapter => chapter.sections.flatMap(section => section.requirementIds)), [["a-post"], ["b-post"]]);
  assert.notEqual(workspace.chapters[0].id, workspace.chapters[1].id);
  assert.equal(workspace.sources["a-sub"].text, rows[1].value_json.sourceText);
});
test("deeper parents and their original text remain separate from product text", () => {
  const workspace = buildChapterWorkspace([row("main", "30"), row("sub", "30.1", "30", false, "pdf-a", 1),
    row("parent", "30.1.2", "30.1", false, "pdf-a", 2), row("post", "30.1.2.1", "30.1.2", true, "pdf-a", 3)]);
  assert.deepEqual(workspace.ancestors.post, ["main", "sub", "parent"]);
  assert.deepEqual(workspace.chapters[0].sections[0].requirementIds, ["post"]);
  assert.equal(workspace.sources.post, undefined, "post details must stay lazy");
  assert.equal(workspace.sources.parent.parentId, "sub");
});
test("ambiguous, missing, and foreign-document parents never hide or arbitrarily place a post", () => {
  const rows = [row("main", "30"), row("same-1", "30.1", "30", false, "pdf-a", 1), row("same-2", "30.1", "30", false, "pdf-a", 2),
    row("ambiguous", "30.1.1", "30.1", true, "pdf-a", 3), row("missing", "30.8.1", "30.8", true, "pdf-a", 4), row("foreign", "30.1.1", "30.1", true, "other", 5)];
  const workspace = buildChapterWorkspace(rows);
  assert.deepEqual(workspace.chapters.at(-1)?.sections[0].requirementIds, ["ambiguous", "missing", "foreign"]);
  assert.deepEqual(workspace.ancestors.ambiguous, []);
  const ids = workspace.chapters.flatMap(chapter => chapter.sections.flatMap(section => section.requirementIds));
  assert.equal(ids.length, new Set(ids).size);
});
test("first visit opens the first unselected post; revisits and all-selected sections are deterministic", () => {
  const section = { id: "section", sourceId: null, title: "", number: "", requirementIds: ["one", "two", "three"] };
  assert.equal(initialSectionPost(section, new Set(["one"])), "two");
  assert.equal(initialSectionPost(section, new Set(["one"]), "three"), "three");
  assert.equal(initialSectionPost(section, new Set(section.requirementIds)), "one");
  assert.equal(initialSectionPost(section, new Set(["one"]), "foreign"), "two");
  assert.equal(initialSectionPost({ ...section, requirementIds: [] }, new Set()), null);
});
