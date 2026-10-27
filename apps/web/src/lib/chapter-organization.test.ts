import assert from "node:assert/strict";
import test from "node:test";
import { buildDocumentChapterWorkspace } from "./document-chapter-workspace";
import { chapterWorkspaceView } from "./chapter-main-posts";
import { chapterPostSection } from "./project-chapter-workspace";
import { emptyChapterOrganization, organizationSources, organizedChapterWorkspace, validateChapterOrganizationChange } from "./chapter-organization";

function fixture() {
  const rows = [
    { id:"main", source_document_id:"doc", source_page:1, value_text:"Rørledning", value_json:{postNumber:"30.332.7", sourceOrder:1, sourceChapter:{title:"30 VVS"},sourceText:"Materiale: Stål"}},
    { id:"product", source_document_id:"doc", source_page:2, value_text:"DN25", value_json:{postNumber:"30.332.7.1",parentPostNumber:"30.332.7",sourceOrder:2,sourceChapter:{title:"30 VVS"},quantity:126,unit:"m"}},
    ...["one","two"].map((id,index)=>({id,source_document_id:"doc",source_page:index+3,value_text:`Text ${id}`,value_json:{sourceText:`Originaltext ${id}`,reviewFlags:["unassigned-source-text"]}}))
  ];
  return { ...buildDocumentChapterWorkspace(rows), organization:emptyChapterOrganization(), canOrganize:true };
}
test("review text moves to an existing chapter without changing any source or product family",()=>{
  const workspace=fixture(), before=structuredClone(workspace), destination=workspace.chapters[0].id;
  workspace.organization.placements.one=destination;
  const expected=structuredClone(workspace), projected=organizedChapterWorkspace(workspace);
  assert.deepEqual(projected.sources,before.sources);
  assert.deepEqual(projected.ancestors,before.ancestors);
  assert.deepEqual(chapterPostSection(projected.chapters[0]).requirementIds,["product"]);
  assert.deepEqual(projected.chapters[0].mainPosts,workspace.chapters[0].mainPosts);
  assert.ok(chapterPostSection(projected.chapters[0]).textSourceIds?.includes("one"));
  assert.deepEqual(projected.chapters.find(c=>c.kind==="review")?.sections.map(s=>s.sourceId),["two"]);
  assert.deepEqual(workspace,expected);
  assert.deepEqual(organizationSources(workspace).map(s=>s.id),["one","two"]);
});
test("custom chapters survive serialization and a move can be changed or undone",()=>{
  const workspace=fixture();
  workspace.organization={revision:3,customChapters:[{id:"custom:test",title:"Gemensamma krav"}],placements:{one:"custom:test",two:"custom:test"}};
  const reloaded=JSON.parse(JSON.stringify(workspace));
  for(const mode of ["pdf","main"] as const){
    const view=chapterWorkspaceView(reloaded,mode), chapter=view.chapters.find(c=>c.id==="custom:test")!;
    assert.equal(chapter.title,"Gemensamma krav");
    assert.deepEqual(chapterPostSection(chapter).textSourceIds,["one","two"]);
    assert.deepEqual(chapterPostSection(chapter).requirementIds,[]);
    assert.equal(view.chapters.some(c=>c.kind==="review"),false);
  }
  workspace.organization.placements.one=workspace.chapters[0].id;
  delete workspace.organization.placements.two;
  const changed=organizedChapterWorkspace(workspace);
  assert.deepEqual(changed.chapters.find(c=>c.kind==="review")?.sections.map(s=>s.sourceId),["two"]);
  assert.ok(chapterPostSection(changed.chapters[0]).textSourceIds?.includes("one"));
  assert.equal(changed.chapters.find(c=>c.id==="custom:test")?.sections.length,0);
});
test("PDF chapter text stays available exactly once in main-post view and is not inherited",()=>{
  const workspace=fixture();workspace.organization.placements.one=workspace.chapters[0].id;
  const view=chapterWorkspaceView(workspace,"main");
  const textChapters=view.chapters.filter(c=>chapterPostSection(c).textSourceIds?.includes("one"));
  assert.equal(textChapters.length,1);
  assert.deepEqual(chapterPostSection(textChapters[0]).requirementIds,[]);
  assert.equal(view.chapters.flatMap(c=>chapterPostSection(c).requirementIds).filter(id=>id==="product").length,1);
  assert.ok(!view.ancestors.product.includes("one"));
});
test("missing targets keep their original review text available and arbitrary product IDs cannot be moved",()=>{
  const workspace=fixture();workspace.organization.placements.one="removed-chapter";
  assert.deepEqual(organizedChapterWorkspace(workspace).chapters.find(c=>c.kind==="review")?.sections.map(s=>s.sourceId),["one","two"]);
  const valid={revision:0,sourceIds:["one"],targetId:workspace.chapters[0].id,newTitle:null};
  assert.deepEqual(validateChapterOrganizationChange(valid,workspace),valid);
  for(const patch of [{sourceIds:["product"]},{sourceIds:["foreign"]},{sourceIds:["one","one"]},{sourceIds:[]},{targetId:"missing"},{newTitle:""},{newTitle:3},{revision:-1},{newTitle:"New"}])
    assert.ok("error" in validateChapterOrganizationChange({...valid,...patch},workspace));
  assert.deepEqual(validateChapterOrganizationChange({...valid,targetId:null,newTitle:"  Nytt kapitel  "},workspace),{...valid,targetId:null,newTitle:"Nytt kapitel"});
});

