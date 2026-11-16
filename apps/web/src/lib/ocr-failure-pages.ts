import type { ClientOcrPage } from "./technical-description-ocr-payload";

type ExtractOcr = (file: File, pages: number[], progress: (value: { progress?: number }) => void,
  onPage?: (page: ClientOcrPage) => Promise<void>) => Promise<ClientOcrPage[]>;

/** A failed recognizer still acknowledges the attempted pages so the server can
 * try its reserve reader. Failed checkpoint/network writes must remain retryable. */
export async function extractOcrWithFailurePages(extract: ExtractOcr, file: File, pageNumbers: number[],
  progress: (value: { progress?: number }) => void, onPage?: (page: ClientOcrPage) => Promise<void>) {
  const seen = new Set<number>();
  const pages: ClientOcrPage[] = [];
  let deliveryFailure: { error: unknown } | undefined;
  const receive = async (page: ClientOcrPage) => {
    if (seen.has(page.pageNumber)) return;
    try {
      if (onPage) await onPage(page);
      else pages.push(page);
      seen.add(page.pageNumber);
    } catch (error) { deliveryFailure = { error }; throw error; }
  };
  try {
    const returned = await extract(file, pageNumbers, progress, receive);
    for (const page of returned) await receive(page);
  } catch (error) {
    if (deliveryFailure) throw deliveryFailure.error;
    console.warn("browser_ocr_failed", { name: error instanceof Error ? error.name : "Error" });
  }
  for (const pageNumber of pageNumbers) {
    if (!seen.has(pageNumber)) await receive({ pageNumber, text: "", confidence: 0 });
  }
  return pages;
}
