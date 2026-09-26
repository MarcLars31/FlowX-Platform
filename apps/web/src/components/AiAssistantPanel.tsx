import { Bot, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/Badge";

type AiAssistantPanelProps = {
  prompt?: string;
  response?: string;
  description?: string;
  badge?: string;
  contextLabel?: string;
};

export function AiAssistantPanel({
  prompt = "Why was this sprinkler selected?",
  response = "This sprinkler was selected because it matches the selected system type, hazard classification and supplier preference. The result is based on the active engineering rules and product compatibility data.",
  description = "AI explanation based on verified Scipx engineering results.",
  badge = "Assistant",
  contextLabel = "Scipx context"
}: AiAssistantPanelProps) {
  return (
    <aside
      id="assistant"
      className="rounded-lg border border-ink-200 bg-white p-5 shadow-sm"
      aria-labelledby="assistant-title"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-flow-50 text-flow-700">
              <Bot className="h-5 w-5" aria-hidden="true" />
            </div>
            <h2
              id="assistant-title"
              className="text-base font-semibold tracking-normal text-ink-950"
            >
              AI Assistant
            </h2>
          </div>
          <p className="mt-3 text-sm leading-6 text-ink-600">{description}</p>
        </div>
        <Badge tone="teal">{badge}</Badge>
      </div>

      <div className="mt-5 space-y-4">
        <div className="rounded-lg bg-ink-100 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-ink-500">
            User prompt
          </p>
          <p className="mt-2 text-sm font-medium text-ink-900">{prompt}</p>
        </div>
        <div className="rounded-lg border border-flow-200 bg-flow-50 p-4">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.1em] text-flow-800">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            {contextLabel}
          </div>
          <p className="text-sm leading-6 text-ink-700">{response}</p>
        </div>
      </div>
    </aside>
  );
}
