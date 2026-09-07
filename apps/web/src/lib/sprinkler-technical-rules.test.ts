import assert from "node:assert/strict";
import test from "node:test";
import { sprinklerRequiresAccessoryReview } from "./sprinkler-technical-rules";

test("recognizes OCR variants of I.R. in accessory values from existing PDF rows", () => {
  for (const value of ["I.R.", "i.r.", "IR", "I. R.", "l.R.", "1.R.", "|.R."]) {
    const attributes = {
      "dekkskive/pyntering (ved innfelling)": value,
      beskyttelse: "Nei"
    };
    assert.equal(sprinklerRequiresAccessoryReview(attributes), false, value);
    assert.equal(sprinklerRequiresAccessoryReview(new Map(Object.entries(attributes))), false, value);
  }
});

test("keeps real or uncertain accessory requirements even when another field says I.R.", () => {
  for (const value of ["Ja", "Gitter", "Dobbel rosett", "Vannskjerm", "I.R. med gitter", "R."]) {
    assert.equal(sprinklerRequiresAccessoryReview({
      "dekkskive/pyntering (ved innfelling)": "|.R.",
      beskyttelse: value
    }), true, value);
  }
  assert.equal(sprinklerRequiresAccessoryReview({
    "dekkskive/pyntering (ved innfelling)": "|.R.",
    beskyttelse: "Nei"
  }, "Sprinkler med vannskjerm"), true);
});
