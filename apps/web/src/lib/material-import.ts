export const MATERIAL_IMPORT_MAX_ROWS = 1000;
export const MATERIAL_IMPORT_MAX_BYTES = 5 * 1024 * 1024;

export type MaterialRow = {
  id: string;
  sheet: string;
  sourceRow: number;
  description: string;
  dimension: string;
  fittingDimension: string;
  unit: string;
  quantity: number | null;
  quantityText: string;
  category: string;
  issues: string[];
};
export type MaterialSearchInput = {
  description: string;
  unit: string;
  category: string;
  dimension: string;
  fittingDimension: string;
  dimensionKind: "unspecified" | "outside" | "dn";
  details: string;
  query: string;
};
export type MaterialCandidate = {
  articleNumber: string;
  productName: string;
  subtitle: string;
  productUrl: string;
  specifications: string[];
  warnings: string[];
  identityVerified: boolean;
  conflict: boolean;
};
export type MaterialSearchResult = {
  candidates: MaterialCandidate[];
  warnings: string[];
  searchUrl: string;
  partial: boolean;
};
export type MaterialReview = {
  input: MaterialSearchInput;
  status: "pending" | "searching" | "review" | "empty" | "error" | "selected";
  result?: MaterialSearchResult;
  selected?: MaterialCandidate;
  error?: string;
};

export class MaterialImportError extends Error {}

const aliases = {
  description: ["description", "beskrivelse", "beskrivning", "produktbeskrivelse", "produktnamn"],
  dimension: ["dimensjon", "dimension"],
  fittingDimension: ["fittingdimensjon", "fittingdimension", "kopplingsdimension"],
  unit: ["enhet", "unit"],
  quantity: ["mengde", "mangd", "quantity", "antal", "antall"],
  category: ["kategori", "category"],
} as const;
type Column = keyof typeof aliases;
const normalize = (text: string) => text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[\s_\-]+/g, "").trim();

export function materialHeader(cells: string[]): Partial<Record<Column, number>> | null {
  const columns: Partial<Record<Column, number>> = {};
  cells.forEach((cell, index) => {
    for (const [key, names] of Object.entries(aliases)) {
      if ((names as readonly string[]).includes(normalize(cell))) {
        if (columns[key as Column] !== undefined) throw new MaterialImportError(`Kolumnen ${cell} finns flera gånger i samma rubrikrad.`);
        columns[key as Column] = index;
      }
    }
  });
  return columns.description !== undefined && columns.quantity !== undefined && columns.unit !== undefined ? columns : null;
}

export function parseMaterialQuantity(text: string): number | null {
  const value = text.trim().replace(/[\s\u00a0\u202f]/g, "");
  if (!/^\d+(?:[.,]\d+)?$/.test(value)) return null;
  const number = Number(value.replace(",", "."));
  return Number.isFinite(number) && number <= 1e9 ? number : null;
}

/** Headings and blank lines before a table are allowed; row provenance is never renumbered. */
export function parseMaterialSheets(sheets: { name: string; rows: { number: number; cells: string[]; issues?: string[] }[] }[]) {
  const rows: MaterialRow[] = [];
  const warnings: string[] = [];
  for (const sheet of sheets) {
    let columns: Partial<Record<Column, number>> | null = null;
    let foundHeader = false;
    for (const source of sheet.rows) {
      const header = materialHeader(source.cells);
      if (header) { columns = header; foundHeader = true; continue; }
      if (!columns || source.cells.every(cell => !cell.trim())) continue;
      const field = (key: Column) => source.cells[columns![key] ?? -1]?.trim() ?? "";
      const description = field("description");
      const quantityText = field("quantity");
      // Preserve section/total rows after the header as visible non-searchable rows.
      const quantity = parseMaterialQuantity(quantityText);
      const issues = [...(source.issues ?? [])];
      if (!description) issues.push("Beskrivning saknas.");
      if (!field("unit")) issues.push("Enhet saknas.");
      if (quantity === null) issues.push("Mängden saknas eller är ogiltig. Använd ett positivt tal eller noll.");
      if (source.cells.some(cell => cell.length > 2000)) issues.push("En cell är för lång för produktsökning (högst 2 000 tecken).");
      rows.push({ id: `${sheet.name}:${source.number}`, sheet: sheet.name, sourceRow: source.number,
        description, dimension: field("dimension"), fittingDimension: field("fittingDimension"),
        unit: field("unit"), quantity, quantityText, category: field("category"), issues });
      if (rows.length > MATERIAL_IMPORT_MAX_ROWS) throw new MaterialImportError(`Filen innehåller fler än ${MATERIAL_IMPORT_MAX_ROWS} rader. Dela upp den i mindre filer.`);
    }
    if (!foundHeader) warnings.push(`Bladet ”${sheet.name}” hoppades över: rubriker för beskrivning, enhet och mängd saknas.`);
  }
  if (!rows.length) throw new MaterialImportError("Ingen materiallista hittades. Filen behöver kolumnerna Description/Beskrivning, Enhet och Mengde/Mängd.");
  return { rows, warnings };
}

