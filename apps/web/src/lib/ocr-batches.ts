import { ClientOcrPayloadError, type ClientOcrPage } from "./technical-description-ocr-payload";
export const OCR_BATCH_PAGES = 10;
export const OCR_BATCH_BYTES = 2_000_000;
export const OCR_REQUEST_BYTES = OCR_BATCH_BYTES + 100_000;
export const utf8Bytes = (value: string) => new TextEncoder().encode(value).byteLength;

/** Flush incrementally, bounded by UTF-8 bytes as well as page count. */
export function ocrBatchWriter(write: (pages: ClientOcrPage[]) => Promise<void>) {
  let pending: ClientOcrPage[] = [];
  const flush = async () => { if (!pending.length) return; await write(pending); pending = []; };
  return { flush, async add(page: ClientOcrPage) {
    if (utf8Bytes(JSON.stringify([page])) > OCR_BATCH_BYTES) throw new ClientOcrPayloadError("OCR-sidan är för stor. Dela dokumentet och försök igen.");
    if (pending.length && (pending.length >= OCR_BATCH_PAGES || utf8Bytes(JSON.stringify([...pending,page])) > OCR_BATCH_BYTES)) await flush();
    pending.push(page);
    if (pending.length >= OCR_BATCH_PAGES) await flush();
  }};
}

export async function resumeOcrImport(file: File, jobId: string, pageNumbers: number[],
  extract: (file: File, pages: number[], progress: (value: {progress?: number}) => void, onPage?: (page: ClientOcrPage) => Promise<void>) => Promise<ClientOcrPage[]>,
  fetcher: typeof fetch, progress: (value: {progress?: number}) => void = () => {}) {
  const writer = ocrBatchWriter(async pages => {
    const response = await fetcher(`/api/technical-descriptions/jobs/${encodeURIComponent(jobId)}/ocr`, {
      method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(pages),signal:AbortSignal.timeout(30_000)
    });
    if (!response.ok) throw new Error((await response.json()).error ?? "OCR-resultatet kunde inte sparas. Fortsätt under Importstatus.");
  });
  // Real browser OCR streams pages; simple adapters/tests may return an array instead.
  const remaining = await extract(file,pageNumbers,progress,page => writer.add(page));
  for (const page of remaining) await writer.add(page);
  await writer.flush();
  return Response.json({jobId},{status:202});
}
