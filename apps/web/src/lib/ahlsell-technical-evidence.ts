import { normalizeTechnicalText } from "./ahlsell-requirement-context";
import { pipeJointTypes, stainlessSteelGrade } from "./pipe-technical-terms";
import { resolvedSprinklerOrientation } from "./sprinkler-orientation-lexicon";

export const AHLSELL_EVIDENCE_VERSION = 1;
export const AHLSELL_EVIDENCE_TTL_MS = 12 * 60 * 60_000;
export type TechnicalField = "dn" | "outsideDiameterMm" | "threadInches" | "material" | "materialGrade"
  | "connection" | "pn" | "workingPressureBar" | "kFactor" | "temperatureC" | "response" | "orientation" | "finish";
export type TechnicalObservation = {
  value: string | number;
  raw: string;
  sourceUrl: string;
  sourceKind: "product_page" | "variant_table";
  retrievedAt: string;
};
export type AhlsellTechnicalEvidence = {
  version: typeof AHLSELL_EVIDENCE_VERSION;
  articleNumber: string;
  fields: Partial<Record<TechnicalField, { status: "documented" | "conflict"; observations: TechnicalObservation[] }>>;
};
export type AhlsellEvidenceSnapshot = {
  version: typeof AHLSELL_EVIDENCE_VERSION;
  articleNumber: string;
  sourceUrl: string;
  retrievedAt: string;
  productName: string;
  subtitle: string | null;
  description: string | null;
  specifications: string[];
};
export type AhlsellEvidenceStore = {
  read(market: "no" | "se", article: string): Promise<unknown>;
  write(market: "no" | "se", article: string, snapshot: AhlsellEvidenceSnapshot): Promise<void>;
};

export const TECHNICAL_FIELD_LABELS: Record<TechnicalField, string> = {
  dn: "DN", outsideDiameterMm: "Ytterdiameter (mm)", threadInches: "Gänga (tum)", material: "Material",
  materialGrade: "Materialkvalitet", connection: "Anslutning", pn: "Tryckklass PN", workingPressureBar: "Arbetstryck (bar)",
  kFactor: "K-faktor", temperatureC: "Utlösningstemperatur (°C)", response: "Respons", orientation: "Monteringsriktning", finish: "Ytfinish"
};

/** Only the exact article's table and header are accepted. Search queries and
 * PDF requirements must never become product evidence. Unknown fields stay raw. */
