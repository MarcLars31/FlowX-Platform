import { parseStructuredPostStart } from "@/modules/technical-description-extractor/document-parser";
import { canonicalProperty, technicalText } from "./technical-evaluation-model";

type Row = Record<string, unknown>;
type Origin = { postNumber: string; sourcePage?: number };
type ParentContext = { postNumber: string; heading: string; attributes: Row; attributeSources: Record<string, Origin> };
const record = (value: unknown): Row => value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const scalar = (value: unknown) => typeof value === "number" || typeof value === "boolean" ? String(value) : text(value);
const normalized = (value: unknown) => technicalText(text(value)).replace(/[^a-z0-9]+/g, " ").trim();
const placeholder = /^(?:se|see)\b|^(?:[-–—]|valgfri|valgfritt|valfritt|valfri|ikke angitt|ukjent|unknown)\.?$/i;

function parentFamily(heading: string) {
  const name = normalized(heading).replace(/^(?:(?:innendors|utendors|komplett)\s+)+/, "");
  if (/^(?:sprinklerslange|fleksibelslange|vicflex|dryflex)\b|^(?:rorledning|energibaererledning)\b.*\bslange\b/.test(name)) return "hose";
  if (/^(?:rordel|kupling|kobling|bend|t stykke|reduksjon|overgang|flensadapter|endelokk)\b|^(?:rorledning|avlopsledning|energibaererledning)\b.*\brordel\b/.test(name)) return "fitting";
  if (/^(?:ror|rorledning|avlopsledning|vannledning|stalror|kobberror|komposittror|energibaererledning)\b/.test(name)) return "pipe";
  if (/^(?:sprinkler|sprinklerhode|sprinklerhuvud)\b/.test(name)) return "sprinkler";
  if (/^(?:ventil|stengeventil|tilbakeslagsventil|kuleventil|spjeldventil|reguleringsventil|spyleventil)\b/.test(name)) return "valve";
  if (/^(?:isolering|rorisolasjon|rorskaler|ventilposer)\b/.test(name)) return "insulation";
  if (/^(?:blandebatteri|benkebatteri|tappearmatur)\b/.test(name)) return "tap";
  if (/^(?:maler|manometer|termometer|temperaturgivere?|trykkgivere?|differansetrykkgivere?)\b/.test(name)) return "instrument";
  return null;
}

export function productRequirementProperty(label: string, value: unknown) {
  const name = normalized(label);
  if (/^(?:materiale|material)(?: ror(?:del)?)?$/.test(name)) return "material";
  if (/^(?:dimensjon|dimension)(?: tilkoblinger| vannror| pa rorledningsdel)?$/.test(name)) return /(?:mm\b|[Øø⌀])/.test(scalar(value)) ? "outsideDiameterMm" : "dn";
  if (name === "materialkvalitet vannror") return "materialGrade";
  if (/^(?:tykkelse|tjocklek|thickness|isolasjonstykkelse)$/.test(name)) return "thickness";
  const property = canonicalProperty(name);
  return property === "workingPressureBar" && /^(?:(?:minimum|minst|>=|≥)\s*)?PN\s*\d/i.test(scalar(value)) ? "pn" : property ?? name;
}
const fieldGroup = productRequirementProperty;

function allowedField(label: string) {
  const name = normalized(label);
  return Boolean(canonicalProperty(name) && !/^(?:plassering|placering)$/.test(name))
    || /^(?:materiale(?: ror(?:del)?)?|materialkvalitet vannror|medium|rordel|ventiltype|type energibaereledning|type vannledning|sprinkleranlegg|type sprinkler|sprinklertype|dimensjon(?: dn| tilkoblinger| vannror| pa rorledningsdel)?|dimension|funksjon|rorlop|betjening|anvendelse|utforming|isolasjonsmateriale|tykkelse|tjocklek|thickness|isolasjonstykkelse|overflatebelegg|type produkt|krav til fysiske egenskaper)$/.test(name);
}

