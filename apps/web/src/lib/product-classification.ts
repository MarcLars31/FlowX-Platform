import { PRODUCT_REQUIREMENT_CATEGORIES, type ProductRequirementCategory } from "./product-category-taxonomy";
import { normalizeQuantityUnit } from "./quantity-value";
import { requirementDiscipline, requirementHeading, requirementNsCode } from "./requirement-discipline";
import { isCompletePipeLengthDescription, ns3420ProductFamily } from "./ns3420-product-classification";
import { isManifoldCabinetProduct } from "./ahlsell-manifold-cabinet";
import { isCableTrunkingProduct } from "./ahlsell-cable-trunking";
import { immediateParentHeading, mainProductText, normalizeTechnicalText } from "./ahlsell-requirement-context";
import { CONTROL_VALVE_PATTERN, ENERGY_VALVE_PATTERN, isLuminaireProduct } from "./ahlsell-functional-products";
import { electricalHeatingIntent } from "./ahlsell-electrical-heating";
import { hasSprinklerContext, hasSprinklerHeadEvidence } from "./sprinkler-requirement-context";

export type ProductIntent = "wet_alarm_valve" | "dry_alarm_valve" | "manometer" | "pressure_switch"
  | "flow_switch" | "ball_valve" | "butterfly_valve" | "shutoff_valve" | "check_valve"
  | "pressure_reducing_valve" | "energy_valve" | "control_valve" | "luminaire" | "electric_heater" | "heating_cable" | "pipe" | "coupling" | "flanged_bend" | "bend" | "tee"
  | "reducer" | "cap" | "branch" | "flange_adapter" | "pump" | "strainer" | "support"
  | "test_drain" | "flushing_connection" | "sprinkler_head" | "sprinkler_guard" | "sprinkler_hose" | "sprinkler_cabinet"
  | "water_meter" | "flow_meter" | "alarm_device" | "sensor_pocket" | "foam_extinguisher" | "portable_fire_extinguisher"
  | "toilet" | "shower_set" | "manifold_cabinet" | "cable_trunking" | "custom_fabrication" | "key_switch" | "valve_actuator" | "generic";

