"use client";

import { useEffect, useRef, useState } from "react";
import { Download, ExternalLink, FileSpreadsheet, Loader2, Search, Square, Upload } from "lucide-react";
import { Button } from "./Button";
import { canSelectMaterialCandidate, initialMaterialReview, MATERIAL_IMPORT_MAX_BYTES, materialRowStatus, materialSearchQuery,
  type MaterialReview, type MaterialRow, type MaterialSearchInput } from "@/lib/material-import";
import { MaterialSearchRequestError, requestMaterialMatch } from "@/lib/material-import-client";

const fieldClass = "w-full rounded border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-950 focus:outline-2 focus:outline-blue-600 disabled:bg-neutral-100";

export function MaterialExcelImport() {
  const [rows, setRows] = useState<MaterialRow[]>([]);
  const [reviews, setReviews] = useState<Record<string, MaterialReview>>({});
  const [fileName, setFileName] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [activeId, setActiveId] = useState("");
  const [filter, setFilter] = useState("all");
  const [textFilter, setTextFilter] = useState("");
  const [page, setPage] = useState(0);
  const [replace, setReplace] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const dirty = useRef(false);
  const busy = loading || running || exporting;

  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => { if (dirty.current) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", unload);
    return () => { window.removeEventListener("beforeunload", unload); controller.current?.abort(); };
  }, []);

  async function loadFile(file: File) {
    setError(""); setMessage("");
    if (file.size > MATERIAL_IMPORT_MAX_BYTES) { setError("Excel-filen får vara högst 5 MB."); return; }
    setLoading(true);
    try {
      const { readMaterialWorkbook } = await import("@/lib/material-import-workbook");
      const result = await readMaterialWorkbook(new Uint8Array(await file.arrayBuffer()), file.name);
      setRows(result.rows); setReviews(Object.fromEntries(result.rows.map(row => [row.id, initialMaterialReview(row)])));
      setWarnings(result.warnings); setFileName(file.name); setActiveId(result.rows[0].id); setReplace(false);
      setPage(0); setFilter("all"); setTextFilter(""); dirty.current = true;
      setMessage(`${result.rows.length} rader har lästs in. Kontrollera listan och starta sökningen.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Filen kunde inte läsas."); }
    finally { setLoading(false); }
  }

  function changeInput(id: string, input: MaterialSearchInput) {
    setReviews(previous => ({ ...previous, [id]: { input, status: "pending" } }));
    dirty.current = true;
  }

  async function searchRows(ids: string[]) {
    if (controller.current || busy) return;
    const abort = new AbortController();
    controller.current = abort; setRunning(true); setError("");
    let completed = 0;
    try {
      for (const id of ids) {
        if (abort.signal.aborted) break;
        const original = reviews[id];
        setReviews(previous => ({ ...previous, [id]: { input: original.input, status: "searching" } }));
        try {
          setMessage(`Söker rad ${completed + 1} av ${ids.length}. Du kan stoppa och fortsätta senare i denna flik.`);
          const payload = await requestMaterialMatch(original.input, abort.signal, seconds => setMessage(`Ahlsell-sökningen behöver en paus. Fortsätter automatiskt om ${seconds} sekunder. Du kan stoppa sökningen under tiden.`));
          setReviews(previous => ({ ...previous, [id]: { input: original.input, result: payload, status: payload.candidates.length ? "review" : "empty" } }));
          completed++; dirty.current = true;
        } catch (cause) {
          if (abort.signal.aborted) {
            setReviews(previous => ({ ...previous, [id]: original }));
            break;
          }
          const rowError = cause instanceof Error ? cause.message : "Sökningen misslyckades.";
          setReviews(previous => ({ ...previous, [id]: { ...original, status: "error", error: rowError } }));
          setError(rowError); dirty.current = true;
          if (cause instanceof MaterialSearchRequestError && cause.stopQueue) break;
        }
      }
      setMessage(`${completed} rader söktes. Tidigare resultat finns kvar. Granska förslagen eller fortsätt med återstående rader.`);
    } finally { controller.current = null; setRunning(false); }
  }

  async function download() {
    setExporting(true); setError("");
    try {
      const { exportMaterialWorkbook } = await import("@/lib/material-import-workbook");
      const bytes = await exportMaterialWorkbook(rows, reviews);
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      const link = document.createElement("a");
      link.href = url; link.download = `${fileName.replace(/\.xlsx$/i, "")}-NRF.xlsx`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000); dirty.current = false;
      setMessage("Excel-filen har skapats med separata kolumner för förslag och granskade produktval.");
    } catch { setError("Excel-filen kunde inte skapas. Försök igen."); }
    finally { setExporting(false); }
  }

  const remaining = rows.filter(row => !row.issues.length && row.quantity !== 0 && ["pending", "error"].includes(reviews[row.id].status));
  const selectedCount = rows.filter(row => reviews[row.id].status === "selected").length;
  const visible = rows.filter(row => {
    const review = reviews[row.id];
    const matchesStatus = filter === "all" || (filter === "selected" && review.status === "selected") || (filter === "review" && review.status === "review")
      || (filter === "problems" && (row.issues.length > 0 || ["error", "empty"].includes(review.status)));
    return matchesStatus && `${row.description} ${row.dimension} ${row.fittingDimension} ${row.sheet}`.toLowerCase().includes(textFilter.toLowerCase());
  });
  const currentPage = Math.min(page, Math.max(0, Math.ceil(visible.length / 25) - 1));
  const active = rows.find(row => row.id === activeId);

  return <div className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="text-2xl font-bold text-neutral-950">Excel till NRF</h1>
        <p className="mt-2 max-w-3xl text-sm text-neutral-700">Läs in materiallistan, hitta produkter hos Ahlsell Norge och granska förslagen. Ladda sedan ner Excel med NRF / artikelnummer och produktlänkar.</p></div>
      {rows.length > 0 && <Button disabled={busy} onClick={() => void download()}><Download className="h-4 w-4" />{exporting ? "Skapar Excel…" : "Ladda ner Excel"}</Button>}
    </div>

    {(!rows.length || replace) && <section className="rounded-lg border border-dashed border-neutral-400 bg-white p-6">
      <div className="flex items-center gap-3"><FileSpreadsheet className="h-7 w-7 text-blue-800" /><h2 className="text-lg font-bold">{replace ? "Ersätt den öppna listan" : "1. Välj materiallista"}</h2></div>
      <p id="material-file-help" className="my-3 text-sm text-neutral-700">.xlsx, högst 5 MB och 1 000 materialrader. Rubriker kan ligga efter en titel. Description/Beskrivning, Enhet och Mengde/Mängd krävs. Dimensjon, Fittingdimensjon och Kategori läses om de finns. Alla blad kontrolleras.</p>
      {replace && <p className="mb-3 text-sm font-semibold text-amber-900">När en ny fil har lästs in ersätts listan och dess produktval. Ladda ner ditt arbete först.</p>}
      <label className="block text-sm font-semibold" htmlFor="material-file">Excel-fil</label>
      <input id="material-file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={busy}
        aria-describedby="material-file-help" className="mt-2 block max-w-full text-sm" onChange={event => {
          const file = event.target.files?.[0]; event.target.value = ""; if (file) void loadFile(file);
        }} />
      {replace && <Button className="mt-3" variant="secondary" disabled={busy} onClick={() => setReplace(false)}>Behåll nuvarande lista</Button>}
    </section>}
    {loading && <p role="status" className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" />Läser materiallistan…</p>}
    {error && <p role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-900">{error}</p>}
    {message && <p role="status" className="rounded border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950">{message}</p>}
    {warnings.length > 0 && <ul className="list-disc space-y-1 rounded border border-amber-200 bg-amber-50 py-3 pl-8 pr-3 text-sm text-amber-950">{warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>}

    {rows.length > 0 && <>
      <section className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold">{fileName}</h2>
          <p className="text-sm text-neutral-600">{rows.length} rader · {selectedCount} granskade val · {remaining.length} återstående sökningar</p></div>
          <div className="flex flex-wrap gap-2">{running ? <Button onClick={() => controller.current?.abort()} variant="secondary"><Square className="h-4 w-4" />Stoppa sökningen</Button>
            : <Button disabled={busy || !remaining.length} onClick={() => void searchRows(remaining.map(row => row.id))}><Search className="h-4 w-4" />Sök återstående ({remaining.length})</Button>}
            <Button variant="secondary" disabled={busy} onClick={() => setReplace(true)}><Upload className="h-4 w-4" />Byt fil</Button></div></div>
        <p className="text-xs leading-5 text-neutral-600">Listan och produktvalen finns i denna flik. Ladda ner Excel innan du lämnar sidan. Rader med noll mängd eller felaktiga indata söks inte. Inga produkter väljs automatiskt.</p>
      </section>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(350px,1fr)]">
        <section className="min-w-0 rounded-lg border border-neutral-200 bg-white p-4">
          <h2 className="mb-3 font-bold">2. Materialrader</h2>
          <div className="mb-3 grid gap-3 sm:grid-cols-2"><label className="text-xs font-semibold">Filtrera rader<input className={`${fieldClass} mt-1`} value={textFilter} onChange={event => { setTextFilter(event.target.value); setPage(0); }} placeholder="Beskrivning, dimension eller blad" /></label>
            <label className="text-xs font-semibold">Visa<select className={`${fieldClass} mt-1`} value={filter} onChange={event => { setFilter(event.target.value); setPage(0); }}>
              <option value="all">Alla rader</option><option value="review">Förslag att granska</option><option value="selected">Granskade val</option><option value="problems">Fel och saknade träffar</option>
            </select></label></div>
          <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b bg-neutral-50 text-xs text-neutral-600">
            <th className="p-2">Material</th><th className="p-2">Mått</th><th className="p-2">Mängd</th><th className="p-2">Status</th></tr></thead>
            <tbody>{visible.slice(currentPage * 25, currentPage * 25 + 25).map(row => <tr key={row.id} className={`border-b align-top ${activeId === row.id ? "bg-blue-50" : ""}`}>
              <td className="p-2"><button className="text-left font-semibold text-blue-900 underline decoration-blue-200 underline-offset-2" onClick={() => setActiveId(row.id)}>{row.description || "Beskrivning saknas"}</button>
                <p className="mt-1 text-xs text-neutral-500">{row.sheet} · rad {row.sourceRow}</p></td>
              <td className="p-2">{[row.dimension, row.fittingDimension].filter(Boolean).join(" / ") || "—"}</td>
              <td className="whitespace-nowrap p-2">{row.quantityText} {row.unit}</td>
              <td className="p-2 text-xs">{materialRowStatus(row, reviews[row.id])}{reviews[row.id].selected && <p className="mt-1 font-bold">{reviews[row.id].selected?.articleNumber}</p>}</td>
            </tr>)}</tbody></table></div>
          {!visible.length && <p className="py-4 text-sm text-neutral-600">Inga rader motsvarar filtret.</p>}
          <div className="mt-3 flex items-center justify-between gap-2 text-xs"><Button variant="secondary" disabled={!currentPage} onClick={() => setPage(currentPage - 1)}>Föregående</Button>
            <span>Sida {currentPage + 1} av {Math.max(1, Math.ceil(visible.length / 25))}</span>
            <Button variant="secondary" disabled={(currentPage + 1) * 25 >= visible.length} onClick={() => setPage(currentPage + 1)}>Nästa</Button></div>
        </section>
        {active && <MaterialRowReview key={active.id} row={active} review={reviews[active.id]} busy={busy}
          onInput={input => changeInput(active.id, input)} onSearch={() => void searchRows([active.id])}
          onReview={review => { setReviews(previous => ({ ...previous, [active.id]: review })); dirty.current = true; }} />}
      </div>
    </>}
  </div>;
}

function MaterialRowReview({ row, review, busy, onInput, onSearch, onReview }: {
  row: MaterialRow; review: MaterialReview; busy: boolean; onInput: (input: MaterialSearchInput) => void; onSearch: () => void; onReview: (review: MaterialReview) => void;
}) {
  const [checked, setChecked] = useState(false);
  const update = (patch: Partial<MaterialSearchInput>) => { setChecked(false); onInput({ ...review.input, ...patch }); };
  return <section className="min-w-0 space-y-4 rounded-lg border border-neutral-200 bg-white p-4" aria-label="Granska materialrad">
    <div><h2 className="font-bold">3. Granska produktval</h2><p className="mt-2 text-sm font-semibold">{row.description || "Beskrivning saknas"}</p>
      <p className="mt-1 text-xs text-neutral-600">{row.sheet} · rad {row.sourceRow} · {row.quantityText} {row.unit}</p></div>
    {row.issues.length > 0 ? <div className="rounded bg-amber-50 p-3 text-sm text-amber-950"><p className="font-semibold">Rätta raden i originalfilen och läs in den igen.</p><ul className="mt-2 list-disc pl-5">{row.issues.map(issue => <li key={issue}>{issue}</li>)}</ul></div>
      : row.quantity === 0 ? <p className="text-sm text-neutral-600">Raden har noll mängd. Den följer med i exporten utan produktsökning.</p> : <>
        <label className="block text-xs font-semibold">Hur ska listans mått tolkas?<select className={`${fieldClass} mt-1`} disabled={busy} value={review.input.dimensionKind}
          onChange={event => update({ dimensionKind: event.target.value as MaterialSearchInput["dimensionKind"] })}>
          <option value="unspecified">Ej angivet – behöver kontrolleras</option><option value="outside">Ytterdiameter i mm</option><option value="dn">Nominell diameter (DN)</option>
        </select></label>
        <label className="block text-xs font-semibold">Kompletterande krav<textarea className={`${fieldClass} mt-1`} rows={2} maxLength={1000} disabled={busy} value={review.input.details}
          onChange={event => update({ details: event.target.value })} placeholder="Exempel: 90° böj, pressprofil M, materialkvalitet…" /></label>
        <label className="block text-xs font-semibold">Sökord eller exakt NRF / artikelnummer<input className={`${fieldClass} mt-1`} maxLength={180} disabled={busy}
          value={review.input.query} onChange={event => update({ query: event.target.value })} placeholder={materialSearchQuery(review.input)} /></label>
        <Button disabled={busy} onClick={() => { setChecked(false); onSearch(); }}><Search className="h-4 w-4" />{review.status === "pending" ? "Sök denna rad" : "Sök igen"}</Button>
        {review.error && <p role="alert" className="text-sm text-red-800">{review.error}</p>}
        {review.result && <>
          {review.result.partial && <p className="rounded bg-amber-50 p-2 text-sm text-amber-950">Alla produktuppgifter kunde inte hämtas. Försök igen vid behov.</p>}
          {review.result.warnings.length > 0 && <ul className="list-disc space-y-1 pl-5 text-xs leading-5 text-amber-900">{review.result.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>}
          <a href={review.result.searchUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-blue-800 underline">Öppna sökningen hos Ahlsell<ExternalLink className="h-3 w-3" /></a>
          {review.result.candidates.length > 0 ? <label className="flex items-start gap-2 rounded bg-neutral-50 p-3 text-sm"><input type="checkbox" className="mt-1" checked={checked} disabled={busy}
            onChange={event => setChecked(event.target.checked)} />Jag har kontrollerat mått, utförande och kompatibilitet innan jag väljer produkt.</label>
            : <p className="text-sm">Ingen träff. Anpassa sökorden eller sök på ett exakt artikelnummer.</p>}
          {review.result.candidates.map(candidate => <article key={candidate.articleNumber} className={`space-y-2 rounded border p-3 ${review.selected?.articleNumber === candidate.articleNumber ? "border-green-500 bg-green-50" : "border-neutral-200"}`}>
            <a href={candidate.productUrl} target="_blank" rel="noopener noreferrer" className="block text-sm font-bold text-blue-900 underline">{candidate.productName}</a>
            <p className="text-sm">{candidate.subtitle}</p><p className="text-xs font-semibold">NRF / art.nr: {candidate.articleNumber}</p>
            {candidate.conflict && <p className="text-xs font-bold text-red-800">Teknisk avvikelse – kan inte väljas för denna rad.</p>}
            {candidate.warnings.length > 0 && <ul className="list-disc space-y-1 pl-4 text-xs leading-5 text-amber-900">{candidate.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>}
            {candidate.specifications.length > 0 && <details className="text-xs"><summary className="cursor-pointer font-semibold">Tekniska uppgifter</summary><ul className="mt-2 space-y-1">{candidate.specifications.map((item, i) => <li key={i}>{item}</li>)}</ul></details>}
            {review.selected?.articleNumber === candidate.articleNumber
              ? <Button disabled={busy} variant="secondary" onClick={() => onReview({ ...review, status: "review", selected: undefined })}>Ta bort produktval</Button>
              : <Button disabled={busy || !checked || !canSelectMaterialCandidate(candidate)} onClick={() => onReview({ ...review, status: "selected", selected: candidate })}>Välj granskad produkt</Button>}
          </article>)}
        </>}
      </>}
  </section>;
}
