import assert from "node:assert/strict";
import test from "node:test";
import {
  matchDemoProducts,
  type DemoCatalogCandidate,
  type ProjectRequirementForMatching
} from "./demo-product-matching";

const requirement: ProjectRequirementForMatching = {
  id: "requirement-1",
  category: "sprinkler_head",
  requirement_key: "UE2.11111112A",
  value_text: "Konvensjonell sprinkler",
  value_json: {
    operation: "install",
    attributes: {
      "k-faktor": "80",
      utløsningstemperatur: "68 °C",
      trykk: "Min PN 16",
      "gjengedimensjon (dn)": "DN 15",
      plassering: "Stående",
      følsomhetsgrad: "Kvikk respons"
    }
  },
  status: "user_confirmed"
};

const compliant: DemoCatalogCandidate = {
  productId: "product-1",
  variantId: "variant-1",
  productNumber: "DEMO-1",
  productName: "K80 upright demo sprinkler",
  variantName: "K80 / DN15",
  sku: "DEMO-1-K80",
  manufacturer: "Scipx Demo Fire Systems",
  kFactorMetric: 80,
  temperatureRatingC: 68,
  maximumWorkingPressureBar: 17.2,
  responseType: "quick",
  orientation: "upright",
  connectionSize: "DN15",
  finish: "chrome",
  approvals: ["DFA-EU-DEMO"]
};

test("matches an exact technical sprinkler profile", () => {
  const result = matchDemoProducts([requirement], [compliant]);
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].technicalScore, 100);
  assert.match(result.matches[0].reason, /K80/);
});

test("rejects lower pressure and wrong orientation before commercial ranking", () => {
  const result = matchDemoProducts([requirement], [
    { ...compliant, productId: "low-pressure", maximumWorkingPressureBar: 12.1 },
    { ...compliant, productId: "wrong-orientation", orientation: "pendent" }
  ]);
  assert.equal(result.matches.length, 0);
});

test("skips removal lines", () => {
  const result = matchDemoProducts([
    { ...requirement, value_json: { ...requirement.value_json, operation: "remove" } }
  ], [compliant]);
  assert.deepEqual(result.skippedRequirementIds, [requirement.id]);
  assert.equal(result.matches.length, 0);
});

test("preferred manufacturer changes order but not technical qualification", () => {
  const alternative = {
    ...compliant,
    productId: "product-2",
    variantId: "variant-2",
    productName: "Alternative",
    manufacturer: "Boreal Demo Fire Protection"
  };
  const result = matchDemoProducts([requirement], [compliant, alternative], {
    preferredManufacturer: alternative.manufacturer
  });
  assert.equal(result.matches.length, 2);
  assert.equal(result.matches[0].candidate.productId, alternative.productId);
  assert.equal(result.matches[1].technicalScore, 100);
});
