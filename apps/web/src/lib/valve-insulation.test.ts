import assert from "node:assert/strict";
import test from "node:test";
import { productNameAfterDimension, isValveInsulationProduct } from "./product-search-names";
import { productSearchHeading, productRequirementAttributes } from "./ahlsell-requirement-context";
import { genericProductIdentity, hasGenericProductIdentity } from "./ahlsell-generic-product-relevance";
import { classifyProductRequirement } from "./product-classification";
import { withEffectiveRequirements, requirementForSearch } from "./effective-requirements";
import { buildAhlsellRequirementGuide, type AhlsellPublicCandidate } from "./ahlsell-public-match";
import { complementMldlCandidates } from "./ahlsell-hybrid-matching";
import { evaluateAhlsellCandidates } from "./ahlsell-technical-evaluator";
import { searchAhlsellPublicCatalogQueries } from "./ahlsell-public-catalog";

function requirement(range = "DN10-DN50", type = "Se under") {
  const title = `${range} Isolering av ventiler med prefabrikerte ventilposer / mansjetter med hurtig lukking / åpning.`;
  const parentFields = { "type produkt": type, isolasjonsmateriale: "Tilsvarende rørisolasjon type.", tykkelse: "Må tilpasses rørisolasjon ved tilhørende rørføring." };
  const attributeSources: Record<string, { postNumber: string; sourcePage: number }> = {
    ...Object.fromEntries(Object.keys(parentFields).map(key => [key, { postNumber: "03.30.326.1", sourcePage: 67 }])),
    dimensjon: { postNumber: "03.30.326.1.1", sourcePage: 68 }
  };
  return { id: "valve-insulation", category: "pipe", source_page: 68, value_text: title, value_json: {
    postNumber: "03.30.326.1.1", parentPostNumber: "03.30.326.1", parentDescription: "ISOLERING AV RØRLEDNINGSDELER", quantity: 1, unit: "st",
    attributes: { ...parentFields, dimensjon: range },
    attributeSources,
    sourceText: `03.30.326.1.1 ${title}\nAntall stk 1`,
    technicalSpecification: `03.30.326.1 ISOLERING AV RØRLEDNINGSDELER\n${Object.entries(parentFields).map(([key,value])=>`${key}: ${value}`).join("\n")}\n\nUNDERPOST\n03.30.326.1.1 ${title}`
  } };
}

test("named products survive dimension prefixes; medium and assembly qualifiers still use their parent", () => {
  for (const prefix of ["DN10 - DN50", "DN10–50", "DN65—DN125", "Ø 15 /16 mm"])
    assert.equal(productNameAfterDimension(`${prefix} Ventilposer`), "Ventilposer");
  for (const title of ["DN15 (30 mm)", "DN20 Kaldtvann", "ø 15 /16 mm Med varerør", "DN25", "3M Filter", "2-veis ventil", "DN25 komplett med deler bend og endebunn"])
    assert.equal(productNameAfterDimension(title), null);
  const valve = requirement("DN25");
  valve.value_text = "DN25 Kuleventil";
  valve.value_json.parentDescription = "INNENDØRS STENGEVENTIL";
  assert.equal(classifyProductRequirement(valve).intent, "ball_valve");
});

test("both real valve-bag size groups search their own product and preserve inherited technical requirements", () => {
  for (const range of ["DN10-DN50", "DN65-DN125"]) {
    const row = requirement(range), original = JSON.stringify(row);
    const current = withEffectiveRequirements(row), guide = buildAhlsellRequirementGuide(current);
    assert.match(productSearchHeading(current), /^Isolering av ventiler/);
    assert.deepEqual(classifyProductRequirement(current), { intent: "generic", category: "plumbing_other" });
    assert.deepEqual(guide.searchQueries, [`isolasjonspute ventil ${range}`, "ventilpose", "isolasjonspute ventil"]);
    assert.doesNotMatch(guide.searchQueries.join(" "), /RØRLEDNINGSDELER|Tilsvarende|tilpasses/);
    assert.equal(productRequirementAttributes(current).dimensjon, range);
    assert.match(String(productRequirementAttributes(current).tykkelse), /tilpasses/);
    assert.ok(current.effectiveRequirements.requirements.some(item => item.property === "dn" && item.value === null && item.source.kind === "post"));
    assert.deepEqual(buildAhlsellRequirementGuide(requirementForSearch(current)), guide);
    assert.equal(JSON.stringify(row), original);
  }
});

