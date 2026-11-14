"use client";

import { useMemo, useState, type FormEvent } from "react";
import { ProjectAssignmentTree } from "@/components/ProjectAssignmentTree";
import { assignmentSelectionPlan, buildAssignmentTree, saveAssignmentChanges, selectedAssignmentNodes } from "@/lib/project-assignment-tree";
import type { ProjectDeliveryData, ProjectDeliveryResource } from "@/lib/project-delivery-resource";

const input = "w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900";

export function ProjectAssignmentForm({ projectId, data, resource, onChanged, onBusyChange }: {
  projectId: string; data: ProjectDeliveryData; resource: ProjectDeliveryResource; onChanged: () => Promise<unknown>; onBusyChange: (busy: boolean) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [method, setMethod] = useState("pdf");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const tree = useMemo(() => buildAssignmentTree(data.requirements), [data.requirements]);
  const nodes = useMemo(() => selectedAssignmentNodes(tree, selected), [tree, selected]);
  const plan = useMemo(() => assignmentSelectionPlan(tree, selected, data.packages), [tree, selected, data.packages]);
  const count = nodes.reduce((sum, node) => sum + node.leafIds.length, 0);
  const documentNames = useMemo(() => new Map(data.documents.map(doc => [doc.id, doc.file_name])), [data.documents]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || (method === "pdf" && !plan.length)) return;
    const form = new FormData(event.currentTarget);
    setBusy(true); onBusyChange(true); setProgress(0); setNotice(""); setError("");
    let saved = 0;
    try {
      const save = async (payload: Record<string, unknown>, revision?: number) => {
        const response = await fetch(`/api/projects/${projectId}/delivery`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "assignment", revision, payload: { ...payload, assigned_to: form.get("assigned_to"), due_date: form.get("due_date"), note: form.get("note") } })
        });
        const result = await response.json().catch(() => null);
        if (!response.ok) throw new Error(result?.error || "Tilldelningen kunde inte sparas.");
      };
      if (method === "pdf") {
        const result = await saveAssignmentChanges(plan, change => save({
          id: change.existing?.id, scope_type: change.target.type, scope_value: change.target.value
        }, change.existing?.revision), setProgress);
        saved = result.saved;
        if (result.error) setError(`${result.saved} av ${result.total} tilldelningar sparades. ${result.error} Dina val finns kvar för ett nytt försök.`);
        else { setSelected(new Set()); setNotice(`Tilldelningen är sparad för ${count} enskilda poster.`); }
      } else {
        const scope = String(form.get("scope_value"));
        const existing = data.packages.find(item => item.scope_type === "group" && item.scope_value === scope);
        await save({ id: existing?.id, scope_type: "group", scope_value: scope }, existing?.revision);
        saved = 1; setNotice("Produktgruppens tilldelning är sparad.");
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : "Tilldelningen kunde inte sparas.");
    } finally {
      // Even partial success must refresh revisions before a retry.
      const refreshed = await Promise.allSettled([resource.refresh(true), onChanged()]);
      if (resource.getSnapshot().error || refreshed.some(result => result.status === "rejected")) {
        setError(`${saved ? "Sparade tilldelningar finns kvar. " : ""}Uppgifterna kunde inte uppdateras. Ladda om innan du försöker igen.`);
      }
      setBusy(false); onBusyChange(false);
    }
  }

  return <form onSubmit={submit} className="space-y-4 rounded-xl border border-slate-200 p-4 sm:p-5">
    <div><h3 className="font-semibold">Fördela ansvar</h3><p className="mt-1 text-sm text-slate-600">Välj hela kapitel eller öppna dem för att välja huvudposter, underposter och enskilda poster. Du kan kombinera flera val.</p></div>
    <fieldset disabled={busy} className="space-y-4">
      <label className="block max-w-md text-sm font-medium">Fördelningsmetod<select className={`${input} mt-1`} value={method} onChange={event => setMethod(event.target.value)}><option value="pdf">Kapitel och poster från PDF</option><option value="group">Produktgrupp</option></select></label>
      {method === "pdf" ? <>
        <ProjectAssignmentTree tree={tree} selected={selected} onChange={setSelected} documentNames={documentNames} />
        <div aria-live="polite" className="rounded-lg bg-slate-50 p-3 text-sm">
          <strong>{count ? `${count} enskilda poster valda` : "Välj kapitel eller poster"}</strong>
          <p className="mt-1 break-words text-xs text-slate-600">{nodes.slice(0, 5).map(node => `${node.number} ${node.title}`.trim()).join(" · ")}{nodes.length > 5 ? ` · +${nodes.length - 5} fler val` : ""}</p>
          <p className="mt-1 text-xs text-slate-500">Pilen öppnar. Kryssrutan väljer allt under nivån. Ett streck visar ett delvis valt område.</p>
        </div>
      </> : <label className="block text-sm">Produktgrupp<select name="scope_value" className={input} required><option value="">Välj produktgrupp</option>{[...new Set(data.requirements.map(row => row.category))].filter(Boolean).map(category => <option key={category}>{category}</option>)}</select></label>}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm">Ansvarig<select className={input} name="assigned_to" required defaultValue=""><option value="">Välj person</option>{data.members.map(member => <option key={member.user_id} value={member.user_id}>{member.label}</option>)}</select></label>
        <label className="text-sm">Deadline<input className={input} type="date" name="due_date" /></label>
        <label className="text-sm sm:col-span-2">Instruktion till ansvarig<input className={input} name="note" maxLength={2000} /></label>
      </div>
      <button type="submit" disabled={(method === "pdf" && !count) || Boolean(resource.getSnapshot().error)} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? `Sparar… ${progress}${method === "pdf" ? ` / ${plan.length}` : ""}` : method === "pdf" && count ? `Fördela ${count} poster` : "Spara tilldelning"}</button>
    </fieldset>
    {notice && <p role="status" className="text-sm text-emerald-800">{notice}</p>}
    {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
  </form>;
}
