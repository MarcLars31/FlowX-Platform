import { CheckCircle2, FileSpreadsheet, FileText, Send } from "lucide-react";
import { AiAssistantPanel } from "@/components/AiAssistantPanel";
import { Button } from "@/components/Button";
import { ConfidenceBadge } from "@/components/ConfidenceBadge";
import { DemoBadge } from "@/components/DemoBadge";
import { DemoFlowNav } from "@/components/DemoFlowNav";
import { MaterialListDemoTable } from "@/components/MaterialListDemoTable";
import { demoMaterialLines, demoProjectProfile } from "@/lib/mock-data";
import {
  getMatchedProducts,
  getMissingProducts
} from "@/lib/pipeline-analysis";

const assistantResponse =
  "Yes. Scipx found compatible Victaulic alternatives for selected grooved components. Compatibility is based on dimension, pressure rating, joint type, system type and compliance requirements. Final approval should be reviewed by the responsible engineer.";

export default function MaterialListPage() {
  const matchedProducts = getMatchedProducts(demoMaterialLines);
  const missingProducts = getMissingProducts(demoMaterialLines);

  return (
    <div className="space-y-6">
      <DemoFlowNav />

      <header className="rounded-lg border border-ink-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <DemoBadge />
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
                {demoProjectProfile.status}
              </span>
              <ConfidenceBadge score={94} />
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-normal text-ink-950">
              Material List
            </h1>
            <p className="mt-2 text-sm leading-6 text-ink-600">
              {demoProjectProfile.project} - {demoProjectProfile.standard}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary">
              <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
              Export Excel
            </Button>
            <Button variant="secondary">
              <FileText className="h-4 w-4" aria-hidden="true" />
              Export PDF
            </Button>
            <Button variant="secondary">
              <Send className="h-4 w-4" aria-hidden="true" />
              Send to Supplier
            </Button>
            <Button>
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              Approve Material List
            </Button>
          </div>
        </div>

        <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-5">
          {[
            ["Project", demoProjectProfile.project],
            ["Material items", `${demoMaterialLines.length}`],
            ["Matched", `${matchedProducts.length}`],
            ["Missing", `${missingProducts.length}`],
            ["Confidence score", demoProjectProfile.confidenceScore]
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg bg-ink-50 px-3 py-3">
              <dt className="text-ink-500">{label}</dt>
              <dd className="mt-1 font-semibold text-ink-950">{value}</dd>
            </div>
          ))}
        </dl>
      </header>

      <section className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <MaterialListDemoTable lines={demoMaterialLines} />
        <AiAssistantPanel
          prompt="Can I use Victaulic instead of Ahlsell?"
          response={assistantResponse}
          description="Customer-facing answer based on compatible alternatives."
          badge="Demo"
          contextLabel="Scipx response"
        />
      </section>
    </div>
  );
}
