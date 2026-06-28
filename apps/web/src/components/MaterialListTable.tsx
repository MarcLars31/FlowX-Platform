import type { MaterialLine } from "@/types";

export function MaterialListTable({ lines }: { lines: MaterialLine[] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-ink-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-ink-200">
          <thead className="bg-ink-50">
            <tr>
              {[
                "Line",
                "Article Number",
                "Product",
                "Supplier",
                "Quantity",
                "Unit",
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
                  {line.articleNumber}
                </td>
                <td className="whitespace-nowrap px-4 py-4 text-sm font-medium text-ink-900">
                  {line.product}
                </td>
                <td className="whitespace-nowrap px-4 py-4 text-sm text-ink-600">
                  {line.supplier}
                </td>
                <td className="whitespace-nowrap px-4 py-4 text-sm text-ink-900">
                  {line.quantity}
                </td>
                <td className="whitespace-nowrap px-4 py-4 text-sm text-ink-600">
                  {line.unit}
                </td>
                <td className="min-w-52 px-4 py-4 text-sm text-ink-600">
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
