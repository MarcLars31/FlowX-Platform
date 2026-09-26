import { ahlsellRequirementIntent } from "./ahlsell-requirement-intent";
import { sprinklerAssemblyPlan } from "./sprinkler-assembly-plan";
import { pipeJointTypes, pipeJointSearchTerm } from "./pipe-technical-terms";

export type AssemblyComponentKind = "manifold" | "drainage" | "connection" | "pipe" | "valve" | "bend" | "tee" | "cap" | "coupling" | "support"
  | "retard_chamber" | "alarm_device" | "escutcheon" | "guard" | "sprinkler_hose" | "flange" | "fastener";
export type AssemblyComponent = {
  id: string; kind: AssemblyComponentKind; label: string; requirement: string;
  optional: boolean; searchTerm: string;
  quantityFromDrawing?: boolean;
  quantityNeedsReview?: boolean;
  conditional?: boolean;
};
export type ProductAssemblyPlan = { mainLabel: string; components: AssemblyComponent[]; kind: "cabinet" | "pipe" | "sprinkler"; guidance?: string };

/** Identify physical parts separately from performance and installation criteria.
 * No article or compatibility is inferred from the requirement alone. */
export function productAssemblyPlan(requirement: Record<string, unknown>): ProductAssemblyPlan | null {
  const intent = ahlsellRequirementIntent(requirement);
  if (intent === "pipe") return pipeAssemblyPlan(requirement);
  const sprinkler = sprinklerAssemblyPlan(requirement, intent);
  if (sprinkler) return sprinkler;
  if (intent !== "manifold_cabinet") return null;
  const value = record(requirement.value_json);
  const attrs = new Map(Object.entries(record(value.attributes)).map(([key, value]) => [normalize(key), String(value)]));
  const source = normalize([value.sourceText, value.technicalSpecification, requirement.source_excerpt]
    .filter(item => typeof item === "string").join(" "));
  const components: AssemblyComponent[] = [];
  const outlets = normalize(attrs.get("antall utganger") ?? "");
  const cold = outlets.match(/\b(\d+)\s*(?:kv|kaldtvann|kallvatten)\b/)?.[1];
  const hot = outlets.match(/\b(\d+)\s*(?:vv|varmtvann|varmvatten)\b/)?.[1];
  for (const [id, label, count] of [["cold-water", "Kallvattenfördelare", cold], ["hot-water", "Varmvattenfördelare", hot]] as const) {
    if (count && Number(count) > 0) components.push({ id, kind: "manifold", label,
      requirement: `${count} utgångar per skåp. Kontrollera fördelarens anslutningar och om den ingår i skåppaketet.`,
      optional: false, searchTerm: `Fordeler ${count} uttak` });
  }
  if (!cold && !hot) components.push({ id: "manifolds", kind: "manifold", label: "Fördelare",
    requirement: `Antal utgångar: ${attrs.get("antall utganger") ?? "behöver kontrolleras i PDF-posten"}. Kontrollera om fördelarna ingår i skåppaketet.`,
    optional: false, searchTerm: "Fordeler tappevann" });
  const drainage = attrs.get("drenering");
  if (drainage && !isExcluded(drainage)) components.push({ id: "drainage", kind: "drainage", label: "Dränering",
    requirement: `Dränering: ${drainage}. Kontrollera om dräneringsdelarna ingår i skåppaketet.`, optional: isOptional(drainage), searchTerm: "Drenering fordelerskap" });
  if (/\bkobberror\b/.test(source) && /\b(?:tilknytt\w*|tilkobl\w*)\b/.test(source)) components.push({ id: "connections", kind: "connection", label: "Anslutningar till befintliga kopparrör",
    requirement: `Anslut befintliga kopparrör till det valda systemet. Tillförseldimension enligt PDF: ${attrs.get("dimensjon tilforsel") ?? "saknas"}. Kontrollera mått, anslutningstyp och antal.`,
    optional: false, searchTerm: "Overgang kobber PEX" });
  if (/\bnye pex\b/.test(source)) components.push({ id: "pipe-runs", kind: "pipe", label: "PEX rör i rör till utrustning",
    requirement: "Nya PEX-ledningar från skåp till utrustning. Dimensioner och rörlängder måste kontrolleras mot ritning; skåpets antal anger inte rörmängden.",
    optional: false, searchTerm: "PEX rør i rør" });
  const valves = [...attrs].filter(([key, value]) => /stengeventil|avstangningsventil/.test(key) && !isExcluded(value));
  if (valves.length) components.push({ id: "valves", kind: "valve", label: "Avstängningsventiler",
    requirement: valves.map(([key, value]) => `${key}: ${value}`).join(". "),
    optional: valves.every(([, value]) => isOptional(value)), searchTerm: "Kuleventil fordeler" });
  return { mainLabel: "Fördelarskåp för tappvatten", components, kind: "cabinet" };
}

