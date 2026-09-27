import { ns3420ProductFamily } from "./ns3420-product-classification";
import { isCableTrunkingProduct } from "./ahlsell-cable-trunking";
import { normalizeTechnicalText } from "./ahlsell-requirement-context";
import { requirementDiscipline, requirementHeading, requirementNsCode } from "./requirement-discipline";

export const PRODUCT_REQUIREMENT_CATEGORY_VERSION = 2;

export const PRODUCT_REQUIREMENT_CATEGORIES = [
  { id: "sprinkler_head", label: "Sprinklerhuvuden och galler", shortLabel: "Sprinklerhuvuden" },
  { id: "sprinkler_hose", label: "Sprinklerslangar", shortLabel: "Sprinklerslangar" },
  { id: "pipe", label: "Rör", shortLabel: "Rör" },
  { id: "fitting", label: "Rördelar och kopplingar", shortLabel: "Rördelar" },
  { id: "valve", label: "Ventiler", shortLabel: "Ventiler" },
  { id: "control", label: "Styrning och mätning", shortLabel: "Styrning" },
  { id: "support", label: "Upphängning och montage", shortLabel: "Upphängning" },
  { id: "sanitary", label: "Sanitetsprodukter", shortLabel: "Sanitet" },
  { id: "pump", label: "Pumpar", shortLabel: "Pumpar" },
  { id: "filter", label: "Filter och avskiljare", shortLabel: "Filter" },
  { id: "plumbing_other", label: "Övriga VVS-produkter", shortLabel: "Övrig VVS" },
  { id: "electrical_cable", label: "Kablar och ledningar", shortLabel: "Kablar" },
  { id: "cable_support", label: "Kabelstegar och kabelbärsystem", shortLabel: "Kabelbärsystem" },
  { id: "cable_trunking", label: "Vägg- och installationskanaler", shortLabel: "Kabelkanaler" },
  { id: "electrical_conduit", label: "Installationsrör för el", shortLabel: "Elrör" },
  { id: "electrical_infrastructure", label: "Kabelskydd och kabelbrunnar", shortLabel: "Kabelskydd" },
  { id: "electrical_connections", label: "Elanslutningar och installationspunkter", shortLabel: "Elanslutningar" },
  { id: "electrical_outlets", label: "Uttag, brytare och uttagsstavar", shortLabel: "Uttag och brytare" },
  { id: "electrical_distribution", label: "Elfördelning och kraftförsörjning", shortLabel: "Elfördelning" },
  { id: "electrical_lighting", label: "Belysning och nödbelysning", shortLabel: "Belysning" },
  { id: "electrical_earthing", label: "Jordning och åskskydd", shortLabel: "Jordning" },
  { id: "electrical_heating", label: "Elvärme", shortLabel: "Elvärme" },
  { id: "electrical_safety", label: "Larm, detektorer och säkerhet", shortLabel: "Larm och säkerhet" },
  { id: "automation", label: "Automation och givare", shortLabel: "Automation" },
  { id: "electrical_other", label: "Övrig el och tele", shortLabel: "Övrig el och tele" },
  { id: "ventilation_duct", label: "Ventilationskanaler och kanaldelar", shortLabel: "Ventilationskanaler" },
  { id: "ventilation_terminal", label: "Luftdon och ventilationsspjäll", shortLabel: "Luftdon och spjäll" },
  { id: "ventilation_equipment", label: "Ventilationsaggregat, fläktar och filter", shortLabel: "Ventilationsutrustning" },
  { id: "ventilation_other", label: "Övrig ventilation", shortLabel: "Övrig ventilation" },
  { id: "other", label: "Övriga produkter", shortLabel: "Övrigt" }
] as const;

export type ProductRequirementCategory = (typeof PRODUCT_REQUIREMENT_CATEGORIES)[number]["id"];
const categoryOrder = new Map<string, number>(PRODUCT_REQUIREMENT_CATEGORIES.map((category, index) => [category.id, index]));