/** Preserve proven parent data separately before projecting the post's own PDF fields. */
export function captureInheritedProductRequirements(requirement: Row): ParentContext | undefined {
  const value = record(requirement.value_json);
  const post = text(value.postNumber);
  const parent = text(value.parentPostNumber);
  // Chapter groups and sibling posts must never supply product requirements.
  if (!parent || post.slice(0, post.lastIndexOf(".")) !== parent) return undefined;
  const previous = record(value.inheritedProductRequirements);
  const sections = `${text(value.inheritedSpecification)}\n\nUNDERPOST\n${text(value.technicalSpecification)}`.split(/\n\s*UNDERPOST\s*\n/i);
  const block = sections.find(section => {
    const lines = section.trim().split(/\r?\n/).map(line => line.trim());
    return parseStructuredPostStart(lines, 0)?.postNumber === parent;
  });
  const heading = text(value.parentDescription) || (previous.postNumber === parent ? text(previous.heading) : "")
    || (block ? block.split(/\r?\n/).filter(line => !line.includes(":")).slice(0, 3).join(" ").replace(/^[\d.\s]+(?:[A-Z]{2}\d[\w.]*\s*)?/, "").replace(/^\d+\s+/, "") : "");
  if (!parentFamily(heading)) return undefined;
  const attributes: Row = previous.postNumber === parent ? { ...record(previous.attributes) } : {};
  const origins = previous.postNumber === parent ? { ...record(previous.attributeSources) } as Record<string, Origin> : {};
  // Legacy saved posts can lack attribute origins, but the numbered block still proves ownership.
  for (const line of (block ?? "").split(/\r?\n/)) {
    const match = /^([^:]{1,70}):\s*(.+)$/.exec(line.trim());
    if (match && allowedField(match[1])) {
      const key = match[1].toLocaleLowerCase("nb");
      if (Object.keys(attributes).some(existing => normalized(existing) === normalized(key))) continue;
      attributes[key] = match[2];
      origins[key] = { postNumber: parent };
    }
  }
  const sources = record(value.attributeSources);
  for (const [key, raw] of Object.entries(record(value.attributes))) {
    const source = record(sources[key]);
    if (source.postNumber !== parent || !allowedField(key)) continue;
    for (const existing of Object.keys(attributes)) if (existing !== key && normalized(existing) === normalized(key)) {
      delete attributes[existing]; delete origins[existing];
    }
    attributes[key] = raw;
    origins[key] = { postNumber: parent, ...(typeof source.sourcePage === "number" ? { sourcePage: source.sourcePage } : {}) };
  }
  return { postNumber: parent, heading, attributes, attributeSources: origins };
}

