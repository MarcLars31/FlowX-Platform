import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCommercialProjectInsights,
  type CommercialAssignmentRow,
  type CommercialProjectRow
} from "./commercial-project-insights";
import type { BusinessDevelopmentRequirementRow } from "./business-development-statistics";

const now = new Date("2026-08-29T12:00:00.000Z");

test("returns an empty truthful portfolio without inventing CRM results", () => {
  const insights = buildCommercialProjectInsights({
    projects: [],
    requirements: [],
    assignments: []
  }, now);

  assert.equal(insights.totalProjects, 0);
  assert.equal(insights.activeProjects, 0);
  assert.equal(insights.completedProjects, 0);
  assert.equal(insights.archivedProjects, 0);
  assert.equal(insights.customerCount, 0);
  assert.equal(insights.averageProductProgress, 0);
  assert.equal(insights.projects.length, 0);
  assert.equal(insights.customerSummaries.length, 0);
  assert.equal(insights.topApprovedProducts.length, 0);
  assert.deepEqual(insights.pipeline.map(({ key, count }) => ({ key, count })), [
    { key: "new_request", count: 0 },
    { key: "analysis", count: 0 },
    { key: "product_selection", count: 0 },
    { key: "review", count: 0 },
    { key: "completed", count: 0 }
  ]);
  assert.deepEqual(insights.monthlyActivity.map((month) => month.monthKey), [
    "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08"
  ]);
});

test("connects real projects to technical flow, follow-up and product progress", () => {
  const insights = buildCommercialProjectInsights({
    projects: projectRows(),
    requirements: requirementRows(),
    assignments: assignmentRows()
  }, now);

  assert.equal(insights.totalProjects, 4);
  assert.equal(insights.activeProjects, 2);
  assert.equal(insights.completedProjects, 1);
  assert.equal(insights.archivedProjects, 1);
  assert.equal(insights.createdThisMonth, 2);
  assert.equal(insights.staleProjects, 1);
  assert.equal(insights.overdueProjects, 1);
  assert.equal(insights.customerCount, 2);
  assert.equal(insights.averageProductProgress, 84);

  const matching = insights.projects.find((project) => project.id === "matching");
  assert.ok(matching);
  assert.equal(matching.customerName, "Assemblin");
  assert.equal(matching.ownerUserId, "owner-1");
  assert.equal(matching.technicalPhaseKey, "product_selection");
  assert.equal(matching.technicalPhase, "Produktval");
  assert.equal(matching.totalProductRequirements, 3);
  assert.equal(matching.approvedProductRequirements, 1);
  assert.equal(matching.notInAssortmentCount, 1);
  assert.equal(matching.handledProductRequirements, 2);
  assert.equal(matching.remainingProductRequirements, 1);
  assert.equal(matching.productProgress, 67);
  assert.equal(matching.isStale, true);
  assert.equal(matching.isOverdue, true);
  assert.equal(matching.needsFollowUp, true);
  assert.equal(matching.nextAction, "Följ upp passerat leveransdatum");

  const completed = insights.projects.find((project) => project.id === "completed");
  assert.ok(completed);
  assert.equal(completed.isCompleted, true);
  assert.equal(completed.isActive, false);
  assert.equal(completed.technicalPhaseKey, "completed");
  assert.equal(completed.ownerUserId, "creator-2");
  assert.equal(completed.nextAction, "Projektunderlaget är klart");

  const archived = insights.projects.find((project) => project.id === "archived");
  assert.ok(archived);
  assert.equal(archived.isArchived, true);
  assert.equal(archived.isCompleted, false);
  assert.equal(archived.isActive, false);
  assert.equal(archived.nextAction, "Arkiverat – ingen projektåtgärd");
});

test("excludes demo projects and their requirements and approvals", () => {
  const insights = buildCommercialProjectInsights({
    projects: projectRows(),
    requirements: requirementRows(),
    assignments: assignmentRows()
  }, now);

  assert.equal(insights.projects.some((project) => project.id === "demo"), false);
  assert.equal(insights.topApprovedProducts.some((product) => product.nrfNumber === "9999999"), false);
  assert.equal(insights.customerSummaries.some((customer) => customer.customerName === "Demokund"), false);
});

test("shows the real technical pipeline, customer portfolio and six-month activity", () => {
  const insights = buildCommercialProjectInsights({
    projects: projectRows(),
    requirements: requirementRows(),
    assignments: assignmentRows()
  }, now);

  assert.deepEqual(insights.pipeline, [
    { key: "new_request", label: "Ny förfrågan", count: 1, percentage: 33 },
    { key: "analysis", label: "Under analys", count: 0, percentage: 0 },
    { key: "product_selection", label: "Produktval", count: 1, percentage: 33 },
    { key: "review", label: "Underlag och granskning", count: 0, percentage: 0 },
    { key: "completed", label: "Klart", count: 1, percentage: 33 }
  ]);
  assert.deepEqual(insights.customerSummaries.find((row) => row.customerName === "Assemblin"), {
    customerName: "Assemblin",
    totalProjects: 2,
    activeProjects: 1,
    completedProjects: 1,
    productProgress: 75,
    notInAssortmentCount: 1
  });
  assert.deepEqual(insights.monthlyActivity.find((month) => month.monthKey === "2026-07"), {
    monthKey: "2026-07",
    label: "jul 2026",
    created: 1,
    completed: 0
  });
  assert.deepEqual(insights.monthlyActivity.find((month) => month.monthKey === "2026-08"), {
    monthKey: "2026-08",
    label: "aug 2026",
    created: 2,
    completed: 1
  });
});

