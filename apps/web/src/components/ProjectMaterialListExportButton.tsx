"use client";

import { useState } from "react";
import { FileSpreadsheet, Loader2 } from "lucide-react";
import { Button } from "@/components/Button";

export function ProjectMaterialListExportButton({
  projectId,
  variant = "secondary"
}: {
  projectId: string;
  variant?: "primary" | "secondary";
}) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setDownloading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/material-list/export`,
        { cache: "no-store" }
      );
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(payload?.error ?? "Excel-exporten kunde inte skapas.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filenameFrom(response.headers.get("Content-Disposition"));
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (downloadError) {
      setError(
        downloadError instanceof Error
          ? downloadError.message
          : "Excel-exporten kunde inte skapas."
      );
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      <Button className="min-h-12 justify-center px-5 text-base" type="button" variant={variant} disabled={downloading} onClick={() => void download()}>
        {downloading ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <FileSpreadsheet className="h-5 w-5" aria-hidden="true" />
        )}
        {downloading ? "Skapar Excel..." : "Ladda ner Excel"}
      </Button>
      {error && <span role="status" className="max-w-xs text-xs font-medium text-rose-700">{error}</span>}
    </div>
  );
}

function filenameFrom(contentDisposition: string | null) {
  const match = contentDisposition?.match(/filename="([^"]+)"/i);
  return match?.[1] ?? "scipx-materiallista.xlsx";
}
