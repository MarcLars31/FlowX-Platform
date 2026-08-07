import { NextResponse } from "next/server";
import { requireOrganizationApi } from "@/lib/organization-api-authorization";
import {
  insertUserRowReturning,
  selectUserRows,
  updateUserRowsReturning,
  UserSupabaseError
} from "@/lib/supabase-user-rest";
import {
  DEMO_MATCHING_DISCLAIMER,
  matchDemoProducts,
  type DemoCatalogCandidate,
  type ProjectRequirementForMatching
} from "@/lib/demo-product-matching";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };
type ProjectRow = {
  id: string;
  organization_id: string;
  supplier: string | null;
  procurement_strategy: string | null;
};
type ProductRow = {
  id: string;
  manufacturer: string;
  product_no: string;
  product_name: string;
  technical_data: Record<string, unknown> | null;
};
type VariantRow = {
  id: string;
  product_id: string;
  sku: string | null;
  variant_name: string | null;
  dn_size: string | null;
};
type SupplierOptionRow = { supplier_kind: string; supplier_name: string };
type SupplierRow = { id: string; name: string };
type SupplierProductRow = {
  id: string;
  product_variant_id: string | null;
  supplier_sku: string;
};
type SupplierOfferRow = {
  supplier_product_id: string;
  price: number | null;
  currency_code: string | null;
  stock_quantity: number | null;
  stock_status: string | null;
  lead_time_days: number | null;
};
type ApprovalRow = {
  product_id: string | null;
  product_variant_id: string | null;
  approval_text: string | null;
};
type SuggestionRow = {
  id: string;
  requirement_id: string | null;
  product_id: string | null;
  status: string;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    const authorization = await requireOrganizationApi([
      "project.product_suggestion.create"
    ]);
    if (authorization.error) return authorization.error;

    const { id } = await context.params;
    if (!isUuid(id)) {
      return NextResponse.json({ error: "Ogiltigt projekt-id." }, { status: 400 });
    }

    const organizationId = authorization.context.organization.id;
    const [project] = await selectUserRows<ProjectRow>("projects", {
      select: "id,organization_id,supplier,procurement_strategy",
      id: `eq.${id}`,
      organization_id: `eq.${organizationId}`,
      deleted_at: "is.null",
      limit: "1"
    });
    if (!project) {
      return NextResponse.json({ error: "Projektet hittades inte." }, { status: 404 });
    }

    const requirements = await selectUserRows<ProjectRequirementForMatching>(
      "project_requirements",
      {
        select: "id,category,requirement_key,value_text,value_json,status",
        project_id: `eq.${id}`,
        organization_id: `eq.${organizationId}`,
        status: "in.(user_confirmed,user_modified)",
        deleted_at: "is.null",
        order: "created_at.asc"
      }
    );
    if (requirements.length === 0) {
      return NextResponse.json(
        { error: "Godkänn minst ett extraherat krav innan produktmatchningen startas." },
        { status: 409 }
      );
    }

    const [supplierOptions, products] = await Promise.all([
      selectUserRows<SupplierOptionRow>("project_supplier_options", {
        select: "supplier_kind,supplier_name",
        project_id: `eq.${id}`,
        organization_id: `eq.${organizationId}`,
        selection_role: "eq.preferred"
      }),
      selectUserRows<ProductRow>("products", {
        select: "id,manufacturer,product_no,product_name,technical_data",
        product_type: "eq.sprinkler_head",
        status: "eq.approved",
        data_set_id: "not.is.null",
        deleted_at: "is.null",
        order: "product_name.asc"
      })
    ]);

    const productIds = products.map((product) => product.id);
    if (productIds.length === 0) {
      return NextResponse.json(
        { error: "Demodatabasen innehåller inga godkända sprinklervarianter." },
        { status: 409 }
      );
    }

    const [variants, approvals] = await Promise.all([
      selectUserRows<VariantRow>("product_variants", {
        select: "id,product_id,sku,variant_name,dn_size",
        product_id: `in.(${productIds.join(",")})`,
        status: "eq.approved",
        deleted_at: "is.null"
      }),
      selectUserRows<ApprovalRow>("product_approvals", {
        select: "product_id,product_variant_id,approval_text",
        product_id: `in.(${productIds.join(",")})`,
        status: "eq.approved",
        deleted_at: "is.null"
      })
    ]);

    const preferredManufacturer = supplierOptions.find(
      (option) => option.supplier_kind === "manufacturer"
    )?.supplier_name ?? project.supplier;
    const preferredDistributor = supplierOptions.find(
      (option) => option.supplier_kind === "distributor"
    )?.supplier_name ?? null;
    const commercial = await commercialData(
      preferredDistributor,
      variants.map((variant) => variant.id),
      organizationId
    );

    const productById = new Map(products.map((product) => [product.id, product]));
    const catalog: DemoCatalogCandidate[] = variants.flatMap((variant) => {
      const product = productById.get(variant.product_id);
      if (!product) return [];
      const technical = isRecord(product.technical_data) ? product.technical_data : {};
      const supplierListing = commercial.products.get(variant.id);
      const offer = supplierListing ? commercial.offers.get(supplierListing.id) : undefined;
      return [{
        productId: product.id,
        variantId: variant.id,
        productNumber: product.product_no,
        productName: product.product_name,
        variantName: variant.variant_name,
        sku: variant.sku,
        manufacturer: product.manufacturer,
        kFactorMetric: number(technical.kFactorMetric),
        temperatureRatingC: number(technical.temperatureRatingC),
        maximumWorkingPressureBar: number(technical.maximumWorkingPressureBar),
        responseType: text(technical.responseType),
        orientation: text(technical.orientation),
        connectionSize: text(technical.connectionSize) ?? variant.dn_size,
        finish: text(technical.finish),
        approvals: approvals
          .filter((approval) =>
            approval.product_variant_id === variant.id
            || (approval.product_variant_id === null && approval.product_id === product.id)
          )
          .map((approval) => approval.approval_text?.split(":")[0]?.trim())
          .filter((value): value is string => Boolean(value)),
        distributor: preferredDistributor,
        distributorSku: supplierListing?.supplier_sku ?? null,
        price: offer?.price ?? null,
        currency: offer?.currency_code ?? null,
        stockStatus: offer?.stock_status ?? null,
        stockQuantity: offer?.stock_quantity ?? null,
        leadTimeDays: offer?.lead_time_days ?? null
      }];
    });

    const result = matchDemoProducts(requirements, catalog, {
      preferredManufacturer,
      preferredManufacturerOnly: project.procurement_strategy === "Preferred manufacturer only",
      maxPerRequirement: 5
    });
    const existing = await selectUserRows<SuggestionRow>("project_product_suggestions", {
      select: "id,requirement_id,product_id,status",
      project_id: `eq.${id}`,
      organization_id: `eq.${organizationId}`
    });
    const activeKeys = new Set<string>();
    let createdCount = 0;
    let updatedCount = 0;

    for (const match of result.matches) {
      const key = `${match.requirementId}:${match.candidate.productId}`;
      activeKeys.add(key);
      const snapshot = {
        name: match.candidate.productName,
        productNumber: match.candidate.productNumber,
        variantId: match.candidate.variantId,
        variantName: match.candidate.variantName,
        sku: match.candidate.sku,
        manufacturer: match.candidate.manufacturer,
        preferredManufacturer: match.preferredManufacturer,
        distributor: match.candidate.distributor,
        distributorSku: match.candidate.distributorSku,
        price: match.candidate.price,
        currency: match.candidate.currency,
        stockStatus: match.candidate.stockStatus,
        stockQuantity: match.candidate.stockQuantity,
        leadTimeDays: match.candidate.leadTimeDays,
        technical: {
          kFactorMetric: match.candidate.kFactorMetric,
          temperatureRatingC: match.candidate.temperatureRatingC,
          maximumWorkingPressureBar: match.candidate.maximumWorkingPressureBar,
          responseType: match.candidate.responseType,
          orientation: match.candidate.orientation,
          connectionSize: match.candidate.connectionSize,
          finish: match.candidate.finish,
          approvals: match.candidate.approvals
        },
        technicalChecks: match.checks,
        demo: true,
        disclaimer: DEMO_MATCHING_DISCLAIMER
      };
      const previous = existing.find((suggestion) =>
        suggestion.requirement_id === match.requirementId
        && suggestion.product_id === match.candidate.productId
      );
      if (previous) {
        await updateUserRowsReturning("project_product_suggestions", {
          id: `eq.${previous.id}`,
          organization_id: `eq.${organizationId}`
        }, {
          product_snapshot: snapshot,
          match_score: match.technicalScore,
          recommendation_reason: match.reason,
          deviation_type: null,
          deviation_text: null,
          status: previous.status === "rejected" ? "suggested" : previous.status
        });
        updatedCount += 1;
      } else {
        await insertUserRowReturning("project_product_suggestions", {
          organization_id: organizationId,
          project_id: id,
          requirement_id: match.requirementId,
          product_id: match.candidate.productId,
          product_snapshot: snapshot,
          match_score: match.technicalScore,
          recommendation_reason: match.reason,
          status: "suggested",
          created_by: authorization.user.id
        });
        createdCount += 1;
      }
    }

    for (const suggestion of existing) {
      if (!suggestion.requirement_id || !suggestion.product_id) continue;
      const key = `${suggestion.requirement_id}:${suggestion.product_id}`;
      if (activeKeys.has(key) || !["suggested", "needs_review"].includes(suggestion.status)) continue;
      await updateUserRowsReturning("project_product_suggestions", {
        id: `eq.${suggestion.id}`,
        organization_id: `eq.${organizationId}`
      }, {
        status: "needs_review",
        deviation_type: "technical",
        deviation_text: "Förslaget matchar inte längre de bekräftade tekniska kraven."
      });
    }

    return NextResponse.json({
      suggestionCount: result.matches.length,
      createdCount,
      updatedCount,
      skippedRequirementCount: result.skippedRequirementIds.length,
      disclaimer: DEMO_MATCHING_DISCLAIMER,
      message: result.matches.length
        ? `${result.matches.length} tekniskt godkända demoprodukter hittades.`
        : "Inga demoprodukter uppfyllde samtliga bekräftade tekniska krav."
    });
  } catch (error) {
    return matchingError(error);
  }
}

