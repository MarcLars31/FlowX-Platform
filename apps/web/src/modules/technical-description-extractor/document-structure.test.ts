import assert from 'node:assert/strict';
import test from 'node:test';
import { extractTechnicalDescriptionFromPages } from './extractor';
import { buildPdfDocumentStructure, type PdfDocumentNode } from './document-structure';
import type { TechnicalDescriptionPage } from './types';
import { withEffectiveRequirements } from '@/lib/effective-requirements';
import { projectRequirementDetails } from '@/lib/project-requirement-details';
const page = (pageNumber: number, text: string): TechnicalDescriptionPage => ({ pageNumber, text, method: 'text', confidence: .98 });

const drainageParent = `02.30.311.\tUB2.1141211111A
3\tINNENDØRS AVLØPSLEDNING – TRYKKLØS –
KOMPLETT
Formål: Spillvannsledning
Materiale: PVC-HI
Plassering: I grunnen
Montasje: Som bunnledning
Skjøt: Muffeskjøt
Lokalisering: Se tegning
Pakningstype: Fastsittende pakning
Trykk: SN 8
Dimensjon: Se underpost
Materialkvalitet: SDR 17
Andre krav:
a) Omfang og prisgrunnlag
Posten omfatter komplett leverasne av bunnledning for
spillvann.
Rør inklusiv deler.
c) Utførelse
Oppstikk utføres med to 45° bend.
Alle oppstikk skal avsluttes 1 meter over FG og terses.`;

test('neutral document structure retains chapters, parent text and all disciplines without product classification', () => {
 const pages = [
  page(7, '02 Bygg 09 Aquahall\n02.30 VVS-installasjoner\n02.30.311Bunnledninger for sanitærinstallasjoner\nGenerelle krav til bunnledninger.\nSum denne side:'),
  page(9, `${drainageParent}\n02.30.311.\t75 mm\n3.1\nLengde m 40\nSum denne side:`),
  page(10, '02.30.311.\n3.2\n110 mm\nLengde m 530\nMateriale: PP\n02.30.311.\n3.3\n160 mm\nLengde m 160\nSum denne side:'),
  page(11, '02.40 Elkraft\n02.40.1 KABELSTIGE\nLengde m 12\nMateriale: Stål\nSum denne side:'),
  page(12, 'En side uten nummererte poster beholdes som originaltekst.')
 ];
 const structure = buildPdfDocumentStructure(pages, 'Aquahall.pdf');
 const flatten = (nodes: PdfDocumentNode[]): PdfDocumentNode[] => nodes.flatMap(node => [node, ...flatten(node.children)]);
 const nodes = flatten(structure.chapters);
 const parent = nodes.find(node => node.number === '02.30.311.3')!;
 assert.equal(structure.chapters[0].number, '02');
 assert.equal(nodes.find(node => node.number === '02.30.311')?.kind, 'chapter');
 assert.equal(parent.quantity, undefined);
 assert.deepEqual(parent.children.map(node => [node.number, node.quantity, node.unit]), [
  ['02.30.311.3.1', 40, 'm'], ['02.30.311.3.2', 530, 'm'], ['02.30.311.3.3', 160, 'm']
 ]);
 assert.deepEqual(parent.children.map(node => node.effectiveAttributes.materiale), ['PVC-HI', 'PP', 'PVC-HI']);
 assert.deepEqual(parent.children.map(node => node.effectiveAttributes.dimensjon), ['75 mm', '110 mm', '160 mm']);
 for (const child of parent.children) {
  assert.match(child.specification, /Oppstikk utføres med to 45° bend/);
  assert.equal(child.code, 'UB2.1141211111A');
  assert.doesNotMatch(child.text, /PVC-HI/);
  assert.equal('category' in child, false);
  assert.equal('system' in child, false);
 }
 const cable = nodes.find(node => node.number === '02.40.1')!;
 assert.equal(cable.quantity, 12);
 assert.doesNotMatch(cable.specification, /PVC-HI|45° bend/);
 assert.deepEqual(structure.pages, pages);
});

test('neutral document structure keeps repeated local post numbers separate between chapters', () => {
 const structure = buildPdfDocumentStructure([
  page(1, 'Kapittel: 31 Sanitær\n1 UB2.1141211111A\nAVLØPSLEDNING\nMateriale: PVC-HI\n1.1 75 mm\nLengde m 40\nSum:'),
  page(2, 'Kapittel: 40 Elkraft\n1 KABELSTIGE\nMateriale: Stål\n1.1 100 mm\nLengde m 5\nSum:')
 ]);
 assert.equal(structure.chapters.length, 2);
 assert.deepEqual(structure.chapters.map(node => [node.number, node.title]), [['31', 'Sanitær'], ['40', 'Elkraft']]);
 assert.deepEqual(structure.chapters.map(node => node.children[0].children[0].effectiveAttributes.materiale), ['PVC-HI', 'Stål']);
 assert.doesNotMatch(structure.chapters[1].children[0].children[0].specification, /PVC-HI/);
});

