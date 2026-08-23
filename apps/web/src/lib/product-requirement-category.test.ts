import assert from "node:assert/strict";
import test from "node:test";
import {
  productRequirementCategory,
  sortProductRequirementsByCategory
} from "./product-requirement-category";

test("sorts sprinkler heads first, followed by pipes and the remaining product groups", () => {
  const requirements = [
    { id: "valve", category: "valve" },
    { id: "pipe-1", category: "pipe" },
    { id: "sprinkler-1", category: "sprinkler_head" },
    { id: "fitting", category: "fitting" },
    { id: "sprinkler-2", category: "sprinkler_head" },
    { id: "pipe-2", category: "pipe" }
  ];

  assert.deepEqual(
    sortProductRequirementsByCategory(requirements).map((requirement) => requirement.id),
    ["sprinkler-1", "sprinkler-2", "pipe-1", "pipe-2", "fitting", "valve"]
  );
});

test("keeps the PDF order inside each product group", () => {
  const requirements = [
    { id: "second", category: "pipe" },
    { id: "first", category: "pipe" }
  ];

  assert.deepEqual(
    sortProductRequirementsByCategory(requirements).map((requirement) => requirement.id),
    ["second", "first"]
  );
});

test("recognizes product groups when an older row has category unknown", () => {
  assert.equal(productRequirementCategory({
    category: "unknown",
    value_text: "Standard kvikk respons sprinklerhode"
  }), "sprinkler_head");
  assert.equal(productRequirementCategory({
    category: "unknown",
    value_text: "Sorte stålrør",
    value_json: { unit: "m" }
  }), "pipe");
  assert.equal(productRequirementCategory({
    category: "unknown",
    value_text: "Kupling rillet"
  }), "fitting");
});
