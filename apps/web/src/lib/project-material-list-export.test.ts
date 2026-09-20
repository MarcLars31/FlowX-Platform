import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import {
  buildProjectMaterialRows,
  createProjectMaterialListWorkbook
} from "./project-material-list-export";
import type { MaterialListComment } from "./project-material-list-export";
import { validateDistributorProductMapping } from "./distributor-product-mapping";
import { newProductAccessoryDraft, productAccessoryPayload, readProductAccessoryDrafts } from "./product-card-accessories";

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
    value_text: "Reservpost utan produktval med en längre teknisk beskrivning som ska radbrytas och vara läsbar i den exporterade materiallistan.",
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

test("creates a valid xlsx workbook without an overlapping table filter", async () => {
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
  assert.equal(sheet?.getTables().length, 0);
  assert.ok(sheet?.autoFilter);
  assert.equal(sheet?.getCell("B5").value, "PDF-postnummer");
  assert.equal(sheet?.getCell("B6").value, "33.335.1");
  assert.equal(sheet?.getCell("C5").value, "Kapitelpost");
  assert.equal(sheet?.getCell("C6").value, "3325 Utstyr");
  assert.equal(sheet?.getCell("I5").value, "NRF-nummer");
  assert.equal(sheet?.getCell("I6").value, "AHL-1001");
  assert.equal(sheet?.getCell("K6").value, 12);
  assert.equal(sheet?.getCell("K7").value, 24);
  assert.equal(sheet?.getCell("B8").value, "33.335.2");
  assert.ok((sheet?.getRow(8).height ?? 0) > 32);
  assert.equal(sheet?.getCell("B9").value, "33.335.3");
  assert.equal(sheet?.getCell("D9").value, "Demontering");
});

test("five total fittings on 68 metres export as five, including after reload and with manual main quantity", async () => {
  const accessoryDraft = { ...newProductAccessoryDraft(), name: "T-stykke DN32", productNumber: "7654321", quantity: "5" };
  const validation = validateDistributorProductMapping({
    requirementId: "11111111-1111-4111-8111-111111111111", userApproved: true, entryMethod: "catalog",
    productNumber: "1234567", orderQuantity: { quantity: "12", unit: "st" }, accessories: productAccessoryPayload([accessoryDraft])
  });
  assert.ok("data" in validation);
  const snapshot = { ...assignments[0].product_snapshot, orderQuantity: validation.data.orderQuantity, accessories: validation.data.accessories };
  const reloaded = readProductAccessoryDrafts(snapshot.accessories);
  assert.equal(reloaded[0].quantity, "5");
  assert.equal(reloaded[0].quantityBasis, "total");
  const pipe = { ...requirements[0], value_json: { quantity: 68, unit: "m", postNumber: "33.2.2.2" } };
  const rows = buildProjectMaterialRows({ requirements: [pipe], assignments: [{ ...assignments[0], product_snapshot: snapshot }] });
  assert.deepEqual(rows.map(row => [row.quantity, row.unit]), [[12, "st"], [5, "st"]]);
  assert.equal(pipe.value_json.quantity, 68);
  const bytes = await createProjectMaterialListWorkbook({ organizationName: "Test", project: {
    id: "project", name: "Mängdtest", project_number: "1", customer_name: null, end_customer: null,
    standard: null, system_type: null, supplier: "Ahlsell", status: "draft"
  }, rows, generatedAt: new Date("2026-09-20T10:00:00Z") });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(bytes) as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  const sheet = workbook.getWorksheet("Materiallista")!;
  assert.equal(sheet.getCell("K6").value, 12);
  assert.equal(sheet.getCell("K7").value, 5);
});

