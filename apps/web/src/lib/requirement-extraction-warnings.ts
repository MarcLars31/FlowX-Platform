import { normalizeTechnicalText } from './ahlsell-requirement-context';

export function requirementExtractionWarnings(requirement: Record<string, unknown>): string[] {
  const value = record(requirement.value_json);
  const flags = Array.isArray(value.reviewFlags) ? value.reviewFlags : [];
  const warnings: string[] = [];
  if (flags.includes('missing-parent-context')) warnings.push('Underpostens huvudpost och gemensamma krav har inte kunnat identifieras. Kontrollera material, anslutning och övriga krav i PDF-filen.');
  if (flags.includes('unknown-category')) warnings.push('PDF-postens huvudprodukt har inte kunnat identifieras säkert. Kontrollera produktgruppen före produktval.');
  if (flags.includes('reextracted-requirement-conflict')) warnings.push('Sparade krav skiljer sig från den nya PDF-läsningen. Kontrollera ändringarna innan produktvalet verifieras.');
  if (flags.includes('missing-quantity')) warnings.push('PDF-postens mängd saknas i läsningen och behöver kontrolleras.');
  if (flags.includes('inferred-post-number')) warnings.push('Postnumret har tolkats från omgivande poster. Kontrollera det mot PDF-filen.');
  if (flags.includes('inferred-parent-context')) warnings.push('Gemensamma rörkrav har hämtats från föregående huvudpost trots avvikande numrering. Kontrollera kopplingen i PDF-filen.');
  if (flags.includes('unresolved-source-quantity')) warnings.push('Sidan innehåller mängdrader som inte kunnat kopplas till en post. Kontrollera att denna posts krav är fullständiga.');
  const materialConflict = conflictingMaterialRequirement(record(value.attributes), String(value.technicalSpecification ?? value.sourceText ?? requirement.source_excerpt ?? ''));
  if (materialConflict) warnings.push(materialConflict);
  return warnings;
}

export function conflictingMaterialRequirement(attributes: Record<string, unknown>, source: string) {
  const material = Object.entries(attributes).find(([key]) => normalizeTechnicalText(key) === 'materiale')?.[1];
  if (typeof material !== 'string') return null;
  const declared = materialFamily(material);
  const delivery = source.match(/leveres\s+som\s+([^\n.]{1,90})/i)?.[1];
  const alternative = delivery ? materialFamily(delivery) : null;
  return declared && alternative && declared !== alternative
    ? `PDF-posten anger materialet ${material}, men tilläggstexten anger ${delivery?.trim()}. Kontrollera vilket materialkrav som gäller.` : null;
}

function materialFamily(value: string) {
  const text = normalizeTechnicalText(value);
  if (/\b(?:alupex|alupexror|multilayer|kompositror)\b/.test(text)) return 'multilayer';
  if (/\b(?:kobber|kobberror|koppar|copper)\b/.test(text)) return 'copper';
  if (/\b(?:rustfri\w*|rostfri\w*|stainless)\b/.test(text)) return 'stainless';
  if (/\b(?:stal|stalror|steel)\b/.test(text)) return 'steel';
  if (/\b(?:ppr|pp r)\b/.test(text)) return 'ppr';
  return null;
}
function record(value: unknown): Record<string, unknown> { return value && typeof value==='object' && !Array.isArray(value) ? value as Record<string,unknown> : {}; }
