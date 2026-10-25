import test from "node:test";
import assert from "node:assert/strict";
import { groupProductsByMainPost, resolvePostParents } from "./project-post-hierarchy";
import { buildDocumentChapterWorkspace } from "./document-chapter-workspace";
import { chapterWorkspaceView } from "./chapter-main-posts";
import { projectAssignmentIndex } from "./project-work-assignment";
import type { ProjectWorkPackage } from "./project-delivery-resource";

const row = (id: string, number: string, parent?: string, quantity?: number, doc = "v2", scope = "") => ({
  id, source_technical_description_document_id: doc, source_page: 16, value_text: id,
  value_json: { postNumber: number, parentPostNumber: parent, sourceOrder: Number(id.match(/\d+$/)?.[0] ?? 0), postScope: scope,
    sourceChapter: {title: "31 SANITÆR - 311 BUNNLEDNINGER FOR SANITÆRINSTALLASJONER"}, ...(quantity !== undefined ? {unit:"m",quantity} : {}) }
});
const v2 = [row("main0","31.311.2"),row("dn75-1","31.311.2.1","31.311.2",90),row("dn110-2","31.311.2.2","31.311.2",300),row("dn125-3","31.311.2.3","31.311.2",90),row("dn160-4","31.311.2.4","31.311.2",20),row("dn200-5","31.311.2.5","31.311.2",72)];
test("V2 five dimension rows stay below their actual main post in both chapter views", () => {
  const before=structuredClone(v2),workspace=buildDocumentChapterWorkspace(v2);
  assert.deepEqual(workspace.chapters[0].mainPosts?.map(g=>[g.number,g.requirementIds.length]),[["31.311.2",5]]);
  const main=chapterWorkspaceView(workspace,"main");
  assert.equal(main.chapters[0].title,"main0");
  assert.deepEqual(main.chapters[0].sections[0].requirementIds,v2.slice(1).map(r=>r.id));
  assert.deepEqual(v2,before);
});
test("Skeisvang A and B share printed numbers but never main-post identity or quantities",()=>{
  const a=[row("a0","D1.3.31.311.3111.3",undefined,undefined,"a"),row("a1","D1.3.31.311.3111.3.1","D1.3.31.311.3111.3",51,"a")];
  const b=[row("b0","D1.3.31.311.3111.3",undefined,undefined,"b"),row("b1","D1.3.31.311.3111.3.1","D1.3.31.311.3111.3",9,"b")];
  assert.deepEqual(groupProductsByMainPost([...a,...b]).map(g=>[g.id,g.requirementIds]),[["a0",["a1"]],["b0",["b1"]]]);
});
test("source IDs resolve without a parent number; a broken explicit ID never falls back to a guessed number",()=>{
  const main={...v2[0],value_json:{...v2[0].value_json,sourcePostId:"source-main"}};
  const child={...v2[1],value_json:{...v2[1].value_json,parentPostNumber:undefined,parentSourcePostId:"source-main"}};
  assert.equal(resolvePostParents([main,child]).parents.get(child.id),main.id);
  const broken={...child,value_json:{...child.value_json,parentRequirementId:"absent",parentPostNumber:"31.311.2"}};
  assert.equal(groupProductsByMainPost([main,broken])[0].review,true);
});
test("ambiguous numbers and table scopes are reviewed, never joined by truncating a product number",()=>{
  const duplicate={...v2[0],id:"duplicate0"};
  assert.ok(groupProductsByMainPost([...v2,duplicate]).every(g=>g.review));
  const standalone={...v2[1],value_json:{...v2[1].value_json,parentPostNumber:undefined}};
  assert.equal(groupProductsByMainPost([v2[0],standalone])[0].id,standalone.id);
  const otherScope={...v2[1],value_json:{...v2[1].value_json,postScope:"other-table"}};
  assert.equal(groupProductsByMainPost([v2[0],otherScope])[0].review,true);
});
test("leading zeros and letter prefixes survive; mixed product categories stay together",()=>{
  const rows=[row("p0","1403.33.331.1"),row("pipe1","1403.33.331.1.1","1403.33.331.1",72.6),row("bend2","1403.33.331.1.2","1403.33.331.1",38)];
  assert.equal(groupProductsByMainPost(rows).length,1);
  assert.equal(groupProductsByMainPost([row("only1","01.3",undefined,1)])[0].number,"01.3");
});
test("effective responsibility follows exact post, nearest main and chapter; explicit unassigned blocks inheritance",()=>{
  const pkg=(id:string,type:ProjectWorkPackage['scope_type'],value:string,mode:ProjectWorkPackage['assignment_mode']='explicit'):ProjectWorkPackage=>({id,scope_type:type,scope_value:value,assigned_to:id,due_date:null,note:'',revision:0,assignment_mode:mode});
  const chapter=pkg('chapter','pdf_chapter',v2[0].id), main=pkg('main','main_post',v2[0].id), override=pkg('override','post',v2[1].id,'unassigned');
  let result=projectAssignmentIndex(v2,[chapter,main,override]);
  assert.equal(result.get(v2[1].id)?.id,'override');assert.equal(result.get(v2[2].id)?.id,'main');
  result=projectAssignmentIndex(v2,[chapter,main,{...override,assignment_mode:'inherit'}]);
  assert.equal(result.get(v2[1].id)?.id,'main');
});

test("explicit IDs are independent of sorting; cycles are reviewed without hanging",()=>{
  const a={...v2[0],id:'a',value_json:{...v2[0].value_json,parentRequirementId:'b'}};
  const b={...v2[1],id:'b',value_json:{...v2[1].value_json,parentRequirementId:'a'}};
  assert.equal(groupProductsByMainPost([a,b])[0].review,true);
  const parent={...v2[0],value_json:{...v2[0].value_json,sourceOrder:10}};
  const child={...v2[1],value_json:{...v2[1].value_json,parentRequirementId:parent.id}};
  assert.equal(resolvePostParents([parent,child]).parents.get(child.id),parent.id);
});
test("a PDF chapter title repeated in separate table/building scopes stays separate",()=>{
  const a={...v2[1],value_json:{...v2[1].value_json,parentPostNumber:undefined,postScope:'A'}};
  const b={...a,id:'other-building',value_json:{...a.value_json,postScope:'B'}};
  const w=buildDocumentChapterWorkspace([a,b]);
  assert.equal(w.chapters.length,2);assert.notEqual(w.chapters[0].id,w.chapters[1].id);
});

test("a changed continuation caption cannot split a verified main-post family",()=>{
  const last={...v2[5],value_json:{...v2[5].value_json,sourceChapter:{title:'32 VARME'}}};
  const workspace=buildDocumentChapterWorkspace([...v2.slice(0,5),last]);
  const families=workspace.chapters.flatMap(c=>c.mainPosts ?? []);
  assert.equal(families.length,1);assert.equal(families[0].requirementIds.length,5);
  const ids=workspace.chapters.flatMap(c=>c.sections.flatMap(s=>s.requirementIds));
  assert.equal(ids.length,5);assert.equal(new Set(ids).size,5);
});
