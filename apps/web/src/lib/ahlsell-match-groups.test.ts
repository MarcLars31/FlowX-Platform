import assert from "node:assert/strict";
import test from "node:test";
import { ahlsellCatalogStatusFromPayload, classifyAhlsellCatalogCandidates, hasReusableProductMemory, splitAhlsellMatchGroups } from "./ahlsell-match-groups";

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
    ["learned", "approved", "catalog-safe"]
  );
  assert.deepEqual(
    result.yellowRequirements.map((requirement) => requirement.id),
    ["pdf-article", "catalog-found"]
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

test("keeps implausible K-factors out of automatic safe results until handled", () => {
  const anomalousRequirement = (id: string) => ({
    id,
    category: "sprinkler_head",
    value_text: "SPRINKLER",
    value_json: { attributes: { "k-faktor": "560" } }
  });
  const result = splitAhlsellMatchGroups([
    anomalousRequirement("automatic"),
    anomalousRequirement("approved"),
    anomalousRequirement("resolved")
  ], {
    approvedRequirementIds: new Set(["approved", "resolved"]),
    memoryFingerprints: new Set(),
    catalogStatuses: {
      automatic: "none",
      approved: "safe",
      resolved: "safe"
    },
    staticallySafeRequirementIds: new Set(["automatic", "approved", "resolved"])
  });

  assert.deepEqual(result.yellowRequirements.map((item) => item.id), ["automatic"]);
  assert.deepEqual(result.greenRequirements.map((item) => item.id), ["approved", "resolved"]);
});

test("classifies safe, uncertain and empty Ahlsell responses", () => {
  assert.equal(classifyAhlsellCatalogCandidates([{ exactMatch: true, recommendation: "recommended" }]), "safe");
  assert.equal(classifyAhlsellCatalogCandidates([{ matchScore: 100, matchWarnings: [], recommendation: "recommended" }]), "found");
  assert.equal(classifyAhlsellCatalogCandidates([{ matchScore: 95, matchWarnings: [], recommendation: "recommended" }]), "found");
  assert.equal(classifyAhlsellCatalogCandidates([{ recommendation: "possible" }]), "found");
  assert.equal(classifyAhlsellCatalogCandidates([{ recommendation: "unlikely" }]), "none");
  assert.equal(classifyAhlsellCatalogCandidates([]), "none");
});

test("accepts compact and legacy catalog payloads during a rolling deployment", () => {
  assert.equal(ahlsellCatalogStatusFromPayload({ classification: "safe" }), "safe");
  assert.equal(ahlsellCatalogStatusFromPayload({ candidates: [{ exactMatch: true, recommendation: "recommended" }] }), "safe");
  assert.equal(ahlsellCatalogStatusFromPayload({ candidates: [{ recommendation: "recommended" }] }), "found");
  assert.equal(ahlsellCatalogStatusFromPayload({ candidates: [{ recommendation: "possible" }] }), "found");
  assert.equal(ahlsellCatalogStatusFromPayload({ candidates: [] }), "none");
  assert.equal(ahlsellCatalogStatusFromPayload({ error: "temporary" }), null);
});

test("reuses approved history only for the exact stored fingerprint", () => {
  const memoryFingerprints = new Set(["fp-k80-qr"]);
  assert.equal(hasReusableProductMemory({ mapping_fingerprint: "fp-k80-qr" }, memoryFingerprints), true);
  assert.equal(hasReusableProductMemory({ mapping_fingerprint: "fp-k80-sr" }, memoryFingerprints), false);
  assert.equal(hasReusableProductMemory({ mapping_fingerprint: "" }, memoryFingerprints), false);

  const result = splitAhlsellMatchGroups([
    { id: "exact", mapping_fingerprint: "fp-k80-qr", value_text: "Sprinkler K80" },
    { id: "different", mapping_fingerprint: "fp-k80-sr", value_text: "Sprinkler K80" }
  ], {
    approvedRequirementIds: new Set(),
    memoryFingerprints,
    catalogStatuses: { exact: "none", different: "none" }
  });

  assert.deepEqual(result.greenRequirements.map((item) => item.id), ["exact"]);
  assert.deepEqual(result.redRequirements.map((item) => item.id), ["different"]);
});

test("keeps an exact historical fingerprint yellow when the requirement has a data warning", () => {
  const result = splitAhlsellMatchGroups([{
    id: "warning",
    category: "sprinkler_head",
    mapping_fingerprint: "fp-warning",
    value_text: "SPRINKLER",
    value_json: { attributes: { "k-faktor": "560" } }
  }], {
    approvedRequirementIds: new Set(),
    memoryFingerprints: new Set(["fp-warning"]),
    catalogStatuses: { warning: "safe" }
  });

  assert.deepEqual(result.yellowRequirements.map((item) => item.id), ["warning"]);
  assert.equal(result.greenRequirements.length, 0);
});
