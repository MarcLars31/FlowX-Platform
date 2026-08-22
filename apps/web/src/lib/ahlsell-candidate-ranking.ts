import type { AhlsellPublicCandidate } from "@/lib/ahlsell-public-match";

const PIPE_OUTSIDE_DIAMETER_BY_DN: Record<number, number> = {
  15: 21.3, 20: 26.9, 25: 33.7, 32: 42.4, 40: 48.3, 50: 60.3,
  65: 76.1, 80: 88.9, 100: 114.3, 125: 139.7, 150: 168.3, 200: 219.1
};

type ProductIntent = "wet_alarm_valve" | "manometer" | "pressure_switch" | "ball_valve"
  | "flanged_bend" | "sprinkler_head" | "sprinkler_guard" | "custom_fabrication" | "generic";

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
  drySystem: boolean;
  wetSystem: boolean;
  expectsSteel: boolean;
  finish: "white" | "black" | "chrome" | "brass" | null;
};

export function rankAhlsellCandidates(requirement: Record<string, unknown>, candidates: AhlsellPublicCandidate[]) {
  const profile = requirementProfile(requirement);
  return candidates
    .map((candidate) => scoreCandidate(candidate, profile))
    .sort((left, right) =>
      (right.matchScore ?? 0) - (left.matchScore ?? 0)
      || left.productName.localeCompare(right.productName, "sv")
    );
}

function requirementProfile(requirement: Record<string, unknown>): TechnicalProfile {
  const text = normalize(flattenText(requirement));
  const dn = extractDn(text);
  return {
    text,
    intent: detectIntent(text),
    dn,
    outsideDiameter: dn === null ? null : PIPE_OUTSIDE_DIAMETER_BY_DN[dn] ?? null,
    pn: numberAfterLabel(text, /\bpn\s*(\d{1,3})\b/),
    kFactor: extractKFactor(text),
    temperatureC: extractTemperature(text),
    response: /\b(standard(?:respons)?|sr)\b/.test(text)
      ? "standard"
      : /\b(kvikk|quick|qr)\b/.test(text) ? "quick" : null,
    orientation: /\b(staende|upright|oppover|opp)\b/.test(text)
      ? "upright"
      : /\b(hengende|pendent|nedover|ned)\b/.test(text)
        ? "pendent"
        : /\b(horisontal|sidewall|hsw|vegg)\b/.test(text) ? "sidewall" : null,
    drySystem: /\b(torrsprinkler|torrorssprinkler|dry sprinkler|torrt system)\b/.test(text),
    wetSystem: /\b(vatanlegg|vatt anlegg|wet system|vat alarmventil)\b/.test(text),
    expectsSteel: /\b(stalror|stal ro|materiale stal|ror av stal|stal fittings?)\b/.test(text),
    finish: extractFinish(text)
  };
}

function scoreCandidate(candidate: AhlsellPublicCandidate, requirement: TechnicalProfile): AhlsellPublicCandidate {
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
  } else if (requirement.intent === "ball_valve") {
    if (/\bkuleventil\b/.test(candidateText)) {
      score += 55;
      reasons.push("Produkttypen är en kulventil.");
    }
    if (/\bwaterguard\b/.test(candidateText)) {
      score -= 45;
      warnings.push("Träffen är en Waterguard-komponent och inte säkert rätt avstängningsventil för sprinklersentralen.");
    }
  } else if (requirement.intent === "flanged_bend") {
    if (/\b(flensebend|flensbend|bend)\b/.test(candidateText)) {
      score += 45;
      reasons.push("Produkttypen är en rörböj med flänsanslutning.");
    }
    if (requirement.expectsSteel && /\b(duktil|stopejern|gjutjarn)\b/.test(candidateText)) {
      score -= 35;
      warnings.push("PDF-kravet anger stål, men Ahlsell-träffen är av duktilt gjutjärn.");
    }
  } else if (requirement.intent === "sprinkler_guard") {
    if (/\b(sprinkler.*gitter|gitter.*sprinkler|beskyttelsesgitter|skyddskorg)\b/.test(candidateText)) {
      score += 80;
      reasons.push("Produkten är ett skyddsgaller för sprinklerhuvud.");
    }
  } else if (requirement.intent === "sprinkler_head") {
    if (/\bsprinklerhode(?:r)?\b|\bsprinkler head\b/.test(candidateText)) {
      score += 25;
      reasons.push("Produkten är ett sprinklerhuvud.");
    }
    if (/\b(gitter|skyddskorg|dekkplate|rosett|nokkel)\b/.test(candidateText)) {
      score -= 70;
      warnings.push("Träffen är ett tillbehör och inte ett sprinklerhuvud.");
    }
    score += scoreSprinklerAttributes(candidateText, requirement, reasons, warnings);
  } else if (requirement.intent === "custom_fabrication") {
    warnings.push("Posten verkar vara specialtillverkad och måste verifieras via offert eller manuellt produktval.");
  }

  score += scoreDimension(candidateText, requirement, reasons, warnings);
  score += scorePressure(candidateText, requirement, reasons, warnings);

  const matchScore = Math.max(0, Math.min(100, score));
  const recommendation = matchScore >= 75 && warnings.length === 0
    ? "recommended"
    : matchScore >= 35 ? "possible" : "unlikely";
  return { ...candidate, matchScore, matchReasons: reasons, matchWarnings: warnings, recommendation };
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

