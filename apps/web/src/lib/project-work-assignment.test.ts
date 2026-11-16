import assert from "node:assert/strict";
import test from "node:test";
import { chapterAssignmentTarget, projectAssignmentIndex } from "./project-work-assignment";
import type { ProjectWorkPackage } from "./project-delivery-resource";

test("post responsibility overrides its PDF chapter without spilling into children or other documents", () => {
  const row = (id: string, postNumber: string | null, document = "a") => ({id, category:"pipe",source_document_id:document,value_json:{postNumber,sourceChapter:{title:"40 Cable routing"}}});
  const rows = [row("1","40.1"),row("2","40.1.1"),row("3",null),row("4","40.1","b")];
  const pkg = (id:string,scope_type:ProjectWorkPackage["scope_type"],scope_value:string):ProjectWorkPackage => ({id,scope_type,scope_value,assigned_to:id,due_date:null,note:"",revision:0});
  const assignments=[pkg("group","group","pipe"),pkg("legacy","chapter","40"),pkg("chapter","pdf_chapter","1"),pkg("person","post","1"),pkg("intro","post","3")];
  const index=projectAssignmentIndex(rows,assignments);
  assert.equal(index.get("1")?.id,"person");
  assert.equal(index.get("2")?.id,"chapter");
  assert.equal(index.get("3")?.id,"intro");
  assert.equal(index.get("4")?.id,"legacy");
  assert.equal(chapterAssignmentTarget({title:"40",requirements:[rows[2],rows[0],rows[1]]}).value,"1");
});
