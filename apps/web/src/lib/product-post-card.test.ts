import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ProductPostGroupPanel } from "../components/ProductPostGroupPanel";
import { productPostCardStatus, dimensionMatchedSeriesProducts, type ProductPostCardStatus } from "./product-post-card";
import type { AhlsellLookupProduct } from "./ahlsell-product-lookup";
import { TECHNICAL_EVALUATOR_VERSION, type TechnicalStatus } from "./technical-evaluation-model";

const approved = {status:"selected",product_snapshot:{source:"distributor_manual",approvedByUser:true,approvalStatus:"user_approved"}};
test("a pending change supersedes approval; selection alone never grants approval", () => {
  assert.equal(productPostCardStatus(approved,false),"approved");
  assert.equal(productPostCardStatus(approved,true),"review");
  assert.equal(productPostCardStatus({status:"selected"},false),"empty");
  assert.equal(productPostCardStatus(null,false,true),"excluded");
  assert.equal(productPostCardStatus(null,true),"review");
});
function candidate(article: string, dimension: TechnicalStatus, material: TechnicalStatus = "MATCH"): AhlsellLookupProduct {
  return {articleNumber:article,productName:"Stålrør",manufacturer:"",productUrl:"https://www.ahlsell.no/productVariantProxy/"+article,specifications:[],source:"catalog_search",
    technicalEvaluation:{version:TECHNICAL_EVALUATOR_VERSION,requirementRevision:"current",productId:article,evidenceRevision:"e",evaluatedAt:"2026-10-25",
      status: [dimension,material].includes("FAIL") ? "FAIL" : [dimension,material].includes("VERIFY") ? "VERIFY" : "MATCH",
      checks:[{requirementId:"dimension",property:"dn",label:"DN",mandatory:true,status:dimension,expected:"25",actual:"25",reason:"Test",evidence:[]},
        {requirementId:"material",property:"material",label:"Materiale",mandatory:true,status:material,expected:"Stål",actual:null,reason:"Test",evidence:[]}]}};
}
test("series proposals require proven dimensions and reject known conflicts, regardless of score", () => {
  const good=candidate("1000001","MATCH","VERIFY"), wrong=candidate("1000002","FAIL"), unknown=candidate("1000003","VERIFY"), material=candidate("1000004","MATCH","FAIL");
  unknown.matchScore=100; unknown.exactMatch=true;
  assert.deepEqual(dimensionMatchedSeriesProducts([good,good,wrong,unknown,material]).map(item=>item.articleNumber),["1000001"]);
  assert.equal(dimensionMatchedSeriesProducts([{...good,technicalEvaluation:undefined}]).length,0);
  assert.equal(dimensionMatchedSeriesProducts([{...good,technicalEvaluation:{...good.technicalEvaluation!,checks:[]}}]).length,0);
});
test("main card opens common requirements separately and status icons are not controls", () => {
  const html=renderToStaticMarkup(createElement(ProductPostGroupPanel,{
    group:{id:"parent",sourceId:"parent",number:"33.332.6",title:"VANNLEDNING",requirementIds:["a","b"]},
    source:{id:"parent",number:"33.332.6",title:"VANNLEDNING",text:"Materiale: Stål\nTrykk: PN12",pages:[1]},
    rows:[{id:"a",value_text:"DN25",value_json:{postNumber:"33.332.6.1",quantity:12,unit:"m"}},{id:"b",value_text:"DN32",value_json:{postNumber:"33.332.6.2",quantity:4,unit:"m"}}],
    statuses:new Map<string, ProductPostCardStatus>([["a","review"],["b","approved"]]),activeId:"a",seriesOpen:false,disabled:false,onSelect:()=>{},onSearchSeries:()=>{}
  }));
  assert(!html.includes('type="checkbox"'));
  assert.equal((html.match(/<button /g)??[]).length,4);
  assert.match(html,/Åpne hovedpost 33.332.6/);
  assert.match(html,/aria-haspopup="dialog"/);
  assert.doesNotMatch(html,/Trykk: PN12/);
  assert.match(html,/Til gjennomgang/); assert.match(html,/Godkjent/);
  assert.equal((html.match(/aria-current="true"/g)??[]).length,1);
  assert.match(html,/aria-controls="product-post-candidate-panel"/);
});
