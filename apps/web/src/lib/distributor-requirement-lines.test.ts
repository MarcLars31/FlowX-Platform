import assert from "node:assert/strict";
import test from "node:test";
import { splitDistributorRequirementLines } from "./distributor-requirement-lines";

test("keeps removal rows visible but separate from purchasable products", () => {
  const result = splitDistributorRequirementLines([
    { id: "install-1", status: "extracted_unreviewed", value_json: { operation: "install" } },
    { id: "install-2", status: "extracted_unreviewed", value_json: { operation: "install" } },
    { id: "remove", status: "inferred_unreviewed", value_json: { operation: "remove" } },
    { id: "work", status: "extracted_unreviewed", value_text: "HULLTAKING FOR RØRGJENNOMFØRING", value_json: { operation: "install" } },
    { id: "rejected", status: "rejected", value_json: { operation: "install" } }
  ]);

  assert.deepEqual(
    result.productRequirements.map((requirement) => requirement.id),
    ["install-1", "install-2"]
  );
  assert.deepEqual(
    result.removalRequirements.map((requirement) => requirement.id),
    ["remove"]
  );
  assert.deepEqual(
    result.workRequirements.map((requirement) => requirement.id),
    ["work"]
  );
});

test("keeps material rows that mention installation language in product selection", () => {
  const result = splitDistributorRequirementLines([
    {
      id: "pipe",
      category: "pipe",
      value_text: "Stålrør DN80",
      source_excerpt: "Levering og montering av rørledning",
      value_json: { operation: "install", unit: "m" }
    },
    {
      id: "lump-sum",
      value_text: "BRANNSLOKKEANLEGG - KOMPLETT Rund sum",
      value_json: { operation: "install" }
    }
  ]);

  assert.deepEqual(result.productRequirements.map((item) => item.id), ["pipe"]);
  assert.deepEqual(result.workRequirements.map((item) => item.id), ["lump-sum"]);
});