test('Aquahall drainage subposts inherit the complete parent while keeping their own lengths and millimetres', () => {
 const result = extractTechnicalDescriptionFromPages([page(9, `${drainageParent}
02.30.311.\t75 mm
3.1
Lengde m 40,00 0,00 0,00
02.30.311.\t110 mm
3.2
Lengde m 530,00 0,00 0,00
02.30.311.\t160 mm
3.3
Lengde m 160,00 0,00 0,00
Sum denne side: 0,00`)]);
 assert.deepEqual(result.materialLines.filter(line => line.quantity !== undefined).map(line => [line.postNumber, line.description, line.quantity, line.unit]), [
  ['02.30.311.3.1', '75 mm', 40, 'm'],
  ['02.30.311.3.2', '110 mm', 530, 'm'],
  ['02.30.311.3.3', '160 mm', 160, 'm']
 ]);
 for (const line of result.materialLines.filter(line => line.quantity !== undefined)) {
  assert.equal(line.parentPostNumber, '02.30.311.3');
  assert.equal(line.parentDescription, 'INNENDØRS AVLØPSLEDNING – TRYKKLØS – KOMPLETT');
  assert.equal(line.nsCode, 'UB2.1141211111A');
  assert.equal(line.category, 'pipe');
  assert.equal(line.attributes.materiale, 'PVC-HI');
  assert.equal(line.attributes.trykk, 'SN 8');
  assert.equal(line.attributes.materialkvalitet, 'SDR 17');
  assert.equal(line.attributes.dimensjon, line.description);
  assert.deepEqual(line.attributeSources?.materiale, { postNumber: '02.30.311.3', sourcePage: 9 });
  assert.deepEqual(line.attributeSources?.dimensjon, { postNumber: line.postNumber, sourcePage: 9 });
  assert.match(line.technicalSpecification!, /Rør inklusiv deler/);
  assert.match(line.technicalSpecification!, /Oppstikk utføres med to 45° bend/);
  assert.match(line.technicalSpecification!, /1 meter over FG og terses/);
  assert.doesNotMatch(line.sourceText, /PVC-HI/);
  const saved = { id: line.id, value_text: line.description, source_page: line.sourcePage, source_excerpt: line.sourceText, value_json: line };
  const reopened = withEffectiveRequirements(withEffectiveRequirements(saved));
  const details = projectRequirementDetails(reopened);
  assert.match(details.inheritedSpecification!, /Rør inklusiv deler/);
  assert.match(details.inheritedSpecification!, /Oppstikk utføres med to 45° bend/);
  assert.match(details.inheritedSpecification!, /Plassering: I grunnen/);
  assert.doesNotMatch(details.inheritedSpecification!, /Lengde m (?:40|530|160)/);
  assert.equal(reopened.value_json.quantity, line.quantity);
  assert.equal(reopened.value_json.attributes.dimensjon, line.description);
 }
 assert.equal(result.pageChecks?.[0].observedQuantityRows, 3);
 assert.equal(result.pageChecks?.[0].unresolvedQuantityRows, 0);
});

test('non-sprinkler subposts on later pages inherit only their numbered parent and keep explicit overrides', () => {
 const result = extractTechnicalDescriptionFromPages([
  page(9, `${drainageParent}\nSum denne side:`),
  page(10, '02.30.311.\n3.1\n75 mm\nLengde m 40\nMateriale: PP\nSum denne side:'),
  page(11, '02.30.311.\n3.2\n110 mm\nLengde m 530\n02.30.311.4 UC1.3121151\nSTENGEVENTIL\nAntall stk 2\nMateriale: Messing\nSum denne side:')
 ]);
 const children = result.materialLines.filter(line => line.parentPostNumber === '02.30.311.3');
 assert.equal(children.length, 2);
 assert.deepEqual(children.map(line => line.attributes.materiale), ['PP', 'PVC-HI']);
 assert.deepEqual(children.map(line => line.attributes.dimensjon), ['75 mm', '110 mm']);
 assert.match(children[1].technicalSpecification!, /1 meter over FG/);
 assert.doesNotMatch(children[1].technicalSpecification!, /Materiale: PP/);
 const valve = result.materialLines.find(line => line.postNumber === '02.30.311.4')!;
 assert.equal(valve.parentPostNumber, undefined);
 assert.doesNotMatch(valve.technicalSpecification!, /PVC-HI|45° bend/);
});