async function commercialData(
  distributorName: string | null,
  variantIds: string[],
  organizationId: string
) {
  const products = new Map<string, SupplierProductRow>();
  const offers = new Map<string, SupplierOfferRow>();
  if (!distributorName || variantIds.length === 0) return { products, offers };

  const [supplier] = await selectUserRows<SupplierRow>("suppliers", {
    select: "id,name",
    name: `eq.${distributorName}`,
    supplier_type: "eq.distributor",
    is_active: "eq.true",
    limit: "1"
  });
  if (!supplier) return { products, offers };

  const listings = await selectUserRows<SupplierProductRow>("supplier_products", {
    select: "id,product_variant_id,supplier_sku",
    supplier_id: `eq.${supplier.id}`,
    product_variant_id: `in.(${variantIds.join(",")})`,
    is_active: "eq.true"
  });
  for (const listing of listings) {
    if (listing.product_variant_id) products.set(listing.product_variant_id, listing);
  }
  if (listings.length === 0) return { products, offers };

  const offerRows = await selectUserRows<SupplierOfferRow>("supplier_offers", {
    select: "supplier_product_id,price,currency_code,stock_quantity,stock_status,lead_time_days",
    organization_id: `eq.${organizationId}`,
    supplier_product_id: `in.(${listings.map((listing) => listing.id).join(",")})`,
    deleted_at: "is.null",
    order: "observed_at.desc"
  });
  for (const offer of offerRows) {
    if (!offers.has(offer.supplier_product_id)) offers.set(offer.supplier_product_id, offer);
  }
  return { products, offers };
}

function number(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function matchingError(error: unknown) {
  if (error instanceof UserSupabaseError) {
    const forbidden = error.status === 401 || error.status === 403 || error.code === "42501";
    return NextResponse.json(
      { error: forbidden ? "Produktmatchningen nekades." : "Produktmatchningen kunde inte genomföras." },
      { status: forbidden ? 403 : 500 }
    );
  }
  return NextResponse.json(
    { error: "Produktmatchningen kunde inte genomföras." },
    { status: 500 }
  );
}
