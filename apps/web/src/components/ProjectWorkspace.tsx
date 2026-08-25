"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  FilePlus2,
  FileText,
  FolderKanban,
  Save,
  Trash2,
  Upload
} from "lucide-react";
import { Button } from "@/components/Button";
import { DemoBadge } from "@/components/DemoBadge";
import { DistributorMappingPanel } from "@/components/DistributorMappingPanel";
import { Input } from "@/components/Input";
import { ProjectMaterialListExportButton } from "@/components/ProjectMaterialListExportButton";
import { ProjectMaterialListPdfExportButton } from "@/components/ProjectMaterialListPdfExportButton";
import { PdfDropzone } from "@/components/PdfDropzone";
import { ScipxPageHeader } from "@/components/ScipxPageHeader";
import type { OrganizationProject } from "@/types/organization";
import { PROJECT_STAGES } from "@/lib/project-governance";
import { isUserApprovedProductAssignment } from "@/lib/approved-product-assignment";
import {
  formatProjectQuantity,
  projectRequirementQuantity
} from "@/lib/project-requirement-quantity";
import {
  guidedProjectCompletionUpdate,
  guidedProjectWorkflow,
  type GuidedProjectTab
} from "@/lib/guided-project-workflow";
import { buildProjectSourcePdfLookup } from "@/lib/project-source-pdf";

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
  mappingMemories: ProjectRow[];
  mappingAccessories: ProjectRow[];
};

type ProjectRow = Record<string, unknown> & { id: string };
type Tab = "overview" | "documents" | "products";

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

