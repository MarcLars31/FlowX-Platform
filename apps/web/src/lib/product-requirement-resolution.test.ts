import assert from "node:assert/strict";
import test from "node:test";
import {
  isProductRequirementResolvedWithoutProduct,
  productRequirementResolution,
  withProductRequirementResolution
} from "./product-requirement-resolution";

test("marks and clears a requirement as not in Ahlsell's assortment", () => {
  const marked = withProductRequirementResolution(
    { operation: "install", quantity: 2 },
    "not_in_assortment",
    { resolvedAt: "2026-08-24T20:00:00.000Z", resolvedBy: "user-1" }
  );
  const requirement = { value_json: marked };

  assert.equal(isProductRequirementResolvedWithoutProduct(requirement), true);
  assert.deepEqual(productRequirementResolution(requirement), {
    status: "not_in_assortment",
    label: "Inte i sortiment",
    resolvedAt: "2026-08-24T20:00:00.000Z",
    resolvedBy: "user-1"
  });
  assert.deepEqual(
    withProductRequirementResolution(marked, null, {
      resolvedAt: "ignored",
      resolvedBy: "ignored"
    }),
    { operation: "install", quantity: 2 }
  );
});
