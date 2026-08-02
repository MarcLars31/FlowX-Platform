import Link from "next/link";
import { ArrowRight, PackageCheck, Route, ShieldCheck } from "lucide-react";
import { AiExplanationPanel } from "@/components/AiExplanationPanel";
import { Button } from "@/components/Button";
import { DemoBadge } from "@/components/DemoBadge";
import { DemoFlowNav } from "@/components/DemoFlowNav";
import { ProductResolutionTable } from "@/components/ProductResolutionTable";
import {
  demoMaterialLines,
  demoProductResolutionRows,
  demoProjectProfile
} from "@/lib/mock-data";
import { getMissingProducts } from "@/lib/pipeline-analysis";

const explanation =
  "Scipx selected this product because it matches the detected standard, pressure rating, dimension, system type and supplier preference. Alternative products are shown when they meet the same compliance requirements.";

export default function ProductResolutionPage() {
  const missingProducts = getMissingProducts(demoMaterialLines);
  const isBalanced =
    demoProductResolutionRows.length + missingProducts.length ===
    demoMaterialLines.length;

  return (
    <div className="space-y-6">
      <DemoFlowNav />

      <header className="rounded-lg border border-ink-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <DemoBadge />
              <span className="rounded-full bg-flow-50 px-2.5 py-1 text-xs font-semibold text-flow-800 ring-1 ring-flow-200">
                Product resolution
              </span>
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-normal text-ink-950">
              Product Resolution
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-600">
              Scipx maps extracted requirements to compatible supplier products
              for {demoProjectProfile.project}.
            </p>
          </div>
          <Link href="/projects/demo/material-list">
            <Button className="w-full justify-center sm:w-auto">
              Generate Material List
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </Link>
        </div>
      </header>

      <section className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            {[
              ["Material items", `${demoMaterialLines.length}`],
              ["Matched", `${demoProductResolutionRows.length}`],
              ["Missing", `${missingProducts.length}`],
              ["Validation", isBalanced ? "Balanced" : "Review"]
            ].map(([label, value], index) => {
              const Icon = index === 0 ? Route : index === 1 ? ShieldCheck : PackageCheck;

              return (
                <div
                  key={label}
                  className="rounded-lg border border-ink-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-flow-50 text-flow-700">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div>
                      <p className="text-sm text-ink-500">{label}</p>
                      <p className="mt-1 text-sm font-semibold text-ink-950">
                        {value}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <ProductResolutionTable
            materialItems={demoMaterialLines}
            rows={demoProductResolutionRows}
          />
        </div>

        <div className="space-y-6">
          <AiExplanationPanel text={explanation} />

          <div className="rounded-lg border border-ink-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-ink-950">
              Review status
            </h2>
            <div className="mt-4 space-y-3">
              {[
                ["Standards", "NFPA 13 / NFPA 14 detected"],
                ["Pressure", "12 bar compatibility checked"],
                ["Alternatives", "Equivalent products allowed"],
                ["Output", "Material list ready to generate"]
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-lg bg-ink-50 px-3 py-3 text-sm"
                >
                  <p className="text-ink-500">{label}</p>
                  <p className="mt-1 font-medium text-ink-900">{value}</p>
                </div>
              ))}
            </div>
            <Link href="/projects/demo/material-list" className="mt-5 block">
              <Button className="w-full justify-center">
                Generate Material List
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
