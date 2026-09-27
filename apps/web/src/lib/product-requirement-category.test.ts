import assert from "node:assert/strict";
import test from "node:test";
import {
  productRequirementCategory,
  productRequirementCategoryLabel,
  sortProductRequirementsByCategory
} from "./product-requirement-category";
import { compactProjectRequirement, expandOverviewProjection } from "./project-overview";
import { groupProjectRequirementViews } from "./project-requirement-views";
import { ahlsellRequirementIntent } from "./ahlsell-requirement-intent";
import { findAhlsellMldlCandidates } from "./ahlsell-mldl-catalog";

test("sorts sprinkler heads first, followed by pipes and the remaining product groups", () => {
  const requirements = [
    { id: "valve", category: "valve" },
    { id: "pipe-1", category: "pipe" },
    { id: "sprinkler-1", category: "sprinkler_head" },
    { id: "fitting", category: "fitting" },
    { id: "sprinkler-2", category: "sprinkler_head" },
    { id: "pipe-2", category: "pipe" }
  ];

  assert.deepEqual(
    sortProductRequirementsByCategory(requirements).map((requirement) => requirement.id),
    ["sprinkler-1", "sprinkler-2", "pipe-1", "pipe-2", "fitting", "valve"]
  );
});

test("keeps the PDF order inside each product group", () => {
  const requirements = [
    { id: "second", category: "pipe" },
    { id: "first", category: "pipe" }
  ];

  assert.deepEqual(
    sortProductRequirementsByCategory(requirements).map((requirement) => requirement.id),
    ["second", "first"]
  );
});

test("recognizes product groups when an older row has category unknown", () => {
  assert.equal(productRequirementCategory({
    category: "unknown",
    value_text: "Standard kvikk respons sprinklerhode"
  }), "sprinkler_head");
  assert.equal(productRequirementCategory({
    category: "unknown",
    value_text: "Sorte stålrør",
    value_json: { unit: "m" }
  }), "pipe");
  assert.equal(productRequirementCategory({
    category: "unknown",
    value_text: "Kupling rillet"
  }), "fitting");
});

test("keeps explicitly extracted miscellaneous fire-protection products separate", () => {
  assert.equal(productRequirementCategory({
    category: "other",
    value_text: "Håndslokker med skum"
  }), "other");
});

test("groups UB1.3311 as a sprinkler hose even when an older row says pipe", () => {
  assert.equal(productRequirementCategory({
    category: "pipe",
    value_text: "INNENDØRS RØRLEDNING - BRANNSLOKKING - SLANGE",
    value_json: { nsCode: "UB1.33114699900A" }
  }), "sprinkler_hose");
});

for (const [name, code, expected, label] of [
  ["GRENSTAV", "WL2.125", "electrical_outlets", "Uttag, brytare och uttagsstavar"],
  ["KABELPLATE", "WC2.542A", "cable_support", "Kabelstegar och kabelbärsystem"],
  ["KABELSTIGE", "WC2.522A", "cable_support", "Kabelstegar och kabelbärsystem"],
  ["ARMATURSKINNE", "WC2.81113A", "cable_support", "Kabelstegar och kabelbärsystem"],
  ["ELRØR", "WC2.2112", "electrical_conduit", "Installationsrör för el"],
  ["INNSTØPT KABELRØR", "WB2.23119318A", "electrical_conduit", "Installationsrör för el"],
  ["KABELVERN I ÅPEN INSTALLASJON", "WC2.4111", "electrical_infrastructure", "Kabelskydd och kabelbrunnar"],
  ["PREFABRIKKERT KABELKUM", "WB2.49129A", "electrical_infrastructure", "Kabelskydd och kabelbrunnar"],
  ["KABEL MED FIBEROPTISKE LEDERE", "WJ3.911A", "electrical_cable", "Kablar och ledningar"],
  ["KABEL FOR SPENNINGSBÅND LV", "WJ2.21622A", "electrical_cable", "Kablar och ledningar"],
  ["VEGGKANAL – LENGDE", "WC2.511115", "cable_trunking", "Vägg- och installationskanaler"],
  ["PUNKT", "WL1.312A", "electrical_connections", "Elanslutningar och installationspunkter"],
  ["SEPARAT TILKOBLING AV ELKRAFT", "WL3.1A", "electrical_connections", "Elanslutningar och installationspunkter"],
  ["ELKRAFTFORDELING FOR DISTRIBUSJON", "WD2.113A", "electrical_distribution", "Elfördelning och kraftförsörjning"],
  ["ARMATUR FOR NØD- OG RESERVELYS", "XE7.2321231A", "electrical_lighting", "Belysning och nödbelysning"],
  ["JORDINGSMATERIELL", "WC1.16599A", "electrical_earthing", "Jordning och åskskydd"],
  ["Styringskoder for ventilasjon", "YB3.124A", "automation", "Automation och givare"],
  ["VENTILASJONSKANAL", "VB3.111", "ventilation_duct", "Ventilationskanaler och kanaldelar"],
  ["TILLUFTSVENTIL", "", "ventilation_terminal", "Luftdon och ventilationsspjäll"],
  ["VENTILASJONSAGGREGAT", "", "ventilation_equipment", "Ventilationsaggregat, fläktar och filter"]
]) test(`${name}: old VVS groups are corrected consistently in projected overview and full card`, () => {
  for (const staleCategory of ["pipe", "fitting", "valve", "control", "sprinkler_head", "unknown"]) {
    const row = { id:"legacy", category:staleCategory, value_text:name, requirement_key:code, source_excerpt:"Kommentar: sprinkler UB1.33114699900A DN25", value_json:{
      nsCode:code, quantity:71.75, unit:"m", sourceChapter:{title:"Sprinkler og rør"},
      technicalSpecification:"Sprinkler UB1.33114699900A krever slange", attributes:{"pdf-kommentar":"Ventil og rør"}
    } };
    const before=JSON.stringify(row);
    const projected=expandOverviewProjection({id:row.id,category:staleCategory,value_text:name,requirement_key:code,source_excerpt:row.source_excerpt,overview_nsCode:code,overview_quantity:71.75,overview_unit:"m",overview_attributes:row.value_json.attributes});
    assert.equal(productRequirementCategory(row),expected);
    assert.equal(productRequirementCategoryLabel(productRequirementCategory(row)),label);
    assert.equal(productRequirementCategory(compactProjectRequirement(projected)),expected);
    assert.equal(productRequirementCategory(compactProjectRequirement(row)),expected);
    assert.equal(JSON.stringify(row),before,"classification must not rewrite PDF requirements or approved choices");
  }
});

