import assert from "node:assert/strict";
import test from "node:test";

test("handles English and Swedish negative accessory values and negated free text", () => {
  assert.equal(sprinklerRequiresAccessoryReview({beskyttelse: "None"}), false);
  assert.equal(sprinklerRequiresAccessoryReview({beskyttelse: "Nej"}), false);
  assert.equal(sprinklerRequiresAccessoryReview({}, "ikke med rosett"), false);
  assert.equal(sprinklerRequiresAccessoryReview({}, "ikke med rosett men med guard"), true);
});
import { sprinklerInstallationRequirements, sprinklerRequiresAccessoryReview } from "./sprinkler-technical-rules";

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

test("applies the recessed accessory condition to location without or above a ceiling", () => {
  for (const lokalisering of ["arealer uten himling, eller over himling", "Over systemhimling", "Utan undertak", "Ovanför undertak", "Above suspended ceiling", "Without a ceiling"]) {
    const attributes = { plassering: "Stående og hengende", lokalisering, "dekkskive/pyntering (ved innfelling)": "Ja", beskyttelse: "Valgfritt" };
    const before = structuredClone(attributes);
    const result = sprinklerInstallationRequirements(attributes);
    assert.equal(result.mount, null, lokalisering);
    assert.equal(result.accessories[0].status, "not_applicable", lokalisering);
    assert.equal(result.accessories[1].status, "optional");
    assert.equal(result.warnings.length, 0);
    assert.match(result.notes.join(" "), /Ingen täckbricka krävs av detta fält/);
    assert.equal(sprinklerRequiresAccessoryReview(attributes), false);
    assert.deepEqual(attributes, before);
  }
});

test("does not infer recessed mounting from an affirmative accessory alone", () => {
  const attributes = { "dekkskive/pyntering (ved innfelling)": "Ja" };
  const result = sprinklerInstallationRequirements(attributes);
  assert.equal(result.mount, null);
  assert.equal(result.accessories[0].status, "review");
  assert.equal(result.warnings.length, 1);
  assert.equal(sprinklerRequiresAccessoryReview(attributes), true);
});

test("retains conditional accessories when recessed mounting is explicit", () => {
  for (const plassering of ["Innfelt synlig i tak", "Infällt montage i undertak", "Recessed pendent", "Skjult sprinkler i himling"]) {
    const attributes = { plassering, "dekkskive/pyntering (ved innfelling)": "Ja" };
    const result = sprinklerInstallationRequirements(new Map(Object.entries(attributes)));
    assert.ok(result.mount);
    assert.equal(result.accessories[0].status, "required");
    assert.equal(sprinklerRequiresAccessoryReview(attributes), true);
  }
});

test("reports contradictory mounting and location without silently dropping the condition", () => {
  const result = sprinklerInstallationRequirements({ plassering: "Innfelt i tak", lokalisering: "Over himling", "dekkskive (ved innfelling)": "Ja" });
  assert.equal(result.mount, null);
  assert.equal(result.exposed, false);
  assert.equal(result.conflict, true);
  assert.equal(result.accessories[0].status, "review");
  assert.match(result.warnings.join(" "), /både infällt\/dolt/);
});

test("a location exception does not cancel an unconditional cover or required guard", () => {
  const attributes = { lokalisering: "Over himling", dekkskive: "Ja", beskyttelse: "Gitter" };
  const result = sprinklerInstallationRequirements(attributes);
  assert.equal(result.mount, null);
  assert.deepEqual(result.accessories.map((entry) => entry.status), ["required", "required"]);
  assert.equal(sprinklerRequiresAccessoryReview(attributes), true);
  assert.equal(sprinklerRequiresAccessoryReview({ ...attributes, dekkskive: "Valgfritt" }), true);
});

test("recognizes negated and conditional mounting words without treating them as facts", () => {
  for (const plassering of ["Ikke innfelt", "Inte infällt", "Not recessed"]) {
    const result = sprinklerInstallationRequirements({ plassering, "dekkskive (ved innfelling)": "Ja" });
    assert.equal(result.mount, null);
    assert.equal(result.accessories[0].status, "not_applicable");
  }
  const conditional = sprinklerInstallationRequirements({}, "Dekkskive (ved innfelling): Ja");
  assert.equal(conditional.mount, null);
  const negatedLocation = sprinklerInstallationRequirements({ lokalisering: "Ikke over himling", "dekkskive (ved innfelling)": "Ja" });
  assert.equal(negatedLocation.exposed, false);
  assert.equal(negatedLocation.accessories[0].status, "review");
});

test("handles conditional and optional free-text accessories while retaining explicit requirements", () => {
  assert.equal(sprinklerRequiresAccessoryReview({ lokalisering: "Over himling" }, "Med rosett ved innfelling."), false);
  assert.equal(sprinklerRequiresAccessoryReview({}, "Optional with guard"), false);
  assert.equal(sprinklerRequiresAccessoryReview({}, "Valgfritt med rosett, men med guard"), true);
  assert.equal(sprinklerRequiresAccessoryReview({}, "Overflatebehandling valgfritt sprinkler med guard"), true);
  assert.equal(sprinklerRequiresAccessoryReview({ lokalisering: "Over himling" }, "Med rosett ved innfelling og med guard"), true);
});
