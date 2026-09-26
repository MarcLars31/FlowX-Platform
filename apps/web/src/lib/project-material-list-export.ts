import ExcelJS from "exceljs";
import { parseProductOrderQuantity, parseProductQuantity } from "./product-order-quantity";
import { isUserApprovedProductAssignment } from "@/lib/approved-product-assignment";
import { distributorRequirementOperation } from "@/lib/distributor-requirement-lines";
import { projectRequirementDetails } from "@/lib/project-requirement-details";
import { projectRequirementQuantity } from "@/lib/project-requirement-quantity";
import { normalizeNrfNumber } from "@/lib/product-card-candidates";
import type { ProductPostComment } from "@/lib/product-post-comments";

export type MaterialListComment = ProductPostComment & { requirement_id: string };
type ExportComment = MaterialListComment & { postNumber: string };

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
  value_json?: unknown;
};

export type MaterialListAssignment = {
  id: string;
  requirement_id: string | null;
  status: string;
  product_snapshot: unknown;
  selected_at: string | null;
};

export type ProjectMaterialRow = {
  requirementId?: string;
  type: "Huvudprodukt" | "Tillbehör" | "Ej produktvald" | "Demontering";
  postNumber: string;
  chapterPost: string;
  operation: "Installation" | "Demontering";
  nsCode: string;
  requirementCategory: string;
  requirementKey: string;
  requirementValue: string;
  productName: string;
  productNumber: string;
  manufacturer: string;
  quantity: number | null;
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
  const assignmentsByRequirementId = new Map(
    assignments.flatMap((assignment) => {
      const snapshot = record(assignment.product_snapshot);
      if (
        !assignment.requirement_id ||
        !isUserApprovedProductAssignment(assignment) ||
        !text(snapshot.name) ||
        !text(snapshot.productNumber)
      ) {
        return [];
      }
      return [[assignment.requirement_id, assignment] as const];
    })
  );
  const rows: ProjectMaterialRow[] = [];

  for (const requirement of requirements) {
    const assignment = assignmentsByRequirementId.get(requirement.id);
    const snapshot = record(assignment?.product_snapshot);
    const details = projectRequirementDetails(requirement);
    const removal = distributorRequirementOperation(requirement) === "remove";
    const requirementFields = {
      requirementId: requirement.id,
      postNumber: details.postNumber ?? "Saknas",
      chapterPost: details.chapterPost ?? "",
      operation: removal ? "Demontering" as const : "Installation" as const,
      nsCode: details.nsCode ?? "",
      requirementCategory: requirement.category ?? "",
      requirementKey: requirement.requirement_key ?? "",
      requirementValue: requirement.value_text ?? ""
    };
    const requiredQuantity = projectRequirementQuantity(requirement.value_json);
    const mainQuantity = requiredQuantity.quantity;
    const missingQuantityNote = requiredQuantity.quantity === null
      ? "Antal saknas i den tekniska beskrivningen – kontrollera före beställning."
      : "";

    if (removal && !assignment) {
      rows.push({
        type: "Demontering",
        ...requirementFields,
        productName: "Demontering enligt teknisk beskrivning",
        productNumber: "",
        manufacturer: "",
        quantity: mainQuantity,
        unit: requiredQuantity.unit,
        notes: missingQuantityNote,
        distributor: ""
      });
      continue;
    }

    if (!assignment) {
      rows.push({
        type: "Ej produktvald",
        ...requirementFields,
        productName: "Ej produktvald",
        productNumber: "",
        manufacturer: "",
        quantity: mainQuantity,
        unit: requiredQuantity.unit,
        notes: joinNotes("Produktval saknas.", missingQuantityNote),
        distributor: "Ahlsell"
      });
      continue;
    }

    const orderQuantity = parseProductOrderQuantity(snapshot.orderQuantity);
    rows.push({
      type: "Huvudprodukt",
      ...requirementFields,
      productName: text(snapshot.name),
      productNumber: text(snapshot.productNumber),
      manufacturer: text(snapshot.manufacturer),
      quantity: orderQuantity?.quantity ?? mainQuantity,
      unit: orderQuantity?.unit ?? requiredQuantity.unit,
      notes: joinNotes(text(snapshot.notes), orderQuantity ? "" : missingQuantityNote),
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
        quantity: accessory.quantityBasis === "total"
          ? parseProductQuantity(accessory.quantity)
          : mainQuantity === null
          ? null
          : mainQuantity * positiveNumber(accessory.quantity, 1),
        unit: text(accessory.unit) || "st",
        notes: joinNotes(text(accessory.notes), accessory.quantityBasis === "total" ? "" : missingQuantityNote),
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
  comments = [],
  generatedAt = new Date()
}: {
  organizationName: string;
  project: MaterialListProject;
  rows: ProjectMaterialRow[];
  comments?: MaterialListComment[];
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
  const exportComments = applicableMaterialComments(rows, comments);
  addMaterialListSheet(workbook, project, rows, generatedAt, exportComments);
  if (exportComments.length) addCommentsSheet(workbook, exportComments);

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

  const postCount = new Set(rows.map((row) => row.postNumber)).size;
  const mainProductCount = rows.filter((row) => row.type === "Huvudprodukt").length;
  const accessoryCount = rows.filter((row) => row.type === "Tillbehör").length;
  const removalCount = rows.filter((row) => row.type === "Demontering").length;
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
    ["Poster från underlaget", postCount],
    ["Huvudprodukter", mainProductCount],
    ["Tillbehörsrader", accessoryCount],
    ["Demonteringsposter", removalCount],
    ["Exporterad", generatedAt]
  ];
  details.forEach(([label, value], index) => {
    const row = sheet.getRow(index + 3);
    row.values = [label, value];
    row.getCell(1).font = { bold: true, color: { argb: "FF334155" } };
    row.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
    row.getCell(1).alignment = { vertical: "middle" };
    row.getCell(2).alignment = { horizontal: "left", vertical: "middle", wrapText: true };
    row.height = 22;
  });
  sheet.getCell("B17").numFmt = "yyyy-mm-dd hh:mm";
  sheet.mergeCells("A19:B20");
  const note = sheet.getCell("A19");
  note.value = "Kontrollera alltid NRF-nummer, antal, pris och tillgänglighet före beställning. Exporten innehåller endast produkter som en användare uttryckligen har godkänt.";
  note.alignment = { vertical: "middle", wrapText: true };
  note.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF7ED" } };
  note.font = { italic: true, color: { argb: "FF9A3412" } };
  note.border = thinBorder("FFFED7AA");
}

function addMaterialListSheet(
  workbook: ExcelJS.Workbook,
  project: MaterialListProject,
  rows: ProjectMaterialRow[],
  generatedAt: Date,
  comments: ExportComment[]
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
  sheet.mergeCells("A1:O1");
  sheet.getCell("A1").value = `Materiallista · ${project.name}`;
  sheet.getCell("A1").style = titleStyle();
  sheet.getRow(1).height = 31;
  sheet.mergeCells("A2:O2");
  sheet.getCell("A2").value = [
    project.project_number ? `Projekt ${project.project_number}` : null,
    project.customer_name,
    `Exporterad ${generatedAt.toISOString().slice(0, 10)}`
  ].filter(Boolean).join(" · ");
  sheet.getCell("A2").font = { color: { argb: "FF475569" }, size: 10 };
  sheet.getCell("A2").alignment = { vertical: "middle" };
  sheet.mergeCells("A3:O3");
  sheet.getCell("A3").value = "Kontrollera NRF-nummer, antal, pris och tillgänglighet före beställning.";
  sheet.getCell("A3").font = { italic: true, color: { argb: "FF9A3412" }, size: 10 };

  const commentsByRequirement = new Map<string, ExportComment[]>();
  for (const comment of comments) {
    const group = commentsByRequirement.get(comment.requirement_id) ?? [];
    group.push(comment);
    commentsByRequirement.set(comment.requirement_id, group);
  }
  const tableRows = rows.map((row, index) => [
    index + 1,
    row.postNumber,
    valueOrNull(row.chapterPost),
    row.operation,
    row.type,
    valueOrNull(row.requirementValue),
    valueOrNull(row.nsCode),
    row.productName,
    valueOrNull(row.productNumber),
    valueOrNull(row.manufacturer),
    row.quantity,
    row.unit,
    valueOrNull(row.notes),
    row.type === "Tillbehör" ? null : commentSummary(commentsByRequirement.get(row.requirementId ?? "") ?? [], false),
    row.type === "Huvudprodukt" ? commentSummary(commentsByRequirement.get(row.requirementId ?? "") ?? [], true) : null
  ]);
  const headers = [
    "Rad",
    "PDF-postnummer",
    "Kapitelpost",
    "Åtgärd",
    "Radtyp",
    "Beskrivning från underlag",
    "NS-kod",
    "Vald produkt",
    "NRF-nummer",
    "Tillverkare",
    "Antal",
    "Enhet",
    "Anteckning",
    "Postkommentarer",
    "Produktkommentarer"
  ];
  const headerRow = sheet.getRow(5);
  headerRow.values = headers;
  headerRow.height = 30;
  headerRow.eachCell({ includeEmpty: true }, (cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4F81BD" } };
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.alignment = { vertical: "middle", wrapText: true };
    cell.border = thinBorder("FF9CB9DC");
  });
  tableRows.forEach((values, index) => {
    sheet.getRow(index + 6).values = values;
  });

  const widths = [7, 16, 20, 14, 17, 42, 17, 30, 19, 20, 11, 10, 34, 42, 42];
  widths.forEach((width, index) => {
    sheet.getColumn(index + 1).width = width;
  });
  sheet.getColumn(11).numFmt = "0.00";
  if (rows.length > 0) {
    for (let rowIndex = 6; rowIndex <= rows.length + 5; rowIndex += 1) {
      const row = sheet.getRow(rowIndex);
      const sourceRow = rows[rowIndex - 6];
      row.height = Math.max(sourceRow ? materialRowHeight(sourceRow) : 32,
        Math.min(160, Math.max(wrappedLines(row.getCell(14).text, 48), wrappedLines(row.getCell(15).text, 48)) * 15));
      for (let columnIndex = 1; columnIndex <= 15; columnIndex += 1) {
        const cell = row.getCell(columnIndex);
        cell.alignment = { vertical: "top", wrapText: true };
        cell.border = {
          bottom: { style: "thin", color: { argb: "FFD7E3F1" } }
        };
        if (sourceRow?.type === "Ej produktvald") {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF7ED" } };
        } else if (sourceRow?.type === "Demontering") {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
        } else if ((rowIndex - 6) % 2 === 0) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEAF2F8" } };
        }
      }
      row.getCell(1).alignment = { horizontal: "center", vertical: "top" };
      row.getCell(11).alignment = { horizontal: "right", vertical: "top" };
      row.getCell(12).alignment = { horizontal: "right", vertical: "top" };
    }
  }
  sheet.autoFilter = `A5:O${Math.max(5, rows.length + 5)}`;
  sheet.headerFooter.oddFooter = "Scipx · Sida &P av &N";
}

function applicableMaterialComments(rows: ProjectMaterialRow[], comments: MaterialListComment[]): ExportComment[] {
  const mainRows = new Map(rows.filter(row => row.type !== "Tillbehör" && row.requirementId)
    .map(row => [row.requirementId, row]));
  return comments.flatMap(comment => {
    const row = mainRows.get(comment.requirement_id);
    if (!row) return [];
    if (comment.product_number !== null && (row.type !== "Huvudprodukt" ||
      normalizeNrfNumber(comment.product_number) !== normalizeNrfNumber(row.productNumber))) return [];
    return [{ ...comment, postNumber: row.postNumber }];
  }).sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
}

function commentSummary(comments: ExportComment[], product: boolean) {
  const matching = comments.filter(comment => (comment.product_number !== null) === product);
  if (!matching.length) return null;
  const fullText = matching.map(comment => `${commentDate(comment.created_at)} · ${comment.author_name}\n${comment.body}`).join("\n\n");
  // Excel cells have a 32,767 character limit. The dedicated sheet always
  // contains the full text, one comment at a time, including long histories.
  return fullText.length <= 2000 ? fullText : `${fullText.slice(0, 1800)}…\n\n${matching.length} kommentarer. Hela texten finns på fliken Kommentarer.`;
}

function commentDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

function wrappedLines(value: string, width: number) {
  return value.split(/\r?\n/).reduce((count, line) => count + Math.max(1, Math.ceil(line.length / width)), 0);
}

function addCommentsSheet(workbook: ExcelJS.Workbook, comments: ExportComment[]) {
  const sheet = workbook.addWorksheet("Kommentarer", {
    views: [{ state: "frozen", ySplit: 3, showGridLines: false }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
  });
  sheet.mergeCells("A1:G1");
  sheet.getCell("A1").value = "Kommentarer till exporterade poster och produkter";
  sheet.getCell("A1").style = titleStyle();
  sheet.getRow(1).height = 30;
  sheet.columns = [16, 20, 18, 32, 24, 24, 80].map(width => ({ width }));
  const header = sheet.getRow(3);
  header.values = ["PDF-postnummer", "Gäller", "NRF-nummer", "Produkt", "Skriven av", "Datum (UTC)", "Kommentar"];
  header.height = 28;
  header.eachCell(cell => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4F81BD" } };
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.alignment = { vertical: "middle", wrapText: true };
  });
  for (const comment of comments) {
    const row = sheet.addRow([comment.postNumber, comment.product_number === null ? "Posten" : "Vald produkt",
      comment.product_number, comment.product_name, comment.author_name, commentDate(comment.created_at), comment.body]);
    row.height = Math.min(409, Math.max(48, wrappedLines(comment.body, 90) * 15 + 10));
    row.eachCell({ includeEmpty: true }, cell => {
      cell.alignment = { vertical: "top", wrapText: true };
      cell.border = { bottom: { style: "thin", color: { argb: "FFD7E3F1" } } };
    });
  }
  sheet.autoFilter = `A3:G${sheet.rowCount}`;
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

function materialRowHeight(row: ProjectMaterialRow) {
  const estimatedLines = Math.max(
    Math.ceil(row.chapterPost.length / 28),
    Math.ceil(row.requirementValue.length / 52),
    Math.ceil(row.productName.length / 38),
    Math.ceil(row.notes.length / 44),
    1
  );
  return Math.min(96, Math.max(32, estimatedLines * 16));
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

function joinNotes(...values: string[]) {
  return values.filter(Boolean).join(" ");
}
