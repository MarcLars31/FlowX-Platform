import assert from "node:assert/strict";
import test from "node:test";
import { splitAhlsellMatchGroups } from "./ahlsell-match-groups";

test("separates Ahlsell matches from rows requiring manual work", () => {
  const result = splitAhlsellMatchGroups([
    {
      id: "pdf-article",
      category: "valve",
      value_text: "Dimensjon DN65 VIC 705 9253497",
      value_json: { attributes: { dimensjon: "DN65" } }
    },
    {
      id: "learned",
      category: "valve",
      mapping_fingerprint: "known-fingerprint",
      value_text: "Kontrollventil DN100"
    },
    {
      id: "approved",
      category: "fitting",
      value_text: "Rørdel DN80"
    },
    {
      id: "manual",
      category: "unknown",
      value_text: "Teknisk produkt utan säker artikelträff"
    }
  ], {
    approvedRequirementIds: new Set(["approved"]),
    memoryFingerprints: new Set(["known-fingerprint"])
  });

  assert.deepEqual(
    result.greenRequirements.map((requirement) => requirement.id),
    ["pdf-article", "learned", "approved"]
  );
  assert.deepEqual(
    result.yellowRequirements.map((requirement) => requirement.id),
    ["manual"]
  );
});
