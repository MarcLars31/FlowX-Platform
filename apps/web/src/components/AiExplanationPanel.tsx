import { Bot, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/Badge";

type AiExplanationPanelProps = {
  title?: string;
  text: string;
};

export function AiExplanationPanel({
  title = "Why this product?",
  text
}: AiExplanationPanelProps) {
  return (
    <aside className="rounded-lg border border-ink-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-flow-50 text-flow-700">
            <Bot className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-ink-950">{title}</h2>
            <p className="text-sm text-ink-500">FlowX recommendation context</p>
          </div>
        </div>
        <Badge tone="teal">AI</Badge>
      </div>
      <div className="mt-5 rounded-lg border border-flow-200 bg-flow-50 p-4">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.1em] text-flow-800">
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          Explanation
        </div>
        <p className="text-sm leading-6 text-ink-700">{text}</p>
      </div>
    </aside>
  );
}
