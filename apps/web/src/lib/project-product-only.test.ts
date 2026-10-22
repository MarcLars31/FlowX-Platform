import assert from "node:assert/strict";
import test from "node:test";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {visibleProjectRequirements,productPostMeasurement} from "./project-requirement-views";
import {compactProjectRequirement} from "./project-overview";
import {projectRequirementDetails} from "./project-requirement-details";
import {productPostNavigationGroups,productChapterContents} from "./product-post-tree";
import {withEffectiveRequirements,requirementForSearch} from "./effective-requirements";
import {ProductPostNavigation} from "../components/ProductPostNavigation";
import {createProjectDeliveryResource} from "./project-delivery-resource";

test("own unit, amount or RS suffices, including zero, unit-only, quantity-only and legacy information flags",()=>{
 const values=[{unit:"st",quantity:2},{unit:"M"},{quantity:0},{quantity:"2,00"},{unit:"RS"},{unit:"rund sum"},
  {unit:"m²",reviewFlags:["project-information"]},{pdfColumnValues:{unit:"pakke",quantity:""}},
  {pdfColumnValues:{unit:"",quantity:"ca. 4"}},{quantityText:"Rund sum RS"}];
 const rows=values.map((value_json,index)=>({id:String(index),value_json}));
 assert.deepEqual(visibleProjectRequirements(rows),rows);
 assert.deepEqual(visibleProjectRequirements(rows.map(compactProjectRequirement)).map(r=>r.id),rows.map(r=>r.id));
 assert.equal(productPostMeasurement(rows[1]).missingQuantity,true);
 assert.equal(productPostMeasurement(rows[2]).missingQuantity,false);
 assert.equal(productPostMeasurement(rows[4]).missingQuantity,false);
 assert.ok(projectRequirementDetails(rows[1]).sourceWarnings?.some(w=>w.includes("mängd saknas")));
});
test("prose, dimensions, price, inherited RS and empty actual columns cannot create product cards",()=>{
 const rows=[
  {id:"text",value_text:"Antall 2 st for annet utstyr. DN80, 12 bar, 30 mm.",value_json:{attributes:{antall:2,trykk:"12 bar"}}},
  {id:"parent-rs",value_json:{technicalSpecification:"Hovedpost\nRund sum RS\nUNDERPOST\nKravtekst"}},
  {id:"prose-rs",source_excerpt:"Alle kostnader inngår i rund sum",value_json:{}},
  {id:"empty-columns",value_json:{quantity:1,unit:"st",pdfColumnValues:{unit:"",quantity:""}}},
  {id:"price-only",value_json:{price:20,sum:400,pdfColumnValues:{unit:"",quantity:""}}},
  {id:"placeholder",value_json:{unit:"?",quantity:""}},
  {id:"technical-unit",value_json:{unit:"bar"}},
  {id:"rejected",status:"rejected",value_json:{unit:"RS"}},
  {id:"superseded",status:"superseded",value_json:{unit:"m",quantity:5}}
 ];
 assert.deepEqual(visibleProjectRequirements(rows),[]);
 assert.deepEqual(visibleProjectRequirements(rows.map(compactProjectRequirement)),[]);
});
test("a measured chapter with an obsolete information flag remains a normal selectable product",()=>{
 const row={id:"chapter-rs",value_json:{postNumber:"30.1",sourceChapter:{title:"30.1 Komplett anlegg"},chapterInformation:true,unit:"RS"}};
 const groups=productPostNavigationGroups(visibleProjectRequirements([row]),[row]);
 assert.deepEqual(productChapterContents(groups[0]).requirements,[row]);
 assert.deepEqual(productChapterContents(groups[0]).chapterPosts,[]);
});
test("hidden text ancestors cannot return through the list, counts or card navigation, while source requirements survive",()=>{
 const chapter={title:"30 VVS"};
 const parent={id:"text-parent",value_text:"Rørledning",source_excerpt:"30.1 Rørledning\nMateriale: Kobber\nTrykk: PN16\nAlle festedeler inngår.",value_json:{postNumber:"30.1",sourceChapter:chapter,attributes:{materiale:"Kobber",trykk:"PN16"}}};
 const child={id:"measured",value_text:"DN25",value_json:{postNumber:"30.1.1",parentPostNumber:"30.1",sourceChapter:chapter,unit:"m",quantity:12,
  attributes:{dimensjon:"DN25"},technicalSpecification:parent.source_excerpt+"\n\nUNDERPOST\n30.1.1 DN25\nLengde m 12"}};
 const other={id:"text-only",source_excerpt:"30.2 Generelle krav\nAlt skal inngå.",value_json:{postNumber:"30.2",sourceChapter:chapter}};
 const rows=[parent,child,other],before=JSON.stringify(rows);
 const expectedSearch=requirementForSearch(child),expectedEffective=withEffectiveRequirements(child);
 const groups=productPostNavigationGroups(visibleProjectRequirements(rows.map(compactProjectRequirement)),rows.map(compactProjectRequirement));
 assert.deepEqual(groups.flatMap(g=>g.requirements.map(r=>r.id)),["measured"]);
 assert.deepEqual(groups.flatMap(g=>productChapterContents(g).chapterPosts),[]);
 const html=renderToStaticMarkup(createElement(ProductPostNavigation,{groups,requirements:rows,projectId:"test",resource:createProjectDeliveryResource("test"),
  expandedKeys:new Set(groups.map(g=>g.key)),onToggle:()=>{},onSelect:()=>true,handledIds:new Set<string>(),disabled:false}));
 assert.match(html,/id="product-post-row-measured"/);
 assert.doesNotMatch(html,/id="product-post-row-text-parent"|id="product-post-row-text-only"|Åpne kapitteltekst/);
 assert.equal(JSON.stringify(rows),before);
 assert.deepEqual(requirementForSearch(child),expectedSearch);
 assert.deepEqual(withEffectiveRequirements(child),expectedEffective);
 assert.match(JSON.stringify(expectedSearch),/Kobber/);
 assert.match(JSON.stringify(expectedEffective),/PN16/);
});
