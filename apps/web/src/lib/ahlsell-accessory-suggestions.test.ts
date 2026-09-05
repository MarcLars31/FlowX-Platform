import assert from "node:assert/strict";
import test from "node:test";
import { suggestedAccessories } from "./ahlsell-accessory-suggestions";
import type { AhlsellPublicCandidate } from "./ahlsell-public-match";

test("finds a V27 escutcheon when the specification requires recessed mounting", () => {
  const suggestions = suggestedAccessories({
    category: "sprinkler_head",
    value_text: "1/2 V2762 K80 pendent 68C QR innfelt med hvit dekkskive"
  }, candidate("1361933"));

  assert.ok(suggestions.length > 0);
  assert.ok(suggestions.every((suggestion) => /dekkskiv/i.test(suggestion.productName)));
  assert.ok(suggestions.some((suggestion) => suggestion.articleNumber === "9254009"));
  assert.ok(suggestions.every((suggestion) => suggestion.required));
});

test("finds the matching concealed cover for a V38 sprinkler", () => {
  const suggestions = suggestedAccessories({
    category: "sprinkler_head",
    value_text: "V3801 sprinklerhode skjult 68C"
  }, candidate("9254073"));

  assert.ok(suggestions.some((suggestion) => suggestion.articleNumber === "9254062"));
});

test("finds separately selectable trim and accelerator products for a dry 768N valve", () => {
  const suggestions = suggestedAccessories({
    category: "valve",
    value_text: "sprinklerventil tørr 768N"
  }, candidate("9253995"));

  assert.ok(suggestions.some((suggestion) => suggestion.articleNumber === "9255507"));
  assert.ok(suggestions.some((suggestion) => suggestion.articleNumber === "9254852"));
  assert.equal(suggestions.find((suggestion) => suggestion.articleNumber === "9255507")?.required, true);
});

test("does not invent an accessory for an ordinary surface-mounted head", () => {
  const suggestions = suggestedAccessories({
    category: "sprinkler_head",
    value_text: "1/2 V2762 K80 pendent 68C QR svart"
  }, candidate("1361933"));
  assert.deepEqual(suggestions, []);
});

function candidate(articleNumber: string): AhlsellPublicCandidate {
  return {
    articleNumber,
    productName: "MLDL product",
    manufacturer: "Victaulic",
    productUrl: "https://www.ahlsell.no/search",
    specifications: [],
    source: "structured_database"
  };
}
