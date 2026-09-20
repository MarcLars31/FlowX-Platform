import {
  parseSprinklerKFactor,
  projectRequirementDataWarnings,
  projectRequirementKFactorDisplayValue
} from "@/lib/project-requirement-data-warnings";
import { resolvedSprinklerOrientation } from "@/lib/sprinkler-orientation-lexicon";
import { findVictaulicSprinklerCandidates } from "@/lib/victaulic-sprinkler-catalog";
import {
  sprinklerCoverageFromText,
  isSprinklerAccessoryReviewWarning,
  sprinklerAccessoryNotices,
  sprinklerExplicitlyExcludesCoverPlate,
  sprinklerInstallationRequirements,
  sprinklerNeedsHydraulicReview,
  sprinklerRequiresAccessoryReview,
  sprinklerResponse
} from "@/lib/sprinkler-technical-rules";
import { ahlsellRequirementIntent, type AhlsellProductIntent } from "./ahlsell-requirement-intent";
import { isCompletePipeLengthDescription, ns3420ProductFamily } from "./ns3420-product-classification";
import { productRequirementAttributes, productTechnicalSpecification, valveMonitoringRequirement } from "./ahlsell-requirement-context";
import { engineeringRequirementWarnings } from "./ahlsell-engineering-checks";
import { withVerifiedWorkingPressure } from "./victaulic-working-pressure";
import { withTechnicalConflictAssessment } from "./ahlsell-technical-conflicts";
import { ahlsellMldlProduct } from "./ahlsell-mldl-catalog";
import { manifoldCabinetRequirementGuide } from "./ahlsell-manifold-cabinet";
import { pipeJointTypes, pipeJointSearchTerm, requirementJointText, stainlessSteelGrade, type PipeJoint } from "./pipe-technical-terms";
import { requirementExtractionWarnings } from "./requirement-extraction-warnings";
import { pipeRequirementDimensions, pipeRequirementLimits } from './pipe-matching-evidence';
import type { AhlsellTechnicalEvidence } from "./ahlsell-technical-evidence";

export type AhlsellPublicCandidate = {
  articleNumber: string;
  productName: string;
  manufacturer: string;
  productUrl: string;
  description?: string;
  imageUrl?: string;
  specifications: string[];
  technicalEvidence?: AhlsellTechnicalEvidence;
  source: "public_verified" | "verified_database" | "structured_database" | "pdf_reference" | "catalog_search" | "confirmed_history";
  evidenceSources?: AhlsellCandidateEvidenceSource[];
  verifiedAt?: string;
  matchScore?: number;
  matchReasons?: string[];
  matchWarnings?: string[];
  recommendation?: "recommended" | "possible" | "unlikely";
  exactMatch?: boolean;
  requiresProductSelection?: boolean;
  requiresAccessoryReview?: boolean;
  familyCode?: string;
  variantCount?: number;
  learningEvidence?: {
    kind: "similar_confirmed";
    supportCount: number;
    similarityScore: number;
  };
  assortmentPriority?: number;
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
  interpretationNotes?: string[];
  interpretationWarnings?: string[];
  accessoryRequirements?: string[];
};

