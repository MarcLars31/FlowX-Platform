import { localDesignRequestAllowed } from "@/lib/local-design";
import { hasPdfSignature } from "@/lib/pdf-security";
import { readFormBody, RequestBodyTooLargeError } from "@/lib/request-body";
import { MAX_TECHNICAL_DESCRIPTION_BYTES, validateTechnicalDescriptionFile } from "@/lib/technical-description-file";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!localDesignRequestAllowed(request, process.env)) return new Response(null, { status: 404 });
  const respond = (body: unknown, status = 200) => Response.json(body, {
    status, headers: { "Cache-Control": "no-store" }
  });
  try {
    const form = await readFormBody(request, MAX_TECHNICAL_DESCRIPTION_BYTES + 1024 * 1024);
    const file = form.get("file");
    if (!(file instanceof File)) return respond({ error: "Välj en PDF-fil." }, 400);
    const invalid = validateTechnicalDescriptionFile(file);
    if (invalid) return respond({ error: invalid }, 400);
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!hasPdfSignature(bytes)) return respond({ error: "Filen är inte en giltig PDF." }, 400);
    // Reuse the real reader, without importing persistence, auth, storage or product APIs.
    const { extractTechnicalDescriptionPages, pagesRequiringOcr } = await import("@/modules/technical-description-extractor/pdf");
    const { extractTechnicalDescriptionFromPages } = await import("@/modules/technical-description-extractor/extractor");
    const pages = await extractTechnicalDescriptionPages(bytes);
    const result = extractTechnicalDescriptionFromPages(pages, { fileName: file.name });
    return respond({ result, ocrPageNumbers: pagesRequiringOcr(pages) });
  } catch (error) {
    return respond({ error: error instanceof RequestBodyTooLargeError
      ? "PDF-filen får vara högst 30 MB."
      : "PDF-filen kunde inte läsas. Kontrollera att den är hel och inte lösenordsskyddad." },
    error instanceof RequestBodyTooLargeError ? 413 : 422);
  }
}
