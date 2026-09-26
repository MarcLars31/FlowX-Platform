import assert from 'node:assert/strict';
import test from 'node:test';
import {ahlsellCandidateMatchState,rankAhlsellCandidates} from './ahlsell-candidate-ranking';
import {ahlsellRequirementIntent} from './ahlsell-requirement-intent';
import {buildAhlsellRequirementGuide,type AhlsellPublicCandidate} from './ahlsell-public-match';
import {distributorRequirementKind} from './distributor-requirement-lines';
import {productAssemblyPlan,isAssemblyComponentCandidate} from './product-assembly-plan';
import {enrichProjectRequirements} from './project-requirement-enrichment';
import {assessAssemblyComponents} from './assembly-component-matching';
import {complementMldlCandidates} from './ahlsell-hybrid-matching';
import {findMldlOnlyCandidates} from './ahlsell-mldl-matching';

const pipe={id:'pipe',category:'pipe',value_text:'Dimensjon: DN100',value_json:{postNumber:'332.10.2',parentPostNumber:'332.10',quantity:330,unit:'m',attributes:{dimensjon:'DN100',trykk:'PN10',materiale:'Rustfritt stål kvalitet 316 eller tilsvarende',skjøt:'Sveiseskjøt'},technicalSpecification:'332.10\nINNENDØRS VANNLEDNING – KOMPLETT\nRund sum RS\n\nUNDERPOST\n332.10.2\nDimensjon: DN100\nm 330'}};
const candidate=(productName:string):AhlsellPublicCandidate=>({articleNumber:'synthetic',productName,manufacturer:'Test',source:'public_verified',productUrl:'https://example.invalid',specifications:[],exactMatch:false});

test('a measured pipe child is purchasable while actual RS work and pressure tests remain work',()=>{
 assert.equal(distributorRequirementKind(pipe),'product');
 assert.equal(distributorRequirementKind({...pipe,value_json:{...pipe.value_json,unit:'RS'}}),'work');
 assert.equal(distributorRequirementKind({...pipe,value_text:'TRYKKPRØVING AV RØR'}),'work');
 const queries=buildAhlsellRequirementGuide(pipe).searchQueries.join(' ');
 assert.match(queries,/sveising/);assert.match(queries,/316/);assert.match(queries,/DN100/);assert.doesNotMatch(queries,/rillet/);
});

test('known wrong joints and grades are rejected, missing evidence requires review',()=>{
 for(const name of ['Rustfritt stålrør 316 DN100 PN10 rillet','Rustfritt stålrør 304 DN100 PN10 sveist']){
  const [ranked]=rankAhlsellCandidates(pipe,[candidate(name)]);
  assert.equal(ahlsellCandidateMatchState(ranked),'mismatch',JSON.stringify(ranked.matchWarnings));
 }
 const [unknown]=rankAhlsellCandidates(pipe,[candidate('Rustfritt stålrør DN100 PN10 sveist')]);
 assert.equal(ahlsellCandidateMatchState(unknown),'review');
 assert.match(unknown.matchWarnings?.join(' ')??'',/materialkvalitet/);
 const [complete]=rankAhlsellCandidates(pipe,[candidate('Rustfritt stålrør 316 DN100 PN10 sveist')]);
 assert.ok(['exact','matched'].includes(ahlsellCandidateMatchState(complete)));
});

test('supplier evidence resolves missing grade and corrosion evidence while known conflicts remain',()=>{
 const req={...pipe,value_json:{...pipe.value_json,technicalSpecification:'Korrosivitetskategori C4'}};
 const local=rankAhlsellCandidates(req,[candidate('Rustfritt stålrør DN100 PN10 sveist')]);
 const fresh=candidate('Rustfritt stålrør 316 DN100 PN10 sveist C4');
 const resolved=complementMldlCandidates(req,local,[fresh]);
 assert.equal(resolved[0].matchWarnings?.length,0);
 const wrong=rankAhlsellCandidates(req,[candidate('Rustfritt stålrør 304 DN100 PN10 sveist')]);
 assert.equal(ahlsellCandidateMatchState(complementMldlCandidates(req,wrong,[fresh])[0]),'mismatch');
 const included={...pipe,value_json:{...pipe.value_json,technicalSpecification:'Alle sprinklerrør inkludert deler og skjøtemateriell'}};
 assert.equal(rankAhlsellCandidates(included,[fresh])[0].requiresAccessoryReview,true);
});

