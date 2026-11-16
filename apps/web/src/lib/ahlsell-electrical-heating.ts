import { mainProductText, normalizeTechnicalText, productRequirementAttributes } from "./ahlsell-requirement-context";
import { requirementHeading, requirementNsCode } from "./requirement-discipline";
import type { AhlsellPublicCandidate, AhlsellRequirementGuide } from "./ahlsell-public-match";

export type ElectricalHeatingIntent = "electric_heater" | "heating_cable";
const ACCESSORY = /\b(?:adapter|tilbehor|tillbehor|reservedel|termostat|bryter|kontrollenhet|styreenhet|regulator|styringsmodul|koblingsboks|skjotesett|endeavslutning|festebrakett|gulvstativ|veggfeste)\b/;
const HEATER = /\b(?:panelovn(?:er)?|gjennomstromningsovn(?:er)?|konvektor(?:ovn)?|varmeovn(?:er)?|elradiator(?:er)?|panel heater|electric heater)\b/;
const CABLE = /\b(?:varmekabel(?:sett|matte|matter|er)?|varmematte[rt]?|varmeslynge[rt]?|heating cable|heat tracing)\b/;

export function isElectricalHeatingProduct(name: string, intent: ElectricalHeatingIntent) {
  const main = mainProductText(name);
  return (intent === "electric_heater" ? HEATER : CABLE).test(main) && !ACCESSORY.test(main);
}

/** The PDF's own product/type fields identify the family; its location does not. */
export function electricalHeatingIntent(requirement: Record<string, unknown>): ElectricalHeatingIntent | null {
  const heading = requirementHeading(requirement);
  const attributes = heatingAttributes(requirement);
  const code = requirementNsCode(requirement);
  if (isElectricalHeatingProduct(heading, "electric_heater")
    || /^XC1\./.test(code) && isElectricalHeatingProduct(attributes.type ?? "", "electric_heater")) return "electric_heater";
  if (isElectricalHeatingProduct(heading, "heating_cable")
    || (/^XC2\./.test(code) || /^elektrisk varmeelement\b/.test(normalizeTechnicalText(heading)))
      && isElectricalHeatingProduct(attributes.elementtype ?? "", "heating_cable")) return "heating_cable";
  return null;
}

function heatingAttributes(requirement: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(productRequirementAttributes(requirement))
    .map(([key, value]) => [normalizeTechnicalText(key), String(value)]));
}

type Power = { value: number; unit: "W" | "W/m" | "W/m²" };
function powers(text: string): Power[] {
  return [...text.matchAll(/\b(\d+(?:[.,]\d+)?)\s*(k?W)(?:\s*\/\s*(m(?:²|2)?))?(?![a-z0-9²])/gi)].map(match => ({
    value: Number(match[1].replace(",", ".")) * (/^k/i.test(match[2]) ? 1000 : 1),
    unit: match[3] ? /²|2/.test(match[3]) ? "W/m²" : "W/m" : "W"
  }));
}
function voltages(text: string) {
  return [...text.matchAll(/\b(\d+(?:[.,]\d+)?(?:\s*[/–-]\s*\d+(?:[.,]\d+)?)*)\s*V\b/gi)]
    .flatMap(match => match[1].split(/[/–-]/).map(value => Number(value.trim().replace(",", "."))));
}

export function electricalHeatingRequirements(requirement: Record<string, unknown>) {
  const attributes = heatingAttributes(requirement);
  const power = powers(attributes.effekt ?? attributes["nominell effekt"] ?? "")[0] ?? null;
  const voltage = voltages(attributes["nominell spenning"] ?? attributes.spenning ?? "")[0] ?? null;
  const type = normalizeTechnicalText(attributes.type ?? requirementHeading(requirement));
  return { attributes, power, voltage,
    panel: /\bpanelovn\b/.test(type), convection: /\bgjennomstromningsovn\b/.test(type),
    ip: attributes.kapslingsgrad?.match(/\bIP\s*(\d{2})\b/i)?.[1] ?? null,
    wall: /\b(?:vegg|vagg)\b/.test(normalizeTechnicalText(attributes.montasje ?? "")),
    fixed: /\bfast tilkobling\b/.test(normalizeTechnicalText(attributes.tilkobling ?? "")),
    selfRegulating: /\bselvregulerende\b/.test(normalizeTechnicalText(`${attributes.regulering ?? ""} ${attributes.temperaturavhengighet ?? ""}`))
  };
}

