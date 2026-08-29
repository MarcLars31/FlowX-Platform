export const PRODUCT_TABLE_COLUMN_IDS = [
  "control",
  "post",
  "requirement",
  "category",
  "quantity",
  "product"
] as const;

export type ProductTableColumnId = typeof PRODUCT_TABLE_COLUMN_IDS[number];

export type ProductTableLayout = {
  order: ProductTableColumnId[];
  hidden: ProductTableColumnId[];
};

export const PRODUCT_TABLE_LAYOUT_STORAGE_KEY = "scipx.product-table-layout.v1";

export const DEFAULT_PRODUCT_TABLE_LAYOUT: ProductTableLayout = {
  order: [...PRODUCT_TABLE_COLUMN_IDS],
  hidden: []
};

const PRODUCT_TABLE_COLUMN_ID_SET = new Set<string>(PRODUCT_TABLE_COLUMN_IDS);
const LOCKED_VISIBLE_COLUMNS = new Set<ProductTableColumnId>(["control", "post", "requirement"]);

export function normalizeProductTableLayout(value: unknown): ProductTableLayout {
  if (!value || typeof value !== "object" || Array.isArray(value)) return cloneDefaultLayout();
  const candidate = value as { order?: unknown; hidden?: unknown };
  const order = uniqueProductTableColumnIds(candidate.order);
  for (const columnId of PRODUCT_TABLE_COLUMN_IDS) {
    if (!order.includes(columnId)) order.push(columnId);
  }
  const hidden = uniqueProductTableColumnIds(candidate.hidden).filter(
    (columnId) => !LOCKED_VISIBLE_COLUMNS.has(columnId)
  );
  return { order, hidden };
}

export function parseProductTableLayout(serialized: string | null): ProductTableLayout {
  if (!serialized) return cloneDefaultLayout();
  try {
    return normalizeProductTableLayout(JSON.parse(serialized));
  } catch {
    return cloneDefaultLayout();
  }
}

export function moveProductTableColumn(
  layout: ProductTableLayout,
  columnId: ProductTableColumnId,
  targetColumnId: ProductTableColumnId,
  placement: "before" | "after" = "before"
): ProductTableLayout {
  const normalized = normalizeProductTableLayout(layout);
  const sourceIndex = normalized.order.indexOf(columnId);
  if (sourceIndex < 0 || columnId === targetColumnId) return normalized;
  const order = normalized.order.filter((orderedColumnId) => orderedColumnId !== columnId);
  const targetIndex = order.indexOf(targetColumnId);
  if (targetIndex < 0) return normalized;
  order.splice(targetIndex + (placement === "after" ? 1 : 0), 0, columnId);
  return { ...normalized, order };
}

export function moveProductTableColumnByOffset(
  layout: ProductTableLayout,
  columnId: ProductTableColumnId,
  offset: -1 | 1
): ProductTableLayout {
  const normalized = normalizeProductTableLayout(layout);
  const sourceIndex = normalized.order.indexOf(columnId);
  const targetIndex = sourceIndex + offset;
  if (sourceIndex < 0 || targetIndex < 0 || targetIndex >= normalized.order.length) return normalized;
  const order = [...normalized.order];
  [order[sourceIndex], order[targetIndex]] = [order[targetIndex], order[sourceIndex]];
  return { ...normalized, order };
}

export function setProductTableColumnVisible(
  layout: ProductTableLayout,
  columnId: ProductTableColumnId,
  visible: boolean
): ProductTableLayout {
  const normalized = normalizeProductTableLayout(layout);
  if (!visible && LOCKED_VISIBLE_COLUMNS.has(columnId)) return normalized;
  const hidden = visible
    ? normalized.hidden.filter((hiddenColumnId) => hiddenColumnId !== columnId)
    : [...new Set([...normalized.hidden, columnId])];
  return { ...normalized, hidden };
}

export function isProductTableColumnLocked(columnId: ProductTableColumnId) {
  return LOCKED_VISIBLE_COLUMNS.has(columnId);
}

export function productTableRowClass({
  approved,
  selected
}: {
  approved: boolean;
  selected: boolean;
}) {
  if (approved) return "bg-emerald-100/80 hover:bg-emerald-100";
  if (selected) return "bg-cyan-50 ring-1 ring-inset ring-flow-500";
  return "bg-white hover:bg-ink-50/80";
}

function uniqueProductTableColumnIds(value: unknown): ProductTableColumnId[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(
    (columnId): columnId is ProductTableColumnId => typeof columnId === "string" && PRODUCT_TABLE_COLUMN_ID_SET.has(columnId)
  ))];
}

function cloneDefaultLayout(): ProductTableLayout {
  return {
    order: [...DEFAULT_PRODUCT_TABLE_LAYOUT.order],
    hidden: [...DEFAULT_PRODUCT_TABLE_LAYOUT.hidden]
  };
}
