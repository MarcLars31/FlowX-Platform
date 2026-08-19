import ExcelJS from "exceljs";

export type MaterialListProject = {
  id: string;
  name: string;
  project_number: string | null;
  customer_name: string | null;
  end_customer: string | null;
  standard: string | null;
  system_type: string | null;
  supplier: string | null;
  status: string;
};

export type MaterialListRequirement = {
  id: string;
  category: string;
  requirement_key: string;
  value_text: string | null;
};

export type MaterialListAssignment = {
  id: string;
  requirement_id: string | null;
  product_snapshot: unknown;
  selected_at: string | null;
};

export type ProjectMaterialRow = {
  type: "Huvudprodukt" | "Tillbehör";
  requirementCategory: string;
  requirementKey: string;
  requirementValue: string;
  productName: string;
  productNumber: string;
  manufacturer: string;
  quantity: number;
  unit: string;
  notes: string;
  distributor: string;
};

export function buildProjectMaterialRows({
  requirements,
  assignments
}: {
  requirements: MaterialListRequirement[];
  assignments: MaterialListAssignment[];
}) {
  const requirementsById = new Map(
    requirements.map((requirement) => [requirement.id, requirement])
  );
  const rows: ProjectMaterialRow[] = [];

  for (const assignment of assignments) {
    const snapshot = record(assignment.product_snapshot);
    if (
      snapshot.source !== "distributor_manual" ||
      !text(snapshot.name) ||
      !text(snapshot.productNumber)
    ) {
      continue;
    }

    const requirement = assignment.requirement_id
      ? requirementsById.get(assignment.requirement_id)
      : undefined;
    const requirementFields = {
      requirementCategory: requirement?.category ?? "",
      requirementKey: requirement?.requirement_key ?? "",
      requirementValue: requirement?.value_text ?? ""
    };

    rows.push({
      type: "Huvudprodukt",
      ...requirementFields,
      productName: text(snapshot.name),
      productNumber: text(snapshot.productNumber),
      manufacturer: text(snapshot.manufacturer),
      quantity: 1,
      unit: "st",
      notes: text(snapshot.notes),
      distributor: text(snapshot.distributor) || "Ahlsell"
    });

    for (const accessoryValue of array(snapshot.accessories)) {
      const accessory = record(accessoryValue);
      const name = text(accessory.name);
      if (!name) continue;
      rows.push({
        type: "Tillbehör",
        ...requirementFields,
        productName: name,
        productNumber: text(accessory.productNumber),
        manufacturer: "",
        quantity: positiveNumber(accessory.quantity, 1),
        unit: text(accessory.unit) || "st",
        notes: text(accessory.notes),
        distributor: text(snapshot.distributor) || "Ahlsell"
      });
    }
  }

  return rows;
}

