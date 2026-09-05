import {
  parseSprinklerKFactor,
  projectRequirementDataWarnings,
  projectRequirementKFactorDisplayValue
} from "@/lib/project-requirement-data-warnings";
import { resolvedSprinklerOrientation } from "@/lib/sprinkler-orientation-lexicon";
import { findVictaulicSprinklerCandidates } from "@/lib/victaulic-sprinkler-catalog";
import {
  sprinklerCoverageFromText,
  sprinklerRequiresAccessoryReview
} from "@/lib/sprinkler-technical-rules";

export type AhlsellPublicCandidate = {
  articleNumber: string;
  productName: string;
  manufacturer: string;
  productUrl: string;
  description?: string;
  imageUrl?: string;
  specifications: string[];
  source: "public_verified" | "verified_database" | "structured_database" | "pdf_reference" | "catalog_search" | "confirmed_history";
  evidenceSources?: AhlsellCandidateEvidenceSource[];
  verifiedAt?: string;
  matchScore?: number;
  matchReasons?: string[];
  matchWarnings?: string[];
  recommendation?: "recommended" | "possible" | "unlikely";
  exactMatch?: boolean;
  familyCode?: string;
  variantCount?: number;
  learningEvidence?: {
    kind: "similar_confirmed";
    supportCount: number;
    similarityScore: number;
  };
  suggestedAccessories?: AhlsellAccessorySuggestion[];
};

export type AhlsellCandidateEvidenceSource =
  | "mldl_database"
  | "ahlsell_public"
  | "victaulic_verified"
  | "pdf_reference"
  | "confirmed_history";

