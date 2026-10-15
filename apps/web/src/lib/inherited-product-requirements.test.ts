import assert from "node:assert/strict";
import test from "node:test";
import { currentPostRequirement } from "./current-post-requirement";
import { withEffectiveRequirements, requirementForSearch } from "./effective-requirements";
import { productRequirementAttributes } from "./ahlsell-requirement-context";
import { buildAhlsellRequirementGuide } from "./ahlsell-public-match";
import { classifyProductRequirement } from "./product-classification";
import { hasAhlsellProductFamilyMismatch } from "./ahlsell-candidate-ranking";
import { projectRequirementDetails } from "./project-requirement-details";
import { complementMldlCandidates } from "./ahlsell-hybrid-matching";
import type { AhlsellPublicCandidate } from "./ahlsell-public-match";

const parent = "03.30.324.1";
const post = parent + ".1";
const description = "Tilkobling til kompressoranlegg for kjøling, tur og retur.";
function fixture() {
  const attributes = { trykk: "PN 10", medium: "Vann", "skjøt": "Iht systemkrav for valgt rørtype",
    "type energibæreledning": "Varmebærerledning",
    "rørdel": "Tilkobl. av tekn. utstyr", "materiale rør": "Kompositt", "materiale rørdel": "Komposittrør",
    dimensjon: "Se underposter", materialkvalitet: "Bluepipe", lokalisering: "Se tegninger og modell" };
  return { id: "connection", value_text: description, source_page: 55, value_json: {
    postNumber: post, parentPostNumber: parent, parentDescription: "INNENDØRS ENERGIBÆRERLEDNING FOR VÆSKE – RØRDEL",
    nsCode: "UB3.14949719999999A", quantity: 2, unit: "st", attributes: attributes as Record<string, string>,
    attributeSources: Object.fromEntries(Object.keys(attributes).map(key => [key, { postNumber: parent, sourcePage: 55 }])),
    sourceText: `${post} ${description}\nAntall stk 2`,
    technicalSpecification: `03.30 VVS-installasjoner\n\nUNDERPOST\n03.30.324. UB3.14949719999999A\n1 INNENDØRS ENERGIBÆRERLEDNING FOR VÆSKE\n– RØRDEL\n${Object.entries(attributes).map(([key, value]) => `${key}: ${value}`).join("\n")}\n\nUNDERPOST\n03.30.324. ${description}\n1.1\nAntall stk 2`
  } };
}

test("compressor connection retains the proven Bluepipe parent in search and technical checks", () => {
  const row = fixture();
  const before = JSON.stringify(row);
  const current = withEffectiveRequirements(row);
  assert.deepEqual(classifyProductRequirement(current), { category: "fitting", intent: "equipment_connection" });
  const guide = buildAhlsellRequirementGuide(current);
  assert.deepEqual(guide.searchQueries, ["Bluepipe overgang", "Bluepipe union", "Bluepipe kobling"]);
  assert.match(guide.criteria.join(" "), /PN 10/);
  assert.match(guide.criteria.join(" "), /Komposittrør/);
  assert.match(guide.warnings.join(" "), /dimension saknas/);
  assert.ok(current.effectiveRequirements.requirements.some(item => item.property === "pn" && item.value === 10 && item.source.postNumber === parent && item.source.kind === "parent" && item.source.page === 55));
  assert.equal(current.value_json.quantity, 2);
  assert.deepEqual(projectRequirementDetails(current).attributes, []);
  assert.equal(JSON.stringify(row), before);
  assert.deepEqual(currentPostRequirement(current), current);
  assert.deepEqual(buildAhlsellRequirementGuide(requirementForSearch(current)), guide);
});

test("own aliases override parent pressure, material, dimension and system in all consumers", () => {
  const row = fixture();
  const own = { PN: "16", materiale: "Messing", DN: "25", materialkvalitet: "Eget system" };
  Object.assign(row.value_json.attributes, own);
  for (const key of Object.keys(own)) row.value_json.attributeSources[key] = { postNumber: post, sourcePage: 55 };
  const resolved = withEffectiveRequirements(row);
  const attributes = productRequirementAttributes(resolved);
  assert.equal(attributes.trykk, undefined);
  assert.equal(attributes["materiale rørdel"], undefined);
  assert.equal(attributes.materiale, "Messing");
  assert.equal(attributes.materialkvalitet, "Eget system");
  assert.ok(resolved.effectiveRequirements.requirements.some(item => item.property === "pn" && item.value === 16 && item.source.kind === "post"));
  assert.ok(!resolved.effectiveRequirements.requirements.some(item => item.property === "pn" && item.value === 10));
  assert.match(buildAhlsellRequirementGuide(resolved).searchQuery, /Eget system.*25/);
  assert.doesNotMatch(JSON.stringify(attributes), /Bluepipe|Se underposter/);
});

