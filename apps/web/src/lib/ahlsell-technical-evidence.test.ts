import assert from "node:assert/strict";
import test from "node:test";
import { buildAhlsellTechnicalEvidence, mergeAhlsellTechnicalEvidence, technicalEvidenceSpecifications, technicalEvidenceWarnings, AHLSELL_EVIDENCE_TTL_MS, type AhlsellEvidenceSnapshot, type AhlsellEvidenceStore } from "./ahlsell-technical-evidence";
import { applyAhlsellProductDetails, fetchAhlsellProductDetails, parseAhlsellProductDetails, restoreAhlsellEvidenceSnapshot } from "./ahlsell-product-subtitle";
import { createAhlsellEvidenceStorage } from "./ahlsell-evidence-storage";
import { ahlsellCandidateMatchState, rankAhlsellCandidates } from "./ahlsell-candidate-ranking";
import { complementMldlCandidates } from "./ahlsell-hybrid-matching";
import type { AhlsellPublicCandidate } from "./ahlsell-public-match";
import { mergeAhlsellCandidates } from "./ahlsell-candidate-merge";

const article = "9991234";
const url = `https://www.ahlsell.no/products/test/${article}`;
const snapshot = (specifications: string[] = []): AhlsellEvidenceSnapshot => ({ version: 1, articleNumber: article,
  sourceUrl: url, retrievedAt: new Date().toISOString(), productName: "Stålrør", subtitle: null, description: null, specifications });
const html = (number = article) => `<h1 data-test="product-name">Sprinklerhode QR - Ned</h1><div>1/2&quot; K80 SSP 68C QR hvit</div>
  <span class="text-card-item-number"><span>${number}</span></span>
  <div data-test="information-table"><div>Arbeidstrykk 12 bar.</div><ul><li>Artikkelnr: ${number}</li></ul>
  <div>Tekniske data</div><ul><li>K-faktor: 80</li><li>Responstemperatur: 68 °C</li>
  <li>Utvendig gjenge: 1/2&quot;</li><li>Responstid: Hurtig respons</li><li>Farge: Hvit</li></ul></div>
  <h2>Varianter</h2><ul><li>K-faktor: 115</li><li>Utløsningstemperatur: 93°C</li></ul>`;
const product = (evidence = buildAhlsellTechnicalEvidence(snapshot(["DN: 65", "Trykklasse: PN16"]))): AhlsellPublicCandidate => ({
  articleNumber: article, productUrl: url, productName: "Stålrør", manufacturer: "", source: "catalog_search", specifications: [], technicalEvidence: evidence
});

test("normalizes labelled dimensions, material, connection, pressure and sprinkler fields with provenance", () => {
  const evidence = buildAhlsellTechnicalEvidence(snapshot(["Nominell diameter (DN): 65", "Ytre diameter: 76,1 mm", "Ventilhus: Rustfritt stål",
    "Materialkvalitet: AISI 316L", "Rillesystem: Standard/OGS", "Trykklasse: PN16", "Arbeidstrykk: 1600 kPa",
    "K-faktor: 80", "Responstemperatur: 68 °C", "Responstid: Hurtig respons", "Utvendig gjenge: 1/2\"", "Farge: Hvit"]));
  const values = Object.fromEntries(Object.entries(evidence.fields).map(([key, field]) => [key, field!.observations[0].value]));
  assert.deepEqual(values, {dn:65,outsideDiameterMm:76.1,material:"stainless_steel",materialGrade:"316L",connection:"grooved",pn:16,
    workingPressureBar:16,kFactor:80,temperatureC:68,response:"quick",threadInches:"1/2",finish:"white"});
  assert.ok(Object.values(evidence.fields).every(field => field!.observations.every(o => o.sourceUrl === url && o.raw && o.retrievedAt)));
  assert.ok(technicalEvidenceSpecifications(evidence).includes("Arbeidstrykk: 16 bar"));
});

test("does not infer critical values from ranges, body part materials, test pressure or Fahrenheit", () => {
  const evidence = buildAhlsellTechnicalEvidence(snapshot(["DN: 25-65", "Trykklasse: PN10/16", "Testtrykk: 40 bar", "Materiale disk: Rustfritt stål",
    "K-faktor: 5.6 US", "Responstemperatur: 155°F", "Tilkobling: Valgfritt", "Dimensjon: 6 m"]));
  assert.deepEqual(evidence.fields, {});
  assert.deepEqual(technicalEvidenceSpecifications(evidence), []);
});

