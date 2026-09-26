import type { AhlsellPublicCandidate } from "@/lib/ahlsell-public-match";
import { engineeringRequirementWarnings } from "./ahlsell-engineering-checks";
import { technicalConflictWarnings, withTechnicalConflictAssessment } from "./ahlsell-technical-conflicts";
import { withVerifiedWorkingPressure, verifiedVictaulicWorkingPressure } from "./victaulic-working-pressure";
import { verifiedVictaulicCandidate } from "./victaulic-sprinkler-catalog";
import {
  parseSprinklerKFactor,
  projectRequirementDataWarnings,
  projectRequirementKFactorDisplayValue
} from "@/lib/project-requirement-data-warnings";
import { ahlsellRequirementIntent, type AhlsellProductIntent as ProductIntent } from "./ahlsell-requirement-intent";
import { isManifoldCabinetProduct } from "./ahlsell-manifold-cabinet";
import { isRigidPipeProduct } from "./pipe-product-family";
import { capPrimaryConnection, pipeCandidateMaterial, pipeCandidateOutsideDiameter, pipeLimitWarnings, pipeRequirementDimensions, pipeRequirementLimits } from './pipe-matching-evidence';
import { mainProductText, productRequirementAttributes, productTechnicalSpecification, valveMonitoringRequirement } from "./ahlsell-requirement-context";
import { pipeJointTypes, requirementJointText, stainlessSteelGrade, type PipeJoint } from "./pipe-technical-terms";
import { requirementExtractionWarnings } from "./requirement-extraction-warnings";
import { productAssemblyPlan } from "./product-assembly-plan";
import { technicalEvidenceSpecifications, technicalEvidenceWarnings } from "./ahlsell-technical-evidence";
import { resolvedSprinklerOrientation, sprinklerOrientationSignals } from "@/lib/sprinkler-orientation-lexicon";
import {
  sprinklerCoverageFromText,
  sprinklerCoverageMatches,
  sprinklerExplicitlyExcludesCoverPlate,
  sprinklerKFactorMatches,
  sprinklerInstallationRequirements,
  sprinklerMountCapabilities,
  sprinklerNeedsHydraulicReview,
  sprinklerRequiresAccessoryReview,
  sprinklerResponse,
  sprinklerSystemRestriction,
  isSprinklerAccessoryReviewWarning,
  type SprinklerCoverageClass
} from "@/lib/sprinkler-technical-rules";

const PIPE_OUTSIDE_DIAMETER_BY_DN: Record<number, number> = {
  15: 21.3, 20: 26.9, 25: 33.7, 32: 42.4, 40: 48.3, 50: 60.3,
  65: 76.1, 80: 88.9, 100: 114.3, 125: 139.7, 150: 168.3, 200: 219.1
};

type TechnicalProfile = {
  reviewWarnings: string[];
  text: string;
  intent: ProductIntent;
  dn: number | null;
  pipeLimits: ReturnType<typeof pipeRequirementLimits>;
  outsideDiameter: number | null;
  pn: number | null;
  minimumPressureClass: boolean;
  kFactor: number | null;
  temperatureC: number | null;
  response: "standard" | "quick" | null;
  orientation: "upright" | "pendent" | "sidewall" | null;
  mount: "recessed" | "concealed" | null;
  visibleMount: boolean;
  sprinklerSystem: "wet" | "dry" | null;
  sprinklerHeadType: "standard" | "dry" | "open" | null;
  expectsSteel: boolean;
  material: "steel" | "stainless_steel" | "ppr" | "pe" | "pvc" | "copper" | "multilayer" | "brass" | "ductile_iron" | null;
  joint: PipeJoint | null;
  allowedJoints: PipeJoint[];
  materialGrade: string | null;
  corrosionClass: string | null;
  allowsGroovedPipe: boolean;
  coverage: SprinklerCoverageClass | null;
  requiresAccessoryReview: boolean;
  requiresHydraulicReview: boolean;
  finish: "white" | "black" | "chrome" | "brass" | null;
  requiresSupervisedOpenValve: boolean;
  requiresHandwheelValve: boolean;
  requiresSoftClosingValve: boolean;
};

export function rankAhlsellCandidates(requirement: Record<string, unknown>, candidates: AhlsellPublicCandidate[]) {
  const profile = requirementProfile(requirement);
  return orderAhlsellCandidatesForDisplay(
    candidates.map(candidate => {
      const evidence = candidate.technicalEvidence;
      candidate = { ...candidate,
        specifications: [...new Set([...candidate.specifications, ...technicalEvidenceSpecifications(evidence?.articleNumber === candidate.articleNumber ? evidence : undefined)])],
        matchWarnings: [...new Set([...(candidate.matchWarnings ?? []), ...technicalEvidenceWarnings(candidate.articleNumber, evidence)])]
      };
      const verified = verifiedVictaulicCandidate(candidate);
      // Fill sparse public cards before assessment, retaining conflicts from
      // both the public description and the independently verified article.
      const combined = withVerifiedWorkingPressure(verified ? { ...candidate,
        specifications: [...new Set([...candidate.specifications, ...verified.specifications])]
      } : candidate);
      const verifiedConflicts = verified ? technicalConflictWarnings(scoreCandidate(verified, profile)) : [];
      return scoreCandidate({ ...combined, matchWarnings: [...new Set([
        ...(candidate.matchWarnings ?? []), ...verifiedConflicts,
        ...engineeringRequirementWarnings(requirement, combined)
      ])] }, profile);
    })
  );
}

export function orderAhlsellCandidatesForDisplay(candidates: AhlsellPublicCandidate[]) {
  return [...candidates].sort((left, right) =>
    confidenceTier(left) - confidenceTier(right)
    // Sources score differently. Within a confidence tier, fewer unresolved
    // technical warnings take precedence over points and catalogue bonuses.
    || (left.matchWarnings?.length ?? 0) - (right.matchWarnings?.length ?? 0)
    || (right.matchScore ?? 0) - (left.matchScore ?? 0)
    || (right.assortmentPriority ?? 0) - (left.assortmentPriority ?? 0)
    || (right.learningEvidence?.supportCount ?? 0) - (left.learningEvidence?.supportCount ?? 0)
    || (right.learningEvidence?.similarityScore ?? 0) - (left.learningEvidence?.similarityScore ?? 0)
    || left.productName.localeCompare(right.productName, "sv")
  );
}

export function isExactAhlsellCandidate(candidate: AhlsellPublicCandidate) {
  if (candidate.requiresAccessoryReview || candidate.requiresProductSelection) return false;
  if (candidate.source === "pdf_reference" || candidate.recommendation === "unlikely") return false;
  if ((candidate.matchWarnings?.length ?? 0) > 0) return false;
  return candidate.exactMatch === true;
}

/** Green describes a technically supported proposal, independently of approval. */
export function isMatchingAhlsellCandidate(candidate: Pick<AhlsellPublicCandidate, "source" | "recommendation" | "matchScore" | "matchWarnings" | "exactMatch" | "requiresAccessoryReview">) {
  if (candidate.requiresAccessoryReview) return false;
  if ((candidate.matchWarnings?.length ?? 0) > 0 || candidate.recommendation === "unlikely" || candidate.source === "pdf_reference") return false;
  return candidate.exactMatch === true || (candidate.recommendation === "recommended" && (candidate.matchScore ?? 0) >= 75);
}

export type AhlsellCandidateMatchState = "exact" | "matched" | "review" | "mismatch";

export function ahlsellCandidateMatchState(candidate: AhlsellPublicCandidate): AhlsellCandidateMatchState {
  if (isExactAhlsellCandidate(candidate)) return "exact";
  if (isMatchingAhlsellCandidate(candidate)) return "matched";
  if (technicalConflictWarnings(candidate).length > 0) return "mismatch";
  return "review";
}

/** Identify the sold product, not signs included with a complete valve set. */
export function isAhlsellSignageCandidate(candidate: Pick<AhlsellPublicCandidate, "productName" | "description" | "specifications">) {
  const mainName = normalize(candidate.productName).split(/\b(?:med|with|inkl|inkludert|inklusive|including)\b/)[0];
  const signage = /\b(?:skilt|skiltpakke|skiltsett|brannskilt|sprinklerskilt|skylt|skyltpaket|signage|sign)\b/;
  if (signage.test(mainName)) return true;
  if (candidate.specifications.some(spec => /^(?:produkttype|produkttyp|product type)\s+/.test(normalize(spec)) && signage.test(normalize(spec)))) return true;
  // Some cards use only the text printed on the sign as their title.
  return /^(?:sprinklersentral|sprinklercentral)$/.test(mainName.trim())
    && /^(?:(?:etterlysende|etterlysande|brann|systemtext)\s+)*(?:skilt|brannskilt|skylt|sign)\b/.test(normalize(candidate.description ?? ""));
}

function confidenceTier(candidate: AhlsellPublicCandidate) {
  if (technicalConflictWarnings(candidate).length) return 5;
  if (isExactAhlsellCandidate(candidate)) return 0;
  if ((candidate.matchWarnings?.length ?? 0) > 0 || candidate.recommendation === "unlikely") return 3;
  if (candidate.recommendation === "recommended") return 1;
  if (candidate.recommendation === "possible") return 2;
  return 4;
}

