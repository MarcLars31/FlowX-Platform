import test from "node:test";
import assert from "node:assert/strict";
import { assessRfqProduct, rfqPacking, rfqSearchQueries } from "./rfq-product-requirements";
import { highestScoredMaterialCandidate, type MaterialCandidate, type MaterialSearchInput } from "./material-import";
import type { AhlsellPublicCandidate } from "./ahlsell-public-match";
import { parseAhlsellProductDetails } from "./ahlsell-product-subtitle";

const input = (description: string): MaterialSearchInput => ({ description, unit: "PCE", category: "", dimension: "", fittingDimension: "", dimensionKind: "unspecified", details: "", query: "", articleReferences: [] });
const product = (productName: string, subtitle = "", specifications: string[] = []): AhlsellPublicCandidate => ({ productName, subtitle, specifications, articleNumber: "123456", manufacturer: "", productUrl: "https://www.ahlsell.no/products/test/123456/", source: "catalog_search" });
const assess = (description: string, candidate: AhlsellPublicCandidate, verified = true) => assessRfqProduct(input(description), candidate, verified);

test("RFQ model search precedes unrelated external references and keeps manual query control", () => {
  assert.equal(rfqSearchQueries({ ...input('BAHCO S240 1/2" DRIVE SOCKET SET 24 PCS'), articleReferences: ["5240", "67315"] })[0], "S240");
  assert.equal(rfqSearchQueries(input("MILWAUKEE LADER M18 DBSC"))[0], "M18 DBSC");
  assert.deepEqual(rfqSearchQueries({ ...input("MILWAUKEE LADER M18 DBSC"), query: "71868908" }), ["71868908"]);
  assert.ok(rfqSearchQueries(input("Cable Ties 380mm x 7.6mm (100 pack)")).some(q => /strips.*380.*7.6/.test(q)));
});

test("model suffixes and package editions are identities, not fuzzy synonyms", () => {
  for (const actual of ["M18 NRG-502", "M18 NRG-506C"]) {
    const result = assess("MILWAUKEE BATTERISETT M18 NRG-503", product(`Batterisett Milwaukee ${actual}`));
    assert.equal(result.match.status, "mismatch");
    assert.equal(result.match.autoSelect, false);
  }
  assert.equal(assess("MILWAUKEE BOR/SKRUTREKKER M18BLDDRC-502C", product("Bor-/ skrutrekker Milwaukee M18 BLDDRC-502C")).match.status, "verified");
  assert.equal(assess("MILWAUKEE MUTTERTREKKER M18 FMTIW2F12-0X", product("Muttertrekker Milwaukee M18 FMTIW2F12-502X")).match.status, "mismatch");
  assert.equal(assess("MILWAUKEE VARMLUFTPISTOLL M18 BHG-0", product("Varmluftpistol Milwaukee M18 BHG-502C")).match.autoSelect, false);
});

test("a charger in a battery kit's compatibility prose is not the requested charger", () => {
  const request = "MILWAUKEE LADER M18 DBSC";
  const wrong = { ...product("Batterisett Milwaukee M18 FORGENRG-602"), description: "Leveres med lader M18 DBSC" };
  assert.equal(assess(request, wrong).relevant, false);
  assert.equal(assess(request, product("Batterilader Milwaukee M18 DBSC")).match.status, "verified");
  assert.equal(assess(request, product("Batterilader Milwaukee M18 DBSC"), false).match.autoSelect, false);
  assert.equal(assess("Knipex 16 40 150 Cable Dismantling Tool", product("Rerserveblad for Avisoleringsverktøy Knipex 1640", "f/1640-150")).relevant, false);
});

test("Bahco S240 requires its full model, drive size and 24-piece contents", () => {
  const request = 'BAHCO S240 1/2" DRIVE SOCKET SET 24 PCS';
  assert.equal(assess(request, product("Pipenøkkelsett Bahco S240, 24 deler", 'Pipesett S240 metrisk Bahco 1/2" 24 deler')).match.status, "verified");
  assert.equal(assess(request, product("Pipenøkkelsett Bahco S240AF, 23 deler", 'Bahco 1/2"')).match.status, "mismatch");
  assert.equal(assess(request, product("Pipenøkkelsett Bahco S240", 'Bahco 1/2"')).match.status, "review");
  assert.equal(assess(request, product("Pipenøkkelsett Bahco S240, 24 deler", 'Bahco 3/8"')).match.status, "mismatch");
  assert.equal(assess(request, product("Overgangsmuffe kapillar 5240", "18 x 12 mm")).relevant, false);
});