test("same unit-converted evidence agrees while conflicting source values remain visible", () => {
  const a = buildAhlsellTechnicalEvidence(snapshot(["Arbeidstrykk: 1.6 MPa", "K-faktor: 80"]));
  const b = buildAhlsellTechnicalEvidence({...snapshot(["Arbeidstrykk: 16 bar", "K-faktor: 115"]), sourceKind: "variant_table"});
  const merged = mergeAhlsellTechnicalEvidence(a,b)!;
  assert.equal(merged.fields.workingPressureBar?.status,"documented");
  assert.equal(merged.fields.kFactor?.status,"conflict");
  assert.match(technicalEvidenceWarnings(article,merged).join(" "), /K-faktor.*80 \/ 115/);
  assert.ok(!technicalEvidenceSpecifications(merged).some(s => s.startsWith("K-faktor")));
});

test("extracts only the visible article's table and keeps the original source snapshot", () => {
  const detail = parseAhlsellProductDetails(html(),article,url)!;
  assert.equal(detail.technicalEvidence?.fields.kFactor?.observations[0].value,80);
  assert.equal(detail.technicalEvidence?.fields.workingPressureBar?.observations[0].value,12);
  assert.equal(detail.technicalEvidence?.fields.temperatureC?.status,"documented");
  assert.equal(detail.snapshot?.sourceUrl,url);
  assert.ok(!detail.specifications.some(s => s.includes("115")));
  assert.equal(parseAhlsellProductDetails(html("9999999"),article,url),null);
});

test("page and variant disagreements cannot become a green product after merging", () => {
  const candidate = product();
  const detail = parseAhlsellProductDetails(html(),article,url)!;
  candidate.technicalEvidence = buildAhlsellTechnicalEvidence({...snapshot(["K-faktor: 115"]), sourceKind:"variant_table"});
  const merged = applyAhlsellProductDetails(candidate,detail);
  assert.equal(merged.technicalEvidence?.fields.kFactor?.status,"conflict");
  const [ranked] = complementMldlCandidates({category:"pipe",value_text:"Rør DN65 PN16"},[],[merged]);
  assert.ok(!["exact","matched"].includes(ahlsellCandidateMatchState(ranked)));
});

test("documented article fields supply the match while different-article evidence never does", () => {
  const requirement = {category:"pipe",value_text:"Rør DN65 PN16"};
  const [ranked] = rankAhlsellCandidates(requirement,[product()]);
  assert.ok(["exact","matched"].includes(ahlsellCandidateMatchState(ranked)), JSON.stringify(ranked.matchWarnings));
  const wrong = product({...product().technicalEvidence!, articleNumber:"9999999"});
  const [blocked] = rankAhlsellCandidates(requirement,[wrong]);
  assert.equal(ahlsellCandidateMatchState(blocked),"review");
  assert.match(blocked.matchWarnings!.join(" "),/NRF-nummer/);
});

test("stored records enforce freshness, schema, source URL, market and exact article", () => {
  const saved = snapshot(["DN: 65"]);
  assert.ok(restoreAhlsellEvidenceSnapshot(saved,article,"no"));
  for(const malformed of [ {...saved,articleNumber:"9999999"}, {...saved,sourceUrl:"https://example.com/products/"+article},
    {...saved,sourceUrl:"https://www.ahlsell.no/products/test/1111111"}, {...saved,version:9}, {...saved,specifications:[null]},
    {...saved,retrievedAt:"invalid"}, {...saved,retrievedAt:new Date(Date.now()-AHLSELL_EVIDENCE_TTL_MS-1000).toISOString()},
    {...saved,retrievedAt:new Date(Date.now()+1000).toISOString()}]) {
    assert.equal(restoreAhlsellEvidenceSnapshot(malformed,article,"no"),null);
  }
  assert.equal(restoreAhlsellEvidenceSnapshot(saved,article,"se"),null);
});

test("a durable cache serves a later request without fetching Ahlsell again", async () => {
  let saved: unknown; let fetches=0; let writes=0;
  const store: AhlsellEvidenceStore={read:async()=>saved,write:async(_m,_a,value)=>{saved=value;writes++;}};
  const fetchImpl: typeof fetch=async()=>{fetches++;return new Response(html(),{headers:{"Content-Type":"text/html"}});};
  const items=[{articleNumber:article,productUrl:url}];
  const first=await fetchAhlsellProductDetails({items,fetchImpl,store});
  const second=await fetchAhlsellProductDetails({items,fetchImpl,store});
  assert.equal(fetches,1);assert.equal(writes,1);
  assert.deepEqual(second,first);
});

