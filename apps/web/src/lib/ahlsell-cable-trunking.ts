import { mainProductText, normalizeTechnicalText, productRequirementAttributes } from "./ahlsell-requirement-context";
import type { AhlsellPublicCandidate, AhlsellRequirementGuide } from "./ahlsell-public-match";

/** The channel body is the main product; lids, corners and end pieces are not. */
export function isCableTrunkingProduct(name: string) {
  const main = mainProductText(name);
  return /\b(?:veggkanal(?:er)?|vaggkanal(?:er)?|kabelkanal(?:er)?|installasjonskanal(?:er)?|installationskanal(?:er)?|foringskanal(?:er)?|kanalunderdel(?:er|ar)?|aluminiumskanal(?:er)?)\b/.test(main)
    && !/\b(?:tilbehor|tillbehor|lokk|kanallokk|kanalfront|front(?:deksel)?|endestykke[rt]?|endestykker|endeplate|skjotestykke[rt]?|(?:flat|inner|ytter)?vinkel|(?:inne|ute|inner|ytter|innvendig|utvendig)?hjorne|skillevegg|brakett|holder|feste|lydtetting)\b/.test(main);
}

export function cableTrunkingRequirementGuide(attributes: Map<string, string>, warnings: string[], searchBase: string): AhlsellRequirementGuide {
  const material = attributes.get("materiale") ?? attributes.get("material");
  const searchQueries = [...new Set([
    /alumini?um/i.test(material ?? "") ? "Veggkanal aluminium" : "Veggkanal",
    "Veggkanal", "Installasjonskanal"
  ])];
  const searchUrl = new URL(searchBase);
  searchUrl.searchParams.set("parameters.SearchPhrase", searchQueries[0]);
  return {
    searchQuery: searchQueries[0], searchQueries, searchUrl: searchUrl.toString(),
    criteria: ["Väggkanal", ...["materiale", "dimensjon hxd", "antall rom i kanal", "montasje"]
      .flatMap(key => attributes.get(key) ? [`${key}: ${attributes.get(key)}`] : [])],
    warnings, recognitionNotes: [], directCandidates: []
  };
}

export function cableTrunkingReviewWarnings(requirement: Record<string, unknown>, candidate: AhlsellPublicCandidate) {
  const attributes = Object.fromEntries(Object.entries(productRequirementAttributes(requirement))
    .map(([key, value]) => [normalizeTechnicalText(key), String(value)]));
  const material = attributes.materiale ?? attributes.material;
  const product = normalizeTechnicalText([candidate.productName, candidate.description, ...candidate.specifications].join(" "));
  const warnings: string[] = [];
  if (material && /aluminium|aluminum/.test(normalizeTechnicalText(material)) && !/aluminium|aluminum/.test(product)) {
    warnings.push(/\b(?:pvc|plast)\b/.test(product)
      ? "Produktens material stämmer inte: PDF kräver aluminium, produktunderlaget anger plast/PVC."
      : "Kanalens material behöver verifieras mot PDF-kravet aluminium.");
  } else if (material && !/aluminium|aluminum/.test(normalizeTechnicalText(material))) {
    warnings.push(`Kanalens material behöver verifieras mot PDF-kravet ${material}.`);
  }
  const checks = [
    attributes["dimensjon hxd"] ? `höjd × djup ${attributes["dimensjon hxd"]}` : "höjd och djup",
    attributes["antall rom i kanal"] ? `antal rum ${attributes["antall rom i kanal"]}` : "antal rum",
    attributes.montasje ? `montage ${attributes.montasje}` : "montage"
  ];
  warnings.push(`Verifiera kanalens ${checks.join(", ")} och om lock och skiljeväggar ingår. En kanalträff verifierar inte hela posten.`);
  return warnings;
}
