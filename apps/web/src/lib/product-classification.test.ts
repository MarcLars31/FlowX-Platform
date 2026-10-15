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
