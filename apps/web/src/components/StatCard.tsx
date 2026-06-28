import type { Stat } from "@/types";
import { cn } from "@/lib/utils";

const toneClasses: Record<Stat["tone"], string> = {
  blue: "bg-blue-50 text-blue-700 ring-blue-100",
  teal: "bg-flow-50 text-flow-700 ring-flow-100",
  amber: "bg-amber-50 text-amber-700 ring-amber-100",
  rose: "bg-rose-50 text-rose-700 ring-rose-100"
};

export function StatCard({ stat }: { stat: Stat }) {
  const Icon = stat.icon;

  return (
    <article className="rounded-lg border border-ink-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-ink-500">{stat.label}</p>
          <p className="mt-3 text-3xl font-semibold tracking-normal text-ink-950">
            {stat.value}
          </p>
        </div>
        <div
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-lg ring-1 ring-inset",
            toneClasses[stat.tone]
          )}
        >
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
      </div>
      <p className="mt-4 text-sm text-ink-500">{stat.delta}</p>
    </article>
  );
}
