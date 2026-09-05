export const MAX_SUPPORTED_SPRINKLER_K_FACTOR = 400;

export type ProjectRequirementDataWarning = {
  code: "implausible-k-factor";
  label: string;
  message: string;
  rawValue: string;
  value: number;
};

type KFactorReading = {
  rawValue: string;
  value: number;
  source: "attribute" | "source";
};

export function parseSprinklerKFactor(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? Math.abs(value) : null;
  if (typeof value !== "string") return null;

  const compactDigits = value
    .normalize("NFKC")
    .replace(/(?<=\d)[\s\u00a0](?=\d)/g, "");
  const match = compactDigits.match(/-?\d+(?:[.,]\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0].replace(",", "."));
  return Number.isFinite(parsed) ? Math.abs(parsed) : null;
}

export function projectRequirementKFactorDisplayValue(
  requirement: Record<string, unknown>
) {
  const attributeReading = attributeKFactorReading(requirement);
  const sourceReading = sourceKFactorReadings(requirement).find(
    (reading) => reading.value > MAX_SUPPORTED_SPRINKLER_K_FACTOR
  );

  // Older OCR normalization changed values such as 1145 to 114.5. Prefer the
  // explicit source value when it proves that the stored decimal is synthetic.
  if (
    sourceReading &&
    (!attributeReading ||
      attributeReading.value > MAX_SUPPORTED_SPRINKLER_K_FACTOR ||
      approximatelyEqual(sourceReading.value, attributeReading.value * 10))
  ) {
    return sourceReading.rawValue;
  }

  return attributeReading?.rawValue ?? sourceReading?.rawValue ?? null;
}

export function projectRequirementDataWarnings(
  requirement: Record<string, unknown>
): ProjectRequirementDataWarning[] {
  const readings = [
    attributeKFactorReading(requirement),
    ...sourceKFactorReadings(requirement)
  ].filter((reading): reading is KFactorReading => Boolean(reading));
  const implausible = readings.find(
    (reading) => reading.value > MAX_SUPPORTED_SPRINKLER_K_FACTOR
  );
  if (!implausible) return [];

  return [{
    code: "implausible-k-factor",
    label: `Orimlig K-faktor: ${implausible.rawValue}`,
    message: `PDF-posten anger K-faktor ${implausible.rawValue}. Scipx har inga sprinklerprodukter med K-faktor över ${MAX_SUPPORTED_SPRINKLER_K_FACTOR}. Kontrollera värdet i PDF-filen innan du väljer produkt.`,
    rawValue: implausible.rawValue,
    value: implausible.value
  }];
}

export function hasProjectRequirementDataWarning(
  requirement: Record<string, unknown>
) {
  return projectRequirementDataWarnings(requirement).length > 0;
}

function attributeKFactorReading(
  requirement: Record<string, unknown>
): KFactorReading | null {
  const attributes = record(record(requirement.value_json).attributes);
  for (const [key, rawValue] of Object.entries(attributes)) {
    if (!isKFactorKey(key)) continue;
    const value = parseSprinklerKFactor(rawValue);
    if (value === null) continue;
    return {
      rawValue: displayText(rawValue) ?? String(value),
      value,
      source: "attribute"
    };
  }
  return null;
}

function sourceKFactorReadings(
  requirement: Record<string, unknown>
): KFactorReading[] {
  const value = record(requirement.value_json);
  const rowSourceTexts = [
    displayText(value.sourceText),
    displayText(requirement.source_excerpt)
  ].filter((sourceText): sourceText is string => Boolean(sourceText));
  const rowReadings = kFactorReadingsFromTexts(rowSourceTexts);
  if (rowReadings.length > 0) return rowReadings;

  const technicalSpecification = displayText(value.technicalSpecification);
  if (!technicalSpecification) return [];
  const underpostText = technicalSpecification.split(/\n\s*UNDERPOST\s*\n/i).at(-1);
  if (underpostText && underpostText !== technicalSpecification) {
    const underpostReadings = kFactorReadingsFromTexts([underpostText]);
    if (underpostReadings.length > 0) return underpostReadings;
  }

  return kFactorReadingsFromTexts([technicalSpecification]);
}

function kFactorReadingsFromTexts(sourceTexts: string[]) {
  const readings: KFactorReading[] = [];
  const seen = new Set<string>();

  for (const sourceText of sourceTexts) {
    for (const match of sourceText.matchAll(/\bk\s*[- ]?(?:faktor|factor|verdi|värde|value)\s*(?::|=)?\s*(-?\d+(?:[.,]\d+)?)/giu)) {
      addSourceReading(readings, seen, match[1]);
    }
    for (const match of sourceText.matchAll(/\bk\s*[=-]\s*(-?\d+(?:[.,]\d+)?)/giu)) {
      addSourceReading(readings, seen, match[1]);
    }
  }

  return readings;
}

function addSourceReading(
  readings: KFactorReading[],
  seen: Set<string>,
  rawValue: string
) {
  const value = parseSprinklerKFactor(rawValue);
  if (value === null) return;
  const identity = `${rawValue}:${value}`;
  if (seen.has(identity)) return;
  seen.add(identity);
  readings.push({ rawValue, value, source: "source" });
}

function isKFactorKey(value: string) {
  const normalized = value
    .normalize("NFKD")
    .toLocaleLowerCase("sv-SE")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return normalized === "k faktor"
    || normalized === "k factor"
    || normalized === "k verdi"
    || normalized === "k varde"
    || normalized === "k value";
}

function approximatelyEqual(left: number, right: number) {
  return Math.abs(left - right) < 0.000_001;
}

function displayText(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}