type Orientation = "pendent" | "upright" | "sidewall";
type Response = "quick" | "standard";
type Finish = "brass" | "white" | "black" | "chrome";
type SprinklerSystem = "wet" | "dry";
type SprinklerHeadType = "standard" | "dry" | "open";
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
  const attributes = normalizedAttributeMap(productRequirementAttributes(requirement));
  const category = text(requirement.category) ?? text(requirement.requirement_key) ?? "unknown";
  const description = text(requirement.value_text) ?? text(requirement.display_name) ?? "Teknisk produkt";
  const technicalSpecification = productTechnicalSpecification(requirement);
  const rowSourceText = text(value.sourceText) ?? text(requirement.source_excerpt) ?? "";
  const attributeText = [...attributes].map(([key, attributeValue]) => `${key} ${attributeValue}`).join(" ");
  const primarySourceText = `${description} ${attributeText}`;
  const sourceLanguageText = `${primarySourceText} ${rowSourceText} ${technicalSpecification}`;
  const primaryCombined = normalize(primarySourceText);
  const combined = normalize(sourceLanguageText);
  const isNorwegianSource = isNorwegianTechnicalText(`${sourceLanguageText} ${[...normalizedAttributeMap(record(value.attributes))].map(([key, item]) => `${key} ${item}`).join(" ")}`);
  const ahlsellSearchUrl = isNorwegianSource
    ? AHLSELL_NORWAY_SEARCH_URL
    : AHLSELL_SWEDEN_SEARCH_URL;
  const intent = ahlsellRequirementIntent(requirement);
  const nsCode = text(value.nsCode) ?? text(requirement.requirement_key);
  const nsCodeIntent = ns3420ProductFamily(nsCode, description);
  const isSprinklerAccessory = intent === "sprinkler_guard";
  const dataWarnings = projectRequirementDataWarnings(requirement);

  // Cabinet dimensions and supply dimensions belong to different components.
  // Do not turn them (or legacy neighbouring sprinkler text) into a pipe DN.
  if (intent === "manifold_cabinet") {
    return manifoldCabinetRequirementGuide(attributes, dataWarnings.map(warning => warning.message), ahlsellSearchUrl);
  }

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
  const pipeDimensions = intent === 'pipe' ? pipeRequirementDimensions(requirement) : null;
  const pipeLimits = pipeRequirementLimits(requirement);
  const dn = intent === "alarm_device" ? null : pipeDimensions ? pipeDimensions.dn : dnValues[0]
    ?? numberFromAttribute(attributes, ["gjengedimensjon dn", "dimension", "dimensjon", "dn"])
    ?? numberFromText(combined, /\bdn\s*(\d{1,3})\b/i);
  const outsideDiameters = pipeDimensions ? uniqueNumbers([pipeDimensions.outsideDiameter,
    pipeDimensions.dn === null ? null : PIPE_OUTSIDE_DIAMETER_BY_DN[pipeDimensions.dn]]) : uniqueNumbers([
    ...explicitOutsideDiameters,
    ...uniqueNumbers([...dnValues, dn]).map((dimension) => PIPE_OUTSIDE_DIAMETER_BY_DN[dimension]).filter((value): value is number => value !== undefined)
  ]);
  const temperatureC = intent === "sprinkler_head"
    ? numberFromAttribute(attributes, ["utlosningstemperatur", "utløsningstemperatur", "temperature"])
      ?? numberFromText(combined, /(-?\d+(?:[.,]\d+)?)\s*(?:°\s*)?c\b/i)
    : null;
  const placement = firstAttribute(attributes, ["plassering", "placering", "orientation", "sprinklertype", "type"]);
  const deckPlate = firstAttribute(attributes, ["dekkskive", "pyntering", "rosett", "escutcheon", "cover plate"]);
  const responseText = firstAttribute(attributes, ["folsomhetsgrad", "respons", "response"]);
  const finishAttribute = firstAttribute(attributes, ["overflatebehandling", "farge", "farg", "finish", "colour", "color"]);
  const finishText = `${finishAttribute ?? ""} ${description}`;
  const sprinklerSystem = sprinklerSystemType(
    firstAttribute(attributes, ["sprinkleranlegg", "anleggstype", "systemtype", "sprinkler system"])
      ?? combined
  );
  const sprinklerHeadType = requiredSprinklerHeadType(
    firstAttribute(attributes, ["type sprinkler", "sprinklertype", "sprinkler type"])
      ?? combined
  );
  const sprinklerCoverage = sprinklerCoverageFromText(combined);
  const requiresSupervisedOpenValve = ["butterfly_valve", "shutoff_valve", "ball_valve"].includes(intent)
    && valveMonitoringRequirement(primarySourceText) === "required";
  const requiresHandwheelValve = intent === "butterfly_valve"
    && /\b(manuell med ratt|med ratt|handratt|handwheel|gear operated|girbetjent)\b/.test(primaryCombined);
  const requiresSoftClosingValve = intent === "butterfly_valve"
    && /\b(myk stenging|mjuk stangning|soft clos|slow clos)\b/.test(primaryCombined);
  const requiresAccessoryReview = sprinklerRequiresAccessoryReview(
    attributes,
    `${description} ${rowSourceText} ${technicalSpecification}`
  );
  const installation = sprinklerInstallationRequirements(record(value.attributes), `${description}\n${rowSourceText}`);
  const mount = installation.mount;
  const visibleMount = /\b(synlig|visible|eksponert)\b/.test(normalize(placement ?? ""))
    || installation.exposed
    || sprinklerExplicitlyExcludesCoverPlate(deckPlate);
  const orientationResult = intent === "sprinkler_head"
    ? sprinklerOrientation(`${placement ?? ""} ${description}`)
    : { orientation: null, mixed: false };
  const orientation = orientationResult.orientation
    ?? (!orientationResult.mixed && mount !== null && /\b(tak|himling|ceiling)\b/.test(normalize(placement ?? "")) ? "pendent" : null);
  const responseResult = sprinklerResponse(responseText, technicalSpecification);
  // Unspecified sprinkler finishes use the catalogue's standard brass variant.
  // An explicit colour or finish in the PDF always takes precedence.
  const finish = sprinklerFinish(finishText)
    ?? (intent === "sprinkler_head" && !/\b(valgfritt|valfritt|optional)\b/.test(normalize(finishAttribute ?? "")) ? "brass" : null);
  const specialApplication = sprinklerHeadType === "dry" || sprinklerHeadType === "open"
    || (sprinklerCoverage !== null && sprinklerCoverage !== "standard");
  const pressureAttributes = new Map([...attributes].filter(([key]) => !/\bpma\b|tillatte driftstrykk/.test(key)));
  const pn = numberFromAttribute(pressureAttributes, ["trykk", "arbeidstrykk", "trykklasse", "pressure"])
    ?? numberFromText(primaryCombined, /\bpn\s*(\d{1,3})\b/i);

  const criteria = compact([
    intentLabel(intent, category, description),
    intent === "pipe" && isCompletePipeLengthDescription(description) ? "Komplett med rördelar och upphängning" : null,
    intent === "pipe" ? firstAttribute(attributes, ["materiale", "material"]) : null,
    intent === "pipe" && /\bral\s*9010\b/.test(combined) ? "Vit målning RAL 9010" : null,
    intent === "flow_meter" ? firstAttribute(attributes, ["maleomrade", "matomrade"]) : null,
    intent === "shutoff_valve" && valveMonitoringRequirement(primarySourceText) === "none" ? "Utan övervakning" : null,
    intent === "toilet" && /\belektrisk\s+(?:hoydejustering|hojdjustering|hev\s+senk)\b/.test(combined) ? "Elektrisk höjdjustering" : null,
    requiresSupervisedOpenValve ? "Övervakad öppen" : null,
    requiresHandwheelValve ? "Manuell med handratt" : null,
    requiresSoftClosingValve ? "Mjuk stängning" : null,
    sprinklerSystem === "wet" ? "Våtanlegg" : sprinklerSystem === "dry" ? "Tørranlegg" : null,
    sprinklerHeadType === "dry" ? "Tørrsprinkler" : sprinklerHeadType === "open" ? "Öppen sprinkler" : sprinklerHeadType === "standard" ? "Konventionell sprinkler" : null,
    kFactor === null ? null : `K${formatNumber(kFactor)}`,
    dn === null ? null : `DN${formatNumber(dn)}`,
    intent === 'pipe' && pipeDimensions?.outsideDiameter !== null && pipeDimensions?.outsideDiameter !== undefined ? `Ytterdiameter ${formatNumber(pipeDimensions.outsideDiameter)} mm` : null,
    intent === 'pipe' && pipeLimits.sdr !== null ? `SDR${pipeLimits.sdr}` : null,
    intent === 'pipe' && pipeLimits.pma !== null ? `PMA ${pipeLimits.pma} bar` : null,
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
        pn,
        sdr: pipeLimits.sdr,
        pipeJoints: pipeJointTypes(requirementJointText(Object.fromEntries(attributes), description)),
        pipeMaterial: normalize(firstAttribute(attributes, ["materiale", "material", "materialkvalitet"]) ?? description),
        materialGrade: stainlessSteelGrade(firstAttribute(attributes, ["materialkvalitet", "materiale"]) ?? "")
      });
  const comment = String(record(value.attributes)["pdf-kommentar"] ?? "");
  // Comments are unverified search hints, never substitutions for the PDF's
  // dimensions, materials or technical requirements. Keep a family query too.
  const commentArticle = comment.match(/\b\d{6,8}(?:N5)?\b/i)?.[0];
  const searchQueries = unique([...(commentArticle ? [commentArticle] : []), ...plannedQueries]).slice(0, 3);
  const searchQuery = searchQueries[0] ?? description;
  const warnings = compact([
    intent === "pipe" && isCompletePipeLengthDescription(description)
      ? "Posten omfattar rör, böjar, T-stycken, ändlock och upphängning. Rördelarnas antal och utförande behöver tas från ritning; rörlängden anger inte antal delar."
      : null,
    intent === "alarm_device"
      ? "Kontrollera komplett alarmgivarset, extra alarmgivare och kompatibilitet med det valda alarmventilsetet. Huvudventilens DN är inte alarmgivarens anslutningsdimension."
      : null,
    intent === "flow_meter" ? "Verifiera kapacitetsmätarens mätområde, anslutningar och sprinklergodkännande mot databladet." : null,
    intent === "shower_set"
      ? "Kontrollera komplett duschleverans och PDF-postens tilläggskrav på blandare, duschstång, eventuella stödhandtag och duschsits."
      : null,
    intent === "toilet"
      ? "Kontrollera toalettens kompletta utförande och tilläggskraven i PDF-posten, inklusive eventuell höjdjustering, belastning och tillbehör."
      : null,
    ...(intent === "sprinkler_head" ? installation.warnings.filter(message => !isSprinklerAccessoryReviewWarning(message)) : []),
    ...dataWarnings.map((warning) => warning.message),
    ...requirementExtractionWarnings(requirement),
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
          visibleMount,
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
    ...(intent === "sprinkler_head" ? installation.notes : []),
    "Scipx söker automatiskt på Ahlsells webbplats utifrån PDF-kraven, även efter produkter som saknas i MLDL. Databasen kompletterar med lagrade produktuppgifter.",
    intent === "sprinkler_head" && !isSprinklerAccessory
      ? "Scipx kontrollerar MLDL-artikelns K-faktor, DN, temperatur, respons, riktning, montage, systemvillkor och färg med lagrade tekniska uppgifter."
      : null,
    intent === "sprinkler_head" && finish === "brass" && sprinklerFinish(finishText) === null
      ? "Ingen färg eller ytfinish anges i PDF-posten. Scipx använder därför mässing som standardval."
      : null,
    intent === "sprinkler_head" && sprinklerSystem && sprinklerHeadType
      ? `Scipx skiljer på anläggningstyp (${sprinklerSystem === "wet" ? "Våtanlegg" : "Tørranlegg"}) och sprinklerhuvudets konstruktion (${sprinklerHeadType === "dry" ? "Tørrsprinkler" : sprinklerHeadType === "open" ? "öppen sprinkler" : "konventionell sprinkler"}).`
      : null,
    intent === "sprinkler_head" && mount === "recessed" && /\bkonvensjonell\b/.test(primaryCombined)
      ? "Infällt takmontage behandlas som ett pendentkrav; den generella typetiketten konvensjonell får inte ensam styra produktvalet."
      : null,
    intent === "sprinkler_head" && visibleMount
      ? "Synligt montage eller uttryckligen ingen täckbricka utesluter concealed/skjult sprinkler; Scipx prioriterar pendent-/ned-utföranden utan täcklock."
      : null,
    nsCodeIntent === "sprinkler_hose"
      ? `NS 3420-koden ${nsCode} identifierar produkten som sprinklerslang. Ordet rörledning beskriver systemet och används inte som rörprodukt.`
      : null,
    requiresSupervisedOpenValve
      ? "Signal vid stängd ventil tolkas som en spjällventil som övervakas i normalt öppet läge; kandidater utan dokumenterad övervakning prioriteras ned."
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
    interpretationNotes: intent === "sprinkler_head" ? installation.notes : [],
    interpretationWarnings: intent === "sprinkler_head" ? installation.warnings.filter(message => !isSprinklerAccessoryReviewWarning(message)) : [],
    accessoryRequirements: intent === "sprinkler_head" ? sprinklerAccessoryNotices(attributes, sourceLanguageText) : [],
    directCandidates: directCandidates.filter(item => item.source !== "pdf_reference" && ahlsellMldlProduct(item.articleNumber))
      .map(withVerifiedWorkingPressure).map((item) => {
      const checks = engineeringRequirementWarnings(requirement, item);
      checks.push(...requirementExtractionWarnings(requirement));
      if (intent === "sprinkler_head") checks.push(...installation.warnings.filter(message => !isSprinklerAccessoryReviewWarning(message)));
      if (intent === "sprinkler_head" && sprinklerNeedsHydraulicReview(sourceLanguageText)) {
        checks.push("Hydrauliska villkor och produktens listning måste verifieras innan slutligt produktval.");
      }
      if (checks.length === 0 && !requiresAccessoryReview) return item;
      return { ...item, exactMatch: false, recommendation: "possible" as const, requiresAccessoryReview,
        matchWarnings: [...new Set([...(item.matchWarnings ?? []), ...checks])] };
    }).map(withTechnicalConflictAssessment)
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
  pn,
  sdr,
  pipeJoints,
  pipeMaterial,
  materialGrade
}: {
  category: string;
  intent: AhlsellProductIntent;
  pipeJoints: PipeJoint[];
  pipeMaterial: string;
  materialGrade: string | null;
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
  sdr: number | null;
}) {
  const dnTerm = dn === null ? null : `DN${formatNumber(dn)}`;
  const outsideDiameterTerm = outsideDiameters[0] === undefined
    ? null
    : `${formatCatalogDecimal(outsideDiameters[0])}mm`;
  const outsideDiameterPair = outsideDiameters.slice(0, 2)
    .map((value) => `${formatCatalogDecimal(value)}mm`)
    .join(" ");
  const pressureTerm = pn === null ? null : `PN${formatNumber(pn)}`;

  if (intent === "shower_set") {
    return /\b(blandebatteri|dusjbatteri|duschblandare|blandare)\b/.test(combined)
      ? ["Dusjsett med blandebatteri", "Dusjbatteri hånddusj glidestang", "Dusjsett"]
      : ["Dusjsett", "Hånddusj glidestang"];
  }
  if (intent === "toilet") {
    return /\belektrisk\s+(?:hoydejustering|hojdjustering|hev\s+senk)\b/.test(combined)
      ? ["Toalett elektrisk hev senk", "Toalettmodul elektrisk høydejustering"]
      : ["Klosett komplett", "Toalett"];
  }
  if (intent === "wet_alarm_valve" || intent === "dry_alarm_valve") {
    const system = intent === "wet_alarm_valve" ? "våt" : "tørr";
    return [
      compact(["Alarmventil", system, dnTerm]).join(" "),
      compact(["Sprinklersentral", system, outsideDiameterTerm ?? dnTerm]).join(" ")
    ];
  }
  if (intent === "foam_extinguisher") {
    const liters = combined.match(/\b(\d+(?:[.,]\d+)?)\s*liter\b/)?.[1];
    return [compact(["Skumslukker", liters ? `${liters} liter` : null]).join(" "), "Brannslukker skum"];
  }
  if (intent === "portable_fire_extinguisher") return ["Brannslukker", "Håndslukker"];
  if (isSprinklerAccessory) return ["Sprinklergitter", "Gitter sprinklerhode"];
  if (intent === "sprinkler_hose") {
    return [
      compact(["Sprinklerslange", dnTerm]).join(" "),
      compact(["Fleksibelslange sprinkler", dnTerm]).join(" "),
      compact(["VicFlex sprinklerslange", dnTerm]).join(" ")
    ];
  }

  if (intent === "pressure_switch") {
    if (/\b(?:vannforsyning|vanninnlegg)\b/.test(combined)) return ["Pressostat vanntrykk", "Trykkbryter vannforsyning", "Pressostat sprinkler"];
    return ["Pressostat", "Pressostat vann", "PS10 pressostat"];
  }
  if (intent === "alarm_device") {
    return compact([/\bkit\s*5\b/.test(combined) ? "Tyco KIT5" : null, "Alarmgiver sprinkler", "Alarmpressostat"]);
  }
  if (intent === "flow_meter") {
    return compact([/\bds1162\b/.test(combined) ? "DS1162" : null,
      compact(["Kapasitetsmåler", dnTerm]).join(" "), compact(["Flowmeter sprinkler", dnTerm]).join(" ")]);
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
    if (/\b(signal (?:ved|nar) stengt ventil|tilkobling for signal|overvaket|overvakning|supervised open|supervisory switch)\b/.test(combined)) {
      return [
        compact(["Spjeldventil overvåket åpen", outsideDiameterTerm ?? dnTerm]).join(" "),
        compact(["Vic 705 Fire", outsideDiameterTerm ?? dnTerm]).join(" "),
        compact(["Spjeldventil signal", dnTerm]).join(" ")
      ];
    }
    return ["Spjeldventil sprinkler", compact(["Spjeldventil", dnTerm]).join(" "), "Spjeldventil rillede tilkoblinger"];
  }
  if (intent === "check_valve") {
    return [compact(["Tilbakeslagsventil rillet", dnTerm]).join(" "), compact(["Tilbakeslagsventil", dnTerm]).join(" "), "Tilbakeslagsventil rillet"];
  }
  if (intent === "pressure_reducing_valve") {
    return [compact(["Trykkreduksjonsventil", dnTerm]).join(" "), "Trykkreduksjonsventil"];
  }
  if (intent === "shutoff_valve") {
    if (valveMonitoringRequirement(combined) === "none") {
      return [compact(["Stengeventil", dnTerm, "uten overvåking"]).join(" "),
        compact(["Spjeldventil", outsideDiameterTerm ?? dnTerm, "håndtak"]).join(" "),
        compact(["Stengeventil", dnTerm]).join(" ")];
    }
    return ["Sprinklerventil", compact(["Sprinklerventil", dnTerm]).join(" ")];
  }
  if (intent === "flange_adapter") {
    return [compact(["Flensadapter rillet", outsideDiameterTerm]).join(" "), compact(["Flenseadapter", dnTerm]).join(" ")];
  }
  if ((intent === "flanged_bend" || intent === "bend" && /\b(flens|flanged)\b/.test(combined))) {
    return [
      compact(["Flensebend", dnTerm, pressureTerm]).join(" "),
      compact(["Bend flens", dnTerm]).join(" ")
    ];
  }
  if (intent === "pipe") {
    const material = /\b(?:rustfritt|rustfri|rustfrie|stainless)\b/.test(pipeMaterial) ? "Rustfritt stålrør"
      : /\b(?:pp r|ppr)\b/.test(pipeMaterial) ? "PP-R rør"
      : /\b(?:alupex|multilayer|komposit\w*)\b/.test(pipeMaterial) ? "Alupex rør"
      : /\b(?:pe\s*\d*|polyetylen|polyethylene)\b/.test(pipeMaterial) ? "PE rør"
      : /\b(?:pex|pe x)\b/.test(pipeMaterial) ? "PEX rør"
      : /\bpvc\b/.test(pipeMaterial) ? "PVC rør"
      : /\b(?:kobber\w*|koppar\w*|copper)\b/.test(pipeMaterial) ? "Kobberrør" : "Stålrør sprinkler";
    // The steel DN/OD table does not define plastic or copper pipe sizes.
    const alternateDimension = material.includes("stålrør") || material === "Stålrør sprinkler"
      ? outsideDiameterTerm ?? dnTerm : dnTerm ?? outsideDiameterTerm;
    const joints = pipeJoints.map(joint => pipeJointSearchTerm[joint]);
    return [
      ...(!joints.length && !materialGrade && material === "Stålrør sprinkler"
        ? [compact(["Rør sprinkler", outsideDiameterTerm ?? dnTerm]).join(" ")] : []),
      compact([material, materialGrade, dnTerm ?? outsideDiameterTerm, sdr === null ? null : `SDR${sdr}`, joints[0], pressureTerm]).join(" "),
      compact([material, materialGrade, alternateDimension, joints[1] ?? joints[0]]).join(" "),
      compact([material, materialGrade, dnTerm ?? outsideDiameterTerm]).join(" ")
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
    if (pipeJoints.includes('threaded') && !pipeJoints.includes('grooved')) {
      return [compact(['Plugg gjenget', dnTerm]).join(' '), compact(['Endelokk gjenget', dnTerm]).join(' ')];
    }
    return [compact(["Endelokk", outsideDiameterTerm]).join(" "), compact(["Endelokk rillet", dnTerm]).join(" ")];
  }
  if (intent === "branch") {
    return [compact(["Anboringsklammer", outsideDiameterTerm]).join(" "), compact(["Utløpskupling", dnTerm]).join(" ")];
  }
  if (intent === "pump") {
    return ["Lensepumpe", "Pumpe avløpsvann", "Sprinklerpumpe"];
  }
  if (intent === "water_meter") return [compact(["Vannmåler", dnTerm]).join(" "), "Vannkapasitetsmåler sprinkler"];
  if (intent === "flushing_connection") return [compact(["Spyleventil", dnTerm]).join(" "), compact(["Spjeldventil", dnTerm]).join(" ")];
  if (intent === "sensor_pocket") return ["Følerlomme trykkgiver", "Tilkobling trykkvakt"];
  if (intent === "sprinkler_cabinet") return ["Sprinklerskap", "Skap reservesprinkler"];
  if (intent === "strainer") {
    return [compact(["Sil", dnTerm]).join(" "), compact(["Grovfilter", dnTerm]).join(" "), compact(["Filter", dnTerm]).join(" ")];
  }
  if (intent === "support") {
    return [compact(["Røroppheng", dnTerm]).join(" "), "Rørklammer sprinkler"];
  }
  if (intent === "custom_fabrication") {
    return ["Dreneringskar sprinkler"];
  }
  if (intent === "key_switch") return ["Nøkkelbryter sprinkler", "Nøkkelboks sprinkler"];
  if (intent === "valve_actuator") return [searchDescription ?? description, "Ventilaktuator"];

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
    // Include the documented nominal K160/K161/K162 family in retrieval;
    // matching still checks the actual product K-factor and every other field.
    if ([160, 161, 162].includes(kFactor)) {
      return [`Sprinklerhode K${formatNumber(kFactor)}`, `Sprinklerhode K160`, `Sprinklerhode K161`];
    }
    return [`Sprinklerhode K${formatNumber(kFactor)}`, exact, temperatureQuery ?? finishQuery];
  }

  // An unrecognised product must retain its own description; a broad stored
  // category is not evidence that it belongs to a sprinkler installation.
  if (intent === "generic") return [searchDescription ?? description];

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
    sprinkler_hose: "Flexibel sprinklerslang",
    pipe: "Sprinklerrör",
    fitting: "Sprinklerrördel",
    valve: "Sprinklerventil",
    support: "Rörupphängning sprinkler",
    control: "Sprinkler övervakning"
  } as Record<string, string>)[category] ?? "Teknisk produkt";
}

