import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { createProjectMaterialListPdf } from "./project-material-list-pdf";
import type { ProjectMaterialRow } from "./project-material-list-export";

const rows: ProjectMaterialRow[] = [
  {
    type: "Huvudprodukt",
    postNumber: "33.335.1",
    chapterPost: "3325 Utstyr",
    operation: "Installation",
    nsCode: "UE2.11111112A",
    requirementCategory: "Sprinklerhuvud",
    requirementKey: "sprinkler",
    requirementValue: "Konventionell sprinkler K80, 68 °C",
    productName: "Viking Demo K80",
    productNumber: "AHL-1001",
    manufacturer: "Viking",
    quantity: 20,
    unit: "st",
    notes: "",
    distributor: "Ahlsell"
  },
  {
    type: "Demontering",
    postNumber: "33.335.3",
    chapterPost: "3325 Utstyr",
    operation: "Demontering",
    nsCode: "UE2.11111112A",
    requirementCategory: "Sprinklerhuvud",
    requirementKey: "sprinkler",
    requirementValue: "Demontering av befintlig sprinkler",
    productName: "Demontering enligt teknisk beskrivning",
    productNumber: "",
    manufacturer: "",
    quantity: 6,
    unit: "st",
    notes: "",
    distributor: ""
  }
];

test("creates a readable project PDF from the same traceable material rows", async () => {
  const bytes = await createProjectMaterialListPdf({
    organizationName: "Ovasia AB",
    project: {
      id: "50e966f4-bf66-4458-a1a2-7a33dbf42dd7",
      name: "Testprojekt",
      project_number: "P-100",
      customer_name: "Testkund",
      end_customer: null,
      standard: "NS-EN 12845",
      system_type: "Våtrör",
      supplier: "Ahlsell",
      status: "proposal_ready"
    },
    rows,
    generatedAt: new Date("2026-08-21T10:00:00.000Z")
  });

  assert.equal(Buffer.from(bytes).subarray(0, 5).toString(), "%PDF-");
  const document = await PDFDocument.load(bytes);
  assert.ok(document.getPageCount() >= 1);
  assert.equal(document.getTitle(), "Projektsammanfattning - Testprojekt");
});
