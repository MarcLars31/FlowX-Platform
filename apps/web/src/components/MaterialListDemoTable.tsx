import { ConfidenceBadge } from "@/components/ConfidenceBadge";
import type { DemoMaterialLine } from "@/types";

export function MaterialListDemoTable({ lines }: { lines: DemoMaterialLine[] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-ink-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-[1180px] divide-y divide-ink-200">
          <thead className="bg-ink-50">
            <tr>
              {[
                "Line",
                "Product category",
                "Requirement",
                "Selected product",
                "Supplier",
                "Quantity",
                "Unit",
                "Confidence",
                "Notes"
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
            {lines.map((line) => (
              <tr key={line.line} className="hover:bg-ink-50/70">
                <td className="whitespace-nowrap px-4 py-4 text-sm font-medium text-ink-900">
                  {line.line}
                </td>
                <td className="whitespace-nowrap px-4 py-4 text-sm text-ink-600">
                  {line.productCategory}
                </td>
                <td className="min-w-64 px-4 py-4 text-sm font-medium text-ink-900">
                  {line.requirement}
                </td>
                <td className="min-w-72 px-4 py-4 text-sm text-ink-600">
                  {line.selectedProduct}
                </td>
                <td className="whitespace-nowrap px-4 py-4 text-sm text-ink-600">
                  {line.supplier}
                </td>
                <td className="whitespace-nowrap px-4 py-4 text-sm font-semibold text-ink-950">
                  {line.quantity}
                </td>
                <td className="whitespace-nowrap px-4 py-4 text-sm text-ink-600">
                  {line.unit}
                </td>
                <td className="whitespace-nowrap px-4 py-4 text-sm">
                  <ConfidenceBadge score={line.confidence} />
                </td>
                <td className="min-w-64 px-4 py-4 text-sm text-ink-600">
                  {line.notes}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
