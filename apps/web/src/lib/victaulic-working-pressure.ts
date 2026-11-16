import pressures from "@/data/victaulic-working-pressure.json";
import type { AhlsellPublicCandidate } from "./ahlsell-public-match";
import { verifiedVictaulicArticle } from "./victaulic-sprinkler-catalog";

export function verifiedVictaulicWorkingPressure(candidate: AhlsellPublicCandidate) {
  const product = verifiedVictaulicArticle(candidate);
  if (!product) return null;
  const evidence = pressures.publications.find(publication => publication.models.includes(product.model));
  return evidence ? {
    bar: evidence.maximumWorkingPressureKpa / 100,
    model: product.model,
    publication: evidence.publication,
    sourceUrl: evidence.sourceUrl,
    verifiedAt: pressures.verifiedAt
  } : null;
}

export function withVerifiedWorkingPressure(candidate: AhlsellPublicCandidate): AhlsellPublicCandidate {
  const evidence = verifiedVictaulicWorkingPressure(candidate);
  if (!evidence) return candidate;
  return { ...candidate, specifications: [...new Set([...candidate.specifications,
    `Max arbetstryck: ${evidence.bar} bar (SIN ${evidence.model}, Victaulic ${evidence.publication})`,
    evidence.sourceUrl
  ])] };
}
