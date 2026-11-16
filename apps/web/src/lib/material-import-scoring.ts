import type { MaterialDimensionMatch, MaterialSearchInput } from "./material-import";
import type { AhlsellPublicCandidate } from "./ahlsell-public-match";
import { AHLSELL_EVIDENCE_TTL_MS } from "./ahlsell-technical-evidence";

const numberText = (value: number) => String(value).replace(".", ",");
const numericSize = (value: string) => /^(?:DN\s*)?\d+(?:[.,]\d+)?(?:\s*mm)?$/i.test(value.trim())
  ? Number(value.trim().replace(/^DN\s*/i, "").replace(/\s*mm$/i, "").replace(",", ".")) : null;

export function materialDimensionKind(input: MaterialSearchInput) {
  if (input.dimensionKind !== "unspecified") return input.dimensionKind;
  if (/^DN\s*\d+(?:[.,]\d+)?$/i.test(input.dimension.trim())) return "dn";
  if (/^\d+(?:[.,]\d+)?\s*mm$/i.test(input.dimension.trim())) return "outside";
  return "unspecified";
}

/** Compare the same measure system. Never derive DN from an outside diameter. */
export function materialDimensionMatch(input: MaterialSearchInput, candidate: AhlsellPublicCandidate, now = Date.now()): MaterialDimensionMatch {
  const evidence = candidate.technicalEvidence?.articleNumber === candidate.articleNumber ? candidate.technicalEvidence : undefined;
  const heading = [candidate.productName, candidate.subtitle ?? ""].join(" ");
  const multipleDn = /\bDN\s*\d+(?:[.,]\d+)?\s*[-/x×]\s*(?:DN\s*)?\d/i.test(heading);
  function measured(property: "dn" | "outsideDiameterMm") {
    const field = evidence?.fields[property];
    if (field) {
      const fresh = field.observations.filter(item => Number.isFinite(Date.parse(item.retrievedAt))
        && now - Date.parse(item.retrievedAt) <= AHLSELL_EVIDENCE_TTL_MS);
      const values = [...new Set(fresh.map(item => Number(item.value)).filter(value => Number.isFinite(value) && value > 0))];
      return { values, reliable: field.status === "documented" && !(property === "dn" && multipleDn) && fresh.length === field.observations.length && values.length === 1 };
    }
    // An explicitly labelled catalogue heading is a size hint; page identity is scored separately.
    const values = property === "dn" ? [...new Set([...heading.matchAll(/\bDN\s*(\d+(?:[.,]\d+)?)(?![\d.,])/gi)].map(item => Number(item[1].replace(",", "."))))]
      : input.unit.toLowerCase() === "m" && !input.fittingDimension
        ? [...(candidate.subtitle ?? "").matchAll(/^\s*(?:\d+(?:\s+\d+\/\d+)?["″]\s+)?(\d+(?:[.,]\d+)?)\s*(?:mm)?\s*[x×]\s*\d+(?:[.,]\d+)?(?:\s*mm\b|\s+[a-zæøå])/gi)].map(item => Number(item[1].replace(",", "."))) : [];
    const ambiguousDn = property === "dn" && /\bDN\s*\d+(?:[.,]\d+)?\s*[-/x×]\s*(?:DN\s*)?\d/i.test(heading);
    return { values, reliable: values.length === 1 && !ambiguousDn && (!candidate.technicalEvidence || Boolean(evidence)) };
  }
  const dn = measured("dn"), outside = measured("outsideDiameterMm");
  const actual = [dn.values.length ? `DN ${dn.values.map(numberText).join(" / ")}${dn.reliable ? "" : " (osäkert)"}` : "",
    outside.values.length ? `ytterdiameter ${outside.values.map(numberText).join(" / ")} mm${outside.reliable ? "" : " (osäkert)"}` : ""].filter(Boolean).join(" · ");
  const expected = [input.dimension, input.fittingDimension].filter(Boolean).join(" / ") || "Saknas";
  const unknown = (explanation: string): MaterialDimensionMatch => ({ status: "unknown", expected, actual: actual || "Ej dokumenterat", explanation });
  if (input.fittingDimension) {
    const fitting = fittingDimensionCheck(input, [candidate.subtitle ?? "", candidate.productName, ...candidate.specifications].join("\n"));
    const status = input.dimensionKind === "outside" ? fitting.matches ? "match" : fitting.conflict ? "mismatch" : "unknown" : "unknown";
    return { status, expected: `${input.fittingDimension}${input.dimensionKind === "outside" ? " mm" : ""}`,
      actual: fitting.actual || "Alla anslutningsmått saknas", explanation: status === "match" ? "Alla mått finns. Kontrollera portordning och anslutningsutförande."
        : status === "mismatch" ? "Kopplingens anslutningsmått avviker." : "Måttsystem och samtliga anslutningsmått behöver kontrolleras." };
  }
  const size = numericSize(input.dimension);
  if (size === null || size <= 0) return unknown("Raden saknar ett entydigt jämförbart mått.");
  // Explicit DN/mm in the dimension cell is meaningful even before selecting a measure system.
  const kind = materialDimensionKind(input);
  if (kind === "unspecified") return unknown("Välj DN eller ytterdiameter för materialradens mått. Ett ensamt tal kan inte jämföras säkert.");
  const field = kind === "dn" ? dn : outside;
  const expectedLabel = kind === "dn" ? `DN ${numberText(size)}` : `ytterdiameter ${numberText(size)} mm`;
  if (!field.reliable) return { ...unknown("Produktens motsvarande mått saknas, är motstridigt eller behöver verifieras."), expected: expectedLabel };
  const matches = Math.abs(field.values[0] - size) < 0.001;
  return { status: matches ? "match" : "mismatch", expected: expectedLabel, actual,
    explanation: matches ? kind === "dn" ? "Nominell diameter stämmer. DN och ytterdiameter är olika mått." : "Ytterdiametern stämmer."
      : `Fel storlek: materialraden kräver ${expectedLabel}.` };
}

/** Search points, not a probability or a technical approval. Keep the shared ranker's base and explain caps. */
export function materialCandidateScore(candidate: AhlsellPublicCandidate, dimension: MaterialDimensionMatch, identityVerified: boolean, conflict: boolean) {
  const base = Number.isFinite(candidate.matchScore) ? Math.max(0, Math.min(100, Math.round(candidate.matchScore!))) : 0;
  let score = base;
  const scoreReasons = [`Produkt- och kravmatchning: ${base}/100.`];
  const cap = (limit: number, reason: string) => { score = Math.min(score, limit); scoreReasons.push(`${reason} Högst ${limit}/100.`); };
  if (dimension.status === "mismatch") cap(24, "Storleken avviker.");
  else if (dimension.status === "unknown") cap(59, "Storleken är inte säkert jämförd.");
  else scoreReasons.push("Storleken stämmer med angivet måttsystem.");
  if (conflict) cap(34, "Det finns en teknisk avvikelse.");
  if (!identityVerified) cap(69, "Artikelidentiteten är inte verifierad på produktsidan.");
  if (candidate.technicalEvaluation?.checks.some(check => check.status === "VERIFY")) cap(89, "Tekniska kontrollpunkter återstår.");
  return { score, scoreReasons };
}

/** A reduction or tee needs all connection sizes, not just one matching diameter. */
export function fittingDimensionCheck(input: MaterialSearchInput, text: string) {
  const expected = input.fittingDimension.replace(/\s*(?:mm|dn)\s*/gi, "").trim();
  if (!/^\d+(?:[.,]\d+)?(?:\s*[-x×]\s*\d+(?:[.,]\d+)?){1,2}$/i.test(expected)) return { conflict: false, matches: false, warnings: [] as string[], actual: "" };
  const values = (value: string) => (value.match(/\d+(?:[.,]\d+)?/g) ?? []).map(number => Number(number.replace(",", "."))).sort((a, b) => a - b).join("/");
  const tuples = [...text.matchAll(/\b\d+(?:[.,]\d+)?\s*(?:mm)?\s*(?:[x×-]\s*\d+(?:[.,]\d+)?\s*(?:mm)?\s*){1,2}/gi)].map(match => match[0].trim());
  const matching = tuples.some(tuple => values(tuple) === values(expected));
  const conflict = input.dimensionKind === "outside" && tuples.length > 0 && !matching;
  const warnings = conflict ? [`Kopplingens mått stämmer inte med ${input.fittingDimension}.`]
    : [matching ? "Kontrollera kopplingens portordning, vinkel och anslutningsutförande." : `Alla anslutningsmått (${input.fittingDimension}) kunde inte verifieras. Kontrollera produktbladet.`];
  return { conflict, matches: matching, warnings, actual: [...new Set(tuples)].slice(0, 3).join(" / ") };
}
