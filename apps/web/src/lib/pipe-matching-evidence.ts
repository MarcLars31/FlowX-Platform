import type { AhlsellPublicCandidate } from './ahlsell-public-match';
import { normalizeTechnicalText, productRequirementAttributes } from './ahlsell-requirement-context';
import { pipeJointTypes } from './pipe-technical-terms';

const number = '(\\d+(?:[.,]\\d+)?)';
const numeric = (value: string | undefined) => value === undefined ? null : Number(value.replace(',', '.'));
const label = normalizeTechnicalText;
const plain = (value: string) => value.toLowerCase().replace(/ø/g, 'o').normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/** Preserve Ø before normalization; an ending flange DN is not the pipe OD. */
export function pipeRequirementDimensions(requirement: Record<string, unknown>) {
  const attributes = Object.entries(productRequirementAttributes(requirement));
  const explicit = attributes.find(([key]) => /^(?:nominell diameter|dimensjon(?: dn)?|dimension|dn|(?:utvendig|ytre|outside) (?:ror)?diameter)$/.test(label(key)));
  const raw = explicit ? String(explicit[1]) : String(requirement.value_text ?? requirement.display_name ?? '')
    .split(/\b(?:avsluttes|avslutning|med flens|inkludert|including)\b/i)[0];
  const od = numeric(raw.match(new RegExp(`[Øø⌀]\\s*${number}`))?.[1])
    ?? numeric(raw.match(new RegExp(`\\b${number}\\s*mm\\b`, 'i'))?.[1]);
  if (od !== null) return { dn: null, outsideDiameter: od };
  const dn = numeric(raw.match(/\bDN\s*(\d+)\b/i)?.[1]);
  if (dn !== null) return { dn, outsideDiameter: null };
  if (explicit && /^\s*\d+(?:[.,]\d+)?\s*$/.test(raw)) {
    return /^(?:utvendig|ytre|outside)/.test(label(explicit[0]))
      ? { dn: null, outsideDiameter: numeric(raw.trim()) }
      : { dn: numeric(raw.trim()), outsideDiameter: null };
  }
  return null;
}

export function pipeRequirementLimits(requirement: Record<string, unknown>) {
  const attributes = Object.entries(productRequirementAttributes(requirement));
  const get = (pattern: RegExp) => attributes.find(([key]) => pattern.test(label(key)))?.[1];
  const sdr = get(/^sdr(?: verdi| value)?$/);
  const pma = get(/\bpma\b|^(?:storste tillatte driftstrykk|maximum allowable operating pressure)$/);
  const description = plain(String(requirement.value_text ?? ''));
  return {
    sdr: numeric(String(sdr ?? '').match(new RegExp(number))?.[1])
      ?? numeric(description.match(new RegExp(`\\bsdr\\s*[-:=]?\\s*${number}`))?.[1]),
    pma: numeric(String(pma ?? '').match(new RegExp(number))?.[1])
      ?? numeric(description.match(new RegExp(`\\bpma\\s*[-:=]?\\s*${number}`))?.[1])
  };
}

