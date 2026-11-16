import assert from 'node:assert/strict';
import test from 'node:test';
import { compareDocumentRequirements, deliveryBlockers, deliveryExportNotes, initialDeliveryReview, parseDeliveryReview, quantityCalculationTotal, requirementReferences } from './project-delivery';
import { electricalOfferCompatible, supplierArticleIdentity } from './supplier-article-identity';
const row=(id:string,post:string,text:string,quantity=1,doc='doc',scope='A')=>({id,status:'extracted_unreviewed',value_text:text,source_technical_description_document_id:doc,source_document_id:doc,source_page:2,value_json:{postNumber:post,postScope:scope,sourceText:text,quantity,unit:'st',attributes:{}}});
test('delivery tracks named pump components and does not guess quantities',()=>{
 const review=initialDeliveryReview(row('a','31.1','Pumpe med geiderrør og koblingsfot, styreskap'));
 assert.equal(review.components.length,3); assert.equal(review.calculations.length,0); assert.equal(deliveryBlockers(review).length,3);
 review.components=review.components.map(p=>({...p,status:'included',note:'Tillverkarens paketlista, sida 2'}));
 assert.deepEqual(deliveryBlockers(review),[]);assert.ok(parseDeliveryReview(review));
 review.deviations.push({id:'d',description:'700 mm i stället för 1000 mm',owner:'Elansvarig',decision:'open',reason:''});
 assert.equal(deliveryBlockers(review).length,1);
});
test('separate components require an actually selected accessory',()=>{
 const review=initialDeliveryReview(row('a','1','Geiderrør'));
 review.components[0]={...review.components[0],status:'separate',productNumber:'N99274384'};
 assert.equal(deliveryBlockers(review).length,1);assert.equal(deliveryBlockers(review,['N99274384']).length,0);
});
test('explicit post quantities produce 75m, 100 and 50 parts, and require review',()=>{
 const review=initialDeliveryReview(row('a','40.413.9','Jordingsmateriell',50));
 review.calculations=[1.5,2,1].map((factor,i)=>({id:String(i),target:String(i),base:50,baseUnit:'punkter',factor,unit:i===0?'m':'st',source:'Kravpost 40.413.9',reviewed:false}));
 assert.deepEqual(review.calculations.map(quantityCalculationTotal),[75,100,50]);assert.equal(deliveryBlockers(review).length,3);
 assert.equal(quantityCalculationTotal({...review.calculations[0],factor:Infinity}),null);
 assert.equal(parseDeliveryReview({...review,calculations:[{...review.calculations[0],base:-1}]}),null);
});
test('revision comparison identifies changed quantities, new, removed, duplicate and unchanged posts',()=>{
 const before=[row('a','1.1','Rör',20),row('b','1.2','Ventil'),row('c','1.3','Info'),row('d','1.5','Duplicate')];
 const after=[row('e','1.1','Rör',25),row('f','1.3','Info'),row('g','1.4','Ny'),row('h','1.5','Duplicate'),row('i','1.5','Duplicate')];
 assert.deepEqual(compareDocumentRequirements(before,after).map(d=>d.kind),['changed','removed','unchanged','ambiguous','added']);
});
test('references trace original pages, respect scopes and flag attribute disagreements',()=>{
 const child=row('a','30.332.7.1','Se post 30.300.1');child.value_json.attributes={material:'stål'};
 const parent=row('b','30.332.7','Huvudkrav');parent.value_json.attributes={material:'koppar'};
 const refs=requirementReferences(child,[parent,row('c','30.300.1','Generellt')]);
 assert.equal(refs.find(r=>r.post==='30.332.7')?.conflicts.length,1);
 assert.equal(refs.find(r=>r.post==='30.300.1')?.kind,'reference');
 assert.equal(refs.find(r=>r.post==='30.300.1')?.page,2);
 assert.equal(requirementReferences(child,[parent,{...parent,id:'duplicate'}]).find(r=>r.post==='30.332.7')?.state,'ambiguous');
});
test('article identities preserve supplier prefixes and do not turn vendor names into article codes',()=>{
 assert.notEqual(supplierArticleIdentity('N99274384')?.key,supplierArticleIdentity('99274384')?.key);
 assert.equal(supplierArticleIdentity('CORINOR','supplier'),null);
 assert.equal(supplierArticleIdentity('2251021N5')?.number,'2251021N5');
 assert.equal(supplierArticleIdentity('40160023','el')?.kind,'el');
 assert.equal(supplierArticleIdentity('40160023','nrf'),null);
 assert.equal(supplierArticleIdentity('ABC/25-2','supplier')?.number,'ABC/25-2');
});
test('electrical matching rejects stated voltage, IP and pole conflicts but not missing facts',()=>{
 assert.equal(electricalOfferCompatible('IP65 24V DC','IP44 24V DC'),false);
 assert.equal(electricalOfferCompatible('230V AC','24V DC'),false);
 assert.equal(electricalOfferCompatible('3 pol','2 pol'),false);
 assert.equal(electricalOfferCompatible('IP44','IP65'),true);
 assert.equal(electricalOfferCompatible('IP65','Kabel'),true);
});
test('exports disclose open deviations and stale review without adding alternative quantities',()=>{
 const review=initialDeliveryReview(row('a','1','Ventil'));
 review.state='ready';review.alternatives=[{id:'alt',name:'Alternativ',productNumber:'9999999',reason:'Annan variant'}];
 review.deviations=[{id:'dev',description:'Isolering saknas',owner:'VVS',decision:'open',reason:''}];
 const note=deliveryExportNotes(review,true);
 assert.match(note,/behöver göras om/);assert.match(note,/Inväntar beslut/);assert.match(note,/räknas inte/);
 assert.doesNotMatch(note,/9999999/);
});
