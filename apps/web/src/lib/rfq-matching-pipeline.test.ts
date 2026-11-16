import test from "node:test";
import assert from "node:assert/strict";
import { matchMaterialRow } from "./material-import-matching";
import { highestScoredMaterialCandidate, type MaterialSearchInput } from "./material-import";
import type { AhlsellPublicCandidate } from "./ahlsell-public-match";
import type { AhlsellProductDetails } from "./ahlsell-product-subtitle";
import { AHLSELL_EVIDENCE_VERSION, buildAhlsellTechnicalEvidence } from "./ahlsell-technical-evidence";

const request = (description: string): MaterialSearchInput => ({ description, unit:"PCE", category:"", dimension:"", fittingDimension:"", dimensionKind:"unspecified", details:"", query:"", articleReferences:[] });
const product = (articleNumber: string, productName: string, subtitle = ""): AhlsellPublicCandidate => ({ articleNumber, productName, subtitle, manufacturer:"",
  productUrl:`https://www.ahlsell.no/products/test/${articleNumber}/`, specifications:[], source:"catalog_search" });
const details = (p: AhlsellPublicCandidate): AhlsellProductDetails => ({ articleNumber:p.articleNumber, subtitle:p.subtitle ?? null, specifications:p.specifications,
  snapshot:{ version:AHLSELL_EVIDENCE_VERSION, articleNumber:p.articleNumber, productName:p.productName, subtitle:p.subtitle ?? null,
    sourceUrl:p.productUrl, retrievedAt:new Date().toISOString(), description:null, specifications:p.specifications } });
const searchResult = (candidates: AhlsellPublicCandidate[]) => ({ candidates, searchUrl:"https://www.ahlsell.no/sok/", failedQueries:[], query:"test", queries:["test"], searchUrls:[], total:candidates.length, truncated:false });
const noNetwork: typeof fetch = async () => { throw new Error("Unexpected network request"); };

test("RFQ pipeline evaluates models before limiting detail requests and ignores compatibility prose", async () => {
  const wrong = Array.from({ length:24 }, (_, i) => ({ ...product(String(100000 + i), "Batterisett Milwaukee M18 FORGENRG-602"), description:"Leveres med lader M18 DBSC" }));
  const right = product("71868908", "Batterilader Milwaukee M18 DBSC");
  const result = await matchMaterialRow(request("MILWAUKEE LADER M18 DBSC"), {fetchImpl:noNetwork}, {
    search:async () => searchResult([...wrong, right]),
    details:async ({ items }) => {
      assert.deepEqual(items.map(p => p.articleNumber), [right.articleNumber]);
      return {[right.articleNumber]:details(right)};
    },
  });
  assert.equal(highestScoredMaterialCandidate(result.candidates, true)?.articleNumber, right.articleNumber);
});

test("RFQ variant expansion does not inherit the parent color and validates the selected variant", async () => {
  const blue = {...product("1800686", "Elektrotape 3M Scotch", "Elektrotape 35 19mmx20m blå"), manufacturer:"3M", specifications:["Farge: Blå"], familyCode:"tape35", variantCount:5};
  const yellow = product("1800687", "Elektrotape 3M Scotch", "Elektrotape 35 19mmx20m gul");
  const result = await matchMaterialRow(request("3M Scotch 35 Yellow PVC Electrical Tape, 19mm x 20m"), {fetchImpl:noNetwork}, {
    search:async ({maxVariantFamilies}) => { assert.equal(maxVariantFamilies, 0); return searchResult([blue]); },
    variants:async ({candidate}) => {
      assert.equal(candidate.subtitle, undefined);
      assert.ok(!candidate.specifications.some(s => /blå/i.test(s)));
      return [{...candidate, ...yellow, imageUrl:undefined, technicalEvidence:buildAhlsellTechnicalEvidence(details(yellow).snapshot!)}];
    },
    details:async ({items}) => Object.fromEntries(items.map(p => [p.articleNumber, details(p.articleNumber === yellow.articleNumber ? yellow : blue)])),
  });
  assert.equal(highestScoredMaterialCandidate(result.candidates, true)?.articleNumber, yellow.articleNumber);
  assert.equal(result.candidates.find(p => p.articleNumber === blue.articleNumber)?.rfqMatch?.status, "mismatch");
});

test("a variant's explicit package count beats a wrong pack and a different article cannot supply evidence", async () => {
  const fifty = product("100050", "Strips HellermannTyton T50R", "380mm x 7.6mm 50pk");
  const hundred = product("100100", "Strips HellermannTyton T50R", "380mm x 7.6mm 100pk");
  const input = request("HellermannTyton T50R Cable Ties 380mm x 7.6mm (100 pack)");
  const result = await matchMaterialRow(input, {fetchImpl:noNetwork}, {
    search:async () => searchResult([fifty, hundred]),
    details:async () => ({[fifty.articleNumber]:details(fifty), [hundred.articleNumber]:details(hundred)}),
  });
  assert.equal(highestScoredMaterialCandidate(result.candidates, true)?.articleNumber, hundred.articleNumber);
  assert.equal(result.candidates.find(p => p.articleNumber === fifty.articleNumber)?.rfqMatch?.status, "mismatch");
  const redirected = await matchMaterialRow(input, {fetchImpl:noNetwork}, {
    search:async () => searchResult([fifty]), details:async () => ({[fifty.articleNumber]:details(hundred)}),
  });
  assert.equal(highestScoredMaterialCandidate(redirected.candidates, true), undefined);
  assert.equal(redirected.candidates[0].subtitle, fifty.subtitle);
});
