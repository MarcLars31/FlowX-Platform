import assert from 'node:assert/strict';
import test from 'node:test';
import { ahlsellCandidateMatchState, rankAhlsellCandidates } from './ahlsell-candidate-ranking';
import { buildAhlsellRequirementGuide, type AhlsellPublicCandidate } from './ahlsell-public-match';
import { complementMldlCandidates } from './ahlsell-hybrid-matching';
import { isRigidPipeProduct } from './pipe-product-family';

const candidate = (productName: string, specifications: string[] = []): AhlsellPublicCandidate => ({
  articleNumber: 'synthetic', productName, specifications, manufacturer: 'Test',
  source: 'public_verified', productUrl: 'https://example.invalid', exactMatch: true, matchScore: 100
});
const pipe = { category: 'pipe', value_text: 'PE 100 rør. Rør avsluttes i rom 110 med flens til DN100',
  value_json: { unit: 'm', quantity: 35, attributes: { materiale: 'PE 100', 'nominell diameter': 'Ø160', 'sdr-verdi': '17', 'største tillatte driftstrykk (pma)': '12', skjøt: 'Valgfri' } } };
const plug = { category: 'pipe', value_text: 'Nye drensledninger skal det settes på Plugg i enden av rør. Gjenget utførelse. Rørende gjenges opp. Dimensjon DN25',
  value_json: { unit: 'st', quantity: 9, attributes: { dimensjon: 'DN25' } } };
const pe = candidate('PE100 rør Ø160 SDR17', ['Materiale: PE 100', 'PMA: 12 bar']);
const cap = candidate('Endelokk med innvendige gjenger rillet, Vic 60', [
  'Nominell diameter tilkobling 1: DN 50', 'Utvendig rørdiameter anslutning 1: 60.3 mm', 'Tilkobling 1: Spor / Rille',
  'Nominell diameter tilkobling 2: DN25', 'Utvendig rørdiameter tilkobling 2: 33.7 mm', 'Tilkobling 2: Innvendig gjenge gass konisk (BSPT)'
]);
const state = (requirement: Record<string, unknown>, product: AhlsellPublicCandidate) => ahlsellCandidateMatchState(rankAhlsellCandidates(requirement, [product])[0]);

test('pipe searches and validation use Ø160, keeping ending flange DN100 separate', () => {
  const guide = buildAhlsellRequirementGuide(pipe);
  assert.match(guide.searchQueries.join(' '), /160mm/);
  assert.match(guide.searchQueries.join(' '), /SDR17/);
  assert.doesNotMatch(guide.searchQueries.join(' '), /DN100|114[.,]3|PN12/);
  assert.ok(['exact', 'matched'].includes(state(pipe, pe)));
  assert.equal(state(pipe, { ...pe, productName: 'PE100 rør Ø110 SDR17 med flens DN100' }), 'mismatch');
});

test('an OD in description also takes precedence over an ending flange', () => {
  const requirement = { ...pipe, value_text: 'PE100 rør Ø160. Avsluttes med flens DN100', value_json: { ...pipe.value_json, attributes: { materiale: 'PE100' } } };
  assert.doesNotMatch(buildAhlsellRequirementGuide(requirement).searchQueries.join(' '), /DN100/);
  assert.ok(['exact', 'matched'].includes(state(requirement, pe)));
});

for (const name of ['Baio Pakning for PVC/PE rør', 'Baio Strekkfast sikring f/ PE rør', 'Flensemuffe, strekkfast for PE-rør, AVK']) {
  test(`application text cannot turn ${name} into a pipe`, () => {
    assert.equal(isRigidPipeProduct(name), false);
    assert.equal(state(pipe, candidate(name, ['DN100/125', 'Materiale: EPDM', 'PN16'])), 'mismatch');
  });
}

test('documented body material cannot be overridden by a PE pipe application', () => {
  const wrong = { ...pe, productName: 'Rør for PE-system Ø160 SDR17', specifications: ['Materiale: EPDM', 'PMA: 12 bar', 'Utvendig rørdiameter: 160 mm'] };
  const [ranked] = rankAhlsellCandidates(pipe, [wrong]);
  assert.equal(ahlsellCandidateMatchState(ranked), 'mismatch');
  assert.match(ranked.matchWarnings!.join(' '), /material stämmer inte/);
});

