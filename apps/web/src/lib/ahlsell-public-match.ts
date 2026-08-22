export type AhlsellPublicCandidate = {
  articleNumber: string;
  productName: string;
  manufacturer: string;
  productUrl: string;
  description?: string;
  imageUrl?: string;
  specifications: string[];
  source: "public_verified" | "pdf_reference" | "catalog_search";
  verifiedAt?: string;
  matchScore?: number;
  matchReasons?: string[];
  matchWarnings?: string[];
  recommendation?: "recommended" | "possible" | "unlikely";
  familyCode?: string;
  variantCount?: number;
};

export type AhlsellRequirementGuide = {
  searchQuery: string;
  searchQueries: string[];
  searchUrl: string;
  criteria: string[];
  warnings: string[];
  recognitionNotes: string[];
  directCandidates: AhlsellPublicCandidate[];
};

type Orientation = "pendent" | "upright" | "sidewall";
type Response = "quick" | "standard";
type Finish = "brass" | "white" | "black" | "chrome";

type SprinklerCandidateDefinition = AhlsellPublicCandidate & {
  kFactor: number;
  dn: number;
  temperatureC: number;
  orientation: Orientation;
  response: Response;
  finish: Finish;
};

const AHLSELL_SWEDEN_SEARCH_URL = "https://www.ahlsell.se/search";
const AHLSELL_NORWAY_SEARCH_URL = "https://www.ahlsell.no/search";
const VERIFIED_AT = "2026-08-22";

// A deliberately small, manually verified set for the uploaded technical
// descriptions. It is not a copy of Ahlsell's catalogue. Every other row gets
// a prefilled public Ahlsell search and must be selected by the user.
const sprinklerCandidates: SprinklerCandidateDefinition[] = [
  candidate("19045185", "Reliable F1FR56 QR Pendent K80 DN15 68°C mässing", "quick-respons", 80, 15, 68, "pendent", "quick", "brass", "RA1414"),
  candidate("19045187", "Reliable F1FR56 QR Pendent K80 DN15 68°C svart", "quick-respons", 80, 15, 68, "pendent", "quick", "black", "RA1414"),
  candidate("19045188", "Reliable F1FR56 QR Pendent K80 DN15 68°C vit", "quick-respons", 80, 15, 68, "pendent", "quick", "white", "RA1414"),
  candidate("19045195", "Reliable F1FR56 QR Pendent K80 DN15 141°C vit", "quick-respons", 80, 15, 141, "pendent", "quick", "white", "RA1414"),
  candidate("19045199", "Reliable F1FR56 QR Upright K80 DN15 68°C vit", "quick-respons", 80, 15, 68, "upright", "quick", "white", "RA1425"),
  candidate("19045160", "Reliable F156 SR Upright K80 DN15 68°C mässing", "standard-respons", 80, 15, 68, "upright", "standard", "brass", "RA1325"),
  candidate("19045145", "Reliable F156 SR HSW K80 DN15 68°C krom", "standard-respons", 80, 15, 68, "sidewall", "standard", "chrome", "RA1335"),
  candidate("19045146", "Reliable F156 SR HSW K80 DN15 68°C vit", "standard-respons", 80, 15, 68, "sidewall", "standard", "white", "RA1335")
];