export function electricalHeatingGuide(requirement: Record<string, unknown>, intent: ElectricalHeatingIntent, searchBase: string, warnings: string[]): AhlsellRequirementGuide {
  const profile = electricalHeatingRequirements(requirement);
  const family = intent === "heating_cable" ? "Varmekabel" : profile.panel ? "Panelovn" : profile.convection ? "Gjennomstrømningsovn" : "Varmeovn";
  const power = profile.power ? `${profile.power.value}${profile.power.unit}` : "";
  const voltage = profile.voltage ? `${profile.voltage}V` : "";
  const subtype = profile.selfRegulating ? "selvregulerende" : "";
  const searchQueries = [...new Set([
    [family, subtype, power, voltage].filter(Boolean).join(" "),
    [family, subtype, power].filter(Boolean).join(" "),
    [family, subtype].filter(Boolean).join(" ")
  ])];
  const url = new URL(searchBase);
  url.searchParams.set("parameters.SearchPhrase", searchQueries[0]);
  return { searchQuery: searchQueries[0], searchQueries, searchUrl: url.toString(),
    criteria: Object.entries(profile.attributes).map(([key, value]) => `${key}: ${value}`),
    warnings, recognitionNotes: [], directCandidates: [] };
}

/** Only article headers and labelled fields are technical evidence. Family
 * descriptions can list several sizes and must not verify a specific variant. */
export function assessElectricalHeating(profile: ReturnType<typeof electricalHeatingRequirements>, candidate: AhlsellPublicCandidate) {
  const fields = candidate.specifications.filter(spec => /^(?:effekt|nominell effekt|merkeeffekt|varmeeffekt|oppvarmingseffekt|spenning|merkespenning|nominell spenning|driftsspenning|matespenningsområde|kapslingsgrad|beskyttelsesgrad|montering|montasje|montasjetype|tilkobling|tilkoblingstype|regulering|temperaturavhengighet|termostat|type)\b[^:]{0,40}:/i.test(spec));
  const evidence = [candidate.productName, candidate.subtitle ?? "", ...fields].join("\n");
  const normalized = normalizeTechnicalText(evidence);
  const reasons: string[] = [];
  const warnings: string[] = [];
  let score = 0;
  const powerFields = fields.filter(field => /^(?:effekt|nominell effekt|merkeeffekt|varmeeffekt|oppvarmingseffekt)\b/i.test(field))
    .map(field => field.replace(/\((k?W(?:\/m[²2]?)?)\)\s*:\s*(\d+(?:[.,]\d+)?)/i, ": $2 $1"));
  const actualPower = powers([candidate.productName, candidate.subtitle, ...powerFields].join(" "));
  const actualVoltage = voltages(evidence);
  if (profile.power) {
    const expected = profile.power;
    const values = actualPower.filter(item => item.unit === expected.unit).map(item => item.value);
    if (values.length && !values.includes(expected.value)) warnings.push(`Fel effekt: PDF kräver ${expected.value} ${expected.unit}; artikeln anger ${[...new Set(values)].join(" / ")} ${expected.unit}.`);
    else if (values.length && new Set(values).size === 1) { score += 15; reasons.push(`Artikelns effekt är ${expected.value} ${expected.unit}.`); }
    else warnings.push(`Effekt ${expected.value} ${expected.unit} behöver verifieras för den valda artikeln.`);
  }
  if (profile.voltage) {
    if (actualVoltage.length && !actualVoltage.includes(profile.voltage)) warnings.push(`Fel spänning: PDF kräver ${profile.voltage} V; artikeln anger ${[...new Set(actualVoltage)].join(" / ")} V.`);
    else if (new Set(actualVoltage).size === 1) { score += 10; reasons.push(`Artikelns spänning är ${profile.voltage} V.`); }
    else warnings.push(`Spänning ${profile.voltage} V behöver verifieras för den valda artikeln.`);
  }
  if (profile.ip && !new RegExp(`\\bIP\\s*${profile.ip}\\b`, "i").test(evidence)) warnings.push(`Verifiera kapslingsgrad IP${profile.ip} mot artikelns dokumentation.`);
  if (profile.wall && /\b(?:kun gulv|endast golv|floor only)\b/.test(normalized)) warnings.push("Fel montage: PDF kräver väggmontage; artikeln är endast avsedd för golv.");
  if (profile.fixed && /\b(?:med (?:ledning og )?(?:stops(el|elkontakt)|stikkontakt)|with plug)\b/.test(normalized)) warnings.push("Fel anslutning: PDF kräver fast anslutning; artikeln anges med stickpropp. Kontrollera godkänt anslutningsutförande.");
  if (profile.selfRegulating && /\b(?:konstant effekt|fast (?:element)?effekt|constant wattage)\b/.test(normalized)) warnings.push("Fel reglering: PDF kräver självreglerande värmekabel; artikeln anger fast effekt.");
  const checks = ["type", "elementtype", "regulering", "temperaturavhengighet", "anvendelse", "underlag", "overdekning", "tilkobling", "montasje", "automatikkfunksjoner", "dimensjoner", "andre krav", "pdf kommentar"]
    .flatMap(key => profile.attributes[key] && profile.attributes[key] !== "-" ? [`${key}: ${profile.attributes[key]}`] : []);
  warnings.push(`Verifiera komplett utförande, montage och styrning mot PDF-posten${checks.length ? ` (${checks.join("; ")})` : ""}. En produktträff verifierar inte installationen.`);
  return { score, reasons, warnings };
}
