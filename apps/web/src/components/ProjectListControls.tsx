"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ArrowRight, CheckSquare2, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/Button";
import { DemoBadge } from "@/components/DemoBadge";
import type { OrganizationProject } from "@/types/organization";

const stages = [
  ["setup", "Ladda upp PDF"],
  ["documents", "Ladda upp PDF"],
  ["technical_description", "PDF analyseras"],
  ["requirements_review", "Välj produkter"],
  ["analysis", "Välj produkter"],
  ["product_matching", "Välj produkter"],
  ["material_list", "Kontrollera resultat"],
  ["approval", "Kontrollera resultat"]
] as const;

export function ProjectListControls({
  projects,
  canDelete
}: {
  projects: OrganizationProject[];
  canDelete: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [deletedIds, setDeletedIds] = useState<Set<string>>(() => new Set());
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("sv");
    return projects
      .filter((project) => !deletedIds.has(project.id))
      .filter((project) => {
        const haystack = [project.name, project.project_number, project.customer_name]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase("sv");
        return !normalized || haystack.includes(normalized);
      })
      .sort(
        (a, b) =>
          new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      );
  }, [deletedIds, projects, query]);

  const selectedProjects = projects.filter(
    (project) => selectedIds.has(project.id) && !deletedIds.has(project.id)
  );
  const allFilteredSelected =
    filtered.length > 0 && filtered.every((project) => selectedIds.has(project.id));

  function toggleAllVisible() {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allFilteredSelected) {
        filtered.forEach((project) => next.delete(project.id));
      } else {
        filtered.forEach((project) => next.add(project.id));
      }
      return next;
    });
    setShowDeleteConfirmation(false);
    setError(null);
  }

  function toggleProject(projectId: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
    setShowDeleteConfirmation(false);
    setError(null);
  }

  async function deleteSelectedProjects() {
    setDeleting(true);
    setError(null);
    const deleted: string[] = [];
    const failed: string[] = [];

    for (const project of selectedProjects) {
      const response = await fetch(`/api/projects/${project.id}/trash`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: "Projektet togs bort från listan över pågående projekt.",
          confirmation: project.name
        })
      });
      if (response.ok) deleted.push(project.id);
      else failed.push(project.name);
    }

    if (deleted.length > 0) {
      setDeletedIds((current) => new Set([...current, ...deleted]));
      setSelectedIds((current) => {
        const next = new Set(current);
        deleted.forEach((id) => next.delete(id));
        return next;
      });
    }
    setShowDeleteConfirmation(false);
    setDeleting(false);

    if (failed.length > 0) {
      setError(
        `${failed.length} projekt kunde inte flyttas till papperskorgen: ${failed.join(", ")}.`
      );
    } else {
      router.refresh();
    }
  }

  return (
    <div>
      <div className="border-b border-cyan-300/15 bg-[#06213d] p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-bold text-white">Pågående projekt</h2>
            <p className="mt-1 text-sm text-slate-300">Öppna ett projekt eller markera flera och flytta dem till papperskorgen.</p>
          </div>
          <label className="relative block w-full sm:max-w-sm">
            <span className="sr-only">Sök bland pågående projekt</span>
            <Search className="pointer-events-none absolute left-3 top-3.5 h-5 w-5 text-ink-400" aria-hidden="true" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Sök projekt" className="h-12 w-full rounded-xl border border-ink-200 bg-white pl-10 pr-3 text-base" />
          </label>
        </div>
      </div>

      {canDelete && (
        <div className={selectedProjects.length > 0 ? "flex flex-col gap-3 border-b-2 border-rose-200 bg-rose-50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5" : "flex flex-col gap-3 border-b border-ink-200 bg-cyan-50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"}>
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-3 text-base font-bold text-ink-900">
            <input type="checkbox" checked={allFilteredSelected} onChange={toggleAllVisible} className="h-6 w-6 rounded border-2 border-ink-400 text-flow-600 focus:ring-flow-500" />
            Markera alla som visas
          </label>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <span className="text-sm font-bold text-ink-700">{selectedProjects.length} markerade</span>
            <Button variant="danger" className="min-h-12 justify-center text-base" disabled={selectedProjects.length === 0 || deleting} onClick={() => setShowDeleteConfirmation(true)}><Trash2 className="h-5 w-5" aria-hidden="true" />Ta bort markerade</Button>
          </div>
        </div>
      )}

      {showDeleteConfirmation && selectedProjects.length > 0 && (
        <section role="dialog" aria-labelledby="batch-delete-title" className="border-b-2 border-rose-300 bg-rose-100 p-5 sm:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-rose-700 text-white"><Trash2 className="h-6 w-6" aria-hidden="true" /></span>
              <div>
                <h3 id="batch-delete-title" className="text-xl font-bold text-rose-950">Ta bort {selectedProjects.length} projekt?</h3>
                <p className="mt-2 max-w-2xl text-base leading-7 text-rose-900">De flyttas till papperskorgen och försvinner från listan. En administratör kan återställa dem.</p>
              </div>
            </div>
            <div className="flex shrink-0 flex-col gap-3 sm:flex-row">
              <Button variant="secondary" disabled={deleting} onClick={() => setShowDeleteConfirmation(false)}>Avbryt</Button>
              <Button variant="danger" disabled={deleting} onClick={() => void deleteSelectedProjects()}><Trash2 className="h-5 w-5" aria-hidden="true" />{deleting ? "Tar bort…" : `Ja, ta bort ${selectedProjects.length}`}</Button>
            </div>
          </div>
        </section>
      )}

      {error && <p role="alert" className="border-b border-rose-200 bg-rose-50 px-5 py-4 text-sm font-bold text-rose-800">{error}</p>}

      <div className="divide-y divide-ink-100">
        {filtered.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <CheckSquare2 className="mx-auto h-9 w-9 text-emerald-600" aria-hidden="true" />
            <h3 className="mt-3 text-lg font-bold text-ink-950">Inga pågående projekt visas</h3>
            <p className="mt-1 text-sm text-ink-600">Alla projekt är klara, borttagna eller matchar inte sökningen.</p>
          </div>
        ) : filtered.map((project) => {
          const selected = selectedIds.has(project.id);
          return (
            <div key={project.id} className={selected ? "flex flex-col gap-4 bg-rose-50 px-4 py-4 sm:flex-row sm:items-center sm:px-5" : "flex flex-col gap-4 bg-white px-4 py-4 transition hover:bg-cyan-50/50 sm:flex-row sm:items-center sm:px-5"}>
              {canDelete && (
                <label className="flex min-h-11 cursor-pointer items-center gap-3 sm:w-12 sm:justify-center" title={`Markera ${project.name}`}>
                  <input type="checkbox" checked={selected} onChange={() => toggleProject(project.id)} aria-label={`Markera projektet ${project.name}`} className="h-7 w-7 rounded border-2 border-ink-400 text-flow-600 focus:ring-flow-500" />
                  <span className="font-bold text-ink-800 sm:sr-only">Markera</span>
                </label>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="truncate text-lg font-bold text-ink-950">{project.name}</h3>
                  {project.demo_data_set_id && <DemoBadge />}
                </div>
                <p className="mt-1 text-sm font-semibold text-flow-800">Nästa steg: {stageLabel(project)}</p>
                <p className="mt-1 text-xs text-ink-500">{project.project_number ? `Projektnr ${project.project_number} · ` : ""}Uppdaterat {new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium" }).format(new Date(project.updated_at))}</p>
              </div>
              <Link href={projectHref(project)} className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#06213d] px-5 text-base font-black text-white transition hover:bg-[#0a3156]">Öppna projektet<ArrowRight className="h-5 w-5" aria-hidden="true" /></Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function stageLabel(project: OrganizationProject) {
  return stages.find(([value]) => value === project.current_stage)?.[1] ?? "Fortsätt projektet";
}

function projectHref(project: OrganizationProject) {
  const stage = project.current_stage ?? "documents";
  if (["setup", "documents", "technical_description"].includes(stage)) {
    return `/projects/${project.id}?step=documents`;
  }
  if (["requirements_review", "analysis", "product_matching"].includes(stage)) {
    return `/projects/${project.id}?step=products`;
  }
  return `/projects/${project.id}`;
}
