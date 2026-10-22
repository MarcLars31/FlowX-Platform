import assert from "node:assert/strict";
import test from "node:test";
import {projectRequirementDetails} from "./project-requirement-details";
test("Sprinkler2 marking scope on the next page is actually rendered in the product card", async () => {
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { ProjectPostSpecification } = await import("../components/ProjectPostSpecification");
  const source = '30.332.27 Merking ventil (skilt):\n\nFORTSETTELSE SIDE 16\nOmfang er skilt for 3stk DN25 dreneringsventiler, hvor 2 er\nplassert over himling og 1 under nederste mellomrepos av\ntrapp.\nDrenering 33 Sprinkleranlegg\nRund sum RS';
  const details = projectRequirementDetails({ source_page: 15, value_json: { postNumber: '30.332.27', sourceText: source, technicalSpecification: source } });
  const html = renderToStaticMarkup(createElement(ProjectPostSpecification, { id: 'r', details, description: 'Merking ventil (skilt)', quantity: { quantity: 1, unit: 'RS' } }));
  assert.match(html, /Omfang er skilt for 3stk DN25 dreneringsventiler/);
  assert.match(html, /plassert over himling og 1 under nederste mellomrepos av\ntrapp/);
  assert.match(html, /Drenering 33 Sprinkleranlegg/);
  assert.match(html, /Side 15–16/);
  assert.match(html, /FORTSETTELSE SIDE 16/);
  assert.equal(html.match(/Rund sum RS/g)?.length, 1);
  assert.equal(html.match(/Merking ventil \(skilt\)/g)?.length, 1);
});

test("plain fallback retains source spelling once without a false next page", async () => {
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { ProjectPostSpecification } = await import("../components/ProjectPostSpecification");
  const { projectRequirementPageLabel } = await import("./project-requirement-details");
  const source = '33.500.2 | UE2.11111232\nSPRINKLER\nAntall stk 67\nFelsomhetsgrad: Standard-respons "A"\nUtlesningstemperatur: 68 °C\nDokumentasjon: Datablad skal følge med.\nAndre krav: Nei\n\nFORTSETTELSE SIDE 2\nRambøll Norge AS 07.08.2026';
  const row = { status: 'user_confirmed', source_page: 1, source_excerpt: source, value_json: {
    postNumber: '33.500.2', nsCode: 'UE2.11111232', sourceText: source, technicalSpecification: source,
    attributes: { 'følsomhetsgrad': 'Standard-respons "A"', 'utløsningstemperatur': '68 °C' }
  } };
  const before = JSON.stringify(row);
  const details = projectRequirementDetails(row);
  const html = renderToStaticMarkup(createElement(ProjectPostSpecification, { id: 'r', details, description: 'SPRINKLER', quantity: { quantity: 67, unit: 'st' } }));
  assert.equal(projectRequirementPageLabel(details), 'Side 1');
  assert.equal(html.match(/UE2\.11111232/g)?.length, 1);
  assert.equal(html.match(/SPRINKLER/g)?.length, 1);
  assert.equal(html.match(/68 °C/g)?.length, 1);
  assert.equal(html.match(/Felsomhetsgrad/g)?.length, 1);
  assert.doesNotMatch(html, /Rambøll|Side 2/);
  assert.equal(html.match(/Utlesningstemperatur/g)?.length, 1);
  assert.match(html, /Datablad skal følge med/);
  assert.equal(JSON.stringify(row), before);
});