test('pipe, sprinkler head and flexible hose remain the main products when other parts are mentioned',()=>{
 const rigid={category:'sprinkler_hose',value_text:'Nye stålrør legges fra eksisterende rør til ny plassering av sprinklerslange og sprinkler. DN25 gjengede stålrør',value_json:{unit:'m',quantity:36,nsCode:'UB1.32114399932'}};
 assert.equal(ahlsellRequirementIntent(rigid),'pipe');
 const head={category:'sprinkler_head',value_text:'SPRINKLER',value_json:{quantity:90,unit:'st',attributes:{'godkjent trykk':'min 12 bar Prisen skal være inkludert sprinklerslange komplet med feste i himling'},technicalSpecification:'SPRINKLER\nPrisen skal være inkludert sprinklerslange komplet med feste i himling.'}};
 assert.equal(ahlsellRequirementIntent(head),'sprinkler_head');
 assert.ok(productAssemblyPlan(head)?.components.some(p=>p.kind==='sprinkler_hose'));
 const hose={category:'fitting',value_text:'INNENDØRS RØRLEDNING – RØRDEL',value_json:{attributes:{rørdel:'Fleksibel koblingsslange til sprinklerhoder'},technicalSpecification:'Fleksible slanger skal leveres med tilhørende festeanordning for himling'}};
 assert.equal(ahlsellRequirementIntent(hose),'sprinkler_hose');
 assert.ok(productAssemblyPlan(hose)?.components.some(p=>p.kind==='support'));
 assert.equal(isAssemblyComponentCandidate('sprinkler_hose','Sprinklerslange AH4 Vicflex'),true);
 assert.equal(isAssemblyComponentCandidate('sprinkler_hose','Skilt sprinklerslange'),false);
 assert.equal(isAssemblyComponentCandidate('support','Feste for sprinklerslange'),true);
 assert.equal(isAssemblyComponentCandidate('support','Sprinklerslange med feste'),false);
 assert.equal(isAssemblyComponentCandidate('sprinkler_hose','Feste sprinklerslange'),false);
});

test('accessories reject the wrong welded-pipe joint and the wrong valve flange size',()=>{
 const complete={...pipe,value_text:'DN100 komplett med deler bend og oppheng'};
 const bend=productAssemblyPlan(complete)!.components.find(c=>c.kind==='bend')!;
 const parts=assessAssemblyComponents(complete,bend,[candidate('Bend DN100 PN10 rillet'),{...candidate('Bend DN100 PN10 sveist'),articleNumber:'welded'}],candidate('Rustfritt stålrør 316 DN100 PN10 sveist'));
 assert.deepEqual(parts.map(p=>p.articleNumber),['welded']);
 const valve={value_text:'STENGEVENTIL med motflenser, bolter og pakninger',value_json:{attributes:{dimensjon:'DN65'}}};
 const flange=productAssemblyPlan(valve)!.components.find(c=>c.kind==='flange')!;
 const flanges=assessAssemblyComponents(valve,flange,[candidate('Motflens DN50 PN16'),{...candidate('Motflens DN65 PN16'),articleNumber:'dn65'}],candidate('Stengeventil DN65 PN16'));
 assert.deepEqual(flanges.map(p=>p.articleNumber),['dn65']);
 assert.equal(flanges[0].exactMatch,false);
});

test('ambiguous source materials and inferred post identity cannot produce a verified match',()=>{
 for(const extra of [{reviewFlags:['inferred-parent-context']},{reviewFlags:['inferred-post-number']},{reviewFlags:['missing-quantity']}]){
  const [ranked]=rankAhlsellCandidates({...pipe,value_json:{...pipe.value_json,...extra}},[candidate('Rustfritt stålrør 316 DN100 PN10 sveist')]);
  assert.equal(ahlsellCandidateMatchState(ranked),'review');
 }
 const conflicting={...pipe,value_json:{...pipe.value_json,attributes:{materiale:'Kobber forkrommet'},technicalSpecification:'b) Materialer\nLeveres som Alupex rør'}};
 assert.match(buildAhlsellRequirementGuide(conflicting).warnings.join(' '),/vilket materialkrav/);
});

test('enrichment selects the same page when a short post number repeats',()=>{
 const pages=[{pageNumber:1,method:'text',confidence:.98,text:'Kapittel: 33 Brannslokking - 3322 Ledningsnett\n1.1 DN25 stålrør\nLengde m 219'},
 {pageNumber:2,method:'text',confidence:.98,text:'Kapittel: 33 Brannslokking - 3324 Armatur\n1.1 KULEVENTIL\nAntall stk 12'}];
 const [enriched]=enrichProjectRequirements([{id:'valve',source_technical_description_document_id:'doc',source_page:2,value_text:'KULEVENTIL',value_json:{postNumber:'1.1'}}],[{id:'doc',source_pages:pages}]);
 assert.equal((enriched.value_json as Record<string,unknown>).quantity,12);
});

