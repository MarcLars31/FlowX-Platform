import assert from "node:assert/strict";
import test from "node:test";
import { classifyAhlsellCatalogCandidates, splitAhlsellMatchGroups } from "./ahlsell-match-groups";

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
    },
    {
      id: "catalog-found",
      category: "control",
      value_text: "TRYKKVAKT"
    },
    {
      id: "catalog-safe",
      category: "control",
      value_text: "MÅLEINSTRUMENT"
    }
  ], {
    approvedRequirementIds: new Set(["approved"]),
    memoryFingerprints: new Set(["known-fingerprint"]),
    catalogStatuses: {
      manual: "none",
      "catalog-found": "found",
      "catalog-safe": "safe"
    }
  });

  assert.deepEqual(
    result.greenRequirements.map((requirement) => requirement.id),
    ["pdf-article", "learned", "approved", "catalog-safe"]
  );
  assert.deepEqual(
    result.yellowRequirements.map((requirement) => requirement.id),
    ["catalog-found"]
  );
  assert.deepEqual(
    result.redRequirements.map((requirement) => requirement.id),
    ["manual"]
  );
});

test("keeps unchecked catalog rows yellow until Ahlsell has answered", () => {
  const result = splitAhlsellMatchGroups([{ id: "checking", value_text: "Okänd produkt" }], {
    approvedRequirementIds: new Set(),
    memoryFingerprints: new Set()
  });

  assert.deepEqual(result.yellowRequirements.map((item) => item.id), ["checking"]);
  assert.equal(result.redRequirements.length, 0);
});

test("classifies safe, uncertain and empty Ahlsell responses", () => {
  assert.equal(classifyAhlsellCatalogCandidates([{ recommendation: "recommended" }]), "safe");
  assert.equal(classifyAhlsellCatalogCandidates([{ recommendation: "possible" }]), "found");
  assert.equal(classifyAhlsellCatalogCandidates([]), "none");
});
