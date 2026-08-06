"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  FileText,
  FolderKanban,
  LayoutDashboard,
  ListChecks,
  PackageSearch,
  Save,
  Upload
} from "lucide-react";
import { Button } from "@/components/Button";
import { DemoBadge } from "@/components/DemoBadge";
import { Input } from "@/components/Input";
import type { OrganizationProject } from "@/types/organization";
import { PROJECT_STAGES, nextProjectStage } from "@/lib/project-governance";

export type ProjectModuleData = {
  project: OrganizationProject;
  systemTypes: ProjectRow[];
  standards: ProjectRow[];
  suppliers: ProjectRow[];
  documents: ProjectRow[];
  technicalDescriptions: ProjectRow[];
  requirements: ProjectRow[];
  conflicts: ProjectRow[];
  suggestions: ProjectRow[];
  decisions: ProjectRow[];
};

type ProjectRow = Record<string, unknown> & { id: string };
type Tab = "overview" | "documents" | "requirements" | "products" | "decisions";

const statusLabels: Record<string, string> = {
  draft: "Utkast",
  analysis: "Under analys",
  awaiting_input: "Väntar på underlag",
  proposal_ready: "Produktförslag klart",
  in_review: "Under granskning",
  approved: "Godkänt",
  quoted: "Offererat",
  ordered: "Beställt",
  delivered: "Levererat",
  archived: "Arkiverat",
  active: "Aktivt"
};

const projectStages = PROJECT_STAGES;