function requirementProfile(requirement: Record<string, unknown>): TechnicalProfile {
  const value = record(requirement.value_json);
  const intent = ahlsellRequirementIntent(requirement);
  const attributes = productRequirementAttributes(requirement);
  const semanticText = normalize(flattenText({
    category: requirement.category,
    description: requirement.value_text,
    displayName: requirement.display_name,
    unit: value.unit,
    attributes
  }));
  const primaryText = normalize(`${semanticText} ${flattenText(value.sourceText)}`);
  const sourceOnlyText = normalize(`${requirement.value_text ?? ""} ${flattenText(value.sourceText)} ${requirement.source_excerpt ?? ""}`);
  // Only requirement evidence belongs here; previous candidates, comments,
  // provenance and saved matching scores must not create technical demands.
  const text = normalize(`${primaryText} ${productTechnicalSpecification(requirement)}`);
  const pipeDimensions = intent === 'pipe' ? pipeRequirementDimensions(requirement) : null;
  const outsideDiameter = pipeDimensions ? pipeDimensions.outsideDiameter : extractOutsideDiameter(primaryText) ?? extractOutsideDiameter(text);
  const dn = intent === "alarm_device" ? null : pipeDimensions ? pipeDimensions.dn : extractDn(primaryText) ?? dnFromOutsideDiameter(outsideDiameter) ?? extractDn(text);
  const placementText = normalize(attributeText(attributes, /\b(?:plassering|placering|orientation|montasje|montering|mounting)\b/));
  const deckPlateText = normalize(attributeText(attributes, /\b(?:dekkskive|pyntering|rosett|escutcheon|cover plate)\b/));
  const materialText = normalize(attributeText(attributes, /\b(?:materiale|materialkvalitet|material|ror material)\b/)
    || mainProductText(String(requirement.value_text ?? requirement.display_name ?? "")));
  const jointText = intent === "alarm_device" ? "" : normalize(requirementJointText(attributes, String(requirement.value_text ?? "")));
  const sprinklerTypeText = normalize(attributeText(attributes, /\b(?:type sprinkler|sprinklertype|dekning|coverage)\b/));
  const sprinklerSystemText = normalize(attributeText(attributes, /\b(?:sprinkleranlegg|anleggstype|systemtype|sprinkler system)\b/));
  const coverageText = `${sprinklerTypeText} ${primaryText}`;
  const installation = sprinklerInstallationRequirements(attributes, `${requirement.value_text ?? ""}\n${flattenText(value.sourceText)}\n${requirement.source_excerpt ?? ""}`);
  const mount = installation.mount;
  const orientationText = placementText || primaryText;
  const orientationResult = resolvedSprinklerOrientation(orientationText);
  const orientation = orientationResult.orientation
    ?? (!orientationResult.mixed && mount !== null && /\b(tak|himling|ceiling)\b/.test(placementText) ? "pendent" : null);
  const generalPipeRules = normalize(String(record(value.attributes)["generelle krav"] ?? ""));
  const explicitFinish = extractFinish(primaryText);
  const responseResult = sprinklerResponse(
    attributeText(attributes, /\b(?:folsomhetsgrad|respons|response)\b/),
    sourceOnlyText
  );
  const reviewWarnings = [...projectRequirementDataWarnings(requirement).map((warning) => warning.message), ...requirementExtractionWarnings(requirement)];
  if (intent === "generic") reviewWarnings.push("Huvudproduktens produktgrupp är inte fastställd. Produktförslaget behöver granskas.");
  if (intent === "sprinkler_head") reviewWarnings.push(...installation.warnings.filter(message => !isSprinklerAccessoryReviewWarning(message)));
  if (intent === "sprinkler_head" && responseResult.conflict) {
    reviewWarnings.push("PDF-posten anger både standard- och quick-respons. Kontrollera originaltexten innan produktval.");
  }
  if (intent === "sprinkler_head" && orientationResult.mixed) {
    reviewWarnings.push("PDF-posten anger flera monteringsriktningar. Dela posten eller kontrollera rätt variant manuellt.");
  }
  return {
    reviewWarnings,
    text,
    intent,
    dn,
    pipeLimits: pipeRequirementLimits(requirement),
    outsideDiameter: outsideDiameter ?? (dn === null ? null : PIPE_OUTSIDE_DIAMETER_BY_DN[dn] ?? null),
    pn: numberAfterLabel(primaryText, /\bpn\s*(\d{1,3})\b/) ?? numberAfterLabel(text, /\bpn\s*(\d{1,3})\b/),
    minimumPressureClass: /\bminimum trykklasse pn\s*\d+\b/.test(generalPipeRules),
    kFactor: intent === "sprinkler_head" ? parseSprinklerKFactor(projectRequirementKFactorDisplayValue(requirement))
      ?? extractKFactor(primaryText)
      ?? extractKFactor(text) : null,
    temperatureC: intent === "sprinkler_head" ? extractTemperature(primaryText) ?? extractTemperature(text) : null,
    response: intent === "sprinkler_head" ? responseResult.response : null,
    orientation: intent === "sprinkler_head" ? orientation : null,
    mount: intent === "sprinkler_head" ? mount : null,
    visibleMount: /\b(synlig|visible|eksponert)\b/.test(placementText)
      || installation.exposed
      || sprinklerExplicitlyExcludesCoverPlate(deckPlateText),
    sprinklerSystem: extractSprinklerSystem(sprinklerSystemText),
    sprinklerHeadType: extractRequiredSprinklerHeadType(sprinklerTypeText),
    expectsSteel: /\b(stalror|stal ror|materiale stal|ror av stal|stal fittings?)\b/.test(primaryText),
    material: extractMaterial(materialText),
    materialGrade: stainlessSteelGrade(materialText),
    corrosionClass: text.match(/\bkorrosivitetskategori\s+(c[1-5])\b/)?.[1]?.toUpperCase() ?? null,
    joint: extractJointTypes(jointText)[0] ?? null,
    allowedJoints: /\b(?:eller|or)\b/.test(jointText) ? extractJointTypes(jointText) : extractJointTypes(jointText).slice(0, 1),
    allowsGroovedPipe: intent === "pipe" && (/\brillede stalror for alle dimensjoner\b/.test(generalPipeRules)
      || (/\b(?:eller|or)\b/.test(jointText) && extractJointTypes(jointText).includes("threaded") && extractJointTypes(jointText).includes("grooved"))),
    coverage: sprinklerCoverageFromText(coverageText),
    requiresAccessoryReview: sprinklerRequiresAccessoryReview(attributes, sourceOnlyText)
      || Boolean(productAssemblyPlan(requirement)?.components.some(part => !part.optional))
      || (intent === "pipe" && /\bror inkludert deler\b|\bsprinklerror inkludert deler\b/.test(text)),
    requiresHydraulicReview: sprinklerNeedsHydraulicReview(coverageText),
    finish: explicitFinish,
    requiresSupervisedOpenValve: valveMonitoringRequirement(`${primaryText} ${sourceOnlyText}`) === "required",
    requiresHandwheelValve: /\b(manuell med ratt|med ratt|rattet|handratt|handwheel|gear operated|girbetjent)\b/.test(`${primaryText} ${sourceOnlyText}`),
    requiresSoftClosingValve: /\b(myk stenging|mjuk stangning|soft clos|slow clos)\b/.test(primaryText)
  };
}

