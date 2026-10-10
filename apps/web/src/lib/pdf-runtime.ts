type PdfTextItem = {
  str?: unknown;
  hasEOL?: unknown;
};

/**
 * Opens the serverless PDF.js build shipped by unpdf. It avoids native Canvas
 * addons, so the same text extraction path runs in Node and Cloudflare Workers.
 */
export async function openPdfTextDocument(data: Buffer | Uint8Array) {
  const { getDocumentProxy } = await import("unpdf");
  return getDocumentProxy(new Uint8Array(data), {
    disableFontFace: true,
    maxImageSize: 16_777_216,
    stopAtErrors: false
  });
}

export async function closePdfTextDocument(document: unknown) {
  const destroy = (document as { destroy?: () => Promise<void> }).destroy;
  if (destroy) await destroy.call(document);
}

export function plainTextFromPdfItems(items: readonly unknown[]) {
  let text = "";
  for (const value of items) {
    if (!value || typeof value !== "object") continue;
    const item = value as PdfTextItem;
    if (typeof item.str !== "string") continue;
    text += item.str;
    text += item.hasEOL === true ? "\n" : " ";
  }
  return text
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}
