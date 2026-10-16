import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase-auth";
import { getOrganizationContext } from "@/lib/organization-context";
import { isPlatformAdmin } from "@/lib/platform-role";
import { insertUserRowReturning, selectAllUserRows, selectUserRows, updateUserRowsReturning, UserSupabaseError } from "@/lib/supabase-user-rest";
import { readJsonBody, RequestBodyTooLargeError } from "@/lib/request-body";
import { consumeRateLimit } from "@/lib/request-rate-limit";
import { canResolveFeedback, isFeedbackId, parseRuleFeedback, type RuleFeedback } from "@/lib/rule-feedback";
import { RULE_CATALOG_VERSION } from "@/lib/matching-rule-catalog";

const TABLE = "matching_rule_feedback";
const failure = (error: string, status: number) => NextResponse.json({ error }, { status });

async function access() {
  const user = await getCurrentUser();
  if (!user) return { error: failure("Logga in för att läsa eller flagga regler.", 401) } as const;
  const platformAdmin = isPlatformAdmin(user);
  const context = platformAdmin ? null : await getOrganizationContext();
  if (!platformAdmin && (!context || context.organization.status !== "active" || !context.permissions.includes("project.product_suggestion.view"))) {
    return { error: failure("Du saknar behörighet till regler för organisationen.", 403) } as const;
  }
  return { error: null, user, actor: { id: user.id, platformAdmin, organizationId: context?.organization.id ?? null, organizationAdmin: context?.permissions.includes("organization.update") ?? false } } as const;
}

function reportError(error: unknown) {
  if (error instanceof RequestBodyTooLargeError) return failure("Kommentaren är för lång.", 413);
  if (error instanceof SyntaxError) return failure("Ogiltigt innehåll.", 400);
  if (error instanceof UserSupabaseError && [401, 403].includes(error.status)) return failure("Du saknar behörighet eller behöver logga in igen.", error.status);
  console.error("Rule feedback request failed", error instanceof UserSupabaseError ? { status: error.status, code: error.code } : { type: error instanceof Error ? error.name : "unknown" });
  return failure("Flaggningarna kunde inte läsas eller sparas. Försök igen.", 503);
}

export async function GET() {
  try {
    const auth = await access(); if (auth.error) return auth.error;
    const rows = await selectAllUserRows<RuleFeedback>(TABLE, {
      ...(auth.actor.platformAdmin ? {} : { organization_id: `eq.${auth.actor.organizationId}` }),
      order: "created_at.desc,id.desc"
    }, { pageSize: 500, maxRows: 5000 });
    return NextResponse.json({ feedback: rows.map(row => ({ ...row, can_resolve: canResolveFeedback(row, auth.actor) })) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return reportError(error); }
}

export async function POST(request: Request) {
  try {
    const auth = await access(); if (auth.error) return auth.error;
    const input = parseRuleFeedback(await readJsonBody<unknown>(request, 16_384));
    if (!input) return failure("Välj en regel och ange typ samt en kommentar på högst 3 000 tecken.", 400);
    const limit = consumeRateLimit(`rule-feedback:${auth.user.id}`, 30, 60_000);
    if (!limit.allowed) return failure("Vänta en minut innan du skickar fler flaggningar.", 429);
    // A client-generated ID makes retries safe after a lost response.
    const [existing] = await selectUserRows<RuleFeedback>(TABLE, { id: `eq.${input.id}`, limit: "1" });
    if (existing) {
      if (existing.author_id !== auth.user.id || existing.organization_id !== auth.actor.organizationId || existing.rule_id !== input.rule.id || existing.kind !== input.kind || existing.body !== input.body) return failure("Flaggningen har redan skickats med annat innehåll. Uppdatera sidan.", 409);
      return NextResponse.json({ feedback: { ...existing, can_resolve: canResolveFeedback(existing, auth.actor) } });
    }
    const row = await insertUserRowReturning<RuleFeedback>(TABLE, {
      id: input.id, organization_id: auth.actor.organizationId, rule_id: input.rule.id,
      rule_title: input.rule.title, rule_version: RULE_CATALOG_VERSION, kind: input.kind, body: input.body,
      author_name: (auth.user.user_metadata?.full_name?.trim() || auth.user.email || "Användare").slice(0, 200)
    });
    return NextResponse.json({ feedback: { ...row, can_resolve: true } }, { status: 201 });
  } catch (error) { return reportError(error); }
}

export async function PATCH(request: Request) {
  try {
    const auth = await access(); if (auth.error) return auth.error;
    const input = await readJsonBody<{ id?: unknown; status?: unknown } | null>(request, 2048);
    if (!input || !isFeedbackId(input.id) || (input.status !== "open" && input.status !== "resolved")) return failure("Ogiltig flaggning eller status.", 400);
    const [row] = await selectUserRows<RuleFeedback>(TABLE, { id: `eq.${input.id}`, limit: "1", ...(auth.actor.platformAdmin ? {} : { organization_id: `eq.${auth.actor.organizationId}` }) });
    if (!row) return failure("Flaggningen kunde inte hittas.", 404);
    if (!canResolveFeedback(row, auth.actor)) return failure("Endast rapportören eller en administratör kan hantera flaggningen.", 403);
    const updated = await updateUserRowsReturning<RuleFeedback>(TABLE, { id: `eq.${input.id}` }, { status: input.status });
    return NextResponse.json({ feedback: { ...updated, can_resolve: true } });
  } catch (error) { return reportError(error); }
}
