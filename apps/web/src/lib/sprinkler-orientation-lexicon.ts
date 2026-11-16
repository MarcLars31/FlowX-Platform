export type SprinklerOrientation = "upright" | "pendent" | "sidewall";

export type SprinklerOrientationSignals = {
  hasUpright: boolean;
  hasPendent: boolean;
  hasSidewall: boolean;
};

const UPRIGHT_PATTERN = /\b(?:staende|upright|ssu|oppover(?:vendt|rettet)?|opprettstaende)\b/;
const PENDENT_PATTERN = /\b(?:hengende|pendent|pendel|ssp|nedover(?:vendt|rettet)?|nedhengt(?:e)?)\b/;
const SIDEWALL_PATTERN = /\b(?:hsw|side\s*wall|sidewall|vegg(?:sprinkler|montert(?:e)?|montering|montasje)?|sidevegg(?:sprinkler|montert(?:e)?)?|horisont(?:al|ell)(?:t|e)?|vannrett(?:e)?)\b|\b(?:montert|montasje|montering)\s+pa\s+(?:side)?vegg\b/;

export function sprinklerOrientationSignals(value: string): SprinklerOrientationSignals {
  const normalized = normalizeOrientationText(value);
  return {
    hasUpright: UPRIGHT_PATTERN.test(normalized),
    hasPendent: PENDENT_PATTERN.test(normalized),
    hasSidewall: SIDEWALL_PATTERN.test(normalized)
  };
}

export function resolvedSprinklerOrientation(value: string): {
  orientation: SprinklerOrientation | null;
  mixed: boolean;
} {
  const signals = sprinklerOrientationSignals(value);
  const orientations: SprinklerOrientation[] = [];
  if (signals.hasUpright) orientations.push("upright");
  if (signals.hasPendent) orientations.push("pendent");
  if (signals.hasSidewall) orientations.push("sidewall");
  return {
    orientation: orientations.length === 1 ? orientations[0] : null,
    mixed: orientations.length > 1
  };
}

function normalizeOrientationText(value: string) {
  return value
    .toLocaleLowerCase("nb-NO")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ø/g, "o")
    .replace(/æ/g, "ae");
}
