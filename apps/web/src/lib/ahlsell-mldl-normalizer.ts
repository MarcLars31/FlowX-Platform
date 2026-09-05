export type AhlsellMldlCategory =
  | "sprinkler_head"
  | "sprinkler_accessory"
  | "sprinkler_hose"
  | "valve"
  | "coupling"
  | "bend"
  | "tee"
  | "reducer"
  | "pipe"
  | "fitting"
  | "other";

export type AhlsellMldlLocation = "LC Eidsvoll" | "Gardermoen Sentralla" | "Unknown";

export type AhlsellMldlRow = {
  articleNumber: string;
  warehouseCode: string;
  location: AhlsellMldlLocation;
  description: string;
  rawRow: string;
  manufacturer: "Victaulic";
  category: AhlsellMldlCategory;
  model: string | null;
  nominalSizeRaw: string | null;
  dnValues: number[];
  outsideDiameterMm: number[];
  kFactor: number | null;
  temperatureC: number | null;
  response: "QR" | "SR" | null;
  orientation: "upright" | "pendent" | "sidewall" | null;
  mount: "surface" | "recessed" | "concealed" | null;
  sprinklerHeadType: "standard" | "dry" | "open" | null;
  coverage: "standard" | "extended" | "residential" | "open" | null;
  finish: "white" | "black" | "chrome" | "brass" | null;
  pressureClass: string | null;
  material: string | null;
  connection: string | null;
  reviewFlags: string[];
};

export type AhlsellNormalizedProduct = Omit<AhlsellMldlRow, "warehouseCode" | "location" | "rawRow" | "reviewFlags"> & {
  locations: AhlsellMldlLocation[];
  sourceRowCount: number;
  sourceDescriptions: string[];
  reviewFlags: string[];
  dataStatus: "Ready for matching" | "Review";
};

const OUTSIDE_DIAMETER_TO_DN = new Map<number, number>([
  [21.3, 15],
  [26.9, 20],
  [33.7, 25],
  [42.4, 32],
  [48.3, 40],
  [60.3, 50],
  [76.1, 65],
  [88.9, 80],
  [114.3, 100],
  [139.7, 125],
  [168.3, 150],
  [219.1, 200]
]);

const INCH_TO_DN = new Map<string, number>([
  ["1/2", 15],
  ["3/4", 20],
  ["1", 25],
  ["1 1/4", 32],
  ["1 1/2", 40],
  ["2", 50],
  ["2 1/2", 65],
  ["3", 80],
  ["4", 100],
  ["5", 125],
  ["6", 150],
  ["8", 200]
]);

export function parseAhlsellMldlRow(rawRow: string): AhlsellMldlRow | null {
  const outer = rawRow.trim().match(/^([A-Za-z0-9]+)\s*\/\s*(\d+)\s*\((.*)\)$/);
  if (!outer) return null;

  const [, articleNumber, warehouseCode, body] = outer;
  const locationMatch = body.match(/\s*\/\s*(LC Eidsvoll|Gardermoen Sentralla)\s*$/i);
  const location = mapLocation(locationMatch?.[1], warehouseCode);
  const description = (locationMatch ? body.slice(0, locationMatch.index) : body).trim();
  const normalized = normalize(description);
  const category = classifyCategory(normalized);
  const outsideDiameterMm = extractOutsideDiameters(description);
  const explicitDnValues = matches(description, /\bDN\s*(\d{2,3})\b/gi).map(Math.round);
  const inchDn = extractInchDn(description);
  const inferredDn = outsideDiameterMm
    .map((value) => OUTSIDE_DIAMETER_TO_DN.get(value) ?? null)
    .filter((value): value is number => value !== null);
  const dnValues = uniqueNumbers([...explicitDnValues, ...inchDn, ...inferredDn]);
  const isSprinklerHead = category === "sprinkler_head";
  const sprinklerHeadType = isSprinklerHead ? extractSprinklerHeadType(normalized) : null;
  const kFactor = isSprinklerHead ? extractKFactor(description) : null;
  const temperatureC = isSprinklerHead ? firstNumber(description, /(\d{2,3})\s*°?\s*C\b/i) : null;
  const response = isSprinklerHead ? extractResponse(normalized) : null;
  const orientation = isSprinklerHead ? extractOrientation(normalized) : null;
  const mount = isSprinklerHead ? extractMount(normalized) : null;
  const coverage = isSprinklerHead ? extractCoverage(normalized, sprinklerHeadType) : null;
  const finish = extractFinish(normalized);
  const pressureClass = description.match(/\bPN\s*(\d{1,3})\b/i)?.[0].replace(/\s+/g, "") ?? null;
  const material = extractMaterial(normalized);
  const connection = extractConnection(normalized);
  const model = extractModel(description);
  const nominalSizeRaw = extractNominalSize(description);
  const row: AhlsellMldlRow = {
    articleNumber,
    warehouseCode,
    location,
    description,
    rawRow,
    manufacturer: "Victaulic",
    category,
    model,
    nominalSizeRaw,
    dnValues,
    outsideDiameterMm,
    kFactor,
    temperatureC,
    response,
    orientation,
    mount,
    sprinklerHeadType,
    coverage,
    finish,
    pressureClass,
    material,
    connection,
    reviewFlags: []
  };
  row.reviewFlags = reviewRow(row);
  return row;
}