export function buildAhlsellRequirementGuide(
  requirement: Record<string, unknown>
): AhlsellRequirementGuide {
  const value = record(requirement.value_json);
  const attributes = normalizedAttributeMap(record(value.attributes));
  const category = text(requirement.category) ?? text(requirement.requirement_key) ?? "unknown";
  const description = text(requirement.value_text) ?? text(requirement.display_name) ?? "Teknisk produkt";
  const technicalSpecification = text(value.technicalSpecification) ?? text(requirement.source_excerpt) ?? "";
  const sourceLanguageText = `${description} ${technicalSpecification} ${[...attributes.values()].join(" ")}`;
  const combined = normalize(sourceLanguageText);
  const isNorwegianSource = isNorwegianTechnicalText(sourceLanguageText);
  const ahlsellSearchUrl = isNorwegianSource
    ? AHLSELL_NORWAY_SEARCH_URL
    : AHLSELL_SWEDEN_SEARCH_URL;
  const isSprinklerAccessory = /beskyttelsesgitter|beskyttelsesgitre|skyddskorg|sprinklerkorg/i.test(description);

  const rawKFactor = numberFromAttribute(attributes, ["k faktor", "k factor", "k verdi", "k value"])
    ?? numberFromText(combined, /\bk\s*[-=]?\s*(\d+(?:[.,]\d+)?)/i);
  // Norwegian descriptions frequently write K-80. The hyphen is a separator,
  // not a negative hydraulic value.
  const kFactor = rawKFactor === null ? null : Math.abs(rawKFactor);
  const dn = numberFromAttribute(attributes, ["gjengedimensjon dn", "dimension", "dimensjon", "dn"])
    ?? numberFromText(combined, /\bdn\s*(\d{1,3})\b/i);
  const temperatureC = category === "sprinkler_head"
    ? numberFromAttribute(attributes, ["utlosningstemperatur", "utløsningstemperatur", "temperature"])
      ?? numberFromText(combined, /(-?\d+(?:[.,]\d+)?)\s*(?:°\s*)?c\b/i)
    : null;
  const placement = firstAttribute(attributes, ["plassering", "placering", "orientation", "sprinklertype", "type"]);
  const responseText = firstAttribute(attributes, ["folsomhetsgrad", "respons", "response"]);
  const finishText = `${firstAttribute(attributes, ["overflatebehandling", "farge", "farg", "finish", "colour", "color"]) ?? ""} ${description}`;
  const orientationResult = sprinklerOrientation(`${placement ?? ""} ${description}`);
  const responseResult = sprinklerResponse(responseText, technicalSpecification);
  const finish = sprinklerFinish(finishText);
  const concealed = /\b(innfelt|inf[aä]llt|concealed|dold|flat cover|plate)\b/i.test(combined);
  const specialApplication = /\b(torrsprinkler|torrorssprinkler|dry sprinkler)\b/i.test(combined)
    || /\b(residential|boende|bolig(?:sprinkler)?)\b/i.test(combined)
    || /\b(extended coverage|qrec|ec hsw|flat spray)\b/i.test(combined);
  const isWetAlarmValve = /\b(vat alarmventil|wet alarm valve|kontrollventilsett)\b/i.test(combined);

  const criteria = compact([
    categoryLabel(category, description),
    kFactor === null ? null : `K${formatNumber(kFactor)}`,
    dn === null ? null : `DN${formatNumber(dn)}`,
    temperatureC === null ? null : `${formatNumber(temperatureC)}°C`,
    responseResult.response === "quick" ? "Quick" : responseResult.response === "standard" ? "Standard" : null,
    orientationResult.orientation === "pendent" ? "Pendent" : orientationResult.orientation === "upright" ? "Upright" : orientationResult.orientation === "sidewall" ? "HSW" : null,
    concealed ? "Concealed" : null,
    finish ? finishSearchLabel(finish) : null,
    specialSearchTerm(combined)
  ]);

  const pdfReferenceCandidate = candidateFromPdfReference(
    description,
    criteria,
    ahlsellSearchUrl
  );

  const searchDescription = usefulDescription(description) && !isSprinklerAccessory
    ? description.replace(/\s+/g, " ").trim().slice(0, 110)
    : null;
  const plannedQueries = pdfReferenceCandidate
    ? [pdfReferenceCandidate.articleNumber]
    : buildCatalogQueries({
        category,
        description,
        combined,
        criteria,
        searchDescription,
        kFactor,
        dn,
        temperatureC,
        orientation: orientationResult.orientation,
        response: responseResult.response,
        finish,
        isSprinklerAccessory,
        isWetAlarmValve
      });
  const searchQueries = unique(plannedQueries).slice(0, 3);
  const searchQuery = searchQueries[0] ?? description;
  const warnings = compact([
    orientationResult.mixed
      ? "PDF-posten innehåller både stående och hängande sprinkler. Dela eller välj rätt variant manuellt."
      : null,
    responseResult.conflict
      ? "PDF-underlaget innehåller både standard- och quick-respons för samma post. Kontrollera originaltexten innan val."
      : null,
    category === "sprinkler_head" && kFactor !== null && dn !== null && dn === 15 && kFactor >= 115
      ? `K${formatNumber(kFactor)} tillsammans med DN15 avviker från de offentliga Ahlsell-familjer som hittades. Ingen artikel föreslås automatiskt.`
      : null,
    category === "sprinkler_head" && /\b(torrsprinkler|dry sprinkler)\b/i.test(combined) && dn !== null && dn !== 25
      ? "Ahlsells offentliga torrsprinklerfamiljer som hittades använder DN25. Kontrollera PDF-postens DN innan val."
      : null,
    category === "sprinkler_head" && !isSprinklerAccessory && [kFactor, dn, temperatureC].some((value) => value === null)
      ? "Ett eller flera huvudvärden (K-faktor, DN eller temperatur) saknas. Använd sökningen men välj inte produkt utan manuell kontroll."
      : null
  ]);

  const verifiedCandidates = !isNorwegianSource
    && category === "sprinkler_head"
    && !orientationResult.mixed
    && !responseResult.conflict
    && !concealed
    && !specialApplication
    && !isSprinklerAccessory
    && kFactor !== null
    && dn !== null
    && temperatureC !== null
    && orientationResult.orientation
    && responseResult.response
      ? sprinklerCandidates.filter((item) =>
          closeEnough(item.kFactor, kFactor)
          && item.dn === dn
          && closeEnough(item.temperatureC, temperatureC)
          && item.orientation === orientationResult.orientation
          && item.response === responseResult.response
          && (!finish || item.finish === finish)
        )
      : [];
  const directCandidates: AhlsellPublicCandidate[] = compact([
    pdfReferenceCandidate,
    ...verifiedCandidates
  ]);

  const searchUrl = new URL(ahlsellSearchUrl);
  searchUrl.searchParams.set("parameters.SearchPhrase", searchQuery || description);

  const recognitionNotes = compact([
    searchQueries.length > 1
      ? `Scipx provar ${searchQueries.length} Ahlsell-anpassade sökningar och slår ihop träffarna.`
      : null,
    category === "sprinkler_head" && !isSprinklerAccessory
      ? "Scipx kontrollerar Ahlsells exakta variantvärden för K-faktor, temperatur, respons och färg."
      : null,
    /\b(dren(?:erings)?kar|oppsamlingskar|utjevningskar|specialtilvirk)\b/.test(combined)
      ? "Posten verkar vara specialtillverkad. En katalogprodukt får bara väljas efter manuell kontroll eller offert."
      : null
  ]);

  return {
    searchQuery: searchQuery || description,
    searchQueries,
    searchUrl: searchUrl.toString(),
    criteria,
    warnings,
    recognitionNotes,
    directCandidates
  };
}

