"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronRight, FileText, X } from "lucide-react";
import type { ChapterSource } from "@/lib/project-chapter-workspace";
import type { MainPostGroup } from "@/lib/project-post-hierarchy";

/** Reading a main post never changes product navigation, drafts or approval. */
export function MainPostDetailsButton({ group, source, disabled = false, variant = "button" }: {
  group: MainPostGroup; source?: ChapterSource; disabled?: boolean; variant?: "button" | "heading";
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  if (!source || group.standalone) return null;
  const heading = variant === "heading";
  const trigger = <button type="button" disabled={disabled} aria-haspopup="dialog" aria-expanded={open} aria-controls={id}
    aria-label={heading ? `Åpne hovedpost ${group.number}: ${group.title}` : undefined}
    className={heading
      ? "flex w-full items-center justify-between gap-4 rounded text-left hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4"
      : "inline-flex items-center gap-2 rounded border border-neutral-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-neutral-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"}
    onClick={() => setOpen(true)}>{heading ? <>
      <span><span className="mb-1 block text-xs font-normal">Hovedpost {group.number}</span>
        <span className="block text-lg font-semibold">{group.title}</span>
        <span className="mt-2 block text-xs font-normal">Vis krav og informasjon</span></span>
      <ChevronRight className="h-5 w-5 shrink-0" aria-hidden="true" />
    </> : <><FileText className="h-4 w-4" aria-hidden="true" />Åpne hovedpost {group.number}</>}</button>;
  return <>
    {heading ? <h3>{trigger}</h3> : trigger}
    {open && <MainPostDetailsDialog id={id} source={source} onClose={() => setOpen(false)} />}
  </>;
}

export function MainPostDetailsDialog({ id, source, onClose }: {
  id: string; source: ChapterSource; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    const trigger = document.activeElement;
    element?.showModal();
    return () => { element?.close(); if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus({ preventScroll: true }); };
  }, []);
  return <dialog ref={dialog} id={id} aria-labelledby={`${id}-title`}
    className="m-auto max-h-[85vh] w-[min(48rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-neutral-300 bg-white p-0 text-neutral-950 shadow-xl backdrop:bg-black/40"
    onCancel={event => { event.preventDefault(); onClose(); }}>
    <header className="sticky top-0 flex items-start justify-between gap-4 border-b border-neutral-200 bg-white p-5">
      <div><p className="mb-1 text-sm">Hovedpost {source.number}</p><h2 id={`${id}-title`} className="text-lg font-semibold">{source.number} {source.title}</h2>
        {source.pages.length > 0 && <p className="mt-2 text-sm text-neutral-600">PDF-side {source.pages.join(", ")}</p>}</div>
      <button type="button" aria-label="Lukk hovedpost" onClick={onClose} className="rounded border border-neutral-300 p-2 hover:bg-neutral-50"><X className="h-5 w-5" aria-hidden="true" /></button>
    </header>
    <section aria-label="Hovedpostens kravtekst" className="p-5">
      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{source.text.trim() || "Ingen separat kravtekst er lagret for denne hovedposten."}</p>
    </section>
  </dialog>;
}
