import catalog from "@/data/ns3420-code-catalog.json";

export const NS3420_CODE_CATALOG_VERSION = catalog.version;
export const NS3420_CODE_COUNT = catalog.codes.length;

export type Ns3420CodeInfo = {
  code: string;
  kind: "reference" | "project" | "unknown";
  label: string;
  heading: string | null;
  additionalRequirements: boolean;
};

const codes = new Map(catalog.codes.map((entry) => [entry.code, entry]));
const meanings = new Map(catalog.meanings.map((meaning) => [meaning.id, meaning]));

/**
 * A reference index of observed code headings, not a digit decoder or a
 * technical matching rule. Only a complete code match supplies a meaning.
 * Project-specific codes must never become shared NS 3420 definitions.
 */
export function ns3420CodeInfo(value: unknown): Ns3420CodeInfo | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const code = value.toLocaleUpperCase("nb-NO").replace(/\s+/gu, "");
  if (code.startsWith("%")) {
    return { code, kind: "project", label: "Projektspecifik kod", heading: null, additionalRequirements: false };
  }

  const additionalRequirements = /^[A-Z]{2}\d\.\d+A$/.test(code);
  const entry = codes.get(code);
  const meaning = entry ? meanings.get(entry.meaningId) : undefined;
  if (!meaning) {
    return { code, kind: "unknown", label: "Betydelse saknas", heading: null, additionalRequirements };
  }
  return { code, kind: "reference", label: meaning.label, heading: meaning.heading, additionalRequirements };
}