test('main products outrank served equipment, included valves and incidental attributes', () => {
 const cases = [
  ['Nøkkelbryter/Nøkkelboks For nytt sprinklerventil', 'key_switch'],
  ['Dreneringskar/utjevningskar Under sprinklerventiler med stengeventil', 'custom_fabrication'],
  ['Aktuator kjøleventil', 'valve_actuator'],
  ['Trykkvakt med stengeventil', 'pressure_switch'],
  ['Spjeldventil for vannmåler', 'butterfly_valve'],
  ['Kuleventil med tilbakeslagsventil', 'ball_valve']
 ] as const;
 for (const [description, intent] of cases) {
  const req = { category: 'valve', value_text: description, value_json: { attributes: { lokalisering: 'Ved vannmåler og sprinklerventil' } } };
  assert.equal(ahlsellRequirementIntent(req), intent, description);
 }
 const req = { category: 'pipe', value_text: 'Dimensjon: DN32', value_json: { unit: 'm', parentDescription: 'INNENDØRS VANNLEDNING – KOMPLETT', attributes: { materiale: 'Stålrør', lokalisering: 'Tilkobling til vannmåler' } } };
 assert.equal(ahlsellRequirementIntent(req), 'pipe');
 assert.equal(ahlsellRequirementIntent({value_text: 'Overgang fra PE til stål med flens'}), 'flange_adapter');
 assert.equal(ahlsellRequirementIntent({category: 'fitting', value_text: 'T-stykke DN65'}), 'tee');
 assert.equal(ahlsellRequirementIntent({category: 'fitting', value_text: 'Dimensjon: DN65', value_json: {unit: 'm', attributes: {rørdel: 'Bend 45 grader'}}}), 'bend');
});

test('named non-valve products cannot receive a green valve suggestion from a stale category', () => {
 for (const description of ['Nøkkelbryter/Nøkkelboks For nytt sprinklerventil', 'Dreneringskar med stengeventil', 'Aktuator radiatorventil', 'Ukjent utstyr']) {
  const [ranked] = rankAhlsellCandidates({category: 'valve', value_text: description}, [{...candidate('Spjeldventil DN65 PN16'), exactMatch: true}]);
  assert.ok(['review', 'mismatch'].includes(ahlsellCandidateMatchState(ranked)), description);
 }
});

test('valves check connection fields and explicit alternatives without silently relaxing the requirement', () => {
 const requirement = {category: 'valve', value_text: 'STENGEVENTIL DN65', value_json: {attributes: {'type tilkobling': 'Flens', trykk: 'PN16'}}};
 const [wrong] = rankAhlsellCandidates(requirement, [candidate('Spjeldventil DN65 PN16 rillet')]);
 assert.equal(ahlsellCandidateMatchState(wrong), 'mismatch');
 const alternative = {...requirement, value_json: {attributes: {'type tilkobling': 'Rille eller flens', trykk: 'PN16'}}};
 const [accepted] = rankAhlsellCandidates(alternative, [candidate('Spjeldventil DN65 PN16 flens')]);
 assert.ok(['exact', 'matched'].includes(ahlsellCandidateMatchState(accepted)), JSON.stringify(accepted.matchWarnings));
});

test('pipe material and fitting connection dimensions are hard requirements', () => {
 const [plastic] = rankAhlsellCandidates({category: 'pipe', value_text: 'Rør DN65', value_json: {unit: 'm', attributes: {materiale: 'PE100'}}}, [candidate('Stålrør DN65 rillet')]);
 assert.equal(ahlsellCandidateMatchState(plastic), 'mismatch');
 const [reducer] = rankAhlsellCandidates({category: 'fitting', value_text: 'Reduksjon DN100 x DN65'}, [candidate('Reduksjon DN100 x DN50')]);
 assert.equal(ahlsellCandidateMatchState(reducer), 'mismatch');
 const [unknown] = rankAhlsellCandidates({category: 'fitting', value_text: 'Reduksjon DN100 x DN65'}, [candidate('Reduksjon DN100')]);
 assert.equal(ahlsellCandidateMatchState(unknown), 'review');
 const [size] = rankAhlsellCandidates({category: 'pipe', value_text: 'Rør DN65'}, [candidate('60.3mm Stålrør rillet')]);
 assert.equal(ahlsellCandidateMatchState(size), 'mismatch');
});