test("cache outages and stale snapshots use fresh product data without overwriting on fetch failure", async () => {
  let writes=0;
  const store: AhlsellEvidenceStore={read:async()=>({...snapshot(),retrievedAt:"2000-01-01T00:00:00.000Z"}),write:async()=>{writes++;}};
  const items=[{articleNumber:article,productUrl:url}];
  const failed=await fetchAhlsellProductDetails({items,store,fetchImpl:async()=>new Response(null,{status:503})});
  assert.equal(failed[article],null);assert.equal(writes,0);
  const recovered=await fetchAhlsellProductDetails({items,store:{read:async()=>{throw Error("offline");},write:async()=>{throw Error("offline");}},fetchImpl:async()=>new Response(html(),{headers:{"Content-Type":"text/html"}})});
  assert.equal(recovered[article]?.articleNumber,article);
});

test("private storage keys separate markets and bound payload size", async () => {
  const calls: {url:string;method:string;body?:string}[]=[];
  const store=createAhlsellEvidenceStorage({url:"https://example.supabase.co",key:"sb_secret_test"},async(input,init)=>{
    calls.push({url:String(input),method:init?.method??"GET",body:typeof init?.body==="string"?init.body:undefined});
    return Response.json(snapshot());
  });
  await store.read("no",article);await store.write("se",article,snapshot());
  assert.match(calls[0].url,/product-documents\/ahlsell-technical-evidence\/v1\/no\/9991234.json$/);
  assert.match(calls[1].url,/\/se\/9991234.json$/);assert.equal(calls[1].method,"POST");
  assert.ok(!calls[1].body?.includes("sb_secret_test"));
  await assert.rejects(store.read("no","../other"));
  const oversized=createAhlsellEvidenceStorage({url:"https://example.supabase.co",key:"test"},async()=>new Response("x".repeat(64001)));
  assert.equal(await oversized.read("no",article),null);
});

test("header ranges and reducers do not establish a single technical value", () => {
  for (const productName of ["Rør DN25-65 PN10/16", "Sprinkler K80/115 20-68C", "Reduksjon DN65 x DN25", "Sprinkler K5.6 US"]) {
    assert.deepEqual(buildAhlsellTechnicalEvidence({...snapshot(), productName}).fields, {}, productName);
  }
});

test("UI candidate merge blocks individually green sources when their article fields disagree", () => {
  const green = {...product(), exactMatch:true, recommendation:"recommended" as const, matchScore:90, matchWarnings:[]};
  const other = {...green, technicalEvidence:buildAhlsellTechnicalEvidence(snapshot(["DN: 80"]))};
  const [merged] = mergeAhlsellCandidates([green],[other]);
  assert.equal(merged.technicalEvidence?.fields.dn?.status,"conflict");
  assert.equal(ahlsellCandidateMatchState(merged),"review");
  assert.equal(merged.exactMatch,false);
});

test("a valid product page never relabels another article's technical evidence", () => {
  const wrong = product({...product().technicalEvidence!,articleNumber:"9999999"});
  const detail = parseAhlsellProductDetails(html(),article,url)!;
  const merged = applyAhlsellProductDetails(wrong,detail);
  assert.equal(merged.technicalEvidence?.fields.dn,undefined);
  assert.equal(merged.technicalEvidence?.fields.kFactor?.observations[0].value,80);
  assert.match(merged.matchWarnings!.join(" "),/NRF-nummer/);
});

test("orientation uses explicit mount wording and ignores ordinary direction phrases", () => {
  for (const productName of ["Sprinkler opp til 12 bar", "Sprinkler Opp/Ned"]) {
    assert.equal(buildAhlsellTechnicalEvidence({...snapshot(),productName}).fields.orientation,undefined);
  }
  for (const [label,expected] of [["Horisontalt på vegg","sidewall"],["Ned","pendent"],["Opp","upright"]]) {
    assert.equal(buildAhlsellTechnicalEvidence(snapshot([`Monteringsretning: ${label}`])).fields.orientation?.observations[0].value,expected);
  }
});

test("a page-verified N5 alias remains valid when MLDL evidence is reassessed", () => {
  const alias=`${article}N5`;
  const canonical=product();
  const local={...canonical,articleNumber:alias,technicalEvidence:undefined,source:"structured_database" as const};
  const result=complementMldlCandidates({category:"pipe",value_text:"Rør DN65 PN16"},[local],[canonical],new Map([[article,alias]]));
  assert.equal(result.length,1);
  assert.equal(result[0].articleNumber,article);
  assert.ok(["exact","matched"].includes(ahlsellCandidateMatchState(result[0])),JSON.stringify(result[0].matchWarnings));
});
