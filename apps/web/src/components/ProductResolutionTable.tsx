import { Eye } from "lucide-react";
import { Button } from "@/components/Button";
import { ConfidenceBadge } from "@/components/ConfidenceBadge";
import type { ProductResolutionRow } from "@/types";

export function ProductResolutionTable({
  rows
}: {
  rows: ProductResolutionRow[];
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-ink-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-[1100px] divide-y divide-ink-200">
          <thead className="bg-ink-50">
            <tr>
              {[
                "Requirement",
                "Extracted from document",
                "Compatible products",
                "Compliance",
                "Confidence",
                "Selected product"
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
            {rows.map((row) => {
              const selectOptions = [
                row.selectedProduct,
                ...row.compatibleProducts.map(
                  (supplier) => `${supplier} compatible alternative`
                )
              ];

              return (
                <tr key={row.id} className="align-top hover:bg-ink-50/70">
                  <td className="min-w-60 px-4 py-4 text-sm font-semibold text-ink-950">
                    {row.requirement}
                  </td>
                  <td className="min-w-56 px-4 py-4 text-sm text-ink-600">
                    {row.extracted}
                  </td>
                  <td className="min-w-52 px-4 py-4 text-sm text-ink-600">
                    <div className="flex flex-wrap gap-2">
                      {row.compatibleProducts.map((product) => (
                        <span
                          key={product}
                          className="rounded-full bg-ink-100 px-2.5 py-1 text-xs font-semibold text-ink-700"
                        >
                          {product}
                        </span>
                      ))}
                    </div>
                    <Button className="mt-3" variant="ghost">
                      <Eye className="h-4 w-4" aria-hidden="true" />
                      View alternatives
                    </Button>
                  </td>
                  <td className="min-w-48 px-4 py-4 text-sm text-ink-600">
                    {row.compliance}
                  </td>
                  <td className="whitespace-nowrap px-4 py-4 text-sm">
                    <ConfidenceBadge score={row.confidence} />
                  </td>
                  <td className="min-w-72 px-4 py-4 text-sm">
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
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
