import { parseStructuredPostStart } from "@/modules/technical-description-extractor/document-parser";
import { canonicalProperty, technicalText } from "./technical-evaluation-model";

type Row = Record<string, unknown>;
type Origin = { postNumber: string; sourcePage?: number };
type ParentContext = { postNumber: string; heading: string; attributes: Row; attributeSources: Record<string, Origin> };
const record = (value: unknown): Row => value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const normalized = (value: unknown) => technicalText(text(value)).replace(/[^a-z0-9]+/g, " ").trim();
const placeholder = /^(?:se|see)\b|^(?:valgfri|valgfritt|valfritt|valfri|ikke angitt|ukjent|unknown)\.?$/i;

function parentFamily(heading: string) {
  const name = normalized(heading).replace(/^(?:(?:innendors|utendors|komplett)\s+)+/, "");
  if (/^(?:sprinklerslange|fleksibelslange|vicflex|dryflex)\b|^(?:rorledning|energibaererledning)\b.*\bslange\b/.test(name)) return "hose";
  if (/^(?:rordel|kupling|kobling|bend|t stykke|reduksjon|overgang|flensadapter|endelokk)\b|^(?:rorledning|energibaererledning)\b.*\brordel\b/.test(name)) return "fitting";
  if (/^(?:ror|rorledning|avlopsledning|vannledning|stalror|kobberror|komposittror|energibaererledning)\b/.test(name)) return "pipe";
  if (/^(?:sprinkler|sprinklerhode|sprinklerhuvud)\b/.test(name)) return "sprinkler";
  if (/^(?:ventil|stengeventil|tilbakeslagsventil|kuleventil|spjeldventil|reguleringsventil)\b/.test(name)) return "valve";
  return null;
}

function fieldGroup(label: string, value: unknown) {
  const name = technicalText(label).replace(/[()]/g, "");
  if (/^(?:materiale|material)(?: ror(?:del)?)?$/.test(name)) return "material";
  if (/^(?:dimensjon|dimension)(?: tilkoblinger)?$/.test(name)) return "dn";
  const property = canonicalProperty(label);
  return property === "workingPressureBar" && /^PN\s*\d/i.test(text(value)) ? "pn" : property ?? name;
}

function allowedField(label: string) {
  const name = technicalText(label).replace(/[()]/g, "");
  return /^(?:materiale(?: ror(?:del)?)?|material|materialkvalitet|grade|medium|skjot|type tilkobling|anslutning|connection|rordel|ventiltype|type energibaereledning|sprinkleranlegg|type sprinkler|sprinklertype|folsomhetsgrad|respons|response|k faktor|utlosningstemperatur|trykk|arbeidstrykk|pn|trykkklasse|trykklasse|tryckklass|pressure class|dimensjon(?: dn| tilkoblinger)?|dimension|dn|ytterdiameter|ytre diameter|overflatebehandling|finish|standard|godkjenning)$/.test(name);
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
      if (Object.hasOwn(attributes, key)) continue;
      attributes[key] = match[2];
      origins[key] = { postNumber: parent };
    }
  }
  const sources = record(value.attributeSources);
  for (const [key, raw] of Object.entries(record(value.attributes))) {
    const source = record(sources[key]);
    if (source.postNumber !== parent || !allowedField(key)) continue;
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
  const ownName = normalized(requirement.value_text ?? requirement.display_name);
  const family = context ? parentFamily(context.heading) : null;
  const dimensionOnly = /^(?:dimensjon\s*)?(?:dn\s*)?\d+(?:\s|$)/.test(ownName);
  const equipmentConnection = /^tilkobling (?:til|av)\b/.test(ownName) && family === "fitting"
    && /\btilkobl\w*\b.*\b(?:tekn\w*|utstyr)\b/.test(normalized(Object.entries(context?.attributes ?? {}).find(([key]) => technicalText(key) === "rordel")?.[1]));
  const relevant = context && (dimensionOnly || equipmentConnection || parentFamily(ownName) === family);
  if (!relevant) return { attributes, attributeSources, equipmentConnection: false, parent: undefined };

  // Preserve own explicit title values when older imports did not extract their fields.
  for (const match of text(requirement.value_text).matchAll(/\b(DN|PN)\s*(\d+(?:[.,]\d+)?)\b/gi)) {
    const property = match[1].toLowerCase();
    if (!Object.entries(attributes).some(([key, raw]) => fieldGroup(key, raw) === property)) {
      attributes[match[1].toUpperCase()] = match[2];
      attributeSources[match[1].toUpperCase()] = { postNumber: value.postNumber, sourcePage: requirement.source_page };
    }
  }
  const ownGroups = new Set(Object.entries(attributes).map(([key, raw]) => fieldGroup(key, raw)));
  for (const [key, raw] of Object.entries(context.attributes)) {
    if (!allowedField(key) || !text(raw) || placeholder.test(text(raw)) || ownGroups.has(fieldGroup(key, raw))) continue;
    if (!dimensionOnly && !equipmentConnection && /^(?:rordel|ventiltype|type sprinkler|sprinklertype)$/.test(technicalText(key))) continue;
    // A child's changed material must not silently retain the parent's system/grade.
    if (fieldGroup(key, raw) === "materialGrade" && ownGroups.has("material")) continue;
    attributes[key] = raw;
    attributeSources[key] = context.attributeSources[key] ?? { postNumber: context.postNumber };
  }
  return { attributes, attributeSources, equipmentConnection, parent: context };
}
