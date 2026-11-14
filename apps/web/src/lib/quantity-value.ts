/** Read stored/PDF quantities without treating an empty value as zero. */
export function parseQuantityNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !value.trim()) return null;
  const input = value.trim();
  if (!/^[+-]?(?:\d{1,3}(?:[ \u00a0\u202f]\d{3})+|\d+)(?:[.,]\d+)*$/.test(input)) return null;
  const compact = input.replace(/\s/g, "");
  const comma = compact.lastIndexOf(","), dot = compact.lastIndexOf(".");
  const normalized = comma >= 0 && dot >= 0
    ? comma > dot ? compact.replaceAll(".", "").replace(",", ".") : compact.replaceAll(",", "")
    : comma >= 0 ? compact.replace(",", ".")
      : /^\d{1,3}(?:\.\d{3}){2,}$/.test(compact) ? compact.replaceAll(".", "") : compact;
  const result = Number(normalized);
  return Number.isFinite(result) ? result : null;
}

export function normalizeQuantityUnit(value: unknown): string {
  const unit = typeof value === "string" ? value.trim().replace(/\.$/, "").toLocaleLowerCase() : "";
  if (["stk", "st", "styck", "stycken", "pc", "pcs"].includes(unit)) return "st";
  if (["m", "lm", "im", "1m", "meter", "løpemeter"].includes(unit)) return "m";
  if (["rs", "rund sum"].includes(unit)) return "RS";
  if (["m2", "m²"].includes(unit)) return "m2";
  if (["m3", "m³"].includes(unit)) return "m3";
  if (unit === "liter") return "l";
  return unit.slice(0, 30);
}
