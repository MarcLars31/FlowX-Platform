import type { AhlsellPublicCandidate } from "./ahlsell-public-match";

/** Cross-catalogue checks that must also run on directly verified products. */
export function engineeringRequirementWarnings(
  requirement: Record<string, unknown>,
  candidate: AhlsellPublicCandidate
): string[] {
  const value = record(requirement.value_json);
  const attributes = record(value.attributes);
  const ownText = `${requirement.value_text ?? ""} ${requirement.display_name ?? ""}`;
  const requirementText = `${ownText} ${Object.entries(attributes).map(([key, item]) => `${key} ${item}`).join(" ")}`;
  // A search URL, stock location or requirement-derived PDF reference is not
  // technical product evidence.
  const productText = `${candidate.productName} ${candidate.description ?? ""} ${candidate.specifications.join(" ")}`;
  const warnings: string[] = [];

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
    const actualBar = candidate.source === "pdf_reference" ? null : number(productText.match(
      /(?:max(?:imum|imalt|imalt tillåtet)?\.?\s*(?:arbeids|arbeids-|arbeids |arbets|working )?(?:trykk|tryck|pressure)?|arbeidstrykk|arbetstryck|working pressure)\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*bar\b/i
    )?.[1]);
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
