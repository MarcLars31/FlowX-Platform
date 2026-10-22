import assert from "node:assert/strict";
import test from "node:test";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {ChapterOverview,ChapterRequirements,ChapterSectionProgress} from "@/components/ChapterWorkspaceNavigation";
import {buildChapterWorkspace} from "./project-chapter-workspace";

test("information chapters stay accessible without a misleading 0 of 0 product count", () => {
  const workspace=buildChapterWorkspace([{id:"info",value_text:"Generelle krav",source_page:1,
    value_json:{postNumber:"30.1",sourceText:"Hele kravteksten skal bevares."}},
    {id:"main",value_text:"Sanitær",source_page:2,value_json:{postNumber:"30.31"}},
    {id:"post",value_text:"Rør",source_page:3,value_json:{postNumber:"30.31.1",parentPostNumber:"30.31",quantity:100,unit:"m"}}]);
  const html=renderToStaticMarkup(createElement(ChapterOverview,{workspace,expanded:"info",selected:new Set(["post"]),onToggle:()=>{},onOpen:()=>{}}));
  assert.doesNotMatch(html,/0 av 0|0<!-- --> av <!-- -->0/);
  assert.match(html,/Kravtext/);
  assert.match(html,/1 av 1 valda/);
  const chapter=workspace.chapters.find(c=>c.id==="info")!;
  const body=renderToStaticMarkup(createElement(ChapterRequirements,{workspace,chapter,section:chapter.sections[0]}));
  assert.match(body,/Hele kravteksten skal bevares/);
});

test("uncertain PDF fragments are review text, not inherited chapter requirements", () => {
  const workspace=buildChapterWorkspace([{id:"fragment",value_text:"Uavklart tekst fra PDF – side 8",source_page:8,
    value_json:{sourceText:"Prisen inkluderer oppfyllelse av krav i post 30.1 og 30.2.",reviewFlags:["unassigned-source-text"]}}]);
  const chapter=workspace.chapters[0];
  const html=renderToStaticMarkup(createElement(ChapterOverview,{workspace,expanded:chapter.id,selected:new Set<string>(),onToggle:()=>{},onOpen:()=>{}}));
  assert.match(html,/PDF-text att kontrollera/);
  assert.match(html,/Behöver kontroll/);
  assert.doesNotMatch(html,/Uavklart|0 av 0/);
  const body=renderToStaticMarkup(createElement(ChapterRequirements,{workspace,chapter,section:chapter.sections[0]}));
  assert.match(body,/Prisen inkluderer oppfyllelse av krav i post 30.1 og 30.2./);
  assert.match(body,/PDF-text för kontroll/);
  assert.doesNotMatch(body,/Huvudkapitlets krav/);
});

test("opening an information or review section never displays zero of zero selections", () => {
  const section={id:"text",sourceId:"text",number:"30.1",title:"Generelle krav",requirementIds:[] as string[]};
  const chapter={id:"chapter",sourceId:"chapter",number:"30",title:"VVS",sections:[section]};
  const render=(review:boolean,ids:string[])=>renderToStaticMarkup(createElement(ChapterSectionProgress,{
    chapter:{...chapter,...(review?{kind:"review" as const}:{})},section:{...section,requirementIds:ids},selected:new Set(["one"])}));
  assert.match(render(false,[]),/Kravtext · inga egna produktval/);
  assert.match(render(true,[]),/PDF-text som behöver kontrolleras/);
  assert.match(render(false,["one","two"]),/2 poster · 1 av 2 valda/);
  assert.doesNotMatch(render(false,[])+render(true,[]),/0 av 0/);
});