export function buildAhlsellTechnicalEvidence(input: Omit<AhlsellEvidenceSnapshot, "version"> & {
  sourceKind?: TechnicalObservation["sourceKind"];
}): AhlsellTechnicalEvidence {
  const fields: AhlsellTechnicalEvidence["fields"] = {};
  function add(field: TechnicalField, value: string | number | null, raw: string) {
    if (value === null) return;
    const entry = fields[field] ?? { status: "documented", observations: [] };
    if (!entry.observations.some(o => o.value === value && o.raw === raw)) entry.observations.push({
      value, raw, sourceUrl: input.sourceUrl, sourceKind: input.sourceKind ?? "product_page", retrievedAt: input.retrievedAt
    });
    entry.status = new Set(entry.observations.map(o => o.value)).size > 1 ? "conflict" : "documented";
    fields[field] = entry;
  }
  for (const raw of input.specifications) {
    const separator = raw.indexOf(":");
    if (separator < 0) continue;
    const label = normalizeTechnicalText(raw.slice(0, separator));
    const value = raw.slice(separator + 1).trim();
    const normalized = normalizeTechnicalText(value);
    if (/^(?:dn|nominell diameter(?: dn)?|nominell storrelse|tilkobling dn|dimensjon dn|gjengedimensjon dn)$/.test(label)) add("dn", numeric(value, /^(?:DN\s*)?(\d+(?:[.,]\d+)?)$/i), raw);
    if (/^(?:ytre diameter|utvendig diameter|ytterdiameter|outside diameter)(?: mm)?$/.test(label)) add("outsideDiameterMm", numeric(value, /^(\d+(?:[.,]\d+)?)\s*(?:mm)?$/i), raw);
    if (/^(?:dimensjon|dimension)$/.test(label)) add("dn", numeric(value, /^DN\s*(\d+(?:[.,]\d+)?)$/i), raw);
    if (/^(?:utvendig gjenge|innvendig gjenge|gjengedimensjon|gjenge|thread size)(?: tommer|inch)?$/.test(label)) add("threadInches", thread(value), raw);
    if (/^(?:materiale|material|materiale hus|husmateriale|ventilhus|ror materiale)$/.test(label)) add("material", material(normalized), raw);
    if (/^(?:materiale|material|materialkvalitet|material quality|grade)$/.test(label)) add("materialGrade", stainlessSteelGrade(`grade ${value}`) ?? stainlessSteelGrade(value), raw);
    if (/^(?:tilkobling|anslutning|anslutningstyp|type tilkobling|skjot|rillesystem|connection)$/.test(label)) {
      const joints = pipeJointTypes(value);
      if (!joints.length && /\b(?:gjenger|gjeng|bspt|npt|utvendige gjenger)\b/.test(normalized)) joints.push("threaded");
      for (const joint of joints) add("connection", joint, raw);
    }
    if (/^(?:pn|trykklasse|trykk klasse|tryckklass|pressure class)$/.test(label)) add("pn", numeric(value, /^(?:PN\s*)?(\d+(?:[.,]\d+)?)$/i), raw);
    if (/^(?:(?:maks|max|maximum) )?(?:arbeidstrykk|arbeids trykk|arbetstryck|working pressure)(?: bar)?$/.test(label)) add("workingPressureBar", pressure(value, /\bbar\b/.test(label) ? "bar" : undefined), raw);
    if (/^k (?:faktor|factor|verdi|value)$/.test(label)) add("kFactor", numeric(value, /^(\d+(?:[.,]\d+)?)(?:\s*l\s*\/\s*min\s*\/?\s*(?:√|sqrt)?\s*bar(?:[⁰\.0,5]+)?)?$/i), raw);
    if (/^(?:utlosningstemperatur|responstemperatur|utlosningstemperatur c|temperature rating)$/.test(label)) add("temperatureC", numeric(value, /^(\d+(?:[.,]\d+)?)\s*(?:°?\s*C)?$/i), raw);
    if (/^(?:responstid|respons|response|response type|folsomhetsgrad)$/.test(label)) add("response", normalized === "standard" ? "standard" : response(normalized), raw);
    if (/^(?:monteringsretning|monteringsriktning|orientation|plassering)$/.test(label)) add("orientation", orientation(normalized), raw);
    if (/^(?:farge|farg|finish|overflatebehandling|colour|color)$/.test(label)) add("finish", finish(normalized), raw);
  }
  // Header text belongs to the identified variant; family prose does not.
  for (const raw of [input.productName, input.subtitle].filter((s): s is string => Boolean(s))) {
    const text = normalizeTechnicalText(raw);
    const dimensions = headerNumbers(raw, /\bDN\s*(\d+(?:[.,]\d+)?)\b/gi);
    if (new Set(dimensions).size === 1) add("dn", dimensions[0], raw);
    for (const value of headerNumbers(raw, /\bK\s*[-=]?\s*(\d+(?:[.,]\d+)?)\b/gi)) add("kFactor", value, raw);
    for (const value of headerNumbers(raw, /\b(\d+(?:[.,]\d+)?)\s*°?C\b/g)) add("temperatureC", value, raw);
    for (const value of headerNumbers(raw, /\bPN\s*(\d+(?:[.,]\d+)?)\b/gi)) add("pn", value, raw);
    add("response", response(text), raw);
    add("orientation", orientation(text), raw);
  }
  // Only explicit working pressure in the product's own description; never
  // test pressure, operating-temperature ranges, or recommendation sections.
  for (const match of (input.description ?? "").matchAll(/(?:maks(?:imum)?\s+)?(?:arbeidstrykk|arbetstryck|working pressure)\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*(bar|kpa|mpa|psi)\b/gi)) {
    add("workingPressureBar", pressure(`${match[1]} ${match[2]}`), match[0]);
  }
  return { version: AHLSELL_EVIDENCE_VERSION, articleNumber: input.articleNumber, fields };
}

