import { NextResponse } from "next/server";
import { requireOrganizationApi } from "@/lib/organization-api-authorization";
import {
  insertUserRowReturning,
  selectUserRows,
  UserSupabaseError
} from "@/lib/supabase-user-rest";

export const runtime = "nodejs";

type EstimateInput = {
  areaM2?: unknown;
  sprinklerHeadsPerM2?: unknown;
  reservePercentage?: unknown;
  projectId?: unknown;
  sourceDocumentId?: unknown;
};

type EstimateRow = { id: string };
type RuleRow = {
  id: string;
  rule_key: string;
  category: string;
  description: string;
  quantity_per_m2: number | null;
  fixed_quantity: number | null;
  unit: string;
  conditions: Record<string, unknown>;
};

type EstimateItem = {
  ruleId: string | null;
  category: string;
  description: string;
  quantity: number;
  unit: string;
  rationale: string;
};

export async function POST(request: Request) {
  try {
    const authorization = await requireOrganizationApi([
      "technical_description.estimate"
    ]);
    if (authorization.error) return authorization.error;

    const body = (await request.json().catch(() => null)) as EstimateInput | null;
    const input = validateInput(body);
    if ("error" in input) {
      return NextResponse.json({ error: input.error }, { status: 400 });
    }

    if (input.projectId) {
      const projects = await selectUserRows<{ id: string }>("projects", {
        select: "id",
        id: `eq.${input.projectId}`,
        organization_id: `eq.${authorization.context.organization.id}`,
        deleted_at: "is.null",
        limit: "1"
      });
      if (!projects[0]) {
        return NextResponse.json({ error: "Projektet hittades inte." }, { status: 404 });
      }
    }

    if (input.sourceDocumentId) {
      const documents = await selectUserRows<{ id: string }>(
        "technical_description_documents",
        {
          select: "id",
          id: `eq.${input.sourceDocumentId}`,
          organization_id: `eq.${authorization.context.organization.id}`,
          limit: "1"
        }
      );
      if (!documents[0]) {
        return NextResponse.json(
          { error: "Källdokumentet hittades inte." },
          { status: 404 }
        );
      }
    }

    const organizationId = authorization.context.organization.id;
    const [organizationRules, globalRules] = await Promise.all([
      selectUserRows<RuleRow>("material_estimation_rules", {
        select:
          "id,rule_key,category,description,quantity_per_m2,fixed_quantity,unit,conditions",
        organization_id: `eq.${organizationId}`,
        is_active: "eq.true",
        order: "created_at.asc"
      }),
      selectUserRows<RuleRow>("material_estimation_rules", {
        select:
          "id,rule_key,category,description,quantity_per_m2,fixed_quantity,unit,conditions",
        organization_id: "is.null",
        is_active: "eq.true",
        order: "created_at.asc"
      })
    ]);

    const rules = [...globalRules, ...organizationRules];
    const estimate = await insertUserRowReturning<EstimateRow>("material_estimates", {
      organization_id: organizationId,
      project_id: input.projectId,
      source_document_id: input.sourceDocumentId,
      area_m2: input.areaM2,
      sprinkler_heads_per_m2: input.sprinklerHeadsPerM2,
      reserve_percentage: input.reservePercentage,
      input_parameters: {
        areaM2: input.areaM2,
        sprinklerHeadsPerM2: input.sprinklerHeadsPerM2,
        reservePercentage: input.reservePercentage,
        ruleCount: rules.length
      },
      status: "draft",
      created_by: authorization.user.id
    });

    const items = createEstimateItems({
      rules,
      areaM2: input.areaM2,
      sprinklerHeadsPerM2: input.sprinklerHeadsPerM2,
      reservePercentage: input.reservePercentage
    });
    for (const item of items) {
      await insertUserRowReturning("material_estimate_items", {
        organization_id: organizationId,
        estimate_id: estimate.id,
        rule_id: item.ruleId,
        category: item.category,
        description: item.description,
        quantity: item.quantity,
        unit: item.unit,
        rationale: item.rationale
      });
    }

    return NextResponse.json({
      estimateId: estimate.id,
      items,
      note:
        "Indikativt estimat. Kvoter och material måste verifieras av behörig projektör mot teknisk beskrivning och NS-EN 12845."
    });
  } catch (error) {
    if (error instanceof UserSupabaseError) {
      const forbidden =
        error.status === 401 || error.status === 403 || error.code === "42501";
      return NextResponse.json(
        {
          error: forbidden
            ? "Åtgärden nekades av behörighetsreglerna."
            : "Estimatet kunde inte sparas.",
          detail: error.message
        },
        { status: forbidden ? 403 : 500 }
      );
    }

    return NextResponse.json(
      {
        error: "Estimatet kunde inte skapas.",
        detail: error instanceof Error ? error.message : "Okänt fel."
      },
      { status: 500 }
    );
  }
}

