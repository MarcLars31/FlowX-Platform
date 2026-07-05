import Link from "next/link";
import {
  ArrowRight,
  ClipboardCheck,
  HelpCircle,
  ListChecks,
  ShieldCheck
} from "lucide-react";
import { AnalysisPipeline } from "@/components/AnalysisPipeline";
import { Button } from "@/components/Button";
import { ConfidenceBadge } from "@/components/ConfidenceBadge";
import { DemoBadge } from "@/components/DemoBadge";
import { DemoFlowNav } from "@/components/DemoFlowNav";
import {
  demoAnalysisPipelineSteps,
  demoAnalysisSummary,
  demoProjectProfile,
  demoReviewQuestions
} from "@/lib/mock-data";

export default function AnalysisPage() {
  return (
    <div className="space-y-6">
      <DemoFlowNav />

      <header className="rounded-lg border border-ink-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <DemoBadge />
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
                Analysis complete
              </span>
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-normal text-ink-950">
              Technical Specification Analysis
            </h1>
            <p className="mt-2 text-sm leading-6 text-ink-600">
              {demoProjectProfile.fileName} - {demoProjectProfile.project}
            </p>
          </div>
          <Link href="/projects/demo/product-resolution">
            <Button className="w-full justify-center sm:w-auto">
              Continue to Product Resolution
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </Link>
        </div>
      </header>

      <section className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <AnalysisPipeline steps={demoAnalysisPipelineSteps} />

        <div className="space-y-6">
          <div className="rounded-lg border border-ink-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-flow-50 text-flow-700">
                  <ClipboardCheck className="h-5 w-5" aria-hidden="true" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-ink-950">
                    AI Summary
                  </h2>
                  <p className="text-sm text-ink-500">
                    Extracted document signals
                  </p>
                </div>
              </div>
              <ConfidenceBadge score={94} />
            </div>
            <dl className="mt-5 space-y-4 text-sm">
              {demoAnalysisSummary.map((item) => (
                <div
                  key={item.label}
                  className="border-b border-ink-100 pb-3 last:border-0 last:pb-0"
                >
                  <dt className="text-ink-500">{item.label}</dt>
                  <dd className="mt-1 font-medium leading-6 text-ink-900">
                    {item.value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="rounded-lg border border-ink-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
                <HelpCircle className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-ink-950">
                  Questions for review
                </h2>
                <p className="text-sm text-ink-500">
                  Confirm before final material list
                </p>
              </div>
            </div>
            <div className="mt-5 space-y-3">
              {demoReviewQuestions.map((question, index) => (
                <div
                  key={question}
                  className="rounded-lg border border-ink-100 bg-ink-50/70 p-3"
                >
                  <div className="flex items-start gap-3">
                    <ListChecks
                      className="mt-0.5 h-4 w-4 text-flow-700"
                      aria-hidden="true"
                    />
                    <p className="text-sm font-medium leading-6 text-ink-900">
                      {question}
                    </p>
                  </div>
                  {index === 0 && (
                    <select
                      defaultValue="Ahlsell"
                      className="mt-3 block h-10 w-full rounded-lg border-ink-200 bg-white text-sm text-ink-900 shadow-sm focus:border-flow-500 focus:ring-flow-500"
                    >
                      <option>Ahlsell</option>
                      <option>Onninen</option>
                      <option>Victaulic</option>
                    </select>
                  )}
                  {index === 1 && (
                    <select
                      defaultValue="Shortest lead time"
                      className="mt-3 block h-10 w-full rounded-lg border-ink-200 bg-white text-sm text-ink-900 shadow-sm focus:border-flow-500 focus:ring-flow-500"
                    >
                      <option>Shortest lead time</option>
                      <option>Lowest price</option>
                    </select>
                  )}
                  {index === 2 && (
                    <label className="mt-3 flex items-center gap-2 text-sm font-medium text-ink-700">
                      <input
                        type="checkbox"
                        defaultChecked
                        className="rounded border-ink-300 text-flow-600 focus:ring-flow-500"
                      />
                      Equivalent products allowed
                    </label>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-5 rounded-lg border border-flow-200 bg-flow-50 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-flow-800">
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                Ready for product matching
              </div>
              <p className="text-sm leading-6 text-ink-700">
                FlowX has enough reviewed context to map requirements to
                supplier products and compliant alternatives.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
