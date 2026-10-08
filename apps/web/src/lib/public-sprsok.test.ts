import assert from "node:assert/strict";
import test from "node:test";
import { isSprsokHeadingRow, publicSprsokProduct, safeSprsokDatasheet, searchPublicSprsok, sprsokPage, type PublicSprsokProduct } from "./public-sprsok";

const product = (overrides: Partial<PublicSprsokProduct> = {}): PublicSprsokProduct => ({ id: 1, sin: "TY-123", leverandor: "Tyco", type: "Standard", utforelse: "Pendent", k_verdi: "80", rti: "QR", datablad: "https://example.com/data.pdf", ...overrides });

test("only the literal imported heading is omitted, not products with similar names", () => {
  assert.equal(isSprsokHeadingRow(product({ sin: "SIN", leverandor: "Leverandør", type: "Type", utforelse: "Utførelse" })), true);
  assert.equal(isSprsokHeadingRow(product({ sin: "SIN" })), false);
  assert.equal(isSprsokHeadingRow(product()), false);
});

test("public projection omits internal fields and rejects executable datasheet links", () => {
  const row = { ...product(), source_data: { private: true }, organization_id: "private", datablad: "javascript:alert(1)" };
  assert.deepEqual(Object.keys(publicSprsokProduct(row)).sort(), ["id", "sin", "leverandor", "type", "utforelse", "k_verdi", "rti", "datablad"].sort());
  assert.equal(publicSprsokProduct(row).datablad, null);
  assert.equal(safeSprsokDatasheet("//example.com/data.pdf"), null);
  assert.equal(safeSprsokDatasheet("https://user:password@example.com/data.pdf"), null);
  assert.equal(safeSprsokDatasheet("https://example.com/data.pdf"), "https://example.com/data.pdf");
});

test("search accepts formatted SIN numbers and terms across product fields", () => {
  const products = [product(), product({ id: 2, sin: "R-10", leverandor: "Reliable" })];
  assert.deepEqual(searchPublicSprsok(products, new URLSearchParams({ q: "ty123" })).map(p => p.id), [1]);
  assert.deepEqual(searchPublicSprsok(products, new URLSearchParams({ q: "tyco QR" })).map(p => p.id), [1]);
  assert.equal(searchPublicSprsok(products, new URLSearchParams({ q: "not found" })).length, 0);
});

test("filters combine exactly and preserve distinct variants sharing a SIN", () => {
  const products = [product(), product({ id: 2, utforelse: "Upright" }), product({ id: 3, leverandor: "Other" })];
  assert.equal(searchPublicSprsok(products, new URLSearchParams()).length, 3);
  assert.deepEqual(searchPublicSprsok(products, new URLSearchParams({ leverandor: "Tyco", utforelse: "Upright" })).map(p => p.id), [2]);
  assert.equal(searchPublicSprsok(products, new URLSearchParams({ leverandor: "ty" })).length, 0);
});

test("numeric sorting and pagination handle copied or malformed URLs", () => {
  const products = [product({ id: 1, sin: "R10" }), product({ id: 2, sin: "R2" })];
  assert.deepEqual(searchPublicSprsok(products, new URLSearchParams()).map(p => p.sin), ["R2", "R10"]);
  assert.deepEqual(searchPublicSprsok(products, new URLSearchParams({ sort: "sin", dir: "desc" })).map(p => p.sin), ["R10", "R2"]);
  for (const page of ["NaN", "-1", "1.5", "Infinity"]) assert.equal(sprsokPage(new URLSearchParams({ page }), 414), 1);
  assert.equal(sprsokPage(new URLSearchParams({ page: "99" }), 414), 9);
  assert.equal(sprsokPage(new URLSearchParams({ page: "9" }), 0), 1);
});