function buildCatalogQueries({
  category,
  description,
  combined,
  criteria,
  searchDescription,
  kFactor,
  dn,
  temperatureC,
  orientation,
  response,
  finish,
  isSprinklerAccessory,
  isWetAlarmValve
}: {
  category: string;
  description: string;
  combined: string;
  criteria: string[];
  searchDescription: string | null;
  kFactor: number | null;
  dn: number | null;
  temperatureC: number | null;
  orientation: Orientation | null;
  response: Response | null;
  finish: Finish | null;
  isSprinklerAccessory: boolean;
  isWetAlarmValve: boolean;
}) {
  if (isWetAlarmValve) return ["Sprinklersentral", dn ? `Sprinklersentral DN${dn}` : null];
  if (isSprinklerAccessory) return ["Sprinklergitter", "Gitter sprinklerhode"];

  if (/\b(maleinstrument|manometer|analog.*trykk|absolutt trykk.*direkte)\b/.test(combined)) {
    return ["Manometer sprinkler", "Manometer 0-16 bar"];
  }
  if (/\b(trykkvakt|pressostat|pressure switch)\b/.test(combined)) {
    return ["Pressostat vann", "PS10 pressostat"];
  }
  if (/\b(testarrangement|test og drener|testventil)\b/.test(combined)) {
    return ["Test og dreneringsventil sprinkler", "Sprinkler testventil"];
  }
  if (/\b(kuleventil|ball valve)\b/.test(combined)) {
    return [compact(["Kuleventil", dn ? `DN${dn}` : null, /\bpn\s*16\b/.test(combined) ? "PN16" : null]).join(" ")];
  }
  if (/\bbend\b/.test(combined) && /\b(flens|flanged)\b/.test(combined)) {
    return [
      compact(["Flensebend", dn ? `DN${dn}` : null, /\bpn\s*16\b/.test(combined) ? "PN16" : null]).join(" "),
      compact(["Bend flens", dn ? `DN${dn}` : null]).join(" ")
    ];
  }
  if (/\b(dren(?:erings)?kar|oppsamlingskar|utjevningskar|specialtilvirk)\b/.test(combined)) {
    return ["Dreneringskar sprinkler"];
  }

  if (category === "sprinkler_head" && kFactor !== null) {
    const responseCode = response === "standard" ? "SR" : response === "quick" ? "QR" : null;
    const orientationCode = orientation === "upright" ? "Opp" : orientation === "pendent" ? "Ned" : orientation === "sidewall" ? "HSW" : null;
    const dry = /\b(torrsprinkler|torrorssprinkler|dry sprinkler)\b/.test(combined) ? "Tørr" : null;
    const exact = compact(["Sprinkler", `K${formatNumber(kFactor)}`, responseCode, orientationCode, dry]).join(" ");
    const temperatureQuery = temperatureC === null
      ? null
      : compact(["Sprinklerhode", `K${formatNumber(kFactor)}`, responseCode, formatNumber(temperatureC)]).join(" ");
    const finishQuery = finish
      ? compact(["Sprinklerhode", `K${formatNumber(kFactor)}`, finishSearchLabel(finish)]).join(" ")
      : null;
    return [exact, temperatureQuery, finishQuery ?? `Sprinklerhode K${formatNumber(kFactor)}`];
  }

  return [conciseCatalogQuery(criteria, searchDescription ?? description)];
}

