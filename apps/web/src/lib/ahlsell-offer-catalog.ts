import { rankAhlsellCandidates, orderAhlsellCandidatesForDisplay, hasAhlsellProductFamilyMismatch } from './ahlsell-candidate-ranking';
import { ahlsellRequirementIntent } from './ahlsell-requirement-intent';
import { distributorRequirementKind } from './distributor-requirement-lines';
import { requirementDiscipline, requirementHeading } from './requirement-discipline';
import { technicalConflictWarnings } from './ahlsell-technical-conflicts';
import type { AhlsellPublicCandidate } from './ahlsell-public-match';
import { mainProductText, productRequirementAttributes } from './ahlsell-requirement-context';
import { supplierArticleIdentity, electricalOfferCompatible, type SupplierArticleKind } from './supplier-article-identity';

/** Historical offer identities are discovery evidence, never confirmed choices.
 * Source posts and quantities deliberately do not participate in retrieval. */
export type AhlsellOfferProduct = {
  articleNumber: string;
  productName: string;
  discipline: 'vvs' | 'electrical' | 'mixed';
  reviewFlags: string[];
  articleKind?: SupplierArticleKind;
};
export type AhlsellOfferCatalog = {
  schemaVersion: 1;
  organizationId: string;
  version: string;
  products: AhlsellOfferProduct[];
};
export const OFFER_REVIEW_WARNING = 'Artikel från tidigare Ahlsell-offert. Tekniska krav, tillbehör och aktuell tillgänglighet behöver kontrolleras.';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function offerCatalogObjectPath(organizationId: string) {
  if (!uuid.test(organizationId)) throw new Error('Invalid organization id');
  return `organization-offer-catalog/v1/${organizationId.toLowerCase()}/catalog.json`;
}

export function parseAhlsellOfferCatalog(value: unknown, organizationId: string): AhlsellOfferCatalog | null {
  if (!uuid.test(organizationId) || !value || typeof value !== 'object') return null;
  const catalog = value as AhlsellOfferCatalog;
  if (catalog.schemaVersion !== 1 || catalog.organizationId !== organizationId || !/^sha256:[a-f0-9]{64}$/.test(catalog.version)
    || !Array.isArray(catalog.products) || catalog.products.length > 10000) return null;
  const seen = new Set<string>();
  const products: AhlsellOfferProduct[] = [];
  for (const product of catalog.products) {
    if (!product || typeof product !== 'object' || typeof product.articleNumber !== 'string'
      || (product.articleKind != null && !['ahlsell','nrf','el','supplier'].includes(product.articleKind))
      || !supplierArticleIdentity(product.articleNumber,product.articleKind) || seen.has(product.articleNumber.toLowerCase())
      || typeof product.productName !== 'string' || product.productName.length < 5 || product.productName.length > 500
      || !['vvs', 'electrical', 'mixed'].includes(product.discipline) || !Array.isArray(product.reviewFlags)
      || !product.reviewFlags.every(flag => ['historical_offer', 'source_exception', 'multiple_descriptions'].includes(flag))) return null;
    seen.add(product.articleNumber.toLowerCase());
    // Do not pass private source filenames/posts, raw rows or commercial fields to the client.
    products.push({articleNumber: product.articleNumber, productName: product.productName, discipline: product.discipline, reviewFlags: product.reviewFlags, ...(product.articleKind ? {articleKind:product.articleKind} : {})});
  }
  return {schemaVersion: 1, organizationId, version: catalog.version, products};
}