export function normalizeAhlsellMldlRows(rawRows: string[]): {
  products: AhlsellNormalizedProduct[];
  rejectedRows: string[];
} {
  const rejectedRows: string[] = [];
  const parsedRows = rawRows.flatMap((rawRow) => {
    const parsed = parseAhlsellMldlRow(rawRow);
    if (!parsed) rejectedRows.push(rawRow);
    return parsed ? [parsed] : [];
  });
  const grouped = new Map<string, AhlsellMldlRow[]>();
  for (const row of parsedRows) {
    grouped.set(row.articleNumber, [...(grouped.get(row.articleNumber) ?? []), row]);
  }

  const products = [...grouped.values()].map(mergeProductRows);
  products.sort((left, right) => left.articleNumber.localeCompare(right.articleNumber, "sv", { numeric: true }));
  return { products, rejectedRows };
}

function mergeProductRows(rows: AhlsellMldlRow[]): AhlsellNormalizedProduct {
  const first = rows[0];
  const reviewFlags = uniqueStrings(rows.flatMap((row) => row.reviewFlags));
  const categories = uniqueStrings(rows.map((row) => row.category));
  const descriptions = uniqueStrings(rows.map((row) => row.description));
  if (categories.length > 1) reviewFlags.push("Conflicting category between warehouse rows");
  if (descriptions.length > 1) reviewFlags.push("Warehouse descriptions differ; confirm merged attributes");

  const product: AhlsellNormalizedProduct = {
    ...first,
    description: descriptions[0],
    model: joinValues(rows.map((row) => row.model)),
    nominalSizeRaw: joinValues(rows.map((row) => row.nominalSizeRaw)),
    dnValues: uniqueNumbers(rows.flatMap((row) => row.dnValues)),
    outsideDiameterMm: uniqueNumbers(rows.flatMap((row) => row.outsideDiameterMm)),
    kFactor: singleNumber(rows.map((row) => row.kFactor), reviewFlags, "K factor"),
    temperatureC: singleNumber(rows.map((row) => row.temperatureC), reviewFlags, "temperature"),
    response: singleValue(rows.map((row) => row.response), reviewFlags, "response"),
    orientation: singleValue(rows.map((row) => row.orientation), reviewFlags, "orientation"),
    mount: singleValue(rows.map((row) => row.mount), reviewFlags, "mount"),
    sprinklerHeadType: singleValue(rows.map((row) => row.sprinklerHeadType), reviewFlags, "head construction"),
    coverage: singleValue(rows.map((row) => row.coverage), reviewFlags, "coverage"),
    finish: singleValue(rows.map((row) => row.finish), reviewFlags, "finish"),
    pressureClass: joinValues(rows.map((row) => row.pressureClass)),
    material: joinValues(rows.map((row) => row.material)),
    connection: joinValues(rows.map((row) => row.connection)),
    locations: uniqueStrings(rows.map((row) => row.location)) as AhlsellMldlLocation[],
    sourceRowCount: rows.length,
    sourceDescriptions: descriptions,
    reviewFlags: uniqueStrings(reviewFlags),
    dataStatus: reviewFlags.length === 0 ? "Ready for matching" : "Review"
  };
  return product;
}

function reviewRow(row: AhlsellMldlRow) {
  if (row.category !== "sprinkler_head") return [];
  const flags: string[] = [];
  if (row.dnValues.length === 0) flags.push("Missing DN");
  if (row.kFactor === null) flags.push("Missing K factor");
  if (row.sprinklerHeadType !== "open" && row.temperatureC === null) flags.push("Missing release temperature");
  if (row.sprinklerHeadType !== "open" && row.response === null) flags.push("Missing response type");
  if (row.orientation === null) flags.push("Missing orientation");
  if (row.sprinklerHeadType === "standard" && row.kFactor === 80 && row.dnValues.includes(25)) {
    flags.push("Check dimension: conventional K80 is normally DN15, not DN25");
  }
  if (row.sprinklerHeadType === "dry" && row.kFactor === 80 && !row.dnValues.includes(25)) {
    flags.push("Check dimension: Ahlsell dry K80 family is expected as DN25");
  }
  return flags;
}

