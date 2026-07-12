import { Badge } from "@/components/Badge";
import { ConfidenceBadge } from "@/components/ConfidenceBadge";
import {
  groupByCategory,
  isMatched,
  supportedCategories
} from "@/lib/pipeline-analysis";
import type { DemoMaterialLine } from "@/types";

export function MaterialListDemoTable({ lines }: { lines: DemoMaterialLine[] }) {
  const groupedLines = groupByCategory(lines);

  return (
    <div className="space-y-4">
      {supportedCategories.map((category) => {
        const categoryLines = groupedLines[category] ?? [];

        if (categoryLines.length === 0) {
          return null;
        }

        return (
          <section
            key={category}
            className="overflow-hidden rounded-lg border border-ink-200 bg-white shadow-sm"
          >
            <div className="flex items-center justify-between gap-3 bg-ink-50 px-5 py-4">
              <div>
                <h2 className="text-base font-semibold text-ink-950">
                  {category} ({categoryLines.length})
                </h2>
                <p className="mt-1 text-sm text-ink-500">
                  Consolidated material list items.
                </p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-[1080px] divide-y divide-ink-200">
                <thead className="bg-white">
                  <tr>
                    {[
                      "Line",
                      "Description",
                      "Dimension",
                      "Quantity",
                      "Unit",
                      "Confidence",
                      "Database status",
                      "Notes"
                    ].map((heading) => (
                      <th
                        key={heading}
                        scope="col"
                        className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-normal text-ink-500"
                      >
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100 bg-white">
                  {categoryLines.map((line) => {
                    const matched = isMatched(line);

                    return (
                      <tr key={line.line} className="hover:bg-ink-50/70">
                        <td className="whitespace-nowrap px-4 py-4 text-sm font-medium text-ink-900">
                          {line.line}
                        </td>
                        <td className="min-w-72 px-4 py-4 text-sm font-medium text-ink-900">
                          {line.requirement}
                          {line.postNumber && (
                            <p className="mt-1 text-xs text-ink-500">
                              Postnr: {line.postNumber}
                            </p>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-4 text-sm text-ink-600">
                          {line.dimension ?? "-"}
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
                        <td className="whitespace-nowrap px-4 py-4 text-sm">
                          <Badge tone={matched ? "green" : "amber"}>
                            {matched ? "Matched" : "Missing database"}
                          </Badge>
                        </td>
                        <td className="min-w-64 px-4 py-4 text-sm text-ink-600">
                          {line.notes}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}
