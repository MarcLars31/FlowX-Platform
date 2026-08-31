import assert from "node:assert/strict";
import test from "node:test";
import {
  isUuid,
  resolveDistributorProductName,
  validateDistributorProductMapping,
  validateManualDistributorProduct
} from "./distributor-product-mapping";
import { bulkProductApprovalSelection } from "./bulk-product-approval";

test("accepts canonical project UUIDs used by product mapping routes", () => {
  assert.equal(isUuid("5bc86407-0c26-43b7-b302-e65ad1a881fe"), true);
  assert.equal(isUuid("5bc86407-0c26-43b7-b302e65ad1a881fe"), false);
});

test("accepts a distributor product with normalized accessories", () => {
  const result = validateDistributorProductMapping({
    requirementId: "11111111-1111-4111-8111-111111111111",
    userApproved: true,
    entryMethod: "catalog",
    productName: "  Quick response sprinkler  ",
    productSubtitle: "  1/2\" sprinkler K80 QR  ",
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
  assert.equal(result.data.productSubtitle, "1/2\" sprinkler K80 QR");
  assert.equal(result.data.productNumber, "1234567");
  assert.equal(result.data.accessories.length, 1);
  assert.equal(result.data.accessories[0].quantity, 2);
});

test("accepts only an NRF number and supplies the database product name", () => {
  const onlyNrf = validateDistributorProductMapping({
    requirementId: "11111111-1111-4111-8111-111111111111",
    userApproved: true,
    entryMethod: "catalog",
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
  }), "NRF 1234567");
});

test("requires an NRF number and positive accessory quantity", () => {
  const missingNumber = validateDistributorProductMapping({
    requirementId: "11111111-1111-4111-8111-111111111111",
    userApproved: true,
    entryMethod: "catalog",
    productName: "Sprinkler",
    productNumber: ""
  });
  assert.deepEqual(missingNumber, { error: "NRF-nummer krävs." });

  const invalidQuantity = validateDistributorProductMapping({
    requirementId: "11111111-1111-4111-8111-111111111111",
    userApproved: true,
    entryMethod: "catalog",
    productName: "Sprinkler",
    productNumber: "123",
    accessories: [{ name: "Rosett", quantity: 0 }]
  });
  assert.ok("error" in invalidQuantity);
});

test("accepts and normalizes every field from the manual product card", () => {
  const draft = validateManualDistributorProduct({
    productNumber: " 925 4043 ",
    manufacturerArticleNumber: " V2704-QR ",
    manufacturerName: " Victaulic ",
    deliveryTimeDays: " 5 ",
    unitPrice: "1 250,50",
    currency: "nok"
  });
  assert.deepEqual(draft, {
    data: {
      productNumber: "925 4043",
      manufacturerArticleNumber: "V2704-QR",
      manufacturerName: "Victaulic",
      deliveryTimeDays: 5,
      unitPrice: 1250.5,
      currency: "NOK"
    }
  });

  const mapping = validateDistributorProductMapping({
    requirementId: "11111111-1111-4111-8111-111111111111",
    userApproved: true,
    entryMethod: "manual",
    productNumber: draft.data.productNumber,
    manufacturerArticleNumber: draft.data.manufacturerArticleNumber,
    manufacturerName: draft.data.manufacturerName,
    deliveryTimeDays: draft.data.deliveryTimeDays,
    unitPrice: draft.data.unitPrice,
    currency: draft.data.currency
  });
  assert.ok("data" in mapping);
  if (!("data" in mapping)) return;
  assert.equal(mapping.data.entryMethod, "manual");
  assert.equal(mapping.data.manufacturerArticleNumber, "V2704-QR");
  assert.equal(mapping.data.deliveryTimeDays, 5);
  assert.equal(mapping.data.unitPrice, 1250.5);
  assert.equal(mapping.data.currency, "NOK");
});

test("manual products require identity, delivery time and price", () => {
  assert.deepEqual(validateManualDistributorProduct({
    productNumber: "9254043",
    manufacturerArticleNumber: "",
    manufacturerName: "Victaulic",
    deliveryTimeDays: "5",
    unitPrice: "100",
    currency: "NOK"
  }), { error: "Fyll i artikelnummer." });

  const invalidDelivery = validateDistributorProductMapping({
    requirementId: "11111111-1111-4111-8111-111111111111",
    userApproved: true,
    entryMethod: "manual",
    productNumber: "9254043",
    manufacturerArticleNumber: "V2704-QR",
    manufacturerName: "Victaulic",
    deliveryTimeDays: "2.5",
    unitPrice: "100",
    currency: "NOK"
  });
  assert.deepEqual(invalidDelivery, {
    error: "Leveranstiden måste anges som ett helt antal dagar."
  });

  const negativePrice = validateDistributorProductMapping({
    requirementId: "11111111-1111-4111-8111-111111111111",
    userApproved: true,
    entryMethod: "manual",
    productNumber: "9254043",
    manufacturerArticleNumber: "V2704-QR",
    manufacturerName: "Victaulic",
    deliveryTimeDays: "2",
    unitPrice: "-1",
    currency: "NOK"
  });
  assert.deepEqual(negativePrice, {
    error: "Priset måste vara ett giltigt positivt belopp."
  });

  const unknownEntryMethod = validateDistributorProductMapping({
    requirementId: "11111111-1111-4111-8111-111111111111",
    userApproved: true,
    entryMethod: "other",
    productNumber: "9254043"
  });
  assert.deepEqual(unknownEntryMethod, {
    error: "Ogiltigt sätt att lägga till produkten."
  });

  for (const entryMethod of [undefined, null, ""] as const) {
    const missingEntryMethod = validateDistributorProductMapping({
      requirementId: "11111111-1111-4111-8111-111111111111",
      userApproved: true,
      entryMethod,
      productNumber: "9254043"
    });
    assert.deepEqual(missingEntryMethod, {
      error: "Ogiltigt sätt att lägga till produkten."
    });
  }
});

test("rejects duplicate accessories before they can duplicate exported quantities", () => {
  const duplicateNrf = validateDistributorProductMapping({
    requirementId: "11111111-1111-4111-8111-111111111111",
    userApproved: true,
    entryMethod: "catalog",
    productName: "Sprinkler",
    productNumber: "123",
    accessories: [
      { name: "Vit rosett", productNumber: "765 4321", quantity: 1 },
      { name: "Annat namn", productNumber: "NRF 7654321", quantity: 1 }
    ]
  });
  assert.deepEqual(duplicateNrf, { error: "Tillbehöret Annat namn är redan tillagt." });

  const duplicateName = validateDistributorProductMapping({
    requirementId: "11111111-1111-4111-8111-111111111111",
    userApproved: true,
    entryMethod: "catalog",
    productName: "Sprinkler",
    productNumber: "123",
    accessories: [
      { name: " Vit rosett ", quantity: 1 },
      { name: "vit   rosett", quantity: 1 }
    ]
  });
  assert.ok("error" in duplicateName);

  const emptyNormalizedNrf = validateDistributorProductMapping({
    requirementId: "11111111-1111-4111-8111-111111111111",
    userApproved: true,
    entryMethod: "catalog",
    productName: "Sprinkler",
    productNumber: "123",
    accessories: [
      { name: "Rosett", productNumber: "NRF", quantity: 1 },
      { name: "Rosett", productNumber: "", quantity: 1 }
    ]
  });
  assert.ok("error" in emptyNormalizedNrf);
});

test("never accepts a product without explicit user approval", () => {
  const missingApproval = validateDistributorProductMapping({
    requirementId: "11111111-1111-4111-8111-111111111111",
    entryMethod: "catalog",
    productName: "Sprinkler",
    productNumber: "123"
  });
  assert.deepEqual(missingApproval, {
    error: "Produkten måste godkännas uttryckligen av användaren."
  });

  const rejectedApproval = validateDistributorProductMapping({
    requirementId: "11111111-1111-4111-8111-111111111111",
    userApproved: false,
    entryMethod: "catalog",
    productName: "Sprinkler",
    productNumber: "123"
  });
  assert.deepEqual(rejectedApproval, {
    error: "Produkten måste godkännas uttryckligen av användaren."
  });
});

test("bulk approval accepts only an exact historical product for the same fingerprint", () => {
  const requirement = {
    id: "11111111-1111-4111-8111-111111111111",
    mapping_fingerprint: "fp-k80-qr",
    category: "sprinkler_head",
    value_text: "SPRINKLER"
  };
  const memory = {
    requirement_fingerprint: "fp-k80-qr",
    product_name: "Sprinklerhoder Modell V2704 QR",
    product_number: "9254043",
    manufacturer_name: "Victaulic"
  };

  assert.equal(bulkProductApprovalSelection({ requirement, memories: [memory], handled: false })?.productNumber, "9254043");
  assert.equal(bulkProductApprovalSelection({
    requirement,
    memories: [{ ...memory, requirement_fingerprint: "annan" }],
    handled: false
  }), null);
  assert.equal(bulkProductApprovalSelection({ requirement, memories: [memory], handled: true }), null);
  assert.equal(bulkProductApprovalSelection({
    requirement,
    memories: [
      memory,
      { ...memory, product_name: "Annat sprinklerhuvud", product_number: "9254044" }
    ],
    handled: false
  }), null);
  assert.equal(bulkProductApprovalSelection({
    requirement,
    memories: [memory, { ...memory, id: "andra-raden" }],
    handled: false
  })?.productNumber, "9254043");
});

test("bulk approval accepts one unambiguous direct match and blocks warnings or alternatives", () => {
  const exactRequirement = {
    id: "22222222-2222-4222-8222-222222222222",
    category: "sprinkler_head",
    value_text: "SPRINKLER",
    value_json: {
      attributes: {
        orientation: "Pendent",
        response: "Quick",
        temperature: "68 C",
        "k factor": "80",
        dimension: "15",
        finish: "White"
      }
    }
  };
  const ambiguousRequirement = {
    ...exactRequirement,
    id: "33333333-3333-4333-8333-333333333333",
    value_json: {
      attributes: {
        orientation: "Pendent",
        response: "Quick",
        temperature: "68 C",
        "k factor": "80",
        dimension: "15"
      }
    }
  };
  const warningRequirement = {
    ...exactRequirement,
    id: "44444444-4444-4444-8444-444444444444",
    value_json: { attributes: { "k-faktor": "560" } }
  };

  assert.equal(bulkProductApprovalSelection({ requirement: exactRequirement, handled: false })?.productNumber, "19045188");
  assert.equal(bulkProductApprovalSelection({ requirement: ambiguousRequirement, handled: false }), null);
  assert.equal(bulkProductApprovalSelection({ requirement: warningRequirement, handled: false }), null);
});