export async function createProjectMaterialListWorkbook({
  organizationName,
  project,
  rows,
  generatedAt = new Date()
}: {
  organizationName: string;
  project: MaterialListProject;
  rows: ProjectMaterialRow[];
  generatedAt?: Date;
}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Scipx";
  workbook.company = organizationName;
  workbook.title = `Materiallista – ${project.name}`;
  workbook.subject = "Projektets registrerade produktval och tillbehör";
  workbook.created = generatedAt;
  workbook.modified = generatedAt;

  addProjectSheet(workbook, organizationName, project, rows, generatedAt);
  addMaterialListSheet(workbook, project, rows, generatedAt);

  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

function addProjectSheet(
  workbook: ExcelJS.Workbook,
  organizationName: string,
  project: MaterialListProject,
  rows: ProjectMaterialRow[],
  generatedAt: Date
) {
  const sheet = workbook.addWorksheet("Projekt", {
    views: [{ showGridLines: false }],
    pageSetup: { orientation: "portrait", fitToPage: true, fitToWidth: 1 }
  });
  sheet.columns = [{ width: 27 }, { width: 54 }];
  sheet.mergeCells("A1:B1");
  sheet.getCell("A1").value = "SCIPX · PROJEKTSAMMANFATTNING";
  sheet.getCell("A1").style = titleStyle();
  sheet.getRow(1).height = 30;

  const mainProductCount = rows.filter((row) => row.type === "Huvudprodukt").length;
  const accessoryCount = rows.length - mainProductCount;
  const details: Array<[string, string | number | Date]> = [
    ["Projekt", project.name],
    ["Projektnummer", project.project_number ?? "—"],
    ["Organisation", organizationName],
    ["Kund", project.customer_name ?? "—"],
    ["Slutkund", project.end_customer ?? "—"],
    ["Standard", project.standard ?? "—"],
    ["Systemtyp", project.system_type ?? "—"],
    ["Distributör", project.supplier ?? "Ahlsell"],
    ["Projektstatus", statusLabel(project.status)],
    ["Huvudprodukter", mainProductCount],
    ["Tillbehörsrader", accessoryCount],
    ["Exporterad", generatedAt]
  ];
  details.forEach(([label, value], index) => {
    const row = sheet.getRow(index + 3);
    row.values = [label, value];
    row.getCell(1).font = { bold: true, color: { argb: "FF334155" } };
    row.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
    row.getCell(1).alignment = { vertical: "middle" };
    row.getCell(2).alignment = { vertical: "middle", wrapText: true };
    row.height = 22;
  });
  sheet.getCell("B14").numFmt = "yyyy-mm-dd hh:mm";
  sheet.mergeCells("A17:B18");
  const note = sheet.getCell("A17");
  note.value = "Kontrollera alltid artikelnummer, antal, pris och tillgänglighet före beställning. Exporten bygger på de produktval som registrerats i projektet.";
  note.alignment = { vertical: "middle", wrapText: true };
  note.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF7ED" } };
  note.font = { italic: true, color: { argb: "FF9A3412" } };
  note.border = thinBorder("FFFED7AA");
}

function addMaterialListSheet(
  workbook: ExcelJS.Workbook,
  project: MaterialListProject,
  rows: ProjectMaterialRow[],
  generatedAt: Date
) {
  const sheet = workbook.addWorksheet("Materiallista", {
    views: [{ state: "frozen", ySplit: 5, showGridLines: false }],
    pageSetup: {
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      margins: { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 }
    }
  });
  sheet.mergeCells("A1:K1");
  sheet.getCell("A1").value = `Materiallista · ${project.name}`;
  sheet.getCell("A1").style = titleStyle();
  sheet.getRow(1).height = 31;
  sheet.mergeCells("A2:K2");
  sheet.getCell("A2").value = [
    project.project_number ? `Projekt ${project.project_number}` : null,
    project.customer_name,
    `Exporterad ${generatedAt.toISOString().slice(0, 10)}`
  ].filter(Boolean).join(" · ");
  sheet.getCell("A2").font = { color: { argb: "FF475569" }, size: 10 };
  sheet.getCell("A2").alignment = { vertical: "middle" };
  sheet.mergeCells("A3:K3");
  sheet.getCell("A3").value = "Kontrollera artikelnummer, antal, pris och tillgänglighet före beställning.";
  sheet.getCell("A3").font = { italic: true, color: { argb: "FF9A3412" }, size: 10 };

  const tableRows = rows.map((row, index) => [
    index + 1,
    row.type,
    valueOrNull(row.requirementCategory),
    valueOrNull(row.requirementKey),
    valueOrNull(row.requirementValue),
    row.productName,
    valueOrNull(row.productNumber),
    valueOrNull(row.manufacturer),
    row.quantity,
    row.unit,
    valueOrNull(row.notes)
  ]);
  sheet.addTable({
    name: `ProjectMaterialList_${project.id.replaceAll("-", "").slice(0, 16)}`,
    ref: "A5",
    headerRow: true,
    totalsRow: false,
    style: { theme: "TableStyleMedium2", showRowStripes: true },
    columns: [
      { name: "Rad" },
      { name: "Typ" },
      { name: "Kravkategori" },
      { name: "Krav" },
      { name: "Kravvärde" },
      { name: "Produkt" },
      { name: "Artikelnummer" },
      { name: "Tillverkare" },
      { name: "Antal" },
      { name: "Enhet" },
      { name: "Anteckning" }
    ],
    rows: tableRows
  });

  const widths = [7, 16, 20, 22, 28, 30, 19, 20, 11, 10, 34];
  widths.forEach((width, index) => {
    sheet.getColumn(index + 1).width = width;
  });
  sheet.getColumn(9).numFmt = "0.00";
  if (rows.length > 0) {
    for (let rowIndex = 6; rowIndex <= rows.length + 5; rowIndex += 1) {
      const row = sheet.getRow(rowIndex);
      row.height = 32;
      for (let columnIndex = 1; columnIndex <= 11; columnIndex += 1) {
        row.getCell(columnIndex).alignment = { vertical: "top", wrapText: true };
      }
      row.getCell(1).alignment = { horizontal: "center", vertical: "top" };
      row.getCell(9).alignment = { horizontal: "right", vertical: "top" };
      row.getCell(10).alignment = { horizontal: "right", vertical: "top" };
    }
  }
  sheet.autoFilter = `A5:K${Math.max(5, rows.length + 5)}`;
  sheet.headerFooter.oddFooter = "Scipx · Sida &P av &N";
}

function titleStyle(): Partial<ExcelJS.Style> {
  return {
    fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FF0073B6" } },
    font: { bold: true, color: { argb: "FFFFFFFF" }, size: 16 },
    alignment: { vertical: "middle", horizontal: "left" }
  };
}

function thinBorder(color: string): Partial<ExcelJS.Borders> {
  return {
    top: { style: "thin", color: { argb: color } },
    right: { style: "thin", color: { argb: color } },
    bottom: { style: "thin", color: { argb: color } },
    left: { style: "thin", color: { argb: color } }
  };
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    draft: "Utkast",
    analysis: "Under analys",
    awaiting_input: "Väntar på underlag",
    proposal_ready: "Produktförslag klart",
    in_review: "Under granskning",
    approved: "Godkänt",
    quoted: "Offererat",
    ordered: "Beställt",
    delivered: "Levererat",
    archived: "Arkiverat",
    active: "Aktivt"
  };
  return labels[status] ?? status;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function positiveNumber(value: unknown, fallback: number) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function valueOrNull(value: string) {
  return value || null;
}
