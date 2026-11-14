import type { openPdfTextDocument } from "@/lib/pdf-runtime";
import type { TechnicalDescriptionPage } from "./types";

export const MIN_TEXT_PAGE_LENGTH = 80;

type PdfPage = Awaited<ReturnType<Awaited<ReturnType<typeof openPdfTextDocument>>["getPage"]>>;
type Matrix = number[];

export function pageRequiresOcr(
  page: Pick<TechnicalDescriptionPage, "text" | "ocrReason">,
  minimumReadableLength = MIN_TEXT_PAGE_LENGTH
) {
  return page.text.length < minimumReadableLength || Boolean(page.ocrReason);
}

/** Headers/footers alone must not make a scanned body look digitally readable.
 * Inspect regions separately: readable text in one column cannot certify an
 * image in another. Use a bounded coverage grid, without rendering a canvas. */
export async function nonTextBodyOcrReason(page: PdfPage, items: readonly unknown[]): Promise<TechnicalDescriptionPage["ocrReason"]> {
  const viewport = page.getViewport({ scale: 1 });
  const top = viewport.height * 0.2;
  const bottom = viewport.height * 0.9;
  const textPoints: { x: number; y: number; length: number }[] = [];
  for (const value of items) {
    if (!value || typeof value !== "object") continue;
    const item = value as { str?: unknown; transform?: unknown };
    if (typeof item.str !== "string" || !item.str.trim()) continue;
    if (!isMatrix(item.transform)) return undefined; // Unknown geometry is not evidence of a scan.
    const [x, y] = viewport.convertToViewportPoint(item.transform[4], item.transform[5]);
    if (y >= top && y <= bottom) textPoints.push({ x, y, length: item.str.trim().length });
  }

  try {
    const { OPS, Util, AnnotationMode } = await import("unpdf").then(module => module.getResolvedPDFJS());
    const operators = await page.getOperatorList({ annotationMode: AnnotationMode.DISABLE });
    let matrix: Matrix = [...viewport.transform];
    const stack: Matrix[] = [];
    // Union coverage prevents repeated draws from counting the same area twice.
    const gridSize = 40;
    const imageCoverage = new Uint8Array(gridSize * gridSize);
    const inspectImage = (imageMatrix: Matrix) => {
      const [x0, y0, x1, y1] = transformedBounds(imageMatrix, [0, 0, 1, 1]);
      const left = Math.max(0, x0), right = Math.min(viewport.width, x1);
      const upper = Math.max(top, y0), lower = Math.min(bottom, y1);
      if (right <= left || lower <= upper) return;
      // A searchable scan/background already has text in this same region.
      const characters = textPoints.reduce((count, point) => count +
        (point.x >= left && point.x <= right && point.y >= upper && point.y <= lower ? point.length : 0), 0);
      if (characters >= MIN_TEXT_PAGE_LENGTH) return;
      for (let row = 0; row < gridSize; row += 1) {
        const y = (row + 0.5) * viewport.height / gridSize;
        if (y < upper || y > lower) continue;
        for (let col = 0; col < gridSize; col += 1) {
          const x = (col + 0.5) * viewport.width / gridSize;
          if (x >= left && x <= right) imageCoverage[row * gridSize + col] = 1;
        }
      }
    };
    let outlinedGlyphs = 0;
    const glyphRows = new Set<number>();
    for (let index = 0; index < operators.fnArray.length; index += 1) {
      const op = operators.fnArray[index];
      const args = operators.argsArray[index];
      if (op === OPS.save || op === OPS.paintFormXObjectBegin || op === OPS.beginGroup) {
        stack.push(matrix);
        const transform = op === OPS.paintFormXObjectBegin ? args?.[0]
          : op === OPS.beginGroup ? args?.[0]?.matrix : undefined;
        if (isMatrix(transform)) matrix = Util.transform(matrix, transform);
      } else if (op === OPS.restore || op === OPS.paintFormXObjectEnd || op === OPS.endGroup) {
        matrix = stack.pop() ?? [...viewport.transform];
      } else if (op === OPS.transform && isMatrix(args)) {
        matrix = Util.transform(matrix, args);
      } else if (op === OPS.paintImageXObject || op === OPS.paintInlineImageXObject || op === OPS.paintImageMaskXObject) {
        // PDF images occupy the transformed unit square, regardless of pixel resolution.
        inspectImage(matrix);
      } else if (op === OPS.paintImageXObjectRepeat) {
        const positions = args?.[3];
        if (positions) for (let i = 0; i + 1 < positions.length; i += 2) {
          inspectImage(Util.transform(matrix, [args[1], 0, 0, args[2], positions[i], positions[i + 1]]));
        }
      } else if (op === OPS.paintInlineImageXObjectGroup) {
        for (const entry of args?.[1] ?? []) if (isMatrix(entry.transform)) inspectImage(Util.transform(matrix, entry.transform));
      } else if (op === OPS.constructPath && (args?.[0] === OPS.fill || args?.[0] === OPS.eoFill)) {
        // PDF.js supplies the path bounds with the combined path/paint operator.
        // Outlined letters have no text items. Ignore table rules and large shapes.
        const bounds = args[2];
        if ((!Array.isArray(bounds) && !(bounds instanceof Float32Array)) || bounds.length !== 4) continue;
        const [left, upper, right, lower] = transformedBounds(matrix, Array.from(bounds));
        const w = right - left, h = lower - upper, centerY = (upper + lower) / 2;
        if (w >= 0.5 && w <= 30 && h >= 2 && h <= 30 && left >= 0 && right <= viewport.width && centerY >= top && centerY <= bottom) {
          outlinedGlyphs += 1;
          glyphRows.add(Math.floor(centerY / 10));
          if (outlinedGlyphs >= 80 && glyphRows.size >= 3) return "vector-body";
        }
      }
    }
    return imageCoverage.reduce((sum, cell) => sum + cell, 0) >= gridSize * gridSize * 0.15 ? "image-body" : undefined;
  } catch {
    // Failed image inspection must not abort the import or certify a header as complete.
    return "body-check-failed";
  }
}

function isMatrix(value: unknown): value is Matrix {
  return Array.isArray(value) && value.length === 6 && value.every(Number.isFinite);
}

function transformedBounds(matrix: Matrix, rect: number[]) {
  const [a, b, c, d, e, f] = matrix;
  const [x0, y0, x1, y1] = rect;
  const xs = [a * x0 + c * y0 + e, a * x1 + c * y0 + e, a * x0 + c * y1 + e, a * x1 + c * y1 + e];
  const ys = [b * x0 + d * y0 + f, b * x1 + d * y0 + f, b * x0 + d * y1 + f, b * x1 + d * y1 + f];
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}