export function mergeAhlsellTechnicalEvidence(...items: (AhlsellTechnicalEvidence | undefined)[]) {
  const valid = items.filter((item): item is AhlsellTechnicalEvidence => Boolean(item));
  if (!valid.length) return undefined;
  const articleNumber = valid[0].articleNumber;
  const fields: AhlsellTechnicalEvidence["fields"] = {};
  for (const item of valid.filter(e => e.articleNumber === articleNumber)) for (const key of Object.keys(item.fields) as TechnicalField[]) {
    const observations = [...(fields[key]?.observations ?? []), ...(item.fields[key]?.observations ?? [])];
    const unique = [...new Map(observations.map(o => [JSON.stringify(o), o])).values()];
    fields[key] = { status: new Set(unique.map(o => o.value)).size > 1 ? "conflict" : "documented", observations: unique };
  }
  return { version: AHLSELL_EVIDENCE_VERSION, articleNumber, fields } satisfies AhlsellTechnicalEvidence;
}

/** Canonical labels let the existing matcher use explicitly labelled fields
 * such as Ytre diameter and Utvendig gjenge without guessing from other numbers. */
export function technicalEvidenceSpecifications(evidence?: AhlsellTechnicalEvidence): string[] {
  if (!evidence) return [];
  return (Object.keys(evidence.fields) as TechnicalField[]).flatMap(key => {
    const entry = evidence.fields[key];
    if (entry?.status !== "documented") return [];
    const value = entry.observations[0]?.value;
    if (value === undefined) return [];
    const display: Partial<Record<TechnicalField, string>> = {
      dn: `DN${value}`, outsideDiameterMm: `Ytre diameter: ${value} mm`, threadInches: `Gjenge: ${value}\"`,
      pn: `PN${value}`, workingPressureBar: `Arbeidstrykk: ${value} bar`, kFactor: `K-faktor: ${value}`,
      temperatureC: `Utløsningstemperatur: ${value}°C`, response: value === "quick" ? "Quick response QR" : "Standard response SR",
      connection: ({threaded:"Gjenget",grooved:"Rillet",welded:"Sveist",fusion:"Muffesveis",flanged:"Flens"} as Record<string,string>)[value],
      material: `Materiale: ${{steel:"Stål",stainless_steel:"Rustfritt stål",ductile_iron:"Duktilt støpejern",cast_iron:"Støpejern",brass:"Messing",copper:"Kobber",pe:"PE",pvc:"PVC",ppr:"PP-R",multilayer:"Alupex"}[value] ?? value}`,
      materialGrade: `Materialkvalitet: ${value}`, orientation: `Orientation: ${value}`,
      finish: `Finish: ${{white:"Hvit",black:"Svart",chrome:"Krom",brass:"Messing"}[value] ?? value}`
    };
    return display[key] ? [display[key]!] : [];
  });
}

export function technicalEvidenceWarnings(article: string, evidence?: AhlsellTechnicalEvidence, now = Date.now()) {
  if (!evidence) return [];
  if (evidence.articleNumber !== article) return ["Produktunderlagets NRF-nummer stämmer inte med den valda artikeln. Kontrollera underlaget."];
  const warnings: string[] = [];
  for (const key of Object.keys(evidence.fields) as TechnicalField[]) {
    const field = evidence.fields[key]!;
    if (field.status === "conflict") warnings.push(`Motstridiga produktuppgifter för ${TECHNICAL_FIELD_LABELS[key]}: ${[...new Set(field.observations.map(o => o.value))].join(" / ")}. Kontrollera artikelns datablad.`);
  }
  if (Object.values(evidence.fields).some(field => field?.observations.some(o => !Number.isFinite(Date.parse(o.retrievedAt)) || now - Date.parse(o.retrievedAt) > AHLSELL_EVIDENCE_TTL_MS))) warnings.push("Produktunderlaget behöver hämtas på nytt; senaste kontrollen är äldre än 12 timmar.");
  return warnings;
}