function intentLabel(intent: AhlsellProductIntent, category: string, description: string) {
  if (intent === "generic") return "Teknisk produkt";
  const label = ({
    toilet: "Toalett",
    shower_set: "Dusch",
    foam_extinguisher: "Skumsläckare",
    portable_fire_extinguisher: "Handbrandsläckare",
    sprinkler_head: "Sprinkler",
    sprinkler_guard: "Sprinkler skyddskorg",
    sprinkler_hose: "Flexibel sprinklerslang",
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
    alarm_device: "Alarmgivare för sprinkler", flow_meter: "Kapacitetsmätare",
    test_drain: "Test- och dräneringsventil",
    pump: "Pump",
    strainer: "Sil/filter",
    support: "Rörupphängning",
    custom_fabrication: "Specialtillverkad produkt",
    key_switch: "Nyckelbrytare/nyckelbox", valve_actuator: "Ventilställdon"
  } as Partial<Record<AhlsellProductIntent, string>>)[intent];
  return label ?? categoryLabel(category, description);
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
  if (/\b(konvensjonell|konventionell|conventional|spraysprinkler|standard spray|utvidet dekning(?:sareal)?|extended coverage|institusjonssprinkler|institutionssprinkler|korridorsprinkler)\b/.test(normalized)) return "standard";
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
