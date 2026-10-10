import { currentPostRequirement } from "./current-post-requirement";
import { projectRequirementDetails } from "./project-requirement-details";
import { buildAhlsellRequirementGuide } from "./ahlsell-public-match";
import { extractTechnicalDescriptionFromPages } from "../modules/technical-description-extractor/extractor";
import assert from "node:assert/strict";
import test from "node:test";
import { loadEffectiveRequirement } from "./effective-requirements.server";
import { requirementSnapshot } from "./requirement-snapshot";
import { withEffectiveRequirements } from "./effective-requirements";
import type { selectUserRows } from "./supabase-user-rest";

test("card, search and saving use only the saved current post without reading PDFs", async () => {
  const row = { id: "r", project_id: "p", organization_id: "o", source_technical_description_document_id: "doc", source_page: 1,
    value_text: "STÅLRØR", updated_at: "2026-10-07", value_json: { postNumber: "33.1.1", attributes: { dimensjon: "DN25", materiale: "Stål" },
      attributeSources: { materiale: { postNumber: "33.1", sourcePage: 1 } } } };
  const parameters = { arbeidstrykk: "12 bar" };
  const readRows = (async (table: string, filters: Record<string, string>) => {
    assert.equal(filters.organization_id, "eq.o");
    assert.equal(table === "projects" ? filters.id : filters.project_id, "eq.p");
    assert.equal(filters.deleted_at, "is.null");
    if (table === "projects") return [{ id: "p", technical_parameters: parameters }];
    assert.equal(table, "project_requirements", "No PDF reads or re-extraction on a product lookup");
    assert.equal(filters.id, "eq.r");
    return [row];
  }) as typeof selectUserRows;
  const card = withEffectiveRequirements(requirementSnapshot(row));
  assert.deepEqual((await loadEffectiveRequirement("p", "r", "o", readRows))?.effectiveRequirements, card.effectiveRequirements);
  assert.ok(!card.effectiveRequirements.requirements.some(item => item.source.kind === "parent"));
  assert.ok(!card.effectiveRequirements.requirements.some(item => item.source.kind === "project"));
  const denied = (async (table: string) => table === "project_requirements" ? [row] : []) as typeof selectUserRows;
  assert.equal(await loadEffectiveRequirement("p", "r", "different-org", denied), null);
});

test("saved post corrections invalidate an earlier evaluation while project defaults stay outside the post", async () => {
  let pressure = "12 bar";
  let material = "Aluminium";
  const readRows = (async (table: string) => table === "projects" ? [{ id: "p", technical_parameters: { arbeidstrykk: pressure } }]
    : [{ id: "r", value_json: { attributes: { materiale: material }, technicalSpecification: "Reviewed specification" } }]) as typeof selectUserRows;
  const first = await loadEffectiveRequirement("p", "r", "o", readRows);
  pressure = "16 bar";
  const second = await loadEffectiveRequirement("p", "r", "o", readRows);
  assert.equal(first?.effectiveRequirements.revision, second?.effectiveRequirements.revision);
  material = "Stål";
  const corrected = await loadEffectiveRequirement("p", "r", "o", readRows);
  assert.notEqual(corrected?.effectiveRequirements.revision, first?.effectiveRequirements.revision);
  assert.equal((second?.value_json as { attributes: { materiale: string } }).attributes.materiale, "Aluminium");
});

const sprinklerPost = [
  '33.332.4.1 UE2.11111312', 'SPRINKLER', 'Antall stk 5',
  'Sprinkleranlegg: Våtanlegg', 'Type sprinkler: Konvensjonell sprinkler',
  'Plassering: Horisontalt på vegg', 'Følsomhetsgrad: Kvikk respons',
  'Utløsningstemperatur: 68 °C', 'Lokalisering: underetasje i lagerrom for instrumenter.',
  'K-faktor: 160', 'Trykk: PN16', 'Gjengedimensjon (DN): DN20 / 3/4"',
  'Overflatebehandling: Som standard for produkt', 'Dekkskive/pyntering (ved innfelling): Nei',
  'Beskyttelse: Ja', 'Dokumentasjon: Datablad', 'Andre krav: Nei'
].join('\n');
const chapter = '33.332 Installasjon for brannslokking med sprinkler\nGENERELLE KRAV LEDNINGSNETT\nDimensjon: DN50, DN25-DN50, DN65\nStandard: NS-5587, NS-5582\nMateriale: Stål';

