import type { AhlsellPublicCandidate } from "@/lib/ahlsell-public-match";

const PIPE_OUTSIDE_DIAMETER_BY_DN: Record<number, number> = {
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
  200: 219.1
};

export function rankAhlsellCandidates(
  requirement: Record<string, unknown>,
  candidates: AhlsellPublicCandidate[]
) {
  const requirementText = normalize(flattenText(requirement));
  const expectedDn = extractDn(requirementText);
  const expectedOutsideDiameter = expectedDn === null
    ? null
    : PIPE_OUTSIDE_DIAMETER_BY_DN[expectedDn] ?? null;
  const wetAlarmValve = /\b(vat alarmventil|wet alarm valve|kontrollventilsett)\b/.test(requirementText);
  const requiresPn16 = /\bpn\s*16\b/.test(requirementText);

  return candidates
    .map((candidate) => scoreCandidate(candidate, {
      expectedDn,
      expectedOutsideDiameter,
      wetAlarmValve,
      requiresPn16
    }))
    .sort((left, right) =>
      (right.matchScore ?? 0) - (left.matchScore ?? 0)
      || left.productName.localeCompare(right.productName, "sv")
    );
}

function scoreCandidate(
  candidate: AhlsellPublicCandidate,
  requirement: {
    expectedDn: number | null;
    expectedOutsideDiameter: number | null;
    wetAlarmValve: boolean;
    requiresPn16: boolean;
  }
): AhlsellPublicCandidate {
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
  const isSignage = /\b(skilt|skiltpakke|systemtext)\b/.test(candidateText);
  const isSparePart = /\b(pakningssett|reservedel|spare part)\b/.test(candidateText);

  if (requirement.wetAlarmValve) {
    if (/\bsprinklersentral\b/.test(candidateText) && !isSignage && !isSparePart) {
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
    if (/\bbolig\b/.test(candidateText) && !/\bbolig\b/.test(normalize(flattenText(requirement)))) {
      score -= 25;
      warnings.push("Produkten är beskriven för bostadssystem, vilket inte anges i PDF-kravet.");
    }
    if (isSignage) {
      score -= 60;
      warnings.push("Träffen är en skylt och inte den tekniska ventilprodukten.");
    }
    if (isSparePart) {
      score -= 40;
      warnings.push("Träffen är en reservdel och inte ett komplett ventilset.");
    }
  }

  if (requirement.expectedDn !== null) {
    const dnPattern = new RegExp(`\\bdn\\s*${requirement.expectedDn}\\b`);
    const diameterPattern = requirement.expectedOutsideDiameter === null
      ? null
      : new RegExp(`\\b${String(requirement.expectedOutsideDiameter).replace(".", "[.,]")}\\s*(?:mm)?\\b`);
    if (dnPattern.test(candidateText) || diameterPattern?.test(candidateText)) {
      score += 25;
      reasons.push(`Dimensionen motsvarar DN${requirement.expectedDn}${requirement.expectedOutsideDiameter ? ` (${String(requirement.expectedOutsideDiameter).replace(".", ",")} mm)` : ""}.`);
    }
  }

  if (requirement.requiresPn16 && /\bpn\s*16\b|\b16\s*bar\b/.test(candidateText)) {
    score += 10;
    reasons.push("Produktinformationen anger PN16/16 bar.");
  }

  const matchScore = Math.max(0, Math.min(100, score));
  const recommendation = matchScore >= 75 && warnings.length === 0
    ? "recommended"
    : matchScore >= 40
      ? "possible"
      : "unlikely";

  return {
    ...candidate,
    matchScore,
    matchReasons: reasons,
    matchWarnings: warnings,
    recommendation
  };
}

function extractDn(value: string) {
  const explicit = value.match(/\bdn\s*(\d{1,3})\b/)?.[1];
  if (explicit) return Number(explicit);
  const labelled = value.match(/\bdimensjon(?: dn)?\s*(\d{1,3})\b/)?.[1];
  return labelled ? Number(labelled) : null;
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
  return value
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/å/g, "a")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9.,]+/g, " ")
    .trim();
}
