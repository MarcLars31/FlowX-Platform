import { createHash, randomUUID } from "node:crypto";
import { after, NextResponse } from "next/server";
import { authorizeCrawlerOrPlatformAdmin } from "@/lib/crawler-api-authorization";
import { hasPdfSignature } from "@/lib/pdf-security";
import {
  insertSupabaseRowReturning,
  selectSupabaseRows
} from "@/lib/supabase-rest";
import {
  deleteAdminStorageObjects,
  uploadAdminStorageObject
} from "@/lib/supabase-admin-storage";
import { runProductDocumentWorker } from "@/lib/product-document-worker.server";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_PDF_BYTES = 50 * 1024 * 1024;
const MAX_MULTIPART_BYTES = MAX_PDF_BYTES + 2 * 1024 * 1024;
const STORAGE_BUCKET = "product-documents";

type ProductDocumentRow = {
  id: string;
  title: string;
  file_name: string | null;
  pdf_sha256: string | null;
  current_processing_status: string;
  storage_path: string | null;
};

export async function POST(request: Request) {
  const authorization = await authorizeCrawlerOrPlatformAdmin(request);
  if (authorization.error) return authorization.error;

  try {
    const contentLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_MULTIPART_BYTES) {
      return NextResponse.json({ error: "PDF files may not exceed 50 MB." }, { status: 413 });
    }
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "A PDF file is required." }, { status: 400 });
    }
    if (file.size > MAX_PDF_BYTES) {
      return NextResponse.json({ error: "PDF files may not exceed 50 MB." }, { status: 413 });
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!hasPdfSignature(bytes.subarray(0, 5))) {
      return NextResponse.json({ error: "The file is not a valid PDF." }, { status: 415 });
    }

    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const suppliedHash = text(form.get("sha256"), 64)?.toLowerCase();
    if (suppliedHash && suppliedHash !== sha256) {
      return NextResponse.json(
        { error: "The supplied PDF checksum does not match the file." },
        { status: 400 }
      );
    }

    const finalPdfUrl = publicUrl(form.get("finalPdfUrl"));
    const canonicalUrl = publicUrl(form.get("canonicalUrl")) ?? finalPdfUrl;
    const existing = await findExistingDocument(sha256);
    if (existing) {
      return NextResponse.json({ document: existing, duplicate: true });
    }

    const supplierName = text(form.get("supplier"), 200) ?? "Unknown supplier";
    const title =
      text(form.get("title"), 500) ?? file.name.replace(/\.pdf$/i, "").slice(0, 500);
    const safeName = safeFileName(file.name);
    const storagePath = `${slug(supplierName)}/${sha256.slice(0, 2)}/${sha256}-${randomUUID()}-${safeName}`;

    await uploadAdminStorageObject(STORAGE_BUCKET, storagePath, bytes, "application/pdf");
    try {
      const now = new Date().toISOString();
      const shouldProcess = text(form.get("process"), 10)?.toLowerCase() !== "false";
      const document = await insertSupabaseRowReturning<ProductDocumentRow>("documents", {
        title,
        processing_requested: shouldProcess,
        document_type: text(form.get("documentType"), 100) ?? "datasheet",
        supplier_name: supplierName,
        file_name: safeName,
        storage_bucket: STORAGE_BUCKET,
        storage_path: storagePath,
        file_path: storagePath,
        source_url: finalPdfUrl,
        canonical_url: canonicalUrl,
        original_pdf_url: publicUrl(form.get("originalUrl")),
        source_page_url: publicUrl(form.get("sourcePageUrl")),
        pdf_sha256: sha256,
        file_size_bytes: bytes.byteLength,
        mime_type: "application/pdf",
        language_code: text(form.get("language"), 20),
        downloaded_at: text(form.get("downloadedAt"), 64) ?? now,
        last_seen_at: now,
        current_processing_status: "pending",
        manual_review_status: "not_required",
        status: "needs_review"
      });

      if (shouldProcess) after(() => runProductDocumentWorker(document.id));
      return NextResponse.json({ document, duplicate: false, processing: shouldProcess ? { status: "queued" } : null }, { status: 201 });
    } catch (error) {
      // A timed-out response can still have committed. Never remove a referenced source.
      const persisted = await findExistingDocument(sha256).catch(() => null);
      if (persisted) {
        if (persisted.storage_path !== storagePath) {
          await deleteAdminStorageObjects(STORAGE_BUCKET, [storagePath]).catch(() => undefined);
        }
        return NextResponse.json({ document: persisted, duplicate: persisted.storage_path !== storagePath });
      }
      // A definite client rejection did not commit; an ambiguous transport/5xx failure may have.
      if (error instanceof Error && /^Supabase 4(?!08)/.test(error.message)) {
        await deleteAdminStorageObjects(STORAGE_BUCKET, [storagePath]).catch(() => undefined);
      }
      throw error;
    }
  } catch {
    return NextResponse.json(
      { error: "The product document could not be ingested." },
      { status: 500 }
    );
  }
}

async function findExistingDocument(sha256: string) {
  const byHash = await selectSupabaseRows<ProductDocumentRow>("documents", {
    select: "id,title,file_name,pdf_sha256,current_processing_status,storage_path",
    pdf_sha256: `eq.${sha256}`,
    deleted_at: "is.null",
    limit: "1"
  });
  return byHash[0] ?? null;
}

function text(value: FormDataEntryValue | null, maxLength: number) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function publicUrl(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.username || url.password || !url.hostname) return null;
    return url.toString().slice(0, 2_000);
  } catch {
    return null;
  }
}

function safeFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 160) || "datasheet.pdf";
}

function slug(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "unknown";
}