test("explicit own product name beats a broader inherited product name; saved own type remains authoritative", () => {
  const row = requirement("DN10-DN50", "Rørskåler");
  assert.equal(genericProductIdentity(row), "valve_insulation");
  assert.ok(!withEffectiveRequirements(row).effectiveRequirements.requirements.some(item => /Rørskåler/.test(item.source.raw)));
  row.value_json.attributes["type produkt"] = "Ventilposer";
  row.value_json.attributeSources["type produkt"] = { postNumber: "03.30.326.1.1", sourcePage: 68 };
  assert.equal(productSearchHeading(row), "Ventilposer");
  row.value_json.attributes.dimensjon = "DN32";
  assert.equal(buildAhlsellRequirementGuide(row).searchQuery, "isolasjonspute ventil DN32");
});

test("valve insulation synonyms require the insulation itself and a valve application", () => {
  for (const name of ["Ventilposer", "Ventilmansjetter", "Isolasjonspute til Strupeventiler/TA", "Isolasjonspute til Kuleventiler", "Isolasjonspute til Motorstyrt ventiler"])
    assert.ok(hasGenericProductIdentity("valve_insulation", name), name);
  for (const name of ["Kuleventil med isolasjonspute", "Rørskål med tape", "Isolasjonspute til pumper", "Isolasjonspute til flenser", "Mansjett for branntetting", "Lim til ventilisolasjon"])
    assert.equal(isValveInsulationProduct(name), false, name);
});

const candidate = (articleNumber: string, productName: string, dn: number): AhlsellPublicCandidate => ({
  articleNumber, productName, manufacturer: "", productUrl: `https://www.ahlsell.no/products/${articleNumber}/`,
  source: "catalog_search", specifications: [`Dimensjon: DN ${dn}`]
});

test("retrieval retains valve bags, excludes unrelated products, and never approves a range as an exact size", () => {
  const row = withEffectiveRequirements(requirement());
  const candidates = complementMldlCandidates(row, [], [
    candidate("9999901", "Isolasjonspute til Strupeventiler/TA", 25),
    candidate("9999902", "Isolasjonspute til Strupeventiler/TA", 65),
    candidate("9999903", "Rørskål med tape", 25),
    candidate("9999904", "Kuleventil med isolasjonspute", 25),
    candidate("9999905", "Isolasjonspute til pumper", 25)
  ]);
  assert.deepEqual(candidates.map(item => item.articleNumber).sort(), ["9999901", "9999902"]);
  const evaluated = evaluateAhlsellCandidates(row, candidates);
  assert.equal(evaluated.find(item => item.articleNumber === "9999901")?.technicalEvaluation.status, "VERIFY");
  assert.equal(evaluated.find(item => item.articleNumber === "9999902")?.technicalEvaluation.status, "FAIL");
  assert.ok(!evaluated[0].matchWarnings?.some(warning => /PDF kräver DN10,/.test(warning)));
  assert.ok(!evaluated[0].matchWarnings?.some(warning => /Alla anslutningar|alla anslutningar/.test(warning)));
  assert.ok(evaluated[0].matchWarnings?.some(warning => /snabb öppning/.test(warning)));
});

test("public catalogue chooses a variant inside the range instead of the default DN65", async () => {
  for (const range of ["DN10-DN50", "DN65-DN125"]) {
    const result = await searchAhlsellPublicCatalogQueries({ market: "no", queries: buildAhlsellRequirementGuide(requirement(range)).searchQueries,
      fetchImpl: async input => String(input).includes("/variants?")
        ? Response.json({ settings: { headers: { size: "Dimensjon" } }, items: [65,25,150].map(dn => ({
          code: `9999${dn}`, url: `/products/9999${dn}/`, productName: "Isolasjonspute til Strupeventiler/TA", isActiveVariant: dn === 65, buyable: true,
          attributes: { size: { value: `DN ${dn}` } }
        })) })
        : Response.json({ productCount: 1, productCards: [{ name: "Isolasjonspute til Strupeventiler/TA", mostRelevantVariantId: "999965", firstVariationPageUrl: "/products/999965/", code: "bag-family", numberOfVariants: 3 }] })
    });
    assert.equal(result.candidates[0].articleNumber, range.startsWith("DN10") ? "999925" : "999965");
  }
});
