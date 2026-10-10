"use client";

import Link from "next/link";
import { Fragment, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  ChevronDown,
  CheckCircle2,
  ClipboardList,
  Database,
  ExternalLink,
  FileText,
  Loader2,
  Search,
  ShieldCheck,
  UploadCloud
} from "lucide-react";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { DemoBadge } from "@/components/DemoBadge";
import { DemoFlowNav } from "@/components/DemoFlowNav";
import { demoProjectProfile } from "@/lib/mock-data";
import {
  beginUploadSession,
  resetAnalysisState,
  storeLatestUploadDocument,
  type ActiveUploadDocument
} from "@/lib/upload-session";
import type {
  ExtractedLineItem,
  PdfExtractionResult
} from "@/modules/pdf-extractor";

type ExtractionStatus = "idle" | "extracting" | "complete" | "error";

export default function UploadTechnicalSpecificationPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [status, setStatus] = useState<ExtractionStatus>("idle");
  const [result, setResult] = useState<PdfExtractionResult | null>(null);
  const [activeDocument, setActiveDocument] =
    useState<ActiveUploadDocument | null>(null);
  const [error, setError] = useState<string | null>(null);

  const summary = useMemo(() => buildSummary(result), [result]);

  async function runExtraction(useSample: boolean) {
    if (!useSample && !selectedFile) {
      setError("Choose a PDF file or load the sample extraction.");
      setStatus("error");
      return;
    }

    const formData = new FormData();

    if (useSample) {
      formData.set("sample", "true");
    } else if (selectedFile) {
      formData.set("file", selectedFile);
    }

    const uploadSessionId = beginUploadSession();

    setStatus("extracting");
    setResult(null);
    setActiveDocument(null);
    setError(null);

    try {
      const response = await fetch("/api/pdf-extractor/extract", {
        method: "POST",
        body: formData
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "PDF extraction failed.");
      }

      const extractionResult = payload as PdfExtractionResult;
      const fileName =
        !useSample && selectedFile
          ? selectedFile.name
          : extractionResult.document.fileName ?? "Demo technical specification";
      const uploadedDocument = storeLatestUploadDocument({
        uploadSessionId,
        fileName,
        extractionResult,
        isDemoMode: useSample
      });

      setActiveDocument(uploadedDocument);
      setResult(uploadedDocument.extractionResult);
      setStatus("complete");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "PDF extraction failed."
      );
      setStatus("error");
    }
  }

  return (
    <div className="space-y-6">
      <DemoFlowNav />

      <header className="rounded-lg border border-ink-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <DemoBadge />
              <Badge tone="teal">Specification review</Badge>
              {status === "complete" && <Badge tone="green">Review ready</Badge>}
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-normal text-ink-950">
              Technical Specification Extraction
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-600">
              Scipx reads the sprinkler specification, extracts source-backed
              material requirements and keeps every result reviewable before
              any product matching or procurement work begins.
            </p>
          </div>
          {result ? (
            <Link href="/projects/demo/analysis">
              <Button variant="primary" className="w-full justify-center sm:w-auto">
                Continue to Analysis
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </Link>
          ) : (
            <Button
              variant="secondary"
              className="w-full justify-center sm:w-auto"
              disabled
            >
              Continue to Analysis
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          )}
        </div>
      </header>

      <section className="grid gap-6 xl:grid-cols-[360px_1fr]">
        <aside className="space-y-4">
          <div className="rounded-lg border border-ink-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold uppercase tracking-normal text-ink-500">
              Project Context
            </h2>
            <dl className="mt-4 space-y-3 text-sm">
              {[
                ["Project", demoProjectProfile.project],
                ["Customer", demoProjectProfile.customer],
                ["Standard", demoProjectProfile.standard],
                ["Preferred supplier", demoProjectProfile.preferredSupplier]
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="flex items-start justify-between gap-4 border-b border-ink-100 pb-3 last:border-0 last:pb-0"
                >
                  <dt className="text-ink-500">{label}</dt>
                  <dd className="max-w-[180px] text-right font-semibold text-ink-950">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="rounded-lg border border-ink-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold uppercase tracking-normal text-ink-500">
              Extraction Scope
            </h2>
            <div className="mt-4 space-y-3">
              {[
                "Text by source page",
                "Systems and standards",
                "Material lines and quantities",
                "Dimensions, units and confidence"
              ].map((item) => (
                <div key={item} className="flex items-center gap-3 text-sm">
                  <CheckCircle2
                    className="h-4 w-4 text-flow-700"
                    aria-hidden="true"
                  />
                  <span className="text-ink-700">{item}</span>
                </div>
              ))}
            </div>
          </div>
        </aside>

        <div className="space-y-6">
          <section className="rounded-lg border border-ink-200 bg-white p-5 shadow-sm">
            <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
              <div className="rounded-lg border border-dashed border-flow-300 bg-flow-50/70 p-6">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf"
                  className="sr-only"
                  onChange={(event) => {
                    const nextFile = event.target.files?.[0] ?? null;

                    setSelectedFile(nextFile);
                    setResult(null);
                    setActiveDocument(null);
                    setError(null);
                    setStatus("idle");
                    if (nextFile) {
                      resetAnalysisState();
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex min-h-[220px] w-full flex-col items-center justify-center rounded-lg bg-white px-6 py-8 text-center shadow-sm ring-1 ring-flow-100 transition hover:ring-flow-300"
                >
                  <span className="flex h-14 w-14 items-center justify-center rounded-lg bg-flow-50 text-flow-700 ring-1 ring-flow-100">
                    <UploadCloud className="h-7 w-7" aria-hidden="true" />
                  </span>
                  <span className="mt-5 text-lg font-semibold text-ink-950">
                    {selectedFile
                      ? selectedFile.name
                      : "Select technical specification PDF"}
                  </span>
                  <span className="mt-2 max-w-md text-sm leading-6 text-ink-600">
                    Upload the sprinkler/fire suppression PDF and run the
                    rule-based extraction engine.
                  </span>
                </button>
              </div>

              <div className="flex flex-col justify-between gap-4">
                <div className="rounded-lg bg-ink-50 p-4 ring-1 ring-ink-100">
                  <div className="flex items-start gap-3">
                    <FileText
                      className="mt-0.5 h-5 w-5 text-ink-600"
                      aria-hidden="true"
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink-950">
                        Active document
                      </p>
                      <p className="mt-1 break-words text-sm text-ink-600">
                        {activeDocument?.fileName ??
                          selectedFile?.name ??
                          "No PDF selected"}
                      </p>
                      {activeDocument && (
                        <p className="mt-1 text-xs text-ink-500">
                          Session {activeDocument.uploadSessionId.slice(0, 8)}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {status === "extracting" && <ExtractionProgress />}

                {error && (
                  <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                    {error}
                  </div>
                )}

                <div className="space-y-3">
                  <Button
                    className="w-full justify-center"
                    disabled={status === "extracting"}
                    onClick={() => runExtraction(false)}
                  >
                    {status === "extracting" ? (
                      <Loader2
                        className="h-4 w-4 animate-spin"
                        aria-hidden="true"
                      />
                    ) : (
                      <Search className="h-4 w-4" aria-hidden="true" />
                    )}
                    Extract Technical Specification
                  </Button>
                  <Button
                    variant="secondary"
                    className="w-full justify-center"
                    disabled={status === "extracting"}
                    onClick={() => runExtraction(true)}
                  >
                    <Database className="h-4 w-4" aria-hidden="true" />
                    Load Demo PDF
                  </Button>
                </div>
              </div>
            </div>
          </section>

          {result && (
            <>
              <section className="grid gap-4 md:grid-cols-3">
                {summary.map((item) => {
                  const Icon = item.icon;

                  return (
                    <div
                      key={item.label}
                      className="rounded-lg border border-ink-200 bg-white p-4 shadow-sm"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm text-ink-500">{item.label}</p>
                        <Icon className="h-4 w-4 text-flow-700" aria-hidden="true" />
                      </div>
                      <p className="mt-2 text-2xl font-semibold text-ink-950">
                        {item.value}
                      </p>
                    </div>
                  );
                })}
              </section>

              <section className="grid gap-6 xl:grid-cols-2">
                <DetectedPanel
                  title="Detected Systems"
                  icon={ClipboardList}
                  items={result.systems.map((system) => ({
                    label: system.name,
                    meta: `Page ${system.sourcePage}`,
                    tone: "teal" as const
                  }))}
                  emptyLabel="No systems detected"
                />
                <DetectedPanel
                  title="Detected Standards"
                  icon={ShieldCheck}
                  items={result.standards.map((standard) => ({
                    label: standard.code,
                    meta: `Page ${standard.sourcePage}`,
                    tone: "green" as const
                  }))}
                  emptyLabel="No standards detected"
                />
              </section>

              <ExtractionTable lineItems={result.lineItems} />

              <WarningsPanel warnings={result.warnings} />
            </>
          )}
        </div>
      </section>
    </div>
  );
}

function ExtractionProgress() {
  return (
    <div className="rounded-lg bg-flow-50 p-4 ring-1 ring-flow-100">
      <div className="flex items-center gap-3 text-sm font-semibold text-flow-900">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Extracting specification
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-white">
        <div className="h-full w-2/3 animate-pulse rounded-full bg-flow-600" />
      </div>
      <div className="mt-3 grid gap-2 text-xs text-flow-800">
        <span>Reading page text</span>
        <span>Detecting systems and standards</span>
        <span>Structuring material lines</span>
      </div>
    </div>
  );
}

function DetectedPanel({
  emptyLabel,
  icon: Icon,
  items,
  title
}: {
  emptyLabel: string;
  icon: typeof ClipboardList;
  items: Array<{ label: string; meta: string; tone: "green" | "teal" }>;
  title: string;
}) {
  return (
    <section className="rounded-lg border border-ink-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-flow-50 text-flow-700">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <h2 className="text-base font-semibold text-ink-950">{title}</h2>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {items.length === 0 ? (
          <Badge tone="amber">{emptyLabel}</Badge>
        ) : (
          items.map((item) => (
            <Badge key={`${item.label}-${item.meta}`} tone={item.tone}>
              {item.label} · {item.meta}
            </Badge>
          ))
        )}
      </div>
    </section>
  );
}

function ExtractionTable({ lineItems }: { lineItems: ExtractedLineItem[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <section className="overflow-hidden rounded-lg border border-ink-200 bg-white shadow-sm">
      <div className="flex flex-col gap-2 border-b border-ink-200 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-ink-950">
            Material Requirements
          </h2>
          <p className="mt-1 text-sm text-ink-600">
            Source-backed results for human review.
          </p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-[1180px] divide-y divide-ink-200 text-left text-sm">
          <thead className="bg-ink-50 text-xs uppercase tracking-normal text-ink-500">
            <tr>
              {[
                "Page",
                "Post No.",
                "Spec Code",
                "Category",
                "Description",
                "Dimension",
                "Quantity",
                "Unit",
                "System",
                "Standards",
                "Confidence"
              ].map((heading) => (
                <th key={heading} className="px-4 py-3 font-semibold">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100 bg-white">
            {lineItems.map((item) => {
              const isExpanded = expandedId === item.id;

              return (
                <Fragment key={item.id}>
                  <tr
                    role="button"
                    tabIndex={0}
                    aria-expanded={isExpanded}
                    className="cursor-pointer align-top hover:bg-flow-50/40 focus:outline-none focus-visible:bg-flow-50"
                    onClick={() => setExpandedId(isExpanded ? null : item.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setExpandedId(isExpanded ? null : item.id);
                      }
                    }}
                  >
                    <td className="whitespace-nowrap px-4 py-4 font-semibold text-ink-950">
                      {item.sourcePage}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-ink-700">
                      {item.postNumber ?? "-"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-ink-700">
                      {item.specificationCode ?? item.nsCode ?? "-"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4">
                      <Badge tone={categoryTone(item.category)}>
                        {formatCategory(item.category)}
                      </Badge>
                    </td>
                    <td className="max-w-[320px] px-4 py-4">
                      <div className="flex items-start gap-2">
                        <ChevronDown
                          className={`mt-0.5 h-4 w-4 shrink-0 text-ink-400 transition ${
                            isExpanded ? "rotate-180" : ""
                          }`}
                          aria-hidden="true"
                        />
                        <div>
                          <p className="font-medium text-ink-950">
                            {item.description}
                          </p>
                          <p className="mt-1 line-clamp-2 text-xs leading-5 text-ink-500">
                            {item.sectionTitle ?? item.sourceText}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-ink-700">
                      {item.dimension ?? "-"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 font-semibold text-ink-950">
                      {item.quantity === undefined
                        ? "-"
                        : formatQuantity(item.quantity)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-ink-700">
                      {item.unit ?? "-"}
                    </td>
                    <td className="max-w-[180px] px-4 py-4 text-ink-700">
                      {item.system ?? "-"}
                    </td>
                    <td className="max-w-[170px] px-4 py-4 text-ink-700">
                      {item.standardRefs.length ? item.standardRefs.join(", ") : "-"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4">
                      <div className="flex flex-col gap-2">
                        <span className="font-semibold text-ink-950">
                          {Math.round(item.confidence)}%
                        </span>
                        <ReviewBadge item={item} />
                      </div>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr>
                      <td colSpan={11} className="bg-ink-50 px-4 py-4">
                        <SourceTracePanel item={item} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SourceTracePanel({ item }: { item: ExtractedLineItem }) {
  return (
    <div className="grid gap-4 rounded-lg border border-ink-200 bg-white p-4 shadow-sm lg:grid-cols-[1fr_280px]">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="slate">Source page {item.sourcePage}</Badge>
          {item.sectionTitle && <Badge tone="teal">{item.sectionTitle}</Badge>}
          <Badge tone="green">{Math.round(item.confidence)}% confidence</Badge>
        </div>
        <h3 className="mt-4 text-sm font-semibold text-ink-950">
          Original source text
        </h3>
        <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded-lg bg-ink-950 p-4 text-xs leading-5 text-ink-50">
          {item.sourceTextBlock ?? item.sourceText}
        </pre>
      </div>
      <dl className="grid content-start gap-3 text-sm">
        {[
          ["Post number", item.postNumber ?? "-"],
          ["Specification code", item.specificationCode ?? item.nsCode ?? "-"],
          ["Source page", `${item.sourcePage}`],
          ["Section title", item.sectionTitle ?? "-"],
          ["Confidence", `${Math.round(item.confidence)}%`]
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg bg-ink-50 px-3 py-3">
            <dt className="text-xs font-semibold uppercase tracking-normal text-ink-500">
              {label}
            </dt>
            <dd className="mt-1 break-words font-medium text-ink-950">{value}</dd>
          </div>
        ))}
        <Button
          variant="secondary"
          disabled
          className="mt-1 w-full justify-center"
          aria-label="Open original PDF placeholder"
        >
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
          Open original PDF
        </Button>
      </dl>
    </div>
  );
}

function ReviewBadge({ item }: { item: ExtractedLineItem }) {
  const flags = item.reviewFlags ?? [];

  if (!item.quantity || !item.unit || !item.description) {
    return <Badge tone="rose">Missing data</Badge>;
  }

  const dimensionCritical = ["pipe", "fitting", "valve", "hose"].includes(
    item.category
  );

  if (
    flags.some((flag) => flag !== "high-confidence") ||
    item.category === "unknown" ||
    item.confidence < 88 ||
    (dimensionCritical && !item.dimension)
  ) {
    return <Badge tone="amber">Needs review</Badge>;
  }

  return <Badge tone="green">High confidence</Badge>;
}

function WarningsPanel({
  warnings
}: {
  warnings: PdfExtractionResult["warnings"];
}) {
  return (
    <section className="rounded-lg border border-ink-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
          <AlertCircle className="h-4 w-4" aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-base font-semibold text-ink-950">Warnings</h2>
          <p className="mt-1 text-sm text-ink-600">
            Extraction is not approval; every item remains reviewable.
          </p>
        </div>
      </div>
      <div className="mt-4 space-y-2">
        {warnings.length === 0 ? (
          <Badge tone="green">No warnings</Badge>
        ) : (
          warnings.map((warning) => (
            <div
              key={warning.id}
              className="rounded-lg bg-ink-50 px-4 py-3 text-sm text-ink-700 ring-1 ring-ink-100"
            >
              <span className="font-semibold text-ink-950">{warning.code}</span>
              <span className="ml-2">{warning.message}</span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function buildSummary(result: PdfExtractionResult | null) {
  return [
    {
      label: "Pages",
      value: result?.document.pageCount ?? "-",
      icon: FileText
    },
    {
      label: "Systems",
      value: result?.systems.length ?? "-",
      icon: ClipboardList
    },
    {
      label: "Standards",
      value: result?.standards.length ?? "-",
      icon: ShieldCheck
    }
  ];
}

function categoryTone(category: ExtractedLineItem["category"]) {
  if (category === "unknown") return "amber";
  if (category === "valve" || category === "sensor" || category === "control") {
    return "blue";
  }
  if (category === "sprinkler" || category === "hose") return "teal";
  return "slate";
}

function formatCategory(category: string) {
  return category.charAt(0).toUpperCase() + category.slice(1);
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat("nb-NO", {
    maximumFractionDigits: 2
  }).format(value);
}
