import assert from "node:assert/strict";
import test from "node:test";
import { buildDocumentChapterWorkspace } from "./document-chapter-workspace";
import { chapterWorkspaceView } from "./chapter-main-posts";
import { chapterPostSection } from "./project-chapter-workspace";
import { emptyChapterOrganization, expandLegacyChapterPlacements, organizationSources, organizedChapterWorkspace, validateChapterOrganizationChange } from "./chapter-organization";

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

function reviewFamilyFixture() {
  const workspace=fixture();
  const source=workspace.chapters.shift()!;
  const productIds=["product","product2","product3"];
  workspace.chapters.unshift({...source,id:"review-family",kind:"review",
    sections:[{id:"family",sourceId:"main",number:"30.332.7",title:"Rørledning",requirementIds:productIds}],
    mainPosts:[{...source.mainPosts![0],requirementIds:productIds}]});
  productIds.forEach((id,index)=>{
    workspace.sources[id]={id,number:`30.332.7.${index+1}`,title:`DN${25+index*5}`,text:`Original ${id}`,pages:[2]};
    workspace.ancestors[id]=["main"];
  });
  workspace.chapters.push({id:"target",sourceId:null,number:"31",title:"Sanitär",sections:[]});
  workspace.organization.customChapters=[{id:"custom:second",title:"Eget kapitel"}];
  return workspace;
}

test("individual products can be split across chapters without moving siblings or rewriting their parent",()=>{
  const workspace=reviewFamilyFixture(), original=structuredClone(workspace);
  assert.deepEqual(organizationSources(workspace).filter(s=>s.groupId==="main").map(s=>s.id),["main","product","product2","product3"]);
  assert.deepEqual(organizationSources(workspace).find(s=>s.id==="main")?.requirementIds,[]);
  workspace.organization.placements={product:"target",product2:"custom:second"};
  assert.ok(!("error" in validateChapterOrganizationChange({revision:0,sourceIds:["product"],targetId:"target",newTitle:null},workspace)));
  for(const mode of ["pdf","main"] as const){
    const view=chapterWorkspaceView(workspace,mode);
    const owners=view.chapters.filter(c=>chapterPostSection(c).requirementIds.length);
    assert.equal(owners.length,3);
    assert.deepEqual(owners.flatMap(c=>chapterPostSection(c).requirementIds).sort(),["product","product2","product3"]);
    for(const [id,target] of [["product","target"],["product2","custom:second"],["product3","review-family"]]){
      const owner=owners.find(c=>chapterPostSection(c).requirementIds.includes(id))!;
      assert.ok(owner.id.includes(target));
      assert.deepEqual(owner.mainPosts?.[0].requirementIds,[id]);
      assert.equal(owner.mainPosts?.[0].sourceId,"main");
    }
    assert.deepEqual(view.ancestors,original.ancestors);
    assert.deepEqual(view.sources,original.sources);
  }
  const reloaded=JSON.parse(JSON.stringify(workspace));
  delete reloaded.organization.placements.product;
  assert.deepEqual(chapterPostSection(organizedChapterWorkspace(reloaded).chapters[0]).requirementIds,["product","product3"]);
});

test("moving only the main-post text does not move its products",()=>{
  const workspace=reviewFamilyFixture();workspace.organization.placements.main="target";
  const view=organizedChapterWorkspace(workspace);
  assert.deepEqual(chapterPostSection(view.chapters[0]).requirementIds,["product","product2","product3"]);
  assert.deepEqual(chapterPostSection(view.chapters.find(c=>c.id==="target")!).requirementIds,[]);
  assert.ok(chapterPostSection(view.chapters.find(c=>c.id==="target")!).textSourceIds?.includes("main"));
});

test("old whole-family placements expand once while explicit child placements win",()=>{
  const workspace=reviewFamilyFixture();workspace.organization.placements={main:"target",product2:"custom:second"};
  const saved=structuredClone(workspace.organization);
  const normalized=expandLegacyChapterPlacements(workspace,workspace.organization);
  assert.deepEqual(normalized.placements,{main:"target",product:"target",product2:"custom:second",product3:"target"});
  assert.deepEqual(workspace.organization,saved);
  workspace.organization=normalized;
  delete workspace.organization.placements.product;
  assert.ok(chapterPostSection(organizedChapterWorkspace(workspace).chapters[0]).requirementIds.includes("product"));
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
