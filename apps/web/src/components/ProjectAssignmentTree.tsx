"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import type { AssignmentTreeNode } from "@/lib/project-assignment-tree";

function SelectionBox({ label, selected, total, onChange }: { label: string; selected: number; total: number; onChange: () => void }) {
  const partial = selected > 0 && selected < total;
  return <input type="checkbox" aria-label={label} checked={selected === total} aria-checked={partial ? "mixed" : selected === total}
    ref={element => { if (element) element.indeterminate = partial; }} onChange={onChange}
    className="h-4 w-4 shrink-0 rounded border-slate-400 text-emerald-700 focus:ring-emerald-600" />;
}

export function ProjectAssignmentTree({ tree, selected, onChange, documentNames }: {
  tree: readonly AssignmentTreeNode[];
  selected: ReadonlySet<string>;
  onChange: (selected: Set<string>) => void;
  documentNames: ReadonlyMap<string, string>;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const allIds = tree.flatMap(node => node.leafIds);
  const count = (ids: readonly string[]) => ids.filter(id => selected.has(id)).length;
  function toggle(ids: readonly string[]) {
    const next = new Set(selected);
    const remove = ids.every(id => next.has(id));
    ids.forEach(id => { if (remove) next.delete(id); else next.add(id); });
    onChange(next);
  }
  function row(node: AssignmentTreeNode) {
    const selectedCount = count(node.leafIds);
    const open = expanded.has(node.key);
    return <li key={node.key}>
      <div className={`flex items-start gap-2 rounded-lg px-2 py-3 ${selectedCount ? "bg-emerald-50" : "hover:bg-slate-50"}`}>
        {node.children.length > 0 ? <button type="button" aria-expanded={open}
          aria-label={`${open ? "Stäng" : "Öppna"} ${node.number} ${node.title}`.trim()}
          onClick={() => setExpanded(current => { const next = new Set(current); if (open) next.delete(node.key); else next.add(node.key); return next; })}
          className="-mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded hover:bg-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600">
          <ChevronRight aria-hidden="true" className={`h-4 w-4 ${open ? "rotate-90" : ""}`} />
        </button> : <span className="w-8 shrink-0" />}
        <span className="mt-0.5 flex"><SelectionBox label={`Välj ${node.number} ${node.title}`.trim()} selected={selectedCount} total={node.leafIds.length} onChange={() => toggle(node.leafIds)} /></span>
        <div className="min-w-0 flex-1 break-words">
          {node.number && <p className="text-xs font-semibold text-slate-500">{node.number}</p>}
          <p className="text-sm font-semibold">{node.title}</p>
          <p className="mt-1 text-xs text-slate-500">
            {node.children.length > 0 ? `${selectedCount > 0 && selectedCount < node.leafIds.length ? `${selectedCount} av ` : ""}${node.leafIds.length} enskilda poster` : "Enskild post"}
            {node.page ? ` · Sida ${node.page}` : ""}
            {node.target && documentNames.get(node.documentId) ? ` · ${documentNames.get(node.documentId)}` : ""}
          </p>
        </div>
      </div>
      {node.children.length > 0 && open && <ul className="ml-3 space-y-1 border-l border-slate-200 pl-2 sm:ml-5 sm:pl-3">{node.children.map(row)}</ul>}
    </li>;
  }
  if (!allIds.length) return <p className="text-sm text-slate-600">Inga aktiva PDF-poster finns att fördela. Lägg till ett underlag under Dokument.</p>;
  return <div className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white">
    <label className="flex cursor-pointer items-center gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold">
      <SelectionBox label="Välj alla kapitel" selected={count(allIds)} total={allIds.length} onChange={() => toggle(allIds)} />
      Välj alla kapitel <span className="ml-auto text-xs font-normal text-slate-500">{tree.length} kapitel</span>
    </label>
    <ul className="max-h-[34rem] space-y-1 overflow-y-auto p-2">{tree.map(row)}</ul>
  </div>;
}
