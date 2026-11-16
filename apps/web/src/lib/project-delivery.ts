import { productAssemblyPlan } from './product-assembly-plan';
import { parseProductOrderQuantity } from './product-order-quantity';

export type DeliveryComponent = { id: string; label: string; status: 'missing' | 'included' | 'separate' | 'excluded'; productNumber: string; note: string; optional: boolean };
export type DeliveryDeviation = { id: string; description: string; owner: string; decision: 'open' | 'accepted' | 'rejected'; reason: string };
export type DeliveryAlternative = { id: string; name: string; productNumber: string; reason: string };
export type QuantityCalculation = { id: string; target: string; base: number; baseUnit: string; factor: number; unit: string; source: string; reviewed: boolean };
export type DeliveryReview = { components: DeliveryComponent[]; deviations: DeliveryDeviation[]; alternatives: DeliveryAlternative[]; calculations: QuantityCalculation[]; state: 'draft' | 'ready'; comment: string };
export function initialDeliveryReview(requirement: Record<string, unknown>): DeliveryReview {
  const components: DeliveryComponent[] = (productAssemblyPlan(requirement)?.components ?? []).map(part => ({id: part.id, label: part.label, status: 'missing', productNumber: '', note: '', optional: part.optional}));
  const source=String(record(requirement.value_json).sourceText ?? requirement.source_excerpt ?? '').toLowerCase();
  // Additional named delivery parts from the current post; no inferred quantities
  // and no neighbouring trade or historical offer can add a mandatory part.
  for (const [id,label,pattern] of [
    ['guide-rails','Gejderrör / gejdersystem',/geider(?:rør|ror)|gejder/],
    ['pump-controller','Pumpstyrning',/styreskap|pumpestyring|styreenhet/],
    ['coupling-foot','Kopplingsfot',/koblingsfot|kopplingsfot/],
    ['insulation','Isolering',/isolasjon|isolering/],
    ['mesh','Galler / nät',/netting|gitter/],
    ['termination','Ändavslutningar',/endeavslut\w*|endetermin\w*/],
    ['heat-shrink','Krympslang',/krympeslange|krympslang/],
    ['brackets','Fästen / konsoler',/festebrakett|konsoller|bærejern/]
  ] as const) if(pattern.test(source) && !components.some(p=>p.id===id)) components.push({id,label,status:'missing',productNumber:'',note:'',optional:false});
  return { components, deviations: [], alternatives: [], calculations: [], state: 'draft', comment: '' };
}
export function quantityCalculationTotal(item: QuantityCalculation) {
  if (!Number.isFinite(item.base) || !Number.isFinite(item.factor) || item.base <= 0 || item.factor <= 0 || item.base * item.factor > 100000) return null;
  return Math.round(item.base * item.factor * 1000000) / 1000000;
}
export function deliveryBlockers(review: DeliveryReview, selectedNumbers: readonly string[] = []) {
  const blockers: string[] = [];
  for (const part of review.components) {
    if (!part.optional && part.status === 'missing') blockers.push(`${part.label}: saknas`);
    if (part.status === 'separate' && (!part.productNumber || !selectedNumbers.includes(part.productNumber))) blockers.push(`${part.label}: lägg till artikeln bland produktvalets tillbehör`);
    if (['included','excluded'].includes(part.status) && !part.note.trim()) blockers.push(`${part.label}: ange underlag för beslutet`);
  }
  for (const item of review.deviations) if (item.decision === 'open' || !item.owner.trim() || !item.reason.trim()) blockers.push(`Avvikelse: ${item.description || 'beskrivning saknas'} behöver beslut och ansvarig`);
  for (const calc of review.calculations) if (!calc.reviewed || !calc.source.trim() || !calc.unit.trim() || !calc.baseUnit.trim() || quantityCalculationTotal(calc) === null) blockers.push(`Mängdberäkning ${calc.target}: behöver granskas`);
  return blockers;
}
export function parseDeliveryReview(input: unknown): DeliveryReview | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const value = input as DeliveryReview;
  if (!['draft','ready'].includes(value.state) || !text(value.comment, 2000)) return null;
  if (!Array.isArray(value.components) || value.components.length > 40 || !value.components.every(x => x && text(x.id,80) && text(x.label,240) && ['missing','included','separate','excluded'].includes(x.status) && text(x.productNumber,120) && text(x.note,2000) && typeof x.optional === 'boolean')) return null;
  if (!Array.isArray(value.deviations) || value.deviations.length > 40 || !value.deviations.every(x => x && text(x.id,80) && text(x.description,2000) && text(x.owner,200) && text(x.reason,2000) && ['open','accepted','rejected'].includes(x.decision))) return null;
  if (!Array.isArray(value.alternatives) || value.alternatives.length > 20 || !value.alternatives.every(x => x && text(x.id,80) && text(x.name,240) && text(x.productNumber,120) && text(x.reason,2000))) return null;
  if (!Array.isArray(value.calculations) || value.calculations.length > 21 || !value.calculations.every(x => x && text(x.id,80) && text(x.target,120) && text(x.baseUnit,30) && text(x.unit,30) && text(x.source,1000) && typeof x.reviewed === 'boolean' && quantityCalculationTotal(x) !== null)) return null;
  for (const list of [value.components,value.deviations,value.alternatives,value.calculations]) if (new Set(list.map(x => x.id)).size !== list.length) return null;
  return {...value,calculations:value.calculations.map(c=>({...c,unit:parseProductOrderQuantity({quantity:quantityCalculationTotal(c),unit:c.unit})?.unit ?? c.unit}))};
}
function text(value: unknown, max: number): value is string { return typeof value === 'string' && value.length <= max; }