function validateInput(body: EstimateInput | null) {
  const areaM2 = positiveNumber(body?.areaM2, 1_000_000_000);
  const sprinklerHeadsPerM2 = positiveNumber(body?.sprinklerHeadsPerM2, 10);
  const reservePercentage = boundedNumber(body?.reservePercentage ?? 0, 0, 100);
  if (areaM2 === null || sprinklerHeadsPerM2 === null || reservePercentage === null) {
    return {
      error:
        "Ange giltig yta, kvot sprinklerhuvuden per m² och reservprocent."
    } as const;
  }

  const projectId = optionalUuid(body?.projectId);
  const sourceDocumentId = optionalUuid(body?.sourceDocumentId);
  if (body?.projectId != null && projectId === null) {
    return { error: "Ogiltigt projekt-id." } as const;
  }
  if (body?.sourceDocumentId != null && sourceDocumentId === null) {
    return { error: "Ogiltigt källdokument-id." } as const;
  }

  return {
    areaM2,
    sprinklerHeadsPerM2,
    reservePercentage,
    projectId,
    sourceDocumentId
  };
}

function createEstimateItems({
  rules,
  areaM2,
  sprinklerHeadsPerM2,
  reservePercentage
}: {
  rules: RuleRow[];
  areaM2: number;
  sprinklerHeadsPerM2: number;
  reservePercentage: number;
}) {
  const items: EstimateItem[] = rules.map((rule) => {
    const scaled =
      (rule.quantity_per_m2 ?? 0) * areaM2 + (rule.fixed_quantity ?? 0);
    const quantity = applyReserve(scaled, reservePercentage);
    return {
      ruleId: rule.id,
      category: rule.category,
      description: rule.description,
      quantity,
      unit: rule.unit,
      rationale: `${rule.rule_key}: skala per ${areaM2} m² med ${reservePercentage}% reserv.`
    };
  });

  const hasSprinklerRule = items.some((item) => item.category === "sprinkler_head");
  if (!hasSprinklerRule) {
    const base = areaM2 * sprinklerHeadsPerM2;
    items.unshift({
      ruleId: null,
      category: "sprinkler_head",
      description: "Sprinklerhuvuden (indikativ kvot)",
      quantity: applyReserve(base, reservePercentage),
      unit: "pcs",
      rationale: `ceil(${areaM2} m² × ${sprinklerHeadsPerM2} huvuden/m² × (1 + ${reservePercentage}% reserv)).`
    });
  }

  return items;
}

function applyReserve(quantity: number, reservePercentage: number) {
  return Math.ceil(quantity * (1 + reservePercentage / 100));
}

function positiveNumber(value: unknown, max: number) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number > 0 && number <= max ? number : null;
}

function boundedNumber(value: unknown, min: number, max: number) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

function optionalUuid(value: unknown) {
  if (value == null || value === "") return null;
  if (typeof value !== "string") return null;
  return isUuid(value) ? value : null;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}