function scoreCandidate(candidate: AhlsellPublicCandidate, requirement: TechnicalProfile): AhlsellPublicCandidate {
  const candidateName = normalize(candidate.productName);
  const candidateText = normalize(flattenText({
    productName: candidate.productName,
    manufacturer: candidate.manufacturer,
    description: candidate.description,
    specifications: candidate.specifications
  }));
  const reasons: string[] = [];
  const primaryConnection = requirement.intent === 'cap' ? capPrimaryConnection(candidate) : null;
  const pipeOd = requirement.intent === 'pipe' ? pipeCandidateOutsideDiameter(candidate) : null;
  const dimensionText = primaryConnection !== null ? normalize(primaryConnection)
    : requirement.intent === 'pipe' && requirement.dn === null ? (pipeOd === null ? '' : `outside diameter ${pipeOd} mm`) : candidateText;
  const jointText = primaryConnection !== null ? normalize(primaryConnection) : candidateText;
  const materialText = requirement.intent === 'pipe' ? normalize(pipeCandidateMaterial(candidate)) : candidateText;
  const pressure = verifiedVictaulicWorkingPressure(candidate);
  if (pressure) reasons.push(`Arbetstryck ${pressure.bar} bar är dokumenterat för ${pressure.model} i Victaulic ${pressure.publication}.`);
  const warnings: string[] = [...requirement.reviewWarnings, ...(candidate.matchWarnings ?? [])]
    .filter(message => !isSprinklerAccessoryReviewWarning(message));
  if (requirement.intent === 'pipe') warnings.push(...pipeLimitWarnings(candidate, requirement.pipeLimits));
  const missingRequirements = missingProductGroupRequirements(requirement);
  if (missingRequirements.length) warnings.push(`PDF-kravet behöver kompletteras eller verifieras: ${missingRequirements.join(", ")}.`);
  let score = 0;
  const signage = isAhlsellSignageCandidate(candidate);
  if ((requirement.intent === "wet_alarm_valve" || requirement.intent === "dry_alarm_valve") && signage) {
    warnings.push("Fel produkttyp: träffen är en skylt, inte ett kontrollventilset.");
  }

  if (requirement.intent === "manifold_cabinet") {
    if (isManifoldCabinetProduct(candidate.productName)) {
      score += 65;
      reasons.push("Produkten är ett fördelarskåp; innehåll och komplett leveransomfattning behöver kontrolleras.");
    }
  } else if (requirement.intent === "toilet") {
    score += scoreNamedProductFamily(candidateName, /\b(klosett|toalett(?:modul|kassett)?|wc|toilet)\b/, "Produkten tillhör toalettfamiljen; komplett utförande behöver kontrolleras.", reasons);
  } else if (requirement.intent === "shower_set") {
    score += scoreNamedProductFamily(candidateName, SHOWER_PRODUCT_PATTERN, "Produkten tillhör duschfamiljen; komplett leveransomfattning behöver kontrolleras.", reasons);
  } else if (requirement.intent === "alarm_device") {
    score += scoreNamedProductFamily(candidateName, /\b(alarmgiver|alarmapparat|alarmkit|alarmpressostat|pressostat|pressure switch)\b/, "Produkten tillhör alarmgivarens produktgrupp; set och kompatibilitet behöver verifieras.", reasons);
  } else if (requirement.intent === "flow_meter") {
    score += scoreNamedProductFamily(candidateName, /\b(kapasitetsmaler|stromningsmaler|flowmeter|flow meter|gapmeter|gap meter)\b/, "Produkten är en flödesmätare för kapacitetsmätning.", reasons);
  } else if (requirement.intent === "wet_alarm_valve") {
    score += scoreWetAlarmValve(candidateText, reasons, warnings, requirement.text, signage);
  } else if (requirement.intent === "dry_alarm_valve") {
    score += scoreNamedProductFamily(candidateText, /\b(sprinklersentral|alarmventil)\b/, "Produkten är en sprinklersentral/alarmventil.", reasons);
    score += scoreNamedProductFamily(candidateText, /\b(torr|dry|d769n)\b/, "Utförandet är avsett för torrt sprinklersystem.", reasons);
    if (/\b(vat|wet|s751)\b/.test(candidateText)) {
      score -= 60;
      warnings.push("Produkten är avsedd för vått system, men PDF-kravet anger torrt system.");
    }
  } else if (requirement.intent === "manometer") {
    if (/\bmanometer\b/.test(candidateText)) {
      score += 65;
      reasons.push("Produkttypen är ett manometer/mätinstrument för tryck.");
    }
    if (/\bsprinkler\b/.test(candidateText)) {
      score += 10;
      reasons.push("Produkten är avsedd för sprinklerinstallation.");
    }
    if (/\b(pressostat|trykkvakt|kuleventil)\b/.test(candidateText)) {
      score -= 60;
      warnings.push("Träffen är inte ett manometer.");
    }
  } else if (requirement.intent === "pressure_switch") {
    if (/\b(pressostat|trykkvakt|pressure switch|switch spdt|ps10)\b/.test(candidateText)) {
      score += 75;
      reasons.push("Produkttypen motsvarar en tryckvakt/pressostat.");
    }
    if (/\bmanometer\b/.test(candidateText)) {
      score -= 60;
      warnings.push("Träffen mäter tryck men är inte en tryckvakt.");
    }
  } else if (requirement.intent === "flow_switch") {
    score += scoreNamedProductFamily(candidateName, /\b(stromningsvakt|flow switch|vsr)\b/, "Produkttypen motsvarar en flödesvakt.", reasons);
  } else if (requirement.intent === "ball_valve") {
    if (/\bkuleventil\b/.test(candidateName)) {
      score += 55;
      reasons.push("Produkttypen är en kulventil.");
    }
    if (/\b(?:isolasjonspute|isoleringspute|krage|flens|adapter|aktuator|handtak|spak|reservedel|pakningssett)\b.*\b(?:til|for)\s+kuleventil/.test(candidateName)
      || /\b(?:til|for)\s+kuleventil(?:er)?\b/.test(candidateName)) {
      score -= 80;
      warnings.push("Träffen är ett tillbehör till en kulventil, inte en komplett kulventil.");
    }
    if (/\bwaterguard\b/.test(candidateText)) {
      score -= 45;
      warnings.push("Träffen är en Waterguard-komponent och inte säkert rätt avstängningsventil för sprinklersentralen.");
    }
  } else if (requirement.intent === "butterfly_valve") {
    score += scoreNamedProductFamily(candidateName, /\b(spjeldventil|butterfly valve)\b/, "Produkttypen är en spjällventil.", reasons);
    score += scoreButterflyValveOperation(candidateText, requirement, reasons, warnings);
  } else if (requirement.intent === "check_valve") {
    score += scoreNamedProductFamily(candidateName, /\b(tilbakeslagsventil|backventil|check valve)\b/, "Produkttypen är en backventil.", reasons);
    if (/\bfjaerbelastet\b/.test(requirement.text)) {
      if (/\buten fjaer\b/.test(candidateText)) {
        score -= 60;
        warnings.push("PDF-kravet anger fjäderbelastad backventil, men Ahlsell-träffen är utan fjäder.");
      } else if (/\b(?:med fjaer|fjaerbelastet)\b/.test(candidateText)) {
        score += 10;
        reasons.push("Fjäderbelastat utförande stämmer med PDF-kravet.");
      }
    }
  } else if (requirement.intent === "pressure_reducing_valve") {
    score += scoreNamedProductFamily(candidateName, /\b(trykkreduksjonsventil|reduksjonsventil|pressure reducing valve)\b/, "Produkttypen är en tryckreduceringsventil.", reasons);
  } else if (requirement.intent === "shutoff_valve") {
    score += scoreNamedProductFamily(candidateName, /\b(sprinklerventil|stengeventil|spjeldventil|sluseventil|kuleventil|gate valve|ball valve)\b/, "Produkten är en avstängningsventil för vatten/sprinkler.", reasons);
    score += scoreButterflyValveOperation(candidateText, requirement, reasons, warnings);
    if (/\b(alarmkit|pakningssett|reservedel|skilt)\b/.test(candidateText)) {
      score -= 65;
      warnings.push("Träffen är ett tillbehör eller en reservdel, inte en komplett ventil.");
    }
  } else if (requirement.intent === "sprinkler_hose") {
    const isHose = /\b(sprinklerslange|sprinkler slange|fleksibelslange|flexislange|flexible sprinkler hose|braided hose|vicflex|dryflex)\b/.test(candidateText);
    const isHoseAccessory = /\b(bend|nippel|stuss)\b.{0,40}\b(?:t|f|for)\b.{0,20}\b(sprinklersl|sprinklerslange|vicflex)\b/.test(candidateName);
    if (isHose && !isHoseAccessory) {
      score += 65;
      reasons.push("Produkttypen är en flexibel sprinklerslang.");
    }
    if (isHoseAccessory) {
      score -= 70;
      warnings.push("Träffen är ett tillbehör till en sprinklerslang, inte en komplett slang.");
    }
    if (/\bsprinkler\b/.test(candidateText)) {
      score += 10;
      reasons.push("Produkten är avsedd för sprinklerinstallation.");
    }
    if (!isHose) {
      score -= wrongFamilyPenalty(
        candidateName,
        /\b(konstruksjonsror|rillede ror|stalror|t ror|tee|kupling|kobling|bend|ventil)\b/,
        "Träffen är ett rör eller en rördel och inte en flexibel sprinklerslang.",
        warnings
      );
    }
    if (requirement.dn !== null && extractDnValues(candidateText).length === 0) {
      score -= 25;
      warnings.push(`Slangens anslutningsdimension saknas; PDF-kravet anger DN${requirement.dn}.`);
    }
  } else if (requirement.intent === "pipe") {
    if (isRigidPipeProduct(candidate.productName)) {
      score += 65;
      reasons.push('Produkten är en rörlängd.');
    }
    score -= wrongFamilyPenalty(candidateName, /\b(bend|t ror|kupling|ventil|flensadapter|anboringsklammer)\b/, "Träffen är en rördel och inte en rörlängd.", warnings);
  } else if (requirement.intent === "coupling") {
    score += scoreNamedProductFamily(candidateName, PRODUCT_FAMILY_PATTERNS.coupling!, "Produkttypen är en rörkoppling.", reasons);
    score -= wrongFamilyPenalty(candidateName, /\b(spjeldventil|bend|t ror|endelokk)\b/, "Träffen är inte en rillkoppling.", warnings);
  } else if (requirement.intent === "flanged_bend") {
    if (/\b(flensebend|flensbend|bend)\b/.test(candidateText)) {
      score += 45;
      reasons.push("Produkttypen är en rörböj med flänsanslutning.");
    }
    if (requirement.expectsSteel && /\b(duktil|stopejern|gjutjarn)\b/.test(candidateText)) {
      score -= 35;
      warnings.push("PDF-kravet anger stål, men Ahlsell-träffen är av duktilt gjutjärn.");
    }
  } else if (requirement.intent === "bend") {
    score += scoreNamedProductFamily(candidateName, PRODUCT_FAMILY_PATTERNS.bend!, "Produkttypen är en rörböj.", reasons);
  } else if (requirement.intent === "tee") {
    score += scoreNamedProductFamily(candidateName, PRODUCT_FAMILY_PATTERNS.tee!, "Produkttypen är ett T-rör.", reasons);
  } else if (requirement.intent === "reducer") {
    score += scoreNamedProductFamily(candidateName, /\b(reduksjon|reduksjonskupling|redusert|reducer)\b/, "Produkttypen är en dimensionsreduktion.", reasons);
  } else if (requirement.intent === "cap") {
    score += scoreNamedProductFamily(candidateName, PRODUCT_FAMILY_PATTERNS.cap!, "Produkttypen är ett ändlock eller en plugg.", reasons);
  } else if (requirement.intent === "branch") {
    score += scoreNamedProductFamily(candidateName, /\b(anboringsklammer|utlopskupling|mekanisk t|branch)\b/, "Produkttypen skapar ett avstick på röret.", reasons);
  } else if (requirement.intent === "flange_adapter") {
    score += scoreNamedProductFamily(candidateName, /\b(flensadapter|flenseadapter|flens overgang)\b/, "Produkttypen är en flänsadapter.", reasons);
  } else if (requirement.intent === "pump") {
    score += scoreNamedProductFamily(candidateName, /\b(?:lense|grunnvanns?|avlops?|sprinkler)?pumpe\b|\bpump\b/, "Produkttypen är en pump.", reasons);
    if (/\b(avlopsvann|neddykket)\b/.test(requirement.text) && /\blensepumpe\b/.test(candidateName)) {
      score += 15;
      reasons.push("Länspump stämmer med det angivna avloppsvattnet/nedsänkta utförandet.");
    }
    if (/\bavlopsvann\b/.test(requirement.text) && /\bgrunnvannspumpe\b/.test(candidateName)) {
      score -= 30;
      warnings.push("Träffen är en grundvattenpump; PDF-posten anger avloppsvatten.");
    }
  } else if (requirement.intent === "strainer") {
    score += scoreNamedProductFamily(candidateName, /\b(grovfilter|y filter|sil|filter)\b/, "Produkttypen är en sil eller ett filter.", reasons);
  } else if (requirement.intent === "water_meter") {
    score += scoreNamedProductFamily(candidateName, /\b(vannmaler|vannkapasitetsmaler|water meter)\b/, "Produkttypen är en vattenmätare.", reasons);
  } else if (requirement.intent === "sensor_pocket") {
    score += scoreNamedProductFamily(candidateName, /\b(folerlomme|sensorlomme|thermowell)\b/, "Produkttypen är en givarficka.", reasons);
  } else if (requirement.intent === "sprinkler_cabinet") {
    score += scoreNamedProductFamily(candidateName, /\b(sprinklerskap|skap|cabinet)\b/, "Produkttypen är ett skåp för reservsprinkler.", reasons);
  } else if (requirement.intent === "support") {
    score += scoreNamedProductFamily(candidateName, /\b(roroppheng|rorklammer|oppheng|support)\b/, "Produkttypen är ett rörupphängningstillbehör.", reasons);
  } else if (requirement.intent === "test_drain") {
    score += scoreNamedProductFamily(candidateName, /\b(test.*drener|drener.*test|testventil|inspector)\b/, "Produkttypen är ett test- och dräneringsarrangemang.", reasons);
  } else if (requirement.intent === "flushing_connection") {
    score += scoreNamedProductFamily(candidateName, /\b(spjeldventil|kuleventil|stengeventil|spyleventil|butterfly valve|ball valve)\b/, "Produkten är en möjlig ventilkomponent för spolanslutningen.", reasons);
  } else if (requirement.intent === "sprinkler_guard") {
    if (/\b(sprinkler.*gitter|gitter.*sprinkler|beskyttelsesgitter|skyddskorg)\b/.test(candidateText)) {
      score += 80;
      reasons.push("Produkten är ett skyddsgaller för sprinklerhuvud.");
    }
  } else if (requirement.intent === "sprinkler_head") {
    if (isSprinklerHeadText(candidateText)) {
      score += 25;
      reasons.push("Produkten är ett sprinklerhuvud.");
    }
    if (/\b(gitter|skyddskorg|dekkplate|rosett|nokkel)\b/.test(candidateText)) {
      score -= 70;
      warnings.push("Träffen är ett tillbehör och inte ett sprinklerhuvud.");
    }
    score += scoreSprinklerAttributes(candidateText, candidateName, requirement, reasons, warnings);
  } else if (requirement.intent === "custom_fabrication") {
    warnings.push("Posten verkar vara specialtillverkad och måste verifieras via offert eller manuellt produktval.");
  } else if (requirement.intent === "key_switch" || requirement.intent === "valve_actuator") {
    score += scoreNamedProductFamily(mainProductText(candidate.productName), PRODUCT_FAMILY_PATTERNS[requirement.intent]!, "Produkten tillhör den efterfrågade produktgruppen.", reasons);
    warnings.push("Verifiera funktion och kompatibilitet med den utrustning som produkten ska anslutas till.");
  }

  if (hasAhlsellProductFamilyMismatch(requirement.intent, candidate.productName)) {
    warnings.push("Fel produkttyp: träffen motsvarar inte den huvudprodukt som PDF-posten kräver.");
  }
  if (requirement.intent === "pipe" && /\b(?:[ty] ror|grenror|tee|sprinkler t|anb klammer)\b/.test(candidateName)) {
    warnings.push("Fel produkttyp: en grenrörsdel är inte en rak rörlängd.");
  }
  if (requirement.intent !== "manifold_cabinet") {
    score += scoreDimension(dimensionText, requirement, reasons, warnings);
    score += scorePressure(candidateText, requirement, reasons, warnings);
    score += scoreMaterialAndJoint(candidateText, requirement, reasons, warnings, materialText, jointText);
  }

  const completeEvidence = hasCompleteTechnicalEvidence(candidateText, candidateName, requirement, dimensionText, materialText, jointText);
  if (!completeEvidence && warnings.length === 0) {
    warnings.push("Alla nödvändiga tekniska uppgifter är inte verifierade. Kontrollera postens krav och den valda artikelvarianten.");
  }
  const matchScore = Math.max(0, Math.min(100, score));
  const requiresAccessoryReview = requirement.requiresAccessoryReview;
  const recommendation = matchScore >= 75 && warnings.length === 0 && !requiresAccessoryReview
    ? "recommended"
    : matchScore >= 35 ? "possible" : "unlikely";
  const exactMatch = completeEvidence && !requiresAccessoryReview && !candidate.requiresProductSelection && warnings.length === 0 && (candidate.exactMatch === true || (
    recommendation === "recommended"
    && matchScore === 100
    && warnings.length === 0
    && hasCompleteTechnicalEvidence(candidateText, candidateName, requirement)
  ));
  return withTechnicalConflictAssessment({ ...candidate, matchScore, matchReasons: reasons,
    matchWarnings: [...new Set(warnings)], recommendation, exactMatch, requiresAccessoryReview });
}