test("moving a review main post keeps every child together in both views and supports undo",()=>{
  const workspace=fixture();
  const source=workspace.chapters.shift()!;
  workspace.chapters.unshift({...source,id:"review-family",kind:"review"});
  workspace.chapters.push({id:"target",sourceId:null,number:"31",title:"Sanitär",sections:[]});
  const original=structuredClone(workspace);
  assert.equal(organizationSources(workspace).find(s=>s.id==="main")?.requirementIds[0],"product");
  assert.ok(!organizationSources(workspace).some(s=>s.id==="product"));
  workspace.organization.placements.main="target";
  for(const mode of ["pdf","main"] as const){
    const view=chapterWorkspaceView(workspace,mode);
    assert.equal(view.chapters.flatMap(c=>chapterPostSection(c).requirementIds).filter(id=>id==="product").length,1);
    assert.ok(!view.chapters.find(c=>c.id==="review-family"));
    const owner=view.chapters.find(c=>chapterPostSection(c).requirementIds.includes("product"))!;
    assert.ok(owner.id.includes("target"));
    assert.equal(owner.mainPosts?.[0].sourceId,"main");
    assert.deepEqual(view.ancestors,original.ancestors);
    assert.deepEqual(view.sources,original.sources);
  }
  delete workspace.organization.placements.main;
  assert.deepEqual(chapterPostSection(organizedChapterWorkspace(workspace).chapters[0]).requirementIds,["product"]);
});

test("standalone review products can be placed without manufacturing a parent or losing source text",()=>{
  const workspace={...buildDocumentChapterWorkspace([
    {id:"unplaced-product",source_document_id:"doc",source_page:2,value_text:"DN25",source_excerpt:"DN25 original",value_json:{quantity:126,unit:"m",sourceText:"DN25 original"}},
    {id:"text",source_document_id:"doc",source_page:3,value_text:"Information",value_json:{sourceText:"All text",reviewFlags:["unassigned-source-text"]}}
  ]),organization:emptyChapterOrganization()};
  const sources=organizationSources(workspace);
  assert.equal(sources.find(s=>s.id==="unplaced-product")?.text,"DN25 original");
  assert.deepEqual(sources.find(s=>s.id==="unplaced-product")?.requirementIds,["unplaced-product"]);
  workspace.organization.customChapters=[{id:"custom:test",title:"Eget kapitel"}];
  workspace.organization.placements={"unplaced-product":"custom:test",text:"custom:test"};
  assert.ok(!("error" in validateChapterOrganizationChange({revision:0,sourceIds:["unplaced-product"],targetId:"custom:test",newTitle:null},workspace)));
  for(const mode of ["pdf","main"] as const){
    const view=chapterWorkspaceView(workspace,mode);
    assert.deepEqual(view.chapters.flatMap(c=>chapterPostSection(c).requirementIds),["unplaced-product"]);
    assert.equal(view.chapters.filter(c=>chapterPostSection(c).textSourceIds?.includes("text")).length,1);
    assert.deepEqual(view.ancestors["unplaced-product"],[]);
  }
});
