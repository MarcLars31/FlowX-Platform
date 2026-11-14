export const DEMO_DATA_DISCLAIMER =
  "Demo data – ej verifierad för projektering, installation eller inköp.";

export type DemoAwareRecord = {
  demo_data_set_id?: string | null;
  data_set_id?: string | null;
  data_mode?: string | null;
  quality_status?: string | null;
};

export function isDemoData(record: DemoAwareRecord | null | undefined) {
  if (!record) return false;
  return Boolean(record.demo_data_set_id)
    || record.data_mode === "demo"
    || record.quality_status === "demo_unverified";
}

export type DemoMaterialExportRow = {
  line: number;
  category: string;
  product: string;
  supplier: string;
  quantity: number;
  unit: string;
  notes: string;
};

export function buildDemoMaterialListCsv(rows: readonly DemoMaterialExportRow[]) {
  const output = [
    ["Data notice", DEMO_DATA_DISCLAIMER],
    [],
    ["Line", "Category", "Product", "Supplier", "Quantity", "Unit", "Notes"],
    ...rows.map((row) => [
      row.line,
      row.category,
      row.product,
      row.supplier,
      row.quantity,
      row.unit,
      row.notes
    ])
  ];
  return `\uFEFF${output.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

function csvCell(value: string | number) {
  let text = String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
