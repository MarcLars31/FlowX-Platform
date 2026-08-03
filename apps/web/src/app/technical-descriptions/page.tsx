"use client";

import { type FormEvent, useEffect, useState } from "react";
import { AlertTriangle, Calculator, FileSearch, Upload } from "lucide-react";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import type {
  TechnicalDescriptionExtractionResult,
  TechnicalDescriptionMaterialLine
} from "@/modules/technical-description-extractor";

type ExtractionResponse = TechnicalDescriptionExtractionResult & {
  documentId: string;
  persistedLineCount: number;
};

type DocumentSummary = {
  id: string;
  file_name: string;
  status: string;
  extraction_method: string;
  page_count: number;
  project_name?: string | null;
  chapter?: string | null;
  created_at: string;
};

type EstimateResponse = {
  estimateId: string;
  items: Array<{
    ruleId: string | null;
    category: string;
    description: string;
    quantity: number;
    unit: string;
    rationale: string;
  }>;
  note: string;
};

export default function TechnicalDescriptionsPage() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ExtractionResponse | null>(null);
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [estimateResult, setEstimateResult] = useState<EstimateResponse | null>(null);
  const [areaM2, setAreaM2] = useState("");
  const [headsPerM2, setHeadsPerM2] = useState("");
  const [reservePercentage, setReservePercentage] = useState("0");
  const [isExtracting, setIsExtracting] = useState(false);
  const [isEstimating, setIsEstimating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [estimateError, setEstimateError] = useState<string | null>(null);

  useEffect(() => {
    void loadDocuments();
  }, []);

  async function loadDocuments() {
    try {
      const response = await fetch("/api/technical-descriptions", {
        cache: "no-store"
      });
      if (!response.ok) return;
      const payload = (await response.json()) as {
        documents?: DocumentSummary[];
      };
      setDocuments(payload.documents ?? []);
    } catch {
      // The upload result remains usable even if the history request fails.
    }
  }

  async function extract(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setError("Välj en PDF med den tekniska beskrivningen först.");
      return;
    }

    setIsExtracting(true);
    setError(null);
    setResult(null);
    setEstimateResult(null);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const response = await fetch("/api/technical-descriptions", {
        method: "POST",
        body: formData
      });
      const payload = (await response.json()) as
        | ExtractionResponse
        | { error?: string; detail?: string };
      if (!response.ok || !("documentId" in payload)) {
        throw new Error(
          "error" in payload
            ? payload.error ?? payload.detail ?? "Extraktionen misslyckades."
            : "Extraktionen misslyckades."
        );
      }
      setResult(payload);
      await loadDocuments();
    } catch (extractError) {
      setError(
        extractError instanceof Error
          ? extractError.message
          : "Extraktionen misslyckades."
      );
    } finally {
      setIsExtracting(false);
    }
  }

  async function createEstimate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsEstimating(true);
    setEstimateError(null);
    setEstimateResult(null);
    try {
      const response = await fetch("/api/technical-descriptions/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          areaM2: Number(areaM2),
          sprinklerHeadsPerM2: Number(headsPerM2),
          reservePercentage: Number(reservePercentage),
          sourceDocumentId: result?.documentId ?? null
        })
      });
      const payload = (await response.json()) as
        | EstimateResponse
        | { error?: string; detail?: string };
      if (!response.ok || !("estimateId" in payload)) {
        throw new Error(
          "error" in payload
            ? payload.error ?? payload.detail ?? "Estimatet kunde inte skapas."
            : "Estimatet kunde inte skapas."
        );
      }
      setEstimateResult(payload);
    } catch (estimateFailure) {
      setEstimateError(
        estimateFailure instanceof Error
          ? estimateFailure.message
          : "Estimatet kunde inte skapas."
      );
    } finally {
      setIsEstimating(false);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-medium uppercase tracking-[0.14em] text-flow-700">
          Teknisk beskrivning
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-ink-950">
          Materialuttag och byggestimat
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-600">
          Detta är en separat OCR-extractor för tekniska beskrivningar. Den sparar
          dokument, materialrader och framtida kvotregler i organisationens databas.
        </p>
      </header>

      <section className="rounded-lg border border-ink-200 bg-white p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <FileSearch className="mt-0.5 h-5 w-5 text-flow-700" aria-hidden="true" />
          <div>
            <h2 className="font-semibold text-ink-950">Extrahera materiallista</h2>
            <p className="mt-1 text-sm text-ink-600">
              Bildbaserade dokument OCR-tolkas med norska och engelska språkmodeller.
              Alla rader ska granskas innan de används i ett projekt.
            </p>
          </div>
        </div>
        <form className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={extract}>
          <label className="block flex-1">
            <span className="mb-2 block text-sm font-medium text-ink-700">PDF-fil</span>
            <input
              type="file"
              accept=".pdf,application/pdf"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              className="block h-11 w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-800"
            />
          </label>
          <Button type="submit" disabled={isExtracting}>
            <Upload className="h-4 w-4" aria-hidden="true" />
            {isExtracting ? "Extraherar..." : "Extrahera och spara"}
          </Button>
        </form>
        {error && <p className="mt-3 text-sm text-rose-700">{error}</p>}
      </section>

      {result && <ExtractionResult result={result} />}

      {result && (
        <section className="rounded-lg border border-ink-200 bg-white p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <Calculator className="mt-0.5 h-5 w-5 text-flow-700" aria-hidden="true" />
            <div>
              <h2 className="font-semibold text-ink-950">Indikativt materialestimat</h2>
              <p className="mt-1 text-sm text-ink-600">
                Ange byggytan och den kvot som ska användas. Kvoten är inte en automatisk
                projekteringsregel och måste verifieras av behörig projektör.
              </p>
            </div>
          </div>
          <form className="mt-5 grid gap-4 md:grid-cols-3" onSubmit={createEstimate}>
            <Input
              id="area-m2"
              label="Byggyta (m²)"
              type="number"
              min="0.01"
              step="0.01"
              value={areaM2}
              onChange={(event) => setAreaM2(event.target.value)}
              required
            />
            <Input
              id="heads-per-m2"
              label="Sprinklerhuvuden per m²"
              type="number"
              min="0.0001"
              max="10"
              step="0.0001"
              value={headsPerM2}
              onChange={(event) => setHeadsPerM2(event.target.value)}
              required
            />
            <Input
              id="reserve-percentage"
              label="Reserv (%)"
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={reservePercentage}
              onChange={(event) => setReservePercentage(event.target.value)}
            />
            <div className="md:col-span-3">
              <Button type="submit" disabled={isEstimating}>
                <Calculator className="h-4 w-4" aria-hidden="true" />
                {isEstimating ? "Beräknar..." : "Skapa estimat"}
              </Button>
            </div>
          </form>
          {estimateError && <p className="mt-3 text-sm text-rose-700">{estimateError}</p>}
          {estimateResult && <EstimateResult estimate={estimateResult} />}
        </section>
      )}

      <section className="rounded-lg border border-ink-200 bg-white shadow-sm">
        <div className="border-b border-ink-100 px-5 py-4">
          <h2 className="font-semibold text-ink-950">Sparade tekniska beskrivningar</h2>
        </div>
        {documents.length === 0 ? (
          <p className="px-5 py-8 text-sm text-ink-600">Inga dokument är sparade ännu.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-ink-200 text-sm">
              <thead className="bg-ink-50 text-left text-xs uppercase text-ink-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">Fil</th>
                  <th className="px-5 py-3 font-semibold">Projekt</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 font-semibold">Metod</th>
                  <th className="px-5 py-3 font-semibold">Sparad</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {documents.map((document) => (
                  <tr key={document.id}>
                    <td className="px-5 py-4 font-medium text-ink-950">{document.file_name}</td>
                    <td className="px-5 py-4 text-ink-600">
                      {document.project_name ?? document.chapter ?? "—"}
                    </td>
                    <td className="px-5 py-4 text-ink-600">{document.status}</td>
                    <td className="px-5 py-4 text-ink-600">{document.extraction_method}</td>
                    <td className="px-5 py-4 text-ink-500">
                      {new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium" }).format(
                        new Date(document.created_at)
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function ExtractionResult({ result }: { result: ExtractionResponse }) {
  return (
    <section className="space-y-4 rounded-lg border border-ink-200 bg-white p-5 shadow-sm">
      <div className="grid gap-4 text-sm sm:grid-cols-4">
        <Summary label="Dokument" value={result.document.fileName ?? "PDF"} />
        <Summary label="Projekt" value={result.project.name ?? "Ej identifierat"} />
        <Summary label="Kapitel" value={result.project.chapter ?? "Ej identifierat"} />
        <Summary
          label="Metod / sidor"
          value={`${result.document.extractionMethod} / ${result.document.pageCount}`}
        />
      </div>
      {result.warnings.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <div className="flex gap-2 text-sm font-semibold text-amber-900">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            Granskning krävs ({result.warnings.length})
          </div>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-900">
            {result.warnings.map((warning) => (
              <li key={warning.id}>{warning.message}</li>
            ))}
          </ul>
        </div>
      )}
      <MaterialTable lines={result.materialLines} />
    </section>
  );
}

function MaterialTable({ lines }: { lines: TechnicalDescriptionMaterialLine[] }) {
  if (lines.length === 0) {
    return <p className="text-sm text-ink-600">Inga materialrader hittades.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-ink-200 text-sm">
        <thead className="bg-ink-50 text-left text-xs uppercase text-ink-500">
          <tr>
            <th className="px-4 py-3 font-semibold">Post / NS</th>
            <th className="px-4 py-3 font-semibold">Kategori</th>
            <th className="px-4 py-3 font-semibold">Beskrivning</th>
            <th className="px-4 py-3 font-semibold">Antal</th>
            <th className="px-4 py-3 font-semibold">Åtgärd</th>
            <th className="px-4 py-3 font-semibold">Egenskaper</th>
            <th className="px-4 py-3 font-semibold">Granskning</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {lines.map((line) => (
            <tr key={line.id}>
              <td className="whitespace-nowrap px-4 py-3 text-ink-700">
                <div>{line.postNumber ?? "—"}</div>
                <div className="text-xs text-ink-500">{line.nsCode ?? "—"}</div>
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-ink-700">{line.category}</td>
              <td className="min-w-56 px-4 py-3 text-ink-950">{line.description}</td>
              <td className="whitespace-nowrap px-4 py-3 text-ink-700">
                {line.quantity ?? "—"} {line.unit ?? ""}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-ink-700">{line.operation}</td>
              <td className="min-w-64 px-4 py-3 text-xs text-ink-600">
                {Object.entries(line.attributes).map(([key, value]) => (
                  <div key={key}>
                    <span className="font-medium">{key}:</span> {value}
                  </div>
                ))}
              </td>
              <td className="px-4 py-3 text-xs text-ink-600">
                {line.reviewFlags.length > 0 ? line.reviewFlags.join(", ") : "OK"}
                <div className="mt-1">{Math.round(line.confidence * 100)}%</div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EstimateResult({ estimate }: { estimate: EstimateResponse }) {
  return (
    <div className="mt-5 rounded-lg border border-flow-200 bg-flow-50 p-4">
      <h3 className="font-semibold text-ink-950">Estimatet är sparat</h3>
      <ul className="mt-3 space-y-2 text-sm text-ink-800">
        {estimate.items.map((item) => (
          <li key={`${item.category}-${item.description}`}>
            <span className="font-semibold">
              {item.quantity} {item.unit}
            </span>{" "}
            {item.description}
            <span className="block text-xs text-ink-600">{item.rationale}</span>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-ink-600">{estimate.note}</p>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.1em] text-ink-500">{label}</p>
      <p className="mt-1 truncate font-medium text-ink-950">{value}</p>
    </div>
  );
}
