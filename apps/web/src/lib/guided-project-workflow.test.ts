import test from "node:test";
import assert from "node:assert/strict";
import {
  guidedProjectCompletionUpdate,
  guidedProjectWorkflow,
  isGuidedProjectTab
} from "./guided-project-workflow";

const approvedAssignment = (requirementId: string) => ({
  id: `approved-${requirementId}`, requirement_id: requirementId, status: "selected",
  product_snapshot: { source: "distributor_manual", approvedByUser: true, approvalStatus: "user_approved" }
});

const workRows = [
  { id: "holes", value_text: "HULLTAKING FOR RØRGJENNOMFØRING", value_json: { quantity: 4, unit: "st" } },
  { id: "pressure-test", value_text: "TETTHETSPRØVING", value_json: { quantity: 1, unit: "st" } },
  { id: "meeting", value_text: "FORBEREDENDE MØTER", value_json: { quantity: 2, unit: "st" } },
  { id: "lump-sum", value_text: "Maling av rør", value_json: { quantity: 1, unit: "RS" } },
  { id: "documentation", value_text: "SLUTTDOKUMENTASJON", value_json: { quantity: 1, unit: "st" } }
];

test("completes approved product selection with unmapped work posts after reloading the project", () => {
  const workflow = guidedProjectWorkflow({ documentCount: 1,
    requirements: [...workRows, { id: "pipe", value_text: "Stålrør DN65", value_json: { quantity: 68, unit: "m" } },
      { id: "missing", value_text: "Sprinkler K80", value_json: { quantity: 14, unit: "st", productResolution: { status: "not_in_assortment" } } },
      { id: "removal", value_json: { operation: "remove" } }, { id: "superseded", status: "superseded" }],
    assignments: [approvedAssignment("pipe")]
  });
  assert.equal(workflow.eligibleRequirementCount, 2);
  assert.equal(workflow.mappedRequirementCount, 2);
  assert.equal(workflow.remainingProductCount, 0);
  assert.equal(workflow.isComplete, true);
  assert.deepEqual(guidedProjectCompletionUpdate(), { currentStage: "completed", status: "proposal_ready" });
});

test("projects consisting only of work posts need no product approvals", () => {
  const workflow = guidedProjectWorkflow({ documentCount: 1, requirements: workRows, assignments: [] });
  assert.equal(workflow.eligibleRequirementCount, 0);
  assert.equal(workflow.isComplete, true);
});

test("work exclusions never hide a missing product approval, including measured children of RS posts", () => {
  const requirements = [...workRows, { id: "pipe", display_name: "Stålrør DN65",
    source_excerpt: "Kontrolleres i forberedende møter. Tilhører komplett anlegg – rund sum.",
    value_json: { quantity: 68, unit: "m" } }];
  const workflow = guidedProjectWorkflow({ documentCount: 1, requirements, assignments: [{ ...approvedAssignment("pipe"), product_snapshot: { source: "distributor_manual" } }] });
  assert.equal(workflow.eligibleRequirementCount, 1);
  assert.equal(workflow.remainingProductCount, 1);
  assert.deepEqual(guidedProjectCompletionUpdate(), { currentStage: "completed", status: "proposal_ready" });
});

test("empty projects can close without marking their product workflow complete", () => {
  for (const requirements of [[], [{ id: "rejected", status: "rejected" }, { id: "old", status: "superseded" }]]) {
    const workflow = guidedProjectWorkflow({ documentCount: 1, requirements, assignments: [] });
    assert.equal(workflow.isComplete, false);
    assert.deepEqual(guidedProjectCompletionUpdate(), { currentStage: "completed", status: "proposal_ready" });
  }
});

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

test("allows project completion when an unavailable product is tagged as not in assortment", () => {
  const workflow = guidedProjectWorkflow({
    documentCount: 1,
    requirements: [
      { id: "mapped", status: "user_confirmed" },
      {
        id: "unavailable",
        status: "user_confirmed",
        value_json: {
          productResolution: {
            status: "not_in_assortment",
            tag: "Inte i sortiment"
          }
        }
      }
    ],
    assignments: [
      {
        id: "a1",
        requirement_id: "mapped",
        status: "selected",
        product_snapshot: {
          source: "distributor_manual",
          approvedByUser: true,
          approvalStatus: "user_approved"
        }
      }
    ]
  });

  assert.equal(workflow.mappedRequirementCount, 2);
  assert.equal(workflow.remainingProductCount, 0);
  assert.equal(workflow.isComplete, true);
});

test("recognizes only supported workspace tabs", () => {
  assert.equal(isGuidedProjectTab("requirements"), false);
  assert.equal(isGuidedProjectTab("products"), true);
  assert.equal(isGuidedProjectTab("decisions"), false);
});

test("closes a project after one approved post while leaving other posts incomplete", () => {
  const requirements = [{ id: "selected" }, { id: "unfinished" }];
  const assignments = [approvedAssignment("selected")];
  const workflow = guidedProjectWorkflow({ documentCount: 1, requirements, assignments });
  assert.equal(workflow.isComplete, false);
  assert.equal(workflow.mappedRequirementCount, 1);
  assert.equal(workflow.remainingProductCount, 1);
  assert.deepEqual(guidedProjectCompletionUpdate(), {
    currentStage: "completed",
    status: "proposal_ready"
  });
  assert.equal(assignments.length, 1);
  assert.deepEqual(requirements[1], { id: "unfinished" });
});