export function deliveryExportNotes(review: DeliveryReview | undefined, stale: boolean) {
  if (!review) return 'Leveranskontroll återstår.';
  return [stale ? 'Produktvalet har ändrats – leveranskontrollen behöver göras om.' : review.state==='ready' ? 'Leverans kontrollerad.' : 'Leveranskontroll återstår.',
    ...review.components.filter(c=>c.status==='missing'||c.status==='excluded').map(c=>`${c.label}: ${c.status==='missing'?'saknas':`undantagen (${c.note})`}`),
    ...review.deviations.map(d=>`Avvikelse: ${d.description}. ${d.decision==='open'?'Inväntar beslut':d.decision==='accepted'?'Accepterad':'Avslagen / åtgärdad'} av ${d.owner||'ej tilldelad'}: ${d.reason}`),
    ...(review.alternatives.length ? [`${review.alternatives.length} alternativa förslag räknas inte i materiallistan.`] : []),
    ...review.calculations.map(c=>`Mängd ${c.target}: ${c.base} ${c.baseUnit} × ${c.factor} = ${quantityCalculationTotal(c)} ${c.unit}. Källa: ${c.source}. ${c.reviewed?'Granskad faktor':'Ej granskad faktor'}`)
  ].join(' ');
}

export type RequirementReference = { post: string; kind: 'parent' | 'reference'; state: 'found' | 'missing' | 'ambiguous'; id?: string; page?: number; documentId?: string; description?: string; conflicts: string[] };
type Row = Record<string, unknown> & { id: string };
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
export function requirementReferences(requirement: Row, rows: readonly Row[]): RequirementReference[] {
  const value = record(requirement.value_json);
  const post = String(value.postNumber ?? '');
  const wanted = new Map<string, 'parent' | 'reference'>();
  const segments = post.split('.');
  while (segments.length > 1) { segments.pop(); wanted.set(segments.join('.'), 'parent'); }
  if (typeof value.parentPostNumber === 'string') wanted.set(value.parentPostNumber, 'parent');
  const own = String(value.sourceText ?? requirement.source_excerpt ?? '');
  for (const match of own.matchAll(/(?:se|jfr\.?|jf\.?|henvis\w*|ref\.?|iht\.?)\s+(?:og\s+)?(?:(?:post(?:ene|er)?|kapittel)\s+)?(\d+(?:\.\d+){2,})/gi)) if (match[1] !== post) wanted.set(match[1], 'reference');
  const scope = value.postScope;
  return [...wanted].map(([target,kind]) => {
    let candidates = rows.filter(row => row.id !== requirement.id && String(record(row.value_json).postNumber ?? '') === target && row.status !== 'superseded');
    const sameDocument = candidates.filter(row => row.source_technical_description_document_id === requirement.source_technical_description_document_id);
    if (sameDocument.length || kind==='parent') candidates = sameDocument;
    const sameScope = candidates.filter(row => record(row.value_json).postScope === scope);
    if (sameScope.length || kind==='parent') candidates = sameScope;
    if (candidates.length !== 1) return {post:target,kind,state:candidates.length ? 'ambiguous' : 'missing',conflicts:[]};
    const source = candidates[0];
    const ownAttrs = record(value.attributes), parentAttrs = record(record(source.value_json).attributes);
    const conflicts = Object.entries(ownAttrs).filter(([key, val]) => parentAttrs[key] != null && String(val).trim().toLowerCase() !== String(parentAttrs[key]).trim().toLowerCase()).map(([key,val]) => `${key}: ${String(val)} / ${String(parentAttrs[key])}`);
    return {post:target,kind,state:'found',id:source.id,page:Number(source.source_page)||undefined,documentId:typeof source.source_document_id === 'string' ? source.source_document_id : undefined,description:String(source.value_text ?? ''),conflicts};
  });
}

export type RevisionDifference = { key: string; kind: 'added' | 'removed' | 'changed' | 'unchanged' | 'ambiguous'; oldId?: string; newId?: string; post: string };
export function compareDocumentRequirements(before: readonly Row[], after: readonly Row[]): RevisionDifference[] {
  const index = (rows: readonly Row[]) => { const map = new Map<string, Row[]>(); for (const row of rows) { const v=record(row.value_json); const key=JSON.stringify([v.postScope ?? '',v.postNumber ?? `unnumbered:${row.id}`]); map.set(key,[...(map.get(key) ?? []),row]); } return map; };
  const old=index(before), next=index(after);
  const signature=(row: Row) => {const v=record(row.value_json); return stable({text:row.value_text, source:v.sourceText, nsCode:v.nsCode, quantity:v.quantity, unit:v.unit, attributes:v.attributes, parent:v.parentPostNumber});};
  return [...new Set([...old.keys(),...next.keys()])].map(key => { const a=old.get(key) ?? [], b=next.get(key) ?? []; return {key, post:String(record((b[0] ?? a[0]).value_json).postNumber ?? 'Utan postnummer'),kind:a.length>1||b.length>1 ? 'ambiguous' : !a.length ? 'added' : !b.length ? 'removed' : signature(a[0])===signature(b[0]) ? 'unchanged' : 'changed',oldId:a.length===1 ? a[0].id : undefined,newId:b.length===1 ? b[0].id : undefined}; });
}
function stable(value: unknown): string { return Array.isArray(value) ? `[${value.map(stable)}]` : value && typeof value === 'object' ? `{${Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${stable(v)}`).join(',')}}` : JSON.stringify(value ?? null); }
