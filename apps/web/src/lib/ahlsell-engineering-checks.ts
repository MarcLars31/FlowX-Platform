import type { AhlsellPublicCandidate } from "./ahlsell-public-match";
import { withVerifiedWorkingPressure } from "./victaulic-working-pressure";
import { ahlsellRequirementIntent } from "./ahlsell-requirement-intent";
import { MANIFOLD_CABINET_REVIEW_WARNING } from "./ahlsell-manifold-cabinet";

/** Cross-catalogue checks that must also run on directly verified products. */
export function engineeringRequirementWarnings(
  requirement: Record<string, unknown>,
  candidate: AhlsellPublicCandidate
): string[] {
  candidate = withVerifiedWorkingPressure(candidate);
  const value = record(requirement.value_json);
  const attributes = record(value.attributes);
  const ownText = `${requirement.value_text ?? ""} ${requirement.display_name ?? ""}`;
  const requirementText = `${ownText} ${Object.entries(attributes).filter(([key]) => !["generelle krav", "pdf-kommentar"].includes(key)).map(([key, item]) => `${key} ${item}`).join(" ")}`;
  const detail = `${value.technicalSpecification ?? ""} ${value.sourceText ?? ""} ${requirement.source_excerpt ?? ""}`.replace(/\s+/g, " ");
  const intent = ahlsellRequirementIntent(requirement);
  // Cabinet, manifolds and supply pipes need separate evidence. A cabinet
  // family match cannot verify the whole assembly or inherit pipe dimensions.
  if (intent === "manifold_cabinet") return [MANIFOLD_CABINET_REVIEW_WARNING];
  // A search URL, stock location or requirement-derived PDF reference is not
  // technical product evidence.
  const productText = `${candidate.productName} ${candidate.description ?? ""} ${candidate.specifications.join(" ")}`;
  const warnings: string[] = [];
  if (intent === "shower_set") {
    warnings.push("Duschens kompletta leveransomfattning och tilläggskraven i PDF-posten behöver verifieras. Kontrollera blandare, handdusch, slang, stång samt eventuella stödhandtag, duschsits och belastningskrav.");
  }
  if (intent === "toilet") {
    // Sanitary assemblies have requirements outside the pipe/sprinkler checks.
    // A matching family or inherited exact flag cannot verify the complete unit.
    warnings.push("Toalettens montage, cistern, sits och tilläggskraven i PDF-posten behöver verifieras mot produktunderlaget, inklusive eventuell elektrisk höjdjustering, belastning och tillbehör.");
  }
  const comment = String(attributes["pdf-kommentar"] ?? "");
  if (comment && !/^\s*\d{6,8}(?:N5)?\s*$/i.test(comment)) {
    warnings.push(`PDF-kommentaren innehåller en reservation eller flera delar som behöver granskas: ${comment}`);
  }
  const requiredIp = requirementText.match(/\bIP\s*(\d{2})\b/i)?.[1];
  if (requiredIp && !new RegExp(`\\bIP\\s*${requiredIp}\\b`, "i").test(productText)) {
    warnings.push(`Kapslingsklass IP${requiredIp} behöver verifieras mot PDF-posten.`);
  }
  if (intent === "ball_valve" && /trykkbryter|endebryter|overv[åa]k|registrerer [åa]pen stilling/i.test(detail)
    && !/supervisory switch|endebryter|overv[åa]k|supervised/i.test(productText)) {
    warnings.push("Ventilens lägesövervakning och brytare behöver verifieras mot PDF-posten.");
  }
  if (intent === "pump" && /\b\d+\s*l\/s|\b400\s*V/i.test(requirementText)) {
    warnings.push("Pumpens flöde vid angiven lyfthöjd, spänning och tillbehör behöver verifieras mot PDF-posten.");
  }

  const general = String(attributes["generelle krav"] ?? "");
  if (["pipe", "bend", "tee", "reducer", "cap", "branch"].includes(intent)
    && /(?:alle rør|rørene skal)[\s\S]{0,160}varmgalvaniser/i.test(general)
    && !/\b(?:galv\.?|galvanisert|galvaniserad|galvanized|galvanised|hot.dip)\b/i.test(productText)) {
    warnings.push("Kapitlets krav på galvaniserade rör/rördelar behöver verifieras mot produktens ytbehandling.");
  }
  if (intent === "pipe" && /pressfittings aksepteres ikke/i.test(general) && /\bpress(?:fitting|ystem|kobling)/i.test(productText)) {
    warnings.push("Fel produkttyp: kapitlet tillåter inte presskopplingar.");
  }
  if (intent === "bend") {
    if (/^m(?:eter)?$/i.test(String(value.unit ?? ""))) warnings.push("PDF-posten mängdar rörböjar i meter. Kontrollera antal och enhet före produktval.");
    if (angle(requirementText) === null) warnings.push("Böjvinkeln saknas i PDF-posten och behöver anges före produktval.");
  }
  if (intent === "branch" && dimensions(requirementText).length < 2) {
    warnings.push("Avstickets anslutningsdimension saknas i PDF-posten; huvudrörets dimension räcker inte för produktval.");
  }
  if (intent === "sprinkler_guard") {
    warnings.push("Skyddsgallrets kompatibilitet med valt sprinklerhuvud och angiven ytbehandling behöver verifieras.");
  }
  if (intent === "sprinkler_cabinet") {
    warnings.push("Reservsprinklerskåpets innehåll, antal huvuden och sprinklernycklar behöver kontrolleras mot den kompletta posten.");
  }
  if (intent === "wet_alarm_valve" && /retarda(?:sjons|tions?)kamm(?:er|are)|retard chamber/i.test(`${requirementText} ${detail}`)) {
    warnings.push("PDF-posten kräver retardationskammare för tryckutjämning. Kontrollera att rätt kammare ingår i ventilsetets leverans.");
  }
  if (["wet_alarm_valve", "water_meter", "test_drain", "flushing_connection", "sensor_pocket", "pump", "strainer", "flange_adapter"].includes(intent)
    && /komplett|inkl\.|medta|automatisk returspyling|følerlomme|overgang fra pe til stål/i.test(`${requirementText} ${detail}`)) {
    warnings.push("PDF-posten omfattar en installation med flera delar eller särskild funktion. Kontrollera komplett leveransomfattning mot produktförslaget.");
  }
  if (intent === "check_valve" && /v[æä]skekategori\s*4/i.test(detail)
    && !/(?:v[æä]skekategori|fluid category)\s*4/i.test(productText)) {
    warnings.push("Godkännande för vätskekategori 4 enligt PDF-posten behöver verifieras; en vanlig backventil är inte tillräcklig dokumentation.");
  }

  const requiredDns = dimensions(requirementText);
  if (requiredDns.length > 1) {
    const candidateDns = dimensions(productText);
    const missing = requiredDns.filter((dn) => !candidateDns.includes(dn));
    if (missing.length > 0) warnings.push(`Alla anslutningar är inte verifierade: PDF kräver ${requiredDns.map((dn) => `DN${dn}`).join(" / ")}; produktinformationen bekräftar inte ${missing.map((dn) => `DN${dn}`).join(" / ")}.`);
  }

  if (/\b(bend|böj|rørbøy|elbow)\b/i.test(requirementText)) {
    const requiredAngle = angle(requirementText);
    if (requiredAngle !== null) {
      const actual = angle(productText);
      if (actual === null) warnings.push(`Böjvinkeln saknas i produktinformationen; PDF kräver ${requiredAngle}°.`);
      else if (Math.abs(requiredAngle - actual) > 0.1) warnings.push(`Fel böjvinkel: PDF kräver ${requiredAngle}°, produkten anger ${actual}°.`);
    }
  }

  const pressureText = Object.entries(attributes)
    .filter(([key]) => /^(trykk|arbetstryck|arbeidstrykk|working pressure|pressure)$/i.test(key.trim()))
    .map(([, item]) => String(item)).join(" ");
  // PN is a separate nominal pressure-class check in the ranker. Here we
  // compare an explicit working pressure in bar with documented capacity.
  const requiredBar = !/\bPN\s*\d/i.test(pressureText)
    ? number(pressureText.match(/(\d+(?:[.,]\d+)?)\s*bar\b/i)?.[1]) : null;
  if (requiredBar !== null) {
    // Never use a factory test pressure or minimum hydraulic pressure here.
    // Conflicting capacity values are assessed conservatively using the lower.
    const capacities = candidate.source === "pdf_reference" ? [] : [...productText.matchAll(
      /(?:max(?:imum|imalt|imalt tillåtet)?\.?\s*(?:arbeids|arbeids-|arbeids |arbets|working )?(?:trykk|tryck|pressure)|arbeidstrykk|arbetstryck|working pressure)\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*(bar|kpa|mpa|psi)\b/gi
    )].map(match => Number(match[1].replace(",", ".")) * ({ bar: 1, kpa: 0.01, mpa: 10, psi: 0.0689476 }[match[2].toLowerCase()] ?? 1));
    const actualBar = capacities.length ? Math.min(...capacities) : null;
    if (actualBar === null) warnings.push(`Produktens tillåtna arbetstryck behöver verifieras mot PDF-kravet ${requiredBar} bar.`);
    else if (actualBar < requiredBar) warnings.push(`För lågt arbetstryck: PDF kräver ${requiredBar} bar, produkten är dokumenterad för ${actualBar} bar.`);
  }
  return warnings;
}

function angle(text: string) {
  return number(text.match(/\b(\d{1,3}(?:[.,]\d+)?)\s*(?:°(?!\s*C)|grader|degrees|deg\b)/i)?.[1])
    ?? number(text.match(/\b(?:vinkel|angle)\s*[:=]?\s*(\d{1,3}(?:[.,]\d+)?)/i)?.[1]);
}

function number(value: string | undefined) {
  return value === undefined ? null : Number(value.replace(",", "."));
}

function dimensions(text: string) {
  const withoutInchAlias = text.replace(/(\bDN\s*\d+)\s*\/\s*(?:1\s*\/\s*2|3\s*\/\s*4)\s*["″]?/gi, "$1");
  return [...new Set([...withoutInchAlias.matchAll(/\bDN\s*(\d{1,3})(?:\s*[-x×/]\s*(?:DN\s*)?(\d{1,3}))?(?:\s*[-x×/]\s*(?:DN\s*)?(\d{1,3}))?/gi)]
    .flatMap((match) => match.slice(1).filter(Boolean).map(Number)))];
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
