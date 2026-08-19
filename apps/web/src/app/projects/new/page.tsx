"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  FileText,
  Loader2
} from "lucide-react";
import { Button } from "@/components/Button";
import { PdfDropzone } from "@/components/PdfDropzone";

type CreationResponse = {
  error?: string;
  projectId?: string;
  projectName?: string;
  persistedRequirementCount?: number;
};

export default function CreateProjectPage() {
  const router = useRouter();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createFromTechnicalDescription(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();
    if (!selectedFile) {
      setError("Välj en PDF med teknisk beskrivning.");
      return;
    }

    setCreating(true);
    setError(null);
    const form = new FormData();
    form.set("file", selectedFile);
    form.set("createProject", "true");

    try {
      const response = await fetch("/api/technical-descriptions", {
        method: "POST",
        body: form
      });
      const payload = (await response.json().catch(() => null)) as
        | CreationResponse
        | null;
      if (!response.ok || !payload?.projectId) {
        throw new Error(
          payload?.error ?? "Scipx kunde inte skapa projektet från dokumentet."
        );
      }

      const nextStep = (payload.persistedRequirementCount ?? 0) > 0
        ? "products"
        : "documents";
      router.push(
        `/projects/${encodeURIComponent(payload.projectId)}?step=${nextStep}`
      );
      router.refresh();
    } catch (creationError) {
      setError(
        creationError instanceof Error
          ? creationError.message
          : "Scipx kunde inte skapa projektet från dokumentet."
      );
      setCreating(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link
          href="/projects"
          className="inline-flex items-center gap-2 text-sm font-semibold text-ink-600 transition hover:text-flow-700"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Till projekt
        </Link>
        <p className="mt-6 text-sm font-medium uppercase tracking-[0.14em] text-flow-700">
          Ny teknisk analys
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-normal text-ink-950">
          Börja med den tekniska beskrivningen
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-600">
          Ladda upp PDF-underlaget. Scipx läser dokumentet, skapar projektet och
          föreslår projektnamnet automatiskt. Projektuppgifter kan kompletteras
          senare i projektöversikten.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Step number="1" title="Ladda upp" text="Välj teknisk beskrivning i PDF-format." />
        <Step number="2" title="Scipx skapar" text="Projektnamn och kända uppgifter läses från dokumentet." />
        <Step number="3" title="Välj produkter" text="Du går direkt vidare till Ahlsells produktval." />
      </div>

      <form
        className="overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-sm"
        onSubmit={createFromTechnicalDescription}
      >
        <div className="flex flex-col gap-4 border-b border-[#0073b6]/15 bg-[#0073b6]/5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="flex items-start gap-3">
            <span className="rounded-xl bg-white p-3 text-[#00649e] shadow-sm">
              <FileText className="h-6 w-6" aria-hidden="true" />
            </span>
            <div>
              <h2 className="font-semibold text-ink-950">Teknisk beskrivning</h2>
              <p className="mt-1 text-sm text-ink-600">PDF, högst 30 MB</p>
            </div>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/ahlsell-logo.svg" alt="Ahlsell" className="h-9 w-auto" />
        </div>

        <div className="p-5 sm:p-6">
          <PdfDropzone
            id="technical-description"
            file={selectedFile}
            disabled={creating}
            onFileChange={setSelectedFile}
            onValidationError={setError}
          />

          {error && (
            <p role="alert" className="mt-5 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              {error}
            </p>
          )}

          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs leading-5 text-ink-500">
              Projektet skapas först när PDF-filen har validerats och kunnat läsas.
            </p>
            <Button type="submit" disabled={creating || !selectedFile}>
              {creating ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              )}
              {creating ? "Läser och skapar projekt…" : "Ladda upp och skapa projekt"}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}

function Step({ number, title, text }: { number: string; title: string; text: string }) {
  return (
    <div className="rounded-xl border border-ink-200 bg-white p-4 shadow-sm">
      <span className="text-xs font-bold text-[#00649e]">{number}</span>
      <h2 className="mt-1 text-sm font-semibold text-ink-950">{title}</h2>
      <p className="mt-1 text-xs leading-5 text-ink-500">{text}</p>
    </div>
  );
}
