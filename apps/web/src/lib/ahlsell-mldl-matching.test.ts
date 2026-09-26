import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import { findMldlOnlyCandidates } from "./ahlsell-mldl-matching";
import { ahlsellMldlProduct } from "./ahlsell-mldl-catalog";
import { buildAhlsellRequirementGuide } from "./ahlsell-public-match";
import { bulkProductApprovalSelection } from "./bulk-product-approval";

const requirement = { category: "sprinkler_head", value_text: "SPRINKLER", value_json: { attributes: {
  sprinkleranlegg: "Våtanlegg", "type sprinkler": "Spraysprinkler", plassering: "Hengende synlig i tak",
  følsomhetsgrad: "Kvikk respons", utløsningstemperatur: "68 °C", "k-faktor": "80",
  "gjengedimensjon (dn)": "15", overflatebehandling: "Messing", trykk: "12 bar", beskyttelse: "Nei"
} } };

test("the MLDL baseline needs no network and returns only local articles and accessories", () => {
  const original = globalThis.fetch;
  globalThis.fetch = () => { throw new Error("The local MLDL baseline must not fetch public data"); };
  try {
    const candidates = findMldlOnlyCandidates(requirement);
    assert.ok(candidates.length > 0);
    assert.equal(candidates[0].articleNumber, "9257392");
    assert.ok(!candidates[0].matchWarnings?.some(w => /K-faktorn saknas|Utlösningstemperaturen saknas|arbetstryck/.test(w)));
    for (const candidate of candidates) {
      assert.ok(ahlsellMldlProduct(candidate.articleNumber));
      assert.ok(["verified_database", "structured_database"].includes(candidate.source));
      for (const accessory of candidate.suggestedAccessories ?? []) assert.ok(ahlsellMldlProduct(accessory.articleNumber));
    }
  } finally { globalThis.fetch = original; }
});

test("public-only screenshot articles and PDF references do not enter the MLDL baseline", () => {
  for (const article of ["9254108N5", "9254111N5", "19045188"]) {
    assert.equal(ahlsellMldlProduct(article), null);
    const req = { ...requirement, value_text: `SPRINKLER NRF ${article}` };
    assert.ok(findMldlOnlyCandidates(req).every(c => c.articleNumber !== article));
    assert.ok(buildAhlsellRequirementGuide(req).directCandidates.every(c => ahlsellMldlProduct(c.articleNumber)));
    assert.equal(bulkProductApprovalSelection({
      requirement: { id: "post", category: "unknown", value_text: "Okänd produkt", mapping_fingerprint: "same" },
      handled: false, memories: [{ requirement_fingerprint: "same", product_name: "Tidigare webbval", product_number: article }]
    }), null);
  }
});

test("table labels stay local while automatic classification and product cards search the public assortment", async () => {
  const routes = [
    "../app/api/projects/[id]/requirements/[requirementId]/ahlsell-subtitles/route.ts",
    "../app/api/projects/[id]/ahlsell-product-labels/route.ts"
  ];
  for (const route of routes) {
    const source = await fs.readFile(new URL(route, import.meta.url), "utf8");
    assert.doesNotMatch(source, /fetchAhlsell|searchAhlsell|lookupAhlsell|fetch\s*\(/, route);
  }
  const panel = await fs.readFile(new URL("../components/DistributorMappingPanel.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(panel, /\/ahlsell-subtitles/);
  assert.match(panel, /catalogResult\?\.candidates \?\? guide.directCandidates/);
  const candidateRoute = await fs.readFile(new URL("../app/api/projects/[id]/requirements/[requirementId]/ahlsell-candidates/route.ts", import.meta.url), "utf8");
  assert.doesNotMatch(candidateRoute, /findMldlOnlyCandidates/);
  assert.match(candidateRoute, /classification: ahlsellCatalogStatusFromPayload\(result\)/);
  const searchCall = candidateRoute.indexOf("await findAhlsellHybridCandidates(requirement");
  assert.ok(searchCall >= 0 && searchCall < candidateRoute.indexOf("if (classificationMode)"));
  const manualLookup = await fs.readFile(new URL("../app/api/projects/[id]/requirements/[requirementId]/ahlsell-lookup/route.ts", import.meta.url), "utf8");
  assert.match(manualLookup, /lookupAhlsellProduct/);
});