function candidate(
  articleNumber: string,
  productName: string,
  route: "quick-respons" | "standard-respons",
  kFactor: number,
  dn: number,
  temperatureC: number,
  orientation: Orientation,
  response: Response,
  finish: Finish,
  sin: string
): SprinklerCandidateDefinition {
  return {
    articleNumber,
    productName,
    manufacturer: "Reliable",
    productUrl: `https://www.ahlsell.se/products/varme--sanitet/sprinklersortiment-for-sprinklerkunder/sprinklerhuvud/${route}/${articleNumber}`,
    specifications: [`K${kFactor}`, `DN${dn}`, `${temperatureC}°C`, orientationLabel(orientation), responseLabel(response), finishLabel(finish), `SIN ${sin}`],
    source: "public_verified",
    verifiedAt: VERIFIED_AT,
    kFactor,
    dn,
    temperatureC,
    orientation,
    response,
    finish
  };
}

function candidateFromPdfReference(
  description: string,
  criteria: string[],
  ahlsellSearchUrl: string
): AhlsellPublicCandidate | null {
  const articleNumber = description.match(/\b(\d{6,8})\b/)?.[1];
  if (!articleNumber) return null;

  const productName = description
    .replace(new RegExp(`\\b${articleNumber}\\b`), "")
    .replace(/\s+/g, " ")
    .replace(/[,:;-]+$/g, "")
    .trim();
  const searchUrl = new URL(ahlsellSearchUrl);
  searchUrl.searchParams.set("parameters.SearchPhrase", articleNumber);

  return {
    articleNumber,
    productName: productName || `Produkt ${articleNumber}`,
    manufacturer: /\b(?:vic|victaulic)\b/i.test(description) ? "Victaulic" : "",
    productUrl: searchUrl.toString(),
    specifications: compact(["Artikelnummer angivet i PDF", ...criteria]),
    source: "pdf_reference"
  };
}

function isNorwegianTechnicalText(value: string) {
  return /\b(?:dimensjon|sprinkleranlegg|brannslokking|mengde|lokalisering|utførelse|overvåket|åpen|hengende|stående|beskyttelsesgitre?|føl(?:somhetsgrad)?)\b/i.test(value);
}

function normalizedAttributeMap(attributes: Record<string, unknown>) {
  const output = new Map<string, string>();
  for (const [key, value] of Object.entries(attributes)) {
    const cleanValue = text(value);
    if (cleanValue) output.set(normalize(key), cleanValue);
  }
  return output;
}

function firstAttribute(attributes: Map<string, string>, aliases: string[]) {
  for (const alias of aliases) {
    const normalizedAlias = normalize(alias);
    for (const [key, value] of attributes) {
      if (key === normalizedAlias || key.includes(normalizedAlias)) return value;
    }
  }
  return null;
}

function numberFromAttribute(attributes: Map<string, string>, aliases: string[]) {
  const raw = firstAttribute(attributes, aliases);
  return raw ? numberFromText(raw, /-?\d+(?:[.,]\d+)?/) : null;
}

