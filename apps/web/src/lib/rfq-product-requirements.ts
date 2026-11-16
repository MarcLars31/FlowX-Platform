import type { MaterialSearchInput } from "./material-import";
import type { AhlsellPublicCandidate } from "./ahlsell-public-match";

export type RfqCheck = { name: string; status: "match" | "mismatch" | "unknown"; expected: string; actual: string };
export type RfqProductMatch = { status: "verified" | "review" | "mismatch"; autoSelect: boolean; checks: RfqCheck[] };
type Family = { key: string; source: RegExp; product: RegExp; query: string };
// Product names, not commercial instructions or supplier identifiers.
const families: Family[] = [
  { key: "charger", source: /\b(?:charger|lader|batterilader)\b/i, product: /\bbatterilader\b/i, query: "batterilader" },
  { key: "battery-kit", source: /\b(?:batterisett|battery kit)\b/i, product: /\bbatterisett\b/i, query: "batterisett" },
  { key: "impact", source: /\b(?:muttertrekker|impact wrench)\b/i, product: /\bmuttertrekker\b/i, query: "muttertrekker" },
  { key: "drill", source: /bor\/skrutrekker|bor-?\/?\s*skrutrekker|drill driver/i, product: /bor.{0,5}skrutrekker|bormaskin/i, query: "bor skrutrekker" },
  { key: "grinder", source: /vinkelsliper|angle grinder/i, product: /vinkelsliper/i, query: "vinkelsliper" },
  { key: "heatgun", source: /varmluftpisto|heat gun/i, product: /varmluftpistol/i, query: "varmluftpistol" },
  { key: "socket-set", source: /socket set|pipesett|pipen[øo]kkelsett/i, product: /pipesett|pipen[øo]kkelsett/i, query: "pipenøkkelsett" },
  { key: "label-tape", source: /label.*(?:tape|refill)|(?:nylon|printer) tape|heatshrink labels|permasleeve/i, product: /merketape|merkemateriell|etikett|merkeb[åa]nd|krympemerke/i, query: "merketape" },
  { key: "electrical-tape", source: /electrical.*tape|insulation tape|scotch (?:super )?(?:23|35|88)\b|self.amalgamating/i, product: /isolasjonstape|elektrotape|vulk.{0,12}tape|spleisetape/i, query: "isolasjonstape" },
  { key: "tape", source: /\btape\b/i, product: /\btape|teip|b[åa]nd/i, query: "tape" },
  { key: "cable-tie", source: /cable ties?|c\/tie|strips/i, product: /strips|kabelb[åa]nd/i, query: "strips" },
  { key: "clamp", source: /hose clamp|hose clip|slangeklemme/i, product: /slangeklemme/i, query: "slangeklemme" },
  { key: "padlock", source: /padlock|hengel[åa]s/i, product: /hengel[åa]s/i, query: "hengelås" },
  { key: "bearing", source: /(?:roller )bea?ring|brearing/i, product: /rullelager|kulelager|lager\b/i, query: "rullelager" },
  { key: "locknut", source: /lock nut/i, product: /l[åa]semutter|lagermutter/i, query: "låsemutter" },
  { key: "washer", source: /lock washer/i, product: /l[åa]se.{0,6}(?:skive|blikk)/i, query: "låseskive" },
  { key: "spill", source: /spill kit|absorbent pads?/i, product: /absorbent|absorp|spillkit/i, query: "absorbent" },
  { key: "sprayer", source: /pressure sprayer|spray dispenser/i, product: /trykkspr[øo]yte|sprayflaske|spr[øo]ytekanne/i, query: "trykksprøyte" },
  { key: "usb-serial", source: /usb.*(?:rs232|serial)|serial.*usb/i, product: /usb.*(?:rs.?232|seriell)|seriell.*usb/i, query: "USB RS232" },
  { key: "dsub", source: /d[- ]?sub.*adapter/i, product: /d[- ]?sub.*adapter|adapter.*d[- ]?sub/i, query: "D-sub adapter" },
  { key: "spanner", source: /combination (?:wrench|spanner)|comb wrench/i, product: /kombin[øo]kkel|kombinasjonsn[øo]kkel/i, query: "kombinøkkel" },
  { key: "adjustable", source: /adjustable wrench/i, product: /skiften[øo]kkel/i, query: "skiftenøkkel" },
  { key: "torque", source: /torque wrench/i, product: /momentn[øo]kkel/i, query: "momentnøkkel" },
  { key: "pipewrench", source: /pipe wrench/i, product: /r[øo]rtang/i, query: "rørtang" },
  { key: "screwdriver", source: /screwdriver|screwdr\b|skrutrekker/i, product: /skrutrekker/i, query: "skrutrekker" },
  { key: "pliers", source: /plier|nipper|side cutter/i, product: /tang|sideavbiter/i, query: "tang" },
  { key: "crimp", source: /crimp|bootlace ferrule/i, product: /pressverkt[øo]y|presstang|kabelsko|endehylse|pressett/i, query: "endehylse" },
  { key: "stripper", source: /wire stripper|cable dismantling|stripping tool/i, product: /avisoler|avmantl/i, query: "avmantlingsverktøy" },
  { key: "heatshrink", source: /heat.?shrink|cable sleeve/i, product: /krympestr[øo]mpe|krympeslange/i, query: "krympestrømpe" },
  { key: "solder", source: /soldering station/i, product: /loddestasjon/i, query: "loddestasjon" },
  { key: "solderwire", source: /\bsolder\b/i, product: /loddetinn|loddetr[åa]d/i, query: "loddetinn" },
  { key: "file", source: /file set|engineers file/i, product: /filsett|ansatsfil|n[åa]lfil/i, query: "filsett" },
  { key: "hacksaw", source: /hacksaw/i, product: /baufil|sagblad/i, query: "baufil" },
  { key: "hammer", source: /hammer|mallet/i, product: /hammer|slegge/i, query: "hammer" },
  { key: "cutting-disc", source: /cutting disc/i, product: /kappeskive/i, query: "kappeskive" },
  { key: "grinding-disc", source: /grindi?g disc|grinding disc/i, product: /slipeskive/i, query: "slipeskive" },
  { key: "cleaner", source: /cleaner|degreaser/i, product: /rens|rengj[øo]r|avfett/i, query: "rengjøring" },
  { key: "grease", source: /grease|compound|lubricant|\blube\b/i, product: /fett|sm[øo]r|pasta/i, query: "smørefett" },
  { key: "battery", source: /\bbatteries\b/i, product: /batteri/i, query: "batteri" },
  { key: "meter", source: /multimeter|insulation tester|thermometer/i, product: /multimeter|isolasjonstester|termometer/i, query: "multimeter" },
  { key: "toolbox", source: /tool box|compartment box/i, product: /verkt[øo]ykasse|sortimentsboks|sortimentskrin/i, query: "sortimentsboks" },
  { key: "machine-screw", source: /machine screw/i, product: /maskinskrue|skruesortiment|skruer.*sortiment|sortiment.*skruer/i, query: "maskinskrue" },
  { key: "ethernet", source: /ethernet cable|cable cat ?6/i, product: /datakabel|nettverkskabel|patchkabel|spredenettskabel/i, query: "datakabel Cat6" },
  { key: "junctionbox", source: /junction box/i, product: /koblingsboks/i, query: "koblingsboks" },
  { key: "guard", source: /\bguard\b/i, product: /beskytt|vernedeksel/i, query: "beskyttelsesdeksel" },
];
const brands = ["Milwaukee", "Bahco", "Brady", "3M", "Knipex", "HellermannTyton", "Schneider Electric", "TE Connectivity", "RS PRO", "Parker", "FTDI", "Fluke", "Tesa", "Weller", "Dremel", "Stanley", "Norbar", "Kennedy", "Magnusson", "Hozelock", "Ambersil", "Molykote", "Logitech", "Topaz", "ABB", "CONEC", "Wera", "Klauke", "Raytech", "Lubetech", "Advance Tapes", "Sharpie", "Sealey", "Steinel", "ProSolve", "GearWrench"];
const compact = (s: string) => s.normalize("NFKC").toUpperCase().replace(/[^A-Z0-9]/g, "");
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const unique = <T,>(a: T[]) => [...new Set(a)];
// Reviewed manufacturer identity, never an Ahlsell number or a forced choice.
// https://nl.milwaukeetool.eu/nl-nl/m18-nrg-pack/m18-nrg-503/
// Also documented in the manufacturer's 2026 catalogue; reviewed 2026-11-16.
const manufacturerModels = [{ brand: "Milwaukee", model: "M18 NRG-503", part: "4933451423" }];
const accessoryName = /\b(?:reserve(?:blad|kniv|del)|rerserveblad|reser\.blad|replacement|spare|tilbeh[øo]r|accessor)/i;

