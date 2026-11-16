import assert from "node:assert/strict";
import test from "node:test";
import { buildProjectStatistics } from "./project-statistics";

test("returns zeroed statistics when there are no projects", () => {
  assert.deepEqual(buildProjectStatistics([], new Date("2026-08-27T12:00:00Z")), {
    total: 0,
    ongoing: 0,
    completed: 0,
    archived: 0,
    createdThisMonth: 0,
    completionRate: 0,
    byStage: {}
  });
});

test("summarizes project status, stage and creation month", () => {
  const statistics = buildProjectStatistics(
    [
      {
        status: "active",
        current_stage: "product_matching",
        created_at: "2026-08-02T10:00:00Z"
      },
      {
        status: "on_hold",
        current_stage: "documents",
        created_at: "2026-07-31T23:59:00Z"
      },
      {
        status: "active",
        current_stage: "completed",
        created_at: "2026-08-20T10:00:00Z"
      },
      {
        status: "archived",
        current_stage: "completed",
        created_at: "2026-08-21T10:00:00Z"
      }
    ],
    new Date("2026-08-27T12:00:00Z")
  );

  assert.equal(statistics.total, 4);
  assert.equal(statistics.ongoing, 2);
  assert.equal(statistics.completed, 1);
  assert.equal(statistics.archived, 1);
  assert.equal(statistics.createdThisMonth, 3);
  assert.equal(statistics.completionRate, 25);
  assert.deepEqual(statistics.byStage, {
    product_matching: 1,
    documents: 1,
    completed: 2
  });
});
