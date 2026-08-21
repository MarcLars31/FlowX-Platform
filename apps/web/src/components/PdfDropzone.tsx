"use client";

import { useState, type DragEvent } from "react";
import { CheckCircle2, Upload } from "lucide-react";

const DEFAULT_MAX_BYTES = 30 * 1024 * 1024;

export function PdfDropzone({
  id,
  file,
  onFileChange,
  onValidationError,
  disabled = false,
  maxBytes = DEFAULT_MAX_BYTES,
  compact = false
}: {
  id: string;
  file: File | null;
  onFileChange: (file: File | null) => void;
  onValidationError?: (message: string | null) => void;
  disabled?: boolean;
  maxBytes?: number;
  compact?: boolean;
}) {
  const [dragging, setDragging] = useState(false);

  function selectFile(nextFile: File | null) {
    if (!nextFile) {
      onFileChange(null);
      onValidationError?.(null);
      return;
    }

    const validationError = validatePdfFile(nextFile, maxBytes);
    if (validationError) {
      onFileChange(null);
      onValidationError?.(validationError);
      return;
    }

    onFileChange(nextFile);
    onValidationError?.(null);
  }

  function handleDragOver(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    if (disabled) return;
    event.dataTransfer.dropEffect = "copy";
    setDragging(true);
  }

  function handleDragLeave(event: DragEvent<HTMLLabelElement>) {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setDragging(false);
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    if (disabled) return;
    selectFile(event.dataTransfer.files?.[0] ?? null);
  }

  return (
    <>
      <label
        htmlFor={id}
        onDragEnter={handleDragOver}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={[
          "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 text-center transition",
          compact ? "min-h-36 py-7" : "min-h-48 py-10",
          dragging
            ? "scale-[1.01] border-[#0073b6] bg-[#0073b6]/10 shadow-md"
            : file
              ? "border-emerald-300 bg-emerald-50/70 hover:border-emerald-400"
              : "border-cyan-300/70 bg-[#f2fbfd] hover:border-cyan-500 hover:bg-cyan-50",
          disabled ? "cursor-not-allowed opacity-60" : ""
        ].join(" ")}
      >
        {file ? (
          <>
            <CheckCircle2 className="h-9 w-9 text-emerald-600" aria-hidden="true" />
            <span className="mt-3 break-all font-semibold text-ink-950">{file.name}</span>
            <span className="mt-1 text-sm text-ink-500">
              {formatFileSize(file.size)} · Dra in eller klicka för att byta fil
            </span>
          </>
        ) : (
          <>
            <Upload
              className={dragging ? "h-9 w-9 text-[#005d91]" : "h-9 w-9 text-[#00649e]"}
              aria-hidden="true"
            />
            <span className="mt-3 font-semibold text-ink-950">
              {dragging ? "Släpp PDF-filen här" : "Dra PDF-filen hit"}
            </span>
            <span className="mt-1 text-sm text-ink-500">
              eller klicka för att välja fil · högst {formatFileSize(maxBytes)}
            </span>
          </>
        )}
      </label>
      <input
        id={id}
        name="file"
        type="file"
        accept="application/pdf,.pdf"
        className="sr-only"
        disabled={disabled}
        onChange={(event) => selectFile(event.target.files?.[0] ?? null)}
      />
    </>
  );
}

export function validatePdfFile(file: File, maxBytes = DEFAULT_MAX_BYTES) {
  const pdfName = file.name.toLocaleLowerCase().endsWith(".pdf");
  const pdfType = !file.type || file.type === "application/pdf";
  if (!pdfName || !pdfType) return "Filen måste vara en PDF.";
  if (file.size === 0) return "PDF-filen är tom.";
  if (file.size > maxBytes) {
    return `PDF-filen får vara högst ${formatFileSize(maxBytes)}.`;
  }
  return null;
}

function formatFileSize(size: number) {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} kB`;
  const megabytes = size / (1024 * 1024);
  return `${Number.isInteger(megabytes) ? megabytes : megabytes.toFixed(1)} MB`;
}