const SHOWER_PRODUCT_PATTERN = /\b(?:dusj|dusch|handdusj|handdusch|dusjsett|duschset|duschpaket|dusjbatteri|duschblandare|dusjarmatur|duscharmatur|dusjstang|duschstang|dusjhode|duschhuvud|dusjsete|duschsits|shower)\b/;

const PRODUCT_FAMILY_PATTERNS: Partial<Record<ProductIntent, RegExp>> = {
  key_switch: /\b(nokkelbryter|nokkelboks|nyckelbrytare|nyckelbox|key switch|key box)\b/,
  valve_actuator: /\b(aktuator|actuator|ventilmotor)\b/,
  custom_fabrication: /\b(dren(?:erings)?kar|utjevningskar|oppsamlingskar)\b/,
  check_valve: /\b(tilbakeslagsventil|backventil|check valve)\b/,
  pressure_reducing_valve: /\b(trykkreduksjonsventil|reduksjonsventil|pressure reducing valve)\b/,
  bend: /\b(bend|albue|rorboy|elbow|flensebend|flensbend)\b/,
  flanged_bend: /\b(bend|rorboy|elbow|flensebend|flensbend)\b/,
  tee: /\b(t ror|tee|sprinkler t|t stykke)\b/,
  reducer: /\b(reduksjon|reduksjonskupling|redusert|reducer|overgang)\b/,
  cap: /\b(endelokk|endebunn|blindflens|plugg|cap)\b/,
  coupling: /\b(kupling|kobling|coupling|muffe)\b/,
  branch: /\b(anboringsklammer|anb klammer|utlopskupling|mekanisk t|branch)\b/,
  flange_adapter: /\b(flensadapter|flenseadapter|flens overgang)\b/,
  alarm_device: /\b(alarmgiver|alarmapparat|alarmkit|alarmpressostat|pressostat|pressure switch)\b/,
  flow_meter: /\b(kapasitetsmaler|stromningsmaler|flowmeter|flow meter|gapmeter|gap meter)\b/,
  pressure_switch: /\b(pressostat|trykkvakt|trykkbryter|pressure switch)\b/,
  shutoff_valve: /\b(sprinklerventil|stengeventil|spjeldventil|sluseventil|kuleventil|gate valve|ball valve)\b/,
  toilet: /\b(klosett|toalett(?:modul|kassett)?|wc|toilet)\b/,
  shower_set: SHOWER_PRODUCT_PATTERN,
  pipe: /\b(ror|stalror|sprinklerror|konstruksjonsror|red pipe|pipe)\b/,
  wet_alarm_valve: /\b(sprinklersentral|alarmventil|alarm valve|alarm check valve)\b/,
  dry_alarm_valve: /\b(sprinklersentral|sprinklerventil|alarmventil|dry valve)\b/,
  ball_valve: /\b(kuleventil|ball valve)\b/,
  butterfly_valve: /\b(spjeldventil|butterfly valve)\b/,
  pump: /\b(?:lense|grunnvanns?|avlops?|sprinkler)?pumpe\b|\bpump\b/,
  strainer: /\b(grovfilter|y filter|sil|filter|strainer|partikkelutskiller)\b/,
  manometer: /\b(manometer|pressure gauge)\b/,
  water_meter: /\b(vannmaler|vannkapasitetsmaler|water meter)\b/,
  sensor_pocket: /\b(folerlomme|sensorlomme|thermowell)\b/,
  flushing_connection: /\b(spjeldventil|kuleventil|stengeventil|spyleventil|butterfly valve|ball valve)\b/,
  sprinkler_cabinet: /\b(sprinklerskap|skap|cabinet)\b/,
  test_drain: /\b(test.*drener|drener.*test|testventil|inspector|test.*drain|spyleventil)\b/
};