test('missing OD, SDR or PMA stays review and wrong SDR or pressure is a conflict', () => {
  assert.equal(state(pipe, { ...pe, productName: 'PE100 rør SDR17' }), 'review');
  assert.equal(state(pipe, { ...pe, productName: 'PE100 rør Ø160' }), 'review');
  assert.equal(state(pipe, { ...pe, specifications: ['Materiale: PE100', 'PN16'] }), 'review');
  assert.equal(state(pipe, { ...pe, productName: 'PE100 rør Ø160 SDR11' }), 'mismatch');
  assert.equal(state(pipe, { ...pe, specifications: ['Materiale: PE100', 'PMA: 10 bar'] }), 'mismatch');
  assert.equal(state(pipe, { ...pe, specifications: ['Materiale: PE100', 'Maksimalt driftstrykk ved 20 °C: 10 bar'] }), 'mismatch');
  assert.ok(['exact', 'matched'].includes(state(pipe, { ...pe, specifications: ['Materiale: PE100', 'Maks driftstrykk: 16 bar'] })));
});

test('SDR decimal values are preserved', () => {
  const requirement = { ...pipe, value_json: { ...pipe.value_json, attributes: { ...pipe.value_json.attributes, 'sdr-verdi': '13,6' } } };
  assert.ok(['exact', 'matched'].includes(state(requirement, { ...pe, productName: 'PE100 rør Ø160 SDR13.6' })));
  assert.equal(state(requirement, pe), 'mismatch');
});

test('threaded plug queries do not force grooved end caps', () => {
  const queries = buildAhlsellRequirementGuide(plug).searchQueries.join(' ');
  assert.match(queries, /Plugg gjenget DN25/);
  assert.doesNotMatch(queries, /rillet/);
  assert.ok(['exact', 'matched'].includes(state(plug, candidate('Plugg DN25 gjenget'))));
});

test('a matching secondary port cannot validate a wrong primary size or joint', () => {
  const [ranked] = rankAhlsellCandidates(plug, [cap]);
  assert.equal(ahlsellCandidateMatchState(ranked), 'mismatch');
  assert.match(ranked.matchWarnings!.join(' '), /DN50/);
  assert.match(ranked.matchWarnings!.join(' '), /anslutningstyp stämmer inte/);
  assert.ok(!ranked.matchReasons!.some(reason => /Dimensionen motsvarar DN25|Skarvtypen stämmer/.test(reason)));
  assert.equal(state(plug, { ...cap, specifications: cap.specifications.map(spec => spec.replace('DN 50', 'DN25').replace('60.3', '33.7')) }), 'mismatch');
});

test('a correctly sized grooved end cap remains eligible; absent primary evidence is review', () => {
  const requirement = { ...plug, value_text: 'Endelokk DN50 rillet', value_json: { ...plug.value_json, attributes: { dimensjon: 'DN50' } } };
  assert.ok(['exact', 'matched'].includes(state(requirement, cap)));
  assert.equal(state(plug, { ...cap, specifications: cap.specifications.filter(spec => / 2:/.test(spec)) }), 'review');
  assert.ok(['exact', 'matched'].includes(state(requirement, candidate('Endelokk rillet', ['Utvendig rørdiameter tilkobling 1: 60.3 mm']))));
  assert.equal(state(plug, candidate('Endelokk DN50 med gjenget uttak DN25 rillet')), 'review');
});

test('enrichment can resolve missing pipe evidence without clearing actual conflicts', () => {
  const local = rankAhlsellCandidates(pipe, [{ ...pe, productName: 'PE100 rør Ø160', specifications: ['Materiale: PE100'] }]);
  const complete = { ...pe, specifications: [...pe.specifications, 'SDR: 17'] };
  const merged = complementMldlCandidates(pipe, local, [complete]);
  assert.ok(merged.some(product => ['exact', 'matched'].includes(ahlsellCandidateMatchState(product))), JSON.stringify(merged));
  const wrong = rankAhlsellCandidates(plug, [cap]);
  assert.ok(complementMldlCandidates(plug, wrong, [candidate('Plugg DN25 gjenget')]).every(product => !['exact', 'matched'].includes(ahlsellCandidateMatchState(product))));
});
