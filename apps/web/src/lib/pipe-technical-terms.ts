import { normalizeTechnicalText } from './ahlsell-requirement-context';

export type PipeJoint = 'threaded' | 'grooved' | 'welded' | 'fusion' | 'flanged';

/** Shared by retrieval and validation so a PDF joint cannot disappear in search. */
export function pipeJointTypes(value: string): PipeJoint[] {
  const text = normalizeTechnicalText(value);
  const joints: PipeJoint[] = [];
  if (/\b(gjenget|gjengede|gjeng|gjengeskjot|gjenger|gangad|gangade|threaded|skrudd|skruforbindelse)\b/.test(text)) joints.push('threaded');
  if (/\b(rille|rillet|rillede|rilleskjot|rillekobling|rillad|rillade|rillanslutning|grooved|igs|ogs)\b/.test(text)) joints.push('grooved');
  if (/\b(sveis|sveist|sveiset|sveising|sveiseskjot|sveisskjot|svetsad|svetsfog|welded|butt weld)\b/.test(text)) joints.push('welded');
  if (/\b(muffesveis|heat fusion|fusion)\b/.test(text)) joints.push('fusion');
  if (/\b(flens|flenser|flenseskjot|flenset|flensanslutning|flanged|flansad)\b/.test(text)) joints.push('flanged');
  return joints;
}

/** Use the same connection fields in search and in the technical checks. */
export function requirementJointText(attributes: Record<string, unknown>, description = '') {
  const explicit = Object.entries(attributes)
    .filter(([key]) => /^(?:skjot|joint|(?:type )?tilkobling(?:er)?(?:stype)?|anslutning(?:styp)?|forbindelse)$/.test(normalizeTechnicalText(key)))
    .map(([, value]) => String(value)).join(' ');
  return explicit || description.split(/\b(?:inkl\.?|inkludert|inklusive|including)\b/i)[0];
}

export function stainlessSteelGrade(value: string) {
  const text = normalizeTechnicalText(value);
  // Recognize explicit grade labels, not an arbitrary dimension or post number.
  return text.match(/\b(?:kvalitet|materialkvalitet|grade|aisi|astm|stainless(?: steel)?|rustfritt(?: stal(?:ror)?)?|rustfri(?:e)?(?: stalror| ror)?)\s*(?:kvalitet\s*)?(304l?|316l?|904l)\b/)?.[1]?.toUpperCase() ?? null;
}

export const pipeJointSearchTerm: Record<PipeJoint, string> = {
  threaded: 'gjenget', grooved: 'rillet', welded: 'for sveising', fusion: 'muffesveis', flanged: 'flens'
};
