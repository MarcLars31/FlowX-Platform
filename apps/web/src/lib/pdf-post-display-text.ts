import { normalizePdfMeasurementUnit } from "./pdf-measurement-unit";

/** Financial cells are removed only while verified coordinates are available.
 * Display code preserves uncertain legacy text, including technical tables. */
export function pdfPostDisplayText(text: string) {
  return text.split("\n").map(normalizePdfMeasurementUnit).join("\n");
}
