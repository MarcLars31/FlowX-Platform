import {
  ahlsellMldlProduct,
  ahlsellMldlProducts,
  type AhlsellMldlProduct
} from "@/lib/ahlsell-mldl-catalog";
import type {
  AhlsellAccessorySuggestion,
  AhlsellPublicCandidate
} from "@/lib/ahlsell-public-match";

export function attachAhlsellAccessorySuggestions(
  requirement: Record<string, unknown>,
  candidates: readonly AhlsellPublicCandidate[]
): AhlsellPublicCandidate[] {
  return candidates.map((candidate) => ({
    ...candidate,
    suggestedAccessories: suggestedAccessories(requirement, candidate)
  }));
}

export function suggestedAccessories(
  requirement: Record<string, unknown>,
  candidate: AhlsellPublicCandidate
): AhlsellAccessorySuggestion[] {
  const main = ahlsellMldlProduct(candidate.articleNumber);
  if (!main) return [];
  const requirementText = normalize(flatten(requirement));

  if (main.productType === "sprinkler_head") {
    return sprinklerAccessories(main, requirementText);
  }
  if (main.productType === "sprinkler_hose") {
    return hoseAccessories(main);
  }
  if (main.productType === "valve" && /\b(?:d?768n|769n|torr|dry)\b/.test(normalize(`${main.model ?? ""} ${main.productName}`))) {
    return dryValveAccessories(main);
  }
  if (main.productType === "alarm_valve_station" && !/\bm\s*fg trim\b/.test(normalize(main.productName))) {
    return wetValveAccessories(main);
  }
  return [];
}

function sprinklerAccessories(main: AhlsellMldlProduct, requirementText: string) {
  const mainText = normalize(`${main.productName} ${main.model ?? ""} ${main.mount ?? ""}`);
  const selectedProductText = normalize(`${main.productName} ${main.headConstruction ?? ""}`);
  const asksForGuard = /\b(gitter|beskytt|skyddskorg|guard)\b/.test(requirementText);
  const asksForConcealed = /\b(skjult|concealed|dekkplate|cover plate|tacklock)\b/.test(requirementText);
  const asksForRecessed = /\b(innfelt|recessed|dekkskiv(?:e)?|pyntering|rosett|escutcheon)\b/.test(requirementText);
  const concealedProduct = /\b(skjult|concealed)\b/.test(selectedProductText);
  const recessedProduct = /\b(innfelt|recessed)\b/.test(normalize(main.productName));
  if (!asksForGuard && !asksForConcealed && !asksForRecessed && !concealedProduct && !recessedProduct) return [];
  const needsConcealedCover = asksForConcealed || concealedProduct;
  const needsRecessedEscutcheon = !needsConcealedCover && (asksForRecessed || recessedProduct);

  const familyTokens = sprinklerFamilyTokens(main);
  const requestedFinish = finishFromText(requirementText) ?? finishFromText(mainText);
  const mainDn = main.dnValues[0] ?? null;
  const accessories = ahlsellMldlProducts().filter((product) => product.productType === "sprinkler_accessory");
  const ranked = accessories.flatMap((accessory) => {
    const text = normalize(`${accessory.productName} ${accessory.model ?? ""}`);
    const isGuard = /\bgitter\b/.test(text);
    const isCover = /\b(lokk|skjult)\b/.test(text);
    const isEscutcheon = /\b(dekkskiv(?:e)?|pyntering|rosett|escutcheon)\b/.test(text);
    if (asksForGuard && !isGuard) return [];
    if (needsConcealedCover && !isCover) return [];
    if (needsRecessedEscutcheon && !isEscutcheon) return [];
    if (!asksForGuard && !asksForConcealed && !concealedProduct && !asksForRecessed && !recessedProduct) return [];

    const accessoryFamilies = sprinklerFamilyTokens(accessory);
    const familyMatches = familyTokens.length === 0
      || accessoryFamilies.length === 0
      || familyTokens.some((family) => accessoryFamilies.includes(family));
    if (!familyMatches) return [];
    const accessoryDn = accessory.dnValues[0] ?? null;
    if (mainDn !== null && accessoryDn !== null && mainDn !== accessoryDn) return [];
    let score = 0;
    if (familyTokens.some((family) => accessoryFamilies.includes(family))) score += 50;
    if (mainDn !== null && accessoryDn === mainDn) score += 20;
    if (requestedFinish && finishFromText(text) === requestedFinish) score += 15;
    if (needsConcealedCover && isCover) score += 20;
    if (needsRecessedEscutcheon && isEscutcheon) score += 20;
    if (asksForGuard && isGuard) score += 20;
    return [{ accessory, score }];
  }).sort((left, right) => right.score - left.score);

  const required = asksForGuard || asksForConcealed || asksForRecessed || concealedProduct;
  const reason = asksForGuard
    ? "Specifikationen kräver skydd; kontrollera modell, riktning och dimension."
    : needsConcealedCover
      ? "Dolt montage behöver ett kompatibelt täcklock för exakt sprinklerfamilj."
      : "Infällt montage behöver en kompatibel täckbricka/rosett för exakt sprinklerfamilj.";
  return ranked.slice(0, 3).map(({ accessory, score }) => suggestion(
    accessory,
    reason,
    required,
    score >= 70 ? "compatible" : "review"
  ));
}