function classifyCategory(value: string): AhlsellMldlCategory {
  if (/\b(dekkskiv|pyntering|cover plate|lokk.*sprinkler|nokkel.*sprinkler|sprinklerskap|sprinklergitter|gitter.*sprinkler|beskytt.*sprinkler)\b/.test(value)) return "sprinkler_accessory";
  if (/\b(sprinklerslange|sprinkler slange|flexible sprinkler)\b/.test(value)) return "sprinkler_hose";
  if (isSprinklerHeadText(value)) return "sprinkler_head";
  if (/\b(?:[a-z]+)?ventil\b|\bvalve\b/.test(value)) return "valve";
  if (/\b(kupling|kobling|coupling)\b/.test(value)) return "coupling";
  if (/\b(bend|albue|elbow)\b/.test(value)) return "bend";
  if (/\b(t-ror|t-ror|tee|avgrening)\b/.test(value)) return "tee";
  if (/\b(reduksjon|dimensjonsovergang|reducer)\b/.test(value)) return "reducer";
  if (/\b(ror|pipe)\b/.test(value)) return "pipe";
  if (/\b(flens|nippel|muffe|fitting)\b/.test(value)) return "fitting";
  return "other";
}

function extractSprinklerHeadType(value: string): NonNullable<AhlsellMldlRow["sprinklerHeadType"]> {
  if (/\b(torr|dry)\b/.test(value)) return "dry";
  if (/\b(ap(?:en|ne)|open|window|vindu|uten termisk element)\b/.test(value)) return "open";
  return "standard";
}

function extractKFactor(value: string) {
  const factors = matches(value, /\bK\s*-?\s*(\d+(?:[.,]\d+)?)/gi);
  return factors.filter((factor) => factor >= 20).sort((left, right) => right - left)[0] ?? factors[0] ?? null;
}

function extractResponse(value: string): AhlsellMldlRow["response"] {
  if (/\b(qr|quick|kvikk)\b/.test(value)) return "QR";
  if (/\b(sr|standard response|standard-respons)\b/.test(value)) return "SR";
  return null;
}

function extractOrientation(value: string): AhlsellMldlRow["orientation"] {
  if (/\b(hsw|sidewall|vegg)\b/.test(value)) return "sidewall";
  if (/\b(ssu|opp|upright|staende)\b/.test(value)) return "upright";
  if (/\b(ssp|pen|pendent|hengende|ned)\b/.test(value)) return "pendent";
  return null;
}

function extractMount(value: string): AhlsellMldlRow["mount"] {
  if (/\b(skjult|concealed|cover plate|dekkplate)\b/.test(value)) return "concealed";
  if (/\b(innfelt|recessed|dekkskiv|pyntering)\b/.test(value)) return "recessed";
  if (/\b(surface|uten rosett|synlig)\b/.test(value)) return "surface";
  return null;
}

function extractCoverage(value: string, headType: AhlsellMldlRow["sprinklerHeadType"]): AhlsellMldlRow["coverage"] {
  if (headType === "open") return "open";
  if (/\b(eclh|ecoh|extended coverage|ext cov|ext\.cov|qrec)\b/.test(value)) return "extended";
  if (/\b(bolig|residential)\b/.test(value)) return "residential";
  return "standard";
}

function extractFinish(value: string): AhlsellMldlRow["finish"] {
  if (/\b(hvit|hvi)\b/.test(value)) return "white";
  if (/\b(sort|black)\b/.test(value)) return "black";
  if (/\b(krom|chrome)\b/.test(value)) return "chrome";
  if (/\b(mess|messing|brass)\b/.test(value)) return "brass";
  return null;
}

function extractMaterial(value: string) {
  if (/\b(duktil|stopejern)\b/.test(value)) return "ductile iron";
  if (/\b(mess|messing|brass)\b/.test(value)) return "brass";
  if (/\b(rustfri|stainless)\b/.test(value)) return "stainless steel";
  if (/\b(stal|steel|galvanisert)\b/.test(value)) return "steel";
  return null;
}

