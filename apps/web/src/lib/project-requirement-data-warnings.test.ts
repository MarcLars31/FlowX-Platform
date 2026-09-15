import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_SUPPORTED_SPRINKLER_K_FACTOR,
  hasProjectRequirementDataWarning,
  parseSprinklerKFactor,
  projectRequirementDataWarnings,
  projectRequirementKFactorDisplayValue
} from "./project-requirement-data-warnings";

test("flags only K-factors above the supported boundary", () => {
  const atBoundary = requirement({ "k-faktor": String(MAX_SUPPORTED_SPRINKLER_K_FACTOR) });
  const aboveBoundary = requirement({ "k-faktor": "400,5" });

  assert.equal(hasProjectRequirementDataWarning(atBoundary), false);
  assert.equal(hasProjectRequirementDataWarning(aboveBoundary), true);
  assert.deepEqual(projectRequirementDataWarnings(aboveBoundary), [{
    code: "implausible-k-factor",
    label: "Orimlig K-faktor: 400,5",
    message: "PDF-posten anger K-faktor 400,5. Scipx har inga sprinklerprodukter med K-faktor över 400. Kontrollera värdet i PDF-filen innan du väljer produkt.",
    rawValue: "400,5",
    value: 400.5
  }]);
});

test("finds an implausible legacy value in the PDF source text", () => {
  const row = {
    value_json: {
      attributes: {},
      technicalSpecification: "Type sprinkler: Tørrsprinkler\nK-faktor: 560"
    },
    source_excerpt: "K-faktor: 560"
  };

  assert.equal(projectRequirementDataWarnings(row)[0]?.value, 560);
  assert.equal(projectRequirementKFactorDisplayValue(row), "560");
});

test("restores the raw OCR value when an older stored decimal contradicts the source", () => {
  const row = {
    value_json: {
      attributes: { "k-faktor": "114.5" },
      technicalSpecification: "SPRINKLER\nK-faktor: 1145"
    }
  };

  assert.equal(projectRequirementKFactorDisplayValue(row), "1145");
  assert.equal(projectRequirementDataWarnings(row)[0]?.rawValue, "1145");
});

test("does not treat unrelated large numbers as a K-factor", () => {
  const row = {
    value_json: {
      attributes: { dimensjon: "DN500" },
      technicalSpecification: "Antall stk 1145"
    }
  };

  assert.deepEqual(projectRequirementDataWarnings(row), []);
  assert.equal(projectRequirementKFactorDisplayValue(row), null);
  assert.equal(parseSprinklerKFactor("K-80"), 80);
});

test("uses the underpost K-factor instead of a different parent value", () => {
  const row = {
    value_json: {
      attributes: { "k-faktor": "80" },
      technicalSpecification: "K-faktor: 1145\n\nUNDERPOST\nSPRINKLER\nK-faktor: 80"
    },
    source_excerpt: "SPRINKLER\nK-faktor: 80"
  };

  assert.equal(projectRequirementKFactorDisplayValue(row), "80");
  assert.deepEqual(projectRequirementDataWarnings(row), []);
});

function requirement(attributes: Record<string, unknown>) {
  return { value_json: { attributes } };
}
