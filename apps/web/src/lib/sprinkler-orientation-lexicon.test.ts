import assert from "node:assert/strict";
import test from "node:test";
import { resolvedSprinklerOrientation } from "./sprinkler-orientation-lexicon";

test("maps common Norwegian sidewall wording to HSW orientation", () => {
  const descriptions = [
    "Veggmontert sprinklerhode",
    "Veggsprinkler",
    "Montert på vegg",
    "Montert på sidevegg",
    "Horisontalt montert sprinkler",
    "Horisontell sprinkler",
    "Vannrett veggmontasje",
    "HSW"
  ];

  for (const description of descriptions) {
    assert.deepEqual(resolvedSprinklerOrientation(description), {
      orientation: "sidewall",
      mixed: false
    }, description);
  }
});

test("maps Norwegian upright and pendent inflections", () => {
  assert.equal(resolvedSprinklerOrientation("Oppovervendt sprinkler").orientation, "upright");
  assert.equal(resolvedSprinklerOrientation("Opprettstående sprinkler").orientation, "upright");
  assert.equal(resolvedSprinklerOrientation("Nedoverrettet sprinkler").orientation, "pendent");
  assert.equal(resolvedSprinklerOrientation("Nedhengt sprinklerhode").orientation, "pendent");
});

test("does not collapse a mixed orientation requirement", () => {
  assert.deepEqual(resolvedSprinklerOrientation("Stående eller veggmontert"), {
    orientation: null,
    mixed: true
  });
});