export function initialMaterialReview(row: MaterialRow): MaterialReview {
  return { status: "pending", input: { description: row.description, unit: row.unit, category: row.category, dimension: row.dimension,
    fittingDimension: row.fittingDimension, dimensionKind: "unspecified", details: "", query: "" } };
}

export function validateMaterialSearchInput(value: unknown): MaterialSearchInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new MaterialImportError("Materialraden saknas.");
  const raw = value as Record<string, unknown>;
  const field = (name: string, limit: number) => {
    if (typeof raw[name] !== "string" || (raw[name] as string).length > limit) throw new MaterialImportError(`Fältet ${name} saknas eller är för långt.`);
    return (raw[name] as string).trim();
  };
  const input = { description: field("description", 2000), unit: field("unit", 30), category: field("category", 200), dimension: field("dimension", 120),
    fittingDimension: field("fittingDimension", 120), details: field("details", 1000), query: field("query", 180) };
  if (input.description.length < 2) throw new MaterialImportError("Beskrivningen måste innehålla minst två tecken.");
  if (!["unspecified", "outside", "dn"].includes(String(raw.dimensionKind))) throw new MaterialImportError("Välj en giltig måttyp.");
  return { ...input, dimensionKind: raw.dimensionKind as MaterialSearchInput["dimensionKind"] };
}

export function materialSearchQuery(input: MaterialSearchInput) {
  if (input.query) return input.query;
  const name = input.description.replace(/^\s*[A-Z]{2,5}\.\d+(?:\.\d+)*\s+(?:\d{3,4}\s+)?/i, "")
    .replace(/_/g, " ").replace(/pressfittingsystem/gi, "press")
    .replace(/\b(?:standard|forbruksvann|spillvann|komfortkjøling|varme|bunnledninger)\b/gi, "")
    .replace(/\s+/g, " ").trim();
  const dimension = [input.dimension, input.fittingDimension].filter(value => value && !/^(?:ikke oppgitt|ej angivet|saknas)$/i.test(value)).map(value => {
    if (input.dimensionKind === "dn" && /^\d+(?:[.,]\d+)?$/.test(value)) return `DN${value}`;
    if (input.dimensionKind === "outside" && /^\d+(?:[.,]\d+)?(?:[-x×]\d+(?:[.,]\d+)?)*$/i.test(value)) return `${value} mm`;
    return value;
  }).join(" ");
  // Reserve space for the full connection tuple instead of truncating its last port.
  return [name.slice(0, Math.max(20, 178 - dimension.length)), dimension].filter(Boolean).join(" ").slice(0, 180);
}

export function materialInputWarnings(input: MaterialSearchInput) {
  const text = `${input.description} ${input.details}`.toLowerCase();
  const warnings: string[] = [];
  if (input.dimensionKind === "unspecified" && (input.dimension || input.fittingDimension)) warnings.push("Kontrollera om måtten avser DN eller ytterdiameter. Inget måttsystem har antagits.");
  if (!input.dimension && !input.fittingDimension) warnings.push("Dimension saknas i listan.");
  if (/bend|böj|boej/.test(text) && !/\b(?:15|22[.,]5|30|45|60|87[.,]5|88[.,]5|90)\s*(?:°|gr|grad)/.test(text)) warnings.push("Böjvinkel saknas. Kontrollera exempelvis 45° eller 90°.");
  if (/press/.test(text)) warnings.push("Kontrollera pressystem, profil och materialkvalitet mot installationen.");
  if (/pumpe|pump/.test(text)) warnings.push("Kontrollera pumpens flöde, uppfordringshöjd och driftpunkt.");
  return warnings;
}

export function materialRowStatus(row: MaterialRow, review: MaterialReview) {
  if (row.issues.length) return "Kontrollera indata";
  if (row.quantity === 0) return "Noll mängd – ej sökt";
  return { pending: "Ej sökt", searching: "Söker", review: "Granska förslag", empty: "Ingen träff", error: "Sökfel", selected: "Vald produkt" }[review.status];
}