test("metres, chapter mentions and old overview labels cannot turn an unknown main product into pipe", () => {
  const row={id:"unknown",category:"pipe",value_text:"GUMMILIST",overview:{category:"pipe"},value_json:{unit:"m",quantity:5,sourceChapter:{title:"Sprinkler"},technicalSpecification:"Ansluts till rör UB1.321111",attributes:{"pdf-kommentar":"Ventil DN25"}}};
  assert.equal(productRequirementCategory(row),"other");
  assert.equal(productRequirementCategory({...row,value_text:"KABELSTIGE"}),"cable_support");
});

test("own VVS products remain distinct from included accessories and foreign chapter codes", () => {
  for (const [name,code,expected] of [
    ["SPRINKLER", "UE2.11112912", "sprinkler_head"],
    ["INNENDØRS RØRLEDNING - BRANNSLOKKING - SLANGE", "UB1.33114699900A", "sprinkler_hose"],
    ["DN25, ink. deler og oppheng", "UB1.31114399900", "pipe"],
    ["Bend DN25", "UB1.31114399900", "fitting"],
    ["Stengeventil DN25", "UB1.321199", "valve"],
    ["INNENDØRS STENGEVENTIL", "UC1.9111118A", "valve"],
    ["Manometer til sprinklersentral", "", "control"],
    ["Sirkulasjonspumpe", "", "pump"],
    ["INNENDØRS PARTIKKELUTSKILLER", "", "filter"],
    ["WC", "", "sanitary"]
  ]) assert.equal(productRequirementCategory({category:"fitting",value_text:name,value_json:{nsCode:code,unit:"m",technicalSpecification:"KABELSTIGE WC2.522A\nSlange med sprinklerhode",attributes:{"pdf-kommentar":"UB1.33114699900A"}}}),expected,name);
});

test("product grouping keeps RS and project information placement and quantities unchanged", () => {
  const rows=[
    {id:"product",category:"pipe",value_text:"KABELSTIGE",value_json:{nsCode:"WC2.522A",quantity:71.75,unit:"m"}},
    {id:"rs",category:"valve",value_text:"Styringskoder for lys",value_json:{nsCode:"YB3.124A",unit:"RS"}},
    {id:"info",category:"fitting",value_text:"WZA Installasjoner for elkraft og ekom",value_json:{}}
  ];
  const compact=rows.map(compactProjectRequirement);
  const groups=groupProjectRequirementViews(compact);
  assert.deepEqual([groups.products[0].id,groups.rs[0].id,groups.removal[0].id],["product","rs","info"]);
  assert.equal((compact[0].value_json as Record<string,unknown>).quantity,71.75);
});

test("automation and electrical headings without a code also avoid the sprinkler catalogue", () => {
  for(const row of [{category:"valve",value_text:"Styringskoder for ventilasjon",value_json:{nsCode:"YB3.124A"}}, {category:"fitting",value_text:"GRENSTAV",value_json:{}}]) {
    assert.equal(ahlsellRequirementIntent(row),"generic");
    assert.deepEqual(findAhlsellMldlCandidates(row),[]);
  }
});
