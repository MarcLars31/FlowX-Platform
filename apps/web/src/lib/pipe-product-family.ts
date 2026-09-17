/** A fitting's application text may mention pipes; it is still not a pipe. */
export function isRigidPipeProduct(name: string) {
  const primary = normalizePipeText(name).split(/\b(?:med|with)\b/)[0];
  if (/\b(?:endelo?kk?|endebunn|andlock|end cap|cap|plugg|blindflens|bend|albue\w*|elbow|boj\w*|[ty] ror|tee|grenror|rorgren|rorvinkel|rorbend|rordel\w*|\w*kupling|\w*kobling|\w*koppling|muffe|\w*ventil|flensadapter|flenseadapter|reduksjon\w*|reducer|anboringsklammer|klammer|roroppheng|oppheng|rorstotte|brakett|feste|slange\w*|sprinklerslange|hose|gitter|skilt|rorisolasjon)\b/.test(primary)) return false;
  return /\b(?:ror|stalror|sprinklerror|sprinkleror|konstruksjonsror|red pipe|pipe|steel tube)\b/.test(primary);
}

export function normalizePipeText(value: string) {
  return value.toLowerCase().replace(/ø/g, "o").replace(/æ/g, "ae").normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}
