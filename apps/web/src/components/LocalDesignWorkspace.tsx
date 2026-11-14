"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { FileText, Loader2, RotateCcw, Upload } from "lucide-react";
import { Button } from "@/components/Button";
import { PdfDropzone } from "@/components/PdfDropzone";
import { LocalPdfPreview } from "@/components/LocalPdfPreview";
import { localPdfPosts } from "@/lib/local-pdf-posts";
import type { TechnicalDescriptionExtractionResult } from "@/modules/technical-description-extractor/types";

type Tab = "overview" | "posts" | "pdf";
type Draft = { quantity: string; note: string };
const tabs: { id: Tab; label: string }[] = [
  { id: "overview", label: "Projektöversikt" },
  { id: "posts", label: "Produktposter" },
  { id: "pdf", label: "Original-PDF" }
];

export function LocalDesignWorkspace() {
  const [file, setFile] = useState<File | null>(null);
  const [pdfUrl, setPdfUrl] = useState("");
  const urlRef = useRef("");
  const [result, setResult] = useState<TechnicalDescriptionExtractionResult | null>(null);
  const [ocrPages, setOcrPages] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ label: "", progress: 0 });
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [projectName, setProjectName] = useState("Mitt lokala testprojekt");
  const [query, setQuery] = useState("");
  const [chapter, setChapter] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [pdfPage, setPdfPage] = useState(1);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); }, []);

  const lines = result?.materialLines;
  const postView = useMemo(() => localPdfPosts(lines ?? []), [lines]);
  const chapters = useMemo(() => [...new Set((lines ?? []).map(line => line.sourceChapter?.title).filter((value): value is string => Boolean(value)))], [lines]);
  const visible = useMemo(() => postView.products.filter(line =>
    (!chapter || line.sourceChapter?.title === chapter) &&
    (!query || [line.postNumber, line.description, line.nsCode, line.requirementText].join(" ").toLocaleLowerCase().includes(query.toLocaleLowerCase()))
  ), [postView, chapter, query]);
  const visibleById = new Map(visible.map(line => [line.id, line]));
  const selected = visible.find(line => line.id === selectedId) ?? visible[0];
  const selectedDraft = selected ? drafts[selected.id] ?? { quantity: selected.quantity?.toString() ?? "", note: "" } : null;

  function changeFile(next: File | null) {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    const url = next ? URL.createObjectURL(next) : "";
    urlRef.current = url;
    setPdfUrl(url); setFile(next); setResult(null); setOcrPages([]);
    setSelectedId(""); setQuery(""); setChapter(""); setDrafts({});
    setPdfPage(1); setError(null); setTab("overview");
    setProjectName(next?.name.replace(/\.pdf$/i, "") ?? "Mitt lokala testprojekt");
  }

  async function readPdf() {
    if (!file || busy) return;
    setBusy(true); setError(null); setProgress({ label: "Läser PDF…", progress: 0 });
    try {
      const { readLocalPdf } = await import("@/lib/local-pdf-import");
      const payload = await readLocalPdf(file, update => setProgress({ label: update.label, progress: update.progress ?? 0 }), update => {
        setResult(update.result);
        setOcrPages(update.ocrPageNumbers);
        setProjectName(update.result.project.name || file.name.replace(/\.pdf$/i, ""));
        const products = localPdfPosts(update.result.materialLines).products;
        setSelectedId(current => products.some(line => line.id === current) ? current : products[0]?.id ?? "");
        if (update.result.materialLines.length) setTab("posts");
      });
      if (!payload.result.materialLines.length) setTab("pdf");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "PDF-filen kunde inte läsas.");
    } finally { setBusy(false); }
  }

  function updateDraft(patch: Partial<Draft>) {
    if (!selected || !selectedDraft) return;
    setDrafts(current => ({ ...current, [selected.id]: { ...selectedDraft, ...patch } }));
  }

  return <div className="mx-auto max-w-[1600px] space-y-5 p-4 md:p-6">
    <div className="flex flex-wrap items-center justify-between gap-3 border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      <p><strong>Lokalt designläge</strong> · Utan databas. PDF och ändringar försvinner när sidan laddas om.</p>
      <span className="text-xs">Utvecklingsgren: scipx-upgrades</span>
    </div>
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="mb-1 text-sm text-ink-500">ScipX / Lokalt projekt</p>
        <h1 className="text-2xl font-semibold text-ink-950">{projectName}</h1>
        <p className="mt-2 text-sm text-ink-600">{file?.name ?? "Ladda upp en teknisk beskrivning och prova gränssnittet."}</p>
      </div>
      {file && <Button variant="secondary" disabled={busy} onClick={() => {
        if (window.confirm("Rensa PDF och alla lokala ändringar?")) changeFile(null);
      }}><RotateCcw className="h-4 w-4" />Rensa lokalt projekt</Button>}
    </header>

    <nav aria-label="Projektvyer" className="flex flex-wrap gap-1 border-b border-ink-300">
      {tabs.map(item => <button key={item.id} type="button" aria-current={tab === item.id ? "page" : undefined}
        className={"border-b-2 px-4 py-3 text-sm font-medium " + (tab === item.id ? "border-flow-700 text-flow-900" : "border-transparent text-ink-600 hover:bg-ink-50")}
        onClick={() => setTab(item.id)}>{item.label}</button>)}
    </nav>
    {error && <p role="alert" className="border border-rose-300 bg-rose-50 p-4 text-sm text-rose-800">{error}</p>}
    {busy && <div role="status" className="space-y-2 border border-ink-200 bg-white p-4 text-sm">
      <p className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />{progress.label} · Poster visas efterhand.</p>
      <progress aria-label="PDF-läsning" max={1} value={progress.progress} className="block h-2 w-full" />
    </div>}
    {!busy && !!ocrPages.length && <p role="status" className="border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
      {ocrPages.length} sidor behöver fortfarande granskas. De poster som gick att läsa visas; kontrollera återstående sidor i original-PDF:en.
    </p>}

    {tab === "overview" && <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section className="space-y-5 border border-ink-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Projektunderlag</h2>
        <label className="block text-sm font-medium">Projektnamn
          <input value={projectName} onChange={event => setProjectName(event.target.value)} maxLength={200}
            className="mt-2 block w-full rounded-md border border-ink-300 px-3 py-2 font-normal" />
        </label>
        <PdfDropzone key={file?.name ?? "empty"} id="local-pdf-upload" file={file} disabled={busy}
          onFileChange={changeFile} onValidationError={setError}
          storageNotice="PDF-filen behandlas bara på din dator. Den sparas inte och skickas inte till liveversionen." />
        <div className="flex flex-wrap gap-3">
          <Button disabled={!file || busy} onClick={readPdf}><Upload className="h-4 w-4" />Läs PDF och visa poster</Button>
          <Button variant="secondary" disabled={!pdfUrl} onClick={() => setTab("pdf")}><FileText className="h-4 w-4" />Visa original-PDF</Button>
        </div>
      </section>
      <aside className="space-y-4 border border-ink-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Projektöversikt</h2>
        <dl className="space-y-4 text-sm">
          {[["Sidor", result?.document.pageCount ?? "—"], ["Produktposter", result ? postView.products.length : "—"],
            ["Kapitel", chapters.length || "—"], ["Lokalt ändrade poster", Object.keys(drafts).length]].map(([label, value]) =>
            <div key={label} className="flex justify-between gap-4 border-b border-ink-100 pb-3"><dt>{label}</dt><dd className="font-semibold">{value}</dd></div>)}
        </dl>
        <p className="text-sm leading-6 text-ink-600">Prova PDF-visning, postlistor, mängder och kommentarer. Produktmatchning och sparade projekt kräver en separat testdatabas.</p>
        {!!ocrPages.length && <p className="text-sm text-amber-800">{ocrPages.length} sidor återstår att läsa eller granska. OCR körs lokalt i webbläsaren.</p>}
      </aside>
    </div>}

    {tab === "posts" && <section className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-52 flex-1 text-sm">Sök post
          <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Postnummer, beskrivning eller NS-kod"
            className="mt-1 block w-full rounded-md border border-ink-300 px-3 py-2" />
        </label>
        <label className="text-sm">Kapitel
          <select value={chapter} onChange={event => setChapter(event.target.value)} className="mt-1 block max-w-full rounded-md border border-ink-300 px-3 py-2">
            <option value="">Alla kapitel</option>{chapters.map(value => <option key={value}>{value}</option>)}
          </select>
        </label>
        <p className="pb-2 text-sm text-ink-500">{visible.length} av {postView.products.length} produktposter</p>
      </div>
      {!result ? <div className="border border-dashed border-ink-300 p-8 text-center">
        <p className="mb-4">Ladda upp och läs en PDF för att visa dess poster här.</p>
        <Button variant="secondary" onClick={() => setTab("overview")}>Välj PDF</Button>
      </div> : !visible.length ? <p className="border border-ink-200 p-6">Inga poster att visa. Ändra filtret eller öppna original-PDF:en.</p> :
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.7fr)]">
        <div className="max-h-[70vh] overflow-auto border border-ink-300 bg-white">
          <table className="w-full text-left text-sm" aria-label="Utlästa PDF-poster">
            <thead className="sticky top-0 bg-ink-50"><tr>{["Post", "Beskrivning", "Enh.", "Mängd"].map(label => <th key={label} className="border-b border-ink-300 p-3 font-medium">{label}</th>)}</tr></thead>
            <tbody>{postView.groups.map(group => {
              const products = group.requirementIds.flatMap(id => visibleById.has(id) ? [visibleById.get(id)!] : []);
              if (!products.length) return null;
              return <Fragment key={group.id}>
                {group.sourceId && !group.standalone && <tr className="border-y border-ink-300 bg-ink-100"><th colSpan={4} className="p-3 text-left">
                  <span className="block text-xs font-normal text-ink-600">{group.review ? "Huvudpost · kontrollera OCR mot PDF" : "Huvudpost"}</span>
                  {group.number} · {group.title}
                </th></tr>}
                {products.map(line => <tr key={line.id} aria-selected={line.id === selected?.id}
              className={"border-b border-ink-200 " + (line.id === selected?.id ? "bg-flow-50" : "hover:bg-ink-50")}>
              <td className="whitespace-nowrap p-3"><button type="button" onClick={() => setSelectedId(line.id)} className="underline underline-offset-2">{line.postNumber ?? "Visa post"}</button></td>
              <td className="p-3"><button type="button" className="text-left" onClick={() => setSelectedId(line.id)}>{line.description}</button></td>
              <td className="p-3">{line.unit ?? ""}</td>
              <td className="p-3">{drafts[line.id]?.quantity ?? line.quantity ?? <span className="text-amber-800">Kontrollera PDF</span>}</td>
            </tr>)}
              </Fragment>;
            })}</tbody>
          </table>
        </div>
        {selected && selectedDraft && <article className="space-y-4 border border-ink-300 bg-white p-5">
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-ink-500">Post {selected.postNumber ?? "—"} · {selected.nsCode ?? "PDF-post"}</p>
            <button type="button" onClick={() => { setPdfPage(selected.sourcePage); setTab("pdf"); }}
              className="text-sm text-flow-800 underline">Sida {selected.sourcePage}</button>
          </div>
          <h2 className="text-lg font-semibold">{selected.description}</h2>
          <p className="whitespace-pre-wrap text-sm leading-6">{selected.requirementText || selected.pdfDescriptionText || selected.sourceText}</p>
          {Object.keys(selected.attributes).length > 0 && <dl className="grid grid-cols-2 gap-2 bg-ink-50 p-3 text-sm">
            {Object.entries(selected.attributes).map(([key, value]) => <div key={key}><dt className="text-xs text-ink-500">{key}</dt><dd>{value}</dd></div>)}
          </dl>}
          <label className="block text-sm font-medium">Mängd {selected.unit ? "(" + selected.unit + ")" : ""}
            <input type="number" min="0" step="any" value={selectedDraft.quantity} onChange={event => updateDraft({ quantity: event.target.value })}
              className="mt-1 block w-full rounded-md border border-ink-300 px-3 py-2 font-normal" />
          </label>
          <label className="block text-sm font-medium">Lokal kommentar
            <textarea rows={3} maxLength={4000} value={selectedDraft.note} onChange={event => updateDraft({ note: event.target.value })}
              placeholder="Prova kommentarer och nya arbetsflöden här." className="mt-1 block w-full rounded-md border border-ink-300 px-3 py-2 font-normal" />
          </label>
          <p className="text-xs text-ink-500" role="status">{drafts[selected.id] ? "Ändringarna finns i den här fliken." : "Mängden kommer från PDF-läsaren."}</p>
          <details className="text-sm"><summary className="cursor-pointer">Visa fullständig källtext</summary><p className="mt-3 whitespace-pre-wrap leading-6">{selected.sourceText}</p></details>
        </article>}
      </div>}
    </section>}

    {tab === "posts" && postView.sourceRows.length > 0 && <details className="border border-ink-200 bg-white p-4 text-sm">
      <summary className="cursor-pointer">Huvudposttexter och övrig källtext · {postView.sourceRows.length}</summary>
      <div className="mt-4 space-y-3">{postView.sourceRows.map(line => <details key={line.id} className="border-t border-ink-200 pt-3">
        <summary className="cursor-pointer">{line.postNumber ? `${line.postNumber} · ` : ""}{line.description} · sida {line.sourcePage}</summary>
        <p className="mt-2 whitespace-pre-wrap leading-6">{line.sourceText}</p>
      </details>)}</div>
    </details>}

    {tab === "pdf" && <section className="space-y-3">
      {pdfUrl ? <>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm">{file?.name} · Originalfil på din dator</p>
          <a href={pdfUrl} target="_blank" rel="noreferrer" className="text-sm text-flow-800 underline">Öppna PDF i egen flik</a>
        </div>
        {file && <LocalPdfPreview file={file} page={pdfPage} onPageChange={setPdfPage} />}
        {!!ocrPages.length && <p className="text-sm text-amber-800">OCR körs automatiskt när du väljer ”Läs PDF och visa poster”. Sidor med osäker läsning behöver granskas mot originalet.</p>}
      </> : <div className="border border-dashed border-ink-300 p-8 text-center"><p className="mb-4">Välj en PDF för att förhandsvisa den.</p><Button variant="secondary" onClick={() => setTab("overview")}>Välj PDF</Button></div>}
    </section>}
  </div>;
}
