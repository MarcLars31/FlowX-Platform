import { rankAhlsellCandidates } from "./ahlsell-candidate-ranking";
import { isAssemblyComponentCandidate, productAssemblyPlan, type AssemblyComponent } from "./product-assembly-plan";
import type { AhlsellLookupProduct } from "./ahlsell-product-lookup";
import { technicalConflictWarnings } from "./ahlsell-technical-conflicts";
import { normalizeTechnicalText } from "./ahlsell-requirement-context";

export function assessAssemblyComponents(requirement: Record<string, unknown>, component: AssemblyComponent, products: AhlsellLookupProduct[], main?: AhlsellLookupProduct | null): AhlsellLookupProduct[] {
  const family = products.filter(product => isAssemblyComponentCandidate(component.kind, `${product.productName} ${product.subtitle ?? ""}`));
  const plan = productAssemblyPlan(requirement);
  if (plan?.kind === "cabinet") return family;
  if (plan?.kind !== "pipe") return family.filter(product => !main || !explicitModelConflict(main, product)).map(product => ({ ...product, exactMatch: false, recommendation: "possible",
    matchWarnings: [...(product.matchWarnings ?? []), "Kontrollera tillverkarens kompatibilitet med exakt vald huvudprodukt och om tillbehöret redan ingår i leveransen.",
      ...(!main ? ["Huvudproduktens tekniska uppgifter kunde inte verifieras hos Ahlsell. Kontrollera dess datablad före tillbehörsval."] : [])]
  }));
  const value = requirement.value_json as { attributes?: Record<string, unknown> } | undefined;
  const pressure = Object.entries(value?.attributes ?? {}).find(([key]) => /^(?:trykk|tryck)$/i.test(key))?.[1];
  const dn = component.searchTerm.match(/\bDN\d+\b/)?.[0];
  const joint = main ? pipeConnection(productText(main)) : null;
  // Pipe-body material does not specify the fitting's material. Scope the
  // assessment to this part rather than ranking it as the main pipe again.
  const scoped = { value_text: component.searchTerm, category: component.kind === "support" ? "support" : "fitting",
    value_json: { attributes: { ...(dn ? { dimensjon: dn } : {}),
      ...(component.kind !== "support" && pressure ? { trykk: pressure } : {}),
      ...(component.kind !== "support" && joint ? { skjøt: joint === "threaded" ? "Gjenget" : "Rillet" } : {}) } } };
  const fittingPressure = Number(String(pressure ?? "").match(/\bPN\s*(\d+)/i)?.[1]);
  return rankAhlsellCandidates(scoped, family.map(product => ({ ...product,
    productName: `${product.productName} ${product.subtitle ?? ""}`.trim(),
    description: [product.description, product.subtitle].filter(Boolean).join(" ")
  }))).filter(product =>
    technicalConflictWarnings(product).length === 0
      && (!dn || pipeDn(product) === null || pipeDn(product) === Number(dn.slice(2)))
      && (component.kind === "support" || !fittingPressure || !knownPnBelow(productText(product), fittingPressure))
      && (component.kind === "support" || !main || !grooveSystemConflict(productText(main), productText(product)))
  ).map(product => ({ ...product,
    productName: products.find(item => item.articleNumber === product.articleNumber)?.productName ?? product.productName,
    subtitle: products.find(item => item.articleNumber === product.articleNumber)?.subtitle,
    exactMatch: false,
    matchWarnings: [...(product.matchWarnings ?? []), "Kontrollera att delen passar det valda rörets anslutning och att utförande och mängd stämmer med ritningen.",
      ...(!main ? ["Huvudproduktens tekniska uppgifter kunde inte verifieras hos Ahlsell. Kontrollera dess datablad före tillbehörsval."] : []),
      ...(main && /\b(?:rustfri\w*|rostfri\w*|stainless)\b/.test(normalizeTechnicalText(productText(main)))
        ? ["Rostfritt rörsystem: kontrollera tillåtna materialkombinationer och kopplingssystem enligt rörtillverkaren."] : [])]
  }));
}

function productText(product: AhlsellLookupProduct) {
  return [product.productName, product.subtitle, product.description, ...product.specifications].filter(Boolean).join(" ");
}

function pipeConnection(text: string) {
  const value = normalizeTechnicalText(text);
  const threaded = /\b(?:gjenget|gjengede|gangad|gangade|threaded)\b/.test(value);
  const grooved = /\b(?:rillet|rillede|rillad|rillade|grooved|igs|ogs)\b/.test(value);
  return threaded === grooved ? null : threaded ? "threaded" : "grooved";
}

function pipeDn(product: AhlsellLookupProduct) {
  const text = productText(product);
  const explicit = text.match(/\bDN\s*(\d+)\b/i)?.[1];
  if (explicit) return Number(explicit);
  const outside = [product.productName, product.subtitle ?? ""].map(value => value.match(/^\s*(\d+(?:[.,]\d+)?)\s*mm\b/i)?.[1]).find(Boolean);
  const sizes: Record<string, number> = { "21.3": 15, "26.9": 20, "33.7": 25, "42.4": 32, "48.3": 40, "60.3": 50, "76.1": 65, "88.9": 80, "114.3": 100, "139.7": 125, "168.3": 150, "219.1": 200 };
  return outside ? sizes[outside.replace(",", ".")] ?? null : null;
}

function knownPnBelow(text: string, required: number) {
  const ratings = [...text.matchAll(/\bPN\s*(\d+)(?:\s*\/\s*(\d+))?/gi)].flatMap(match => match.slice(1).filter(Boolean).map(Number));
  return ratings.length > 0 && Math.max(...ratings) < required;
}

function grooveSystemConflict(main: string, accessory: string) {
  const tokens = (text: string) => [...text.matchAll(/\b(?:IGS|OGS|StrengThin)\b/gi)].map(match => match[0].toUpperCase());
  const mainSystems = tokens(main);
  const partSystems = tokens(accessory);
  return mainSystems.length > 0 && partSystems.length > 0 && !mainSystems.some(system => partSystems.includes(system));
}

function explicitModelConflict(main: AhlsellLookupProduct, accessory: AhlsellLookupProduct) {
  const mainModels = [...productText(main).matchAll(/\b(?:V\d{2,4}|AV[- ]?1|(?:S|Series\s*)751)\b/gi)].map(match => normalizeTechnicalText(match[0]).replace(/ /g, ""));
  const targets = [...productText(accessory).matchAll(/\b(?:for|til|f\/)\s*(V\d{2,4}|AV[- ]?1|(?:S|Series\s*)751)\b/gi)].map(match => normalizeTechnicalText(match[1]).replace(/ /g, ""));
  return mainModels.length > 0 && targets.length > 0 && !mainModels.some(mainModel => targets.some(target => mainModel === target || /^v\d{2}$/.test(target) && mainModel.startsWith(target)));
}
