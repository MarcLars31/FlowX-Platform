import { MATCHING_RULES } from "./matching-rule-catalog";

export const FEEDBACK_KINDS = { error: "Fel på regel", change: "Föreslå ändring" } as const;
export type RuleFeedbackKind = keyof typeof FEEDBACK_KINDS;
export type RuleFeedbackStatus = "open" | "resolved";
export type RuleFeedback = {
  id: string; organization_id: string | null; rule_id: string; rule_title: string;
  rule_version: string; kind: RuleFeedbackKind; body: string; author_id: string;
  author_name: string; status: RuleFeedbackStatus; created_at: string;
  resolved_at: string | null; resolved_by: string | null; can_resolve: boolean;
};
export const isFeedbackId = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export function parseRuleFeedback(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const rule = MATCHING_RULES.find(item => item.id === input.rule_id);
  if (!rule || !isFeedbackId(input.id) || (input.kind !== "error" && input.kind !== "change") || typeof input.body !== "string") return null;
  const body = input.body.trim();
  if (!body || body.length > 3000) return null;
  return { id: input.id, rule, kind: input.kind, body };
}

export function canResolveFeedback(row: Pick<RuleFeedback, "organization_id" | "author_id">, actor: { id: string; platformAdmin: boolean; organizationId: string | null; organizationAdmin: boolean }) {
  return actor.platformAdmin || (row.organization_id !== null && row.organization_id === actor.organizationId && (row.author_id === actor.id || actor.organizationAdmin));
}
