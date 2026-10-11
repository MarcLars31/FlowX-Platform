import { orderedSpecificationAttributes } from "./project-specification-layout";
import type { ProjectRequirementDetail } from "./project-requirement-details";

export type SpecificationBlock =
  | { kind: "field"; label: string; text: string }
  | { kind: "text" | "heading" | "bullet" | "page" | "quantity"; text: string };

/** Keep the selected post's prose and field order; never load the whole PDF page. */
export function structuredPostBlocks(details: ProjectRequirementDetail, description: string): SpecificationBlock[] {
  const normalize = (value: string) => value.toLocaleLowerCase().replace(/[_\s–—-]+/g, "").replace(/fortsettelseside\d+/g, "");
  const savedFields = orderedSpecificationAttributes(details);
  let source = (details.sourceExcerpt ?? "").trim();
  for (const token of [details.postNumber, details.nsCode, description]) {
    if (!token) continue;
    const parts = token === description ? token.trim().split(/\s+/) : [...token];
    const pattern = parts.map(part => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s*");
    source = source.replace(new RegExp(`^${pattern}${token === description ? ":?" : ""}(?=\\s|$)`), "").trimStart();
  }
  const blocks: SpecificationBlock[] = [];
  let continued = false;
  let fieldBeforePage: Extract<SpecificationBlock, { kind: "field" }> | undefined;
  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim().replace(/^\uF0B7[\uF020\s]*/, "• ");
    if (!line) { continued = false; continue; }
    const page = line.match(/^FORTSETTELSE SIDE (\d+)$/);
    const field = line.match(/^([^:]{1,100}):\s*(.*)$/);
    const quantity = /^(?:Antall|Antal|Lengde|Areal|Volum|Vekt|Tid|Rund sum)(?:\s*:?(?:\s+(?:stk|st|m[²³23]?|lm|kg|tonn|l|liter|timer?|h|RS|sett|par|\d[\d.,]*)(?:\s.*)?)?)?$/i.test(line);
    if (page) {
      const previous = blocks.findLast(block => block.kind !== "page");
      fieldBeforePage = previous?.kind === "field" ? previous : undefined;
      blocks.push({ kind: "page", text: `Side ${page[1]}` });
    }
    else if (quantity) blocks.push({ kind: "quantity", text: line });
    else if (/^[a-z]\)\s+\S/i.test(line) || line === "UNDERPOST" || (line.length < 150 && /[A-ZÆØÅ]{3}/.test(line) && line === line.toLocaleUpperCase() && !field)) {
      blocks.push({ kind: "heading", text: line });
    } else if (/^(?:[-•●▪]|\d+[.)])\s+\S/.test(line)) blocks.push({ kind: "bullet", text: line });
    else if (field) blocks.push({ kind: "field", label: field[1], text: field[2] });
    else {
      const saved = fieldBeforePage && savedFields.find(field => normalize(field.label) === normalize(fieldBeforePage!.label));
      if (fieldBeforePage && saved && normalize(saved.value).includes(normalize(`${fieldBeforePage.text} ${line}`))) {
        fieldBeforePage.text += ` ${line}`;
        continue;
      }
      const last = blocks.at(-1);
      const newClause = last?.kind === "field" && /^(?:Det skal|Alle|Tilbehør|Merket|Prisen)\b/i.test(line);
      if (!newClause && continued && last && ["text", "field", "bullet"].includes(last.kind)) last.text += `${last.text ? " " : ""}${line}`;
      else blocks.push({ kind: "text", text: line });
    }
    if (!page) fieldBeforePage = undefined;
    continued = !page;
  }
  // Only the selected post's final quantity line uses its resolved quantity.
  const lastQuantity = blocks.findLastIndex(block => block.kind === "quantity");
  blocks.forEach((block, index) => { if (block.kind === "quantity" && index !== lastQuantity) block.kind = "text"; });
  // Preserve reviewed field values while retaining all the post's free prose.
  for (const block of blocks) {
    if (block.kind !== "field") continue;
    const saved = savedFields.find(field => normalize(field.label) === normalize(block.label));
    if (saved) block.text = saved.value;
  }
  const sourceLabels = new Set(blocks.flatMap(block => block.kind === "field" ? [normalize(block.label)] : []));
  for (const field of savedFields) {
    if (normalize(field.key) === "pdfkommentar" || sourceLabels.has(normalize(field.label))) continue;
    blocks.push({ kind: "field", label: field.label, text: field.value });
  }
  if (details.additionalRequirements && !details.additionalRequirements.split(/\n\s*\n/).every(part => normalize(source).includes(normalize(part)))) {
    blocks.push({ kind: "field", label: "Andre krav", text: details.additionalRequirements });
  }
  return blocks;
}
