"use client";

import { useState, type ChangeEvent } from "react";
import Link from "next/link";
import {
  AlertCircle,
  CheckCircle2,
  UploadCloud
} from "lucide-react";
import { Button } from "@/components/Button";
import { ProductImportPreview } from "@/components/ProductImportPreview";
import {
  normalizeProductImport,
  parseJsonImportText,
  type NormalizedProduct,
  type NormalizationError
} from "@/lib/pkms-product-normalizer";
import type { SupabaseDiagnostics } from "@/lib/supabase-rest";

type ImportError = {
  row: string;
  message: string;
  manufacturer?: string;
  product_no?: string;
};

type ImportResult = {
  total: number;
  queued: number;
  failed: number;
  errors: ImportError[];
  jobLogError?: string;
  supabase?: SupabaseDiagnostics;
};

type ImportStage = "upload" | "review" | "complete";

export default function AdminJsonImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [products, setProducts] = useState<NormalizedProduct[]>([]);
  const [previewErrors, setPreviewErrors] = useState<NormalizationError[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [stage, setStage] = useState<ImportStage>("upload");

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const selectedFile = event.target.files?.[0] ?? null;
    setFile(selectedFile);
    setProducts([]);
    setPreviewErrors([]);
    setResult(null);
    setError(null);
    setStage("upload");

    if (!selectedFile) return;

    try {
      const normalized = normalizeProductImport(
        parseJsonImportText(await selectedFile.text())
      );

      setProducts(normalized.products);
      setPreviewErrors(normalized.errors);
      if (normalized.products.length > 0) setStage("review");
    } catch (parseError) {
      setError(
        parseError instanceof Error
          ? parseError.message
          : "Could not read JSON file."
      );
    }
  }

  async function queueProducts(productsToQueue: NormalizedProduct[]) {
    if (productsToQueue.length === 0) return;

    setIsImporting(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/pkms/import-json", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirmed: true,
          fileName: file?.name ?? "products.json",
          products: productsToQueue
        })
      });
      const payload = (await response.json()) as ImportResult & {
        detail?: string;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.detail ?? payload.error ?? "Import failed.");
      }

      setResult(payload);
      setStage("complete");
    } catch (importError) {
      setError(
        importError instanceof Error
          ? importError.message
          : "Import failed."
      );
    } finally {
      setIsImporting(false);
    }
  }

  function startNewImport() {
    setFile(null);
    setProducts([]);
    setPreviewErrors([]);
    setError(null);
    setResult(null);
    setStage("upload");
  }

  return (
    <div className="space-y-6">
      <header>
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.14em] text-flow-700">
            Admin
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-normal text-ink-950">
            JSON Import
          </h1>
        </div>
      </header>

      <section className="grid gap-2 rounded-lg border border-ink-200 bg-white p-3 shadow-sm sm:grid-cols-3">
        {[
          ["upload", "1", "Upload JSON"],
          ["review", "2", "Preview products"],
          ["complete", "3", "Sent for approval"]
        ].map(([step, number, label]) => {
          const active = stage === step;
          const completed =
            (step === "upload" && stage !== "upload") ||
            (step === "review" && stage === "complete");

          return (
            <div
              key={step}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 ${
                active ? "bg-flow-50 text-flow-800" : "text-ink-500"
              }`}
            >
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                  active || completed
                    ? "bg-flow-600 text-white"
                    : "bg-ink-100 text-ink-500"
                }`}
              >
                {completed ? "✓" : number}
              </span>
              <span className="text-sm font-semibold">{label}</span>
            </div>
          );
        })}
      </section>

      {stage === "upload" && (
        <section className="rounded-lg border border-ink-200 bg-white p-5 shadow-sm">
          <label
            htmlFor="products-json-file"
            className="flex min-h-40 cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-ink-300 bg-ink-50 px-4 py-6 text-center transition hover:border-flow-400 hover:bg-flow-50"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-white text-flow-700 ring-1 ring-ink-200">
              <UploadCloud className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="text-sm font-semibold text-ink-900">
              {file ? file.name : "Upload JSON file"}
            </span>
            <span className="text-xs text-ink-500">
              Nothing is saved until you confirm the preview in the next step.
            </span>
            <input
              id="products-json-file"
              type="file"
              accept="application/json,.json"
              className="sr-only"
              onChange={handleFileChange}
            />
          </label>
        </section>
      )}

      {error && (
        <section className="flex items-start gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>{error}</p>
        </section>
      )}

      {stage === "review" && products.length > 0 && (
        <ProductImportPreview
          key={file?.name ?? "review"}
          products={products}
          isSubmitting={isImporting}
          onSubmit={queueProducts}
          onBack={() => setStage("upload")}
        />
      )}

      {stage === "complete" && result && (
        <section className="rounded-lg border border-ink-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold text-ink-900">
            <CheckCircle2 className="h-4 w-4 text-green-600" aria-hidden="true" />
            Saved for approval
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {[
              ["Total", result.total],
              ["In review queue", result.queued],
              ["Failed", result.failed]
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border border-ink-200 p-4">
                <p className="text-xs font-medium uppercase tracking-[0.08em] text-ink-500">
                  {label}
                </p>
                <p className="mt-2 text-2xl font-semibold text-ink-950">{value}</p>
              </div>
            ))}
          </div>
          {result.supabase && (
            <p className="mt-4 text-sm text-ink-600">
              Backend env file: {result.supabase.backendEnvFile ?? "not found"}.
              Runtime keys: {result.supabase.urlSource ?? "missing"} /{" "}
              {result.supabase.keySource ?? "missing"}. Frontend env file:{" "}
              {result.supabase.frontendEnvFile ?? "not found"}.
            </p>
          )}
          {result.jobLogError && (
            <p className="mt-3 text-sm text-amber-700">{result.jobLogError}</p>
          )}
          <div className="mt-5 flex flex-wrap gap-3">
            {result.queued > 0 && (
              <Link
                href="/admin/review"
                className="inline-flex min-h-10 items-center rounded-lg bg-flow-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-flow-700"
              >
                Open Till godkännande
              </Link>
            )}
            <Button variant="secondary" onClick={startNewImport}>
              Import another file
            </Button>
          </div>
        </section>
      )}

      {(previewErrors.length > 0 || (result && result.errors.length > 0)) && (
        <section className="overflow-hidden rounded-lg border border-rose-200 bg-white shadow-sm">
          <div className="border-b border-rose-100 px-5 py-4 text-sm font-semibold text-rose-800">
            Failed rows and Supabase errors
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-rose-100">
              <thead className="bg-rose-50">
                <tr>
                  {["Row", "Manufacturer", "SIN", "Error"].map((heading) => (
                    <th
                      key={heading}
                      scope="col"
                      className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.08em] text-rose-700"
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-rose-100">
                {previewErrors.map((rowError) => (
                  <tr key={`preview-${rowError.row}-${rowError.message}`}>
                    <td className="whitespace-nowrap px-5 py-4 text-sm text-ink-700">
                      {rowError.row}
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-sm text-ink-700">
                      -
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-sm text-ink-700">
                      -
                    </td>
                    <td className="px-5 py-4 text-sm text-ink-700">
                      {rowError.message}
                    </td>
                  </tr>
                ))}
                {result?.errors.map((rowError) => (
                  <tr key={`import-${rowError.row}-${rowError.message}`}>
                    <td className="whitespace-nowrap px-5 py-4 text-sm text-ink-700">
                      {rowError.row}
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-sm text-ink-700">
                      {rowError.manufacturer ?? "-"}
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-sm text-ink-700">
                      {rowError.product_no ?? "-"}
                    </td>
                    <td className="px-5 py-4 text-sm text-ink-700">
                      {rowError.message}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