test("total accessories export even when PDF quantity is missing; legacy per-unit accessories keep their meaning", () => {
  const snapshot = { ...assignments[0].product_snapshot, accessories: [
    { name: "Total", productNumber: "A", quantity: 5, unit: "st", notes: "", quantityBasis: "total" },
    { name: "Legacy", productNumber: "B", quantity: 2, unit: "st", notes: "" }
  ] };
  const assignment = { ...assignments[0], product_snapshot: snapshot };
  const withQuantity = buildProjectMaterialRows({ requirements: [requirements[0]], assignments: [assignment] });
  assert.deepEqual(withQuantity.map(row => row.quantity), [12, 5, 24]);
  const missing = { ...requirements[0], value_json: { postNumber: "33.2.2.2", unit: "m" } };
  const withoutQuantity = buildProjectMaterialRows({ requirements: [missing], assignments: [assignment] });
  assert.deepEqual(withoutQuantity.map(row => row.quantity), [null, 5, null]);
  assert.equal(withoutQuantity[1].notes, "");
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

const comment = (id: string, requirementId: string, productNumber: string | null, body: string): MaterialListComment => ({
  id, requirement_id: requirementId, product_number: productNumber,
  product_name: productNumber ? "Demo sprinkler" : null,
  body, author_name: "Anna", created_at: "2026-09-17T10:30:00.000Z"
});

async function commentWorkbook(comments: MaterialListComment[], selected = assignments) {
  const bytes = await createProjectMaterialListWorkbook({
    organizationName: "Testorganisation",
    project: { id: "test", name: "Kommentarstest", project_number: null, customer_name: null,
      end_customer: null, standard: null, system_type: null, supplier: "Ahlsell", status: "in_review" },
    rows: buildProjectMaterialRows({ requirements, assignments: selected }), comments
  });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(bytes) as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  return workbook;
}

test("exports saved post and selected-product comments with author/date without leaking to accessories or other products", async () => {
  const workbook = await commentWorkbook([
    comment("1", "requirement-1", null, "Postens kommentar"),
    comment("2", "requirement-1", "NRF AHL 1001", "Produktens kommentar"),
    comment("3", "requirement-1", "OLD-1001", "Kommentar på tidigare produkt"),
    comment("4", "another-requirement", "AHL-1001", "Kommentar på annan post"),
    comment("5", "requirement-2", null, "Post utan vald produkt"),
    comment("6", "requirement-3", null, "Kommentar till demontering"),
    comment("7", "requirement-1", "AHL-2001", "Kommentar hör inte till huvudprodukten")
  ]);
  const sheet = workbook.getWorksheet("Materiallista")!;
  assert.equal(sheet.getCell("N5").value, "Postkommentarer");
  assert.equal(sheet.getCell("O5").value, "Produktkommentarer");
  assert.match(sheet.getCell("N6").text, /2026-09-17 10:30 UTC · Anna\nPostens kommentar/);
  assert.match(sheet.getCell("O6").text, /Produktens kommentar/);
  assert.equal(sheet.getCell("M6").value, "Kontrollera temperaturklass");
  assert.equal(sheet.getCell("N7").value, null);
  assert.equal(sheet.getCell("O7").value, null);
  assert.match(sheet.getCell("N8").text, /Post utan vald produkt/);
  assert.equal(sheet.getCell("O8").value, null);
  assert.match(sheet.getCell("N9").text, /Kommentar till demontering/);
  assert.equal(sheet.getCell("N6").alignment.wrapText, true);
  const history = workbook.getWorksheet("Kommentarer")!;
  assert.equal(history.rowCount, 7);
  assert.equal(history.getCell("A4").value, "33.335.1");
  assert.equal(history.getCell("B4").value, "Posten");
  assert.equal(history.getCell("E4").value, "Anna");
  assert.equal(history.getCell("F4").value, "2026-09-17 10:30 UTC");
  assert.equal(history.getCell("G5").value, "Produktens kommentar");
  assert.ok(!JSON.stringify(history.model).includes("tidigare produkt"));
  assert.ok(!JSON.stringify(history.model).includes("annan post"));
});

test("does not present comments about an unapproved product as exported product comments", async () => {
  const workbook = await commentWorkbook([
    comment("1", "requirement-1", null, "Postkommentar finns kvar"),
    comment("2", "requirement-1", "AHL-1001", "Ej godkänd produkt")
  ], []);
  assert.equal(workbook.getWorksheet("Materiallista")!.getCell("O6").value, null);
  assert.equal(workbook.getWorksheet("Kommentarer")!.rowCount, 4);
});

test("preserves a long comment history in full and writes user text as strings, never formulas", async () => {
  const comments = Array.from({ length: 60 }, (_, index) => comment(String(index).padStart(3, "0"), "requirement-1", null, `${index}: ${"x".repeat(2990)}`));
  comments.push(comment("999", "requirement-1", "AHL-1001", '=HYPERLINK("https://example.com","text")'));
  const workbook = await commentWorkbook(comments);
  const sheet = workbook.getWorksheet("Materiallista")!;
  assert.ok(sheet.getCell("N6").text.length < 32767);
  assert.match(sheet.getCell("N6").text, /60 kommentarer.*fliken Kommentarer/);
  const history = workbook.getWorksheet("Kommentarer")!;
  assert.equal(history.rowCount, 64);
  assert.equal(history.getCell("G63").value, comments[59].body);
  assert.equal(history.getCell("G64").value, comments[60].body);
  assert.equal(history.getCell("G64").type, ExcelJS.ValueType.String);
  assert.equal(history.getCell("G64").formula, undefined);
});