/** Family compatibility is necessary, but does not verify a complete assembly. */
export function hasAhlsellProductFamilyMismatch(intent: ProductIntent, productName: string) {
  if (intent === "pipe") return !isRigidPipeProduct(productName);
  if (intent === "manifold_cabinet") return !isManifoldCabinetProduct(productName);
  if (intent === "sprinkler_head") {
    const main = mainProductText(productName);
    return isAhlsellSignageCandidate({productName, specifications: []})
      || /\b(?:ventil|spjeldventil|kuleventil|rorklammer|oppheng|rosett|dekkplate|gitter|sprinklerslange|sprinklerklokke|sprinkelklokke|nokkel|kupling)\b/.test(main)
      || !/\b(?:sprinkler(?:hode[rt]?|huvud| head)?|sprinkelhode[rt]?|v\d{4})\b/.test(main);
  }
  const pattern = PRODUCT_FAMILY_PATTERNS[intent];
  return pattern !== undefined && (!pattern.test(mainProductText(productName))
    || isAhlsellSignageCandidate({ productName, specifications: [] }));
}

function hasCompleteTechnicalEvidence(
  candidateText: string,
  candidateName: string,
  requirement: TechnicalProfile,
  dimensionText = candidateText,
  materialText = candidateText,
  jointText = candidateText
) {
  if (missingProductGroupRequirements(requirement).length) return false;
  if (requirement.dn !== null) {
    const candidateDns = extractDnValues(dimensionText);
    const diameterMatches = requirement.outsideDiameter !== null
      && new RegExp(`\\b${String(requirement.outsideDiameter).replace(".", "[.,]")}\\s*(?:mm)?\\b`).test(dimensionText);
    if (!candidateDns.includes(requirement.dn) && !diameterMatches) return false;
  }
  if (requirement.intent === 'pipe' && requirement.dn === null && requirement.outsideDiameter !== null
    && extractOutsideDiameter(dimensionText) !== requirement.outsideDiameter) return false;
  if (requirement.pn !== null) {
    const barMatches = new RegExp(`\\b${requirement.pn}\\s*bar\\b`).test(candidateText);
    if (!candidatePressureClasses(candidateText).some(pn => pn === requirement.pn || requirement.minimumPressureClass && pn >= requirement.pn!) && !barMatches) return false;
  }
  if (requirement.kFactor !== null) {
    const candidateK = extractKFactor(candidateText);
    if (candidateK === null || !sprinklerKFactorMatches(requirement.kFactor, candidateK)) return false;
  }
  if (requirement.temperatureC !== null) {
    const candidateTemperature = extractTemperature(candidateText);
    if (candidateTemperature === null || !closeEnough(candidateTemperature, requirement.temperatureC)) return false;
  }
  if (requirement.response && extractSprinklerResponse(candidateText) !== requirement.response) return false;
  if (requirement.orientation) {
    const orientation = candidateOrientation(candidateName, candidateText);
    if (orientation !== requirement.orientation && !(orientation === "upright_pendent" && requirement.orientation !== "sidewall")) return false;
  }
  const mountCapabilities = sprinklerMountCapabilities(candidateText);
  if (requirement.mount !== null && !mountCapabilities.has(requirement.mount)) return false;
  if (requirement.visibleMount && mountCapabilities.has("concealed") && !mountCapabilities.has("recessed")) return false;
  if (requirement.finish && extractFinish(candidateText) !== requirement.finish) return false;
  if (!sprinklerHeadTypeMatches(candidateText, requirement.sprinklerHeadType)) return false;
  if (requirement.material && extractMaterial(materialText) !== requirement.material) return false;
  if (requirement.joint && !extractJointTypes(jointText).some(joint => requirement.allowedJoints.includes(joint))
    && !(requirement.allowsGroovedPipe && extractJointTypes(jointText).includes("grooved"))) return false;
  if (requirement.intent === "sprinkler_head") {
    if ([requirement.kFactor, requirement.dn, requirement.temperatureC, requirement.response, requirement.orientation].some((value) => value === null)) return false;
    if (requirement.sprinklerSystem === null || requirement.sprinklerHeadType === null || requirement.coverage === null) return false;
    const candidateCoverage = sprinklerCoverageFromText(candidateText);
    if (!sprinklerCoverageMatches(requirement.coverage, candidateCoverage)) return false;
    if (requirement.requiresAccessoryReview || requirement.requiresHydraulicReview) return false;
    const restriction = sprinklerSystemRestriction(candidateText);
    if (requirement.sprinklerSystem === "dry" && restriction === "wet_only") return false;
    if (requirement.sprinklerSystem === "wet" && restriction === "dry_only") return false;
  }
  return true;
}

/** Critical fields differ by main product; missing values cannot earn a green score. */
function missingProductGroupRequirements(profile: TechnicalProfile): string[] {
  if (profile.intent === "sprinkler_head") {
    return ([
      [profile.dn, "gängdimension"], [profile.kFactor, "K-faktor"],
      [profile.temperatureC, "utlösningstemperatur"], [profile.response, "responstid"],
      [profile.orientation, "monteringsriktning"], [profile.sprinklerSystem, "anläggningstyp"],
      [profile.sprinklerHeadType, "sprinklerutförande"], [profile.coverage, "täckningsklass"]
    ] as const).filter(([value]) => value === null).map(([, label]) => label);
  }
  const dimensionedGroups: ProductIntent[] = ["pipe", "ball_valve", "butterfly_valve", "shutoff_valve", "check_valve",
    "wet_alarm_valve", "dry_alarm_valve", "pressure_reducing_valve", "coupling", "bend", "flanged_bend", "tee", "reducer", "cap", "branch", "flange_adapter"];
  return dimensionedGroups.includes(profile.intent) && profile.dn === null
    && !(profile.intent === 'pipe' && profile.outsideDiameter !== null) ? ["anslutningsdimension"] : [];
}

function scoreWetAlarmValve(candidateText: string, reasons: string[], warnings: string[], requirementText: string, signage: boolean) {
  let score = 0;
  const sparePart = /\b(pakningssett|reservedel|spare part)\b/.test(candidateText);
  if (/\bsprinklersentral\b/.test(candidateText) && !signage && !sparePart) {
    score += 30;
    reasons.push("Produkten är en komplett sprinklersentral.");
  }
  if (/\b(vat|wet)\b/.test(candidateText)) {
    score += 25;
    reasons.push("Utförandet är avsett för vått sprinklersystem.");
  }
  if (/\b(alarm|brannalarm)\b/.test(candidateText)) {
    score += 15;
    reasons.push("Produktbeskrivningen anger alarmfunktion.");
  }
  if (/\b(?:s|v|series)\s*751\b/.test(candidateText)) {
    score += 10;
    reasons.push("Series 751 är en alarmbackventil för våta system.");
  }
  if (/\b(torr|dry)\b/.test(candidateText)) {
    score -= 60;
    warnings.push("Produkten är avsedd för torrt system, men PDF-kravet anger vått system.");
  }
  if (/\b(sluseventil(?:er)?|gate valve)\b/.test(candidateText)) {
    score -= 40;
    warnings.push("Produkten är en avstängningsventil och inte ett komplett alarmventilset.");
  }
  if (/\bbolig\b/.test(candidateText) && !/\bbolig\b/.test(requirementText)) {
    score -= 25;
    warnings.push("Produkten är beskriven för bostadssystem, vilket inte anges i PDF-kravet.");
  }
  if (signage) {
    score -= 60;
  }
  if (sparePart) {
    score -= 40;
    warnings.push("Träffen är en reservdel och inte ett komplett ventilset.");
  }
  return score;
}

function scoreNamedProductFamily(
  candidateText: string,
  pattern: RegExp,
  reason: string,
  reasons: string[]
) {
  if (!pattern.test(candidateText)) return 0;
  reasons.push(reason);
  return 65;
}

function wrongFamilyPenalty(
  candidateText: string,
  pattern: RegExp,
  warning: string,
  warnings: string[]
) {
  if (!pattern.test(candidateText)) return 0;
  warnings.push(warning);
  return 55;
}