test("counts only explicit approvals and deduplicates each requirement in top products", () => {
  const assignments = assignmentRows();
  assignments.push({
    project_id: "matching",
    requirement_id: "matching-approved",
    status: "selected",
    selected_at: "2026-08-01T09:00:00.000Z",
    product_snapshot: approvedSnapshot("1111111", "Äldre produkt")
  });
  assignments.push({
    project_id: "matching",
    requirement_id: "matching-open",
    status: "selected",
    selected_at: "2026-08-20T09:00:00.000Z",
    product_snapshot: {
      source: "distributor_manual",
      approvedByUser: false,
      approvalStatus: "suggested",
      productNumber: "7777777",
      subtitle: "Ej godkänd produkt"
    }
  });

  const insights = buildCommercialProjectInsights({
    projects: projectRows(),
    requirements: requirementRows(),
    assignments
  }, now);

  assert.deepEqual(insights.topApprovedProducts, [
    {
      key: "nrf:9254043",
      name: "1/2\" V2704 sprinklerhuvud K80 SSU 68C QR, mässing",
      nrfNumber: "9254043",
      approvals: 2,
      projectCount: 2
    }
  ]);
});

function projectRows(): CommercialProjectRow[] {
  return [
    {
      id: "matching",
      name: "Vågå svømmehall",
      customer_name: "Assemblin",
      project_number: "A-100",
      status: "active",
      current_stage: "product_matching",
      created_at: "2026-08-05T10:00:00.000Z",
      updated_at: "2026-08-10T10:00:00.000Z",
      assigned_to: "owner-1",
      expected_delivery_date: "2026-08-20"
    },
    {
      id: "completed",
      name: "Färdigt underlag",
      customer_name: " assemblin ",
      status: "proposal_ready",
      current_stage: "completed",
      created_at: "2026-07-01T08:00:00.000Z",
      updated_at: "2026-08-05T08:00:00.000Z",
      created_by: "creator-2"
    },
    {
      id: "new",
      name: "Ny förfrågan",
      customer_name: "Bravida",
      status: "draft",
      current_stage: "documents",
      created_at: "2026-08-28T09:00:00.000Z",
      updated_at: "2026-08-28T09:00:00.000Z",
      expected_delivery_date: "2026-09-30"
    },
    {
      id: "archived",
      name: "Arkiverat projekt",
      status: "archived",
      current_stage: "analysis",
      created_at: "2026-01-02T09:00:00.000Z",
      updated_at: "2026-02-02T09:00:00.000Z"
    },
    {
      id: "demo",
      name: "Statiskt demoexempel",
      customer_name: "Demokund",
      status: "active",
      current_stage: "product_matching",
      created_at: "2026-08-01T09:00:00.000Z",
      updated_at: "2026-08-28T09:00:00.000Z",
      demo_data_set_id: "demo-set"
    }
  ];
}

function requirementRows(): BusinessDevelopmentRequirementRow[] {
  return [
    requirement("matching-approved", "matching", "Sprinklerhuvud K80", {}),
    requirement("matching-gap", "matching", "Specialsprinkler", {
      productResolution: { status: "not_in_assortment" }
    }),
    requirement("matching-open", "matching", "Sprinklerhuvud K115", {}),
    requirement("completed-approved", "completed", "Sprinklerhuvud K80", {}),
    requirement("matching-work", "matching", "HULLTAKING FOR RØRGJENNOMFØRING", {}),
    requirement("demo-approved", "demo", "Demoprodukt", {})
  ];
}

function assignmentRows(): CommercialAssignmentRow[] {
  return [
    {
      project_id: "matching",
      requirement_id: "matching-approved",
      status: "selected",
      selected_at: "2026-08-20T10:00:00.000Z",
      product_snapshot: approvedSnapshot(
        "9254043",
        "1/2\" V2704 sprinklerhuvud K80 SSU 68C QR, mässing"
      )
    },
    {
      project_id: "completed",
      requirement_id: "completed-approved",
      status: "selected",
      selected_at: "2026-08-05T08:00:00.000Z",
      product_snapshot: approvedSnapshot(
        "9254043",
        "1/2\" V2704 sprinklerhuvud K80 SSU 68C QR, mässing"
      )
    },
    {
      project_id: "demo",
      requirement_id: "demo-approved",
      status: "selected",
      selected_at: "2026-08-02T08:00:00.000Z",
      product_snapshot: approvedSnapshot("9999999", "Demoprodukt")
    }
  ];
}

function approvedSnapshot(productNumber: string, subtitle: string) {
  return {
    source: "distributor_manual",
    approvedByUser: true,
    approvalStatus: "user_approved",
    productNumber,
    name: "Sprinkler",
    subtitle
  };
}

function requirement(
  id: string,
  projectId: string,
  valueText: string,
  valueJson: Record<string, unknown>
): BusinessDevelopmentRequirementRow {
  return {
    id,
    project_id: projectId,
    category: "sprinkler_head",
    requirement_key: id,
    value_text: valueText,
    value_json: valueJson,
    status: "user_confirmed"
  };
}
