import assert from "node:assert/strict";
import test from "node:test";
import {
  AHLSELL_MLDL_PRODUCT_COUNT,
  ahlsellMldlProducts,
  findAhlsellMldlCandidates
} from "./ahlsell-mldl-catalog";

test("imports the complete MLDL assortment without duplicate article numbers", () => {
  const products = ahlsellMldlProducts();
  assert.equal(AHLSELL_MLDL_PRODUCT_COUNT, 759);
  assert.equal(products.length, 759);
  assert.equal(new Set(products.map((product) => product.articleNumber)).size, 759);
});

test("ranks the known V761 butterfly valve from the full database", () => {
  const candidates = findAhlsellMldlCandidates({
    category: "valve",
    value_text: "114.3mm spjeldventil sort V761 rillet PN20 - VKS"
  });

  assert.equal(candidates[0]?.articleNumber, "9253207");
  assert.equal(candidates[0]?.source, "structured_database");
  assert.equal(candidates[0]?.recommendation, "recommended");
  assert.ok((candidates[0]?.matchScore ?? 0) >= 90);
});

test("uses Norwegian product words to restrict the database to the right family", () => {
  const candidates = findAhlsellMldlCandidates({
    category: "fitting",
    value_text: "76,1 mm fast kupling rillet"
  });

  assert.ok(candidates.length > 0);
  assert.ok(candidates.every((candidate) => /kupling|kobling|coupling/i.test(candidate.productName)));
});

test("uses UB1.3311 to exclude rigid pipes and fittings from the MLDL pool", () => {
  const candidates = findAhlsellMldlCandidates({
    category: "pipe",
    value_text: "INNENDØRS RØRLEDNING - BRANNSLOKKING - SLANGE",
    value_json: {
      nsCode: "UB1.33114699900A",
      unit: "st",
      attributes: { dimensjon: "DN25" }
    }
  });

  assert.ok(candidates.length > 0);
  assert.equal(candidates[0]?.articleNumber, "9255525");
  assert.ok(candidates.every((candidate) =>
    /sprinklerslange|sprinkler slange|vicflex|dryflex|fleksibelslange/i.test(candidate.productName)
  ));
  assert.ok(candidates.every((candidate) => !/konstruksjonsrør|t-rør|bend t\/sprinklerslange|nippel f\/.*sprinklerslange/i.test(candidate.productName)));
});
