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
    value_json: {
      postNumber: "33.335.1",
      nsCode: "UB1.111",
      operation: "install",
      quantity: 12,
      unit: "st",
      attributes: { kapittelpost: "3325 Utstyr" }
    }
  },
  {
    id: "requirement-2",
    category: "Sprinklerhuvud",
    requirement_key: "temperature",
    value_text: "Reservpost utan produktval",
    value_json: {
      postNumber: "33.335.2",
      operation: "install",
      quantity: 4,
      unit: "st"
    }
  },
  {
    id: "requirement-3",
    category: "Demontering",
    requirement_key: "removal",
    value_text: "Demontera sprinklerledning",
    value_json: {
      postNumber: "33.335.3",
      operation: "remove",
      quantity: 18,
      unit: "m"
    }
  }
];

const assignments = [
  {
    id: "assignment-1",
    requirement_id: "requirement-1",
    status: "selected",
    selected_at: "2026-08-19T10:00:00.000Z",
    product_snapshot: {
      source: "distributor_manual",
      approvedByUser: true,
      approvalStatus: "user_approved",
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

test("keeps every post number in products, accessories, unselected rows and removals", () => {
  const rows = buildProjectMaterialRows({ requirements, assignments });

  assert.equal(rows.length, 4);
  assert.deepEqual(rows.map((row) => row.type), [
    "Huvudprodukt",
    "Tillbehör",
    "Ej produktvald",
    "Demontering"
  ]);
  assert.deepEqual([...new Set(rows.map((row) => row.postNumber))], [
    "33.335.1",
    "33.335.2",
    "33.335.3"
  ]);
  assert.equal(rows[0]?.requirementValue, "K80");
  assert.equal(rows[0]?.chapterPost, "3325 Utstyr");
  assert.equal(rows[0]?.productNumber, "AHL-1001");
  assert.equal(rows[0]?.quantity, 12);
  assert.equal(rows[0]?.unit, "st");
  assert.equal(rows[1]?.productNumber, "AHL-2001");
  assert.equal(rows[1]?.quantity, 24);
  assert.equal(rows[2]?.quantity, 4);
  assert.equal(rows[3]?.operation, "Demontering");
  assert.equal(rows[3]?.quantity, 18);
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
  const sheet = workbook.getWorksheet("Materiallista");
  assert.equal(sheet?.getCell("B5").value, "PDF-postnummer");
  assert.equal(sheet?.getCell("B6").value, "33.335.1");
  assert.equal(sheet?.getCell("C5").value, "Kapitelpost");
  assert.equal(sheet?.getCell("C6").value, "3325 Utstyr");
  assert.equal(sheet?.getCell("I6").value, "AHL-1001");
  assert.equal(sheet?.getCell("K6").value, 12);
  assert.equal(sheet?.getCell("K7").value, 24);
  assert.equal(sheet?.getCell("B8").value, "33.335.2");
  assert.equal(sheet?.getCell("B9").value, "33.335.3");
  assert.equal(sheet?.getCell("D9").value, "Demontering");
});

test("does not export a suggested product before user approval", () => {
  const unapprovedAssignments = assignments.map((assignment) => ({
    ...assignment,
    product_snapshot: {
      ...(assignment.product_snapshot as Record<string, unknown>),
      approvedByUser: false,
      approvalStatus: "suggested"
    }
  }));

  const rows = buildProjectMaterialRows({
    requirements,
    assignments: unapprovedAssignments
  });

  assert.equal(rows[0]?.type, "Ej produktvald");
  assert.equal(rows[0]?.productNumber, "");
});
