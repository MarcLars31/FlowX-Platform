"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { Button } from "./Button";
import { emptyChapterOrganization, organizationSources, organizationTargets, type ChapterOrganization } from "@/lib/chapter-organization";
import type { ChapterWorkspace } from "@/lib/project-chapter-workspace";

export function ChapterTextOrganizer({ projectId, workspace, disabled, onSaved }: {
  projectId: string; workspace: ChapterWorkspace; disabled: boolean; onSaved: (organization: ChapterOrganization) => void;
}) {
  const [open, setOpen] = useState(false);
  const sources = organizationSources(workspace);
  const targets = new Set(organizationTargets(workspace).map(chapter => chapter.id));
  const unplaced = sources.filter(source => !targets.has(workspace.organization?.placements[source.id] ?? "")).length;
  if (!workspace.canOrganize || !sources.length) return null;
  return <>
    <Button variant="secondary" disabled={disabled} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
      Ordna PDF-text{unplaced > 0 ? ` · ${unplaced} att placera` : ""}
    </Button>
    {open && <OrganizerDialog projectId={projectId} workspace={workspace} onSaved={onSaved} onClose={() => setOpen(false)} />}
  </>;
}

function OrganizerDialog({ projectId, workspace, onSaved, onClose }: {
  projectId: string; workspace: ChapterWorkspace; onSaved: (organization: ChapterOrganization) => void; onClose: () => void;
}) {
  const id = useId(), dialog = useRef<HTMLDialogElement>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [filter, setFilter] = useState("unplaced");
  const [target, setTarget] = useState("");
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const organization = workspace.organization ?? emptyChapterOrganization();
  const targets = useMemo(() => organizationTargets(workspace), [workspace]);
  const targetById = new Map(targets.map(chapter => [chapter.id, chapter]));
  const sources = organizationSources(workspace);
  const placed = (sourceId: string) => targetById.get(organization.placements[sourceId]);
  const visible = sources.filter(source => filter === "all" || (filter === "placed" ? Boolean(placed(source.id)) : !placed(source.id)));
  useEffect(() => {
    const element = dialog.current, trigger = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    element?.showModal();
    return () => { element?.close(); document.body.style.overflow = overflow;
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus({ preventScroll: true }); };
  }, []);
  useEffect(() => {
    if (!saving) return;
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", unload);
    return () => window.removeEventListener("beforeunload", unload);
  }, [saving]);
  async function save() {
    setSaving(true); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/projects/${projectId}/chapters`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revision: organization.revision, sourceIds: selected,
          targetId: target === "new" || target === "unplaced" ? null : target, newTitle: target === "new" ? title.trim() : null }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Placeringen kunde inte sparas.");
      onSaved(payload.organization);
      const destination = target === "new" ? title.trim() : target === "unplaced" ? "PDF-text att kontrollera" : targetById.get(target)?.title;
      setMessage(`${selected.length} poster har flyttats till ${destination}.`);
      setSelected([]); setTitle(""); setTarget("");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Placeringen kunde inte sparas."); }
    finally { setSaving(false); }
  }
  return <dialog ref={dialog} aria-labelledby={`${id}-title`} className="m-auto max-h-[90vh] w-[min(68rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-neutral-300 bg-white p-0 text-neutral-950 shadow-xl backdrop:bg-black/40"
    onCancel={event => { event.preventDefault(); if (!saving) onClose(); }}>
    <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b bg-white p-5">
      <div><h2 id={`${id}-title`} className="text-xl font-semibold">Ordna PDF-text</h2>
        <p className="mt-1 text-sm">Markera poster och välj var de ska visas. En huvudpost flyttas tillsammans med sina produktposter. Originaltext och PDF-sidor sparas.</p></div>
      <button type="button" aria-label="Stäng kapitelhantering" disabled={saving} onClick={onClose} className="rounded border p-2"><X className="h-5 w-5" aria-hidden="true" /></button>
    </header>
    <div className="space-y-4 p-5">
      {error && <p role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-sm">{error}</p>}
      {message && <p role="status" className="rounded border border-green-300 bg-green-50 p-3 text-sm">{message}</p>}
      <fieldset disabled={saving} className="space-y-4">
        <label className="block text-sm font-medium">Visa poster
          <select className="ml-3 rounded border bg-white p-2" value={filter} onChange={event => { setFilter(event.target.value); setSelected([]); }}>
            <option value="unplaced">PDF-text att kontrollera ({sources.filter(source => !placed(source.id)).length})</option>
            <option value="placed">Flyttade ({sources.filter(source => placed(source.id)).length})</option><option value="all">Alla ({sources.length})</option>
          </select>
        </label>
        {visible.length > 0 ? <>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={visible.every(source => selected.includes(source.id))}
            onChange={event => setSelected(event.target.checked ? visible.slice(0,500).map(source => source.id) : [])} />Markera alla{visible.length > 500 ? " (högst 500 åt gången)" : ""}</label>
          <ul className="max-h-[42vh] space-y-2 overflow-y-auto rounded border p-2">{visible.map(source => <li key={source.id} className="rounded border border-neutral-200 p-3">
            <label className="flex items-start gap-3"><input type="checkbox" className="mt-1" checked={selected.includes(source.id)}
              disabled={!selected.includes(source.id) && selected.length >= 500}
              onChange={event => setSelected(current => event.target.checked ? [...current,source.id] : current.filter(value => value !== source.id))} />
              <span><span className="block text-sm font-semibold">{[source.number,source.title].filter(Boolean).join(" ")}</span>
                {source.requirementIds.length > 0 && <span className="block text-xs font-medium">{source.requirementIds.length} produktposter följer med</span>}
                <span className="block text-xs text-neutral-600">PDF-sida {source.pages.join(", ") || "saknas"} · {placed(source.id)?.title ?? "PDF-text att kontrollera"}</span></span>
            </label>
            <details className="ml-6 mt-2 text-sm"><summary className="cursor-pointer">Visa originaltext</summary><p className="mt-2 whitespace-pre-wrap break-words leading-relaxed">{source.text || "Ingen separat text finns sparad."}</p></details>
          </li>)}</ul>
        </> : <p className="rounded bg-neutral-50 p-4 text-sm">Inga poster i denna vy.</p>}
        <div className="flex flex-wrap items-end gap-3 border-t pt-4">
          <label className="block min-w-64 text-sm font-medium">Flytta till
            <select className="mt-1 block w-full rounded border bg-white p-2" value={target} onChange={event => setTarget(event.target.value)}>
              <option value="">Välj kapitel…</option><option value="new">Skapa nytt kapitel…</option>
              {targets.map(chapter => <option key={chapter.id} value={chapter.id}>{[chapter.number,chapter.title].filter(Boolean).join(" ")}</option>)}
              <option value="unplaced">Tillbaka till PDF-text att kontrollera</option>
            </select>
          </label>
          {target === "new" && <label className="block text-sm font-medium">Nytt kapitelnamn<input className="mt-1 block rounded border p-2" maxLength={160} value={title} onChange={event => setTitle(event.target.value)} /></label>}
          <Button type="button" disabled={!selected.length || !target || target === "new" && !title.trim()} onClick={() => void save()}>
            {saving ? "Sparar…" : target === "new" ? "Skapa kapitel och flytta" : `Flytta ${selected.length || "valda"} poster`}
          </Button>
        </div>
      </fieldset>
    </div>
  </dialog>;
}