const stop = new Set('innendors utendors innvendig utvendig komplett andre lengde antall stk type spesial valgfritt krav materiale lokalisering montasje montering rorledning ledning anlegg leveres monteres dimensjon'.split(' '));
function tokens(value: string) {
  return [...new Set(value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ø/g,'o').replace(/æ/g,'ae')
    .split(/[^a-z0-9]+/).filter(word => /^[a-z]{3,}/.test(word) && !stop.has(word))
    .map(word => word.length > 5 ? word.replace(/(?:ene|er|ar)$/, '') : word))];
}
const indexes = new WeakMap<AhlsellOfferCatalog, {product: AhlsellOfferProduct; words: string[]}[]>();
export function findAhlsellOfferCandidates(requirement: Record<string, unknown>, catalog?: AhlsellOfferCatalog | null, limit = 30) {
  if (!catalog || distributorRequirementKind({...requirement, id: String(requirement.id ?? '')}) !== 'product') return [];
  requirement = offerRequirementIdentity(requirement);
  const discipline = requirementDiscipline(requirement);
  const intent = ahlsellRequirementIntent(requirement);
  const ownText = [requirementHeading(requirement), JSON.stringify(productRequirementAttributes(requirement))].join(' ');
  const wanted = tokens(ownText);
  let index = indexes.get(catalog);
  if (!index) { index = catalog.products.map(product => ({product, words: tokens(product.productName)})); indexes.set(catalog, index); }
  const pool = index.filter(({product}) => !(discipline === 'electrical' && product.discipline === 'vvs')
    && !(['plumbing', 'ventilation'].includes(discipline) && product.discipline === 'electrical')
    && !hasAhlsellProductFamilyMismatch(intent, product.productName) && offerVariantCompatible(requirement, product.productName))
    .map(({product, words}) => ({product, score: words.filter(word => wanted.some(w => word === w || (w.length >= 5 && word.startsWith(w)))).length,
      exact: ownText.toUpperCase().split(/\s+/).includes(product.articleNumber.toUpperCase())}))
    .filter(item => item.exact || item.score > 0).sort((a,b) => Number(b.exact)-Number(a.exact) || b.score-a.score).slice(0,100);
  const candidates: AhlsellPublicCandidate[] = pool.map(({product}) => ({
    articleNumber: product.articleNumber, productName: product.productName, manufacturer: '',
    productUrl: `https://www.ahlsell.no/search/?q=${encodeURIComponent(product.articleNumber)}`,
    specifications: [], source: 'offer_catalog', evidenceSources: ['offer_catalog'],
    matchWarnings: [OFFER_REVIEW_WARNING,
      ...(product.reviewFlags.includes('source_exception') ? ['Offertunderlaget innehåller alternativ eller undantag. Kontrollera vald variant och leveransomfattning.'] : []),
      ...(product.reviewFlags.includes('multiple_descriptions') ? ['Artikeln förekommer med flera benämningar i underlaget. Kontrollera aktuell produktinformation.'] : [])]
  }));
  return rankAhlsellCandidates(requirement, candidates)
    .filter(candidate => candidate.recommendation !== 'unlikely' && technicalConflictWarnings(candidate).length === 0 && (candidate.matchScore ?? 0) >= 35)
    .map(candidate => ({...candidate, source: 'offer_catalog' as const, exactMatch: false, recommendation: 'possible' as const,
      matchWarnings: [...new Set([...(candidate.matchWarnings ?? []), OFFER_REVIEW_WARNING])]})).slice(0,limit);
}

/** A dimension-only child uses its immediate parent; broad chapter prose does not. */
export function offerRequirementIdentity(requirement: Record<string, unknown>) {
  const value = requirement.value_json as Record<string, unknown> | undefined;
  const heading = requirementHeading(requirement);
  const parent = typeof value?.parentDescription === 'string' ? value.parentDescription : '';
  const attrs = productRequirementAttributes(requirement);
  if (/^JORDINGSMATERIELL$/i.test(heading) && typeof attrs.funksjon === 'string') {
    return {...requirement, value_text: `${attrs.funksjon} ${heading}`};
  }
  if (/^(?:bredde|høyde|hoyde|dimensjon|diameter|dn\s*\d)/i.test(heading) && parent && parent.length < 100
    && !(Array.isArray(value?.reviewFlags) && value.reviewFlags.includes('missing-parent-context'))) {
    return {...requirement, value_text: `${parent} ${heading}`};
  }
  return requirement;
}

/** Reject explicit cable variant conflicts even when the general family matcher
 * lacks a detailed electrical profile. No dimensions are copied from requirements. */
export function offerVariantCompatible(requirement: Record<string, unknown>, name: string) {
  const value = requirement.value_json as Record<string, unknown> | undefined;
  const heading = requirementHeading(requirement);
  if (requirementDiscipline(requirement) === 'electrical' && !electricalOfferCompatible(`${heading} ${JSON.stringify(productRequirementAttributes(requirement))}`,name)) return false;
  const cable = /^WJ\d/.test(String(value?.nsCode ?? '')) || /^(?:IFSI|BFSI|PFXP|PFSP|TFXP)\b/i.test(heading);
  if (!cable) return true;
  const primary = mainProductText(name.replace(/\bf\//gi, ' for '));
  if (/\b(?:\w*verktoy|\w*klammer|\w*brakett|\w*holder|\w*stige|\w*bro|\w*bru|\w*kanal|\w*skinne)\b/.test(primary)) return false;
  if (!/\b(?:\w*kabel|ifsi|bfsi|pfxp|pfsp|tfxp|pn|fxq|fxqj|exq)\b/.test(primary)) return false;
  const family = heading.match(/\b(IFSI|BFSI|PFXP|PFSP|TFXP)\b/i)?.[1];
  if (family && !new RegExp(`\\b${family}\\b`, 'i').test(name)) return false;
  const dimensions = (text: string) => text.match(/\b(\d+)\s*[xg×]\s*(\d+(?:[.,]\d+)?)/i)?.slice(1).map(n => Number(n.replace(',','.')));
  const wanted = dimensions(heading); const actual = dimensions(name);
  return !wanted || !actual || (wanted[0] === actual[0] && wanted[1] === actual[1]);
}

/** Existing independently assessed articles keep their evidence and priority. */
export function withAhlsellOfferCandidates(requirement: Record<string, unknown>, existing: AhlsellPublicCandidate[], catalog?: AhlsellOfferCatalog | null) {
  const known = new Set(existing.map(candidate => candidate.articleNumber.toLowerCase()));
  return orderAhlsellCandidatesForDisplay([...existing, ...findAhlsellOfferCandidates(requirement, catalog).filter(candidate => !known.has(candidate.articleNumber.toLowerCase()))]);
}