function hoseAccessories(main: AhlsellMldlProduct) {
  const mainModels = modelTokens(`${main.model ?? ""} ${main.productName}`);
  const brackets = ahlsellMldlProducts()
    .filter((product) => product.productType === "support_bracket")
    .map((accessory) => {
      const text = normalize(`${accessory.productName} ${accessory.model ?? ""}`);
      const explicitFamily = mainModels.some((model) => text.includes(model.toLocaleLowerCase("en-US")));
      const genericHoseBracket = /\b(feste|slangefeste|brakett)\b/.test(text);
      return { accessory, score: explicitFamily ? 100 : genericHoseBracket ? 30 : 0, explicitFamily };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score);
  return brackets.slice(0, 3).map(({ accessory, explicitFamily }) => suggestion(
    accessory,
    explicitFamily
      ? "Fästet anger samma VicFlex-slangfamilj i MLDL-beskrivningen."
      : "Sprinklerslangen behöver normalt ett montagefäste; takprofil och slangfamilj måste kontrolleras.",
    false,
    explicitFamily ? "compatible" : "review"
  ));
}

function dryValveAccessories(main: AhlsellMldlProduct) {
  const mainText = normalize(`${main.productName} ${main.model ?? ""}`);
  const candidates = ahlsellMldlProducts().filter((product) => {
    const text = normalize(`${product.productName} ${product.model ?? ""}`);
    return (product.productType === "trim_kit" || product.productType === "accelerator")
      && /\b(?:d?768n?|d?769n?)\b/.test(text)
      && /\b(?:d?768n?|d?769n?)\b/.test(mainText);
  });
  return candidates.slice(0, 3).map((accessory) => suggestion(
    accessory,
    accessory.productType === "trim_kit"
      ? "Torrventilen behöver rätt trim-/alarmkit för serie 768/769."
      : "Acceleratorn är ett möjligt systemtillbehör för serie 768/769; dimensionering och krav ska kontrolleras.",
    accessory.productType === "trim_kit",
    /\b(?:d?768n?|d?769n?)\b/.test(normalize(accessory.productName)) ? "compatible" : "review"
  ));
}

function wetValveAccessories(main: AhlsellMldlProduct) {
  return ahlsellMldlProducts()
    .filter((product) => product.productType === "trim_kit" && /\b751\b/.test(normalize(product.productName)))
    .filter((product) => dimensionsCompatible(main, product))
    .slice(0, 2)
    .map((accessory) => suggestion(
      accessory,
      "Ventilstationen saknar uttryckligen komplett trim i MLDL-beskrivningen; kontrollera om dräneringssatsen ska beställas separat.",
      false,
      "review"
    ));
}

function suggestion(
  product: AhlsellMldlProduct,
  reason: string,
  required: boolean,
  compatibility: AhlsellAccessorySuggestion["compatibility"]
): AhlsellAccessorySuggestion {
  const productUrl = new URL("https://www.ahlsell.no/search");
  productUrl.searchParams.set("parameters.SearchPhrase", product.articleNumber);
  return {
    articleNumber: product.articleNumber,
    productName: product.productName,
    manufacturer: product.manufacturer,
    productUrl: product.sourceUrl || productUrl.toString(),
    quantity: 1,
    unit: "st",
    reason,
    required,
    compatibility,
    source: "structured_database"
  };
}

function sprinklerFamilyTokens(product: AhlsellMldlProduct) {
  const values = modelTokens(`${product.model ?? ""} ${product.productName}`);
  return [...new Set(values.flatMap((model) => {
    const match = model.match(/^V(\d{2})/);
    return match ? [`V${match[1]}`] : [model];
  }))];
}

function modelTokens(value: string) {
  return [...value.matchAll(/\b(?:V|D|AB|VB|AH|AQF)\s*-?\s*\d{1,5}[A-Za-z]*\b/gi)]
    .map((match) => match[0].replace(/[^a-z0-9]/gi, "").toUpperCase());
}

function dimensionsCompatible(left: AhlsellMldlProduct, right: AhlsellMldlProduct) {
  if (left.dnValues.length === 0 || right.dnValues.length === 0) return true;
  const rightDnValues: readonly number[] = right.dnValues;
  return left.dnValues.some((dn) => rightDnValues.includes(dn));
}

function finishFromText(value: string) {
  if (/\b(hvit|vit|white)\b/.test(value)) return "white";
  if (/\b(sort|svart|black)\b/.test(value)) return "black";
  if (/\b(krom|chrome)\b/.test(value)) return "chrome";
  if (/\b(mess|messing|brass)\b/.test(value)) return "brass";
  return null;
}

function flatten(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(flatten).join(" ");
  if (value && typeof value === "object") return Object.values(value as Record<string, unknown>).map(flatten).join(" ");
  return "";
}

function normalize(value: string) {
  return value.toLocaleLowerCase("nb-NO")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ø/g, "o")
    .replace(/æ/g, "ae")
    .replace(/å/g, "a")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
