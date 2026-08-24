type PdfTextItem = {
  str?: string;
  hasEOL?: boolean;
};

export type PdfTextDocumentPage = {
  pageNumber: number;
  text: string;
  items: unknown[];
};

/** Reads a PDF text layer without requiring a native Canvas binary. */
export async function readPdfTextDocument(
  input: Buffer | Uint8Array
): Promise<PdfTextDocumentPage[]> {
  installTextOnlyDomMatrix();
  const { getDocument } = await import("pdfjs-dist/build/pdf.mjs");

  const data = new Uint8Array(
    input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength)
  );
  const document = await getDocument({ data }).promise;

  try {
    const pages: PdfTextDocumentPage[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push({
        pageNumber,
        text: plainTextFromItems(content.items),
        items: content.items
      });
      page.cleanup();
    }
    return pages;
  } finally {
    await document.destroy();
  }
}

function installTextOnlyDomMatrix() {
  if (typeof globalThis.DOMMatrix !== "undefined") return;

  class TextOnlyDomMatrix {
    a = 1;
    b = 0;
    c = 0;
    d = 1;
    e = 0;
    f = 0;

    constructor(values?: readonly number[]) {
      if (values && values.length >= 6) {
        [this.a, this.b, this.c, this.d, this.e, this.f] = values;
      }
    }

    multiplySelf(other: TextOnlyDomMatrix) {
      const { a, b, c, d, e, f } = this;
      this.a = a * other.a + c * other.b;
      this.b = b * other.a + d * other.b;
      this.c = a * other.c + c * other.d;
      this.d = b * other.c + d * other.d;
      this.e = a * other.e + c * other.f + e;
      this.f = b * other.e + d * other.f + f;
      return this;
    }

    preMultiplySelf(other: TextOnlyDomMatrix) {
      const current = new TextOnlyDomMatrix([
        this.a,
        this.b,
        this.c,
        this.d,
        this.e,
        this.f
      ]);
      Object.assign(this, other);
      return this.multiplySelf(current);
    }

    translate(x = 0, y = 0) {
      return this.multiplySelf(new TextOnlyDomMatrix([1, 0, 0, 1, x, y]));
    }

    scale(x = 1, y = x) {
      return this.multiplySelf(new TextOnlyDomMatrix([x, 0, 0, y, 0, 0]));
    }

    invertSelf() {
      const determinant = this.a * this.d - this.b * this.c;
      if (!determinant) return this;
      const { a, b, c, d, e, f } = this;
      this.a = d / determinant;
      this.b = -b / determinant;
      this.c = -c / determinant;
      this.d = a / determinant;
      this.e = (c * f - d * e) / determinant;
      this.f = (b * e - a * f) / determinant;
      return this;
    }
  }

  globalThis.DOMMatrix = TextOnlyDomMatrix as unknown as typeof DOMMatrix;
}

function plainTextFromItems(items: readonly unknown[]) {
  let text = "";
  for (const value of items) {
    const item = value as PdfTextItem;
    if (typeof item.str !== "string") continue;
    text += item.str;
    text += item.hasEOL ? "\n" : " ";
  }

  return text
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
