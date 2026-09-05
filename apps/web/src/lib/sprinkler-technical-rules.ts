export type SprinklerCoverageClass =
  | "standard"
  | "extended"
  | "extended_light_hazard"
  | "extended_ordinary_hazard"
  | "residential"
  | "storage"
  | "directional_open_spray"
  | "window";

export type SprinklerMountCapability = "surface" | "recessed" | "concealed";

/**
 * Catalogues do not always use the same rounded SI K-factor. For example,
 * K115 and K115.5 describe the same nominal family. This tolerance is only
 * used for SI-sized sprinkler values; it never changes DN or other criteria.
 */
export function sprinklerKFactorMatches(required: number, candidate: number) {
  if (Math.abs(required - candidate) < 0.11) return true;
  return required >= 50 && candidate >= 50 && Math.abs(required - candidate) <= 1.1;
}

export function sprinklerCoverageFromText(value: string): SprinklerCoverageClass | null {
  const normalized = normalize(value);
  if (/\b(window sprinkler|vindussprinkler|vindu sprinkler)\b/.test(normalized)) return "window";
  if (/\b(directional open spray|open spray nozzle|apen sprededyse|sprededyse)\b/.test(normalized)) return "directional_open_spray";
  if (/\b(storage|lager|esfr)\b/.test(normalized)) return "storage";
  if (/\b(residential|boende|boligsprinkler|bolig sprinkler)\b/.test(normalized)) return "residential";
  if (/\b(extended coverage ordinary hazard|utvidet dekning ordinaer|ecoh)\b/.test(normalized)) return "extended_ordinary_hazard";
  if (/\b(extended coverage light hazard|utvidet dekning lett|eclh|qrec|ec hsw|ext cov light)\b/.test(normalized)) return "extended_light_hazard";
  if (/\b(extended coverage|utvidet dekning)\b/.test(normalized)) return "extended";
  if (/\b(konvensjonell|konventionell|conventional|standard spray(?:sprinkler)?|standard sprinkler|standard coverage)\b/.test(normalized)) return "standard";
  return null;
}

export function sprinklerCoverageMatches(
  required: SprinklerCoverageClass,
  candidate: SprinklerCoverageClass | null
) {
  if (required === "extended") {
    return candidate === "extended"
      || candidate === "extended_light_hazard"
      || candidate === "extended_ordinary_hazard";
  }
  return candidate === required;
}

export function sprinklerMountCapabilities(value: string): Set<SprinklerMountCapability> {
  const normalized = normalize(value);
  const capabilities = new Set<SprinklerMountCapability>();
  if (/\b(concealed|skjult|dold)\b/.test(normalized)) capabilities.add("concealed");
  if (/\b(recessed|innfelt|infalld)\b/.test(normalized) || /\bv2762\b/.test(normalized)) {
    capabilities.add("recessed");
  }
  if (/\b(konvensjonell|konventionell|conventional|konv|surface)\b/.test(normalized) || /\bv2726\b/.test(normalized)) {
    capabilities.add("surface");
  }
  return capabilities;
}

export function sprinklerSystemRestriction(value: string): "wet_only" | "dry_only" | null {
  const normalized = normalize(value);
  if (/\b(wet system only|wet pipe only|kun vatanlegg|bare vatanlegg)\b/.test(normalized)) return "wet_only";
  if (/\b(dry system only|dry pipe only|kun torranlegg|bare torranlegg)\b/.test(normalized)) return "dry_only";
  return null;
}

export function sprinklerNeedsHydraulicReview(value: string) {
  const normalized = normalize(value);
  return sprinklerCoverageFromText(normalized) !== null
      && sprinklerCoverageFromText(normalized) !== "standard"
    || /\b(min(?:imum)? pressure|minste trykk|minimumstrykk|design density|hydraulic calculation|hydraulisk beregning)\b/.test(normalized);
}

export function sprinklerRequiresAccessoryReview(
  attributes: Record<string, unknown> | ReadonlyMap<string, unknown>,
  freeText = ""
) {
  const accessoryKey = /\b(dekkskive|pyntering|rosett|escutcheon|cover plate|coverplate|beskyttelse|beskyttelsesgitter|vannskjerm|watershield|water shield|guard)\b/;
  const entries = attributes instanceof Map ? [...attributes.entries()] : Object.entries(attributes);
  for (const [key, rawValue] of entries) {
    if (!accessoryKey.test(normalize(key))) continue;
    const value = normalize(scalarText(rawValue));
    if (!value || /^(nei|no|false|ingen|i r|ir|ikke aktuelt|ikke relevant|ej relevant|icke relevant|not applicable|not required|n a)$/.test(value)) continue;
    return true;
  }
  const normalizedFreeText = normalize(freeText);
  return /\b(med|inkludert|inkluderer|krever|required|with)\s+(?:en\s+)?(?:dekkskive|pyntering|rosett|escutcheon|cover plate|coverplate|beskyttelsesgitter|vannskjerm|watershield|water shield|guard)\b/.test(normalizedFreeText);
}

export function sprinklerExplicitlyExcludesCoverPlate(value: string | null | undefined) {
  const normalized = normalize(value ?? "");
  return /^(nei|no|false|ingen|ikke aktuelt|ikke relevant|ej relevant|icke relevant|not applicable|not required|none)$/.test(normalized);
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/å/g, "a")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function scalarText(value: unknown): string {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(scalarText).filter(Boolean).join(" ");
  return "";
}