// Product names describe the actual item. Incidental words in locations,
// comments, chapter requirements and included accessories never pick its group.
const namedGroups: ReadonlyArray<readonly [RegExp, ProductRequirementCategory]> = [
  [/^(?:kabelstig\w*|kabelbro\w*|kabelban\w*|kabelplat\w*|kabelrenn\w*|armaturskinne\w*)\b/, "cable_support"],
  [/^(?:(?:innstopt|nedgravd|korrugert|stivt|prefabrikkert)\s+)?(?:elror|elektrikerror|kabelror|trekkeror|installasjonsror|installationsror)\b/, "electrical_conduit"],
  [/^(?:prefabrikkert\s+)?(?:kabelvern|kabelskydd|kabelkum|kabelbrunn)\b/, "electrical_infrastructure"],
  [/^(?:kabel|kabler|hoyspenningskabel|kraftkabel|signalkabel|fiberkabel|datakabel|elektrisk kabel)\b/, "electrical_cable"],
  [/^(?:jordingsmateriell|jordledning|jordelektrode|jordningsmateriel|lynvern|askskydd)\b/, "electrical_earthing"],
  [/^(?:stikkontakt\w*|uttag\w*|grenstav\w*|uttaksstav\w*|bryter|stromstallare)\b/, "electrical_outlets"],
  [/^(?:elkraftfordeling|fordelingstavle|fordelinger for distribusjon av elkraft|sikringsskap|avbruddsfri kraftforsyning|ups|transformator|kapslet stromskinne|stromskinne)\b/, "electrical_distribution"],
  [/^(?:lysarmatur\w*|belysningsarmatur\w*|nodlys\w*|armatur for (?:belysning|nod|reserve)|led armatur)\b/, "electrical_lighting"],
  [/^(?:varmekabel\w*|varmeovn\w*|elradiator\w*|elektrisk varmeovn)\b/, "electrical_heating"],
  [/^(?:detektor for brann|branndetektor|brannalarm\w*|innbruddsalarm\w*|adgangskontroll\w*|sentral for kontroll og alarm|roykdetektor|kamera for overvakning)\b/, "electrical_safety"],
  [/^(?:automatiseringsniva|styringskoder|sensor for|giver for|aktuator for bygningsautomasjon)\b/, "automation"],
  [/^(?:ventilasjonskanal\w*|ventilationskanal\w*|luftkanal\w*|kanaldel\w* for ventilasjon)\b/, "ventilation_duct"],
  [/^(?:tilluftsventil\w*|avtrekksventil\w*|luftdon\w*|tilluftsdon\w*|fraluftsdon\w*|ventilasjonsventil\w*|brannspjeld\w*|ventilasjons(?:spjeld|spjall)\w*)\b/, "ventilation_terminal"],
  [/^(?:ventilasjonsaggregat\w*|ventilationsaggregat\w*|luftbehandlingsaggregat\w*|lydfelle\w*|lyddemper\w*|luftfilter\w*|kanalvifte\w*|avtrekksvifte\w*)\b/, "ventilation_equipment"]
];

