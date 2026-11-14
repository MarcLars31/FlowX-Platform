import assert from "node:assert/strict";
import test from "node:test";

import baseline from "./__fixtures__/sprinkler-matching-baseline.v1.json";

type BaselineState = "candidate" | "no_exact_match" | "unreviewable";

type BaselineCase = {
  id: string;
  documentId: string;
  quantity: number | null;
  baseline: {
    state: BaselineState;
    articleNumber: string | null;
    reasonCodes: string[];
  };
  review: {
    status: "pending" | "approved" | "rejected";
    outcome: "correct" | "wrong_product" | "not_in_assortment" | null;
    selectedArticleNumber: string | null;
    comment: string | null;
  };
};

type ExpectedSummary = {
  positions: number;
  quantifiedUnits: number;
  candidatePositions: number;
  candidateUnits: number;
  noExactMatchPositions: number;
  noExactMatchUnits: number;
  unreviewablePositions: number;
};

test("sprinkler matching baseline keeps its pinned inputs and unique cases", () => {
  assert.equal(baseline.schemaVersion, 1);
  assert.equal(baseline.cases.length, 18);
  assert.equal(new Set(baseline.cases.map((item) => item.id)).size, baseline.cases.length);

  for (const document of baseline.inputs.documents) {
    assert.match(document.sha256, /^[A-F0-9]{64}$/);
  }
  assert.match(baseline.inputs.catalog.sha256, /^[A-F0-9]{64}$/);
  assert.match(baseline.inputs.reviewWorkbook.sha256, /^[A-F0-9]{64}$/);
});

test("sprinkler matching baseline reproduces the reviewed summary", () => {
  const cases = baseline.cases as BaselineCase[];
  for (const documentId of ["1403", "vaga"] as const) {
    assert.deepEqual(
      summarize(cases.filter((item) => item.documentId === documentId)),
      baseline.expectedSummary[documentId] as ExpectedSummary
    );
  }
});

test("baseline and later human review remain separate", () => {
  const validReasons = new Set(Object.keys(baseline.reasonCodes));
  const validReviewStatuses = new Set(["pending", "approved", "rejected"]);
  const validOutcomes = new Set(["correct", "wrong_product", "not_in_assortment"]);

  for (const item of baseline.cases as BaselineCase[]) {
    assert.ok(item.baseline.reasonCodes.length > 0, `${item.id} must explain its baseline decision`);
    for (const reason of item.baseline.reasonCodes) {
      assert.ok(validReasons.has(reason), `${item.id} uses unknown reason code ${reason}`);
    }
    if (item.baseline.state === "candidate") {
      assert.ok(item.baseline.articleNumber, `${item.id} candidate must identify an article`);
    }

    assert.ok(validReviewStatuses.has(item.review.status), `${item.id} has an invalid review status`);
    if (item.review.outcome !== null) {
      assert.ok(validOutcomes.has(item.review.outcome), `${item.id} has an invalid review outcome`);
    }
    if (item.review.status === "approved") {
      assert.ok(item.review.outcome, `${item.id} approved review must have an outcome`);
      assert.ok(item.review.comment, `${item.id} approved review must explain the decision`);
      if (item.review.outcome !== "not_in_assortment") {
        assert.ok(item.review.selectedArticleNumber, `${item.id} approved product must identify an article`);
      }
    }
  }
});

function summarize(cases: BaselineCase[]): ExpectedSummary {
  const quantityFor = (state: BaselineState) => cases
    .filter((item) => item.baseline.state === state)
    .reduce((sum, item) => sum + (item.quantity ?? 0), 0);

  return {
    positions: cases.length,
    quantifiedUnits: cases.reduce((sum, item) => sum + (item.quantity ?? 0), 0),
    candidatePositions: cases.filter((item) => item.baseline.state === "candidate").length,
    candidateUnits: quantityFor("candidate"),
    noExactMatchPositions: cases.filter((item) => item.baseline.state === "no_exact_match").length,
    noExactMatchUnits: quantityFor("no_exact_match"),
    unreviewablePositions: cases.filter((item) => item.baseline.state === "unreviewable").length
  };
}
