import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_PRODUCT_TABLE_LAYOUT,
  moveProductTableColumn,
  moveProductTableColumnByOffset,
  normalizeProductTableLayout,
  parseProductTableLayout,
  productTableRowClass,
  setProductTableColumnVisible
} from "./product-table-layout";

test("uses the default product table layout for missing or malformed storage", () => {
  assert.deepEqual(parseProductTableLayout(null), DEFAULT_PRODUCT_TABLE_LAYOUT);
  assert.deepEqual(parseProductTableLayout("not-json"), DEFAULT_PRODUCT_TABLE_LAYOUT);
  assert.deepEqual(normalizeProductTableLayout([]), DEFAULT_PRODUCT_TABLE_LAYOUT);
  assert.equal(
    DEFAULT_PRODUCT_TABLE_LAYOUT.order.indexOf("nsCode"),
    DEFAULT_PRODUCT_TABLE_LAYOUT.order.indexOf("post") + 1
  );
});

test("normalizes saved columns and appends new or missing columns", () => {
  const layout = normalizeProductTableLayout({
    order: ["product", "post", "product", "unknown"],
    hidden: ["category", "unknown", "category"]
  });
  assert.deepEqual(layout.order.slice(0, 2), ["product", "post"]);
  assert.equal(new Set(layout.order).size, DEFAULT_PRODUCT_TABLE_LAYOUT.order.length);
  assert.deepEqual(layout.hidden, ["category"]);

  const legacyLayout = normalizeProductTableLayout({
    order: ["control", "post", "requirement", "category", "quantity", "product"],
    hidden: []
  });
  assert.equal(legacyLayout.order.indexOf("nsCode"), legacyLayout.order.indexOf("post") + 1);
});

test("moves columns without mutating the saved layout", () => {
  const original = normalizeProductTableLayout(DEFAULT_PRODUCT_TABLE_LAYOUT);
  const moved = moveProductTableColumn(original, "product", "post");
  assert.deepEqual(original.order, DEFAULT_PRODUCT_TABLE_LAYOUT.order);
  assert.equal(moved.order.indexOf("product"), moved.order.indexOf("post") - 1);

  const movedAfter = moveProductTableColumn(original, "control", "product", "after");
  assert.equal(movedAfter.order.at(-1), "control");
  assert.equal(movedAfter.order.at(-2), "product");

  const movedRight = moveProductTableColumnByOffset(moved, "product", 1);
  assert.equal(movedRight.order.indexOf("product"), movedRight.order.indexOf("post") + 1);
});

test("hides optional columns but keeps core columns visible", () => {
  const hiddenCategory = setProductTableColumnVisible(DEFAULT_PRODUCT_TABLE_LAYOUT, "category", false);
  assert.deepEqual(hiddenCategory.hidden, ["category"]);
  assert.deepEqual(setProductTableColumnVisible(hiddenCategory, "category", true).hidden, []);
  assert.deepEqual(setProductTableColumnVisible(DEFAULT_PRODUCT_TABLE_LAYOUT, "control", false).hidden, []);
  assert.deepEqual(setProductTableColumnVisible(DEFAULT_PRODUCT_TABLE_LAYOUT, "post", false).hidden, []);
  assert.deepEqual(setProductTableColumnVisible(DEFAULT_PRODUCT_TABLE_LAYOUT, "nsCode", false).hidden, []);
  assert.deepEqual(setProductTableColumnVisible(DEFAULT_PRODUCT_TABLE_LAYOUT, "requirement", false).hidden, []);
});

test("colors only approved product rows green", () => {
  assert.equal(
    productTableRowClass({ approved: false, selected: false }),
    "bg-white hover:bg-ink-50/80"
  );
  assert.equal(
    productTableRowClass({ approved: false, selected: true }),
    "bg-cyan-50 ring-1 ring-inset ring-flow-500"
  );
  assert.equal(
    productTableRowClass({ approved: true, selected: true }),
    "bg-emerald-100/80 hover:bg-emerald-100"
  );
});