export function rfqModels(text: string): string[] {
  const heading = text.split(/\b(?:for use with|compatible with|for use on)\b/i)[0];
  const special: string[] = heading.match(/\bM(?:12|18)\s*[A-Z]{2,}[A-Z0-9]*(?:\s*-\s*\d+[A-Z]*)?(?:\s+INOX)?\b|\bAGV\s*\d+\s*-\s*\d+\s*(?:INOX)?\b|\b(?:Scotch\s+(?:Super\s+)?\d+|WE\s*1010|TLK-\d+(?:-\d+)?|S\d{3,}[A-Z]*|HL\s*\d+[A-Z]*|OTDR-\d+)\b/gi) ?? [];
  if (/\bKnipex\b/i.test(heading)) {
    const code = /\b\d{2}\s+\d{2}\s+\d{3}\b/.exec(heading)?.[0];
    if (code) special.push(code);
  }
  if (/\bFluke\b/i.test(heading)) {
    const code = /\b(?:1550C|175|62\s*MAX)\b/i.exec(heading)?.[0];
    if (code) special.push(code);
  }
  if (/\b(?:Dremel|Tesa)\b/i.test(heading)) {
    const code = /\b(?:Dremel|Tesa)\s+(\d{4})\b/i.exec(heading)?.[1];
    if (code) special.push(code);
  }
  if (special.length) return unique(special.map(s => s.trim().replace(/\s+/g, " "))).slice(0, 3);
  return unique((heading.match(/\b[A-Z][A-Z0-9]*(?:-?[A-Z0-9]+)*\b/g) ?? []).filter(s => /[A-Z]/.test(s) && /\d/.test(s)
    && !/^(?:A[24]|EP\d|IP\d+|CAT\d+[A-Z]?|[MK]\d+|\d.*|SPL\d+|RS\d+|AWG\d+|DN\d+)$/i.test(s))).slice(0, 3);
}

