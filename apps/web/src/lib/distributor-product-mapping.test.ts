import assert from "node:assert/strict";
import test from "node:test";
import {
  isUuid,
  resolveDistributorProductName,
  validateDistributorProductMapping
} from "./distributor-product-mapping";

test("accepts canonical project UUIDs used by product mapping routes", () => {
  assert.equal(isUuid("5bc86407-0c26-43b7-b302-e65ad1a881fe"), true);
  assert.equal(isUuid("5bc86407-0c26-43b7-b302e65ad1a881fe"), false);
});

test("accepts a distributor product with normalized accessories", () => {
  const result = validateDistributorProductMapping({
    requirementId: "11111111-1111-4111-8111-111111111111",
    userApproved: true,
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
  assert.equal(result.data.productName, "Quick response sprinkler");
  assert.equal(result.data.productNumber, "1234567");
  assert.equal(result.data.accessories.length, 1);
  assert.equal(result.data.accessories[0].quantity, 2);
});

test("accepts only an NRF number and supplies the database product name", () => {
  const onlyNrf = validateDistributorProductMapping({
    requirementId: "11111111-1111-4111-8111-111111111111",
    userApproved: true,
    productNumber: " 1234567 "
  });
  assert.ok("data" in onlyNrf);
  if (!("data" in onlyNrf)) return;
  assert.equal(onlyNrf.data.productName, "NRF 1234567");
  assert.equal(onlyNrf.data.productNumber, "1234567");
  assert.equal(resolveDistributorProductName({
    productName: "",
    requirementName: "SPRINKLER",
    productNumber: "1234567"
  }), "SPRINKLER");
});

test("requires an NRF number and positive accessory quantity", () => {
  const missingNumber = validateDistributorProductMapping({
    requirementId: "11111111-1111-4111-8111-111111111111",
    userApproved: true,
    productName: "Sprinkler",
    productNumber: ""
  });
  assert.deepEqual(missingNumber, { error: "NRF-nummer krävs." });

  const invalidQuantity = validateDistributorProductMapping({
    requirementId: "11111111-1111-4111-8111-111111111111",
    userApproved: true,
    productName: "Sprinkler",
    productNumber: "123",
    accessories: [{ name: "Rosett", quantity: 0 }]
  });
  assert.ok("error" in invalidQuantity);
});

test("never accepts a product without explicit user approval", () => {
  const missingApproval = validateDistributorProductMapping({
    requirementId: "11111111-1111-4111-8111-111111111111",
    productName: "Sprinkler",
    productNumber: "123"
  });
  assert.deepEqual(missingApproval, {
    error: "Produkten måste godkännas uttryckligen av användaren."
  });

  const rejectedApproval = validateDistributorProductMapping({
    requirementId: "11111111-1111-4111-8111-111111111111",
    userApproved: false,
    productName: "Sprinkler",
    productNumber: "123"
  });
  assert.deepEqual(rejectedApproval, {
    error: "Produkten måste godkännas uttryckligen av användaren."
  });
});
