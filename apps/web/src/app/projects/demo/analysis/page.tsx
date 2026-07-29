"use client";

import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  ClipboardCheck,
  HelpCircle,
  ListChecks,
  PackageCheck,
  SearchX,
  ShieldCheck
} from "lucide-react";
import { Badge } from "@/components/Badge";
import { AnalysisPipeline } from "@/components/AnalysisPipeline";
import { Button } from "@/components/Button";
import { ConfidenceBadge } from "@/components/ConfidenceBadge";
import { DemoBadge } from "@/components/DemoBadge";
import { DemoFlowNav } from "@/components/DemoFlowNav";
import {
  demoAnalysisPipelineSteps,
  demoAnalysisSummary,
  demoMaterialLines,
  demoProductResolutionRows,
  demoProjectProfile,
  demoReviewQuestions
} from "@/lib/mock-data";
import {
  buildCategoryBreakdown,
  getAverageConfidence,
  getDetectedCategories,
  getMissingProducts
} from "@/lib/pipeline-analysis";
import {
  useActiveUploadDocument,
  useMaterialListConsistencyWarning
} from "@/lib/upload-session";
import type { DemoSummaryItem } from "@/types";
import type { PdfExtractionResult } from "@/modules/pdf-extractor";

export default function AnalysisPage() {
  const uploadState = useActiveUploadDocument();
  const activeDocument =
    uploadState.status === "ready" ? uploadState.activeDocument : null;
  const sessionError =
    uploadState.status === "ready" ? uploadState.error : null;
  const materialItems =
    uploadState.status === "loading"
      ? []
      : activeDocument?.materialList ?? demoMaterialLines;
  const productMatches =
    uploadState.status === "loading"
      ? []
      : activeDocument?.productMatches ?? demoProductResolutionRows;
  const missingProducts =
    uploadState.status === "loading"
      ? []
      : activeDocument?.missingProducts ?? getMissingProducts(materialItems);
  const averageConfidence = getAverageConfidence(materialItems);
  const detectedCategories = getDetectedCategories(materialItems);
  const isBalanced =
    productMatches.length + missingProducts.length === materialItems.length;
  const categoryBreakdown =
    activeDocument?.categoryBreakdown ??
    buildCategoryBreakdown({
      materialItems,
      matchedProducts: productMatches
    });
  const analysisSummary = activeDocument
    ? buildUploadedAnalysisSummary(
        activeDocument.extractionResult,
        averageConfidence
      )
    : demoAnalysisSummary;
  const summaryCards = [
    {
      label: "Material List Items",
      value: `${materialItems.length}`,
      icon: ClipboardCheck
    },
    {
      label: "Matched Products",
      value: `${productMatches.length}`,
      icon: PackageCheck
    },
    {
      label: "Missing Products",
      value: `${missingProducts.length}`,
      icon: SearchX
    },
    {
      label: "Categories Found",
      value: `${detectedCategories.length}`,
      icon: BarChart3
    },
    {
      label: "Average Confidence",
      value: `${averageConfidence}%`,
      icon: ShieldCheck
    }
  ];

  useMaterialListConsistencyWarning({
    materialListLength: materialItems.length,
    matchedProductsLength: productMatches.length,
    missingProductsLength: missingProducts.length
  });

  if (uploadState.status === "loading") {
    return <DocumentState title="Loading current document" />;
  }

  if (sessionError) {
    return (
      <DocumentState
        title="Analysis needs to be refreshed"
        message={sessionError}
      />
    );
  }

  return (
    <div className="space-y-6">
      <DemoFlowNav />

      <header className="rounded-lg border border-ink-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              {activeDocument ? (
                <Badge tone="green">Uploaded document</Badge>
              ) : (
                <DemoBadge />
              )}
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
                Analysis complete
              </span>
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-normal text-ink-950">
              Technical Specification Analysis
            </h1>
            <p className="mt-2 text-sm leading-6 text-ink-600">
              {activeDocument?.fileName ?? demoProjectProfile.fileName} -{" "}
              {activeDocument?.extractionResult.project.name ??
                demoProjectProfile.project}
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

      <section className="rounded-lg border border-ink-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 border-b border-ink-100 pb-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-ink-950">
              Extraction Workflow Dashboard
            </h2>
            <p className="mt-1 text-sm text-ink-600">
              Technical specification to consolidated material items, matched
              products and missing database products.
            </p>
          </div>
          <Badge tone={isBalanced ? "green" : "rose"}>
            {isBalanced
              ? "Matched + missing = material list"
              : "Pipeline count mismatch"}
          </Badge>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {summaryCards.map((card) => {
            const Icon = card.icon;

            return (
              <div key={card.label} className="rounded-lg bg-ink-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-ink-500">{card.label}</p>
                  <Icon className="h-4 w-4 text-flow-700" aria-hidden="true" />
                </div>
                <p className="mt-2 text-2xl font-semibold text-ink-950">
                  {card.value}
                </p>
              </div>
            );
          })}
        </div>

        <div className="mt-6">
          <h3 className="text-sm font-semibold text-ink-950">
            Category Breakdown
          </h3>
          <p className="mt-1 text-sm text-ink-500">
            Consolidated material items, database matches, and missing products
            by category.
          </p>
        </div>

        <div className="mt-3 overflow-x-auto rounded-lg border border-ink-200">
          <table className="min-w-[620px] divide-y divide-ink-200 text-left text-sm">
            <thead className="bg-ink-50 text-xs uppercase tracking-normal text-ink-500">
              <tr>
                {["Category", "Material Items", "Matched", "Missing"].map((heading) => (
                  <th key={heading} className="px-4 py-3 font-semibold">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100 bg-white">
              {categoryBreakdown.map((row) => (
                <tr key={row.category}>
                  <td className="px-4 py-3 font-semibold text-ink-950">
                    {row.category}
                  </td>
                  <td className="px-4 py-3 text-ink-700">{row.materialItems}</td>
                  <td className="px-4 py-3 text-emerald-700">{row.matched}</td>
                  <td className="px-4 py-3 text-amber-700">{row.missing}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

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
                    Extraction Summary
                  </h2>
                  <p className="text-sm text-ink-500">
                    Extracted document signals
                  </p>
                </div>
              </div>
              <ConfidenceBadge score={94} />
            </div>
            <dl className="mt-5 space-y-4 text-sm">
              {analysisSummary.map((item) => (
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

function buildUploadedAnalysisSummary(
  result: PdfExtractionResult,
  averageConfidence: number
): DemoSummaryItem[] {
  const systems = Array.from(
    new Set(result.systems.map((system) => system.name).filter(Boolean))
  );
  const standards = Array.from(
    new Set(result.standards.map((standard) => standard.code).filter(Boolean))
  );

  return [
    {
      label: "Detected systems",
      value: systems.length > 0 ? systems.join(", ") : "No system detected"
    },
    {
      label: "Standards detected",
      value: standards.length > 0 ? standards.join(", ") : "No standard detected"
    },
    {
      label: "Extracted material lines",
      value: `${result.lineItems.length}`
    },
    {
      label: "Technical requirements",
      value: `${result.requirements.length}`
    },
    {
      label: "Warnings for review",
      value: `${result.warnings.length}`
    },
    {
      label: "Average confidence",
      value: `${averageConfidence}%`
    }
  ];
}

function DocumentState({
  title,
  message
}: {
  title: string;
  message?: string;
}) {
  return (
    <div className="space-y-6">
      <DemoFlowNav />
      <section className="rounded-lg border border-ink-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-ink-950">{title}</h1>
        {message && (
          <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-600">
            {message}
          </p>
        )}
        <Link
          href="/projects/demo/upload"
          className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-lg bg-flow-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-flow-700"
        >
          Open document upload
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </section>
    </div>
  );
}