function scoreSprinklerAttributes(candidateText: string, candidateName: string, requirement: TechnicalProfile, reasons: string[], warnings: string[]) {
  let score = 0;
  const candidateK = extractKFactor(candidateText);
  if (requirement.kFactor !== null && candidateK !== null) {
    if (sprinklerKFactorMatches(requirement.kFactor, candidateK)) {
      score += 25;
      reasons.push(`K-faktorn är K${formatNumber(candidateK)}.`);
    } else {
      score -= 55;
      warnings.push(`Fel K-faktor: PDF kräver K${formatNumber(requirement.kFactor)}, träffen anger K${formatNumber(candidateK)}.`);
    }
  } else if (requirement.kFactor !== null) {
    warnings.push(`K-faktorn saknas i produktinformationen; PDF kräver K${formatNumber(requirement.kFactor)}.`);
  }
  const candidateTemperature = extractTemperature(candidateText);
  if (requirement.temperatureC !== null && candidateTemperature !== null) {
    if (closeEnough(requirement.temperatureC, candidateTemperature)) {
      score += 15;
      reasons.push(`Utlösningstemperaturen är ${formatNumber(candidateTemperature)} °C.`);
    } else {
      score -= 35;
      warnings.push(`Fel temperatur: PDF kräver ${formatNumber(requirement.temperatureC)} °C, träffen anger ${formatNumber(candidateTemperature)} °C.`);
    }
  } else if (requirement.temperatureC !== null) {
    warnings.push(`Utlösningstemperaturen saknas i produktinformationen; PDF kräver ${formatNumber(requirement.temperatureC)} °C.`);
  }
  if (requirement.response) {
    const candidateResponse = extractSprinklerResponse(candidateText);
    if (candidateResponse === requirement.response) {
      score += 12;
      reasons.push(requirement.response === "standard" ? "Standardrespons stämmer." : "Quick response stämmer.");
    } else if (candidateResponse) {
      score -= 35;
      warnings.push("Sprinklerns responstid stämmer inte med PDF-kravet.");
    } else {
      warnings.push("Sprinklerns responstid saknas i produktinformationen.");
    }
  }
  if (requirement.orientation) {
    const orientation = candidateOrientation(candidateName, candidateText);
    if (orientation === requirement.orientation || (orientation === "upright_pendent" && requirement.orientation !== "sidewall")) {
      score += 15;
      reasons.push("Monteringsriktningen stämmer med PDF-kravet.");
    } else if (orientation) {
      score -= 45;
      warnings.push("Sprinklerns monteringsriktning stämmer inte med PDF-kravet.");
    } else {
      warnings.push("Sprinklerns monteringsriktning saknas i produktinformationen.");
    }
  }
  if (requirement.mount === null && requirement.visibleMount) {
    const candidateMounts = sprinklerMountCapabilities(candidateText);
    if (candidateMounts.has("concealed")) {
      score -= 70;
      warnings.push("PDF-kravet anger synligt montage, men träffen är en dold sprinkler med täcklock.");
    } else if (isSprinklerHeadText(candidateText)) {
      score += 15;
      reasons.push("Sprinklerhuvudet är ett synligt pendent-/standardutförande.");
    }
  }
  score += scoreSprinklerMount(candidateText, requirement, reasons, warnings);
  score += scoreSprinklerHeadType(candidateText, requirement, reasons, warnings);
  score += scoreSprinklerSystem(candidateText, requirement, reasons, warnings);
  if (requirement.coverage) {
    const candidateCoverage = sprinklerCoverageFromText(candidateText);
    if (sprinklerCoverageMatches(requirement.coverage, candidateCoverage)) {
      score += 10;
      reasons.push("Sprinklerns täcknings-/applikationsklass stämmer med PDF-kravet.");
    } else {
      score -= 35;
      warnings.push(candidateCoverage !== null
        ? `Fel täcknings-/applikationsklass: PDF kräver ${requirement.coverage}, produkten anger ${candidateCoverage}.`
        : requirement.coverage.startsWith("extended")
        ? "PDF-kravet anger extended coverage, men produktinformationen bekräftar inte rätt täcknings-/applikationsklass."
        : "Produktens täcknings-/applikationsklass stämmer inte med PDF-kravet eller saknar verifierbart underlag.");
    }
  }
  if (requirement.requiresHydraulicReview) {
    warnings.push("Hydrauliska villkor och produktens listning måste verifieras innan slutligt produktval.");
  }
  if (requirement.dn === 15 && (requirement.kFactor ?? 0) >= 115) {
    score -= 25;
    warnings.push(`K${formatNumber(requirement.kFactor ?? 0)} tillsammans med DN15 måste verifieras; Ahlsells motsvarande familjer använder normalt större anslutning.`);
  }
  if (requirement.finish) {
    const candidateFinish = extractFinish(candidateText);
    if (candidateFinish === requirement.finish) {
      score += 5;
      reasons.push("Ytfinish/färg stämmer.");
    } else if (candidateFinish) {
      score -= 15;
      warnings.push("Färg eller ytfinish stämmer inte med PDF-kravet.");
    }
  }
  return score;
}

function candidateOrientation(productName: string, candidateText: string): TechnicalProfile["orientation"] | "upright_pendent" {
  // Ahlsell descriptions often contain phrases such as "opp til 19 mm". Only
  // interpret the short words Opp/Ned as orientation when they occur in the
  // product name. Longer, unambiguous terms may safely come from all fields.
  const nameHasUpright = /(?:^|\s|-)(opp)(?:\s|$|-)/.test(productName) || /\bssu\b/.test(productName);
  const nameHasPendent = /(?:^|\s|-)(ned)(?:\s|$|-)/.test(productName) || /\b(?:ssp|pen)\b/.test(productName);
  const nameSignals = sprinklerOrientationSignals(productName);
  const candidateSignals = sprinklerOrientationSignals(candidateText);
  if (nameSignals.hasSidewall || candidateSignals.hasSidewall) return "sidewall";
  // Explicit dual-mount labels describe supported orientations, not missing
  // evidence. Recessed/concealed mounting is still checked independently.
  if (/\b(?:opp|upp)\s+(?:og\s+|och\s+)?(?:ned|ner)\b/.test(productName)
    || /\b(?:ssp|sp)\s+ssu\b/.test(candidateText)) return "upright_pendent";
  if (nameHasUpright !== nameHasPendent) return nameHasUpright ? "upright" : "pendent";
  if (candidateSignals.hasUpright !== candidateSignals.hasPendent) {
    return candidateSignals.hasUpright ? "upright" : "pendent";
  }
  return null;
}

function scoreSprinklerMount(
  candidateText: string,
  requirement: TechnicalProfile,
  reasons: string[],
  warnings: string[]
) {
  if (requirement.mount === null) return 0;
  const candidateMounts = sprinklerMountCapabilities(candidateText);

  if (requirement.visibleMount && candidateMounts.has("concealed") && !candidateMounts.has("recessed")) {
    warnings.push("PDF-kravet anger synligt infällt montage, men träffen är en dold sprinkler med täcklock.");
    return -70;
  }
  if (candidateMounts.has(requirement.mount)) {
    reasons.push(requirement.mount === "recessed"
      ? "Produkten är dokumenterad för infällt pendentmontage."
      : "Produkten är dokumenterad för dolt montage med täcklock.");
    return 30;
  }
  if (candidateMounts.has("surface")) {
    warnings.push(requirement.mount === "recessed"
      ? "PDF-kravet anger infällt pendentmontage, men träffen är en konventionell upp/ned-modell utan dokumenterat infällt montage."
      : "PDF-kravet anger dolt montage, men träffen är inte en concealed-modell.");
    return -65;
  }
  if (candidateMounts.size > 0) {
    warnings.push(requirement.mount === "recessed"
      ? "PDF-kravet anger infällt montage, men produktens montageutförande stämmer inte."
      : "PDF-kravet anger dolt montage, men produktens montageutförande stämmer inte.");
    return -60;
  }

  warnings.push(requirement.mount === "recessed"
    ? "Produktinformationen bekräftar inte att sprinklern får monteras infälld."
    : "Produktinformationen bekräftar inte att sprinklern är avsedd för dolt montage.");
  return -20;
}

function scoreSprinklerSystem(
  candidateText: string,
  requirement: TechnicalProfile,
  reasons: string[],
  warnings: string[]
) {
  if (requirement.sprinklerSystem === null) return 0;
  const restriction = sprinklerSystemRestriction(candidateText);
  if (requirement.sprinklerSystem === "dry" && restriction === "wet_only") {
    warnings.push("Produkten är endast dokumenterad för våtanläggning, men PDF-kravet anger torranläggning.");
    return -60;
  }
  if (requirement.sprinklerSystem === "wet" && restriction === "dry_only") {
    warnings.push("Produkten är endast dokumenterad för torranläggning, men PDF-kravet anger våtanläggning.");
    return -60;
  }
  if (restriction !== null) {
    reasons.push("Produktens uttryckliga systemvillkor stämmer med anläggningstypen.");
    return 8;
  }
  // A normal sprinkler kan användas i ett torrörssystem. Anläggningstypen får
  // därför inte feltolkas som att själva sprinklerhuvudet måste vara dry-type.
  return 0;
}

