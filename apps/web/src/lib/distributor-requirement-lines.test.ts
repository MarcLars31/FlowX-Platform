import assert from "node:assert/strict";
import test from "node:test";
import { splitDistributorRequirementLines } from "./distributor-requirement-lines";

test("keeps removal rows visible but separate from purchasable products", () => {
  const result = splitDistributorRequirementLines([
    { id: "install-1", status: "extracted_unreviewed", value_json: { operation: "install" } },
    { id: "install-2", status: "extracted_unreviewed", value_json: { operation: "install" } },
    { id: "remove", status: "inferred_unreviewed", value_json: { operation: "remove" } },
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
});
