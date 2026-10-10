import { evaluateTechnicalRequirements } from "../technical-evaluator";
import type { TechnicalStatus } from "../technical-evaluation-model";

/** A real evaluated scalar requirement for presentation-only unit tests. */
export function technicalEvaluationFixture(status: TechnicalStatus = "MATCH", productId = "fixture") {
  return evaluateTechnicalRequirements({ version: 1, revision: "fixture-revision", requirements: [{
    id: "dn", property: "dn", label: "DN", operator: "eq", value: 15, mandatory: true,
    source: { kind: "post", raw: "DN15" }
  }] }, productId, status === "VERIFY" ? [] : [{ property: "dn", value: status === "MATCH" ? 15 : 20,
    productId, source: "fixture:documented-article", raw: status === "MATCH" ? "DN15" : "DN20", documented: true }], new Date("2026-10-07T15:00:00Z"));
}
