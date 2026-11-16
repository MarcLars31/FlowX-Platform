import assert from "node:assert/strict";
import test from "node:test";
import { classifyProductRequirement, productExtractionCategory } from "./product-classification";
import { productRequirementCategory } from "./product-requirement-category";
import { ahlsellRequirementIntent } from "./ahlsell-requirement-intent";

test("navigation, extraction and retrieval share the named product instead of a stale category", () => {
  for (const [description, category, intent, extraction] of [
    ["Dusjsett med termostat", "sanitary", "shower_set", "other"],
    ["Trykkvakt for alarmventil", "control", "pressure_switch", "control"],
    ["Kuleventil DN25", "valve", "ball_valve", "valve"],
    ["Red pipe sprinkler DN40", "pipe", "pipe", "pipe"],
    ["INNENDØRS AVLØPSLEDNING – TRYKKLØS – KOMPLETT", "pipe", "pipe", "pipe"],
    ["Veggkanal for kabler", "cable_trunking", "cable_trunking", "other"]
  ]) {
    const row = { category: "sprinkler_head", value_text: description, value_json: {} };
    assert.equal(productRequirementCategory(row), category, description);
    assert.equal(classifyProductRequirement(row).intent, intent, description);
    assert.equal(ahlsellRequirementIntent(row), intent, description);
    assert.equal(productExtractionCategory(row), extraction, description);
  }
});

test("included fittings do not replace the main quantified pipe", () => {
  const row = { category: "fitting", value_text: "DN25 komplett med deler", value_json: { nsCode: "UB1.31114921934A", unit: "m" } };
  assert.equal(productRequirementCategory(row), "pipe");
  assert.equal(ahlsellRequirementIntent(row), "pipe");
});


test("normal-weight steel pipe measured in metres is not a sprinkler head", () => {
  for (const category of ["pipe", "sprinkler_head", "unknown"]) {
    assert.equal(classifyProductRequirement({ category, value_text: "Normaltykke Stålrør Sprinkler", value_json: { unit: "m" } }).intent, "pipe");
  }
  assert.equal(classifyProductRequirement({ value_text: "Normaltykke Stålrør Bend Sprinkler", value_json: { unit: "stk" } }).intent, "bend");
  assert.equal(classifyProductRequirement({ value_text: "Sprinklerhode K80 QR nedadrettet", value_json: { unit: "stk" } }).intent, "sprinkler_head");
});