test("pack count is distinct from quantity, kit contents and carton logistics", () => {
  for (const text of ["(100 pack)", "pack of 100", "PK-100", "100pk", "100 per pack", "bag of 100"]) assert.deepEqual(rfqPacking(text).packs, [100]);
  assert.deepEqual(rfqPacking("Forpakningsstørrelser: 1 Stk/4 Stk/100 Stk").packs, []);
  assert.deepEqual(rfqPacking("24 deler; pack of 2"), { packs: [2], pieces: [24] });
  const request = "Cable Ties 380mm x 7.6mm (100 pack)";
  const good = assess(request, product("Strips 380mm x 7.6mm 100pk"));
  assert.equal(good.match.checks.find(c => c.name.startsWith("Förpackning"))?.status, "match");
  assert.equal(assess(request, product("Strips 380mm x 7.6mm 50pk")).match.status, "mismatch");
  const logistics = assess(request, product("Strips 380mm x 7.6mm", "", ["Forpakningsstørrelser: 1 Stk/100 Stk"]));
  assert.equal(logistics.match.checks.find(c => c.name.startsWith("Förpackning"))?.status, "unknown");
  assert.equal(logistics.match.autoSelect, false);
});

test("dimensions, color and material remain requirements when search words are overridden", () => {
  const request = { ...input("PARKER HOSE CLAMP 10-22mm - Must be stainless steel"), query: "slangeklemme" };
  const wrong = assessRfqProduct(request, product("Slangeklemme Parker rustfri 19-44mm"), true);
  assert.equal(wrong.match.status, "mismatch");
  const tape = assess("3M Scotch 35 Yellow PVC Electrical Tape, 19mm x 20m", product("Isolasjonstape 3M Scotch 35", "Blå 19mm x 20m"));
  assert.equal(tape.match.checks.find(c => c.name === "Färg")?.status, "mismatch");
  assert.equal(assess("3M Scotch 35 Yellow PVC Electrical Tape, 19mm x 20m", product("Isolasjonstape 3M Scotch 35", "Gul 19mm x 20m")).match.status, "verified");
  assert.equal(assess("3M Scotch 35 Yellow PVC Electrical Tape, 19mm x 20m", product("Elektrotape 3M Scotch", "Elektrotape 35 19mmx20m gul")).match.status, "verified");
});

test("manufacturer identity resolves a model omitted from the distributor heading", () => {
  const request = "MILWAUKEE BATTERISETT M18 NRG-503";
  const candidate = product("Batterisett Milwaukee M18 18V 3x5.0Ah", "", ["Tillverkarens artikelnummer: 4933451423"]);
  assert.equal(assess(request, candidate).match.status, "verified");
  assert.equal(assess(request, {...candidate, specifications:["Tillverkarens artikelnummer: 4933459217"]}).match.autoSelect, false);
  assert.equal(assess(request, {...candidate, specifications:[]}).match.autoSelect, false);
  assert.equal(assess(request, {...candidate, productName:"Batterisett Milwaukee M18 NRG-502"}).match.autoSelect, false);
});

test("manufacturer part comes from the verified article header, not a related product", () => {
  const html = `<h1 data-test="product-name">Batterisett Milwaukee</h1><div>M18 3x5.0Ah</div>
    <span class="text-card-item-number"><span>623531</span></span>
    <span>Lev.artikkelnr:<div><span class="text-card-item-number"><span>4933451423</span></span></div></span>
    <h2>Relaterte produkter</h2><span>Lev.artikkelnr:<span class="text-card-item-number"><span>wrong</span></span></span>`;
  const result = parseAhlsellProductDetails(html, "623531")!;
  assert.ok(result.specifications.includes("Tillverkarens artikelnummer: 4933451423"));
  assert.ok(!result.specifications.some(s => s.includes("wrong")));
  assert.equal(parseAhlsellProductDetails(html, "different"), null);
});

test("RFQ automatic choice refuses mismatches, unknown checks and stale pre-upgrade responses", () => {
  assert.equal(assess("A4 s/steel slotted machine screw kit", product("Sortimentskrin A4 Skruer")).match.autoSelect, false);
  const base: MaterialCandidate = { articleNumber: "1", productName: "test", productUrl: "https://www.ahlsell.no/products/1/", subtitle: "", specifications: [], warnings: [], identityVerified: true, conflict: false, score: 100 };
  assert.equal(highestScoredMaterialCandidate([base], true), undefined);
  assert.equal(highestScoredMaterialCandidate([{ ...base, rfqMatch: { status: "review", autoSelect: false, checks: [] } }], true), undefined);
  const good = { ...base, rfqMatch: { status: "verified" as const, autoSelect: true, checks: [] } };
  assert.equal(highestScoredMaterialCandidate([good], true), good);
  assert.equal(highestScoredMaterialCandidate([{ ...good, conflict: true }], true), undefined);
  // Keep the previously requested unrestricted Excel selection behavior.
  assert.equal(highestScoredMaterialCandidate([base]), base);
});
