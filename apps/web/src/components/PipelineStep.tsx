import { CheckCircle2, CircleDot } from "lucide-react";
import { Badge } from "@/components/Badge";
import type { PipelineStep as PipelineStepType } from "@/types";

export function PipelineStep({ step }: { step: PipelineStepType }) {
  const isCompleted = step.status === "completed";
  const Icon = isCompleted ? CheckCircle2 : CircleDot;

  return (
    <div className="grid grid-cols-[40px_1fr_auto] items-start gap-3 rounded-lg border border-ink-200 bg-white p-4">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-ink-100 text-ink-600">
        <Icon
          className={isCompleted ? "h-5 w-5 text-emerald-600" : "h-5 w-5"}
          aria-hidden="true"
        />
      </div>
      <div>
        <p className="font-semibold text-ink-950">{step.name}</p>
        <p className="mt-1 text-sm leading-6 text-ink-500">{step.detail}</p>
      </div>
      <Badge tone={isCompleted ? "green" : "slate"}>
        {isCompleted ? "Completed" : "Ready"}
      </Badge>
    </div>
  );
}