function numeric(text: string, pattern: RegExp) {
  const match = pattern.exec(text.trim());
  if (!match) return null;
  const value = Number(match[1].replace(",", "."));
  return Number.isFinite(value) && value > 0 ? value : null;
}
function headerNumbers(text: string, pattern: RegExp) {
  return [...text.matchAll(pattern)].flatMap(match => {
    const before = text.slice(0, match.index);
    const after = text.slice(match.index! + match[0].length);
    // A range or alternate size is not one documented value for this article.
    if (/^\s*(?:[-–/]\s*\d|US\b)/i.test(after) || /\d\s*[-–/]\s*$/.test(before)) return [];
    const value = Number(match[1].replace(",", "."));
    return Number.isFinite(value) && value > 0 ? [value] : [];
  });
}
function pressure(text: string, defaultUnit?: string) {
  const match = /^(\d+(?:[.,]\d+)?)\s*(bar|kpa|mpa|psi)?$/i.exec(text.trim());
  const factor = ({bar:1,kpa:.01,mpa:10,psi:.0689476} as Record<string,number>)[(match?.[2] ?? defaultUnit ?? "").toLowerCase()];
  return match && factor ? Math.round(Number(match[1].replace(",", ".")) * factor * 10000) / 10000 : null;
}
function thread(text: string) {
  const match = /^(?:G|R|Rp|Rc)?\s*(1\/2|3\/4|1|1 1\/4|1 1\/2|2)\s*(?:["″]|inch|tommer)?$/i.exec(text.trim());
  return match?.[1] ?? null;
}
function response(text: string) {
  const quick = /\b(?:qr|quick|kvikk|hurtig|rask)\b/.test(text);
  const standard = /\b(?:sr|standard respons|standard response)\b/.test(text);
  return quick === standard ? null : quick ? "quick" : "standard";
}
function orientation(text: string) {
  // Dual-mount products are handled by the existing orientation rule. Plain
  // direction words only count as terminal labels, never e.g. "opp til 12 bar".
  if (/\b(?:opp ned|ned opp)\b/.test(text)) return null;
  return resolvedSprinklerOrientation(text.replace(/\bopp$/, "upright").replace(/\bned$/, "pendent").replace(/\bpendant\b/g, "pendent")).orientation;
}
function finish(text: string) {
  if (/^(?:hvit|vit|white)(?: lakkert)?$/.test(text)) return "white";
  if (/^(?:sort|svart|black)(?: lakkert)?$/.test(text)) return "black";
  if (/^(?:krom|forkrommet|chrome|chromed)$/.test(text)) return "chrome";
  if (/^(?:messing|brass)$/.test(text)) return "brass";
  return null;
}
function material(text: string) {
  if (/\b(?:rustfri\w*|rostfri\w*|stainless)\b/.test(text)) return "stainless_steel";
  if (/\b(?:duktil\w*|ductile)\b/.test(text)) return "ductile_iron";
  if (/\b(?:stopejern|gjutjarn|cast iron)\b/.test(text)) return "cast_iron";
  if (/\b(?:stal\w*|steel)\b/.test(text)) return "steel";
  if (/\b(?:messing|brass)\b/.test(text)) return "brass";
  if (/\b(?:kobber\w*|koppar\w*|copper)\b/.test(text)) return "copper";
  if (/\b(?:alupex|multilayer)\b/.test(text)) return "multilayer";
  if (/\b(?:pe\d*|polyetylen)\b/.test(text)) return "pe";
  if (/\bpvc\b/.test(text)) return "pvc";
  if (/\b(?:pp r|ppr)\b/.test(text)) return "ppr";
  return null;
}
