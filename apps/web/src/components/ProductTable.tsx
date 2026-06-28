"use client";

import { Badge } from "@/components/Badge";
import type { Product } from "@/types";

type ProductTableProps = {
  products: Product[];
  selectedProductId: string;
  onSelect: (product: Product) => void;
};

function statusTone(status: Product["status"]) {
  if (status === "Preferred") return "teal";
  if (status === "Verified") return "green";
  return "amber";
}

export function ProductTable({
  products,
  selectedProductId,
  onSelect
}: ProductTableProps) {
  return (
    <div className="overflow-hidden rounded-lg border border-ink-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-ink-200">
          <thead className="bg-ink-50">
            <tr>
              {[
                "Article Number",
                "Product",
                "Supplier",
                "Category",
                "Dimension",
                "Status"
              ].map((heading) => (
                <th
                  key={heading}
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.08em] text-ink-500"
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100 bg-white">
            {products.map((product) => (
              <tr
                key={product.id}
                className={
                  selectedProductId === product.id
                    ? "bg-flow-50"
                    : "hover:bg-ink-50/70"
                }
              >
                <td className="whitespace-nowrap px-4 py-4 text-sm text-ink-600">
                  <button
                    className="font-semibold text-flow-700"
                    onClick={() => onSelect(product)}
                  >
                    {product.articleNumber}
                  </button>
                </td>
                <td className="whitespace-nowrap px-4 py-4 text-sm font-medium text-ink-900">
                  {product.name}
                </td>
                <td className="whitespace-nowrap px-4 py-4 text-sm text-ink-600">
                  {product.supplier}
                </td>
                <td className="whitespace-nowrap px-4 py-4 text-sm text-ink-600">
                  {product.category}
                </td>
                <td className="whitespace-nowrap px-4 py-4 text-sm text-ink-600">
                  {product.dimension}
                </td>
                <td className="whitespace-nowrap px-4 py-4 text-sm">
                  <Badge tone={statusTone(product.status)}>
                    {product.status}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
