import assert from "node:assert/strict";
import test from "node:test";
import { assignmentSelectionPlan, buildAssignmentTree, saveAssignmentChanges, selectedAssignmentNodes } from "./project-assignment-tree";
import type { ProjectDeliveryData, ProjectWorkPackage } from "./project-delivery-resource";

function row(id: string, post: string | null, chapter = "03.30.314 Armaturer", document = "pdf-a"): ProjectDeliveryData["requirements"][number] {
  return { id, category: "valve", edit_revision: 0, value_text: post === "03.30.314.2.1" ? "DN15\nAll the detailed requirements" : `Title ${id}`, source_page: 29, source_document_id: document, value_json: { postNumber: post, sourceChapter: { title: chapter } } };
}
const rows = [row("root", "03.30.314"), row("parent", "03.30.314.2"), row("dn15", "03.30.314.2.1"), row("dn20", "03.30.314.2.2"), row("other", "03.30.314.3"), row("second", "03.30.345.1", "03.30.345 Trykkluft"), row("other-pdf", "03.30.314.2.1", undefined, "pdf-b")];
const pkg = (id: string, scope_type: ProjectWorkPackage["scope_type"], scope_value: string): ProjectWorkPackage => ({ id, scope_type, scope_value, assigned_to: "person", due_date: null, note: "", revision: 7 });

test("PDF hierarchy opens through main posts to single posts, without exposing the full requirement text", () => {
  const tree = buildAssignmentTree(rows);
  assert.equal(tree.length, 3);
  const root = tree[0];
  assert.equal(root.number, "03.30.314");
  assert.equal(root.children.find(node => node.key === "parent")?.children[0].title, "DN15");
  assert.deepEqual(new Set(root.leafIds), new Set(["dn15", "dn20", "other"]));
  assert.equal(root.requirementIds.length, 5);
  assert.equal(new Set(root.requirementIds).size, 5);
});

test("a single post, a whole subtree, and mixed chapters produce document-scoped, deduplicated assignments", () => {
  const tree = buildAssignmentTree(rows);
  assert.deepEqual(assignmentSelectionPlan(tree, new Set(["dn15"]), []).map(x => [x.target.type, x.target.value]), [["post", "dn15"]]);
  const selected = new Set(["dn15", "dn20", "second"]);
  assert.deepEqual(selectedAssignmentNodes(tree, selected).map(node => node.key), ["parent", tree.find(node => node.number === "03.30.345")!.key]);
  const plan = assignmentSelectionPlan(tree, selected, []);
  assert.deepEqual(new Set(plan.map(x => `${x.target.type}:${x.target.value}`)), new Set(["post:parent", "post:dn15", "post:dn20", "pdf_chapter:second"]));
  assert.ok(!plan.some(x => x.target.value === "other-pdf"));
  selected.add("other");
  assert.equal(assignmentSelectionPlan(tree, selected, []).length, 2, "whole chapter compacts to one assignment");
});

test("whole chapters preserve their existing anchor/revision and also reassign exact post overrides", () => {
  const tree = buildAssignmentTree(rows);
  const chapter = pkg("existing-chapter", "pdf_chapter", "root");
  const override = pkg("existing-post", "post", "dn15");
  const foreign = pkg("foreign", "post", "other-pdf");
  const plan = assignmentSelectionPlan(tree, new Set(tree[0].leafIds), [chapter, override, foreign]);
  assert.equal(plan.length, 2);
  assert.deepEqual(plan.map(x => x.existing?.id), [chapter.id, override.id]);
  assert.equal(plan[0].target.value, "root");
  assert.equal(plan[0].existing?.revision, 7);
});

test("unnumbered and duplicate numbered posts remain individually selectable", () => {
  const input = [row("a", "03.30.314.2"), row("b", "03.30.314.2"), row("child", "03.30.314.2.1"), row("unnumbered", null)];
  const tree = buildAssignmentTree(input);
  assert.equal(tree[0].children.length, 4);
  assert.equal(tree[0].leafIds.length, 4);
  assert.deepEqual(assignmentSelectionPlan(tree, new Set(["unnumbered", "a"]), []).map(x => x.target.value), ["a", "unnumbered"]);
});

test("multi-selection saves every target once with bounded concurrency", async () => {
  const changes = Array.from({ length: 12 }, (_, index) => ({ target: { type: "post" as const, value: String(index), label: "Post" } }));
  const seen = new Set<string>();
  let running = 0, maximum = 0;
  const progress: number[] = [];
  const result = await saveAssignmentChanges(changes, async change => {
    running++; maximum = Math.max(maximum, running);
    await new Promise(resolve => setTimeout(resolve, 1));
    seen.add(change.target.value); running--;
  }, saved => progress.push(saved));
  assert.equal(seen.size, 12);
  assert.equal(maximum, 4);
  assert.deepEqual(progress, Array.from({ length: 12 }, (_, index) => index + 1));
  assert.deepEqual(result, { saved: 12, total: 12, error: "" });
});

test("a conflict reports partial success and stops scheduling the remainder", async () => {
  const changes = Array.from({ length: 20 }, (_, index) => ({ target: { type: "post" as const, value: String(index), label: "Post" } }));
  const attempted: string[] = [];
  const result = await saveAssignmentChanges(changes, async change => {
    attempted.push(change.target.value);
    if (change.target.value === "0") throw Error("Revision changed");
    await new Promise(resolve => setTimeout(resolve, 1));
  });
  assert.equal(attempted.length, 4);
  assert.deepEqual(result, { saved: 3, total: 20, error: "Revision changed" });
});