/** The row's product and attributes govern retrieval, before included parts. */
export function inferProductIntent(requirement: Record<string, unknown>): ProductIntent {
  const value = record(requirement.value_json);
  const unit = normalizeQuantityUnit(value.unit);
  const attributes = record(value.attributes);
  const description = String(requirement.value_text ?? requirement.display_name ?? "");
  const source = normalize(`${mainProductText(description)} ${Object.entries(attributes)
    .filter(([key]) => /^(?:type(?: .*)?|rordel|ventiltype|sprinklertype|sprinkleranlegg|slokkemiddel|k faktor|utlosningstemperatur)$/.test(normalize(key)))
    .map(([key, item]) => `${key} ${item}`).join(" ")}`);
  const detail = normalize(`${value.technicalSpecification ?? ""} ${value.sourceText ?? ""} ${requirement.source_excerpt ?? ""}`);
  const has = (pattern: RegExp) => pattern.test(source);
  const category = String(requirement.category ?? "");
  const primaryDescription = normalize(description);
  const codeFamily = ns3420ProductFamily(String(value.nsCode ?? requirement.requirement_key ?? ""), description);
  const sprinklerContext = hasSprinklerContext(requirement);
  if (isManifoldCabinetProduct(description)) return "manifold_cabinet";
  // Metres measure channels too; a named channel outranks a stale pipe category.
  if (isCableTrunkingProduct(description)) return "cable_trunking";
  if (isLuminaireProduct(description)) return "luminaire";
  const heating = electricalHeatingIntent(requirement);
  if (heating) return heating;
  const discipline = requirementDiscipline(requirement);
  if (discipline === "electrical" || discipline === "ventilation") return "generic";
  if (ENERGY_VALVE_PATTERN.test(source)) return "energy_valve";
  if (CONTROL_VALVE_PATTERN.test(source)) return "control_valve";

  // A named main item outranks old categories and references to equipment it serves.
  if (/^(?:nokkelbryter|nokkelboks|nyckelbrytare|nyckelbox|key switch|key box)\b/.test(primaryDescription)) return "key_switch";
  if (/^(?:(?:elektrisk|termisk|elektronisk)\s+)?(?:aktuator|actuator|ventilmotor)\b/.test(primaryDescription)) return "valve_actuator";
  if (/^(?:dren(?:erings)?kar|oppsamlingskar|utjevningskar)\b/.test(primaryDescription)) return "custom_fabrication";
  if (/^(?:trykkvakt|trykkbryter|pressostat|pressure switch)\b/.test(primaryDescription)) return "pressure_switch";
  if (/^(?:stromningsvakt|flow switch)\b/.test(primaryDescription)) return "flow_switch";
  if (/^(?:manometer|pressure gauge)\b/.test(primaryDescription)) return "manometer";
  if (/^overgang fra pe til stal\b|^flens pa pe\b/.test(primaryDescription)) return "flange_adapter";
  const dimensionOnly = /^(?:dimensjon\s+)?dn\s*\d+\b/.test(primaryDescription);
  const explicitFitting = !isCompletePipeLengthDescription(description)
    && (/\b(?:bend|albue|tee|t stykke|reduksjon|endelokk|kupling)\b/.test(mainProductText(description))
      || Object.keys(attributes).some(key => normalize(key) === "rordel"));
  if (dimensionOnly && unit === "m" && codeFamily !== "sprinkler_hose" && !explicitFitting) return "pipe";
  const mainHeading = dimensionOnly ? normalize(immediateParentHeading(requirement)) : mainProductText(description);
  if (/^(?:(?:innendors|utendors|komplett|nye)\s+)*(?:vannledning|stalror|kobberror|kopparror|trykkror|avlopsror|sprinklerror|rorledning|ror)\b/.test(mainHeading)
    && !explicitFitting && !/\brordel\b/.test(mainHeading) && (unit === "m" || /\b(?:vannledning|rorledning)\b/.test(mainHeading)) && codeFamily !== "sprinkler_hose") return "pipe";

  // A quantified pipe assembly includes fittings; they are not its main item.
  if (isCompletePipeLengthDescription(description)
    && (unit === "m" || ns3420ProductFamily(value.nsCode, description) === "pipe")) return "pipe";
  if (/^sprinkler(?:\s+antall\b.*)?$/.test(primaryDescription)) return "sprinkler_head";
  // A child alarm device must not inherit its parent's alarm-valve product type.
  if (/^(?:alarmgiver|alarmapparat|alarmkit)\b/.test(normalize(description))) return "alarm_device";
  if (/^(?:kapasitetsmaler|stromningsmaler|flowmeter|flow meter|gap meter)\b/.test(normalize(description))) return "flow_meter";
  if (dimensionOnly) {
    const parentHeading = normalize(immediateParentHeading(requirement));
    if (/^(?:innendors\s+)?stengeventiler?\b/.test(parentHeading)) return "shutoff_valve";
    if (/^(?:kapasitetsmaler|stromningsmaler|flowmeter|flow meter)\b/.test(parentHeading)) return "flow_meter";
  }

  // The main product wins over included valves and stale extraction categories.
  // Keep this anchored so a valve described as "for WC" remains a valve.
  if (/^(?:(?:komplett|elektrisk|hoydejusterbar|hojdjusterbar|vegghengt|vagghangd|veggmontert|vaggmonterad|gulvstaende|golvstaende)\s+)*(?:klosett|toalett(?:modul|kassett)?|wc|toilet)\b/.test(normalize(description))) return "toilet";
  if (/^(?:(?:komplett|veggmontert|vaggmonterad)\s+)*(?:dusj|dusch|handdusj|handdusch|dusjsett|duschset)\b/.test(normalize(description))) return "shower_set";

  if (has(/\b(handslokker|handslukker|handslokkeapparat|brannslokker|brannslukker)\b/)) {
    return has(/\b(skum|foam)\b/) ? "foam_extinguisher" : "portable_fire_extinguisher";
  }
  if (sprinklerContext && has(/\b(beskyttelsesgit(?:ter|re)|skyddskorg|sprinklerkorg|sprinklergitter)\b/)) return "sprinkler_guard";
  if (has(/\b(sprinklerskap|reservesprinklerhoder)\b/) || (/\bskap med reservesprinklerhoder\b/.test(detail) && /^sprinkleranlegg$/i.test(description))) return "sprinkler_cabinet";
  if (has(/\b(vannmaler|vannkapasitetsmaler|water meter)\b/)) return "water_meter";
  if (has(/\b(folerlomme|sensorlomme|thermowell)\b/) || (has(/\bseparat tilkobling av utstyr\b/) && /\b(folerlomme|trykkgiver|trykkvakt)\b/.test(detail))) return "sensor_pocket";
  if ((sprinklerContext || codeFamily === "sprinkler_hose") && has(/\b(sprinklerslange|sprinkler slange|fleksibelslange|koblingsslange|flexislange|flexible sprinkler hose|braided hose|vicflex|dryflex)\b|\bbrannslokking\s+slange\b/)) return "sprinkler_hose";
  if (has(/\b(pumpe innendors|sprinklerpumpe|lensepumpe|type pumpe|pumpedrift)\b/)) return "pump";
  if (has(/\b(partikkelutskiller|grovfilter|y filter|sil netting|type partikkelutskiller)\b/)) return "strainer";
  if (has(/\b(torr.*(?:alarmventil|sprinklersentral)|dry (?:alarm )?valve|d769n)\b/)) return "dry_alarm_valve";
  if (has(/\b(vat alarmventil|wet alarm valve)\b/) || sprinklerContext && has(/\bkontrollventilsett\b/)) return "wet_alarm_valve";
  if (has(/\b(trykkreduksjonsventil|pressure reducing valve|reduksjonsventil)\b/)) return "pressure_reducing_valve";
  if (has(/\b(tilbakeslagsventil|backventil|check valve)\b/)) return "check_valve";
  if (has(/\b(dreiespjeldventil|spjeldventil|butterfly valve)\b/)) return "butterfly_valve";
  if (has(/\b(kuleventil|ball valve)\b/)) return "ball_valve";
  if (has(/\b(stengeventil|sluseventil|gate valve|sprinklerventil)\b/)) return "shutoff_valve";
  if (has(/\b(trykkvakt|trykkbryter|pressostat|pressure switch)\b/)) return "pressure_switch";
  if (has(/\b(alarmgiver|alarmapparat|alarmkit)\b/)) return "alarm_device";
  if (has(/\b(stromningsvakt|flow switch)\b/)) return "flow_switch";
  if (has(/\b(maleinstrument|manometer|analog.*trykk|absolutt trykk.*direkte|maling av absolutt trykk|direkte maling|avlesning analog)\b/)) return "manometer";
  if (/\btilkoblingspunkter for spyling\b/.test(detail)) return "flushing_connection";
  if (has(/\b(testarrangement|test og drener|testventil)\b/)) return "test_drain";
  // A stale category alone must not turn an unrecognized named product into a valve.
  if (category === "valve" && /^(?:dn\s*\d+|dimensjon\b|(?:innendors )?(?:ventil|armatur))/.test(primaryDescription)) return "shutoff_valve";
  if (has(/\b(overgang fra pe til stal|flens pa pe rille|flensadapter|flenseadapter)\b/)) return "flange_adapter";
  if (has(/\b(blindflens|endelokk|endebunn|plugg)\b/)) return "cap";
  if (has(/\b(anboringsklammer|anborring|avstikk|utlopskupling)\b/)) return "branch";
  if (has(/\b(dimensjonsovergang|reduksjonskupling|reduksjon|reducer)\b/)) return "reducer";
  if (has(/\b(t ror|t klave|t stykke|t stykker|tee)\b/)) return "tee";
  if (has(/\bbend\b/) && /\b(flens|flanged)\b/.test(primaryDescription)) return "flanged_bend";
  if (has(/\b(bend|albue|rorboy|elbow)\b/)) return "bend";
  if (has(/\b(kupling|rillekobling|hurtigrillekobling|coupling)\b/)) return "coupling";
  if (has(/\b(dren(?:erings)?kar|oppsamlingskar|utjevningskar|specialtilvirk)\b/)) return "custom_fabrication";
  if (/^(?:(?:red|sorte|rillede|innendors|utendors|lopemeter)\s+)*(?:pipe|ror|rorledning|stalror|rilleror|sprinklerror)\b/.test(mainProductText(description))
    && !explicitFitting && codeFamily !== "sprinkler_hose") return "pipe";
  if (hasSprinklerHeadEvidence(requirement)) return "sprinkler_head";
  if (codeFamily) return codeFamily;
  if (category === "pipe" && (dimensionOnly || /\b(?:ror|stalror|sprinklerror|rorledning)\b/.test(source))) return "pipe";
  if (category === "support" || has(/\b(oppheng|rorstotte|support|rorbarer|klammer)\b/)) return "support";
  if (category === "fitting" && dimensionOnly) return "coupling";
  return "generic";
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function normalize(value: string) {
  return value.toLowerCase().replace(/ø/g, "o").replace(/æ/g, "ae").normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

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

function inferProductCategory(requirement: Record<string, unknown>): ProductRequirementCategory | "unknown" {
  const heading = requirementHeading(requirement);
  const ownName = normalizeTechnicalText(heading);
  const code = requirementNsCode(requirement);
  const discipline = requirementDiscipline(requirement);
  if (isCableTrunkingProduct(heading)) return "cable_trunking";
  if (electricalHeatingIntent(requirement)) return "electrical_heating";
  if (/^maleinstrument\b/.test(ownName)) return "control";
  if (/^merking av (?:innendors )?rorledning\b/.test(ownName)) return "pipe";
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
  if (/^(?:ventil\w*|specialventil\w*|spesialventil\w*|stengeventil\w*|avstangningsventil\w*|sprinklersentral|alarmventil|tilbakeslagsventil|kuleventil|spjeldventil|reguleringsventil)\b/.test(plumbingName)) return "valve";
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
  return discipline === "plumbing" ? "plumbing_other" : "unknown";
}


export type ProductCategory = ProductRequirementCategory;
const INTENT_CATEGORIES = {
  energy_valve: "valve", control_valve: "valve", luminaire: "electrical_lighting", electric_heater: "electrical_heating", heating_cable: "electrical_heating", cable_trunking: "cable_trunking",
  wet_alarm_valve: "valve", dry_alarm_valve: "valve", manometer: "control", pressure_switch: "control",
  flow_switch: "control", ball_valve: "valve", butterfly_valve: "valve", shutoff_valve: "valve", check_valve: "valve",
  pressure_reducing_valve: "valve", pipe: "pipe", coupling: "fitting", flanged_bend: "fitting", bend: "fitting", tee: "fitting",
  reducer: "fitting", cap: "fitting", branch: "fitting", flange_adapter: "fitting", pump: "pump", strainer: "filter", support: "support",
  test_drain: "valve", flushing_connection: "valve", sprinkler_head: "sprinkler_head", sprinkler_guard: "sprinkler_head",
  sprinkler_hose: "sprinkler_hose", sprinkler_cabinet: "other", water_meter: "control", flow_meter: "control", alarm_device: "control",
  sensor_pocket: "control", foam_extinguisher: "other", portable_fire_extinguisher: "other", toilet: "sanitary", shower_set: "sanitary",
  manifold_cabinet: "sanitary", custom_fabrication: "other", key_switch: "control", valve_actuator: "control"
} satisfies Record<Exclude<ProductIntent, "generic">, ProductCategory>;


/** Shared product identity for navigation, extraction, retrieval and comparison. */
export function classifyProductRequirement(requirement: Record<string, unknown>) {
  const intent = inferProductIntent(requirement);
  const category = intent === "generic" ? inferProductCategory(requirement) : INTENT_CATEGORIES[intent];
  return { intent, category };
}

/** The extraction schema retains its coarse groups; the shared identity stays specific. */
export function productExtractionCategory(requirement: Record<string, unknown>): "sprinkler_head" | "sprinkler_hose" | "pipe" | "fitting" | "valve" | "control" | "support" | "other" | "unknown" {
  const { category } = classifyProductRequirement(requirement);
  if (category === "plumbing_other") return "unknown";
  if (category === "automation" || category === "electrical_safety") return "control";
  if (category === "pump") return "control";
  if (category === "filter") return "fitting";
  if (["sprinkler_head", "sprinkler_hose", "pipe", "fitting", "valve", "control", "support", "unknown"].includes(category)) return category as ReturnType<typeof productExtractionCategory>;
  return "other";
}

function isProductRequirementCategory(value: unknown): value is ProductRequirementCategory {
  return typeof value === "string" && PRODUCT_REQUIREMENT_CATEGORIES.some(item => item.id === value);
}
