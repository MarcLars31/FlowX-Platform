import assert from "node:assert/strict";
import test from "node:test";
import { lookupAhlsellProductSeries } from "./ahlsell-product-series";
import { assessAhlsellLookupCandidates } from "./ahlsell-hybrid-matching";
import { dimensionMatchedSeriesProducts } from "./product-post-card";

const card = {name:"Stålrør DN25",mostRelevantVariantId:"1111111",firstVariationPageUrl:"/products/ror/1111111/",code:"family",numberOfVariants:2,brand:"Fixture"};
const variants = {settings:{headers:{"0":"Nominell diameter","1":"Materiale"}},items:[
  {code:"1111111",productName:"Stålrør DN25",url:"/products/ror/1111111/",buyable:true,attributes:{"0":{value:"DN25"},"1":{value:"Stål"}}},
  {code:"2222222",productName:"Stålrør DN32",url:"/products/ror/2222222/",buyable:true,attributes:{"0":{value:"DN32"},"1":{value:"Stål"}}}
]};
const fetchFixture: typeof fetch = async input => Response.json(String(input).includes('/variants?') ? variants : {productCount:1,productCards:[card]});
test("resolves actual family variants without copying seed dimensions or evidence", async()=>{
  const result=await lookupAhlsellProductSeries({query:"1111111",market:"no",fetchImpl:fetchFixture});
  assert.deepEqual(result.products.map(product=>product.articleNumber),["1111111","2222222"]);
  assert.deepEqual(result.products[1].specifications,["Nominell diameter: DN32","Materiale: Stål"]);
  assert.equal(result.products[1].technicalEvidence?.articleNumber,"2222222");
  for (const [dimension,article] of [[25,"1111111"],[32,"2222222"]] as const) {
    const requirement={id:"post",value_text:`DN${dimension} komplett med rør og deler`,value_json:{postNumber:`33.332.6.${dimension}`,unit:"m",quantity:10,attributes:{Materiale:"Stål",Dimensjon:`DN${dimension}`}}};
    const assessed=assessAhlsellLookupCandidates(requirement,result.products);
    assert.deepEqual(dimensionMatchedSeriesProducts(assessed).map(product=>product.articleNumber),[article]);
  }
});
test("does not substitute a different family for an absent article",async()=>{
  const result=await lookupAhlsellProductSeries({query:"3333333",market:"no",fetchImpl:fetchFixture});
  assert.deepEqual(result.products,[]);
});
test("ambiguous families never produce automatic proposals",async()=>{
  const result=await lookupAhlsellProductSeries({query:"1111111",market:"no",fetchImpl:async input=>Response.json(String(input).includes('/variants?') ? variants : {productCount:2,productCards:[card,{...card,code:"other-family",mostRelevantVariantId:"2222222"}]})});
  assert.deepEqual(result.products,[]);
});
test("rejects arbitrary URLs and supports cancellation without supplier requests",async()=>{
  let calls=0;
  const fetchImpl:typeof fetch=async()=>{calls++;return Response.json({});};
  await assert.rejects(lookupAhlsellProductSeries({query:"https://example.com/private",market:"no",fetchImpl}));
  const controller=new AbortController();controller.abort();
  await assert.rejects(lookupAhlsellProductSeries({query:"1111111",market:"no",fetchImpl,signal:controller.signal}));
  assert.equal(calls,0);
});