function extractConnection(value: string) {
  const connections: string[] = [];
  if (/\b(rillet|grooved)\b/.test(value)) connections.push("grooved");
  if (/\b(gjenget|gjenger|threaded)\b/.test(value)) connections.push("threaded");
  if (/\b(flens|flanged)\b/.test(value)) connections.push("flanged");
  if (/\b(sveis|weld)\b/.test(value)) connections.push("welded");
  return connections.length ? connections.join("; ") : null;
}

function extractModel(value: string) {
  const match = value.match(/\b(V(?:ic\s*)?\d{2,5}[A-Za-z]?|S\/\d+[A-Za-z]?)\b/i);
  return match?.[1].replace(/\s+/g, "") ?? null;
}

function extractNominalSize(value: string) {
  return value.match(/(?:^|\s)(\d(?:\s+\d\/\d)?|\d\/\d)\s*(?:\"|tommer?)(?=\s|$)/i)?.[0].trim()
    ?? value.match(/^(\d\s+\d\/\d|\d\/\d)(?=\s)/i)?.[1]
    ?? value.match(/\bDN\s*\d{2,3}(?:\s*[x/]\s*DN?\s*\d{2,3})?\b/i)?.[0].replace(/\s+/g, "")
    ?? value.match(/\b\d+(?:[.,]\d+)?\s*mm\b/i)?.[0].replace(/\s+/g, "")
    ?? null;
}

function extractInchDn(value: string) {
  const match = value.match(/(?:^|\s)(\d(?:\s+\d\/\d)?|\d\/\d)\s*(?:\"|tommer?)(?=\s|$)/i)
    ?? value.match(/^(\d\s+\d\/\d|\d\/\d)(?=\s)/i);
  if (!match) return [];
  const normalized = match[1].replace(/\s+/g, " ");
  const dn = INCH_TO_DN.get(normalized);
  return dn ? [dn] : [];
}

function isSprinklerHeadText(value: string) {
  return /\b(sprinklerhode(?:r)?|sprinkelhode(?:r)?|sprinlerlhode(?:r)?|sprinkler head)\b/.test(value);
}

function extractOutsideDiameters(value: string) {
  const values = matches(value, /(\d+(?:[.,]\d+)?)\s*mm\b/gi);
  for (const chain of value.matchAll(/(\d+(?:[.,]\d+)?(?:\s*[xX]\s*\d+(?:[.,]\d+)?)+)\s*mm\b/gi)) {
    values.push(...chain[1].split(/[xX]/).map((part) => Number(part.trim().replace(",", "."))));
  }
  return uniqueNumbers(values.filter(Number.isFinite));
}

function mapLocation(value: string | undefined, warehouseCode: string): AhlsellMldlLocation {
  if (/eidsvoll/i.test(value ?? "") || warehouseCode === "6") return "LC Eidsvoll";
  if (/gardermoen/i.test(value ?? "") || warehouseCode === "8") return "Gardermoen Sentralla";
  return "Unknown";
}

function matches(value: string, pattern: RegExp) {
  return [...value.matchAll(pattern)]
    .map((match) => Number(match[1].replace(",", ".")))
    .filter(Number.isFinite);
}

function firstNumber(value: string, pattern: RegExp) {
  const match = value.match(pattern)?.[1];
  if (!match) return null;
  const result = Number(match.replace(",", "."));
  return Number.isFinite(result) ? result : null;
}

function normalize(value: string) {
  return value
    .toLocaleLowerCase("nb-NO")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ø/g, "o")
    .replace(/æ/g, "ae");
}

function uniqueNumbers(values: number[]) {
  return [...new Set(values)].sort((left, right) => left - right);
}

function uniqueStrings<T extends string>(values: T[]) {
  return [...new Set(values.filter(Boolean))];
}

function joinValues(values: Array<string | null>) {
  const unique = uniqueStrings(values.filter((value): value is string => value !== null));
  return unique.length ? unique.join("; ") : null;
}

function singleNumber(values: Array<number | null>, flags: string[], label: string) {
  const unique = uniqueNumbers(values.filter((value): value is number => value !== null));
  if (unique.length > 1) flags.push(`Conflicting ${label} between warehouse rows`);
  return unique[0] ?? null;
}

function singleValue<T extends string>(values: Array<T | null>, flags: string[], label: string): T | null {
  const unique = uniqueStrings(values.filter((value): value is T => value !== null));
  if (unique.length > 1) flags.push(`Conflicting ${label} between warehouse rows`);
  return unique[0] ?? null;
}
