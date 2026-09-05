import type { AhlsellPublicCandidate } from "@/lib/ahlsell-public-match";
import {
  parseSprinklerKFactor,
  projectRequirementKFactorDisplayValue
} from "@/lib/project-requirement-data-warnings";
import { ns3420ProductFamily } from "@/lib/ns3420-product-classification";
import { sprinklerOrientationSignals } from "@/lib/sprinkler-orientation-lexicon";
import {
  sprinklerCoverageFromText,
  sprinklerCoverageMatches,
  sprinklerKFactorMatches,
  sprinklerMountCapabilities,
  sprinklerNeedsHydraulicReview,
  sprinklerRequiresAccessoryReview,
  sprinklerSystemRestriction,
  type SprinklerCoverageClass
} from "@/lib/sprinkler-technical-rules";

const PIPE_OUTSIDE_DIAMETER_BY_DN: Record<number, number> = {
  15: 21.3, 20: 26.9, 25: 33.7, 32: 42.4, 40: 48.3, 50: 60.3,
  65: 76.1, 80: 88.9, 100: 114.3, 125: 139.7, 150: 168.3, 200: 219.1
};

type ProductIntent = "wet_alarm_valve" | "dry_alarm_valve" | "manometer" | "pressure_switch"
  | "flow_switch" | "ball_valve" | "butterfly_valve" | "shutoff_valve" | "check_valve"
  | "pressure_reducing_valve" | "pipe" | "coupling" | "flanged_bend" | "bend" | "tee"
  | "reducer" | "cap" | "branch" | "flange_adapter" | "pump" | "strainer" | "support"
  | "test_drain" | "sprinkler_head" | "sprinkler_guard" | "sprinkler_hose"
  | "custom_fabrication" | "generic";

type TechnicalProfile = {
  text: string;
  intent: ProductIntent;
  dn: number | null;
  outsideDiameter: number | null;
  pn: number | null;
  kFactor: number | null;
  temperatureC: number | null;
  response: "standard" | "quick" | null;
  orientation: "upright" | "pendent" | "sidewall" | null;
  mount: "recessed" | "concealed" | null;
  visibleMount: boolean;
  sprinklerSystem: "wet" | "dry" | null;
  sprinklerHeadType: "standard" | "dry" | "open" | null;
  expectsSteel: boolean;
  material: "steel" | "ppr" | "brass" | "ductile_iron" | null;
  joint: "threaded" | "grooved" | "fusion" | "flanged" | null;
  coverage: SprinklerCoverageClass | null;
  requiresAccessoryReview: boolean;
  requiresHydraulicReview: boolean;
  finish: "white" | "black" | "chrome" | "brass" | null;
};

export function rankAhlsellCandidates(requirement: Record<string, unknown>, candidates: AhlsellPublicCandidate[]) {
  const profile = requirementProfile(requirement);
  return orderAhlsellCandidatesForDisplay(
    candidates.map((candidate) => scoreCandidate(candidate, profile))
  );
}

export function orderAhlsellCandidatesForDisplay(candidates: AhlsellPublicCandidate[]) {
  return [...candidates].sort((left, right) =>
    confidenceTier(left) - confidenceTier(right)
    || (right.matchScore ?? 0) - (left.matchScore ?? 0)
    || (right.learningEvidence?.supportCount ?? 0) - (left.learningEvidence?.supportCount ?? 0)
    || (right.learningEvidence?.similarityScore ?? 0) - (left.learningEvidence?.similarityScore ?? 0)
    || left.productName.localeCompare(right.productName, "sv")
  );
}

export function isExactAhlsellCandidate(candidate: AhlsellPublicCandidate) {
  if ((candidate.matchWarnings?.length ?? 0) > 0) return false;
  return candidate.exactMatch === true;
}

export type AhlsellCandidateMatchState = "exact" | "review" | "mismatch";

export function ahlsellCandidateMatchState(candidate: AhlsellPublicCandidate): AhlsellCandidateMatchState {
  if (isExactAhlsellCandidate(candidate)) return "exact";
  if ((candidate.matchWarnings?.length ?? 0) > 0 || candidate.recommendation === "unlikely") return "mismatch";
  return "review";
}

