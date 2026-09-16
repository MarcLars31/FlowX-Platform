export type Ns3420ProductFamily = "sprinkler_hose" | "pipe";

/** A length of complete pipe remains the main item when fittings are included. */
export function isCompletePipeLengthDescription(description: string) {
  return /^\s*DN\s*\d+\s+komplett\s+med\s+(?:deler|delar)\b/i.test(description);
}

/**
 * Maps product-bearing NS 3420 codes to the catalogue family they describe.
 *
 * UB1.3311 is the code family for an indoor fire-extinguishing pipe system
 * whose actual product is a hose. The word "rørledning" in the heading names
 * the installation system and must therefore not classify the row as rigid
 * pipe.
 */
export function ns3420ProductFamily(value: unknown, description = ""): Ns3420ProductFamily | null {
  if (typeof value !== "string") return null;
  const normalized = value.toLocaleUpperCase("nb-NO").replace(/\bUB\s*1\s*\.\s*/g, "UB1.");
  if (/(?:^|[^A-Z0-9])UB1\.3311[A-Z0-9]*(?:$|[^A-Z0-9])/.test(normalized)) return "sprinkler_hose";
  if (/(?:^|[^A-Z0-9])UB1\.3111[A-Z0-9]*(?:$|[^A-Z0-9])/.test(normalized)
    && isCompletePipeLengthDescription(description)) return "pipe";
  // Pipe-length subposts inherit this code even when their short description
  // says "DN25, ink. deler og oppheng". Included supports are not the main item.
  if (/(?:^|[^A-Z0-9])UB1\.3111[A-Z0-9]*(?:$|[^A-Z0-9])/.test(normalized)
    && !/\b(?:bend|albue|elbow|kupling|kobling|muffe|ventil|stengeventil|sprinklerhode|sprinklerslange|alarmapparat|rørdel|rørdeler|reduksjon|reducer|tee|t-rør|endelokk|flensadapter)\b/i.test(description)) return "pipe";
  return null;
}
