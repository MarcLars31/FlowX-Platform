import test from "node:test";
import assert from "node:assert/strict";
import {
  PROJECT_STAGES,
  isValidProjectStage,
  isValidProjectStatus,
  nextProjectStage
} from "./project-governance";

test("project stages follow the governed workflow", () => {
  assert.equal(PROJECT_STAGES[0][0], "setup");
  assert.equal(nextProjectStage("setup"), "documents");
  assert.equal(nextProjectStage("material_list"), "approval");
  assert.equal(nextProjectStage("completed"), null);
});

test("project stage and status validation rejects unknown values", () => {
  assert.equal(isValidProjectStage("analysis"), true);
  assert.equal(isValidProjectStage("published"), false);
  assert.equal(isValidProjectStatus("active"), true);
  assert.equal(isValidProjectStatus("analysis"), false);
  assert.equal(isValidProjectStatus(null), false);
});
