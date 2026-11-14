import assert from "node:assert/strict";
import test from "node:test";
import data from "@/data/sprinkler-reference-products.json";
import { sprinklerReferenceSearchHints } from "./sprinkler-reference-search";
import { initialMaterialReview, parseMaterialSheets, type MaterialSearchInput } from "./material-import";
import { materialRequirement, matchMaterialRow } from "./material-import-matching";
import { ahlsellRequirementIntent } from "./ahlsell-requirement-intent";
import { rankAhlsellCandidates } from "./ahlsell-candidate-ranking";
import { technicalConflictWarnings } from "./ahlsell-technical-conflicts";
import { AHLSELL_EVIDENCE_VERSION, buildAhlsellTechnicalEvidence, type AhlsellEvidenceSnapshot } from "./ahlsell-technical-evidence";
import { materialDimensionMatch } from "./material-import-scoring";
import type { AhlsellPublicCandidate } from "./ahlsell-public-match";
import type { AhlsellCatalogResult } from "./ahlsell-public-catalog";

const input = (description: string, dimension = "", kind: MaterialSearchInput["dimensionKind"] = "unspecified"): MaterialSearchInput => ({
  description, dimension, dimensionKind: kind, fittingDimension: "", unit: "stk", category: "", query: "", details: ""
});
const requirement = (description: string, dimension = "", kind: MaterialSearchInput["dimensionKind"] = "unspecified") => materialRequirement(input(description, dimension, kind));
function article(number: string) {
  const row = data.products.find(product => product.articleNumber === number)!;
  assert.ok(row);
  const snapshot: AhlsellEvidenceSnapshot = { version: AHLSELL_EVIDENCE_VERSION, articleNumber: number, sourceUrl: row.productUrl,
    retrievedAt: new Date().toISOString(), productName: row.productName, subtitle: row.subtitle, description: null, specifications: row.specifications };
  const technicalEvidence = buildAhlsellTechnicalEvidence(snapshot);
  const product: AhlsellPublicCandidate = { articleNumber: number, productName: row.productName, subtitle: row.subtitle,
    manufacturer: "", productUrl: row.productUrl, specifications: row.specifications, source: "catalog_search", technicalEvidence };
  return { product, detail: { articleNumber: number, subtitle: row.subtitle, specifications: row.specifications, snapshot, technicalEvidence } };
}
const searchResult = (candidates: AhlsellPublicCandidate[]): AhlsellCatalogResult => ({ candidates, query: "fixture", queries: ["fixture"], searchUrl: "https://www.ahlsell.no/search", searchUrls: [], total: candidates.length, truncated: false });
const offline: typeof fetch = async () => { throw new Error("Unexpected network access"); };

test("DN column survives import; unspecified dimensions and source NRF never become asserted requirements", () => {
  const { rows } = parseMaterialSheets([{ name: "Test", rows: [
    { number: 1, cells: ["Beskrivelse", "DN", "Dimensjon", "Enhet", "Antall", "NRF-nummer"] },
    { number: 2, cells: ["Bend Sprinkler", "100", "", "stk", "1", "9253432"] },
    { number: 3, cells: ["T-rør Sprinkler", "", "100-100-32", "stk", "1", "9253109"] },
    { number: 4, cells: ["Bend Sprinkler", "100", "114.3", "stk", "1", "9253432"] }
  ] }]);
  assert.equal(initialMaterialReview(rows[0]).input.dimensionKind, "dn");
  assert.equal(initialMaterialReview(rows[0]).input.dimension, "100");
  assert.doesNotMatch(JSON.stringify(initialMaterialReview(rows[0]).input), /9253432/);
  assert.equal(rows[1].fittingDimension, "100-100-32");
  assert.equal(initialMaterialReview(rows[1]).input.dimensionKind, "unspecified");
  assert.ok(rows[2].issues.length);
});

test("schedule product vocabulary separates couplings, branches, reducers and crosses from pipes and heads", () => {
  for (const [description, intent] of [
    ["Rillekupling fleksibel - Sprinkler - Smørefri", "coupling"],
    ["KRA.017.02 3322 Stålrør T-Rør Sprinkler (Anborringsklammer)", "branch"],
    ["KRA.017.04 3322 Stålrør Overgang Sprinkler", "reducer"],
    ["KRA.017.03 3322 Stålrør Kryss Sprinkler", "generic"],
    ['UZA.002.01 3324 Oppadrettet standard 1/2" SSU K80 QR Messing 68 grader', "sprinkler_head"]
  ]) assert.equal(ahlsellRequirementIntent(requirement(description)), intent, description);
});

test("steel-pipe fitting grouping does not invent steel fitting body material; explicit steel stays required", () => {
  const fitting = requirement("KRA.017.01 3322 Stålrør Bend Sprinkler", "100", "dn");
  assert.doesNotMatch(JSON.stringify((fitting.value_json as {attributes:object}).attributes), /Materiale/);
  assert.match(JSON.stringify(fitting), /Stålrør Bend Sprinkler/);
  assert.deepEqual(sprinklerReferenceSearchHints(fitting), ["9253432"]);
  assert.match(JSON.stringify(requirement("Bend i stål Sprinkler", "100", "dn")), /Materiale/);
  assert.match(JSON.stringify(requirement("Normaltykke Stålrør Sprinkler", "100", "dn")), /Materiale/);
});