/** Product-level inheritance, with own fields and explicit own DN/PN taking precedence. */
export function mergedProductRequirements(requirement: Row) {
  const value = record(requirement.value_json);
  const context = captureInheritedProductRequirements(requirement);
  const attributes = { ...record(value.attributes) };
  const attributeSources = { ...record(value.attributeSources) };
  const ownTitle = text(requirement.value_text ?? requirement.display_name);
  const ownName = normalized(ownTitle);
  const family = context ? parentFamily(context.heading) : null;
  const namedAfterDimension = parentFamily(ownName.replace(/^.*?\d+(?:\s*(?:dn)?\d+)*\s*/, ""));
  const dimensionOnly = /^(?:dimensjon\s*)?(?:(?:dn|o|diameter)\s*)?\d+(?:\s|$)/.test(ownName)
    && (!namedAfterDimension || namedAfterDimension === family);
  const dimensionVariant = dimensionOnly || family === "valve" && /^(?:toveis|treveis)\s+(?:dn\s*)?\d+/.test(ownName);
  const equipmentConnection = /^tilkobling (?:til|av)\b/.test(ownName) && family === "fitting"
    && /\btilkobl\w*\b.*\b(?:tekn\w*|utstyr)\b/.test(normalized(Object.entries(context?.attributes ?? {}).find(([key]) => technicalText(key) === "rordel")?.[1]));
  const relevant = context && (dimensionVariant || equipmentConnection || parentFamily(ownName) === family);
  if (!relevant) return { attributes, attributeSources, equipmentConnection: false, dimensionVariant: false, family: undefined, parent: undefined };

  // Saved own fields (including manual corrections) win over their source text.
  // Recover explicit own fields before considering any inherited equivalent.
  const addOwn = (key: string, raw: string) => {
    if (Object.entries(attributes).some(([label, item]) => fieldGroup(label, item) === fieldGroup(key, raw))) return;
    attributes[key] = raw;
    attributeSources[key] = { postNumber: value.postNumber, sourcePage: requirement.source_page };
  };
  const ownText = [ownTitle, text(value.technicalSpecification), text(value.sourceText)].join("\n");
  for (const line of ownText.split(/\r?\n/)) {
    const field = /^([^:=]{1,70})\s*[:=]\s*(.+)$/.exec(line.trim().replace(/^\d+(?:\.\d+)+\s+/, ""));
    if (field && allowedField(field[1])) addOwn(field[1].trim(), field[2].trim());
  }
  const primaryTitle = ownTitle.split(/\b(?:med|with|inkl\.?|inkludert|inklusive|including)\b/i)[0];
  // An explicit material in the main pipe name is also an own value.
  if (family === "pipe") {
    if (/^(?:kobberror|kopparror)\b/.test(normalized(primaryTitle))) addOwn("materiale", "Kobber");
    else if (/^stalror\b/.test(normalized(primaryTitle))) addOwn("materiale", "Stål");
  }
  for (const [token, key] of [["DN", "DN"], ["PN", "PN"], ["K", "k-faktor"]]) {
    const matches = [...primaryTitle.matchAll(new RegExp(`\\b${token}\\s*[-=:]?\\s*(\\d+(?:[.,]\\d+)?)`, "gi"))];
    if (!matches.length) continue;
    const ambiguous = new Set(matches.map(match => match[1])).size > 1
      || matches.some(match => /^\s*[-–/×x]\s*(?:DN|PN|K)?\s*\d/i.test(primaryTitle.slice(match.index! + match[0].length)));
    addOwn(key, ambiguous ? primaryTitle : matches[0][1]);
  }
  const od = primaryTitle.match(/(?:[Øø⌀]|(?:ytre|utvendig|outside)\s+diameter\s*[:=]?)\s*(\d+(?:[.,]\d+)?(?:\s*[-–/×x]\s*\d+(?:[.,]\d+)?)*)\s*(?:mm)?/i);
  if (od) addOwn("ytre diameter", `${od[1]} mm`);
  if (family === "sprinkler") {
    const temperature = primaryTitle.match(/\b(\d+(?:[.,]\d+)?)\s*°\s*C\b/i);
    if (temperature) addOwn("utløsningstemperatur", `${temperature[1]} °C`);
  }
  if (family === "insulation") {
    const thickness = ownTitle.match(/\bDN\s*\d+\s*\((\d+(?:[.,]\d+)?)\s*mm\)/i);
    if (thickness) addOwn("tykkelse", `${thickness[1]} mm`);
  }
  const ownGroups = new Set(Object.entries(attributes).map(([key, raw]) => fieldGroup(key, raw)));
  for (const [key, raw] of Object.entries(context.attributes)) {
    const group = fieldGroup(key, raw);
    if (!allowedField(key) || !scalar(raw) || placeholder.test(scalar(raw)) || ownGroups.has(group)) continue;
    if (["dn", "outsideDiameterMm"].includes(group) && ["dn", "outsideDiameterMm"].some(item => ownGroups.has(item))) continue;
    if (!dimensionVariant && !equipmentConnection && /^(?:rordel|ventiltype|type sprinkler|sprinklertype|funksjon|anvendelse|utforming|betjening)$/.test(normalized(key))) continue;
    // A child's changed material must not silently retain the parent's system/grade.
    if (fieldGroup(key, raw) === "materialGrade" && ownGroups.has("material")) continue;
    attributes[key] = raw;
    attributeSources[key] = context.attributeSources[key] ?? { postNumber: context.postNumber };
  }
  return { attributes, attributeSources, equipmentConnection, dimensionVariant, family, parent: context };
}