function confidenceTier(candidate: AhlsellPublicCandidate) {
  if (isExactAhlsellCandidate(candidate)) return 0;
  if (candidate.source === "pdf_reference" || candidate.source === "public_verified" || candidate.source === "verified_database" || candidate.source === "confirmed_history") return 0;
  if (candidate.recommendation === "recommended") return 1;
  if (candidate.recommendation === "possible") return 2;
  if (candidate.recommendation === "unlikely") return 3;
  return 4;
}

function requirementProfile(requirement: Record<string, unknown>): TechnicalProfile {
  const value = record(requirement.value_json);
  const attributes = record(value.attributes);
  const semanticText = normalize(flattenText({
    category: requirement.category,
    description: requirement.value_text,
    displayName: requirement.display_name,
    unit: value.unit,
    attributes: value.attributes
  }));
  const primaryText = normalize(`${semanticText} ${flattenText(value.sourceText)}`);
  const sourceOnlyText = normalize(`${requirement.value_text ?? ""} ${flattenText(value.sourceText)} ${requirement.source_excerpt ?? ""}`);
  const text = normalize(flattenText(requirement));
  const outsideDiameter = extractOutsideDiameter(primaryText) ?? extractOutsideDiameter(text);
  const dn = extractDn(primaryText) ?? dnFromOutsideDiameter(outsideDiameter) ?? extractDn(text);
  const placementText = normalize(attributeText(attributes, /\b(?:plassering|placering|orientation|montasje|montering|mounting)\b/));
  const deckPlateText = normalize(attributeText(attributes, /\b(?:dekkskive|pyntering|rosett|escutcheon|cover plate)\b/));
  const materialText = normalize(attributeText(attributes, /\b(?:materiale|materialkvalitet|material|ror material)\b/));
  const jointText = normalize(attributeText(attributes, /\b(?:skjot|joint|tilkoblingstype|forbindelse)\b/));
  const sprinklerTypeText = normalize(attributeText(attributes, /\b(?:type sprinkler|sprinklertype|dekning|coverage)\b/));
  const sprinklerSystemText = normalize(attributeText(attributes, /\b(?:sprinkleranlegg|anleggstype|systemtype|sprinkler system)\b/));
  const coverageText = `${sprinklerTypeText} ${primaryText}`;
  const mount = requirementSprinklerMount(placementText, deckPlateText);
  const orientationText = placementText || primaryText;
  const orientationSignals = sprinklerOrientationSignals(orientationText);
  const explicitOrientation = orientationSignals.hasUpright
    ? "upright" as const
    : orientationSignals.hasPendent
      ? "pendent" as const
      : orientationSignals.hasSidewall ? "sidewall" as const : null;
  const orientation = explicitOrientation
    ?? (mount !== null && /\b(tak|himling|ceiling)\b/.test(placementText) ? "pendent" : null);
  const codeIntent = ns3420ProductFamily(flattenText({
    nsCode: value.nsCode,
    requirementKey: requirement.requirement_key
  }));
  return {
    text,
    intent: codeIntent ?? detectIntent(semanticText, text, String(requirement.category ?? "")),
    dn,
    outsideDiameter: outsideDiameter ?? (dn === null ? null : PIPE_OUTSIDE_DIAMETER_BY_DN[dn] ?? null),
    pn: numberAfterLabel(primaryText, /\bpn\s*(\d{1,3})\b/) ?? numberAfterLabel(text, /\bpn\s*(\d{1,3})\b/),
    kFactor: parseSprinklerKFactor(projectRequirementKFactorDisplayValue(requirement))
      ?? extractKFactor(primaryText)
      ?? extractKFactor(text),
    temperatureC: extractTemperature(primaryText) ?? extractTemperature(text),
    response: extractSprinklerResponse(primaryText),
    orientation,
    mount,
    visibleMount: /\b(synlig|visible|eksponert)\b/.test(placementText),
    sprinklerSystem: extractSprinklerSystem(sprinklerSystemText),
    sprinklerHeadType: extractRequiredSprinklerHeadType(sprinklerTypeText),
    expectsSteel: /\b(stalror|stal ror|materiale stal|ror av stal|stal fittings?)\b/.test(primaryText),
    material: extractMaterial(materialText),
    joint: extractJointTypes(jointText)[0] ?? null,
    coverage: sprinklerCoverageFromText(coverageText),
    requiresAccessoryReview: sprinklerRequiresAccessoryReview(attributes, sourceOnlyText),
    requiresHydraulicReview: sprinklerNeedsHydraulicReview(coverageText),
    finish: extractFinish(primaryText)
  };
}