function pipeAssemblyPlan(requirement: Record<string, unknown>): ProductAssemblyPlan | null {
  const value = record(requirement.value_json);
  const attrs = new Map(Object.entries(record(value.attributes)).map(([key, value]) => [normalize(key), String(value)]));
  // Only this post's own description supplies named parts; a chapter or a
  // neighbouring pipe size must not add parts to the current row.
  const own = normalize(`${requirement.value_text ?? requirement.display_name ?? ""} ${value.sourceText ?? ""}`);
  if (!/\bkomplett med (?:deler|delar)\b|\b(?:inkl|inklusive) (?:deler|delar)\b/.test(own)) return null;
  const dn = normalize(attrs.get("dimensjon") ?? attrs.get("dimension") ?? "").match(/\b(?:dn\s*)?(\d{1,3})\b/)?.[1]
    ?? own.match(/\bdn\s*(\d{1,3})\b/)?.[1];
  const dimension = dn ? `DN${dn}` : "";
  const pressure = attrs.get("trykk") ?? attrs.get("tryck") ?? "";
  const joint = attrs.get("skjot") ?? "";
  const conditions = [dimension, pressure, joint].filter(Boolean).join(" · ");
  const components: AssemblyComponent[] = [];
  const definitions = [
    ["bends", "bend", "Böjar", "Bend", /\b(?:bend|albuer?|elbow|bojar?)\b/, "Vinkel och antal kontrolleras mot ritningen."],
    ["tees", "tee", "T-stycken", "T-rør", /\b(?:t (?:stykker|stycker|stycken|ror)|tee)\b/, "Alla anslutningsdimensioner och antal kontrolleras mot ritningen."],
    ["caps", "cap", "Ändlock", "Endelokk", /\b(?:endelo?kk?|endebunn|andlock|end cap)\b/, "Utförande och antal kontrolleras mot ritningen."],
    ["supports", "support", "Upphängning", "Rørklammer", /\b(?:oppheng|upphangning|rorstotte|support)\b/, "Fäste, belastning, avstånd och antal kontrolleras mot ritningen."]
  ] as const;
  for (const [id, kind, label, term, pattern, note] of definitions) {
    if (pattern.test(own)) components.push({ id, kind, label, optional: false, quantityFromDrawing: true,
      searchTerm: `${term} ${dimension}`.trim(),
      requirement: `${label} ingår enligt PDF-posten. ${conditions ? `Rörsystem: ${conditions}. ` : ""}${note} Rörlängden anger inte antalet delar.` });
  }
  if (components.length && /\b(?:gjenget|rilleskjot|rillet|gangad|rillad)\b/.test(normalize(joint))) components.push({
    id: "joints", kind: "coupling", label: "Rörskarvar och kopplingar", optional: false, quantityFromDrawing: true,
    searchTerm: `Rørkobling ${dimension}`.trim(),
    requirement: `Skarv enligt PDF: ${joint}. Välj delar som passar det valda rörets anslutning. ${pressure ? `Tryckkrav: ${pressure}. ` : ""}Utförande och antal behöver kontrolleras mot ritningen.`
  });
  return components.length ? { mainLabel: `Rör ${dimension}`.trim(), components, kind: "pipe" } : null;
}

/** Only known product-system tokens go to the external search, never PDF prose. */
export function assemblyComponentSearch(component: AssemblyComponent, mainProduct: string) {
  if (["retard_chamber", "alarm_device", "escutcheon", "guard", "sprinkler_hose"].includes(component.kind)) {
    const brand = mainProduct.match(/\b(Victaulic|Tyco|Reliable|Viking|Potter)\b/i)?.[1] ?? "";
    // A brand and explicit model are search hints, never proof of compatibility.
    const model = mainProduct.match(/\b(?:V\d{3,4}|(?:S|Series\s*)751|AV[- ]?1|F1FR\d+|KIT\s*5)\b/i)?.[0] ?? "";
    return `${component.searchTerm} ${brand} ${model}`.replace(/\s+/g, " ").trim();
  }
  if (component.quantityFromDrawing) {
    if (component.kind === "support") return component.searchTerm;
    const joints = pipeJointTypes(mainProduct);
    const connection = joints.length === 1 ? pipeJointSearchTerm[joints[0]] : "";
    return `${component.searchTerm} ${connection}`.trim();
  }
  const system = mainProduct.match(/\b(Sanipex|Uponor|Roth|Wavin)\b/i)?.[1]
    ?? (/\bLK\b/i.test(mainProduct) ? "LK Pex" : "");
  return `${component.searchTerm} ${system}`.trim();
}