export function pipeCandidateOutsideDiameter(candidate: AhlsellPublicCandidate) {
  const specification = candidate.specifications.find(spec => /^(?:utvendig|ytre|outside) (?:ror)?diameter\b/.test(label(spec)));
  if (specification) {
    // Numbered ports belong to fittings and must not be read as a diameter.
    const raw = plain(specification).replace(/^.*?diameter(?:\s+(?:tilkobling|anslutning|connection)\s*\d+)?\s*[:=]?\s*/, '');
    return numeric(raw.match(new RegExp(`^${number}`))?.[1]);
  }
  const primary = candidate.productName.split(/\b(?:med|with|for|til)\b|\bf\//i)[0];
  return numeric(primary.match(new RegExp(`[Øø⌀]\\s*${number}`))?.[1])
    ?? numeric(primary.match(new RegExp(`\\b${number}\\s*mm\\b`, 'i'))?.[1]);
}

/** Keep each port together instead of matching size on port 2 and joint on port 1. */
export function capPrimaryConnection(candidate: AhlsellPublicCandidate): string | null {
  const ports = candidate.specifications.filter(spec => /\b(?:tilkobling|anslutning|anslutningstype|connection)\s+\d+\b/.test(label(spec)));
  if (!ports.length) {
    const text = [candidate.productName, ...candidate.specifications].join(' ');
    const dns = new Set([...text.matchAll(/\bDN\s*(\d+)\b/gi)].map(match => match[1]));
    // Multiple dimensions/joints without port labels do not establish which
    // combination is the main connection. Supplier enrichment may resolve it.
    return dns.size > 1 || pipeJointTypes(text).length > 1 ? '' : null;
  }
  const primary = ports.filter(spec => /\b(?:tilkobling|anslutning|anslutningstype|connection)\s+1\b/.test(label(spec)))
    .map(spec => spec.replace(/\b(?:tilkobling|anslutning|anslutningstype|connection)\s+1\b/gi, '')).join(' ');
  const nameJoints = pipeJointTypes(candidate.productName);
  const hasSecondaryPort = ports.some(spec => /\b(?:tilkobling|anslutning|anslutningstype|connection)\s+[2-9]\d*\b/.test(label(spec)));
  return primary && !hasSecondaryPort && !pipeJointTypes(primary).length && nameJoints.length === 1
    ? `${primary} ${nameJoints[0]}` : primary;
}

/** Body material takes precedence over application text such as "for PE-rør". */
export function pipeCandidateMaterial(candidate: AhlsellPublicCandidate) {
  const explicit = candidate.specifications.filter(spec => /^(?:materiale|material|ror materiale|materialkvalitet)\s*[:=]/i.test(plain(spec)));
  return explicit.length ? explicit.join(' ') : candidate.productName.split(/\b(?:for|til)\b|\bf\//i)[0];
}

export function pipeLimitWarnings(candidate: AhlsellPublicCandidate, limits: ReturnType<typeof pipeRequirementLimits>) {
  const text = plain([candidate.productName, ...candidate.specifications].join(' '));
  const warnings: string[] = [];
  if (limits.sdr !== null) {
    const values = [...text.matchAll(new RegExp(`\\bsdr(?:[- ](?:verdi|value))?\\s*[:=]?\\s*${number}`, 'g'))].map(match => numeric(match[1])!);
    if (!values.length) warnings.push(`Produktens SDR behöver verifieras; PDF kräver SDR${limits.sdr}.`);
    else if (values.some(value => Math.abs(value - limits.sdr!) > 0.01)) warnings.push(`Fel SDR: PDF kräver SDR${limits.sdr}, träffen anger ${values.join(' / ')}.`);
  }
  if (limits.pma !== null) {
    // PN alone is not proof of allowable operating pressure for these conditions.
    const pressure = [...text.matchAll(new RegExp(`\\b(?:pma|(?:maks(?:imalt)?\\.?|maximum|max\\.?)\\s+(?:driftstrykk|arbeidstrykk|working pressure)|tillatt driftstrykk)(?:\\s+ved[^:;\\n]{1,60})?\\s*[:=]?\\s*${number}\\s*(bar)?`, 'g'))];
    const values = pressure.filter(match => match[2] || /^pma\b/.test(match[0])).map(match => numeric(match[1])!);
    if (!values.length) warnings.push(`Produktens tillåtna driftstryck behöver verifieras; PDF kräver PMA ${limits.pma} bar. PN ensamt verifierar inte PMA.`);
    else if (values.some(value => value < limits.pma!)) warnings.push(`För lågt arbetstryck: PDF kräver PMA ${limits.pma} bar, träffen anger ${values.join(' / ')} bar.`);
  }
  return warnings;
}