export function ProjectWorkspace({ initialData }: { initialData: ProjectModuleData }) {
  const [data, setData] = useState(initialData);
  const [tab, setTab] = useState<Tab>("overview");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [requirementForm, setRequirementForm] = useState({ category: "Tekniskt krav", key: "", value: "" });

  async function reload() {
    const response = await fetch(`/api/projects/${data.project.id}`, { cache: "no-store" });
    if (!response.ok) throw new Error("Projektdata kunde inte laddas om.");
    const payload = (await response.json()) as {
      project: OrganizationProject;
      systemTypes: ProjectRow[];
      standards: ProjectRow[];
      suppliers: ProjectRow[];
      documents: ProjectRow[];
      technicalDescriptions: ProjectRow[];
      requirements: ProjectRow[];
      conflicts: ProjectRow[];
      suggestions: ProjectRow[];
      decisions: ProjectRow[];
    };
    setData(payload);
  }

  async function saveProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(`/api/projects/${data.project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"),
          projectNumber: form.get("projectNumber"),
          customerName: form.get("customerName"),
          endCustomer: form.get("endCustomer"),
          address: form.get("address"),
          status: form.get("status"),
          currentStage: form.get("currentStage"),
          projectType: form.get("projectType"),
          procurementStrategy: form.get("procurementStrategy"),
          currency: form.get("currency"),
          deliveryCountry: form.get("deliveryCountry"),
          warehouseLocation: form.get("warehouseLocation"),
          standard: form.get("standard"),
          systemType: form.get("systemType"),
          supplier: form.get("supplier"),
          expectedStartDate: form.get("expectedStartDate") || null,
          expectedDeliveryDate: form.get("expectedDeliveryDate") || null,
          description: form.get("description"),
          internalComments: form.get("internalComments")
        })
      });
      const payload = (await response.json().catch(() => null)) as { project?: OrganizationProject; error?: string } | null;
      if (!response.ok || !payload?.project) throw new Error(payload?.error ?? "Projektet kunde inte sparas.");
      setData((current) => ({ ...current, project: payload.project as OrganizationProject }));
      setMessage("Projektinformationen är sparad.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Projektet kunde inte sparas.");
    } finally {
      setSaving(false);
    }
  }

  async function uploadTechnicalDescription(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
      setError("Välj en PDF med teknisk beskrivning.");
      return;
    }
    setUploading(true);
    setError(null);
    setMessage(null);
    try {
      form.set("projectId", data.project.id);
      const response = await fetch("/api/technical-descriptions", { method: "POST", body: form });
      const payload = (await response.json().catch(() => null)) as { error?: string; persistedRequirementCount?: number } | null;
      if (!response.ok) throw new Error(payload?.error ?? "Underlaget kunde inte extraheras.");
      await reload();
      setMessage(`Underlaget är extraherat och sparat. ${payload?.persistedRequirementCount ?? 0} krav lades till för granskning.`);
      setSelectedFileName(null);
      event.currentTarget.reset();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Underlaget kunde inte extraheras.");
    } finally {
      setUploading(false);
    }
  }

  async function addRequirement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!requirementForm.key.trim() || !requirementForm.value.trim()) {
      setError("Ange både kravnyckel och kravvärde.");
      return;
    }
    setError(null);
    try {
      const response = await fetch(`/api/projects/${data.project.id}/requirements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: requirementForm.category,
          requirementKey: requirementForm.key,
          valueText: requirementForm.value,
          certainty: "explicit"
        })
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? "Kravet kunde inte läggas till.");
      await reload();
      setRequirementForm({ category: "Tekniskt krav", key: "", value: "" });
      setMessage("Kravet är tillagt och väntar på granskning.");
    } catch (addError) {
      setError(addError instanceof Error ? addError.message : "Kravet kunde inte läggas till.");
    }
  }

  async function reviewRequirement(requirementId: string, status: string) {
    setError(null);
    const normalizedStatus = status === "confirmed"
      ? "user_confirmed"
      : status === "unclear"
        ? "inferred_unreviewed"
        : status;
    try {
      const response = await fetch(`/api/projects/${data.project.id}/requirements/${requirementId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: normalizedStatus })
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? "Kravet kunde inte uppdateras.");
      await reload();
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : "Kravet kunde inte uppdateras.");
    }
  }

  const technicalDocumentHashes = new Set(
    data.technicalDescriptions
      .map((item) => String(item.file_sha256 ?? ""))
      .filter(Boolean)
  );
  const distinctProjectDocuments = data.documents.filter(
    (item) =>
      !item.file_sha256 ||
      !technicalDocumentHashes.has(String(item.file_sha256))
  );
  const counts = {
    documents: distinctProjectDocuments.length + data.technicalDescriptions.length,
    requirements: data.requirements.length,
    confirmed: data.requirements.filter((item) => ["user_confirmed", "user_modified"].includes(String(item.status))).length,
    unclear: data.requirements.filter((item) => ["inferred_unreviewed", "conflicted"].includes(String(item.status))).length,
    suggestions: data.suggestions.length,
    decisions: data.decisions.length
  };
  const reviewCount = data.requirements.filter(
    (item) =>
      !["user_confirmed", "user_modified", "rejected", "superseded"].includes(
        String(item.status)
      )
  ).length;
  const currentStageIndex = Math.max(
    0,
    projectStages.findIndex(([stage]) => stage === data.project.current_stage)
  );
  const stageProgress = Math.round(
    ((currentStageIndex + 1) / projectStages.length) * 100
  );

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      {data.project.demo_data_set_id && <DemoBadge />}
      <Link
        href="/projects"
        className="inline-flex items-center gap-2 text-sm font-semibold text-ink-600 transition hover:text-flow-700"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Alla projekt
      </Link>

      <header className="overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-sm">
        <div className="flex flex-col gap-5 px-5 py-6 sm:px-7 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-flow-100 text-flow-700">
              <FolderKanban className="h-6 w-6" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-flow-700">
                  {data.project.project_number ?? "Projekt utan nummer"}
                </p>
                <span className="rounded-full bg-ink-100 px-2.5 py-1 text-xs font-semibold text-ink-700">
                  {statusLabels[data.project.status] ?? data.project.status}
                </span>
              </div>
              <h1 className="mt-2 truncate text-2xl font-semibold text-ink-950 sm:text-3xl">
                {data.project.name}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-600">
                <span>{data.project.customer_name ?? "Ingen kund angiven"}</span>
                {data.project.system_type && <><span aria-hidden="true">·</span><span>{data.project.system_type}</span></>}
                {data.project.standard && <><span aria-hidden="true">·</span><span>{data.project.standard}</span></>}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setTab("requirements")}>
              <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
              Granska krav{reviewCount > 0 ? ` (${reviewCount})` : ""}
            </Button>
            <Button onClick={() => setTab("documents")}>
              <Upload className="h-4 w-4" aria-hidden="true" />
              Ladda upp underlag
            </Button>
          </div>
        </div>

        <div className="border-t border-ink-100 bg-ink-50 px-5 py-5 sm:px-7">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-500">Arbetsflöde</p>
              <p className="mt-1 text-sm font-semibold text-ink-900">
                Steg {currentStageIndex + 1} av {projectStages.length}: {projectStages[currentStageIndex]?.[1]}
              </p>
            </div>
            <span className="text-sm font-semibold text-flow-700">{stageProgress}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-ink-200" aria-hidden="true">
            <div className="h-full rounded-full bg-flow-600 transition-all" style={{ width: `${stageProgress}%` }} />
          </div>
          <div className="mt-4 overflow-x-auto pb-1">
            <ol className="flex min-w-max items-center gap-2">
              {projectStages.map(([stage, label], index) => {
                const active = data.project.current_stage === stage;
                const completed = index < currentStageIndex;
                return (
                  <li key={stage} className="flex items-center gap-2">
                    <span className={active ? "rounded-full bg-flow-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm" : completed ? "rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-semibold text-emerald-800" : "rounded-full border border-ink-200 bg-white px-3 py-1.5 text-xs text-ink-500"}>
                      {index + 1}. {label}
                    </span>
                    {index < projectStages.length - 1 && <ChevronRight className="h-3.5 w-3.5 text-ink-400" aria-hidden="true" />}
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      </header>

      {(message || error) && (
        <div role="status" aria-live="polite" className={error ? "rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-medium text-rose-800" : "rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800"}>
          {error ?? message}
        </div>
      )}

      <nav aria-label="Projektsektioner" className="sticky top-2 z-10 flex gap-1 overflow-x-auto rounded-xl border border-ink-200 bg-white/95 p-1.5 shadow-sm backdrop-blur">
        {([
          ["overview", "Översikt", LayoutDashboard, null],
          ["documents", "Underlag", FileText, counts.documents],
          ["requirements", "Kravgranskning", ListChecks, reviewCount],
          ["products", "Produktförslag", PackageSearch, counts.suggestions],
          ["decisions", "Beslutslogg", ClipboardCheck, counts.decisions]
        ] as const).map(([key, label, Icon, count]) => (
          <button key={key} type="button" aria-current={tab === key ? "page" : undefined} onClick={() => setTab(key)} className={tab === key ? "inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg bg-flow-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm" : "inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold text-ink-600 transition hover:bg-ink-100 hover:text-ink-950"}>
            <Icon className="h-4 w-4" aria-hidden="true" />
            {label}
            {count !== null && <span className={tab === key ? "rounded-full bg-white/20 px-1.5 py-0.5 text-[11px]" : "rounded-full bg-ink-100 px-1.5 py-0.5 text-[11px] text-ink-600"}>{count}</span>}
          </button>
        ))}
      </nav>

      {tab === "overview" && (
        <div className="space-y-5">
          <section className="flex flex-col gap-3 rounded-xl border border-flow-200 bg-flow-50 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-flow-800">Rekommenderat nästa steg</p>
              <p className="mt-1 text-sm font-medium text-flow-950">{nextStageLabel(data.project.current_stage)}</p>
            </div>
            <Button variant="secondary" onClick={() => setTab(currentStageIndex < 2 ? "documents" : "requirements")}>
              Fortsätt
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </section>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Dokument" value={counts.documents} detail="Projektunderlag och tekniska beskrivningar" />
            <Metric label="Krav att granska" value={reviewCount} detail={`${counts.confirmed} bekräftade av ${counts.requirements}`} tone={reviewCount ? "warning" : "success"} />
            <Metric label="Produktförslag" value={counts.suggestions} detail="Tekniskt kvalificerade alternativ" />
            <Metric label="Spårbara beslut" value={counts.decisions} detail="Godkännanden och avvikelser" />
          </section>
          <form onSubmit={saveProject} className="overflow-hidden rounded-xl border border-ink-200 bg-white shadow-sm">
            <div className="px-5 py-5 sm:px-6">
              <h2 className="font-semibold text-ink-950">Projektförutsättningar</h2>
              <p className="mt-1 text-sm text-ink-600">Grunddata som styr dokumentanalys, produktmatchning och inköpsunderlag.</p>
            </div>

            <fieldset className="border-t border-ink-100 px-5 py-5 sm:px-6">
              <legend className="mb-4 text-xs font-semibold uppercase tracking-[0.1em] text-ink-500">Identitet och kund</legend>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <Input id="workspace-name" name="name" label="Projektnamn" defaultValue={data.project.name} required />
                <Input id="workspace-number" name="projectNumber" label="Projektnummer" defaultValue={data.project.project_number ?? ""} />
                <Input id="workspace-customer" name="customerName" label="Kund" defaultValue={data.project.customer_name ?? ""} />
                <Input id="workspace-end-customer" name="endCustomer" label="Slutkund" defaultValue={data.project.end_customer ?? ""} />
                <Input id="workspace-address" name="address" label="Projektadress" defaultValue={data.project.address ?? ""} />
                <Input id="workspace-project-type" name="projectType" label="Projekttyp" defaultValue={data.project.project_type ?? ""} />
              </div>
            </fieldset>

            <fieldset className="border-t border-ink-100 px-5 py-5 sm:px-6">
              <legend className="mb-4 text-xs font-semibold uppercase tracking-[0.1em] text-ink-500">Teknik och inköp</legend>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <Input id="workspace-system-type" name="systemType" label="Systemtyp" defaultValue={data.project.system_type ?? ""} />
                <Input id="workspace-standard" name="standard" label="Huvudstandard" defaultValue={data.project.standard ?? ""} />
                <Input id="workspace-supplier" name="supplier" label="Föredragen leverantör" defaultValue={data.project.supplier ?? ""} />
                <Input id="workspace-strategy" name="procurementStrategy" label="Inköpsstrategi" defaultValue={data.project.procurement_strategy ?? ""} />
                <Input id="workspace-currency" name="currency" label="Valuta" defaultValue={data.project.currency ?? "NOK"} />
                <Input id="workspace-delivery-country" name="deliveryCountry" label="Leveransland" defaultValue={data.project.delivery_country ?? ""} />
                <Input id="workspace-warehouse" name="warehouseLocation" label="Lager/distributionspunkt" defaultValue={data.project.warehouse_location ?? ""} />
              </div>
            </fieldset>

            <fieldset className="border-t border-ink-100 px-5 py-5 sm:px-6">
              <legend className="mb-4 text-xs font-semibold uppercase tracking-[0.1em] text-ink-500">Planering och status</legend>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <Input id="workspace-start" name="expectedStartDate" label="Förväntad start" type="date" defaultValue={data.project.expected_start_date ?? ""} />
                <Input id="workspace-delivery" name="expectedDeliveryDate" label="Förväntad leverans" type="date" defaultValue={data.project.expected_delivery_date ?? ""} />
                <label className="block" htmlFor="workspace-status"><span className="mb-2 block text-sm font-medium text-ink-700">Projektstatus</span><select id="workspace-status" name="status" defaultValue={data.project.status} className="block h-11 w-full rounded-lg border-ink-200 bg-white text-sm text-ink-900 shadow-sm focus:border-flow-500 focus:ring-flow-500">{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                <label className="block" htmlFor="workspace-stage"><span className="mb-2 block text-sm font-medium text-ink-700">Aktuellt arbetssteg</span><select id="workspace-stage" name="currentStage" defaultValue={data.project.current_stage ?? "setup"} className="block h-11 w-full rounded-lg border-ink-200 bg-white text-sm text-ink-900 shadow-sm focus:border-flow-500 focus:ring-flow-500">{projectStages.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              </div>
            </fieldset>

            <div className="grid gap-4 border-t border-ink-100 px-5 py-5 sm:px-6 md:grid-cols-2">
              <TextArea name="description" label="Projektbeskrivning" defaultValue={data.project.description ?? ""} />
              <TextArea name="internalComments" label="Interna kommentarer" defaultValue={data.project.internal_comments ?? ""} />
            </div>
            <div className="flex justify-end border-t border-ink-100 bg-ink-50 px-5 py-4 sm:px-6">
              <Button type="submit" disabled={saving}><Save className="h-4 w-4" aria-hidden="true" />{saving ? "Sparar..." : "Spara projektuppgifter"}</Button>
            </div>
          </form>
          <div className="grid gap-5 lg:grid-cols-2">
            <InfoCard title="System och standarder" icon={<CheckCircle2 className="h-5 w-5 text-flow-700" />}>
              <p className="text-sm text-ink-600">{data.systemTypes.length ? data.systemTypes.map((item) => String(item.label ?? item.system_type)).join(", ") : data.project.system_type ?? "Inga systemtyper bekräftade ännu."}</p>
              <p className="mt-2 text-sm text-ink-600">{data.standards.length ? data.standards.map((item) => `${String(item.standard_name)}${item.edition ? ` (${String(item.edition)})` : ""}`).join(", ") : data.project.standard ?? "Ingen standard bekräftad ännu."}</p>
            </InfoCard>
            <InfoCard title="Leverantörsval" icon={<PackageSearch className="h-5 w-5 text-flow-700" />}>
              <p className="text-sm text-ink-600">{data.suppliers.length ? data.suppliers.map((item) => `${String(item.supplier_name)} (${String(item.selection_role)})`).join(", ") : data.project.supplier ?? "Inga leverantörsval sparade ännu."}</p>
              <p className="mt-2 text-xs text-ink-500">Avvikelser från föredragen tillverkare eller distributör ska synas i produktförslaget.</p>
            </InfoCard>
          </div>
        </div>
      )}

      {tab === "documents" && (
        <div className="space-y-5">
          <section className="rounded-xl border border-ink-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-start gap-3"><FileText className="mt-0.5 h-5 w-5 text-flow-700" aria-hidden="true" /><div><h2 className="font-semibold text-ink-950">Teknisk beskrivning</h2><p className="mt-1 text-sm text-ink-600">Ladda upp underlag direkt till projektet. Extraherade rader blir krav som väntar på granskning.</p></div></div>
            <form className="mt-5" onSubmit={uploadTechnicalDescription}>
              <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-ink-200 bg-ink-50 px-5 py-8 text-center transition hover:border-flow-400 hover:bg-flow-50">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-flow-700 shadow-sm"><Upload className="h-5 w-5" aria-hidden="true" /></span>
                <span className="mt-3 text-sm font-semibold text-ink-900">{selectedFileName ?? "Välj en teknisk beskrivning i PDF-format"}</span>
                <span className="mt-1 text-xs text-ink-500">Max 30 MB. Dokumentet sparas privat i projektet.</span>
                <input name="file" type="file" accept=".pdf,application/pdf" className="sr-only" onChange={(event) => setSelectedFileName(event.target.files?.[0]?.name ?? null)} />
              </label>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-ink-500">Efter uppladdningen granskar du alla extraherade krav innan de används.</p>
                <Button type="submit" disabled={uploading || !selectedFileName}><Upload className="h-4 w-4" aria-hidden="true" />{uploading ? "Extraherar och sparar..." : "Extrahera och spara"}</Button>
              </div>
            </form>
          </section>
          <section className="rounded-xl border border-ink-200 bg-white p-5 shadow-sm sm:p-6"><div className="flex items-end justify-between gap-3"><div><h2 className="font-semibold text-ink-950">Dokumenthistorik</h2><p className="mt-1 text-sm text-ink-600">Status för projektets uppladdade och extraherade underlag.</p></div><span className="rounded-full bg-ink-100 px-2.5 py-1 text-xs font-semibold text-ink-700">{counts.documents} dokument</span></div><div className="mt-4 divide-y divide-ink-100">{data.technicalDescriptions.length === 0 && distinctProjectDocuments.length === 0 ? <p className="rounded-lg bg-ink-50 px-4 py-8 text-center text-sm text-ink-600">Inga dokument är kopplade ännu. Börja med en teknisk beskrivning ovan.</p> : <>{data.technicalDescriptions.map((item) => <DocumentRow key={`technical-${item.id}`} item={item} source="Teknisk extraktion" />)}{distinctProjectDocuments.map((item) => <DocumentRow key={`project-${item.id}`} item={item} source="Projektfil" />)}</>}</div></section>
        </div>
      )}

      {tab === "requirements" && (
        <div className="space-y-5">
          <section className="rounded-lg border border-ink-200 bg-white p-5 shadow-sm"><h2 className="font-semibold text-ink-950">Lägg till krav manuellt</h2><form className="mt-4 grid gap-4 md:grid-cols-3" onSubmit={addRequirement}><Input id="requirement-category" label="Kategori" value={requirementForm.category} onChange={(event) => setRequirementForm((current) => ({ ...current, category: event.target.value }))} /><Input id="requirement-key" label="Kravnyckel" value={requirementForm.key} onChange={(event) => setRequirementForm((current) => ({ ...current, key: event.target.value }))} /><Input id="requirement-value" label="Värde" value={requirementForm.value} onChange={(event) => setRequirementForm((current) => ({ ...current, value: event.target.value }))} /><div className="md:col-span-3"><Button type="submit">Lägg till krav</Button></div></form></section>
          <section className="rounded-lg border border-ink-200 bg-white shadow-sm"><div className="border-b border-ink-100 px-5 py-4"><h2 className="font-semibold text-ink-950">Kravgranskning</h2><p className="mt-1 text-sm text-ink-600">Osäkra eller tolkade värden visas aldrig som slutligt bekräftade.</p></div>{data.requirements.length === 0 ? <p className="px-5 py-8 text-sm text-ink-600">Inga krav har extraherats ännu.</p> : <div className="divide-y divide-ink-100">{data.requirements.map((item) => <RequirementRow key={item.id} item={item} onReview={reviewRequirement} />)}</div>}</section>
          {data.conflicts.length > 0 && <section className="rounded-lg border border-amber-200 bg-amber-50 p-5"><div className="flex items-center gap-2 font-semibold text-amber-900"><AlertTriangle className="h-5 w-5" aria-hidden="true" />Konflikter kräver tekniskt beslut</div><div className="mt-3 space-y-2">{data.conflicts.map((item) => <div key={item.id} className="rounded-md border border-amber-200 bg-white p-3 text-sm"><p className="font-medium text-ink-950">{String(item.title)}</p><p className="mt-1 text-ink-700">{String(item.description)}</p></div>)}</div></section>}
        </div>
      )}

      {tab === "products" && <section className="rounded-lg border border-ink-200 bg-white p-5 shadow-sm"><div className="flex items-start gap-3"><PackageSearch className="mt-0.5 h-5 w-5 text-flow-700" aria-hidden="true" /><div><h2 className="font-semibold text-ink-950">Produktförslag</h2><p className="mt-1 text-sm text-ink-600">Förslagsmotorn använder krav, tekniska egenskaper, godkännanden, tillverkare och leverantörsval. Alla förslag måste granskas innan de låses.</p></div></div>{data.suggestions.length === 0 ? <p className="mt-6 rounded-lg bg-ink-50 p-4 text-sm text-ink-600">Produktförslag skapas när kravgranskningen är klar. Inga automatiska produktval har godkänts.</p> : <div className="mt-5 divide-y divide-ink-100">{data.suggestions.map((item) => <div key={item.id} className="py-4"><div className="flex justify-between gap-3"><p className="font-medium text-ink-950">{suggestionName(item)}<span className="ml-3 text-sm font-semibold text-flow-700">{item.match_score ? `${String(item.match_score)} %` : "Ej bedömd"}</span></p></div><p className="mt-1 text-sm text-ink-600">{String(item.recommendation_reason ?? "Ingen rekommendationstext")}</p></div>)}</div>}</section>}

      {tab === "decisions" && <section className="rounded-lg border border-ink-200 bg-white p-5 shadow-sm"><h2 className="font-semibold text-ink-950">Beslutslogg</h2>{data.decisions.length === 0 ? <p className="mt-4 text-sm text-ink-600">Inga beslut är registrerade ännu.</p> : <div className="mt-4 divide-y divide-ink-100">{data.decisions.map((item) => <div key={item.id} className="py-4"><div className="flex justify-between gap-3"><p className="font-medium text-ink-950">{String(item.decision)}</p><span className="text-xs text-ink-500">{String(item.status)}</span></div><p className="mt-1 text-sm text-ink-600">{String(item.rationale)}</p></div>)}</div>}</section>}
    </div>
  );
}

function RequirementRow({ item, onReview }: { item: ProjectRow; onReview: (id: string, status: string) => void }) {
  const status = String(item.status ?? "extracted_unreviewed");
  const confidence = typeof item.confidence === "number" ? Math.round(item.confidence * 100) : null;
  return <div className="px-5 py-4"><div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="rounded bg-ink-100 px-2 py-1 text-xs font-semibold text-ink-700">{String(item.category)}</span><span className="font-semibold text-ink-950">{String(item.requirement_key)}</span><span className={requirementStatusClass(status)}>{requirementStatusLabel(status)}</span></div><p className="mt-2 text-sm text-ink-800">{String(item.value_text ?? "Inget värde")}</p><p className="mt-2 text-xs text-ink-500">{item.certainty === "explicit" ? "Explicit uppgift" : "Tolkad uppgift"}{confidence !== null ? ` · ${confidence}% säkerhet` : ""}{item.source_page ? ` · sida ${String(item.source_page)}` : ""}</p>{typeof item.source_excerpt === "string" && item.source_excerpt && <p className="mt-2 max-w-3xl border-l-2 border-ink-200 pl-3 text-xs italic text-ink-500">{item.source_excerpt}</p>}</div><div className="flex shrink-0 flex-wrap gap-2"><Button variant="secondary" onClick={() => onReview(item.id, "user_confirmed")}><CheckCircle2 className="h-4 w-4" aria-hidden="true" />Godkänn</Button><Button variant="secondary" onClick={() => onReview(item.id, "inferred_unreviewed")}>Oklart</Button><Button variant="ghost" onClick={() => onReview(item.id, "rejected")}>Avvisa</Button></div></div></div>;
}

function requirementStatusClass(status: string) {
  if (["user_confirmed", "user_modified"].includes(status)) {
    return "text-xs font-semibold text-emerald-700";
  }
  if (["inferred_unreviewed", "conflicted"].includes(status)) {
    return "text-xs font-semibold text-amber-700";
  }
  if (status === "rejected") return "text-xs font-semibold text-rose-700";
  return "text-xs text-ink-500";
}

function requirementStatusLabel(status: string) {
  const labels: Record<string, string> = {
    user_confirmed: "Bekräftat",
    user_modified: "Ändrat och bekräftat",
    extracted_unreviewed: "Väntar på granskning",
    inferred_unreviewed: "Tolkning att granska",
    conflicted: "Konflikt",
    rejected: "Avvisat",
    superseded: "Ersatt"
  };
  return labels[status] ?? status;
}

function DocumentRow({ item, source }: { item: ProjectRow; source: string }) {
  const status = String(item.processing_status ?? item.status ?? item.extraction_method ?? "Ej behandlad");
  const ready = ["completed", "extracted", "review_required", "requires_review", "uploaded"].includes(status);
  return <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="truncate font-medium text-ink-950">{String(item.file_name ?? item.fileName ?? "Dokument")}</p><span className={ready ? "rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700" : "rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700"}>{documentStatusLabel(status)}</span></div><p className="mt-1 text-xs text-ink-500">{source}</p></div><span className="shrink-0 text-xs text-ink-500">{formatDate(item.created_at)}</span></div>;
}

function suggestionName(item: ProjectRow) {
  const snapshot = isRecord(item.product_snapshot) ? item.product_snapshot : {};
  return String(snapshot.name ?? item.product_id ?? "Produkt");
}

function Metric({ label, value, detail, tone = "neutral" }: { label: string; value: number; detail: string; tone?: "neutral" | "warning" | "success" }) { const valueClass = tone === "warning" ? "text-amber-700" : tone === "success" ? "text-emerald-700" : "text-ink-950"; return <div className="rounded-xl border border-ink-200 bg-white p-5 shadow-sm"><p className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-500">{label}</p><p className={`mt-2 text-3xl font-semibold ${valueClass}`}>{value}</p><p className="mt-2 text-xs leading-5 text-ink-500">{detail}</p></div>; }
function InfoCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) { return <article className="rounded-lg border border-ink-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-2"><span>{icon}</span><h2 className="font-semibold text-ink-950">{title}</h2></div><div className="mt-4">{children}</div></article>; }
function TextArea({ name, label, defaultValue }: { name: string; label: string; defaultValue: string }) { return <label className="block"><span className="mb-2 block text-sm font-medium text-ink-700">{label}</span><textarea name={name} rows={4} defaultValue={defaultValue} className="block w-full rounded-lg border-ink-200 bg-white text-sm text-ink-900 shadow-sm focus:border-flow-500 focus:ring-flow-500" /></label>; }
function formatDate(value: unknown) { if (typeof value !== "string" || !value) return ""; return new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium" }).format(new Date(value)); }
function documentStatusLabel(status: string) { const labels: Record<string, string> = { completed: "Klar", extracted: "Extraherad", review_required: "Kräver granskning", requires_review: "Kräver granskning", uploaded: "Uppladdad", uploading: "Laddar upp", extracting: "Extraherar", failed: "Misslyckades" }; return labels[status] ?? status; }
function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function nextStageLabel(stage: string | undefined) {
  if (!stage || !projectStages.some(([value]) => value === stage)) return "Börja med att fylla i projektinformationen.";
  const next = nextProjectStage(stage as (typeof PROJECT_STAGES)[number][0]);
  const nextLabel = next && projectStages.find(([value]) => value === next)?.[1];
  return nextLabel ? `Fortsätt med ${nextLabel}.` : "Alla obligatoriska arbetssteg är klara. Projektet kan exporteras när godkännandet är klart.";
}
