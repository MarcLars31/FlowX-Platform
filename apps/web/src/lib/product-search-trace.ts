import { effectiveRequirements } from "./effective-requirements";
import { productRequirementAttributes, productRequirementContext, productSearchHeading } from "./ahlsell-requirement-context";
import type { AhlsellRequirementGuide } from "./ahlsell-public-match";
import type { EffectiveRequirementSet, RequirementSource } from "./technical-evaluation-model";

export type ProductSearchAttempt = {
  kind: "catalog" | "article" | "manual";
  query: string;
  status: "completed" | "failed";
};
export type ProductSearchTrace = {
  version: 1;
  mode: "automatic" | "manual";
  completedAt: string;
  requirements: EffectiveRequirementSet;
  heading: string;
  inputs: { label: string; value: string; source: RequirementSource }[];
  criteria: string[];
  notes: string[];
  warnings: string[];
  attempts: ProductSearchAttempt[];
};

/** Capture the server's actual retrieval input and guide, never rebuild them in the UI. */
export function productSearchTrace(authoritative: Record<string, unknown>, searchInput: Record<string, unknown>,
  guide: AhlsellRequirementGuide, attempts: ProductSearchAttempt[], mode: ProductSearchTrace["mode"] = "automatic"): ProductSearchTrace {
  const value = record(searchInput.value_json);
  const context = productRequirementContext(searchInput);
  const postNumber = text(value.postNumber);
  const inputs = mode === "manual" ? [] : Object.entries(productRequirementAttributes(searchInput)).map(([label, raw]) => {
    const origin = record(context.attributeSources[label]);
    const originPost = text(origin.postNumber) ?? postNumber;
    const inherited = Boolean(originPost && originPost !== postNumber);
    return { label, value: typeof raw === "string" ? raw : JSON.stringify(raw), source: {
      kind: inherited ? "parent" as const : "post" as const,
      postNumber: originPost,
      // A child's page is not evidence for its parent's page.
      page: page(origin.sourcePage) ?? (inherited ? undefined : page(searchInput.source_page)),
      raw: `${label}: ${typeof raw === "string" ? raw : JSON.stringify(raw)}`
    } };
  });
  return { version: 1, mode, completedAt: new Date().toISOString(), requirements: effectiveRequirements(authoritative),
    heading: productSearchHeading(searchInput), inputs,
    criteria: mode === "automatic" ? [...guide.criteria] : [],
    notes: mode === "automatic" ? [...new Set([...guide.recognitionNotes, ...(guide.interpretationNotes ?? [])])] : [],
    warnings: mode === "automatic" ? [...new Set([...guide.warnings, ...(guide.interpretationWarnings ?? [])])] : [],
    attempts: attempts.map(attempt => ({ ...attempt })) };
}

/** Source labels remain text unless they are ordinary HTTPS document links. */
export function productEvidenceHref(source: string) {
  try {
    const url = new URL(source);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : undefined;
  } catch { return undefined; }
}
function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function text(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : undefined; }
function page(value: unknown) { return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined; }