test('an inherited exact flag and a high score cannot verify an incomplete sprinkler specification', () => {
 const req = {category: 'sprinkler_head', value_text: 'SPRINKLER', value_json: {attributes: {'k-faktor': '80', 'gjengedimensjon (dn)': '15'}}};
 const [ranked] = rankAhlsellCandidates(req, [{...candidate('Sprinklerhode K80 DN15 messing 68C QR pendent standard coverage'), exactMatch: true}]);
 assert.equal(ahlsellCandidateMatchState(ranked), 'review');
 assert.equal(ranked.exactMatch, false);
 assert.ok(findMldlOnlyCandidates(req).every(item => !['exact', 'matched'].includes(ahlsellCandidateMatchState(item))));
});

test('chapter equipment does not impose its dimensions or sprinkler properties on a pipe child', () => {
 const req = {category: 'pipe', value_text: 'Dimensjon: DN32', value_json: {
  postNumber: '332.2.2', parentPostNumber: '332.2', parentDescription: 'INNENDØRS VANNLEDNING – KOMPLETT', unit: 'm',
  attributes: {dimensjon: 'DN32', materiale: 'Stålrør', skjøt: 'Gjenget skjøt', trykk: 'PN10', anleggstype: 'Sprinklerventil DN150 og vannmåler DN100'},
  attributeSources: {anleggstype: {postNumber: '332', sourcePage: 1}},
  technicalSpecification: '332 Generelle krav\nSprinkler K115 DN20 93C.\n\nUNDERPOST\n332.2 INNENDØRS VANNLEDNING – KOMPLETT\nMateriale: Stålrør\nSkjøt: Gjenget skjøt\n\nUNDERPOST\n332.2.2 Dimensjon: DN32'
 }};
 const [good] = rankAhlsellCandidates(req, [candidate('Stålrør DN32 PN10 gjenget')]);
 assert.ok(['exact','matched'].includes(ahlsellCandidateMatchState(good)), JSON.stringify(good.matchWarnings));
 const [wrong] = rankAhlsellCandidates(req, [candidate('Stålrør DN32 PN10 rillet')]);
 assert.equal(ahlsellCandidateMatchState(wrong), 'mismatch');
 assert.equal(ahlsellRequirementIntent(req), 'pipe');
});

test('existing rows recover a uniquely identified post without overwriting a saved correction', () => {
 const pages = [{pageNumber: 5, method: 'text', confidence: .98, text: '33 Brannslokking\nB2.30.33.\n332.2\nUB1.1199999932A\nINNENDØRS VANNLEDNING – KOMPLETT\nMateriale: Stålrør\nSkjøt: Gjenget skjøt\nB2.30.33.\n332.2.2\nDimensjon: DN32\nm 5,00'}];
 const stored = {id: 'stored-row', source_technical_description_document_id: 'doc', source_page: 5, category: 'unknown', value_text: 'Dimensjon: DN32',
  value_json: {postNumber: 'B3.30.7332.2.2', nsCode: 'B2.30.33.', quantity: 5, unit: 'm', reviewFlags: ['unknown-category', 'inferred-post-number'], attributes: {dimensjon: 'DN32'}}};
 const [enriched] = enrichProjectRequirements([stored], [{id: 'doc', source_pages: pages}]);
 const value = enriched.value_json as Record<string, unknown>;
 assert.equal(value.postNumber, 'B2.30.33.332.2.2');
 assert.equal(value.nsCode, 'UB1.1199999932A');
 assert.deepEqual(value.reviewFlags, []);
 assert.equal((value.attributes as Record<string, string>).materiale, 'Stålrør');
 const [corrected] = enrichProjectRequirements([{...stored, value_json: {...stored.value_json, attributes: {dimensjon: 'DN40'}}}], [{id: 'doc', source_pages: pages}]);
 const correctedValue = corrected.value_json as Record<string, unknown>;
 assert.equal((correctedValue.attributes as Record<string, string>).dimensjon, 'DN40');
 assert.ok((correctedValue.reviewFlags as string[]).includes('reextracted-requirement-conflict'));
 assert.equal((correctedValue.attributeSources as Record<string, unknown>).dimensjon, undefined);
});

test('a sign cannot borrow head properties from its description to become a sprinkler match', () => {
 const req = {category: 'sprinkler_head', value_text: 'SPRINKLER', value_json: {attributes: {sprinkleranlegg: 'Våtanlegg', 'type sprinkler': 'Spraysprinkler', 'k-faktor': '80', 'gjengedimensjon (dn)': '15', følsomhetsgrad: 'Kvikk respons', utløsningstemperatur: '68C', plassering: 'Hengende'}}};
 const [wrong] = rankAhlsellCandidates(req, [{...candidate('Skilt sprinklerhode'), description: 'Sprinklerhode K80 DN15 QR 68C pendent standard coverage messing', exactMatch: true}]);
 assert.equal(ahlsellCandidateMatchState(wrong), 'mismatch');
});
