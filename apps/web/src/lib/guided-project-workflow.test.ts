import test from "node:test";
import assert from "node:assert/strict";
import {
  guidedProjectCompletionUpdate,
  guidedProjectWorkflow,
  isGuidedProjectTab
} from "./guided-project-workflow";

test("guides a new project directly from upload to product selection", () => {
  const empty = guidedProjectWorkflow({
    documentCount: 0,
    requirements: [],
    assignments: []
  });
  assert.equal(empty.nextTab, "documents");
  assert.deepEqual(empty.completedStepIds, []);

  const extracted = guidedProjectWorkflow({
    documentCount: 1,
    requirements: [{ id: "r1", status: "extracted_unreviewed" }],
    assignments: []
  });
  assert.equal(extracted.nextTab, "products");
  assert.equal(extracted.pendingRequirementCount, 0);
  assert.equal(extracted.remainingProductCount, 1);

  const mapped = guidedProjectWorkflow({
    documentCount: 1,
    requirements: [{ id: "r1", status: "extracted_unreviewed" }],
    assignments: [
      {
        id: "a1",
        requirement_id: "r1",
        status: "selected",
        product_snapshot: {
          source: "distributor_manual",
          approvedByUser: true,
          approvalStatus: "user_approved"
        }
      }
    ]
  });
  assert.equal(mapped.isComplete, true);
  assert.deepEqual(mapped.completedStepIds, [
    "documents",
    "products",
    "result"
  ]);
});

test("rejected and removal rows do not block the product step", () => {
  const workflow = guidedProjectWorkflow({
    documentCount: 1,
    requirements: [
      { id: "rejected", status: "rejected" },
      {
        id: "removal",
        status: "user_confirmed",
        value_json: { operation: "remove" }
      },
      { id: "install", status: "user_confirmed" }
    ],
    assignments: [
      {
        id: "a1",
        requirement_id: "install",
        status: "selected",
        product_snapshot: {
          source: "distributor_manual",
          approvedByUser: true,
          approvalStatus: "user_approved"
        }
      }
    ]
  });

  assert.equal(workflow.pendingRequirementCount, 0);
  assert.equal(workflow.eligibleRequirementCount, 1);
  assert.equal(workflow.isComplete, true);
});

test("a project containing only removal rows needs no new product mapping", () => {
  const workflow = guidedProjectWorkflow({
    documentCount: 1,
    requirements: [
      {
        id: "removal",
        status: "user_confirmed",
        value_json: { operation: "remove" }
      }
    ],
    assignments: []
  });

  assert.equal(workflow.eligibleRequirementCount, 0);
  assert.equal(workflow.remainingProductCount, 0);
  assert.equal(workflow.isComplete, true);
});

test("does not complete the product step for an unapproved suggestion", () => {
  const workflow = guidedProjectWorkflow({
    documentCount: 1,
    requirements: [{ id: "r1", status: "user_confirmed" }],
    assignments: [
      {
        id: "a1",
        requirement_id: "r1",
        status: "selected",
        product_snapshot: { source: "distributor_manual" }
      }
    ]
  });

  assert.equal(workflow.isComplete, false);
  assert.equal(workflow.mappedRequirementCount, 0);
  assert.equal(workflow.remainingProductCount, 1);
});

test("recognizes only supported workspace tabs", () => {
  assert.equal(isGuidedProjectTab("requirements"), false);
  assert.equal(isGuidedProjectTab("products"), true);
  assert.equal(isGuidedProjectTab("decisions"), false);
});

test("only completes a project after every guided step is finished", () => {
  assert.equal(guidedProjectCompletionUpdate({ isComplete: false }), null);
  assert.deepEqual(guidedProjectCompletionUpdate({ isComplete: true }), {
    currentStage: "completed",
    status: "proposal_ready"
  });
});
