import assert from "node:assert/strict";
import test from "node:test";
import { validateDistributorProductMapping } from "./distributor-product-mapping";

test("accepts a distributor product with normalized accessories", () => {
  const result = validateDistributorProductMapping({
    requirementId: "11111111-1111-4111-8111-111111111111",
    productName: "  Quick response sprinkler  ",
    productNumber: " 1234567 ",
    manufacturerName: "Viking",
    notes: "Selected by specialist",
    accessories: [
      { name: " Rosett ", productNumber: "7654321", quantity: "2", unit: "st" },
      { name: "", quantity: 1 }
    ]
  });

  assert.ok("data" in result);
  if (!("data" in result)) return;
  assert.equal(result.data.productNumber, "1234567");
  assert.equal(result.data.accessories.length, 1);
  assert.equal(result.data.accessories[0].quantity, 2);
});

test("requires an Ahlsell article number and positive accessory quantity", () => {
  const missingNumber = validateDistributorProductMapping({
    requirementId: "11111111-1111-4111-8111-111111111111",
    productName: "Sprinkler",
    productNumber: ""
  });
  assert.deepEqual(missingNumber, { error: "Ahlsells artikelnummer krävs." });

  const invalidQuantity = validateDistributorProductMapping({
    requirementId: "11111111-1111-4111-8111-111111111111",
    productName: "Sprinkler",
    productNumber: "123",
    accessories: [{ name: "Rosett", quantity: 0 }]
  });
  assert.ok("error" in invalidQuantity);
});