export function rfqPacking(text: string) {
  const packs = unique([...text.matchAll(/\b(?:pack(?:age)?|pk|pkt|box|bag|boxes)\s*[-:]?\s*(?:of\s+)?(\d+)\b|\b(\d+)\s*[- ]?\s*(?:pack|pk|pkt|per pack|per package)\b|\b(?:antall\s*(?:pr\.?|per)\s*(?:pakke|forpakning))\s*:\s*(\d+)/gi)]
    .map(m => Number(m[1] || m[2] || m[3])));
  const pieces = unique([...text.matchAll(/\b(\d+)\s*[- ]?\s*(?:pcs?|pce|pieces?|deler)\b|\bantall (?:deler|verktøy)\s*:\s*(\d+)/gi)].map(m => Number(m[1] || m[2])));
  return { packs, pieces };
}

type Measure = { kind: string; value: number; label: string };
function measurements(text: string): Measure[] {
  text = text.replace(/\b3M\b/g, ""); // The manufacturer is not a three-metre dimension.
  text = text.replace(/(\d)(mm|cm|m)([x×])(?=\d)/gi, "$1$2 $3 ").replace(/([x×])(?=\d)/gi, "$1 ");
  // Carry a trailing unit over a tuple, e.g. 19 x 20 mm. Retain all tuple values.
  const expanded = text.replace(/\b(\d+(?:[.,]\d+)?)\s*([x×-])\s*(\d+(?:[.,]\d+)?)\s*(mm|cm|m|kg|g|ml|l)\b/gi, "$1$4 $2 $3$4");
  const result: Measure[] = [];
  for (const m of expanded.matchAll(/\b(\d+(?:[.,]\d+)?)\s*(mm|cm|metres?|meters?|m|kg|g|ml|ltr|litres?|liters?|l|nm|v|w|ah|awg)\b/gi)) {
    const n = Number(m[1].replace(",", ".")), unit = m[2].toLowerCase();
    const [kind, scale] = /^(mm|cm|m|met)/.test(unit) ? ["mm", unit === "mm" ? 1 : unit === "cm" ? 10 : 1000] : /^(kg|g)$/.test(unit) ? ["g", unit === "kg" ? 1000 : 1] : /^(ml|l)/.test(unit) ? ["ml", unit === "ml" ? 1 : 1000] : [unit, 1];
    result.push({ kind, value: n * Number(scale), label: `${n} ${unit}` });
  }
  for (const m of text.matchAll(/\b(\d+(?:[.,]\d+)?(?:\s*\/\s*\d+)?)\s*(?:["″]|\bin\b|\binch(?:es)?\b)/gi)) {
    const parts = m[1].replace(",", ".").split("/");
    const n = Number(parts[0]) / (parts.length === 2 ? Number(parts[1]) : 1);
    result.push({ kind: "mm", value: n * 25.4, label: `${m[1]} tum` });
  }
  for (const m of text.matchAll(/\b(\d+(?:[.,]\d+)?)\s*(?:[′']|\bft\b|\bfeet\b)/gi)) result.push({ kind: "mm", value: Number(m[1].replace(",", ".")) * 304.8, label: `${m[1]} fot` });
  for (const m of text.matchAll(/\bM(\d+(?:[.,]\d+)?)\b/g)) {
    if (/\bMilwaukee\b/i.test(text) && /^(12|18)$/.test(m[1])) continue;
    result.push({ kind: "thread", value:Number(m[1].replace(",", ".")), label:`M${m[1]}` });
  }
  return result.filter((m, i) => result.findIndex(other => other.kind === m.kind && Math.abs(other.value - m.value) < 0.01) === i);
}
const colors: Array<[string, RegExp]> = [["svart", /\bblack\b|\bsort\b|\bsvart\b/i], ["vit", /\bwhite\b|\bhvit\b|\bvit\b/i], ["gul", /\byellow\b|\bgul\b/i], ["blå", /\bblue\b|\bbla\b/i], ["röd", /\bred\b|\brod\b/i], ["grön", /\bgreen\b|\bgronn?\b/i], ["orange", /\borange\b|\boransje\b/i], ["grå", /\bgr[ae]y\b|\bgra\b/i]];
const colorNames = (text: string) => colors.filter(([,re]) => re.test(text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ø/g, "o"))).map(([name]) => name);

export function rfqRequirement(input: MaterialSearchInput) {
  const text = `${input.description} ${input.details}`;
  const family = families.find(f => f.source.test(text));
  const brand = brands.find(b => new RegExp(`\\b${escapeRe(b)}\\b`, "i").test(text));
  return { text, family, brand, models: rfqModels(input.description), packing: rfqPacking(text), measures: measurements(text), colors: colorNames(text) };
}

export function rfqSearchQueries(input: MaterialSearchInput): string[] {
  if (input.query) return [input.query];
  const r = rfqRequirement(input);
  const model = r.models[0];
  const manufacturerModel = manufacturerModels.find(m => m.brand === r.brand && compact(m.model) === compact(model ?? ""));
  const size = r.measures.filter(m => m.kind === "mm" || m.kind === "thread").slice(0, 2).map(m => m.kind === "thread" ? m.label : String(Math.round(m.value * 100) / 100)).join(" ");
  const phrase = [r.brand === "RS PRO" ? "" : r.brand, r.family?.query].filter(Boolean).join(" ");
  const heading = input.description.replace(/\([^)]*\)/g, "").split(/\b(?:for use|for|with)\b/i)[0].split(/\s+/).slice(0, 5).join(" ");
  // Model first. Reference-only fuzzy hits cannot displace a real model search.
  const knipexModel = r.brand === "Knipex" && /^\d{2} \d{2} \d{3}$/.test(model ?? "");
  return unique([manufacturerModel?.part, knipexModel ? compact(model) : model,
    knipexModel ? `Knipex ${model.replace(/\s/g, "").slice(0, 4)}` : r.family ? [phrase, model ? "" : size].filter(Boolean).join(" ") : heading,
    r.family ? r.family.query : input.articleReferences?.[0], input.articleReferences?.[0],
    heading].filter((s): s is string => Boolean(s))).slice(0, 3);
}

function modelInHeading(model: string, text: string) {
  const expression = compact(model).split("").map(escapeRe).join("[\\s./_-]*");
  return new RegExp(`(?<![A-Z0-9])${expression}(?![A-Z0-9])`, "i").test(text);
}

/** Exact-variant evidence only: never count compatibility prose or carton logistics as the ordered product. */
export function assessRfqProduct(input: MaterialSearchInput, candidate: AhlsellPublicCandidate, identityVerified: boolean): { relevant: boolean; score: number; match: RfqProductMatch } {
  const r = rfqRequirement(input);
  const variantName = candidate.subtitle ?? candidate.specifications.find(s => /^Navn:/i.test(s))?.replace(/^Navn:\s*/i, "") ?? "";
  const heading = `${candidate.productName}\n${variantName}`;
  const technical = `${heading}\n${candidate.specifications.join("\n")}`;
  const checks: RfqCheck[] = [];
  const add = (name: string, expected: string, actual: string, state: RfqCheck["status"]) => checks.push({ name, expected, actual, status: state });
  const accessoryMismatch = accessoryName.test(candidate.productName) && !accessoryName.test(input.description);
  const familyMatch = Boolean(r.family?.product.test(candidate.productName)) && !accessoryMismatch;
  const manufacturerPart = candidate.specifications.find(s => /^Tillverkarens artikelnummer:/i.test(s))?.split(":").slice(1).join(":").trim();
  const foundModel = r.models.length > 0 && !accessoryMismatch && r.models.every(model => modelInHeading(model, heading)
    || Boolean(manufacturerPart && compact(manufacturerPart) === compact(model))
    || Boolean(manufacturerPart && manufacturerModels.some(m => m.brand === r.brand && compact(m.model) === compact(model) && m.part === manufacturerPart))
    || (/^Scotch (?:Super )?\d+$/i.test(model) && /\bScotch\b/i.test(candidate.productName)
      && new RegExp(`\\b(?:elektrotape|isolasjonstape|tape)\\s+(?:super\\s+)?${model.match(/\d+/)?.[0]}\\b`, "i").test(variantName)));
  const actualModels = rfqModels(heading);
  if (r.family) add("Produkttyp", r.family.query, candidate.productName, familyMatch ? "match" : "mismatch");
  if (r.brand) {
    const brandMatch = compact(`${candidate.manufacturer} ${heading}`).includes(compact(r.brand));
    add("Fabrikat", r.brand, candidate.manufacturer || candidate.productName, brandMatch ? "match" : candidate.manufacturer ? "mismatch" : "unknown");
  }
  const contradictoryModel = Boolean(foundModel && r.models.some(expected => /^M18 NRG-/i.test(expected)
    && actualModels.some(actual => /^M18 NRG-/i.test(actual) && compact(actual) !== compact(expected))));
  if (r.models.length) add("Modell", r.models.join(" / "), foundModel && !actualModels.length && manufacturerPart ? `${r.models.join(" / ")} (tillverkarartikel ${manufacturerPart})` : actualModels.join(" / ") || candidate.productName,
    contradictoryModel ? "mismatch" : foundModel ? "match" : actualModels.length ? "mismatch" : "unknown");
  if (foundModel && manufacturerPart) add("Tillverkarens artikelnummer", manufacturerPart, manufacturerPart, "match");
  if (/\b(?:kit|set|sats)\b|sett\b/i.test(input.description)) add("Leveransomfattning", "Komplett sats / paket", candidate.productName,
    /\b(?:kit|set|sats|pakke)\b|(?:pipe|nøkkel|batteri|verktøy|skrutrekker|tang|bits|bor|press|fil)sett\b/i.test(heading) ? "match" : "unknown");
  if (accessoryMismatch) add("Leveransomfattning", "Huvudprodukt", "Reservdel / tillbehör", "mismatch");
  for (const qualifier of r.text.match(/\b(?:UK|US|IP\d{2}|ATEX)\b/gi) ?? []) add("Utförande", qualifier, new RegExp(`\\b${qualifier}\\b`, "i").test(technical) ? qualifier : "Ej dokumenterat", new RegExp(`\\b${qualifier}\\b`, "i").test(technical) ? "match" : "unknown");
  const pack = rfqPacking(technical);
  for (const [name, expected, actual] of [["Förpackning (antal per beställd enhet)", r.packing.packs, pack.packs], ["Satsens innehåll (delar)", r.packing.pieces, pack.pieces]] as const) {
    if (expected.length) add(name, expected.join(" / "), actual.join(" / ") || "Ej dokumenterat", actual.length === 1 && expected.length === 1 && actual[0] === expected[0] ? "match" : actual.length ? "mismatch" : "unknown");
  }
  const actualMeasures = measurements(technical);
  for (const m of r.measures) {
    const same = actualMeasures.filter(a => a.kind === m.kind);
    const matches = same.some(a => Math.abs(a.value - m.value) <= Math.max(0.05, m.value * 0.0001));
    add("Mått / tekniskt krav", m.label, same.map(a => a.label).join(" / ") || "Ej dokumenterat", matches ? "match" : same.length ? "mismatch" : "unknown");
  }
  if (r.colors.length) {
    const actual = colorNames(technical);
    add("Färg", r.colors.join(" / "), actual.join(" / ") || "Ej dokumenterat", r.colors.every(c => actual.includes(c)) ? "match" : actual.length ? "mismatch" : "unknown");
  }
  if (/stainless|rustfri|syrefast/i.test(r.text)) add("Material", "Rostfritt stål", /stainless|rustfri|syrefast|\bA[24]\b/i.test(technical) ? "Rostfritt stål" : "Ej dokumenterat", /stainless|rustfri|syrefast|\bA[24]\b/i.test(technical) ? "match" : "unknown");
  add("Artikelidentitet", candidate.articleNumber, identityVerified ? candidate.articleNumber : "Ej verifierad på produktsidan", identityVerified ? "match" : "unknown");
  const mismatch = checks.some(c => c.status === "mismatch");
  const verified = Boolean(r.brand) && !mismatch && foundModel && checks.every(c => c.status === "match");
  const relevant = !accessoryMismatch && (familyMatch || foundModel || (!r.family && !r.models.length && Boolean(r.brand) && compact(heading).includes(compact(r.brand!))));
  const evidencePoints = Math.round(15 * checks.filter(c => c.status === "match").length / Math.max(1, checks.length));
  const score = verified ? 100 : mismatch ? foundModel ? 25 : 5 : (foundModel ? 80 : familyMatch ? 50 : 10) + evidencePoints;
  return { relevant, score, match: { status: verified ? "verified" : mismatch ? "mismatch" : "review", autoSelect: verified, checks } };
}
