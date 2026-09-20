import assert from 'node:assert/strict';
import test from 'node:test';
import {extractTechnicalDescriptionFromPages} from './extractor';
import type {TechnicalDescriptionPage} from './types';

const page=(pageNumber:number,text:string,method:'text'|'ocr'='text'):TechnicalDescriptionPage=>({pageNumber,text,method,confidence:.98});

test('quantity-first single-number posts and lump sums are separate rows without double counting RS',()=>{
 const result=extractTechnicalDescriptionFromPages([page(1,'Kapittel: 33 Brannslokking\nstk 2 5 Trykkvakt med stengeventil\nstk 1 6 Nøkkelbryter\nstk 3 7 Nøkkelbryter\nRS 4.1 Ferdigbefaring\nx) Mengderegler\nRund sum\nRS 4.2 Overtakelsesforretning\nx) Mengderegler\nRund sum')]);
 assert.deepEqual(result.materialLines.map(l=>[l.postNumber,l.quantity,l.unit]),[['4.1',1,'RS'],['4.2',1,'RS'],['5',2,'st'],['6',1,'st'],['7',3,'st']]);
 assert.equal(result.pageChecks?.[0].observedQuantityRows,5);
 assert.equal(result.pageChecks?.[0].unresolvedQuantityRows,0);
});

test('a referenced post is not invented as the identity of a row with unreadable post number',()=>{
 const result=extractTechnicalDescriptionFromPages([page(1,'33 Brannslokking\nGLYKOLLÅS\nGlykollås bygges opp som beskrevet under post\nD1.31.332.3323.5.\nDimensjon: DN40\nKontrollventilsett komplett som beskrevet. RS','ocr')]);
 assert.equal(result.materialLines.length,0);
 assert.equal(result.pageChecks?.[0].unresolvedQuantityRows,1);
 assert.ok(result.warnings.some(w=>w.code==='UNRESOLVED_QUANTITY_ROWS'));
});

test('same short post numbers in separate chapters retain their own quantities and NS codes',()=>{
 const result=extractTechnicalDescriptionFromPages([
  page(1,'Kapittel: 30 VVS - 31 Sanitær - 314 Armatur\n1 UC1.3121191A\nINNENDØRS STENGEVENTIL\n1.1 DN25\nAntall stk 3\nSprinkler'),
  page(2,'Kapittel: 30 VVS - 33 Brannslokking - 3322 Ledningsnett\n1 UB1.1194300932A\nINNENDØRS VANNLEDNING – KOMPLETT\nMateriale: Stål\nSkjøt: Gjenget skjøt\n1.1 DN25\nLengde m 219'),
  page(3,'Kapittel: 30 VVS - 33 Brannslokking - 3324 Armatur\n1.1 Ventil DN100\nAntall stk 9')
 ]);
 assert.deepEqual(result.materialLines.map(l=>[l.postNumber,l.quantity,l.nsCode]),[['1.1',3,'UC1.3121191A'],['1.1',219,'UB1.1194300932A'],['1.1',9,undefined]]);
 assert.equal(new Set(result.materialLines.map(l=>l.postScope)).size,3);
});

test('preserves D1 and B1 prefixes and recognizes their children instead of NS codes',()=>{
 const result=extractTechnicalDescriptionFromPages([
  page(1,'33 Brannslokking\nD1.3.33.332.3322.8| UE2.11199612A\nSPRINKLER\nAntall stk 592\nK-faktor: 80','ocr'),
  page(2,'33 Brannslokking\nD1.3.33.332.3322.4| UC1.5133105A\nINNENDØRS STENGEVENTIL\nSkjøt: Flenseskjøt\nD1.3.33.332.3322.4| Dimensjon: DN65\n.1 stk 1','ocr'),
  page(3,'33 Brannslokking\nB1.30.33.\n332.10\nUB1.1199999914A\nINNENDØRS VANNLEDNING – KOMPLETT\nMateriale: Rustfritt stål 316\nB1.30.33.\n332.10.2\nDimensjon: DN100\nm 330,00')
 ]);
 assert.ok(result.materialLines.some(l=>l.postNumber==='D1.3.33.332.3322.8'&&l.quantity===592&&l.nsCode==='UE2.11199612A'));
 assert.ok(result.materialLines.some(l=>l.postNumber==='D1.3.33.332.3322.4.1'&&l.quantity===1));
 assert.ok(result.materialLines.some(l=>l.postNumber==='B1.30.33.332.10.2'&&l.quantity===330&&l.attributes.materiale==='Rustfritt stål 316'));
 assert.equal(result.materialLines.length,3);
});