test("named sprinkler variants keep orientation, temperature, response and thread requirements", () => {
  for (const [temperature, number] of [[68, "9254043"], [93, "9255008"]] as const) {
    const req = requirement(`Oppadrettet standard 1/2" SSU K80 QR Messing ${temperature} grader`);
    assert.deepEqual(sprinklerReferenceSearchHints(req), [number]);
    const attrs = (req.value_json as {attributes:Record<string,string>}).attributes;
    assert.equal(attrs.DN, "15");
    assert.equal(attrs.Respons, "QR");
    assert.equal(attrs["Utløsningstemperatur"], `${temperature} °C`);
    const wrong = rankAhlsellCandidates(req, [article(temperature === 68 ? "9255008" : "9254043").product])[0];
    assert.ok(technicalConflictWarnings(wrong).length);
  }
});

test("all six rigid articles fail a flexible coupling requirement without acquiring reference preference", () => {
  for (const [dn, number] of [[32,"1452323"],[50,"1452325"],[65,"1452326"],[80,"1452327"],[100,"1452328"],[150,"1452330"]] as const) {
    const req = requirement("Rillekupling fleksibel - Sprinkler - Smørefri", String(dn), "dn");
    assert.deepEqual(sprinklerReferenceSearchHints(req), []);
    const candidate = rankAhlsellCandidates(req, [article(number).product])[0];
    assert.match(technicalConflictWarnings(candidate).join(" "), /fast och flexibel/);
    assert.equal(candidate.exactMatch, false);
    assert.ok(candidate.matchScore! <= 34);
  }
});

test("unknown dimensions, mixed ports, assemblies and conflicting dry heads do not get a learned article", () => {
  for (const req of [
    requirement("Stålrør Bend Sprinkler", "100"),
    requirement("Stålrør Bend Sprinkler", "114.3", "outside"),
    requirement("Stålrør Kryss Sprinkler", "100", "dn"),
    requirement('Nedadrettet med vannskjerm 1/2" SSP K80 QR Messing 68 grader'),
    requirement('Tørrhode nedadrettet i himling 1/2" SSP K80 QR Hvit 68 grader (300mm)'),
    requirement('Tørrhode sidewall 1/2" K80 SR Hvit 68 grader (300mm)'),
    materialRequirement({...input("Stålrør T-Rør Sprinkler"),fittingDimension:"100-100-32"})
  ]) assert.deepEqual(sprinklerReferenceSearchHints(req), []);
  assert.ok(!sprinklerReferenceSearchHints(requirement('Nedadrettet standard 1/2" SSP K80 QR Messing 68 grader')).includes("9257329"));
  assert.ok(!data.products.some(product => product.articleNumber === "3253502"));
});

test("all equal documented ports can establish DN; different or unreadable ports cannot", () => {
  const base = article("9253432").detail.snapshot;
  const candidate = (specifications:string[]): AhlsellPublicCandidate => ({...article("9253432").product, subtitle:"", technicalEvidence:buildAhlsellTechnicalEvidence({...base,subtitle:"",specifications})});
  const row = input("Bend Sprinkler", "100", "dn");
  assert.equal(materialDimensionMatch(row,candidate(["Nominell diameter tilkobling 1: DN 100","Nominell diameter tilkobling 2: DN 100"])).status,"match");
  for(const ports of [["DN 100","DN 50"],["DN 100","Ukjent"]]) assert.equal(materialDimensionMatch(row,candidate(ports.map((port,index)=>`Nominell diameter tilkobling ${index+1}: ${port}`))).status,"unknown");
});

test("exact article lookup adds a missed candidate and its live evidence wins over a sparse duplicate", async () => {
  const fixture=article("9253432");
  const row=input("KRA.017.01 3322 Stålrør Bend Sprinkler","100","dn");
  const lookups:string[]=[];
  const result=await matchMaterialRow(row,{fetchImpl:offline},{
    search:async()=>searchResult([{...fixture.product,subtitle:"",technicalEvidence:undefined,specifications:[]}]),
    lookup:async({query})=>{lookups.push(String(query));return {products:[fixture.product],searchUrl:fixture.product.productUrl};},
    details:async()=>({"9253432":fixture.detail})
  });
  assert.deepEqual(lookups,["9253432"]);
  assert.equal(result.candidates[0].articleNumber,"9253432");
  assert.equal(result.candidates[0].dimensionMatch?.status,"match");
  assert.equal(result.candidates[0].identityVerified,true);
  assert.ok(result.warnings.some(warning=>/Böjvinkel saknas/.test(warning)));
});

test("failed lookup and replacement IDs never turn static index facts into a result",async()=>{
  const row=input("Stålrør Bend Sprinkler","100","dn");
  for(const replace of [false,true]){
    const result=await matchMaterialRow(row,{fetchImpl:offline},{search:async()=>searchResult([]),
      lookup:async()=>{if(!replace)throw new Error("fixture outage");return {products:[article("9253434").product],searchUrl:"https://www.ahlsell.no/search"};},details:async()=>({})});
    assert.deepEqual(result.candidates,[]);
  }
});

test("custom searches keep user control and abort after reference lookup prevents general search",async()=>{
  let lookups=0,searches=0;
  const row=input("Stålrør Bend Sprinkler","100","dn");
  await matchMaterialRow({...row,query:"bend 45"},{fetchImpl:offline},{search:async()=>{searches++;return searchResult([]);},lookup:async()=>{lookups++;throw new Error("unexpected");},details:async()=>({})});
  assert.equal(lookups,0);assert.equal(searches,1);
  const controller=new AbortController();
  await assert.rejects(()=>matchMaterialRow(row,{fetchImpl:offline,signal:controller.signal},{lookup:async()=>{controller.abort();return {products:[],searchUrl:"https://www.ahlsell.no/search"};},search:async()=>{throw new Error("must not run");}}),/abort/i);
});