export function ProjectWorkspace({
  initialData,
  initialTab = "overview",
  canExportMaterialList = false,
  canCreateProject = false,
  canDeleteProject = false
}: {
  initialData: ProjectModuleData;
  initialTab?: GuidedProjectTab;
  canExportMaterialList?: boolean;
  canCreateProject?: boolean;
  canDeleteProject?: boolean;
}) {
  const router = useRouter();
  const [data, setData] = useState(initialData);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [saving, setSaving] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function selectTab(nextTab: Tab) {
    setTab(nextTab);
    if (nextTab === "documents") {
      void advanceProjectStage("documents");
    } else if (nextTab === "products" && data.requirements.length > 0) {
      void advanceProjectStage("product_matching");
    }
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (nextTab === "overview") url.searchParams.delete("step");
      else url.searchParams.set("step", nextTab);
      window.history.replaceState(window.history.state, "", url);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  async function advanceProjectStage(targetStage: string) {
    const currentIndex = PROJECT_STAGES.findIndex(
      ([stage]) => stage === data.project.current_stage
    );
    const targetIndex = PROJECT_STAGES.findIndex(([stage]) => stage === targetStage);
    if (targetIndex < 0 || currentIndex >= targetIndex) return;

    try {
      const response = await fetch(`/api/projects/${data.project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentStage: targetStage })
      });
      const payload = (await response.json().catch(() => null)) as
        | { project?: OrganizationProject }
        | null;
      if (response.ok && payload?.project) {
        setData((current) => ({
          ...current,
          project: payload.project as OrganizationProject
        }));
      }
    } catch {
      // The guided UI still works for read-only users and during transient network errors.
    }
  }

  async function finishProject(latestData?: ProjectModuleData) {
    setFinishing(true);
    setError(null);
    setMessage(null);
    try {
      const sourceData = latestData ?? await reload();
      if (sourceData.project.current_stage === "completed") {
        setMessage("Produktvalet är klart. Projektsammanfattningen visas nedan.");
        selectTab("overview");
        return;
      }

      const latestWorkflow = guidedProjectWorkflow({
        documentCount: displayedProjectDocuments(sourceData).count,
        requirements: sourceData.requirements,
        assignments: sourceData.suggestions
      });
      const completionUpdate = guidedProjectCompletionUpdate(latestWorkflow);
      if (!completionUpdate) {
        throw new Error("Alla produktposter måste vara sparade innan projektet kan slutföras.");
      }

      const response = await fetch(`/api/projects/${data.project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(completionUpdate)
      });
      const payload = (await response.json().catch(() => null)) as
        | { project?: OrganizationProject; error?: string }
        | null;
      if (!response.ok || !payload?.project) {
        throw new Error(payload?.error ?? "Projektet kunde inte slutföras.");
      }
      setData({
        ...sourceData,
        project: payload.project as OrganizationProject
      });
      setMessage(
        "Produktvalet är klart. Projektet är markerat som produktförslag klart och sammanfattningen visas nedan."
      );
      selectTab("overview");
    } catch (finishError) {
      setError(
        finishError instanceof Error
          ? finishError.message
          : "Projektet kunde inte slutföras."
      );
    } finally {
      setFinishing(false);
    }
  }

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
      mappingMemories: ProjectRow[];
      mappingAccessories: ProjectRow[];
    };
    setData(payload);
    return payload;
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
          currentStage:
            data.project.current_stage === "setup"
              ? "documents"
              : data.project.current_stage,
          projectType: form.get("projectType"),
          // The streamlined Ahlsell workspace does not render this legacy
          // field. Preserve the stored value instead of sending FormData's
          // null sentinel, which the API correctly rejects as non-text.
          procurementStrategy: data.project.procurement_strategy ?? "",
          currency: form.get("currency"),
          deliveryCountry: form.get("deliveryCountry"),
          warehouseLocation: form.get("warehouseLocation"),
          standard: form.get("standard"),
          systemType: form.get("systemType"),
          expectedStartDate: form.get("expectedStartDate") || null,
          expectedDeliveryDate: form.get("expectedDeliveryDate") || null,
          description: form.get("description"),
          internalComments: form.get("internalComments")
        })
      });
      const payload = (await response.json().catch(() => null)) as { project?: OrganizationProject; error?: string } | null;
      if (!response.ok || !payload?.project) throw new Error(payload?.error ?? "Projektet kunde inte sparas.");
      setData((current) => ({ ...current, project: payload.project as OrganizationProject }));
      if (data.project.current_stage === "setup") {
        setMessage("Projektinformationen är sparad. Nästa steg är att ladda upp underlaget.");
        selectTab("documents");
      } else {
        setMessage("Projektinformationen är sparad.");
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Projektet kunde inte sparas.");
    } finally {
      setSaving(false);
    }
  }

  async function uploadTechnicalDescription(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    if (!selectedFile) {
      setError("Välj en PDF med teknisk beskrivning.");
      return;
    }
    const form = new FormData();
    form.set("file", selectedFile);
    setUploading(true);
    setError(null);
    setMessage(null);
    try {
      form.set("projectId", data.project.id);
      const response = await fetch("/api/technical-descriptions", { method: "POST", body: form });
      const payload = (await response.json().catch(() => null)) as { error?: string; persistedRequirementCount?: number } | null;
      if (!response.ok) throw new Error(payload?.error ?? "Underlaget kunde inte extraheras.");
      const refreshedData = await reload();
      await advanceProjectStage("product_matching");
      const requirementCount = payload?.persistedRequirementCount ?? 0;
      if (requirementCount > 0) {
        setMessage(`Underlaget är sparat. ${requirementCount} produktrader är klara för produktval.`);
      } else {
        setMessage("Underlaget är sparat, men inga produktrader hittades automatiskt. Prova ett tydligare dokument.");
      }
      setSelectedFile(null);
      formElement.reset();
      const refreshedWorkflow = guidedProjectWorkflow({
        documentCount: displayedProjectDocuments(refreshedData).count,
        requirements: refreshedData.requirements,
        assignments: refreshedData.suggestions
      });
      if (refreshedWorkflow.isComplete) {
        await finishProject(refreshedData);
      } else {
        selectTab("products");
      }
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Underlaget kunde inte extraheras.");
    } finally {
      setUploading(false);
    }
  }

  async function moveProjectToTrash() {
    setDeleting(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/projects/${data.project.id}/trash`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: "Projektet avslutades av användaren under produktvalet.",
          confirmation: data.project.name
        })
      });
      const payload = (await response.json().catch(() => null)) as
        | { error?: string; detail?: string }
        | null;
      if (!response.ok) {
        throw new Error(
          payload?.detail ?? payload?.error ?? "Projektet kunde inte flyttas till papperskorgen."
        );
      }
      router.push("/projects");
      router.refresh();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Projektet kunde inte flyttas till papperskorgen."
      );
      setShowDeleteConfirmation(false);
      setDeleting(false);
    }
  }

  const displayedDocuments = displayedProjectDocuments(data);
  const uniqueTechnicalDescriptions = displayedDocuments.technicalDescriptions;
  const distinctProjectDocuments = displayedDocuments.projectDocuments;
  const primaryDocument = uniqueTechnicalDescriptions[0] ?? distinctProjectDocuments[0];
  const sourcePdfLookup = buildProjectSourcePdfLookup(
    data.documents,
    data.technicalDescriptions
  );
  const counts = {
    documents: displayedDocuments.count,
    requirements: data.requirements.length,
    suggestions: data.suggestions.filter(isUserApprovedProductAssignment).length,
    decisions: data.decisions.length
  };
  const workflow = guidedProjectWorkflow({
    documentCount: counts.documents,
    requirements: data.requirements,
    assignments: data.suggestions
  });
  const projectFinished =
    workflow.isComplete && data.project.current_stage === "completed";
  const selectedProductSummaries = summarizeSelectedProducts(
    data.suggestions,
    data.requirements
  );
  const currentInstruction = projectFinished
    ? {
        eyebrow: "Projektet är färdigt",
        title: "Ladda ner projektsammanfattningen",
        description: "Excel och PDF innehåller alla poster, postnummer, mängder, produktval, tillbehör och demontering."
      }
    : counts.documents === 0
      ? {
          eyebrow: "Börja här",
          title: "Ladda upp den tekniska beskrivningen",
          description: "Välj PDF-filen. Scipx skapar projektet och läser ut poster och mängder automatiskt."
        }
      : workflow.isComplete
        ? {
            eyebrow: "En sak återstår",
            title: "Kontrollera och avsluta projektet",
            description: "Alla produktposter är sparade. Markera projektet klart för att visa resultat och Excel."
          }
        : {
            eyebrow: "Gör detta nu",
            title: `Välj produkt för ${workflow.remainingProductCount} ${workflow.remainingProductCount === 1 ? "post" : "poster"}`,
            description: "Fyll i Ahlsells produktnamn och artikelnummer för varje post. Scipx visar tydligt hur många som återstår."
          };

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-12">
      {data.project.demo_data_set_id && <DemoBadge />}
      <Link
        href="/projects"
        className="inline-flex min-h-11 items-center gap-2 text-base font-semibold text-ink-700 transition hover:text-flow-700"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Alla projekt
      </Link>

      <ScipxPageHeader
        eyebrow={data.project.project_number ?? "Scipx-projekt"}
        title={data.project.name}
        description={`${data.project.customer_name ?? "Kund saknas"} · ${statusLabels[data.project.status] ?? data.project.status}`}
        icon={<FolderKanban aria-hidden="true" />}
      />

      <section className="rounded-2xl border border-cyan-300/20 bg-[#06213d] p-5 text-white shadow-[0_16px_35px_rgba(2,17,38,0.12)] sm:p-7">
        <p className="text-sm font-bold uppercase tracking-[0.08em] text-cyan-300">{currentInstruction.eyebrow}</p>
        <div className="mt-2 flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-3xl">
            <h2 className="text-2xl font-bold text-white sm:text-3xl">{currentInstruction.title}</h2>
            <p className="mt-3 text-base leading-7 text-slate-300">{currentInstruction.description}</p>
          </div>
          <div className="shrink-0">
            {projectFinished && canExportMaterialList ? (
              <div className="flex flex-col gap-3 sm:flex-row">
                <ProjectMaterialListExportButton projectId={data.project.id} />
                <ProjectMaterialListPdfExportButton projectId={data.project.id} />
              </div>
            ) : workflow.isComplete ? (
              <Button className="min-h-14 w-full justify-center px-6 text-lg" disabled={finishing} onClick={() => void finishProject()}>
                <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                {finishing ? "Slutför…" : "Markera projektet klart"}
              </Button>
            ) : (
              <Button className="min-h-14 w-full justify-center px-6 text-lg" onClick={() => selectTab(workflow.nextTab)}>
                {counts.documents === 0 ? "Välj PDF-fil" : "Fortsätt till produktval"}
                <ChevronRight className="h-5 w-5" aria-hidden="true" />
              </Button>
            )}
          </div>
        </div>
      </section>

      <nav aria-label="Projektets tre steg" className="rounded-2xl border border-ink-200 bg-white p-4 shadow-sm sm:p-5">
        <p className="mb-4 text-base font-bold text-ink-950">Så här gör du – tre enkla steg</p>
        <ol className="grid gap-3 md:grid-cols-3">
          <SimpleStep number={1} label="Ladda upp PDF" status={counts.documents > 0 ? "Klar" : tab === "documents" ? "Du är här" : "Nästa"} active={tab === "documents"} completed={counts.documents > 0} onClick={() => selectTab("documents")} />
          <SimpleStep number={2} label="Välj produkter" status={workflow.isComplete ? "Klar" : tab === "products" ? "Du är här" : `${workflow.remainingProductCount} kvar`} active={tab === "products"} completed={workflow.isComplete} disabled={counts.documents === 0 && data.requirements.length === 0} onClick={() => selectTab("products")} />
          <SimpleStep number={3} label="Resultat och filer" status={projectFinished ? "Klar" : "Sista steget"} active={tab === "overview" && workflow.isComplete} completed={projectFinished} disabled={!workflow.isComplete} onClick={() => selectTab("overview")} />
        </ol>
      </nav>

      {(message || error) && (
        <div role="status" aria-live="polite" className={error ? "rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-medium text-rose-800" : "rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800"}>
          {error ?? message}
        </div>
      )}

      {tab === "overview" && (
        <div className="space-y-5">
          {projectFinished && (
            <section className="overflow-hidden rounded-2xl border border-emerald-200 bg-emerald-50 shadow-sm">
              <div className="flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-start gap-4">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
                    <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.1em] text-emerald-700">Projektet är färdigt</p>
                    <h2 className="mt-1 text-xl font-semibold text-emerald-950">Produktval och mängder är klara</h2>
                    <p className="mt-1 text-sm leading-6 text-emerald-800">Ladda ner materiallistan eller starta nästa tekniska analys.</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {canCreateProject && (
                    <Link
                      href="/projects/new"
                      className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-flow-600 px-5 py-3 text-base font-bold text-white shadow-sm transition hover:bg-flow-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-flow-600"
                    >
                      <FilePlus2 className="h-4 w-4" aria-hidden="true" />
                      Starta en ny analys
                    </Link>
                  )}
                </div>
              </div>
            </section>
          )}
          <section className="grid gap-4 sm:grid-cols-3">
            <Metric label="Poster från PDF" value={counts.requirements} detail="Alla extraherade poster" tone={counts.requirements ? "success" : "warning"} />
            <Metric label="Produktval klara" value={workflow.mappedRequirementCount} detail={`Av ${workflow.eligibleRequirementCount} inköpsposter`} />
            <Metric label="Dokument" value={counts.documents} detail="Uppladdade tekniska beskrivningar" />
          </section>
          <details className="overflow-hidden rounded-xl border border-ink-200 bg-white shadow-sm">
            <summary className="flex min-h-14 cursor-pointer items-center justify-between px-5 py-4 text-base font-bold text-ink-900 sm:px-6">
              Visa eller ändra projektuppgifter
              <span className="text-sm font-semibold text-flow-700">Öppna</span>
            </summary>
          <form onSubmit={saveProject} className="border-t border-ink-100">
            <div className="px-5 py-5 sm:px-6">
              <h2 className="font-semibold text-ink-950">Projektförutsättningar</h2>
              <p className="mt-1 text-sm text-ink-600">Grunddata som styr dokumentanalys och Ahlsells produktval.</p>
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
                <div className="rounded-lg border border-[#0073b6]/20 bg-[#0073b6]/5 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#00649e]">Distributör</p>
                  <p className="mt-1 font-semibold text-ink-950">Ahlsell</p>
                  <p className="mt-1 text-xs leading-5 text-ink-600">Produkt och tillbehör väljs direkt från de extraherade produktraderna.</p>
                </div>
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
                <div className="rounded-lg border border-ink-200 bg-ink-50 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-500">Nästa arbetssteg</p>
                  <p className="mt-1 text-sm font-semibold text-ink-900">{workflow.nextLabel}</p>
                  <p className="mt-1 text-xs text-ink-500">Uppdateras automatiskt när varje steg är klart.</p>
                </div>
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
          </details>
          {projectFinished && (
            <section className="rounded-xl border border-ink-200 bg-white p-5 shadow-sm sm:p-6">
              <h2 className="text-lg font-bold text-ink-950">Valda produkter</h2>
              {selectedProductSummaries.length === 0 ? (
                <p className="mt-3 text-base leading-7 text-ink-600">Inga produkter är registrerade.</p>
              ) : (
                <div className="mt-3 divide-y divide-ink-100">
                  {selectedProductSummaries.map((product) => (
                    <div key={product.key} className="flex items-start justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-ink-950">{product.name}</p>
                        <p className="mt-0.5 text-xs text-ink-500">Art.nr {product.productNumber}</p>
                      </div>
                      <span className={product.quantityMissing
                        ? "shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800"
                        : "shrink-0 rounded-full bg-[#0073b6]/10 px-2.5 py-1 text-xs font-semibold text-[#00649e]"}
                      >
                        {product.quantityLabel}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <p className="mt-4 text-sm font-medium text-flow-800">Antalen hämtas direkt från den tekniska beskrivningen.</p>
            </section>
          )}
          <details className="rounded-xl border border-ink-200 bg-white shadow-sm">
            <summary className="flex min-h-14 cursor-pointer items-center justify-between px-5 py-4 text-base font-bold text-ink-900 sm:px-6">
              Projekthistorik
              <span className="rounded-full bg-ink-100 px-2.5 py-1 text-xs font-bold text-ink-700">{counts.decisions}</span>
            </summary>
            <div className="border-t border-ink-100 px-5 py-4 sm:px-6">
              {data.decisions.length === 0 ? <p className="text-sm text-ink-600">Ingen historik är registrerad ännu.</p> : <div className="divide-y divide-ink-100">{data.decisions.map((item) => <div key={item.id} className="py-4"><p className="font-semibold text-ink-950">{String(item.decision)}</p><p className="mt-1 text-sm text-ink-600">{String(item.rationale)}</p></div>)}</div>}
            </div>
          </details>
        </div>
      )}

      {tab === "documents" && (
        <div className="space-y-5">
          {counts.documents === 0 ? (
            <section className="rounded-2xl border border-cyan-300/20 bg-[#06213d] p-5 text-white shadow-sm sm:p-7">
              <div className="flex items-start gap-4"><FileText className="mt-1 h-7 w-7 shrink-0 text-cyan-300" aria-hidden="true" /><div><p className="text-sm font-bold uppercase tracking-wide text-cyan-300">Steg 1 av 3 · En PDF per projekt</p><h2 className="mt-1 text-2xl font-bold text-white">Ladda upp teknisk beskrivning</h2><p className="mt-2 text-base leading-7 text-slate-300">Dra en PDF-fil till rutan eller klicka på Välj fil. När analysen är klar låses PDF-steget och produktvalet öppnas automatiskt.</p></div></div>
              <form className="mt-5" onSubmit={uploadTechnicalDescription}>
                <PdfDropzone
                  id={`project-pdf-${data.project.id}`}
                  file={selectedFile}
                  disabled={uploading}
                  compact
                  onFileChange={setSelectedFile}
                  onValidationError={setError}
                />
                <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm font-medium text-slate-300">Endast en PDF kan kopplas till projektet.</p>
                  <Button className="min-h-14 w-full justify-center px-6 text-lg sm:w-auto" type="submit" disabled={uploading || !selectedFile}><Upload className="h-5 w-5" aria-hidden="true" />{uploading ? "Läser PDF och skapar poster..." : "Läs PDF och fortsätt"}</Button>
                </div>
              </form>
            </section>
          ) : (
            <section className="rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-5 shadow-sm sm:p-7">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-4">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white"><CheckCircle2 className="h-6 w-6" aria-hidden="true" /></span>
                  <div>
                    <p className="text-sm font-bold uppercase tracking-wide text-emerald-800">Steg 1 är klart · En PDF per projekt</p>
                    <h2 className="mt-1 text-xl font-bold text-emerald-950">{projectDocumentName(primaryDocument)}</h2>
                    <p className="mt-2 text-sm leading-6 text-emerald-900">Den tekniska beskrivningen är kopplad till projektet. Vill du analysera en annan PDF ska du starta en ny analys.</p>
                  </div>
                </div>
                {canCreateProject && <Link href="/projects/new" className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-xl border-2 border-emerald-600 bg-white px-5 py-3 text-base font-bold text-emerald-800 transition hover:bg-emerald-100"><FilePlus2 className="h-5 w-5" aria-hidden="true" />Ny analys med annan PDF</Link>}
              </div>
            </section>
          )}
          <section className="rounded-xl border border-ink-200 bg-white p-5 shadow-sm sm:p-6"><div className="flex items-end justify-between gap-3"><div><h2 className="font-semibold text-ink-950">Projektets PDF</h2><p className="mt-1 text-sm text-ink-600">Den tekniska beskrivning som produkterna hämtas från.</p></div><span className="rounded-full bg-ink-100 px-2.5 py-1 text-xs font-semibold text-ink-700">{counts.documents} {counts.documents === 1 ? "dokument" : "dokument"}</span></div><div className="mt-4 divide-y divide-ink-100">{uniqueTechnicalDescriptions.length === 0 && distinctProjectDocuments.length === 0 ? <p className="rounded-lg bg-ink-50 px-4 py-8 text-center text-sm text-ink-600">Ingen PDF är kopplad ännu.</p> : <>{uniqueTechnicalDescriptions.map((item) => <DocumentRow key={`technical-${item.id}`} item={item} source="Teknisk extraktion" />)}{distinctProjectDocuments.map((item) => <DocumentRow key={`project-${item.id}`} item={item} source="Projektfil" />)}</>}</div></section>
          {counts.documents > 0 && (
            <section className="flex flex-col gap-4 rounded-xl border-2 border-emerald-300 bg-emerald-50 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold text-flow-950">Underlaget är sparat</p>
                <p className="mt-1 text-sm text-flow-800">Nästa steg är att registrera Ahlsells produkt och tillbehör för varje extraherad rad.</p>
              </div>
              <Button className="min-h-12 justify-center text-base" onClick={() => selectTab("products")}>
                Nästa: välj produkter
                <ChevronRight className="h-5 w-5" aria-hidden="true" />
              </Button>
            </section>
          )}
        </div>
      )}

      {tab === "products" && (
        <div className="space-y-5">
          {canDeleteProject && (
            showDeleteConfirmation ? (
              <section role="dialog" aria-labelledby="delete-project-title" className="rounded-2xl border-2 border-rose-300 bg-rose-50 p-5 shadow-sm sm:p-6">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex items-start gap-4">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-rose-700 text-white"><Trash2 className="h-6 w-6" aria-hidden="true" /></span>
                    <div>
                      <h2 id="delete-project-title" className="text-xl font-bold text-rose-950">Vill du avsluta projektet?</h2>
                      <p className="mt-2 max-w-2xl text-base leading-7 text-rose-900"><strong>{data.project.name}</strong> flyttas till papperskorgen. PDF, produktval och projektdata sparas där och kan återställas av en administratör.</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col gap-3 sm:flex-row">
                    <Button type="button" variant="secondary" disabled={deleting} onClick={() => setShowDeleteConfirmation(false)}>Fortsätt arbeta</Button>
                    <Button type="button" variant="danger" disabled={deleting} onClick={() => void moveProjectToTrash()}><Trash2 className="h-5 w-5" aria-hidden="true" />{deleting ? "Avslutar projektet…" : "Ja, avsluta projektet"}</Button>
                  </div>
                </div>
              </section>
            ) : (
              <div className="flex justify-end">
                <Button type="button" variant="danger" onClick={() => setShowDeleteConfirmation(true)}><Trash2 className="h-5 w-5" aria-hidden="true" />Avsluta och ta bort projekt</Button>
              </div>
            )
          )}
          <DistributorMappingPanel
            projectId={data.project.id}
            requirements={data.requirements}
            assignments={data.suggestions}
            memories={data.mappingMemories}
            memoryAccessories={data.mappingAccessories}
            sourcePdfLookup={sourcePdfLookup}
            onReload={reload}
            onGoToDocuments={() => selectTab("documents")}
            onFinish={() => finishProject()}
            finishing={finishing}
          />
        </div>
      )}

    </div>
  );
}

function displayedProjectDocuments(
  source: Pick<ProjectModuleData, "documents" | "technicalDescriptions">
) {
  const technicalDescriptions = deduplicateDocuments(source.technicalDescriptions);
  const technicalDocumentKeys = new Set(
    technicalDescriptions.flatMap(documentIdentityKeys)
  );
  const projectDocuments = deduplicateDocuments(source.documents).filter(
    (item) => !documentIdentityKeys(item).some((key) => technicalDocumentKeys.has(key))
  );

  return {
    technicalDescriptions,
    projectDocuments,
    count: technicalDescriptions.length + projectDocuments.length
  };
}

function deduplicateDocuments(items: ProjectRow[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const keys = documentIdentityKeys(item);
    if (keys.some((key) => seen.has(key))) return false;
    keys.forEach((key) => seen.add(key));
    return true;
  });
}

function documentIdentityKeys(item: ProjectRow) {
  const keys: string[] = [];
  const hash = String(item.file_sha256 ?? item.checksum ?? "").trim().toLowerCase();
  const name = String(item.file_name ?? item.fileName ?? item.original_filename ?? "").trim().toLowerCase();
  if (hash) keys.push(`hash:${hash}`);
  if (name) keys.push(`name:${name}`);
  if (keys.length === 0) keys.push(`id:${item.id}`);
  return keys;
}

function projectDocumentName(item: ProjectRow | undefined) {
  return item
    ? String(item.file_name ?? item.fileName ?? item.original_filename ?? "Teknisk beskrivning")
    : "Teknisk beskrivning";
}

function DocumentRow({ item, source }: { item: ProjectRow; source: string }) {
  const status = String(item.processing_status ?? item.status ?? item.extraction_method ?? "Ej behandlad");
  const ready = ["completed", "extracted", "review_required", "requires_review", "uploaded"].includes(status);
  return <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="truncate font-medium text-ink-950">{String(item.file_name ?? item.fileName ?? "Dokument")}</p><span className={ready ? "rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700" : "rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700"}>{documentStatusLabel(status)}</span></div><p className="mt-1 text-xs text-ink-500">{source}</p></div><span className="shrink-0 text-xs text-ink-500">{formatDate(item.created_at)}</span></div>;
}

function SimpleStep({
  number,
  label,
  status,
  active,
  completed,
  disabled = false,
  onClick
}: {
  number: number;
  label: string;
  status: string;
  active: boolean;
  completed: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        aria-current={active ? "step" : undefined}
        className={active
          ? "flex min-h-20 w-full items-center gap-4 rounded-xl border-2 border-cyan-400 bg-[#06213d] p-4 text-left shadow-sm"
          : completed
            ? "flex min-h-20 w-full items-center gap-4 rounded-xl border-2 border-emerald-300 bg-emerald-50 p-4 text-left"
            : "flex min-h-20 w-full items-center gap-4 rounded-xl border-2 border-ink-200 bg-white p-4 text-left transition enabled:hover:border-flow-400 disabled:cursor-not-allowed disabled:opacity-50"}
      >
        <span className={completed
          ? "flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white"
          : active
            ? "flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-cyan-400 text-lg font-bold text-[#03162d]"
            : "flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ink-100 text-lg font-bold text-ink-700"}
        >
          {completed ? <CheckCircle2 className="h-6 w-6" aria-hidden="true" /> : number}
        </span>
        <span>
          <span className={active ? "block text-base font-bold text-white" : "block text-base font-bold text-ink-950"}>{label}</span>
          <span className={completed ? "mt-1 block text-sm font-semibold text-emerald-800" : active ? "mt-1 block text-sm font-semibold text-cyan-300" : "mt-1 block text-sm text-ink-600"}>{status}</span>
        </span>
      </button>
    </li>
  );
}

function Metric({ label, value, detail, tone = "neutral" }: { label: string; value: number; detail: string; tone?: "neutral" | "warning" | "success" }) { const valueClass = tone === "warning" ? "text-amber-700" : tone === "success" ? "text-emerald-700" : "text-ink-950"; return <div className="rounded-xl border border-ink-200 bg-white p-5 shadow-sm"><p className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-500">{label}</p><p className={`mt-2 text-3xl font-semibold ${valueClass}`}>{value}</p><p className="mt-2 text-xs leading-5 text-ink-500">{detail}</p></div>; }
function TextArea({ name, label, defaultValue }: { name: string; label: string; defaultValue: string }) { return <label className="block"><span className="mb-2 block text-sm font-medium text-ink-700">{label}</span><textarea name={name} rows={4} defaultValue={defaultValue} className="block w-full rounded-lg border-ink-200 bg-white text-sm text-ink-900 shadow-sm focus:border-flow-500 focus:ring-flow-500" /></label>; }
function formatDate(value: unknown) { if (typeof value !== "string" || !value) return ""; return new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium" }).format(new Date(value)); }
function documentStatusLabel(status: string) { const labels: Record<string, string> = { completed: "Klar", extracted: "Extraherad", review_required: "Kräver granskning", requires_review: "Kräver granskning", uploaded: "Uppladdad", uploading: "Laddar upp", extracting: "Extraherar", failed: "Misslyckades" }; return labels[status] ?? status; }
function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function summarizeSelectedProducts(
  assignments: ProjectRow[],
  requirements: ProjectRow[]
) {
  const requirementsById = new Map(
    requirements.map((requirement) => [requirement.id, requirement])
  );
  const summaries = new Map<string, {
    key: string;
    name: string;
    productNumber: string;
    quantity: number;
    unit: string;
    quantityMissing: boolean;
  }>();

  for (const assignment of assignments.filter(isUserApprovedProductAssignment)) {
    const snapshot = isRecord(assignment.product_snapshot)
      ? assignment.product_snapshot
      : {};
    const productNumber = String(snapshot.productNumber ?? "").trim();
    const name = String(snapshot.name ?? "Produkt").trim() || "Produkt";
    const requirement = typeof assignment.requirement_id === "string"
      ? requirementsById.get(assignment.requirement_id)
      : undefined;
    const required = projectRequirementQuantity(requirement?.value_json);
    const key = `${productNumber || assignment.id}:${required.unit}`;
    const current = summaries.get(key);
    summaries.set(key, {
      key,
      name,
      productNumber: productNumber || "Saknas",
      quantity: (current?.quantity ?? 0) + (required.quantity ?? 0),
      unit: required.unit,
      quantityMissing: Boolean(current?.quantityMissing) || required.quantity === null
    });
  }

  return [...summaries.values()].map((summary) => ({
    ...summary,
    quantityLabel: summary.quantityMissing
      ? summary.quantity > 0
        ? `${formatProjectQuantity({ quantity: summary.quantity, unit: summary.unit })} + antal saknas`
        : "Antal saknas"
      : formatProjectQuantity({
          quantity: summary.quantity,
          unit: summary.unit
        })
  }));
}
