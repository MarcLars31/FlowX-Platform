import test from "node:test";
import assert from "node:assert/strict";
import { buildChapterWorkspace, chapterWorkspaceRevision, initialSectionPost } from "./project-chapter-workspace";
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

test("an explicit missing parent ID cannot silently link to a different numbered parent", () => {
  const child = row("post", "30.1", "30", true, "pdf-a", 1);
  const workspace = buildChapterWorkspace([row("main", "30"), {
    ...child, value_json: { ...child.value_json, parentRequirementId: "deleted-parent" }
  }]);
  assert.deepEqual(workspace.ancestors.post, []);
  assert.deepEqual(workspace.chapters.find(chapter => chapter.id === "unlinked")?.sections[0].requirementIds, ["post"]);
});

test("orphaned information and its descendants remain available without inherited guesses", () => {
  const workspace = buildChapterWorkspace([
    row("orphan", "30.1", "30"), row("nested-info", "30.1.1", "30.1", false, "pdf-a", 1),
    row("post", "30.1.2", "30.1", true, "pdf-a", 2)
  ]);
  const review = workspace.chapters.find(chapter => chapter.kind === "review")!;
  assert.deepEqual(review.sections.map(section => section.sourceId), ["orphan", "nested-info"]);
  assert.match(workspace.sources.orphan.text, /Ursprungligt krav/);
  assert.match(workspace.sources["nested-info"].text, /Ursprungligt krav/);
  assert.deepEqual(workspace.ancestors.post, []);
});

test("deep information without product children has an accessible section and ancestor path", () => {
  const workspace = buildChapterWorkspace([
    row("main", "30"), row("sub", "30.1", "30", false, "pdf-a", 1),
    row("details", "30.1.1", "30.1", false, "pdf-a", 2)
  ]);
  assert.ok(workspace.chapters[0].sections.some(section => section.sourceId === "details"));
  assert.match(workspace.sources.details.text, /Ursprungligt krav/);
  assert.deepEqual(workspace.ancestors.details, ["main", "sub"]);
});

test("saved page chapter labels group products without inventing common requirements", () => {
  const withChapter = (id: string, document: string) => {
    const post = row(id, "30.1", undefined, true, document);
    return { ...post, value_json: { ...post.value_json, sourceChapter: { title: "30 VVS", sourcePage: 1 } } };
  };
  const rows = [withChapter("one", "pdf-a"), withChapter("two", "pdf-b")];
  const original = structuredClone(rows), workspace = buildChapterWorkspace(rows);
  assert.deepEqual(rows, original);
  assert.equal(workspace.chapters.length, 2);
  assert.ok(workspace.chapters.every(chapter => chapter.number === "30" && chapter.title === "VVS" && chapter.sourceId === null));
  assert.deepEqual(workspace.chapters.map(chapter => chapter.sections[0].requirementIds), [["one"], ["two"]]);
  assert.deepEqual(workspace.sources, {});
  assert.deepEqual(workspace.ancestors.one, []);
  const separateScope = { ...rows[0], id: "three", value_json: { ...rows[0].value_json, postScope: "Building B" } };
  assert.equal(buildChapterWorkspace([...rows, separateScope]).chapters.length, 3);
});

test("a saved chapter label cannot rescue an invalid parent chain", () => {
  const orphan = row("post", "30.1", "30", true);
  const workspace = buildChapterWorkspace([{ ...orphan, value_json: {
    ...orphan.value_json, sourceChapter: { title: "30 VVS", sourcePage: 1 }
  } }]);
  assert.equal(workspace.chapters[0].id, "unlinked");
});

test("uncertain source text cannot become inherited requirements just because it has a child", () => {
  const root = row("uncertain", "30");
  const workspace = buildChapterWorkspace([
    { ...root, value_json: { ...root.value_json, reviewFlags: ["unassigned-source-text"] } },
    row("post", "30.1", "30", true, "pdf-a", 1)
  ]);
  assert.ok(workspace.chapters.some(chapter => chapter.kind === "review"));
  assert.deepEqual(workspace.ancestors.post, []);
  assert.deepEqual(workspace.chapters.find(chapter => chapter.id === "unlinked")?.sections[0].requirementIds, ["post"]);
});

test("technical document identity consistently isolates imports sharing a project document", () => {
  const workspace = buildChapterWorkspace([
    { ...row("main", "30"), source_technical_description_document_id: "import-a" },
    { ...row("post", "30.1", "30", true, "pdf-a", 1), source_technical_description_document_id: "import-b" }
  ]);
  assert.deepEqual(workspace.ancestors.post, []);
});

test("navigation refreshes when a saved requirement changes or is removed", () => {
  const rows = [row("main", "30"), { ...row("post", "30.1", "30", true), edit_revision: 1, updated_at: "2026-10-22T09:00:00Z" }];
  const revision = chapterWorkspaceRevision(rows);
  assert.equal(chapterWorkspaceRevision(structuredClone(rows)), revision);
  assert.notEqual(chapterWorkspaceRevision(rows.slice(0, 1)), revision);
  assert.notEqual(chapterWorkspaceRevision([rows[0], { ...rows[1], edit_revision: 2 }]), revision);
  assert.notEqual(chapterWorkspaceRevision([rows[0], { ...rows[1], status: "rejected" }]), revision);
  assert.notEqual(chapterWorkspaceRevision([rows[0], { ...rows[1], updated_at: "2026-10-22T10:00:00Z" }]), revision);
});

test("page-header chapters keep source order alongside standalone chapter rows", () => {
  const post = row("post", "30.1", undefined, true);
  const workspace = buildChapterWorkspace([
    { ...post, value_json: { ...post.value_json, sourceChapter: { title: "30 VVS", sourcePage: 1 } } },
    { ...row("later", "40"), source_page: 5 }
  ]);
  assert.equal(workspace.chapters[0].number, "30");
  assert.equal(workspace.chapters[1].id, "later");
});

test("flattening a project wrapper cannot promote an uncertain child to a chapter", () => {
  const child = row("uncertain", "1234.30", "1234", false, "pdf-a", 1);
  const workspace = buildChapterWorkspace([row("object", "1234"), {
    ...child, value_json: { ...child.value_json, reviewFlags: ["unassigned-source-text"] }
  }, row("post", "1234.30.1", "1234.30", true, "pdf-a", 2)]);
  assert.ok(!workspace.chapters.some(chapter => chapter.id === "uncertain"));
  assert.deepEqual(workspace.ancestors.post, []);
  assert.ok(workspace.chapters.find(chapter => chapter.kind === "review")?.sections.some(section => section.sourceId === "uncertain"));
});