export function productRequirementCategory(requirement: Record<string, unknown>): ProductRequirementCategory {
  const overview = requirement.overview as { category?: unknown; categoryVersion?: unknown } | undefined;
  if (overview?.categoryVersion === PRODUCT_REQUIREMENT_CATEGORY_VERSION && isProductRequirementCategory(overview.category)) return overview.category;
  const heading = requirementHeading(requirement);
  const ownName = normalizeTechnicalText(heading);
  const code = requirementNsCode(requirement);
  const discipline = requirementDiscipline(requirement);
  if (isCableTrunkingProduct(heading)) return "cable_trunking";
  for (const [pattern, category] of namedGroups) if (pattern.test(ownName)) return category;

  if (discipline === "electrical") {
    if (/^(?:punkt|separat tilkobling av (?:elkraft|ekom))\b/.test(ownName)) return "electrical_connections";
    if (/^(?:skap|vern|batteri|stromforsyning|fordeling|elgenerator)\b/.test(ownName)) return "electrical_distribution";
    if (/^(?:varmeelement|varmefolie)\b/.test(ownName)) return "electrical_heating";
    return "electrical_other";
  }
  if (discipline === "ventilation") {
    if (/^(?:kanal|bend|t stykke|overgang|reduksjon)\b/.test(ownName)) return "ventilation_duct";
    if (/^(?:ventil|spjeld|spjall|rist|don)\b/.test(ownName)) return "ventilation_terminal";
    if (/^(?:vifte|flakt|filter|aggregat|lyddemper)\b/.test(ownName)) return "ventilation_equipment";
    return "ventilation_other";
  }

  // Own named VVS products outrank references to their included parts.
  if (/^(?:(?:standard|kvikk respons)\s+)*(?:sprinklerhode\w*|sprinkler head\w*|sprinklerhuvud\w*|sprinklergitter|beskyttelsesgitter|skyddskorg|sprinkler)\b/.test(ownName)) return "sprinkler_head";
  if (/^(?:sprinklerslang\w*|fleksibelslang\w*|flexislang\w*|vicflex|dryflex)\b/.test(ownName)) return "sprinkler_hose";
  const plumbingName = ownName.replace(/^(?:innendors|utendors|innvendig|utvendig)\s+/, "");
  if (/^(?:kupling|kobling|rillekobling|bend|rorboy|t ror|t stykke|tee|reduksjon|overgang|flensadapter|endelokk|anboringsklammer|rordel\w*|tilkobling av vannledning)\b/.test(plumbingName)) return "fitting";
  if (/^(?:ventil\w*|stengeventil\w*|avstangningsventil\w*|sprinklersentral|alarmventil|tilbakeslagsventil|kuleventil|spjeldventil|reguleringsventil)\b/.test(plumbingName)) return "valve";
  if (/^(?:pressostat|trykkvakt|tryckvakt|stromningsvakt|flow switch|manometer|mengdemaler|vannmaler|termometer)\b/.test(plumbingName)) return "control";
  if (/^(?:roroppheng|rorklammer|oppheng|klammer|dekkskive|montasjemateriell|rorstotte)\b/.test(plumbingName)) return "support";
  if (/^(?:pumpe\w*|pump|sirkulasjonspumpe\w*|trykkokningspumpe\w*)\b/.test(plumbingName)) return "pump";
  if (/^(?:filter\w*|partikkelutskiller|smussutskiller|luftutskiller|avskiller\w*)\b/.test(plumbingName)) return "filter";
  if (/^(?:wc|klosett\w*|toalett\w*|servant\w*|tvattstall|dusj\w*|dusch\w*|urinal\w*|blandebatteri|tappearmatur|sanitaerutstyr|fordelerskap|fordelarskap)\b/.test(plumbingName)) return "sanitary";
  const codeFamily = ns3420ProductFamily(code, heading);
  if (codeFamily) return codeFamily;
  if (/^(?:rorledning|vattenledning|vannledning|ror|sprinklerror|stalror|sorte stalror|sorte ror)\b/.test(plumbingName)) {
    if (/^rorledning\s+(?:brannslokking\s+)?slange\b/.test(plumbingName)) return "sprinkler_hose";
    if (/^rorledning\s+(?:brannslokking\s+)?rordel\b/.test(plumbingName)) return "fitting";
    return "pipe";
  }

  // Legacy category is useful for unnamed/dimension-only subposts, but cannot
  // override a named unknown product, an electrical code or a ventilation code.
  const dimensionOnly = /^(?:dimensjon\s+)?(?:dn|diameter|o)?\s*\d+(?:\s|$)/.test(ownName);
  if ((!ownName || dimensionOnly) && isProductRequirementCategory(requirement.category)) return requirement.category;
  return discipline === "plumbing" ? "plumbing_other" : "other";
}

export function sortProductRequirementsByCategory<Row extends Record<string, unknown>>(requirements: readonly Row[]) {
  return requirements.map((requirement, index) => ({ requirement, index }))
    .sort((left, right) => productCategoryOrder(productRequirementCategory(left.requirement))
      - productCategoryOrder(productRequirementCategory(right.requirement)) || left.index - right.index)
    .map(({ requirement }) => requirement);
}

export function productRequirementCategoryLabel(category: ProductRequirementCategory) {
  return PRODUCT_REQUIREMENT_CATEGORIES.find(item => item.id === category)?.label ?? "Övriga produkter";
}

function productCategoryOrder(category: ProductRequirementCategory) {
  return categoryOrder.get(category) ?? PRODUCT_REQUIREMENT_CATEGORIES.length;
}

function isProductRequirementCategory(value: unknown): value is ProductRequirementCategory {
  return typeof value === "string" && categoryOrder.has(value);
}