function scoreSprinklerAttributes(candidateText: string, requirement: TechnicalProfile, reasons: string[], warnings: string[]) {
  let score = 0;
  const candidateK = extractKFactor(candidateText);
  if (requirement.kFactor !== null && candidateK !== null) {
    if (closeEnough(requirement.kFactor, candidateK)) {
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
    const candidateResponse = /\bstandardrespons|\bsr\b/.test(candidateText)
      ? "standard"
      : /\b(kvikkrespons|quick|qr)\b/.test(candidateText) ? "quick" : null;
    if (candidateResponse === requirement.response) {
      score += 12;
      reasons.push(requirement.response === "standard" ? "Standardrespons stämmer." : "Quick response stämmer.");
    } else if (candidateResponse) {
      score -= 35;
      warnings.push("Sprinklerns responstid stämmer inte med PDF-kravet.");
    }
  }
  if (requirement.orientation) {
    const orientation = /\b(opp|upright|staende)\b/.test(candidateText)
      ? "upright"
      : /\b(ned|pendent|hengende)\b/.test(candidateText)
        ? "pendent"
        : /\b(hsw|sidewall|horisontal)\b/.test(candidateText) ? "sidewall" : null;
    if (orientation === requirement.orientation) {
      score += 15;
      reasons.push("Monteringsriktningen stämmer med PDF-kravet.");
    } else if (orientation) {
      score -= 45;
      warnings.push("Sprinklerns monteringsriktning stämmer inte med PDF-kravet.");
    }
  }
  if (requirement.drySystem && !/\b(torr|dry)\b/.test(candidateText)) {
    score -= 50;
    warnings.push("PDF-kravet anger torrsprinkler, men träffen är inte markerad som torr modell.");
  }
  if (!requirement.drySystem && requirement.wetSystem && /\b(torr|dry)\b/.test(candidateText)) {
    score -= 60;
    warnings.push("PDF-kravet anger vått system, men träffen är en torrsprinkler.");
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

function scoreDimension(candidateText: string, requirement: TechnicalProfile, reasons: string[], warnings: string[]) {
  if (requirement.dn === null) return 0;
  const candidateDn = extractDn(candidateText);
  const diameterMatches = requirement.outsideDiameter !== null
    && new RegExp(`\\b${String(requirement.outsideDiameter).replace(".", "[.,]")}\\s*(?:mm)?\\b`).test(candidateText);
  if (candidateDn === requirement.dn || diameterMatches) {
    reasons.push(`Dimensionen motsvarar DN${requirement.dn}${requirement.outsideDiameter ? ` (${String(requirement.outsideDiameter).replace(".", ",")} mm)` : ""}.`);
    return 25;
  }
  if (candidateDn !== null) {
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

function detectIntent(value: string): ProductIntent {
  if (/\b(vat alarmventil|wet alarm valve|kontrollventilsett)\b/.test(value)) return "wet_alarm_valve";
  if (/\b(beskyttelsesgitter|skyddskorg|sprinklerkorg)\b/.test(value)) return "sprinkler_guard";
  if (/\b(maleinstrument|manometer|analog.*trykk|absolutt trykk.*direkte)\b/.test(value)) return "manometer";
  if (/\b(trykkvakt|pressostat|pressure switch)\b/.test(value)) return "pressure_switch";
  if (/\b(kuleventil|ball valve)\b/.test(value)) return "ball_valve";
  if (/\bbend\b/.test(value) && /\b(flens|flanged)\b/.test(value)) return "flanged_bend";
  if (/\b(dren(?:erings)?kar|oppsamlingskar|utjevningskar|specialtilvirk)\b/.test(value)) return "custom_fabrication";
  if (/\bsprinkler head\b|\bk faktor\b|\butlosningstemperatur\b/.test(value)) return "sprinkler_head";
  return "generic";
}

function extractDn(value: string) {
  const explicit = value.match(/\bdn\s*(\d{1,3})\b/)?.[1];
  if (explicit) return Number(explicit);
  const labelled = value.match(/\bdimensjon(?: dn)?\s*(\d{1,3})\b/)?.[1];
  return labelled ? Number(labelled) : null;
}

function extractKFactor(value: string) {
  return numberAfterLabel(value, /\bk(?: faktor)?\s*(?:k\s*)?-?\s*(\d+(?:[.,]\d+)?)\b/);
}

function extractTemperature(value: string) {
  return numberAfterLabel(value, /\b(?:utlosningstemperatur|responstemperatur|temperature)\s*(\d+(?:[.,]\d+)?)\s*(?:c\b)?/)
    ?? numberAfterLabel(value, /\b(57|68|79|93|100|121|141|182|260)\s*(?:c\b)/);
}

function extractFinish(value: string): TechnicalProfile["finish"] {
  if (/\b(hvit|vit|white)\b/.test(value)) return "white";
  if (/\b(sort|svart|black)\b/.test(value)) return "black";
  if (/\b(krom|chrome)\b/.test(value)) return "chrome";
  if (/\b(messing|massing|brass)\b/.test(value)) return "brass";
  return null;
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
