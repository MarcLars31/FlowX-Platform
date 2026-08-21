"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { DemoBadge } from "@/components/DemoBadge";
import type { OrganizationProject } from "@/types/organization";

const stages = [
  ["setup", "Projektinformation"],
  ["documents", "Dokument"],
  ["technical_description", "Teknisk beskrivning"],
  ["requirements_review", "Äldre extraktionssteg"],
  ["analysis", "Analys"],
  ["product_matching", "Ahlsells produktval"],
  ["material_list", "Materiallista"],
  ["approval", "Godkännande"],
  ["completed", "Klart"]
] as const;

export function ProjectListControls({
  projects,
  currentUserId
}: {
  projects: OrganizationProject[];
  currentUserId: string;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [stage, setStage] = useState("all");
  const [mineOnly, setMineOnly] = useState(false);
  const [sort, setSort] = useState<"updated" | "name" | "number">("updated");

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("sv");
    return projects
      .filter((project) => {
        const haystack = [project.name, project.project_number, project.customer_name]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase("sv");
        return (!normalized || haystack.includes(normalized))
          && (status === "all" || project.status === status)
          && (stage === "all" || project.current_stage === stage)
          && (!mineOnly || project.created_by === currentUserId || project.assigned_to === currentUserId || project.project_manager_id === currentUserId);
      })
      .sort((a, b) => {
        if (sort === "name") return a.name.localeCompare(b.name, "sv");
        if (sort === "number") return String(a.project_number ?? "").localeCompare(String(b.project_number ?? ""), "sv");
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      });
  }, [currentUserId, mineOnly, projects, query, sort, stage, status]);

  return (
    <>
      <div className="grid gap-3 border-b border-cyan-300/15 bg-[#06213d] p-4 md:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]">
        <label className="relative block">
          <span className="sr-only">Sök projekt</span>
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-ink-400" aria-hidden="true" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Sök projekt, nummer eller kund" className="h-10 w-full rounded-md border border-ink-200 bg-white pl-9 pr-3 text-sm" />
        </label>
        <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Statusfilter" className="h-10 rounded-md border border-ink-200 bg-white px-3 text-sm">
          <option value="all">Alla statusar</option>
          {[...new Set(projects.map((project) => project.status))].map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <select value={stage} onChange={(event) => setStage(event.target.value)} aria-label="Arbetsstegsfilter" className="h-10 rounded-md border border-ink-200 bg-white px-3 text-sm">
          <option value="all">Alla arbetssteg</option>
          {stages.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} aria-label="Sortering" className="h-10 rounded-md border border-ink-200 bg-white px-3 text-sm">
          <option value="updated">Senast uppdaterad</option>
          <option value="name">Namn</option>
          <option value="number">Projektnummer</option>
        </select>
      </div>
      <label className="flex items-center gap-2 border-b border-ink-200 px-4 py-3 text-sm text-ink-600">
        <input type="checkbox" checked={mineOnly} onChange={(event) => setMineOnly(event.target.checked)} />
        Mina projekt
        <span className="ml-auto text-xs text-ink-500">{filtered.length} av {projects.length}</span>
      </label>
      <div className="overflow-x-auto">
        {filtered.length === 0 ? <p className="px-6 py-10 text-center text-sm text-ink-600">Inga projekt matchar filtret.</p> : (
          <table className="min-w-full divide-y divide-ink-200 text-sm">
            <thead className="bg-[#03162d] text-left text-xs uppercase text-slate-300"><tr><th className="px-5 py-3 font-semibold">Projekt</th><th className="px-5 py-3 font-semibold">Kund</th><th className="px-5 py-3 font-semibold">Arbetssteg</th><th className="px-5 py-3 font-semibold">Status</th><th className="px-5 py-3 font-semibold">Uppdaterat</th></tr></thead>
            <tbody className="divide-y divide-ink-100">{filtered.map((project) => <tr key={project.id} className="transition hover:bg-cyan-50/50"><td className="px-5 py-4 font-semibold text-ink-950"><a href={`/projects/${project.id}`} className="hover:text-flow-700">{project.name}{project.project_number && <span className="mt-1 block text-xs font-normal text-ink-500">{project.project_number}</span>}</a>{project.demo_data_set_id && <span className="mt-2 block"><DemoBadge /></span>}</td><td className="px-5 py-4 text-ink-600">{project.customer_name ?? "—"}</td><td className="px-5 py-4 text-ink-600">{stages.find(([value]) => value === project.current_stage)?.[1] ?? project.current_stage ?? "—"}</td><td className="px-5 py-4 text-ink-600">{project.status}</td><td className="px-5 py-4 text-ink-500">{new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium" }).format(new Date(project.updated_at))}</td></tr>)}</tbody>
          </table>
        )}
      </div>
    </>
  );
}