function scoreCandidate(candidate: AhlsellPublicCandidate, requirement: TechnicalProfile): AhlsellPublicCandidate {
  const candidateName = normalize(candidate.productName);
  const candidateText = normalize(flattenText({
    productName: candidate.productName,
    manufacturer: candidate.manufacturer,
    description: candidate.description,
    specifications: candidate.specifications,
    productUrl: candidate.productUrl
  }));
  const reasons: string[] = [];
  const warnings: string[] = [];
  let score = 0;

  if (requirement.intent === "wet_alarm_valve") {
    score += scoreWetAlarmValve(candidateText, reasons, warnings, requirement.text);
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
    score += scoreNamedProductFamily(candidateName, /\b(sprinklerventil|stengeventil|spjeldventil|sluseventil|gate valve)\b/, "Produkten är en avstängningsventil för vatten/sprinkler.", reasons);
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
    score += scoreNamedProductFamily(candidateName, /\b(rillede ror|stalror|sprinklerror|ror[^.]{0,30}lengder|red pipe)\b/, "Produkten är ett rör för sprinkler/rillesystem.", reasons);
    score -= wrongFamilyPenalty(candidateName, /\b(bend|t ror|kupling|ventil|flensadapter|anboringsklammer)\b/, "Träffen är en rördel och inte en rörlängd.", warnings);
  } else if (requirement.intent === "coupling") {
    score += scoreNamedProductFamily(candidateName, /\b(kupling|rillekobling|coupling)\b/, "Produkttypen är en rillkoppling.", reasons);
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
    score += scoreNamedProductFamily(candidateName, /\b(bend|rorboy|elbow)\b/, "Produkttypen är en rörböj.", reasons);
  } else if (requirement.intent === "tee") {
    score += scoreNamedProductFamily(candidateName, /\b(t ror|tee)\b/, "Produkttypen är ett T-rör.", reasons);
  } else if (requirement.intent === "reducer") {
    score += scoreNamedProductFamily(candidateName, /\b(reduksjon|reduksjonskupling|redusert|reducer)\b/, "Produkttypen är en dimensionsreduktion.", reasons);
  } else if (requirement.intent === "cap") {
    score += scoreNamedProductFamily(candidateName, /\b(endelokk|blindflens|plugg|cap)\b/, "Produkttypen är ett ändlock eller en plugg.", reasons);
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
  } else if (requirement.intent === "support") {
    score += scoreNamedProductFamily(candidateName, /\b(roroppheng|rorklammer|oppheng|support)\b/, "Produkttypen är ett rörupphängningstillbehör.", reasons);
  } else if (requirement.intent === "test_drain") {
    score += scoreNamedProductFamily(candidateName, /\b(test.*drener|drener.*test|testventil|inspector)\b/, "Produkttypen är ett test- och dräneringsarrangemang.", reasons);
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
  }

  score += scoreDimension(candidateText, requirement, reasons, warnings);
  score += scorePressure(candidateText, requirement, reasons, warnings);
  score += scoreMaterialAndJoint(candidateText, requirement, reasons, warnings);

  const matchScore = Math.max(0, Math.min(100, score));
  const recommendation = matchScore >= 75 && warnings.length === 0
    ? "recommended"
    : matchScore >= 35 ? "possible" : "unlikely";
  const exactMatch = candidate.exactMatch === true || (
    recommendation === "recommended"
    && matchScore === 100
    && warnings.length === 0
    && hasCompleteTechnicalEvidence(candidateText, candidateName, requirement)
  );
  return { ...candidate, matchScore, matchReasons: reasons, matchWarnings: warnings, recommendation, exactMatch };
}

