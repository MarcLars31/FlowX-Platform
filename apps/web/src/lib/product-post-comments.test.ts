import assert from "node:assert/strict";
import test from "node:test";
import { validateProductPostComment } from "./product-post-comments";

const base = { id: "11111111-1111-4111-8111-111111111111", body: " Kontrollera ritningen " };
test("post and product comments have explicit, separate targets", () => {
  assert.deepEqual(validateProductPostComment({ ...base, productNumber: null }), {
    data: { ...base, body: "Kontrollera ritningen", product_number: null, product_name: null }
  });
  const product = validateProductPostComment({ ...base, productNumber: "NRF 925 6649", productName: " Ventil " });
  assert.ok(product.data);
  assert.equal(product.data.product_number, "9256649");
  assert.equal(product.data.product_name, "Ventil");
  assert.ok("error" in validateProductPostComment(base));
  assert.ok("error" in validateProductPostComment({ ...base, productNumber: "", productName: "Ventil" }));
});
test("rejects empty, oversized and malformed comments rather than silently truncating", () => {
  for (const body of [null, 4, " ", "a".repeat(3001)]) {
    assert.ok("error" in validateProductPostComment({ ...base, productNumber: null, body }));
  }
  assert.ok("error" in validateProductPostComment({ ...base, productNumber: null, id: "invalid" }));
  assert.ok("data" in validateProductPostComment({ ...base, productNumber: null, body: "a".repeat(3000) }));
});
