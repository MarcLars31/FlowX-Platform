import { CheckCircle2 } from "lucide-react";
import type { PipelineStep } from "@/types";

export function AnalysisPipeline({ steps }: { steps: PipelineStep[] }) {
  return (
    <div className="rounded-lg border border-ink-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-ink-950">
            Analysis pipeline
          </h2>
          <p className="mt-1 text-sm text-ink-500">
            Technical specification extraction completed.
          </p>
        </div>
        <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 ring-1 ring-emerald-200">
          Complete
        </div>
      </div>
      <ol className="mt-5 space-y-3">
        {steps.map((step, index) => (
          <li
            key={step.name}
            className="grid grid-cols-[36px_1fr] gap-3 rounded-lg border border-ink-100 bg-ink-50/60 p-3"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-emerald-600 ring-1 ring-emerald-100">
              <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-semibold text-ink-950">
                {index + 1}. {step.name}
              </p>
              <p className="mt-1 text-sm leading-6 text-ink-600">
                {step.detail}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