function hasCompleteTechnicalEvidence(
  candidateText: string,
  candidateName: string,
  requirement: TechnicalProfile
) {
  if (requirement.dn !== null) {
    const candidateDns = extractDnValues(candidateText);
    const diameterMatches = requirement.outsideDiameter !== null
      && new RegExp(`\\b${String(requirement.outsideDiameter).replace(".", "[.,]")}\\s*(?:mm)?\\b`).test(candidateText);
    if (!candidateDns.includes(requirement.dn) && !diameterMatches) return false;
  }
  if (requirement.pn !== null) {
    const candidatePn = numberAfterLabel(candidateText, /\bpn\s*(\d{1,3})\b/);
    const barMatches = new RegExp(`\\b${requirement.pn}\\s*bar\\b`).test(candidateText);
    if (candidatePn !== requirement.pn && !barMatches) return false;
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
  if (requirement.orientation && candidateOrientation(candidateName, candidateText) !== requirement.orientation) return false;
  const mountCapabilities = sprinklerMountCapabilities(candidateText);
  if (requirement.mount !== null && !mountCapabilities.has(requirement.mount)) return false;
  if (requirement.visibleMount && mountCapabilities.has("concealed") && !mountCapabilities.has("recessed")) return false;
  if (requirement.finish && extractFinish(candidateText) !== requirement.finish) return false;
  if (!sprinklerHeadTypeMatches(candidateText, requirement.sprinklerHeadType)) return false;
  if (requirement.material && extractMaterial(candidateText) !== requirement.material) return false;
  if (requirement.joint && !extractJointTypes(candidateText).includes(requirement.joint)) return false;
  if (requirement.intent === "sprinkler_head") {
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

function scoreWetAlarmValve(candidateText: string, reasons: string[], warnings: string[], requirementText: string) {
  let score = 0;
  const signage = /\b(skilt|skiltpakke|systemtext)\b/.test(candidateText);
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
  if (/\b(sluseventiler?|gate valve)\b/.test(candidateText)) {
    score -= 40;
    warnings.push("Produkten är en avstängningsventil och inte ett komplett alarmventilset.");
  }
  if (/\bbolig\b/.test(candidateText) && !/\bbolig\b/.test(requirementText)) {
    score -= 25;
    warnings.push("Produkten är beskriven för bostadssystem, vilket inte anges i PDF-kravet.");
  }
  if (signage) {
    score -= 60;
    warnings.push("Träffen är en skylt och inte den tekniska ventilprodukten.");
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
  }
  if (requirement.response) {
    const candidateResponse = extractSprinklerResponse(candidateText);
    if (candidateResponse === requirement.response) {
      score += 12;
      reasons.push(requirement.response === "standard" ? "Standardrespons stämmer." : "Quick response stämmer.");
    } else if (candidateResponse) {
      score -= 35;
      warnings.push("Sprinklerns responstid stämmer inte med PDF-kravet.");
    }
  }
  if (requirement.orientation) {
    const orientation = candidateOrientation(candidateName, candidateText);
    if (orientation === requirement.orientation) {
      score += 15;
      reasons.push("Monteringsriktningen stämmer med PDF-kravet.");
    } else if (orientation) {
      score -= 45;
      warnings.push("Sprinklerns monteringsriktning stämmer inte med PDF-kravet.");
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
      warnings.push(requirement.coverage.startsWith("extended")
        ? "PDF-kravet anger extended coverage, men produktinformationen bekräftar inte rätt täcknings-/applikationsklass."
        : "Produktens täcknings-/applikationsklass stämmer inte med PDF-kravet eller saknar verifierbart underlag.");
    }
  }
  if (requirement.requiresAccessoryReview) {
    warnings.push("Täckbricka, skydd eller annat tillbehör måste kompatibilitetskontrolleras mot exakt sprinklerutförande.");
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

function candidateOrientation(productName: string, candidateText: string): TechnicalProfile["orientation"] {
  // Ahlsell descriptions often contain phrases such as "opp til 19 mm". Only
  // interpret the short words Opp/Ned as orientation when they occur in the
  // product name. Longer, unambiguous terms may safely come from all fields.
  const nameHasUpright = /(?:^|\s|-)(opp)(?:\s|$|-)/.test(productName) || /\bssu\b/.test(productName);
  const nameHasPendent = /(?:^|\s|-)(ned)(?:\s|$|-)/.test(productName) || /\b(?:ssp|pen)\b/.test(productName);
  const nameSignals = sprinklerOrientationSignals(productName);
  const candidateSignals = sprinklerOrientationSignals(candidateText);
  if (nameSignals.hasSidewall || candidateSignals.hasSidewall) return "sidewall";
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
  if (requirement.dn === null) return 0;
  const candidateDns = extractDnValues(candidateText);
  const candidateDn = candidateDns[0] ?? null;
  const diameterMatches = requirement.outsideDiameter !== null
    && new RegExp(`\\b${String(requirement.outsideDiameter).replace(".", "[.,]")}\\s*(?:mm)?\\b`).test(candidateText);
  if (candidateDns.includes(requirement.dn) || diameterMatches) {
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
  return 0;
}

function scorePressure(candidateText: string, requirement: TechnicalProfile, reasons: string[], warnings: string[]) {
  if (requirement.pn === null) return 0;
  const candidatePn = numberAfterLabel(candidateText, /\bpn\s*(\d{1,3})\b/);
  const pressurePattern = new RegExp(`\\b${requirement.pn}\\s*bar\\b`);
  if (candidatePn === requirement.pn || pressurePattern.test(candidateText)) {
    reasons.push(`Produktinformationen anger PN${requirement.pn}/${requirement.pn} bar.`);
    return 10;
  }
  if (candidatePn !== null && !candidateText.includes(`pn ${requirement.pn}`)) {
    warnings.push(`Tryckklass måste kontrolleras: PDF kräver PN${requirement.pn}, träffen anger PN${candidatePn}.`);
    return -20;
  }
  return 0;
}

function scoreMaterialAndJoint(
  candidateText: string,
  requirement: TechnicalProfile,
  reasons: string[],
  warnings: string[]
) {
  let score = 0;
  if (requirement.material) {
    const candidateMaterial = extractMaterial(candidateText);
    if (candidateMaterial === requirement.material) {
      score += 10;
      reasons.push("Materialet stämmer med PDF-kravet.");
    } else if (candidateMaterial) {
      score -= 55;
      warnings.push("Produktens material stämmer inte med PDF-kravet.");
    }
  }

  if (requirement.joint) {
    const candidateJoints = extractJointTypes(candidateText);
    if (candidateJoints.includes(requirement.joint)) {
      score += 10;
      reasons.push("Skarvtypen stämmer med PDF-kravet.");
    } else if (candidateJoints.length > 0) {
      score -= 55;
      warnings.push("Produktens skarv- eller anslutningstyp stämmer inte med PDF-kravet.");
    }
  }
  return score;
}

function detectIntent(primaryValue: string, combinedValue: string, category: string): ProductIntent {
  const source = primaryValue || combinedValue;
  const has = (pattern: RegExp) => pattern.test(source);
  if (has(/\b(beskyttelsesgit(?:ter|re)|skyddskorg|sprinklerkorg)\b/)) return "sprinkler_guard";
  if (
    has(/\b(sprinklerslange|sprinkler slange|fleksibelslange|flexislange|flexible sprinkler hose|braided hose|vicflex|dryflex)\b/)
    || has(/\bbrannslokking\s+slange\b/)
  ) return "sprinkler_hose";
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
  if (/\bbend\b/.test(primaryValue) && /\b(flens|flanged)\b/.test(primaryValue)) return "flanged_bend";
  if (has(/\b(bend|rorboy|elbow)\b/)) return "bend";
  if (has(/\b(kupling|rillekobling|hurtigrillekobling|coupling)\b/)) return "coupling";
  if (has(/\b(dren(?:erings)?kar|oppsamlingskar|utjevningskar|specialtilvirk)\b/)) return "custom_fabrication";
  if (category === "sprinkler_head" || has(/\bsprinkler head\b|\bk faktor\b|\butlosningstemperatur\b/)) return "sprinkler_head";
  if (category === "pipe" || /\bunit m\b/.test(primaryValue)) return "pipe";
  if (category === "fitting") return "coupling";
  if (category === "support") return "support";
  return "generic";
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
  return numberAfterLabel(value, /\b(?:ytre|utvendig|outside)\s*(?:ror)?\s*diameter\s*[=:]?\s*(\d+(?:[.,]\d+)?)/);
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
  if (/\b(pp\s*r|polypropylen|red pipe)\b/.test(value)) return "ppr";
  if (/\b(duktil|stopejern|gjutjarn)\b/.test(value)) return "ductile_iron";
  if (/\b(messing|massing|brass)\b/.test(value)) return "brass";
  if (/\b(stal|steel|galvanis(?:ert|erte|erad|ed))\b/.test(value)) return "steel";
  return null;
}

function extractJointTypes(value: string): Array<NonNullable<TechnicalProfile["joint"]>> {
  const joints: Array<NonNullable<TechnicalProfile["joint"]>> = [];
  if (/\b(gjenget|gjenger|threaded|skrudd|skruforbindelse)\b/.test(value)) joints.push("threaded");
  if (/\b(rillet|rillede|rillekobling|grooved)\b/.test(value)) joints.push("grooved");
  if (/\b(sveis|sveist|sveising|muffesveis|heat fusion|fusion)\b/.test(value)) joints.push("fusion");
  if (/\b(flens|flanged)\b/.test(value)) joints.push("flanged");
  return joints;
}

function extractSprinklerSystem(value: string): TechnicalProfile["sprinklerSystem"] {
  if (/\b(torranlegg|torrt anlegg|dry pipe system|dry system)\b/.test(value)) return "dry";
  if (/\b(vatanlegg|vatt anlegg|wet pipe system|wet system)\b/.test(value)) return "wet";
  return null;
}

function extractRequiredSprinklerHeadType(value: string): TechnicalProfile["sprinklerHeadType"] {
  if (/\b(torrsprinkler|torrorssprinkler|dry sprinkler|dry type sprinkler)\b/.test(value)) return "dry";
  if (/\b(window sprinkler|vindussprinkler|vindu sprinkler|apen sprinkler|open sprinkler|uten termisk element)\b/.test(value)) return "open";
  if (/\b(konvensjonell|konventionell|conventional|spraysprinkler|standard spray|utvidet dekning|extended coverage)\b/.test(value)) return "standard";
  return null;
}

function candidateSprinklerHeadType(value: string): TechnicalProfile["sprinklerHeadType"] {
  const explicitlyNotDry = /\b(not|ikke|ej|inte)\s+(?:a\s+)?(?:dry|torr)(?:\s*type)?\s+sprinkler\b/.test(value);
  if (!explicitlyNotDry && /\b(torrsprinkler|torr sprinkler|torr|dry sprinkler|dry type)\b/.test(value)) return "dry";
  if (/\b(window sprinkler|vindussprinkler|vindu sprinkler|apen sprinkler|open sprinkler|apen sprededyse|open nozzle)\b/.test(value)) return "open";
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

function requirementSprinklerMount(
  placementText: string,
  deckPlateText: string
): TechnicalProfile["mount"] {
  if (/\b(skjult|concealed|dold)\b/.test(placementText)) return "concealed";
  const affirmativeDeckPlate = /\b(ja|yes|true|inkludert|required)\b/.test(deckPlateText)
    && !/\b(nei|no|false)\b/.test(deckPlateText);
  if (/\b(innfelt|infalld|recessed)\b/.test(placementText) || affirmativeDeckPlate) return "recessed";
  return null;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function normalize(value: string) {
  return value.toLowerCase().replace(/æ/g, "ae").replace(/ø/g, "o").replace(/å/g, "a")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9.,]+/g, " ").trim();
}

function closeEnough(left: number, right: number) {
  return Math.abs(left - right) < 0.05;
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : String(value).replace(".", ",");
}