test('33.332.4.1 keeps DN20, K160 and own fields while chapter pipe dimensions cannot reach card, search or evaluation', () => {
  const line = extractTechnicalDescriptionFromPages([{ pageNumber: 4, method: 'text', confidence: .98,
    text: 'Kapittel: 33 Brannslokking\n' + chapter + '\n' + sprinklerPost + '\nSum:' }]).materialLines.find(item => item.postNumber === '33.332.4.1')!;
  assert.ok(line);
  const raw = { id: 'sprinkler', category: line.category, value_text: line.description, source_page: 4,
    source_excerpt: line.sourceText, value_json: line };
  const before = JSON.stringify(raw);
  const scoped = withEffectiveRequirements(raw);
  const details = projectRequirementDetails(scoped);
  const guide = buildAhlsellRequirementGuide(scoped);
  const sameOwnPost = buildAhlsellRequirementGuide({ ...raw, value_json: { ...line,
    attributes: Object.fromEntries(Object.entries(line.attributes).filter(([key]) => line.attributeSources?.[key]?.postNumber === line.postNumber)),
    standardRefs: [], technicalSpecification: sprinklerPost, sourceText: sprinklerPost } });
  assert.deepEqual(guide.searchQueries, sameOwnPost.searchQueries);
  assert.match(guide.searchQueries.join(' '), /160/);
  assert.doesNotMatch(guide.searchQueries.join(' '), /DN(?:25|50|65)\b|5587|5582/i);
  assert.deepEqual(details.attributes.find(([key]) => /gjengedimensjon/.test(key)), ['gjengedimensjon (dn)', 'DN20 / 3/4"']);
  assert.equal(details.attributes.some(([key]) => key === 'dimensjon' || key === 'materiale'), false);
  assert.deepEqual(details.standardRefs, []);
  assert.equal(details.additionalRequirements, 'Nei');
  assert.equal(details.sourceExcerpt, line.sourceText);
  assert.equal(scoped.value_json.parentPostNumber, line.parentPostNumber, 'Keep navigation hierarchy');
  assert.ok(scoped.effectiveRequirements.requirements.every(item => item.source.kind === 'post'));
  assert.doesNotMatch(JSON.stringify(scoped.effectiveRequirements), /DN50|DN65|5587|5582|LEDNINGSNETT/);
  assert.equal(JSON.stringify(raw), before, 'Never overwrite the saved extraction');
  assert.deepEqual(currentPostRequirement(scoped), scoped, 'Projection is idempotent');
});

test('legacy ancestor text and fields stay out even without attribute origins, with own continuations and corrections retained', () => {
  const own = sprinklerPost + '\n\nFORTSETTELSE SIDE 5\nDatablad skal følge leveransen.\nStandard: EN 12259-1';
  const raw = { id: 'legacy', value_text: 'SPRINKLER', source_excerpt: chapter + '\n\nUNDERPOST\n' + own,
    value_json: { postNumber: '33.332.4.1', parentPostNumber: '33.332', nsCode: 'UE2.11111312',
      attributes: { dimensjon: 'DN50, DN25-DN50, DN65', 'gjengedimensjon (dn)': 'DN20 / 3/4"',
        'k-faktor': '160', trykk: 'PN25', dokumentasjon: 'Datablad', ownReviewedField: 'Reviewed value' },
      standardRefs: ['NS-5587', 'NS-5582', 'EN-12259-1'], technicalSpecification: chapter + '\n\nUNDERPOST\n' + own } };
  const current = currentPostRequirement(raw);
  assert.equal(current.value_json.attributes.dimensjon, undefined);
  assert.equal(current.value_json.attributes.trykk, 'PN25', 'Preserve reviewed own values');
  assert.equal(current.value_json.attributes.ownReviewedField, 'Reviewed value');
  assert.deepEqual(current.value_json.standardRefs, ['EN-12259-1']);
  assert.match(current.value_json.technicalSpecification, /FORTSETTELSE SIDE 5/);
  assert.doesNotMatch(current.value_json.technicalSpecification, /LEDNINGSNETT|DN65/);
  assert.equal(current.source_excerpt, own);
});

test('a DN-only child shows its own dimension without its main post specifications', () => {
  const current = withEffectiveRequirements({ id: 'child', value_text: 'Dimensjon: DN100', value_json: {
    postNumber: '33.332.2.1', parentPostNumber: '33.332.2', parentDescription: 'RØR', nsCode: 'UB1.3111', unit: 'm', quantity: 45,
    attributes: { materiale: 'Stål', dimensjon: 'DN100' },
    attributeSources: { materiale: { postNumber: '33.332.2', sourcePage: 2 }, dimensjon: { postNumber: '33.332.2.1', sourcePage: 3 } },
    sourceText: '33.332.2.1 Dimensjon: DN100\nLengde m 45',
    technicalSpecification: '33.332.2 UB1.3111\nRØR\nMateriale: Stål\n\nUNDERPOST\n33.332.2.1 Dimensjon: DN100\nLengde m 45'
  } });
  assert.deepEqual(current.value_json.attributes, { dimensjon: 'DN100' });
  assert.equal(current.value_json.nsCode, null);
  assert.equal(current.value_json.parentPostNumber, '33.332.2');
  assert.ok(current.effectiveRequirements.requirements.every(item => item.source.kind === 'post'));
});

test('a foreign standalone source or missing current block never substitutes another post', () => {
  for (const technicalSpecification of [chapter, chapter + '\n\nUNDERPOST\n33.332.4.2 SPRINKLER\nK-faktor: 80']) {
    const current = currentPostRequirement({ value_text: 'SPRINKLER', value_json: {
      postNumber: '33.332.4.1', sourceText: sprinklerPost, technicalSpecification,
      attributes: { 'k-faktor': '160', dimensjon: 'DN50, DN25-DN50, DN65' },
      standardRefs: ['NS-5587']
    } });
    assert.equal(current.value_json.technicalSpecification, sprinklerPost);
    assert.equal(current.value_json.attributes.dimensjon, undefined);
    assert.deepEqual(current.value_json.standardRefs, []);
  }
});
