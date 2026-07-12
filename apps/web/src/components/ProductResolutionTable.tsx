import Link from "next/link";
import { AlertTriangle, ExternalLink, Eye, PackageCheck } from "lucide-react";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { ConfidenceBadge } from "@/components/ConfidenceBadge";
import {
  getMissingProducts,
  groupByCategory,
  supportedCategories
} from "@/lib/pipeline-analysis";
import type { DemoMaterialLine, ProductResolutionRow } from "@/types";

export function ProductResolutionTable({
  materialItems,
  rows
}: {
  materialItems: DemoMaterialLine[];
  rows: ProductResolutionRow[];
}) {
  const groupedMatched = groupByCategory(rows);
  const missingProducts = getMissingProducts(materialItems);
  const groupedMissing = groupByCategory(missingProducts);

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-ink-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-2 border-b border-ink-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-ink-950">
              Matched Products
            </h2>
            <p className="mt-1 text-sm text-ink-600">
              Database matches grouped by category.
            </p>
          </div>
          <Badge tone="green">{rows.length} matched</Badge>
        </div>
        <div className="mt-5 space-y-4">
          {supportedCategories.map((category) => {
            const categoryRows = groupedMatched[category] ?? [];

            if (categoryRows.length === 0) {
              return null;
            }

            return (
              <section
                key={category}
                className="overflow-hidden rounded-lg border border-ink-200"
              >
                <CategoryHeader
                  category={category}
                  count={categoryRows.length}
                  tone="green"
                />
                <div className="divide-y divide-ink-100">
                  {categoryRows.map((row) => (
                    <MatchedProductRow key={row.id} row={row} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      <div className="rounded-lg border border-amber-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-2 border-b border-amber-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-ink-950">
              Missing From Database
            </h2>
            <p className="mt-1 text-sm text-ink-600">
              Consolidated material items that still need database coverage.
            </p>
          </div>
          <Badge tone="amber">{missingProducts.length} missing</Badge>
        </div>
        <div className="mt-5 space-y-4">
          {supportedCategories.map((category) => {
            const categoryRows = groupedMissing[category] ?? [];

            if (categoryRows.length === 0) {
              return null;
            }

            return (
              <section
                key={category}
                className="overflow-hidden rounded-lg border border-amber-200"
              >
                <CategoryHeader
                  category={category}
                  count={categoryRows.length}
                  tone="amber"
                />
                <div className="divide-y divide-ink-100">
                  {categoryRows.map((item) => (
                    <MissingProductRow key={item.line} item={item} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function CategoryHeader({
  category,
  count,
  tone
}: {
  category: string;
  count: number;
  tone: "green" | "amber";
}) {
  return (
    <div className="flex items-center justify-between gap-3 bg-ink-50 px-4 py-3">
      <div className="flex items-center gap-2">
        <PackageCheck
          className={tone === "green" ? "h-4 w-4 text-emerald-700" : "h-4 w-4 text-amber-700"}
          aria-hidden="true"
        />
        <h3 className="text-sm font-semibold text-ink-950">
          {category} ({count})
        </h3>
      </div>
    </div>
  );
}

function MatchedProductRow({ row }: { row: ProductResolutionRow }) {
  const selectOptions = [
    row.selectedProduct,
    ...row.compatibleProducts.map((supplier) => `${supplier} compatible alternative`)
  ];

  return (
    <div className="grid gap-4 px-4 py-4 lg:grid-cols-[1.2fr_1fr_220px]">
      <div>
        <p className="text-sm font-semibold text-ink-950">{row.requirement}</p>
        <p className="mt-1 text-sm text-ink-600">{row.extracted}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {row.postNumber ? (
            <Link
              href={row.documentHref ?? "/projects/demo/upload"}
              className="inline-flex min-h-8 items-center gap-1.5 rounded-lg bg-flow-50 px-2.5 text-xs font-semibold text-flow-800 ring-1 ring-flow-200 transition hover:bg-flow-100"
            >
              Postnr: {row.postNumber}
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          ) : (
            <Link
              href={row.documentHref ?? "/projects/demo/upload"}
              className="inline-flex min-h-8 items-center gap-1.5 rounded-lg bg-ink-100 px-2.5 text-xs font-semibold text-ink-700 transition hover:bg-ink-200"
            >
              Source page {row.sourcePage ?? "-"}
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          )}
          <ConfidenceBadge score={row.confidence} />
        </div>
        <p className="mt-2 text-xs leading-5 text-ink-500">
          {row.sourceReference}
        </p>
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-normal text-ink-500">
          Database match
        </p>
        <p className="mt-1 text-sm font-medium text-ink-950">
          {row.matchedProduct ?? row.selectedProduct}
        </p>
        <p className="mt-2 text-sm leading-6 text-ink-600">{row.compliance}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {row.compatibleProducts.map((product) => (
            <span
              key={product}
              className="rounded-full bg-ink-100 px-2.5 py-1 text-xs font-semibold text-ink-700"
            >
              {product}
            </span>
          ))}
        </div>
      </div>
      <div>
        <label className="sr-only" htmlFor={`${row.id}-selected`}>
          Selected product for {row.requirement}
        </label>
        <select
          id={`${row.id}-selected`}
          defaultValue={row.selectedProduct}
          className="block h-10 w-full rounded-lg border-ink-200 bg-white text-sm text-ink-900 shadow-sm focus:border-flow-500 focus:ring-flow-500"
        >
          {selectOptions.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
        <Button className="mt-3 w-full justify-center" variant="ghost">
          <Eye className="h-4 w-4" aria-hidden="true" />
          View alternatives
        </Button>
      </div>
    </div>
  );
}

function MissingProductRow({ item }: { item: DemoMaterialLine }) {
  return (
    <div className="grid gap-3 px-4 py-4 md:grid-cols-[1fr_auto]">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-700" aria-hidden="true" />
          <p className="text-sm font-semibold text-ink-950">
            {item.requirement}
          </p>
          {item.postNumber && <Badge tone="slate">Postnr: {item.postNumber}</Badge>}
        </div>
        <div className="mt-2 grid gap-2 text-sm text-ink-600 sm:grid-cols-4">
          <span>Dimension: {item.dimension ?? "-"}</span>
          <span>
            Quantity: {item.quantity} {item.unit}
          </span>
          <span>Confidence: {item.confidence}%</span>
          <span>Database status: Missing</span>
        </div>
      </div>
      <Badge tone="amber">Missing database product</Badge>
    </div>
  );
}
