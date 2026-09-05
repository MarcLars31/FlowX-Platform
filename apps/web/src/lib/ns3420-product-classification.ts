export type Ns3420ProductFamily = "sprinkler_hose";

/**
 * Maps product-bearing NS 3420 codes to the catalogue family they describe.
 *
 * UB1.3311 is the code family for an indoor fire-extinguishing pipe system
 * whose actual product is a hose. The word "rørledning" in the heading names
 * the installation system and must therefore not classify the row as rigid
 * pipe.
 */
export function ns3420ProductFamily(value: unknown): Ns3420ProductFamily | null {
  if (typeof value !== "string") return null;
  const normalized = value.toLocaleUpperCase("nb-NO").replace(/\s+/g, "");
  return /(?:^|[^A-Z0-9])UB1\.3311[A-Z0-9]*(?:$|[^A-Z0-9])/.test(normalized)
    ? "sprinkler_hose"
    : null;
}
