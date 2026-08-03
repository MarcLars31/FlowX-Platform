import { NextResponse } from "next/server";
import { requireOrganizationApi } from "@/lib/organization-api-authorization";
import {
  insertUserRowReturning,
  selectUserRows,
  UserSupabaseError
} from "@/lib/supabase-user-rest";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const authorization = await requireOrganizationApi(["project.requirement.create"]);
    if (authorization.error) return authorization.error;
    const { id } = await context.params;
    if (!isUuid(id)) return NextResponse.json({ error: "Ogiltigt projekt-id." }, { status: 400 });
    if (!(await projectExists(id, authorization.context.organization.id))) {
      return NextResponse.json({ error: "Projektet hittades inte." }, { status: 404 });
    }

    const body = (await request.json().catch(() => null)) as RequirementInput | null;
    const input = validateRequirement(body);
    if ("error" in input) return NextResponse.json({ error: input.error }, { status: 400 });

    const requirement = await insertUserRowReturning("project_requirements", {
      organization_id: authorization.context.organization.id,
      project_id: id,
      category: input.category,
      requirement_key: input.requirementKey,
      value_text: input.valueText,
      value_json: input.valueJson,
      certainty: input.certainty,
      confidence: input.confidence,
      status: "pending",
      source_page: input.sourcePage,
      source_section: input.sourceSection,
      source_excerpt: input.sourceExcerpt,
      created_by: authorization.user.id
    });

    return NextResponse.json({ requirement }, { status: 201 });
  } catch (error) {
    return requirementError(error);
  }
}

type RequirementInput = {
  category?: unknown;
  requirementKey?: unknown;
  valueText?: unknown;
  valueJson?: unknown;
  certainty?: unknown;
  confidence?: unknown;
  sourcePage?: unknown;
  sourceSection?: unknown;
  sourceExcerpt?: unknown;
};

function validateRequirement(body: RequirementInput | null) {
  const category = text(body?.category, 100);
  const requirementKey = text(body?.requirementKey, 150);
  if (!category || !requirementKey) {
    return { error: "Kategori och kravnyckel krävs." } as const;
  }
  const valueText = optionalText(body?.valueText, 2000);
  const certainty = body?.certainty === "explicit" ? "explicit" : "interpreted";
  const confidence = body?.confidence == null ? null : boundedNumber(body.confidence, 0, 1);
  if (body?.confidence != null && confidence === null) {
    return { error: "Säkerhetsnivån måste vara mellan 0 och 1." } as const;
  }
  const sourcePage = body?.sourcePage == null ? null : integer(body.sourcePage);
  if (body?.sourcePage != null && sourcePage === null) {
    return { error: "Sidnumret måste vara ett heltal." } as const;
  }
  return {
    category,
    requirementKey,
    valueText,
    valueJson: isRecord(body?.valueJson) ? body.valueJson : {},
    certainty,
    confidence,
    sourcePage,
    sourceSection: optionalText(body?.sourceSection, 200),
    sourceExcerpt: optionalText(body?.sourceExcerpt, 5000)
  };
}

async function projectExists(projectId: string, organizationId: string) {
  const projects = await selectUserRows<{ id: string }>("projects", {
    select: "id",
    id: `eq.${projectId}`,
    organization_id: `eq.${organizationId}`,
    deleted_at: "is.null",
    limit: "1"
  });
  return Boolean(projects[0]);
}

function text(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function optionalText(value: unknown, maxLength: number) {
  return text(value, maxLength);
}

function boundedNumber(value: unknown, min: number, max: number) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

function integer(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function requirementError(error: unknown) {
  if (error instanceof UserSupabaseError) {
    const forbidden = error.status === 401 || error.status === 403 || error.code === "42501";
    return NextResponse.json({ error: forbidden ? "Kravåtgärden nekades." : "Kravet kunde inte sparas.", detail: error.message }, { status: forbidden ? 403 : 500 });
  }
  return NextResponse.json({ error: "Kravet kunde inte sparas.", detail: error instanceof Error ? error.message : "Okänt fel." }, { status: 500 });
}
