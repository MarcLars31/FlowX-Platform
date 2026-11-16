import assert from "node:assert/strict";
import test from "node:test";
import { buildBusinessDevelopmentStatistics } from "./business-development-statistics";

test("returns zeroed business statistics without product requirements", () => {
  assert.deepEqual(buildBusinessDevelopmentStatistics({
    requirements: [],
    assignments: []
  }), {
    totalProductRequirements: 0,
    approvedProductRequirements: 0,
    notInAssortmentCount: 0,
    productCoverageRate: 0,
    handledProductRate: 0,
    gapOpportunities: []
  });
});

test("summarizes approved products and recurring assortment gaps", () => {
  const statistics = buildBusinessDevelopmentStatistics({
    requirements: [
      requirement("approved", "project-1", "pipe", "Rör DN50", { quantity: 12, unit: "m" }),
      requirement("gap-1", "project-1", "valve", "Specialventil PN16", {
        quantity: 2,
        unit: "st",
        productResolution: { status: "not_in_assortment" }
      }),
      requirement("gap-2", "project-2", "valve", "Specialventil PN16", {
        quantity: 3,
        unit: "st",
        productResolution: { status: "not_in_assortment" }
      }),
      requirement("work", "project-2", "other", "HULLTAKING FOR RØRGJENNOMFØRING", {}),
      requirement("remove", "project-2", "pipe", "Rör som demonteras", { operation: "remove" }),
      { ...requirement("rejected", "project-2", "pipe", "Rör DN25", {}), status: "rejected" }
    ],
    assignments: [
      {
        requirement_id: "approved",
        status: "selected",
        product_snapshot: {
          source: "distributor_manual",
          approvedByUser: true,
          approvalStatus: "user_approved"
        }
      },
      {
        requirement_id: "gap-1",
        status: "selected",
        product_snapshot: { source: "distributor_manual" }
      }
    ]
  });

  assert.equal(statistics.totalProductRequirements, 3);
  assert.equal(statistics.approvedProductRequirements, 1);
  assert.equal(statistics.notInAssortmentCount, 2);
  assert.equal(statistics.productCoverageRate, 33);
  assert.equal(statistics.handledProductRate, 100);
  assert.deepEqual(statistics.gapOpportunities, [
    {
      key: "valve:specialventil pn16",
      name: "Specialventil PN16",
      category: "Ventiler",
      occurrences: 2,
      projectCount: 2,
      quantity: 5,
      unit: "st",
      priority: "medium",
      recommendedAction: "Begär projektpris när behovet återkommer"
    }
  ]);
});

test("groups assortment gaps by mapping fingerprint when specifications share a product need", () => {
  const first = requirement("gap-a", "project-1", "sprinkler_head", "Sprinklerhuvud K80 – upp", {
    productResolution: { status: "not_in_assortment" }
  });
  const second = requirement("gap-b", "project-2", "sprinkler_head", "Sprinklerhuvud K80 – ned", {
    productResolution: { status: "not_in_assortment" }
  });

  const statistics = buildBusinessDevelopmentStatistics({
    requirements: [
      { ...first, mapping_fingerprint: "shared-fingerprint" },
      { ...second, mapping_fingerprint: "shared-fingerprint" }
    ],
    assignments: []
  });

  assert.equal(statistics.gapOpportunities.length, 1);
  assert.equal(statistics.gapOpportunities[0].key, "shared-fingerprint");
  assert.equal(statistics.gapOpportunities[0].occurrences, 2);
  assert.equal(statistics.gapOpportunities[0].projectCount, 2);
});

function requirement(
  id: string,
  projectId: string,
  category: string,
  valueText: string,
  valueJson: Record<string, unknown>
) {
  return {
    id,
    project_id: projectId,
    category,
    requirement_key: id,
    value_text: valueText,
    value_json: valueJson,
    status: "user_confirmed"
  };
}
