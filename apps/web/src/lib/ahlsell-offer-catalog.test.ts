import assert from 'node:assert/strict';
import test from 'node:test';
import {findAhlsellOfferCandidates, withAhlsellOfferCandidates, parseAhlsellOfferCatalog, offerCatalogObjectPath, offerVariantCompatible, OFFER_REVIEW_WARNING, type AhlsellOfferCatalog} from './ahlsell-offer-catalog';
import {readAhlsellOfferCatalog} from './ahlsell-offer-storage';
import {ahlsellCandidateMatchState} from './ahlsell-candidate-ranking';
import {findAhlsellHybridCandidates} from './ahlsell-hybrid-matching';
const org='11111111-1111-4111-8111-111111111111';
const catalog: AhlsellOfferCatalog={schemaVersion:1,organizationId:org,version:'sha256:'+'a'.repeat(64),products:[
 {articleNumber:'9999991',productName:'Rustfritt stålrør 316 DN100 PN16 sveist',discipline:'vvs',reviewFlags:['historical_offer']},
 {articleNumber:'9999991N5',productName:'Rustfritt stålrør 304 DN100 PN16 rillet',discipline:'vvs',reviewFlags:['historical_offer']},
 {articleNumber:'9999992',productName:'Rustfritt stålrør 316 DN50 PN16 sveist',discipline:'vvs',reviewFlags:['historical_offer']}
]};
const requirement={id:'pipe',category:'pipe',value_text:'Rustfritt stålrør DN100',value_json:{quantity:12,unit:'m',nsCode:'UB1.1',attributes:{dimensjon:'DN100',trykk:'PN16',materiale:'Rustfritt stål 316',skjøt:'Sveiseskjøt'}}};
test('catalog parsing validates tenant, rejects duplicates and strips private/commercial fields',()=>{
 assert.equal(parseAhlsellOfferCatalog(catalog,'22222222-2222-4222-8222-222222222222'),null);
 assert.equal(parseAhlsellOfferCatalog({...catalog,products:[catalog.products[0],catalog.products[0]]},org),null);
 const parsed=parseAhlsellOfferCatalog({...catalog,products:[{...catalog.products[0],price:123,sources:[{file:'customer.pdf'}],post:'30.1'}]},org)!;
 assert.equal(JSON.stringify(parsed).includes('customer'),false);assert.equal(JSON.stringify(parsed).includes('price'),false);
 assert.throws(()=>offerCatalogObjectPath('../other-tenant'));
 assert.equal(parseAhlsellOfferCatalog({...catalog,products:[{...catalog.products[0],productName:null}]},org),null);
});
test('matching is technical and independent of filename or post; wrong grade/joint/DN are excluded',()=>{
 const found=findAhlsellOfferCandidates(requirement,catalog);
 assert.deepEqual(found.map(c=>c.articleNumber),['9999991']);
 assert.equal(ahlsellCandidateMatchState(found[0]),'review');
 assert.ok(found[0].matchWarnings?.includes(OFFER_REVIEW_WARNING));
 const other={...requirement,value_json:{...requirement.value_json,postNumber:'99.999.99',fileName:'different.pdf'}};
 assert.deepEqual(findAhlsellOfferCandidates(other,catalog),found);
});
test('information/work and a different discipline do not receive offer products',()=>{
 assert.deepEqual(findAhlsellOfferCandidates({...requirement,value_text:'Orientering',value_json:{unit:'RS'}},catalog),[]);
 assert.deepEqual(findAhlsellOfferCandidates({...requirement,value_text:'Kabel',value_json:{quantity:1,unit:'m',nsCode:'WJ2.2'}},catalog),[]);
});
test('imported rows never replace an independently assessed product',()=>{
 const original={...findAhlsellOfferCandidates(requirement,catalog)[0],productName:'Verified current description',source:'public_verified' as const,matchWarnings:[],exactMatch:true};
 assert.deepEqual(withAhlsellOfferCandidates(requirement,[original],catalog),[original]);
});
test('offer identity suffixes remain distinct and historic rows cannot become green',()=>{
 assert.equal(parseAhlsellOfferCatalog(catalog,org)?.products.length,3);
 assert.equal(ahlsellCandidateMatchState({...findAhlsellOfferCandidates(requirement,catalog)[0],matchWarnings:[],exactMatch:true,recommendation:'recommended'}),'review');
});
test('storage is scoped to authenticated organization and malformed/mis-scoped data fails closed',async()=>{
 let requested='';
 const load=async(body:unknown,status=200)=>readAhlsellOfferCatalog({url:'https://example.invalid',key:'server-key'},org,async url=>{requested=String(url);return Response.json(body,{status});});
 assert.equal((await load(catalog)).catalog?.products.length,3);
 assert.ok(requested.endsWith(`/organization-offer-catalog/v1/${org}/catalog.json`));
 assert.equal((await load({...catalog,organizationId:'other'})).status,'unavailable');
 assert.equal((await load({},404)).status,'empty');
 assert.equal((await load({},403)).status,'unavailable');
 assert.equal((await load('x'.repeat(6_000_001))).status,'unavailable');
});
test('production hybrid search includes private offer candidates when public search is unavailable',async()=>{
 const result=await findAhlsellHybridCandidates(requirement,async()=>{throw Error('offline');},undefined,catalog);
 const article=result.candidates.find(c=>c.articleNumber==='9999991');
 assert.ok(article);assert.equal(ahlsellCandidateMatchState(article),'review');
 assert.ok(!result.candidates.some(c=>c.articleNumber==='9999992'));
});
test('cables must retain conductor count, cross-section and named family; tools are not cables',()=>{
 const req={value_text:'IFSI 4x25mm² Cu',value_json:{nsCode:'WJ2.21399A'}};
 assert.equal(offerVariantCompatible(req,'IFSI 1kV 4x25/16'),true);
 for(const name of ['IFSI 1kV 4x16/16','IFSI 2x25/16','BFSI 4x25/16','Avmantlingsverktøy TP Kabel','Klammer for IFSI 4x25']) assert.equal(offerVariantCompatible(req,name),false,name);
});
test('production filtering retains the explicitly required electrical function',async()=>{
 const req={id:'ground',category:'fitting',value_text:'JORDINGSMATERIELL',value_json:{quantity:4,unit:'stk',nsCode:'WC1.13110A',attributes:{funksjon:'Jordskinne'}}};
 const input={...catalog,products:[{articleNumber:'1701457',productName:'Jordskinne SEB 11 10x50',discipline:'electrical' as const,reviewFlags:['historical_offer']}]};
 const result=await findAhlsellHybridCandidates(req,async()=>{throw Error('offline');},undefined,input);
 assert.equal(result.candidates[0]?.articleNumber,'1701457');
 assert.equal(ahlsellCandidateMatchState(result.candidates[0]),'review');
});
