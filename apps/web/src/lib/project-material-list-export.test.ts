import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import {
  buildProjectMaterialRows,
  createProjectMaterialListWorkbook
} from "./project-material-list-export";

const requirements = [
  {
    id: "requirement-1",
    category: "Sprinklerhuvud",
    requirement_key: "k_factor",
    value_text: "K80",
    value_json: { quantity: 12, unit: "st" }
  }
];

const assignments = [
  {
    id: "assignment-1",
    requirement_id: "requirement-1",
    selected_at: "2026-08-19T10:00:00.000Z",
    product_snapshot: {
      source: "distributor_manual",
      distributor: "Ahlsell",
      name: "Demo sprinkler K80",
      productNumber: "AHL-1001",
      manufacturer: "Demo Fire",
      notes: "Kontrollera temperaturklass",
      accessories: [
        {
          name: "Rosett",
          productNumber: "AHL-2001",
          quantity: 2,
          unit: "st",
          notes: "Vit"
        }
      ]
    }
  }
];

test("builds separate, traceable rows for products and accessories", () => {
  const rows = buildProjectMaterialRows({ requirements, assignments });

  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((row) => row.type), ["Huvudprodukt", "Tillbehör"]);
  assert.equal(rows[0]?.requirementValue, "K80");
  assert.equal(rows[0]?.productNumber, "AHL-1001");
  assert.equal(rows[0]?.quantity, 12);
  assert.equal(rows[0]?.unit, "st");
  assert.equal(rows[1]?.productNumber, "AHL-2001");
  assert.equal(rows[1]?.quantity, 24);
});

test("creates a valid xlsx workbook with project and material sheets", async () => {
  const rows = buildProjectMaterialRows({ requirements, assignments });
  const bytes = await createProjectMaterialListWorkbook({
    organizationName: "Ovasia AB",
    project: {
      id: "50e966f4-bf66-4458-a1a2-7a33dbf42dd7",
      name: "Testprojekt",
      project_number: "P-100",
      customer_name: "Testkund",
      end_customer: null,
      standard: "NS-EN 12845",
      system_type: "Wet sprinkler system",
      supplier: "Ahlsell",
      status: "proposal_ready"
    },
    rows,
    generatedAt: new Date("2026-08-19T10:00:00.000Z")
  });

  assert.equal(Buffer.from(bytes).subarray(0, 2).toString(), "PK");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(
    Buffer.from(bytes) as unknown as Parameters<typeof workbook.xlsx.load>[0]
  );
  assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), [
    "Projekt",
    "Materiallista"
  ]);
  assert.equal(workbook.getWorksheet("Materiallista")?.getCell("G6").value, "AHL-1001");
  assert.equal(workbook.getWorksheet("Materiallista")?.getCell("I6").value, 12);
  assert.equal(workbook.getWorksheet("Materiallista")?.getCell("I7").value, 24);
});