test("own title DN and PN override inherited fields, and free choice clears an inherited constraint", () => {
  const row = fixture();
  row.value_text += " DN25 PN16";
  row.value_json.attributes.dimensjon = "DN80";
  row.value_json.attributes.materialkvalitet = "Valgfritt";
  row.value_json.attributeSources.materialkvalitet = { postNumber: post, sourcePage: 55 };
  const resolved = withEffectiveRequirements(row);
  const fields = resolved.effectiveRequirements.requirements;
  assert.ok(fields.some(item => item.property === "dn" && item.value === 25));
  assert.ok(fields.some(item => item.property === "pn" && item.value === 16));
  assert.ok(!fields.some(item => item.property === "dn" && item.value === 80 || item.property === "pn" && item.value === 10));
  assert.doesNotMatch(buildAhlsellRequirementGuide(resolved).searchQueries.join(" "), /Bluepipe|Valgfritt/);
});

test("numbered legacy parent fields are used without origins and remain isolated from chapter/siblings", () => {
  const row = fixture();
  row.value_json.attributeSources = {};
  row.value_json.technicalSpecification = "03.30 VVS-installasjoner\nTrykk: PN40\n\nUNDERPOST\n" + row.value_json.technicalSpecification
    + "\n\nUNDERPOST\n03.30.324.1.2 Annen post\nMaterialkvalitet: Søskenprodukt\nTrykk: PN25";
  const guide = buildAhlsellRequirementGuide(withEffectiveRequirements(row));
  assert.match(guide.searchQuery, /Bluepipe/);
  assert.doesNotMatch(JSON.stringify(guide), /Søskenprodukt|PN40|PN25/);
});

test("an unrelated named product or a chapter parent cannot inherit pipe fittings", () => {
  for (const description of ["KABELSTIGE", "SPRINKLER", "Trykkvakt", "Manometer"]) {
    const row = fixture(); row.value_text = description;
    assert.deepEqual(productRequirementAttributes(withEffectiveRequirements(row)), {});
  }
  const chapter = fixture(); chapter.value_json.parentPostNumber = "03.30";
  assert.deepEqual(productRequirementAttributes(withEffectiveRequirements(chapter)), {});
});

test("connection family accepts fittings and excludes complete equipment and unrelated products", () => {
  for (const name of ["Bluepipe overgang 40 mm", "Bluepipe union 32 mm", "Bluepipe muffe"])
    assert.equal(hasAhlsellProductFamilyMismatch("equipment_connection", name), false);
  for (const name of ["Kompressor for kjøling", "Bluepipe rør 32 mm", "Sprinkler K80", "Kuleventil DN25"])
    assert.equal(hasAhlsellProductFamilyMismatch("equipment_connection", name), true);
});

test("automatic connection suggestions require the specified system in product evidence, not the supplier", () => {
  const candidate = (articleNumber: string, productName: string, manufacturer = "Ahlsell"): AhlsellPublicCandidate => ({
    articleNumber, productName, manufacturer, specifications: [], source: "catalog_search",
    productUrl: `https://www.ahlsell.no/products/${articleNumber}/`
  });
  const row = withEffectiveRequirements(fixture());
  const candidates = [candidate("8754057", "Overgang, Blue pipe / Green pipe og tappevann"),
    candidate("8754262", "Union PP innv.sveis, Blue pipe / Green pipe og tappevann"),
    candidate("9253039", "Flensadapter PN10/16 Victaulic"),
    candidate("9999901", "Union for annet rørsystem", "Bluepipe"),
    candidate("9999902", "Bluepipe rør 32 mm")];
  const results = complementMldlCandidates(row, candidates.slice(2), candidates.slice(0, 2));
  assert.deepEqual(results.map(item => item.articleNumber).sort(), ["8754057", "8754262"]);
  assert.ok(results.every(item => item.exactMatch !== true));
});