function scoreDimension(candidateText: string, requirement: TechnicalProfile, reasons: string[], warnings: string[]) {
  if (requirement.intent === 'pipe' && requirement.dn === null && requirement.outsideDiameter !== null) {
    const diameter = extractOutsideDiameter(candidateText);
    if (diameter !== null && closeEnough(diameter, requirement.outsideDiameter)) {
      reasons.push(`Rörets ytterdiameter är ${diameter} mm.`);
      return 25;
    }
    warnings.push(diameter === null ? `Produktens dimension saknas; PDF kräver ytterdiameter ${requirement.outsideDiameter} mm.`
      : `Fel dimension: PDF kräver ytterdiameter ${requirement.outsideDiameter} mm, träffen anger ${diameter} mm.`);
    return diameter === null ? 0 : -45;
  }
  if (requirement.dn === null) return 0;
  const candidateDns = extractDnValues(candidateText);
  const candidateDn = candidateDns[0] ?? null;
  const diameterMatches = requirement.outsideDiameter !== null
    && new RegExp(`\\b${String(requirement.outsideDiameter).replace(".", "[.,]")}\\s*(?:mm)?\\b`).test(candidateText);
  // An explicit DN for another variant cannot be overridden by an incidental
  // diameter elsewhere in the product text.
  if (candidateDns.includes(requirement.dn) || (candidateDn === null && diameterMatches)) {
    reasons.push(`Dimensionen motsvarar DN${requirement.dn}${requirement.outsideDiameter ? ` (${String(requirement.outsideDiameter).replace(".", ",")} mm)` : ""}.`);
    return 25;
  }
  if (candidateDn !== null) {
    if (isLikelyConventionalK80DnCorrection(requirement, candidateDn)) {
      warnings.push("PDF-kravet anger DN25 för en konventionell K80-sprinkler. Ahlsell-familjen använder DN15; träffen visas som korrigeringsförslag och måste bekräftas.");
      return -20;
    }
    warnings.push(`Fel dimension: PDF kräver DN${requirement.dn}, träffen anger DN${candidateDn}.`);
    return -45;
  }
  const explicitDiameters = [...candidateText.matchAll(/\b(\d{1,3}[.,]\d+)\s*mm\b/g)].map(match => Number(match[1].replace(",", ".")))
    .filter(diameter => Object.values(PIPE_OUTSIDE_DIAMETER_BY_DN).some(known => closeEnough(known, diameter)));
  if (requirement.outsideDiameter !== null && explicitDiameters.length > 0 && !explicitDiameters.some(diameter => closeEnough(diameter, requirement.outsideDiameter!))) {
    warnings.push(`Fel dimension: PDF kräver DN${requirement.dn} (${requirement.outsideDiameter} mm); träffen anger ${explicitDiameters.join(" / ")} mm.`);
    return -45;
  }
  warnings.push(`Produktens dimension saknas; PDF kräver DN${requirement.dn}.`);
  return 0;
}

function scorePressure(candidateText: string, requirement: TechnicalProfile, reasons: string[], warnings: string[]) {
  if (requirement.pn === null) return 0;
  const candidatePn = numberAfterLabel(candidateText, /\bpn\s*(\d{1,3})\b/);
  const pressurePattern = new RegExp(`\\b${requirement.pn}\\s*bar\\b`);
  if (candidatePressureClasses(candidateText).some(pn => pn === requirement.pn || requirement.minimumPressureClass && pn >= requirement.pn!) || pressurePattern.test(candidateText)) {
    reasons.push(`Produktinformationen anger PN${requirement.pn}/${requirement.pn} bar.`);
    return 10;
  }
  if (candidatePn !== null && !candidateText.includes(`pn ${requirement.pn}`)) {
    warnings.push(`Tryckklass måste kontrolleras: PDF kräver PN${requirement.pn}, träffen anger PN${candidatePn}.`);
    return -20;
  }
  warnings.push(`Produktens tryckklass saknas; PDF kräver PN${requirement.pn}.`);
  return 0;
}

function candidatePressureClasses(text: string): number[] {
  return [...text.matchAll(/\bpn\s*(\d{1,3})(?:\s*\/\s*(\d{1,3}))?/g)]
    .flatMap(match => match.slice(1).filter(Boolean).map(Number));
}

function scoreButterflyValveOperation(
  candidateText: string,
  requirement: TechnicalProfile,
  reasons: string[],
  warnings: string[]
) {
  let score = 0;
  const isSeries705 = /\b(?:vic(?:tualic)?\s*)?(?:series\s*)?705\b/.test(candidateText);
  const supervisedOpen = isSeries705
    || /\b(supervised open|overvaket apen|apen overvaking|apen overvakning)\b/.test(candidateText);
  const supervisedClosed = /\b(?:series\s*)?707c\b|\bsupervised closed\b|\bovervaket stengt\b/.test(candidateText);
  const handwheelOrGear = isSeries705
    || /\b(ratt|handratt|handwheel|gear operator|gear operated|girbetjent|snekkegear)\b/.test(candidateText);
  const lever = /\b(spak|handtak|lever)\b/.test(candidateText);

  if (requirement.requiresSupervisedOpenValve) {
    if (supervisedOpen) {
      score += 30;
      reasons.push("Ventilen är övervakad i öppet normalläge och signalerar när den lämnar öppet läge.");
    } else if (supervisedClosed) {
      score -= 70;
      warnings.push("PDF-kravet avser övervakad öppen ventil, men träffen är övervakad stängd.");
    } else {
      score -= 35;
      warnings.push("PDF-kravet kräver signal/övervakning vid stängning, vilket inte framgår för träffen.");
    }
  }

  if (requirement.requiresHandwheelValve) {
    if (handwheelOrGear) {
      score += 15;
      reasons.push("Manövrering med handratt/växel motsvarar PDF-kravet.");
    } else if (lever) {
      score -= 35;
      warnings.push("PDF-kravet anger manuell betjäning med ratt, men träffen har spak/handtag.");
    } else {
      warnings.push("Manövrering med handratt behöver verifieras mot PDF-kravet.");
    }
  }

  if (requirement.requiresSoftClosingValve) {
    if (handwheelOrGear) {
      score += 10;
      reasons.push("Växlad handratt ger den kontrollerade stängning som posten kräver.");
    } else if (lever) {
      score -= 25;
      warnings.push("Spak/handtag verifierar inte kravet på mjuk, kontrollerad stängning.");
    }
  }

  return score;
}

function scoreMaterialAndJoint(
  candidateText: string,
  requirement: TechnicalProfile,
  reasons: string[],
  warnings: string[],
  materialText = candidateText,
  jointText = candidateText
) {
  let score = 0;
  if (requirement.material) {
    const candidateMaterial = extractMaterial(materialText);
    if (candidateMaterial === requirement.material) {
      score += 10;
      reasons.push("Materialet stämmer med PDF-kravet.");
    } else if (candidateMaterial || /\b(?:epdm|gummi|rubber)\b/.test(materialText)) {
      score -= 55;
      warnings.push("Produktens material stämmer inte med PDF-kravet.");
    } else {
      warnings.push("Produktens material behöver verifieras mot PDF-kravet.");
    }
  }

  if (requirement.joint) {
    const candidateJoints = extractJointTypes(jointText);
    if (candidateJoints.some(joint => requirement.allowedJoints.includes(joint)) || (requirement.allowsGroovedPipe && candidateJoints.includes("grooved"))) {
      score += 10;
      reasons.push("Skarvtypen stämmer med PDF-kravet.");
    } else if (candidateJoints.length > 0) {
      score -= 55;
      warnings.push("Produktens skarv- eller anslutningstyp stämmer inte med PDF-kravet.");
    } else {
      warnings.push("Produktens skarv- eller anslutningstyp behöver verifieras mot PDF-kravet.");
    }
  }
  if (requirement.materialGrade) {
    const grade = stainlessSteelGrade(candidateText);
    if (grade === requirement.materialGrade) {
      reasons.push(`Materialkvalitet ${grade} är angiven för produkten.`);
    } else if (grade) {
      warnings.push(`Fel materialkvalitet: PDF kräver ${requirement.materialGrade}, träffen anger ${grade}. Eventuell likvärdighet måste dokumenteras.`);
      score -= 55;
    } else {
      warnings.push(`Produktens materialkvalitet ${requirement.materialGrade} eller dokumenterad likvärdighet behöver verifieras.`);
    }
  }
  if (requirement.corrosionClass && !new RegExp(`\\b${requirement.corrosionClass.toLowerCase()}\\b`).test(candidateText)) {
    warnings.push(`Korrosionsskydd för kategori ${requirement.corrosionClass} behöver verifieras enligt PDF-posten.`);
  }
  return score;
}

function extractDn(value: string) {
  const explicit = value.match(/\bdn\s*(\d{1,3})\b/)?.[1];
  if (explicit) return Number(explicit);
  const labelled = value.match(/\bdimensjon(?: dn)?\s*(\d{1,3})\b/)?.[1];
  if (labelled) return Number(labelled);
  if (/\b(?:nominell diameter|utvendig gjenge|gjengedimensjon)\s+1\s+2\b/.test(value)) return 15;
  if (/\b(?:nominell diameter|utvendig gjenge|gjengedimensjon)\s+3\s+4\b/.test(value)) return 20;
  if (/\b1\s+2\s+(?:v\d+|sprinkler)/.test(value)) return 15;
  if (/\b3\s+4\s+(?:v\d+|sprinkler)/.test(value)) return 20;
  if (/\b1\s+(?:v\d+|sprinkler)/.test(value)) return 25;
  const connection = value.match(/\butvendig rordiameter tilkobling\s*(\d{1,3})\s*(?:mm)?\b/)?.[1];
  return connection ? Number(connection) : null;
}