export function isAssemblyComponentCandidate(kind: AssemblyComponentKind, productName: string) {
  const text = normalize(productName);
  const pipePart = ["bend", "tee", "cap", "coupling", "support", "retard_chamber", "alarm_device", "escutcheon", "guard", "sprinkler_hose", "flange", "fastener"].includes(kind);
  if (/\b(?:skilt\w*|skylt\w*)\b/.test(text)) return false;
  if (!pipePart && /\b(?:sprinkler\w*|spjeldventil|firelock)\b/.test(text)) return false;
  const primary = text.split(/\b(?:for|til)\b/)[0];
  const patterns: Record<AssemblyComponentKind, RegExp> = {
    manifold: /\b(?:fordeler|fordelare|manifold)\b/,
    drainage: /\b(?:avlopsbend|dreneringssett|drenering|siklemikk|lekkasjeindikering|dranerings\w*)\b/,
    connection: /\b(?:overgang|adapter|kobling|koppling|kopling|kupling)\b/,
    pipe: /\b(?:pex|pexror|ror i ror)\b/,
    valve: /\b(?:kuleventil|stengeventil|avstangningsventil|kulventil)\b/,
    bend: /\b(?:bend|albue|elbow|boj)\b/,
    tee: /\b(?:t ror|t stykke|t stycke|tee)\b/,
    cap: /\b(?:endelo?kk?|endebunn|andlock|end cap|blindflens|plugg)\b/,
    coupling: /\b(?:kupling|kobling|rorkobling|rillekobling|koppling|muffe|coupling)\b/,
    support: /\b(?:rorklammer|klammer|roroppheng|oppheng|rorstotte|rorbarer|pipe support|pipe hanger|feste|festebrakett|slangeholder)\b/,
    retard_chamber: /\b(?:retardasjonskammer|retardasjonsbeholder|retardationskammare|retard(?:ing)? chamber)\b/,
    alarm_device: /\b(?:alarmgiver|alarmpressostat|pressostat|trykkbryter|pressure switch)\b/,
    escutcheon: /\b(?:dekkskive[rn]?|dekkplate[rn]?|pyntering(?:er)?|(?:sprinkler)?rosett(?:er)?|escutcheons?|cover plates?|coverplate|tackbricka|tacklock)\b/,
    guard: /\b(?:sprinklergitter|beskyttelsesgitter|gitter|skyddskorg|guard|vannskjerm|water shield)\b/,
    sprinkler_hose: /\b(?:sprinklerslange|fleksibelslange|koblingsslange|vicflex|sprinkler hose)\b/,
    flange: /\b(?:motflens|flens|flenser|flange|flensadapter)\b/,
    fastener: /\b(?:bolt|bolter|pakning|pakninger|packning|gasket|boltesett)\b/
  };
  const match = patterns[kind].exec(primary);
  if (!match) return false;
  if (kind === "support" && /\b(?:sprinklerslange|koblingsslange|sprinklerhode)\b/.test(primary.slice(0, match.index))) return false;
  if (kind === "sprinkler_hose" && /\b(?:feste|festebrakett|slangeholder|brakett|bracket)\b/.test(primary.slice(0, match.index))) return false;
  if (["retard_chamber", "alarm_device", "escutcheon", "guard"].includes(kind)
    && /\b(?:ventilsett|alarmventil|sprinklerhode|pakningssett|reservedel|verktoy)\b/.test(primary.slice(0, match.index))) return false;
  if (/\b(?:\w*skap|holder|skapmuffe|ramme|dor|tilbehor)\b/.test(primary.slice(0, match.index))) return false;
  if (kind === "manifold" && /\b(?:ventil|kuleventil|kobling)\b/.test(primary.slice(0, match.index))) return false;
  if (kind === "pipe" && /\b(?:overgang|adapter|kobling|klammer|kutter|saks|verktoy|fordeler|\w*skap)\b/.test(primary)) return false;
  return true;
}

function isOptional(value: string) { return /^(?:valgfritt|valfritt|optional)\.?$/i.test(value.trim()); }
function isExcluded(value: string) { return /^(?:nei|nej|no)\.?$/i.test(value.trim()); }
function normalize(value: string) { return value.toLowerCase().replace(/ø/g, "o").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim(); }
function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