test('joins numeric wrapped columns without duplicating quantities through the fallback reader',()=>{
 const result=extractTechnicalDescriptionFromPages([page(1,'Kapittel: 33 Brannslokking\n33.332.33 | UE2.11112512\n25.1 SPRINKLER\nAntall stk 145 0,00 0,00\nK-faktor: 80\n33.332.33 | UE2.11112512\n25.2 SPRINKLER\nAntall stk 5 0,00 0,00\nK-faktor: 80','ocr')]);
 assert.deepEqual(result.materialLines.map(l=>[l.postNumber,l.quantity]),[['33.332.3325.1',145],['33.332.3325.2',5]]);
});

test('Alginor wrapped B2 numbers retain their identity and inherit the threaded pipe specification', () => {
 const result = extractTechnicalDescriptionFromPages([page(5, `B2.30.33.
332.2
UB1.1199999932A
INNENDØRS VANNLEDNING – KOMPLETT
Meter RS
Type vannledning: Vann for brannslukking
Materiale: Stålrør
Skjøt: Gjenget skjøt
Trykk: PN 10
Dimensjon: Iht. underposter
B2.30.33.
332.2.1
Dimensjon: DN25
m 200,00
B2.30.33.
332.2.2
Dimensjon: DN32
m 5,00
Kapittel: B2 Byggetrinn 2 B3A Admin`), page(6, `B2.30.33.
332.2.3
Dimensjon: DN40
m 10,00
Kapittel: B2 Byggetrinn 2 B3A Admin
Brannslokking`), page(7, `B3.30.7 Ventil sprinkler
Antall stk 1
Kapittel: B3 Byggetrinn 3`)]);
 const pipes = result.materialLines.filter(line => line.unit === 'm');
 assert.deepEqual(pipes.map(line => line.postNumber), ['B2.30.33.332.2.1', 'B2.30.33.332.2.2', 'B2.30.33.332.2.3']);
 for (const line of pipes) {
  assert.equal(line.nsCode, 'UB1.1199999932A');
  assert.equal(line.parentPostNumber, 'B2.30.33.332.2');
  assert.equal(line.category, 'pipe');
  assert.equal(line.attributes.materiale, 'Stålrør');
  assert.equal(line.attributes['skjøt'], 'Gjenget skjøt');
  assert.equal(line.attributes.trykk, 'PN 10');
  assert.deepEqual(line.attributeSources?.materiale, {postNumber: 'B2.30.33.332.2', sourcePage: 5});
  assert.deepEqual(line.attributeSources?.dimensjon, {postNumber: line.postNumber, sourcePage: line.sourcePage});
  assert.equal(line.reviewFlags.includes('inferred-post-number'), false);
 }
});

test('a dimension-only row with no recoverable parent remains explicitly incomplete', () => {
 const result = extractTechnicalDescriptionFromPages([page(1, '33 Brannslokking\nB2.30.33.\n332.2.2\nDimensjon: DN32\nm 5,00')]);
 assert.equal(result.materialLines[0].postNumber, 'B2.30.33.332.2.2');
 assert.ok(result.materialLines[0].reviewFlags.includes('missing-parent-context'));
});

test('a general chapter is not a verified parent for a dimension-only child with inconsistent numbering', () => {
 const result = extractTechnicalDescriptionFromPages([page(1, '33 Brannslokking\n332 Installasjon for brannslokking med sprinkler\nORIENTERING OM INSTALLASJON\nFareklasse:\nOH1 - Kontor og adm\n332.31 UB1.1199999932A\nINNENDØRS VANNLEDNING – KOMPLETT\nMateriale: Stålrør\nSkjøt: Gjenget skjøt\n332.32.1 Dimensjon: DN25\nm 120')]);
 const line = result.materialLines.find(line => line.postNumber === '332.32.1')!;
 assert.equal(line.category, 'pipe');
 assert.ok(line.reviewFlags.includes('missing-parent-context'));
  assert.equal(line.attributes.materiale, undefined);
  assert.equal(line.nsCode, undefined);
});