function extractDnValues(value: string) {
  const explicit = [...value.matchAll(/\bdn\s*(\d{1,3})\b/g)]
    .map((match) => Number(match[1]));
  if (explicit.length > 0) return [...new Set(explicit)];
  const inferred = extractDn(value);
  return inferred === null ? [] : [inferred];
}

function extractOutsideDiameter(value: string) {
  return numberAfterLabel(value, /\b(?:ytre|utvendig|outside)\s*(?:ror)?\s*diameter\s*[=:]?\s*(\d+(?:[.,]\d+)?)/)
    ?? [...value.matchAll(/\b(\d{1,3}[.,]\d+)\s*mm\b/g)]
      .map(match => Number(match[1].replace(",", ".")))
      .find(diameter => Object.values(PIPE_OUTSIDE_DIAMETER_BY_DN).some(known => closeEnough(known, diameter))) ?? null;
}

function dnFromOutsideDiameter(outsideDiameter: number | null) {
  if (outsideDiameter === null) return null;
  const match = Object.entries(PIPE_OUTSIDE_DIAMETER_BY_DN).find(([, diameter]) => closeEnough(diameter, outsideDiameter));
  return match ? Number(match[0]) : null;
}

function extractKFactor(value: string) {
  return numberAfterLabel(value, /\bk(?: faktor)?\s*(?:k\s*)?-?\s*(\d+(?:[.,]\d+)?)\b/);
}

function extractTemperature(value: string) {
  return numberAfterLabel(value, /\b(?:utlosningstemperatur|responstemperatur|temperature)\s*(\d+(?:[.,]\d+)?)\s*(?:c\b)?/)
    ?? numberAfterLabel(value, /\b(57|68|79|93|100|121|141|182|260)\s*(?:c\b)/);
}

function extractSprinklerResponse(value: string): TechnicalProfile["response"] {
  if (/\b(?:kvikk|hurtig)\s*(?:respons|response)\b|\bquick(?:\s*response)?\b|\bqr\b/.test(value)) {
    return "quick";
  }
  if (/\b(?:standard|normal)\s*(?:respons|response)\b|\bsr\b/.test(value)) {
    return "standard";
  }
  return null;
}

function extractFinish(value: string): TechnicalProfile["finish"] {
  if (/\b(hvit|vit|white)\b/.test(value)) return "white";
  if (/\b(sort|svart|black)\b/.test(value)) return "black";
  if (/\b(krom|chrome)\b/.test(value)) return "chrome";
  if (/\b(messing|massing|mess|brass)\b/.test(value)) return "brass";
  return null;
}

function extractMaterial(value: string): TechnicalProfile["material"] {
  if (/\b(alupex|multilayer|kompositror)\b/.test(value)) return "multilayer";
  if (/\b(pe(?:100|80)?|pehd|hdpe|polyetylen|polyethylene)\b/.test(value)) return "pe";
  if (/\b(pvc|pvc u|polyvinylklorid)\b/.test(value)) return "pvc";
  if (/\b(kobber|kobberror|koppar|copper)\b/.test(value)) return "copper";
  if (/\b(rustfritt|rustfri|rustfrie|rostfritt|rostfri|stainless|304l?|316l?)\b/.test(value)) return "stainless_steel";
  if (/\b(pp\s*r|polypropylen|red pipe)\b/.test(value)) return "ppr";
  if (/\b(duktil|stopejern|gjutjarn)\b/.test(value)) return "ductile_iron";
  if (/\b(messing|massing|brass)\b/.test(value)) return "brass";
  if (/\b(stal|stalror|steel|galvanis(?:ert|erte|erad|ed))\b/.test(value)) return "steel";
  return null;
}

function extractJointTypes(value: string): Array<NonNullable<TechnicalProfile["joint"]>> {
  return pipeJointTypes(value);
}

function extractSprinklerSystem(value: string): TechnicalProfile["sprinklerSystem"] {
  if (/\b(torranlegg|torrt anlegg|dry pipe system|dry system)\b/.test(value)) return "dry";
  if (/\b(vatanlegg|vatt anlegg|wet pipe system|wet system)\b/.test(value)) return "wet";
  return null;
}

function extractRequiredSprinklerHeadType(value: string): TechnicalProfile["sprinklerHeadType"] {
  if (/\b(torrsprinkler|torrorssprinkler|dry sprinkler|dry type sprinkler)\b/.test(value)) return "dry";
  if (/\b(window sprinkler|vindussprinkler|vindu sprinkler|apen sprinkler|open sprinkler|uten termisk element)\b/.test(value)) return "open";
  if (/\b(konvensjonell|konventionell|conventional|spraysprinkler|standard spray|utvidet dekning(?:sareal)?|extended coverage|institusjonssprinkler|institutionssprinkler|korridorsprinkler)\b/.test(value)) return "standard";
  return null;
}

function candidateSprinklerHeadType(value: string): TechnicalProfile["sprinklerHeadType"] {
  const explicitlyNotDry = /\b(not|ikke|ej|inte)\s+(?:a\s+)?(?:dry|torr)(?:\s*type)?\s+sprinkler\b/.test(value);
  if (!explicitlyNotDry && /\b(torrsprinkler|torr sprinkler|torr|dry sprinkler|dry type)\b/.test(value)) return "dry";
  if (/\b(window sprinkler|vindussprinkler|vindu sprinkler|apen sprinkler|open sprinkler|apen sprededyse|open (?:(?:foam|spray) )?nozzle|open spray)\b/.test(value)) return "open";
  if (isSprinklerHeadText(value)) return "standard";
  return null;
}

function sprinklerHeadTypeMatches(
  candidateText: string,
  required: TechnicalProfile["sprinklerHeadType"]
) {
  if (required === null) return true;
  return candidateSprinklerHeadType(candidateText) === required;
}

function scoreSprinklerHeadType(
  candidateText: string,
  requirement: TechnicalProfile,
  reasons: string[],
  warnings: string[]
) {
  if (requirement.sprinklerHeadType === null) return 0;
  const candidateType = candidateSprinklerHeadType(candidateText);
  if (candidateType === requirement.sprinklerHeadType) {
    reasons.push(requirement.sprinklerHeadType === "dry"
      ? "Torrsprinklerutförandet stämmer med PDF-kravet."
      : requirement.sprinklerHeadType === "open"
        ? "Det öppna sprinklerutförandet utan termiskt element stämmer med PDF-kravet."
        : "Sprinklerhuvudets konventionella utförande stämmer med PDF-kravet.");
    return 15;
  }
  if (requirement.sprinklerHeadType === "dry") {
    warnings.push("PDF-kravet anger ett torrsprinklerhuvud, men träffen är en konventionell sprinkler.");
  } else if (requirement.sprinklerHeadType === "open") {
    warnings.push("PDF-kravet anger en öppen sprinkler utan termiskt element, men träffen är inte dokumenterad som öppen modell.");
  } else if (candidateType === "dry") {
    warnings.push("PDF-kravet anger ett konventionellt sprinklerhuvud, men träffen är en torrsprinkler.");
  } else if (candidateType === "open") {
    warnings.push("PDF-kravet anger ett temperaturutlöst sprinklerhuvud, men träffen är en öppen dysa utan termiskt element.");
  } else {
    warnings.push("Produktinformationen bekräftar inte sprinklerhuvudets konstruktion.");
  }
  return -60;
}

function isSprinklerHeadText(value: string) {
  return /\b(sprinklerhode(?:r)?|sprinkelhode(?:r)?|sprinlerlhode(?:r)?|sprinkler head)\b/.test(value);
}

function isLikelyConventionalK80DnCorrection(
  requirement: TechnicalProfile,
  candidateDn: number
) {
  return requirement.intent === "sprinkler_head"
    && requirement.sprinklerHeadType !== "dry"
    && requirement.sprinklerHeadType !== "open"
    && requirement.dn === 25
    && closeEnough(requirement.kFactor ?? 0, 80)
    && candidateDn === 15;
}

function numberAfterLabel(value: string, pattern: RegExp) {
  const raw = value.match(pattern)?.[1];
  if (!raw) return null;
  const parsed = Number(raw.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function flattenText(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(flattenText).join(" ");
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .flatMap(([key, item]) => [key, flattenText(item)])
      .join(" ");
  }
  return "";
}

function attributeText(attributes: Record<string, unknown>, keyPattern: RegExp) {
  return Object.entries(attributes)
    .filter(([key]) => keyPattern.test(normalize(key)))
    .map(([, value]) => flattenText(value))
    .join(" ");
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function normalize(value: string) {
  return value.replace(/\bPN\s*(\d{1,3})\s*\/\s*(\d{1,3})/gi, "PN$1 PN$2")
    .toLowerCase().replace(/æ/g, "ae").replace(/ø/g, "o").replace(/å/g, "a")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9.,]+/g, " ").trim();
}

function closeEnough(left: number, right: number) {
  return Math.abs(left - right) < 0.05;
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : String(value).replace(".", ",");
}
