import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { guidedProjectCompletionUpdate, guidedProjectWorkflow } from "./guided-project-workflow";
import { buildProjectMaterialRows, createProjectMaterialListWorkbook } from "./project-material-list-export";

const project = {
  id: "partial-project", name: "Delvis klart projekt", project_number: "DEL-1",
  customer_name: null, end_customer: null, standard: null, system_type: null,
  supplier: "Ahlsell", status: "analysis"
};

test("exports one approved post and preserves unfinished posts when the project is closed", async () => {
  const requirements = ["33.1", "33.2"].map((postNumber, index) => ({
    id: `post-${index}`, category: "sprinkler", requirement_key: "sprinkler",
    value_text: "Sprinkler K80", value_json: { postNumber, quantity: 12, unit: "st" }
  }));
  const assignments = requirements.map((requirement, index) => ({
    id: `selection-${index}`, requirement_id: requirement.id, status: "selected", selected_at: null,
    product_snapshot: {
      name: `Sprinkler ${index}`, productNumber: `925000${index}`,
      source: "distributor_manual", approvedByUser: index === 0,
      approvalStatus: index === 0 ? "user_approved" : "suggested"
    }
  }));
  const workflow = guidedProjectWorkflow({ documentCount: 1, requirements, assignments });
  assert.equal(workflow.isComplete, false);
  assert.equal(workflow.remainingProductCount, 1);
  const rows = buildProjectMaterialRows({ requirements, assignments });

  for (const status of [project.status, guidedProjectCompletionUpdate().status]) {
    const bytes = await createProjectMaterialListWorkbook({ organizationName: "Test", project: { ...project, status }, rows });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(bytes) as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    const sheet = workbook.getWorksheet("Materiallista")!;
    assert.equal(sheet.getCell("B6").value, "33.1");
    assert.equal(sheet.getCell("I6").value, "9250000");
    assert.equal(sheet.getCell("B7").value, "33.2");
    assert.equal(sheet.getCell("E7").value, "Ej produktvald");
    assert.equal(sheet.getCell("I7").value, null);
    assert.match(String(sheet.getCell("M7").value), /Produktval saknas/);
  }
  assert.equal(assignments[1].product_snapshot.approvedByUser, false);
});

test("exports an empty material list with project information before any posts are added", async () => {
  const bytes = await createProjectMaterialListWorkbook({ organizationName: "Test", project, rows: [] });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(bytes) as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  assert.equal(workbook.getWorksheet("Projekt")?.getCell("B3").value, project.name);
  const sheet = workbook.getWorksheet("Materiallista")!;
  assert.equal(sheet.getCell("B5").value, "PDF-postnummer");
  assert.equal(sheet.getCell("B6").value, null);
});
