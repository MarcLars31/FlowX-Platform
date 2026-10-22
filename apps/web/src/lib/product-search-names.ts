import { technicalText } from "./technical-evaluation-model";

/** Remove the leading size, retaining an explicitly named product after it. */
export function productNameAfterDimension(title: string): string | null {
  const size = /^(?:dimensjon\s*[:=]?\s*)?(?:DN\s*|[Øø⌀]\s*|diameter\s*)?\d+(?:[.,]\d+)?(?:\s*[-–—/×x]\s*(?:DN\s*)?\d+(?:[.,]\d+)?)*(?:\s*mm)?(?:\s*\(\s*\d+(?:[.,]\d+)?\s*mm\s*\))?\s*/i;
  const match = title.trim().match(size);
  if (!match) return null;
  if (!/^(?:dimensjon\b|DN\s*\d|[Øø⌀]|diameter\b)/i.test(title.trim()) && !/\bmm\b/i.test(match[0])) return null;
  const rest = title.trim().slice(match[0].length).replace(/^[-–—:,]\s*/, "").trim();
  // Medium, assembly qualifiers and included parts do not name a new main item.
  if (!rest || /^(?:med|with|inkl\.?|inkludert|inklusive|including|for|til)\b/i.test(rest)
    || /^komplett(?:\s+(?:med|with|inkl\.?|inkludert|inklusive|including)\b|\.?$)/i.test(rest)
    || /^(?:kaldtvann|varmtvann|tur|retur|toveis|treveis|pn\s*\d+)\.?$/i.test(rest)) return null;
  return /[a-zæøåäö]{3}/i.test(rest) ? rest : null;
}

/** Positive identity for removable valve insulation, never the valve it covers. */
export function isValveInsulationProduct(title: string): boolean {
  const name = technicalText(productNameAfterDimension(title) ?? title).replace(/[^a-z0-9]+/g, " ").trim();
  const primary = name.split(/\b(?:med|with|inkl|inkludert|inklusive|including)\b/)[0].trim();
  return /^(?:prefabrikerte?\s+)?(?:ventilpose[rs]?|ventilpute[rs]?|ventilisolasjon|ventilisolering|ventilmansjett(?:er)?)\b/.test(primary)
    || /^(?:isolering|isolasjon) av \w*ventil(?:er)?\b/.test(primary)
    || /^(?:isolasjons(?:pute[rs]?|pose[rs]?|mansjett(?:er)?|kappe[rs]?)|isolasjon (?:pute[rs]?|pose[rs]?))\b.*\b\w*ventil(?:er)?\b/.test(primary);
}

/** A range identifies candidate sizes, not one approved product dimension. */
export function nominalDiameterRange(value: string): readonly [number, number] | null {
  const match = /\bDN\s*(\d+(?:[.,]\d+)?)\s*[-–—]\s*(?:DN\s*)?(\d+(?:[.,]\d+)?)\b/i.exec(value);
  if (!match) return null;
  const lower = Number(match[1].replace(",", ".")), upper = Number(match[2].replace(",", "."));
  return lower > 0 && upper > lower ? [lower, upper] : null;
}
