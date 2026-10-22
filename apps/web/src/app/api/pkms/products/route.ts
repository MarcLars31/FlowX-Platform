import { NextResponse } from "next/server";
import { requireOrganizationApi } from "@/lib/organization-api-authorization";
import { isPlatformAdmin } from "@/lib/platform-role";
import { getCurrentUser } from "@/lib/supabase-auth";
import {
  getSupabaseDiagnostics,
  selectSupabaseRows
} from "@/lib/supabase-rest";

export const runtime = "nodejs";

type ProductRow = Record<string, unknown> & {
  id?: string;
  approval_names?: string[];
};

type ProductApprovalRow = {
  product_id?: string;
  approval_id?: string;
};

type ApprovalRow = {
  id?: string;
  name?: string;
};

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "Authentication is required." },
      { status: 401 }
    );
  }

  if (!isPlatformAdmin(user)) {
    const authorization = await requireOrganizationApi([
      "product.search",
      "product.view"
    ]);
    if (authorization.error) return authorization.error;
  }

  try {
    const approvedProducts = await selectSupabaseRows<ProductRow>(
      "approved_products"
    );
    const products = await attachProductDetails(approvedProducts);

    return NextResponse.json({
      products: await attachApprovals(products),
      supabase: getSupabaseDiagnostics()
    });
  } catch {
    return NextResponse.json(
      {
        error: "Could not load products from Supabase.",
        products: [],
        supabase: getSupabaseDiagnostics()
      },
      { status: 500 }
    );
  }
}

async function attachProductDetails(products: ProductRow[]) {
  const ids = products
    .map((product) => product.id)
    .filter((id): id is string => typeof id === "string");

  if (ids.length === 0) return products;

  const detailedProducts = await selectSupabaseRows<ProductRow>("products", {
    id: `in.(${ids.join(",")})`
  });
  const detailsById = new Map(
    detailedProducts
      .filter((product) => product.id)
      .map((product) => [product.id as string, product])
  );

  return products.map((product) => ({
    ...(product.id ? detailsById.get(product.id) : undefined),
    ...product
  }));
}

async function attachApprovals(products: ProductRow[]) {
  try {
    const [productApprovals, approvals] = await Promise.all([
      selectSupabaseRows<ProductApprovalRow>("product_approvals"),
      selectSupabaseRows<ApprovalRow>("approvals")
    ]);
    const approvalNamesById = new Map(
      approvals
        .filter((approval) => approval.id && approval.name)
        .map((approval) => [approval.id as string, approval.name as string])
    );
    const namesByProductId = new Map<string, string[]>();

    productApprovals.forEach((relation) => {
      if (!relation.product_id || !relation.approval_id) return;
      const approvalName = approvalNamesById.get(relation.approval_id);
      if (!approvalName) return;

      const names = namesByProductId.get(relation.product_id) ?? [];
      names.push(approvalName);
      namesByProductId.set(relation.product_id, names);
    });

    return products.map((product) => ({
      ...product,
      approval_names: product.id ? namesByProductId.get(product.id) ?? [] : []
    }));
  } catch {
    return products.map((product) => ({ ...product, approval_names: [] }));
  }
}
