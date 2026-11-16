import type { TechnicalDescriptionMaterialLine } from "./types";

/** Resolve only after recovery and source ordering. No wording, capitals or
 * inline references can create a parent. Ambiguous identities stay unlinked. */
export function linkPostHierarchy(lines: TechnicalDescriptionMaterialLine[]) {
  const address = new Map<string, TechnicalDescriptionMaterialLine[]>();
  const key = (line: TechnicalDescriptionMaterialLine, number: string) => JSON.stringify([line.postScope ?? "", number]);
  for (const line of lines) if (line.postNumber) {
    const id = key(line, line.postNumber);
    address.set(id, [...(address.get(id) ?? []), line]);
  }
  const positions = new Map(lines.map((line, index) => [line, index]));
  for (const line of lines) {
    if (!line.postNumber) continue;
    const parts = line.postNumber.split(".");
    const numbers = [...new Set([line.parentPostNumber, ...parts.slice(0,-1).map((_, index) => parts.slice(0,parts.length-index-1).join("."))].filter((v):v is string=>Boolean(v)))];
    for (const number of numbers) {
      const candidates = (address.get(key(line, number)) ?? []).filter(parent => positions.get(parent)! < positions.get(line)!);
      if (!candidates.length) continue;
      // Do not skip an ambiguous immediate parent to invent a looser link.
      if (candidates.length !== 1) {
        line.reviewFlags = [...new Set([...line.reviewFlags, "ambiguous-parent-post"])];
        break;
      }
      const parent = candidates[0];
      line.parentPostNumber = parent.postNumber;
      line.parentSourcePostId = parent.id;
      line.parentDescription = parent.title ?? parent.description;
      break;
    }
  }
}
