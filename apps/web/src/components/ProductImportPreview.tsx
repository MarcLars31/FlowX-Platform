"use client";

import { ArrowLeft, Inbox } from "lucide-react";
import { Button } from "@/components/Button";
import type { NormalizedProduct } from "@/lib/pkms-product-normalizer";

type ProductImportPreviewProps = {
  products: NormalizedProduct[];
  isSubmitting: boolean;
  onSubmit: (products: NormalizedProduct[]) => void;
  onBack: () => void;
};

const columns: Array<{
  key: keyof NormalizedProduct;
  label: string;
}> = [
  { key: "manufacturer", label: "Manufacturer" },
  { key: "product_no", label: "SIN" },
  { key: "product_name", label: "Product name" },
  { key: "k_value_raw", label: "K-factor" },
  { key: "response_type", label: "Response type" },
  { key: "temperature_ratings", label: "Temperature" },
  { key: "color", label: "Color" }
];

export function ProductImportPreview({
  products,
  isSubmitting,
  onSubmit,
  onBack
}: ProductImportPreviewProps) {
  return (
    <section className="overflow-hidden rounded-lg border border-ink-200 bg-white shadow-sm">
      <div className="flex flex-col gap-4 border-b border-ink-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-ink-950">
            Preview imported products
          </h2>
          <p className="mt-1 text-sm text-ink-500">
            Nothing is saved until you send these products to the approval queue.
          </p>
        </div>
        <Button variant="secondary" onClick={onBack} disabled={isSubmitting}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back
        </Button>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-ink-200">
          <thead className="bg-ink-50">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.08em] text-ink-500"
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {products.map((product) => (
              <tr key={product.sourceRow} className="hover:bg-ink-50/70">
                {columns.map((column) => {
                  const value = previewValue(product, column.key);

                  return (
                    <td
                      key={column.key}
                      className="max-w-72 truncate px-5 py-4 text-sm text-ink-700"
                      title={value}
                    >
                      {value}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-3 border-t border-ink-200 bg-ink-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-ink-600">
          {products.length} products will be stored in “Till godkännande”.
        </p>
        <Button
          onClick={() => onSubmit(products)}
          disabled={products.length === 0 || isSubmitting}
        >
          <Inbox className="h-4 w-4" aria-hidden="true" />
          {isSubmitting
            ? "Saving to review database"
            : `Save ${products.length} products for approval`}
        </Button>
      </div>
    </section>
  );
}

function previewValue(product: NormalizedProduct, key: keyof NormalizedProduct) {
  const value = product[key];
  if (value === null || value === undefined || value === "") return "-";

  if (key === "temperature_ratings" && Array.isArray(value)) {
    const temperatures = value
      .map((rating) =>
        typeof rating.sprinklerTemp === "string" ? rating.sprinklerTemp : ""
      )
      .filter(Boolean);

    return temperatures.join(", ") || "-";
  }

  return typeof value === "object" ? JSON.stringify(value) : String(value);
}
