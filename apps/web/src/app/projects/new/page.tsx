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
import { ScipxPageHeader } from "@/components/ScipxPageHeader";
import { uploadTechnicalDescriptionWithOcr } from "@/lib/technical-description-upload";

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
  const [analysisProgress, setAnalysisProgress] = useState<string | null>(null);
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
      const response = await uploadTechnicalDescriptionWithOcr(
        form,
        selectedFile,
        (progress) => setAnalysisProgress(progress.label)
      );
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
      setAnalysisProgress(null);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <ScipxPageHeader
        eyebrow="Ny teknisk analys"
        title="Börja med den tekniska beskrivningen"
        description="Ladda upp en teknisk beskrivning. Scipx skapar ett projekt för just den PDF-filen och tar dig automatiskt vidare till produktvalet."
        icon={<FileText aria-hidden="true" />}
      >
        <Link
          href="/projects"
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-4 text-sm font-bold text-white transition hover:border-cyan-300/60 hover:bg-white/15"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Till projekt
        </Link>
      </ScipxPageHeader>

      <div className="grid gap-4 sm:grid-cols-3">
        <Step number="1" title="Ladda upp" text="Välj teknisk beskrivning i PDF-format." />
        <Step number="2" title="Scipx skapar" text="Projektnamn och kända uppgifter läses från dokumentet." />
        <Step number="3" title="Välj produkter" text="Du går direkt vidare till Ahlsells produktval." />
      </div>

      <form
        className="overflow-hidden rounded-2xl border border-cyan-900/10 bg-white shadow-[0_16px_40px_rgba(2,17,38,0.08)]"
        onSubmit={createFromTechnicalDescription}
      >
        <div className="flex flex-col gap-4 border-b border-cyan-300/15 bg-[#06213d] p-5 text-white sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="flex items-start gap-3">
            <span className="rounded-xl bg-cyan-300/10 p-3 text-cyan-300 ring-1 ring-cyan-200/20">
              <FileText className="h-6 w-6" aria-hidden="true" />
            </span>
            <div>
              <h2 className="font-bold text-white">Teknisk beskrivning</h2>
              <p className="mt-1 text-sm text-slate-300">En PDF per projekt, högst 30 MB</p>
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
              {creating
                ? analysisProgress ?? "Läser och skapar projekt…"
                : "Ladda upp och skapa projekt"}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}

function Step({ number, title, text }: { number: string; title: string; text: string }) {
  return (
    <div className="rounded-xl border border-cyan-300/15 bg-[#06213d] p-4 text-white shadow-sm">
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-cyan-400 text-xs font-black text-[#03162d]">{number}</span>
      <h2 className="mt-3 text-sm font-bold text-white">{title}</h2>
      <p className="mt-1 text-xs leading-5 text-slate-300">{text}</p>
    </div>
  );
}
