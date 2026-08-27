import assert from "node:assert/strict";
import test from "node:test";
import {
  accessoriesForSelectedProduct,
  newProductAccessoryDraft,
  productAccessoryDraftError,
  productAccessoryPayload,
  readProductAccessoryDrafts
} from "./product-card-accessories";

test("reads saved accessories and supplies safe defaults", () => {
  assert.deepEqual(readProductAccessoryDrafts([
    { name: " Rosett ", productNumber: " 7654321 ", quantity: "2", unit: "", notes: " Vit " },
    { name: "" }
  ]), [{
    name: "Rosett",
    productNumber: "7654321",
    quantity: "2",
    unit: "st",
    notes: "Vit"
  }]);
});

test("keeps accessories only while the same normalized main NRF is selected", () => {
  const accessories = [{ ...newProductAccessoryDraft(), name: "Rosett" }];
  assert.equal(accessoriesForSelectedProduct({
    currentProductNumber: "925 4014",
    nextProductNumber: "9254014",
    accessories
  }), accessories);
  assert.deepEqual(accessoriesForSelectedProduct({
    currentProductNumber: "9254014",
    nextProductNumber: "9254042",
    accessories
  }), []);
});

test("requires complete, valid and unique accessory drafts", () => {
  assert.match(productAccessoryDraftError([newProductAccessoryDraft()]) ?? "", /namnet/);
  assert.match(productAccessoryDraftError([{
    ...newProductAccessoryDraft(),
    name: "Rosett",
    quantity: "0"
  }]) ?? "", /giltig mängd/);
  assert.match(productAccessoryDraftError([
    { ...newProductAccessoryDraft(), name: "Rosett vit", productNumber: "765 4321" },
    { ...newProductAccessoryDraft(), name: "Annat namn", productNumber: "7654321" }
  ]) ?? "", /redan tillagt/);
  assert.equal(productAccessoryDraftError([
    { ...newProductAccessoryDraft(), name: "Rosett" }
  ]), null);
  assert.equal(productAccessoryDraftError(Array.from({ length: 20 }, (_, index) => ({
    ...newProductAccessoryDraft(),
    name: `Tillbehör ${index + 1}`
  }))), null);
  assert.match(productAccessoryDraftError(Array.from({ length: 21 }, (_, index) => ({
    ...newProductAccessoryDraft(),
    name: `Tillbehör ${index + 1}`
  }))) ?? "", /Högst 20/);
});

test("builds the exact accessory payload saved with the selected product", () => {
  assert.deepEqual(productAccessoryPayload([{
    name: " Rosett ",
    productNumber: " 7654321 ",
    quantity: "2",
    unit: " ",
    notes: " Vit "
  }]), [{
    name: "Rosett",
    productNumber: "7654321",
    quantity: 2,
    unit: "st",
    notes: "Vit"
  }]);
});
