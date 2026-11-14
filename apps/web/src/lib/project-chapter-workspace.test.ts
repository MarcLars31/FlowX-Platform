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

const fragment = (id: string, text: string, document="pdf-a") => ({ id, value_text:"Uavklart tekst fra PDF – side 2", source_document_id:document,source_page:2,
  value_json:{sourceText:text,reviewFlags:["project-information","unassigned-source-text","unverified-post-source"]} });

test("old header-only preservation rows are not chapters; real uncertain prose stays reviewable", () => {
  const main={...row("main","30"),value_text:"VVS-installasjoner"};
  const rows=[main,row("product","30.1","30",true,"pdf-a",1),
    fragment("header","Område: 30 VVS-installasjoner"),fragment("mixed","Område: 30 VVS-installasjoner\nKrav utan säker postkoppling"),
    fragment("foreign","Område: 30 VVS-installasjoner","pdf-b"),fragment("different","Område: 30 Ett annat område")];
  const original=structuredClone(rows),workspace=buildChapterWorkspace(rows);
  assert.deepEqual(rows,original,"saved source records must remain unchanged");
  assert.deepEqual(workspace.chapters.map(chapter=>chapter.id),["main","source-review"]);
  assert.deepEqual(workspace.chapters[0].sections[0].requirementIds,["product"]);
  assert.equal(workspace.sources.header,undefined);
  assert.equal(workspace.sources.mixed.text,rows[3].value_json.sourceText);
  assert.deepEqual(new Set(workspace.chapters[1].sections.map(section=>section.sourceId)),new Set(["mixed","foreign","different"]));
  assert.equal(workspace.chapters[1].kind,"review");
  assert.ok(workspace.chapters[1].sections.every(section=>section.warning));
});

test("technical identifiers and incomplete recovered numbers do not become main chapters", () => {
  const system={...row("system","320.005"),value_text:"Pumpen skal leveres komplett",value_json:{...row("system","320.005").value_json,
    reviewFlags:["project-information","unverified-post-source"],sourceText:"320.005\nPumpen skal leveres komplett."}};
  const code={...row("code","30.31.315"),value_json:{...row("code","30.31.315").value_json,
    nsCode:"UF1.114261A",sourceText:"30.31.315\nUF1.114261A",reviewFlags:["project-information","recovered-source-post"]}};
  const verified={...row("chapter","30.2"),value_json:{...row("chapter","30.2").value_json,
    chapterInformation:true,reviewFlags:["project-information","unverified-post-source"]}};
  const workspace=buildChapterWorkspace([system,code,verified]);
  assert.deepEqual(workspace.chapters.map(c=>c.id),["chapter","source-review"]);
  assert.equal(workspace.sources.system.text,system.value_json.sourceText);
  assert.equal(workspace.sources.code.text,code.value_json.sourceText);
});

test("only exact same-page duplicate chapter readings are suppressed", () => {
  const numbered={...row("numbered","02"),value_text:"Regningsarbeid",value_json:{...row("numbered","02").value_json,sourceText:"02\nRegningsarbeid"}};
  const duplicate={id:"duplicate",source_page:1,source_document_id:"pdf-a",value_text:"02 Regningsarbeid",
    value_json:{sourceText:"02 Regningsarbeid",reviewFlags:["project-information"]}};
  const extra={...duplicate,id:"extra",value_json:{...duplicate.value_json,sourceText:"02 Regningsarbeid\nEkstra krav."}};
  assert.deepEqual(buildChapterWorkspace([numbered,duplicate,extra]).chapters.map(c=>c.id),["numbered","extra"]);
});
