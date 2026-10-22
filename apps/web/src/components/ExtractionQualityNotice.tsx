import type { ExtractionQualitySummary } from "@/lib/technical-description-quality";

export function ExtractionQualityNotice({ summary, fileName }: { summary?: ExtractionQualitySummary | null; fileName?: string }) {
  if (!summary || (!summary.incompletePageCount && !summary.quantityPageCount)) return null;
  const pages = (values: number[], count: number) => values.join(", ") + (count > values.length ? ` … (${count} sider totalt)` : "");
  return <div role="status" className="my-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
    <strong>{fileName ? `${fileName}: ` : ""}PDF-importen trenger kontroll.</strong>
    {summary.incompletePageCount > 0 && <p>Ikke all tekst kunne leses på side {pages(summary.incompletePages, summary.incompletePageCount)}. Kontroller disse sidene i original-PDF-en; poster eller krav kan mangle.</p>}
    {Boolean(summary.recoveredPostCount) && <p>{summary.recoveredPostCount} post(er) ble hentet fra kildeteksten og markert for kontroll.</p>}
    {summary.quantityPageCount > 0 && <p>Mengdene må kontrolleres på side {pages(summary.quantityPages, summary.quantityPageCount)}.</p>}
  </div>;
}