export type AhlsellAccessorySuggestion = {
  articleNumber: string;
  productName: string;
  manufacturer: string;
  productUrl: string;
  quantity: number;
  unit: string;
  reason: string;
  required: boolean;
  compatibility: "compatible" | "review";
  source: "structured_database" | "catalog_search";
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
type SprinklerMount = "recessed" | "concealed";
type SprinklerSystem = "wet" | "dry";
type SprinklerHeadType = "standard" | "dry" | "open";
type AhlsellProductIntent =
  | "foam_extinguisher"
  | "portable_fire_extinguisher"
  | "sprinkler_head"
  | "sprinkler_guard"
  | "pipe"
  | "coupling"
  | "bend"
  | "tee"
  | "reducer"
  | "cap"
  | "branch"
  | "flange_adapter"
  | "wet_alarm_valve"
  | "dry_alarm_valve"
  | "check_valve"
  | "butterfly_valve"
  | "shutoff_valve"
  | "ball_valve"
  | "pressure_reducing_valve"
  | "manometer"
  | "pressure_switch"
  | "flow_switch"
  | "test_drain"
  | "pump"
  | "strainer"
  | "support"
  | "custom_fabrication"
  | "generic";

const PIPE_OUTSIDE_DIAMETER_BY_DN: Record<number, number> = {
  10: 17.2,
  15: 21.3,
  20: 26.9,
  25: 33.7,
  32: 42.4,
  40: 48.3,
  50: 60.3,
  65: 76.1,
  80: 88.9,
  100: 114.3,
  125: 139.7,
  150: 168.3,
  200: 219.1,
  250: 273,
  300: 323.9
};

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
  const rowSourceText = text(value.sourceText) ?? text(requirement.source_excerpt) ?? "";
  const attributeText = [...attributes].map(([key, attributeValue]) => `${key} ${attributeValue}`).join(" ");
  const primarySourceText = `${description} ${attributeText}`;
  const sourceLanguageText = `${primarySourceText} ${rowSourceText} ${technicalSpecification}`;
  const primaryCombined = normalize(primarySourceText);
  const combined = normalize(sourceLanguageText);
  const isNorwegianSource = isNorwegianTechnicalText(sourceLanguageText);
  const ahlsellSearchUrl = isNorwegianSource
    ? AHLSELL_NORWAY_SEARCH_URL
    : AHLSELL_SWEDEN_SEARCH_URL;
  const unit = normalize(text(value.unit) ?? "");
  const intent = detectAhlsellProductIntent(primaryCombined, combined, category, unit);
  const isSprinklerAccessory = intent === "sprinkler_guard";
  const dataWarnings = projectRequirementDataWarnings(requirement);

  const rawKFactor = parseSprinklerKFactor(projectRequirementKFactorDisplayValue(requirement))
    ?? numberFromAttribute(attributes, ["k faktor", "k factor", "k verdi", "k value"])
    ?? numberFromText(combined, /\bk\s*[-=]?\s*(\d+(?:[.,]\d+)?)/i);
  // Norwegian descriptions frequently write K-80. The hyphen is a separator,
  // not a negative hydraulic value.
  const kFactor = rawKFactor === null ? null : Math.abs(rawKFactor);
  const sprinklerModel = combined.match(/\bv\d{3,4}\b/i)?.[0]?.toUpperCase() ?? null;
  const explicitOutsideDiameters = outsideDiametersFromText(`${description} ${rowSourceText}`);
  const dnValues = uniqueNumbers([
    ...dnValuesFromText(description),
    ...dnValuesFromText(rowSourceText),
    ...dnValuesFromText(firstAttribute(attributes, ["gjengedimensjon dn", "dimension", "dimensjon", "dn"]) ?? "")
  ]);
  if (dnValues.length === 0) {
    const inferredDn = dnFromOutsideDiameter(explicitOutsideDiameters[0]);
    if (inferredDn !== null) dnValues.push(inferredDn);
  }
  const dn = dnValues[0]
    ?? numberFromAttribute(attributes, ["gjengedimensjon dn", "dimension", "dimensjon", "dn"])
    ?? numberFromText(combined, /\bdn\s*(\d{1,3})\b/i);
  const outsideDiameters = uniqueNumbers([
    ...explicitOutsideDiameters,
    ...dnValues.map((dimension) => PIPE_OUTSIDE_DIAMETER_BY_DN[dimension]).filter((value): value is number => value !== undefined)
  ]);
  const temperatureC = intent === "sprinkler_head"
    ? numberFromAttribute(attributes, ["utlosningstemperatur", "utløsningstemperatur", "temperature"])
      ?? numberFromText(combined, /(-?\d+(?:[.,]\d+)?)\s*(?:°\s*)?c\b/i)
    : null;
  const placement = firstAttribute(attributes, ["plassering", "placering", "orientation", "sprinklertype", "type"]);
  const deckPlate = firstAttribute(attributes, ["dekkskive", "pyntering", "rosett", "escutcheon", "cover plate"]);
  const responseText = firstAttribute(attributes, ["folsomhetsgrad", "respons", "response"]);
  const finishText = `${firstAttribute(attributes, ["overflatebehandling", "farge", "farg", "finish", "colour", "color"]) ?? ""} ${description}`;
  const sprinklerSystem = sprinklerSystemType(
    firstAttribute(attributes, ["sprinkleranlegg", "anleggstype", "systemtype", "sprinkler system"])
      ?? combined
  );
  const sprinklerHeadType = requiredSprinklerHeadType(
    firstAttribute(attributes, ["type sprinkler", "sprinklertype", "sprinkler type"])
      ?? combined
  );
  const sprinklerCoverage = sprinklerCoverageFromText(combined);
  const requiresAccessoryReview = sprinklerRequiresAccessoryReview(
    attributes,
    `${description} ${rowSourceText} ${technicalSpecification}`
  );
  const mount = sprinklerMount(placement, deckPlate);
  const orientationResult = sprinklerOrientation(`${placement ?? ""} ${description}`);
  const orientation = orientationResult.orientation
    ?? (mount !== null && /\b(tak|himling|ceiling)\b/.test(normalize(placement ?? "")) ? "pendent" : null);
  const responseResult = sprinklerResponse(responseText, technicalSpecification);
  const finish = sprinklerFinish(finishText);
  const specialApplication = sprinklerHeadType === "dry" || sprinklerHeadType === "open"
    || (sprinklerCoverage !== null && sprinklerCoverage !== "standard");
  const pn = numberFromAttribute(attributes, ["trykk", "arbeidstrykk", "trykklasse", "pressure"])
    ?? numberFromText(primaryCombined, /\bpn\s*(\d{1,3})\b/i);

  const criteria = compact([
    intentLabel(intent, category, description),
    sprinklerSystem === "wet" ? "Våtanlegg" : sprinklerSystem === "dry" ? "Tørranlegg" : null,
    sprinklerHeadType === "dry" ? "Tørrsprinkler" : sprinklerHeadType === "open" ? "Öppen sprinkler" : sprinklerHeadType === "standard" ? "Konventionell sprinkler" : null,
    kFactor === null ? null : `K${formatNumber(kFactor)}`,
    dn === null ? null : `DN${formatNumber(dn)}`,
    temperatureC === null ? null : `${formatNumber(temperatureC)}°C`,
    responseResult.response === "quick" ? "Quick" : responseResult.response === "standard" ? "Standard" : null,
    orientation === "pendent" ? "Pendent" : orientation === "upright" ? "Upright" : orientation === "sidewall" ? "HSW" : null,
    mount === "recessed" ? "Recessed" : mount === "concealed" ? "Concealed" : null,
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
        intent,
        description,
        combined,
        criteria,
        searchDescription,
        kFactor,
        dn,
        temperatureC,
        orientation,
        response: responseResult.response,
        finish,
        sprinklerHeadType,
        isSprinklerAccessory,
        outsideDiameters,
        pn
      });
  const searchQueries = unique(plannedQueries).slice(0, 3);
  const searchQuery = searchQueries[0] ?? description;
  const warnings = compact([
    ...dataWarnings.map((warning) => warning.message),
    orientationResult.mixed
      ? "PDF-posten innehåller både stående och hängande sprinkler. Dela eller välj rätt variant manuellt."
      : null,
    responseResult.conflict
      ? "PDF-underlaget innehåller både standard- och quick-respons för samma post. Kontrollera originaltexten innan val."
      : null,
    intent === "sprinkler_head" && kFactor !== null && dn !== null && dn === 15 && kFactor >= 115
      ? `K${formatNumber(kFactor)} tillsammans med DN15 avviker från de offentliga Ahlsell-familjer som hittades. Ingen artikel föreslås automatiskt.`
      : null,
    intent === "sprinkler_head" && sprinklerHeadType === "dry" && dn !== null && dn !== 25
      ? "Ahlsells offentliga torrsprinklerfamiljer som hittades använder DN25. Kontrollera PDF-postens DN innan val."
      : null,
    intent === "sprinkler_head" && sprinklerHeadType === "standard" && kFactor !== null && closeEnough(kFactor, 80) && dn === 25
      ? "PDF-posten anger konventionell K80 med DN25. Ahlsells konventionella K80-familj använder DN15; Scipx behandlar därför DN15 som ett korrigeringsförslag som måste bekräftas."
      : null,
    intent === "sprinkler_head" && sprinklerHeadType === null && kFactor !== null && closeEnough(kFactor, 80) && dn === 25
      ? "K80 och DN25 kräver kontroll av sprinklerhuvudets konstruktion: torrsprinkler kan vara DN25, medan konventionell K80 normalt är DN15."
      : null,
    intent === "sprinkler_head" && !isSprinklerAccessory && (
      sprinklerHeadType === "open"
        ? [kFactor, dn].some((value) => value === null)
        : [kFactor, dn, temperatureC].some((value) => value === null)
    )
      ? "Ett eller flera huvudvärden (K-faktor, DN eller temperatur) saknas. Använd sökningen men välj inte produkt utan manuell kontroll."
      : null
  ]);

  const reliableCandidates = !isNorwegianSource
    && dataWarnings.length === 0
    && intent === "sprinkler_head"
    && !orientationResult.mixed
    && !responseResult.conflict
    && mount === null
    && !specialApplication
    && !isSprinklerAccessory
    && kFactor !== null
    && dn !== null
    && temperatureC !== null
    && orientation
    && responseResult.response
      ? sprinklerCandidates.filter((item) =>
          closeEnough(item.kFactor, kFactor)
          && item.dn === dn
          && closeEnough(item.temperatureC, temperatureC)
          && item.orientation === orientation
          && item.response === responseResult.response
          && (!finish || item.finish === finish)
        )
      : [];
  const victaulicCandidates = isNorwegianSource
    && dataWarnings.length === 0
    && intent === "sprinkler_head"
    && !orientationResult.mixed
    && !responseResult.conflict
    && !isSprinklerAccessory
      ? findVictaulicSprinklerCandidates({
          market: isNorwegianSource ? "no" : "se",
          model: sprinklerModel,
          kFactor,
          dn,
          temperatureC,
          orientation,
          response: responseResult.response,
          finish,
          mount,
          sprinklerSystem,
          sprinklerHeadType,
          coverage: sprinklerCoverage,
          requiresAccessoryReview
        })
      : [];
  const directCandidates: AhlsellPublicCandidate[] = dataWarnings.length > 0
    ? []
    : compact([
         pdfReferenceCandidate,
        ...victaulicCandidates,
        ...reliableCandidates
      ]);

  const searchUrl = new URL(ahlsellSearchUrl);
  searchUrl.searchParams.set("parameters.SearchPhrase", searchQuery || description);

  const recognitionNotes = compact([
    searchQueries.length > 1
      ? `Scipx provar ${searchQueries.length} Ahlsell-anpassade sökningar och slår ihop träffarna.`
      : null,
    intent === "sprinkler_head" && !isSprinklerAccessory
      ? "Scipx kontrollerar den verifierade Victaulic-databasen samt Ahlsells variantvärden för K-faktor, DN, temperatur, respons, riktning, montage, systemvillkor och färg."
      : null,
    intent === "sprinkler_head" && sprinklerSystem && sprinklerHeadType
      ? `Scipx skiljer på anläggningstyp (${sprinklerSystem === "wet" ? "Våtanlegg" : "Tørranlegg"}) och sprinklerhuvudets konstruktion (${sprinklerHeadType === "dry" ? "Tørrsprinkler" : sprinklerHeadType === "open" ? "öppen sprinkler" : "konventionell sprinkler"}).`
      : null,
    intent === "sprinkler_head" && mount === "recessed" && /\bkonvensjonell\b/.test(primaryCombined)
      ? "Infällt takmontage behandlas som ett pendentkrav; den generella typetiketten konvensjonell får inte ensam styra produktvalet."
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
  intent,
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
  sprinklerHeadType,
  isSprinklerAccessory,
  outsideDiameters,
  pn
}: {
  category: string;
  intent: AhlsellProductIntent;
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
  sprinklerHeadType: SprinklerHeadType | null;
  isSprinklerAccessory: boolean;
  outsideDiameters: number[];
  pn: number | null;
}) {
  const dnTerm = dn === null ? null : `DN${formatNumber(dn)}`;
  const outsideDiameterTerm = outsideDiameters[0] === undefined
    ? null
    : `${formatCatalogDecimal(outsideDiameters[0])}mm`;
  const outsideDiameterPair = outsideDiameters.slice(0, 2)
    .map((value) => `${formatCatalogDecimal(value)}mm`)
    .join(" ");
  const pressureTerm = pn === null ? null : `PN${formatNumber(pn)}`;

  if (intent === "wet_alarm_valve") return ["Sprinklersentral", compact(["Sprinklersentral våt", dnTerm]).join(" ")];
  if (intent === "dry_alarm_valve") return ["Sprinklersentral", compact(["Sprinklersentral tørr", dnTerm]).join(" ")];
  if (intent === "foam_extinguisher") {
    const liters = combined.match(/\b(\d+(?:[.,]\d+)?)\s*liter\b/)?.[1];
    return [compact(["Skumslukker", liters ? `${liters} liter` : null]).join(" "), "Brannslukker skum"];
  }
  if (intent === "portable_fire_extinguisher") return ["Brannslukker", "Håndslukker"];
  if (isSprinklerAccessory) return ["Sprinklergitter", "Gitter sprinklerhode"];

  if (intent === "pressure_switch") {
    return ["Pressostat", "Pressostat vann", "PS10 pressostat"];
  }
  if (intent === "flow_switch") {
    return ["Strømningsvakt", "Flow switch sprinkler"];
  }
  if (intent === "manometer") {
    return ["Manometer sprinkler", "Manometer 0-16 bar"];
  }
  if (intent === "test_drain") {
    return ["Test og dreneringsventil sprinkler", "Sprinkler testventil"];
  }
  if (intent === "ball_valve") {
    return [compact(["Kuleventil", dnTerm, pressureTerm]).join(" "), compact(["Kuleventil", dnTerm]).join(" ")];
  }
  if (intent === "butterfly_valve") {
    return ["Spjeldventil sprinkler", compact(["Spjeldventil", dnTerm]).join(" "), "Spjeldventil rillede tilkoblinger"];
  }
  if (intent === "check_valve") {
    return [compact(["Tilbakeslagsventil rillet", dnTerm]).join(" "), compact(["Tilbakeslagsventil", dnTerm]).join(" "), "Tilbakeslagsventil rillet"];
  }
  if (intent === "pressure_reducing_valve") {
    return [compact(["Trykkreduksjonsventil", dnTerm]).join(" "), "Trykkreduksjonsventil"];
  }
  if (intent === "shutoff_valve") {
    return ["Sprinklerventil", compact(["Sprinklerventil", dnTerm]).join(" ")];
  }
  if (intent === "flange_adapter") {
    return [compact(["Flensadapter rillet", outsideDiameterTerm]).join(" "), compact(["Flenseadapter", dnTerm]).join(" ")];
  }
  if (intent === "bend" && /\b(flens|flanged)\b/.test(combined)) {
    return [
      compact(["Flensebend", dnTerm, pressureTerm]).join(" "),
      compact(["Bend flens", dnTerm]).join(" ")
    ];
  }
  if (intent === "pipe") {
    return [
      compact(["Rør sprinkler", outsideDiameterTerm]).join(" "),
      compact(["Rillede rør", outsideDiameterTerm]).join(" "),
      compact(["Stålrør sprinkler", dnTerm]).join(" ")
    ];
  }
  if (intent === "coupling") {
    return [
      compact(["Kupling sprinkler", outsideDiameterTerm]).join(" "),
      compact(["Kupling fast", outsideDiameterTerm]).join(" "),
      compact(["Kupling", outsideDiameterTerm]).join(" ")
    ];
  }
  if (intent === "bend") {
    return [
      compact(["Bend rillet", outsideDiameterTerm]).join(" "),
      compact(["Rillede bend", outsideDiameterTerm]).join(" "),
      compact(["Bend sprinkler", dnTerm]).join(" ")
    ];
  }
  if (intent === "tee") {
    return [
      compact(["T-rør rillet", outsideDiameterTerm]).join(" "),
      compact(["Rillede T-rør", outsideDiameterTerm]).join(" "),
      compact(["T-rør sprinkler", dnTerm]).join(" ")
    ];
  }
  if (intent === "reducer") {
    return [
      compact(["Reduksjon rillet", outsideDiameterPair || outsideDiameterTerm]).join(" "),
      compact(["Reduksjonskupling", outsideDiameterPair || outsideDiameterTerm]).join(" "),
      compact(["T-rør reduksjon rillet", outsideDiameterTerm]).join(" ")
    ];
  }
  if (intent === "cap") {
    return [compact(["Endelokk", outsideDiameterTerm]).join(" "), compact(["Endelokk rillet", dnTerm]).join(" ")];
  }
  if (intent === "branch") {
    return [compact(["Anboringsklammer", outsideDiameterTerm]).join(" "), compact(["Utløpskupling", dnTerm]).join(" ")];
  }
  if (intent === "pump") {
    return ["Lensepumpe", "Pumpe avløpsvann", "Sprinklerpumpe"];
  }
  if (intent === "strainer") {
    return [compact(["Sil", dnTerm]).join(" "), compact(["Grovfilter", dnTerm]).join(" "), compact(["Filter", dnTerm]).join(" ")];
  }
  if (intent === "support") {
    return [compact(["Røroppheng", dnTerm]).join(" "), "Rørklammer sprinkler"];
  }
  if (intent === "custom_fabrication") {
    return ["Dreneringskar sprinkler"];
  }

  if (intent === "sprinkler_head" && kFactor !== null) {
    const responseCode = response === "standard" ? "SR" : response === "quick" ? "QR" : null;
    const orientationCode = orientation === "upright" ? "Opp" : orientation === "pendent" ? "Ned" : orientation === "sidewall" ? "HSW" : null;
    const headTypeTerm = sprinklerHeadType === "dry" ? "Tørr" : sprinklerHeadType === "open" ? "Åpen" : null;
    const exact = compact(["Sprinkler", `K${formatNumber(kFactor)}`, responseCode, orientationCode, headTypeTerm]).join(" ");
    const temperatureQuery = temperatureC === null
      ? null
      : compact(["Sprinklerhode", `K${formatNumber(kFactor)}`, responseCode, formatNumber(temperatureC)]).join(" ");
    const finishQuery = finish
      ? compact(["Sprinklerhode", `K${formatNumber(kFactor)}`, finishSearchLabel(finish)]).join(" ")
      : null;
    if (sprinklerHeadType === "open") {
      return [`Åpen sprinkler K${formatNumber(kFactor)}`, exact, `Window sprinkler K${formatNumber(kFactor)}`];
    }
    return [`Sprinklerhode K${formatNumber(kFactor)}`, exact, temperatureQuery ?? finishQuery];
  }

  if (category === "fitting") {
    return [
      compact(["Kupling sprinkler", outsideDiameterTerm]).join(" "),
      compact(["Rilledeler sprinkler", outsideDiameterTerm]).join(" "),
      conciseCatalogQuery(criteria, searchDescription ?? description)
    ];
  }
  if (category === "valve") {
    return ["Sprinklerventil", compact(["Sprinklerventil", dnTerm]).join(" ")];
  }
  if (category === "control") {
    return ["Sprinkler overvåkning", compact(["Sprinkler alarm", dnTerm]).join(" ")];
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
    exactMatch: true,
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
    specifications: compact(["NRF-nummer angivet i PDF", ...criteria]),
    source: "pdf_reference"
  };
}

function isNorwegianTechnicalText(value: string) {
  return /\b(?:dimensjon|sprinkleranlegg|brannslokking|mengde|lokalisering|utførelse|overvåket|åpen|hengende|stående|beskyttelsesgitre?|føl(?:somhetsgrad)?|rør|kupling|ventil|trykk|skjøt|montering)\b/i.test(value);
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
  return resolvedSprinklerOrientation(value);
}

function sprinklerMount(placement: string | null, deckPlate: string | null): SprinklerMount | null {
  const normalizedPlacement = normalize(placement ?? "");
  if (/\b(skjult|concealed|dold)\b/.test(normalizedPlacement)) return "concealed";
  const normalizedDeckPlate = normalize(deckPlate ?? "");
  const affirmativeDeckPlate = /\b(ja|yes|true|inkludert|required)\b/.test(normalizedDeckPlate)
    && !/\b(nei|no|false)\b/.test(normalizedDeckPlate);
  if (/\b(innfelt|infalld|recessed)\b/.test(normalizedPlacement) || affirmativeDeckPlate) return "recessed";
  return null;
}

function sprinklerResponse(attributeValue: string | null, sourceText: string) {
  const attribute = normalize(attributeValue ?? "");
  const source = normalize(sourceText);
  const explicitQuick = /\b(?:qr|(?:kvikk|hurtig|snabb)\s*respons|quick(?:\s*response)?|(?:respons|response|folsomhetsgrad)\s*(?:quick|kvikk|hurtig|snabb))\b/;
  const explicitStandard = /\b(?:sr|(?:standard|normal)\s*(?:respons|response)|(?:respons|response|folsomhetsgrad)\s*(?:standard|normal))\b/;
  const attributeQuick = explicitQuick.test(attribute) || /\b(?:kvikk|hurtig|quick|snabb|qr)\b/.test(attribute);
  const attributeStandard = explicitStandard.test(attribute) || /\b(?:standard|normal|sr)\b/.test(attribute);
  const sourceQuick = explicitQuick.test(source);
  const sourceStandard = explicitStandard.test(source);
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
  if (/h[åa]ndsl[ou]kker|brannsl[ou]kker|slokkemiddel\s*:\s*skum/i.test(description)) {
    return /skum/i.test(description) ? "Skumsläckare" : "Handbrandsläckare";
  }
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

function intentLabel(intent: AhlsellProductIntent, category: string, description: string) {
  const label = ({
    foam_extinguisher: "Skumsläckare",
    portable_fire_extinguisher: "Handbrandsläckare",
    sprinkler_head: "Sprinkler",
    sprinkler_guard: "Sprinkler skyddskorg",
    pipe: "Sprinklerrör",
    coupling: "Rillkoppling",
    bend: "Rörböj",
    tee: "T-rör",
    reducer: "Rörreduktion",
    cap: "Ändlock",
    branch: "Avstick",
    flange_adapter: "Flänsadapter",
    wet_alarm_valve: "Våt sprinklersentral",
    dry_alarm_valve: "Torr sprinklersentral",
    check_valve: "Backventil",
    butterfly_valve: "Spjällventil",
    shutoff_valve: "Avstängningsventil",
    ball_valve: "Kulventil",
    pressure_reducing_valve: "Tryckreduceringsventil",
    manometer: "Manometer",
    pressure_switch: "Tryckvakt",
    flow_switch: "Flödesvakt",
    test_drain: "Test- och dräneringsventil",
    pump: "Pump",
    strainer: "Sil/filter",
    support: "Rörupphängning",
    custom_fabrication: "Specialtillverkad produkt"
  } as Partial<Record<AhlsellProductIntent, string>>)[intent];
  return label ?? categoryLabel(category, description);
}

function detectAhlsellProductIntent(
  primaryText: string,
  combinedText: string,
  category: string,
  unit: string
): AhlsellProductIntent {
  const source = primaryText || combinedText;
  // Product family must come from the row heading or its structured attributes.
  // Parent prose often mentions several sibling products and must not turn a
  // pipe row into, for example, a valve or an end cap.
  const has = (pattern: RegExp) => pattern.test(source);

  if (has(/\b(handslokker|handslukker|handslokkeapparat|brannslokker|brannslukker)\b/)) {
    return has(/\bskum\b|\bfoam\b/) ? "foam_extinguisher" : "portable_fire_extinguisher";
  }
  if (has(/\b(beskyttelsesgitter|beskyttelsesgitre|skyddskorg|sprinklerkorg)\b/)) return "sprinkler_guard";
  if (has(/\b(pumpe innendors|sprinklerpumpe|lensepumpe|type pumpe|pumpedrift)\b/)) return "pump";
  if (has(/\b(partikkelutskiller|grovfilter|y filter|sil netting|type partikkelutskiller)\b/)) return "strainer";
  if (has(/\b(torr.*(?:alarmventil|sprinklersentral)|dry (?:alarm )?valve|d769n)\b/)) return "dry_alarm_valve";
  if (has(/\b(vat alarmventil|wet alarm valve|kontrollventilsett)\b/)) return "wet_alarm_valve";
  if (has(/\b(trykkreduksjonsventil|pressure reducing valve|reduksjonsventil)\b/)) return "pressure_reducing_valve";
  if (has(/\b(tilbakeslagsventil|backventil|check valve)\b/)) return "check_valve";
  if (has(/\b(dreiespjeldventil|spjeldventil|butterfly valve)\b/)) return "butterfly_valve";
  if (has(/\b(kuleventil|ball valve)\b/)) return "ball_valve";
  if (has(/\b(stengeventil|sluseventil|gate valve|sprinklerventil)\b/)) return "shutoff_valve";
  if (has(/\b(trykkvakt|trykkbryter|pressostat|pressure switch)\b/)) return "pressure_switch";
  if (has(/\b(stromningsvakt|flow switch)\b/)) return "flow_switch";
  if (has(/\b(maleinstrument|manometer|analog.*trykk|absolutt trykk.*direkte|maling av absolutt trykk|direkte maling|avlesning analog)\b/)) return "manometer";
  if (has(/\b(testarrangement|test og drener|testventil)\b/)) return "test_drain";
  if (category === "valve") return "shutoff_valve";
  if (has(/\b(overgang fra pe til stal|flens pa pe rille|flensadapter|flenseadapter)\b/)) return "flange_adapter";
  if (has(/\b(blindflens|endelokk|endebunn|plugg)\b/)) return "cap";
  if (has(/\b(anboringsklammer|anborring|avstikk|utlopskupling)\b/)) return "branch";
  if (has(/\b(dimensjonsovergang|reduksjonskupling|reduksjon|reducer)\b/)) return "reducer";
  if (has(/\b(t ror|t klave|tee)\b/)) return "tee";
  if (has(/\b(bend|rorboy|elbow)\b/)) return "bend";
  if (has(/\b(kupling|rillekobling|hurtigrillekobling|coupling)\b/)) return "coupling";
  if (has(/\b(dren(?:erings)?kar|oppsamlingskar|utjevningskar|specialtilvirk)\b/)) return "custom_fabrication";
  if (category === "sprinkler_head" || has(/\bsprinkler head\b|\bk faktor\b|\butlosningstemperatur\b/)) return "sprinkler_head";
  if (category === "pipe" || (unit === "m" && !has(/\b(oppheng|isolasjon|kanal|kabel|groft)\b/))) return "pipe";
  if (category === "support" || has(/\b(oppheng|rorstotte|support|rorbarer|klammer)\b/)) return "support";
  return "generic";
}

function dnValuesFromText(value: string) {
  const dimensions: number[] = [];
  for (const match of value.matchAll(/\bdn\s*(\d{1,3})(?:\s*[\/-]\s*(?:dn\s*)?(\d{1,3}))?/gi)) {
    dimensions.push(Number(match[1]));
    if (match[2]) dimensions.push(Number(match[2]));
  }
  return uniqueNumbers(dimensions);
}

function outsideDiametersFromText(value: string) {
  const dimensions: number[] = [];
  const normalized = normalize(value);
  for (const match of normalized.matchAll(/\b(?:ytre|utvendig|outside)\s*(?:ror)?\s*diameter\s*[=:]?\s*(\d+(?:[.,]\d+)?)/g)) {
    dimensions.push(Number(match[1].replace(",", ".")));
  }
  return uniqueNumbers(dimensions);
}

function dnFromOutsideDiameter(outsideDiameter: number | undefined) {
  if (outsideDiameter === undefined) return null;
  const match = Object.entries(PIPE_OUTSIDE_DIAMETER_BY_DN).find(([, diameter]) => closeEnough(diameter, outsideDiameter));
  return match ? Number(match[0]) : null;
}

function uniqueNumbers(values: Array<number | null | undefined>) {
  return [...new Set(values.filter((value): value is number => typeof value === "number" && Number.isFinite(value)))];
}

function specialSearchTerm(value: string) {
  if (/\b(torrsprinkler|dry sprinkler)\b/i.test(value)) return "Torrörsprinkler";
  if (/\b(residential|boende|bolig(?:sprinkler)?)\b/i.test(value)) return "Residential";
  if (/\b(extended coverage|qrec|ec hsw)\b/i.test(value)) return "Extended Coverage";
  if (/\bflat spray\b/i.test(value)) return "Flat Spray";
  return null;
}

function sprinklerSystemType(value: string): SprinklerSystem | null {
  const normalized = normalize(value);
  if (/\b(torranlegg|torrt anlegg|dry pipe system|dry system)\b/.test(normalized)) return "dry";
  if (/\b(vatanlegg|vatt anlegg|wet pipe system|wet system)\b/.test(normalized)) return "wet";
  return null;
}

function requiredSprinklerHeadType(value: string): SprinklerHeadType | null {
  const normalized = normalize(value);
  if (/\b(torrsprinkler|torrorssprinkler|dry sprinkler|dry type sprinkler)\b/.test(normalized)) return "dry";
  if (/\b(window sprinkler|vindussprinkler|vindu sprinkler|apen sprinkler|open sprinkler|uten termisk element)\b/.test(normalized)) return "open";
  if (/\b(konvensjonell|konventionell|conventional|spraysprinkler|standard spray|utvidet dekning|extended coverage)\b/.test(normalized)) return "standard";
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

function formatCatalogDecimal(value: number) {
  return String(value);
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