function numberFromText(value: string, pattern: RegExp) {
  const match = value.match(pattern);
  const captured = match?.[1] ?? match?.[0];
  if (!captured) return null;
  const parsed = Number(captured.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function sprinklerOrientation(value: string): { orientation: Orientation | null; mixed: boolean } {
  const normalized = normalize(value);
  const hasUpright = /\b(staende|upright|ssu|oppover)\b/.test(normalized);
  const hasPendent = /\b(hengende|pendent|pendel|ssp|nedover)\b/.test(normalized);
  const hasSidewall = /\b(vegg|sidewall|hsw|horisontal)\b/.test(normalized);
  const orientations = compact<Orientation>([
    hasUpright ? "upright" : null,
    hasPendent ? "pendent" : null,
    hasSidewall ? "sidewall" : null
  ]);
  return { orientation: orientations.length === 1 ? orientations[0] : null, mixed: orientations.length > 1 };
}

function sprinklerResponse(attributeValue: string | null, sourceText: string) {
  const attribute = normalize(attributeValue ?? "");
  const source = normalize(sourceText);
  const attributeQuick = /\b(kvikk|quick|snabb)\b/.test(attribute);
  const attributeStandard = /\bstandard\b/.test(attribute);
  const sourceQuick = /\b(qr|kvikk|quick|snabb)\b/.test(source);
  const sourceStandard = /\bstandard(?: respons|-respons)?\b/.test(source);
  const conflict = (attributeQuick || sourceQuick) && (attributeStandard || sourceStandard);
  if (conflict) return { response: null as Response | null, conflict: true };
  if (attributeQuick || sourceQuick) return { response: "quick" as Response, conflict: false };
  if (attributeStandard || sourceStandard) return { response: "standard" as Response, conflict: false };
  return { response: null as Response | null, conflict: false };
}

function sprinklerFinish(value: string): Finish | null {
  const normalized = normalize(value);
  if (/\b(valgfritt|valfritt|optional)\b/.test(normalized)) return null;
  if (/\b(hvit|vit|white)\b|hvitlakk|vitlack/.test(normalized)) return "white";
  if (/\b(sort|svart|black)\b/.test(normalized)) return "black";
  if (/\b(krom|chrome)\b/.test(normalized)) return "chrome";
  if (/\b(messing|massing|brass)\b/.test(normalized)) return "brass";
  return null;
}

function categoryLabel(category: string, description: string) {
  if (/beskyttelsesgitter|beskyttelsesgitre|skyddskorg|sprinklerkorg/i.test(description)) return "Sprinkler skyddskorg";
  return ({
    sprinkler_head: "Sprinkler",
    pipe: "Sprinklerrör",
    fitting: "Sprinklerrördel",
    valve: "Sprinklerventil",
    support: "Rörupphängning sprinkler",
    control: "Sprinkler övervakning"
  } as Record<string, string>)[category] ?? "Sprinklerprodukt";
}

function specialSearchTerm(value: string) {
  if (/\b(torrsprinkler|dry sprinkler)\b/i.test(value)) return "Torrörsprinkler";
  if (/\b(residential|boende|bolig(?:sprinkler)?)\b/i.test(value)) return "Residential";
  if (/\b(extended coverage|qrec|ec hsw)\b/i.test(value)) return "Extended Coverage";
  if (/\bflat spray\b/i.test(value)) return "Flat Spray";
  return null;
}

function usefulDescription(description: string) {
  const normalized = normalize(description);
  return normalized.length >= 8 && !/^(sprinkler|sprinklerhode|teknisk produkt)$/.test(normalized);
}

function conciseCatalogQuery(criteria: string[], description: string | null) {
  // Ahlsell's public search becomes markedly less useful when a complete
  // procurement sentence is appended. Prefer normalized category and
  // dimensions (for example "Sprinklerventil DN100") and only fall back to
  // the source description when extraction produced no technical qualifier.
  if (criteria.length >= 2) return criteria.join(" ").slice(0, 160);
  return compact([...criteria, description]).join(" ").slice(0, 160);
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/å/g, "a")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9.,°]+/g, " ")
    .trim();
}

function closeEnough(left: number, right: number) {
  return Math.abs(left - right) < 0.05;
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : String(value).replace(".", ",");
}

function orientationLabel(value: Orientation) {
  return value === "pendent" ? "Pendent" : value === "upright" ? "Upright" : "HSW";
}

function responseLabel(value: Response) {
  return value === "quick" ? "Quick respons" : "Standard respons";
}

function finishLabel(value: Finish) {
  return ({ brass: "Mässing", white: "Vit", black: "Svart", chrome: "Krom" } as const)[value];
}

function finishSearchLabel(value: Finish) {
  return finishLabel(value);
}

function compact<T>(values: Array<T | null | undefined | false>): T[] {
  return values.filter((value): value is T => value !== null && value !== undefined && value !== false);
}

function unique(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => value?.replace(/\s+/g, " ").trim()).filter((value): value is string => Boolean(value)))];
}

function text(value: unknown) {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}
