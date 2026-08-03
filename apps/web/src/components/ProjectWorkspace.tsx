"use client";

import { type FormEvent, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  PackageSearch,
  Save,
  Upload
} from "lucide-react";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import type { OrganizationProject } from "@/types/organization";

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

export function ProjectWorkspace({ initialData }: { initialData: ProjectModuleData }) {
  const [data, setData] = useState(initialData);
  const [tab, setTab] = useState<Tab>("overview");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
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
    try {
      const response = await fetch(`/api/projects/${data.project.id}/requirements/${requirementId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status })
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? "Kravet kunde inte uppdateras.");
      await reload();
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : "Kravet kunde inte uppdateras.");
    }
  }

  const counts = {
    documents: data.documents.length + data.technicalDescriptions.length,
    requirements: data.requirements.length,
    confirmed: data.requirements.filter((item) => item.status === "confirmed").length,
    unclear: data.requirements.filter((item) => ["unclear", "conflict"].includes(String(item.status))).length,
    suggestions: data.suggestions.length,
    decisions: data.decisions.length
  };

  return (
    <div className="space-y-6">
      <header className="rounded-xl bg-ink-950 px-6 py-7 text-white shadow-sm sm:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.14em] text-flow-300">Projekt</p>
            <h1 className="mt-2 text-3xl font-semibold">{data.project.name}</h1>
            <p className="mt-2 text-sm text-ink-300">
              {data.project.project_number ?? "Utan projektnummer"} · {data.project.customer_name ?? "Ingen kund angiven"}
            </p>
          </div>
          <span className="rounded-full bg-white/10 px-3 py-1 text-sm text-flow-100">
            {statusLabels[data.project.status] ?? data.project.status}
          </span>
        </div>
      </header>

      {(message || error) && (
        <div className={error ? "rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800" : "rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"}>
          {error ?? message}
        </div>
      )}

      <nav className="flex flex-wrap gap-2 rounded-lg border border-ink-200 bg-white p-2 shadow-sm">
        {([
          ["overview", "Översikt"],
          ["documents", "Underlag"],
          ["requirements", "Kravgranskning"],
          ["products", "Produktförslag"],
          ["decisions", "Beslutslogg"]
        ] as Array<[Tab, string]>).map(([key, label]) => (
          <button key={key} type="button" onClick={() => setTab(key)} className={tab === key ? "rounded-md bg-flow-600 px-3 py-2 text-sm font-semibold text-white" : "rounded-md px-3 py-2 text-sm font-semibold text-ink-600 hover:bg-ink-100"}>
            {label}
          </button>
        ))}
      </nav>

      {tab === "overview" && (
        <div className="space-y-5">
          <section className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <Metric label="Dokument" value={counts.documents} />
            <Metric label="Identifierade krav" value={counts.requirements} />
            <Metric label="Bekräftade krav" value={counts.confirmed} />
            <Metric label="Oklara/konflikt" value={counts.unclear} />
            <Metric label="Produktförslag" value={counts.suggestions} />
            <Metric label="Beslut" value={counts.decisions} />
          </section>
          <form onSubmit={saveProject} className="rounded-lg border border-ink-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold text-ink-950">Projektförutsättningar</h2>
                <p className="mt-1 text-sm text-ink-600">Alla ändringar sparas i projektets centrala post.</p>
              </div>
              <Button type="submit" disabled={saving}><Save className="h-4 w-4" aria-hidden="true" />{saving ? "Sparar..." : "Spara"}</Button>
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <Input id="workspace-name" name="name" label="Projektnamn" defaultValue={data.project.name} required />
              <Input id="workspace-number" name="projectNumber" label="Projektnummer" defaultValue={data.project.project_number ?? ""} />
              <Input id="workspace-customer" name="customerName" label="Kund" defaultValue={data.project.customer_name ?? ""} />
              <Input id="workspace-end-customer" name="endCustomer" label="Slutkund" defaultValue={data.project.end_customer ?? ""} />
              <Input id="workspace-address" name="address" label="Projektadress" defaultValue={data.project.address ?? ""} />
              <Input id="workspace-project-type" name="projectType" label="Projekttyp" defaultValue={data.project.project_type ?? ""} />
              <Input id="workspace-system-type" name="systemType" label="Systemtyp" defaultValue={data.project.system_type ?? ""} />
              <Input id="workspace-standard" name="standard" label="Huvudstandard" defaultValue={data.project.standard ?? ""} />
              <Input id="workspace-supplier" name="supplier" label="Föredragen leverantör" defaultValue={data.project.supplier ?? ""} />
              <Input id="workspace-strategy" name="procurementStrategy" label="Inköpsstrategi" defaultValue={data.project.procurement_strategy ?? ""} />
              <Input id="workspace-currency" name="currency" label="Valuta" defaultValue={data.project.currency ?? "NOK"} />
              <Input id="workspace-delivery-country" name="deliveryCountry" label="Leveransland" defaultValue={data.project.delivery_country ?? ""} />
              <Input id="workspace-warehouse" name="warehouseLocation" label="Lager/distributionspunkt" defaultValue={data.project.warehouse_location ?? ""} />
              <Input id="workspace-start" name="expectedStartDate" label="Förväntad start" type="date" defaultValue={data.project.expected_start_date ?? ""} />
              <Input id="workspace-delivery" name="expectedDeliveryDate" label="Förväntad leverans" type="date" defaultValue={data.project.expected_delivery_date ?? ""} />
              <label className="block" htmlFor="workspace-status"><span className="mb-2 block text-sm font-medium text-ink-700">Projektstatus</span><select id="workspace-status" name="status" defaultValue={data.project.status} className="block h-11 w-full rounded-lg border-ink-200 bg-white text-sm text-ink-900 shadow-sm focus:border-flow-500 focus:ring-flow-500">{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <TextArea name="description" label="Projektbeskrivning" defaultValue={data.project.description ?? ""} />
              <TextArea name="internalComments" label="Interna kommentarer" defaultValue={data.project.internal_comments ?? ""} />
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
          <section className="rounded-lg border border-ink-200 bg-white p-5 shadow-sm">
            <div className="flex items-start gap-3"><FileText className="mt-0.5 h-5 w-5 text-flow-700" aria-hidden="true" /><div><h2 className="font-semibold text-ink-950">Teknisk beskrivning</h2><p className="mt-1 text-sm text-ink-600">Ladda upp underlag direkt till projektet. Extraherade rader blir krav som väntar på granskning.</p></div></div>
            <form className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={uploadTechnicalDescription}><label className="block flex-1"><span className="mb-2 block text-sm font-medium text-ink-700">PDF</span><input name="file" type="file" accept=".pdf,application/pdf" className="block h-11 w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm" /></label><Button type="submit" disabled={uploading}><Upload className="h-4 w-4" aria-hidden="true" />{uploading ? "Extraherar..." : "Extrahera till projekt"}</Button></form>
          </section>
          <section className="rounded-lg border border-ink-200 bg-white p-5 shadow-sm"><h2 className="font-semibold text-ink-950">Dokumenthistorik</h2><div className="mt-4 divide-y divide-ink-100">{data.technicalDescriptions.length === 0 && data.documents.length === 0 ? <p className="py-5 text-sm text-ink-600">Inga dokument är kopplade ännu.</p> : <>{data.technicalDescriptions.map((item) => <DocumentRow key={`technical-${item.id}`} item={item} source="Teknisk OCR" />)}{data.documents.map((item) => <DocumentRow key={`project-${item.id}`} item={item} source="Projektunderlag" />)}</>}</div></section>
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
  const status = String(item.status ?? "pending");
  const confidence = typeof item.confidence === "number" ? Math.round(item.confidence * 100) : null;
  return <div className="px-5 py-4"><div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="rounded bg-ink-100 px-2 py-1 text-xs font-semibold text-ink-700">{String(item.category)}</span><span className="font-semibold text-ink-950">{String(item.requirement_key)}</span><span className={status === "confirmed" ? "text-xs font-semibold text-emerald-700" : status === "conflict" || status === "unclear" ? "text-xs font-semibold text-amber-700" : "text-xs text-ink-500"}>{status}</span></div><p className="mt-2 text-sm text-ink-800">{String(item.value_text ?? "Inget värde")}</p><p className="mt-2 text-xs text-ink-500">{item.certainty === "explicit" ? "Explicit uppgift" : "Tolkad uppgift"}{confidence !== null ? ` · ${confidence}% säkerhet` : ""}{item.source_page ? ` · sida ${String(item.source_page)}` : ""}</p>{typeof item.source_excerpt === "string" && item.source_excerpt && <p className="mt-2 max-w-3xl border-l-2 border-ink-200 pl-3 text-xs italic text-ink-500">{item.source_excerpt}</p>}</div><div className="flex shrink-0 flex-wrap gap-2"><Button variant="secondary" onClick={() => onReview(item.id, "confirmed")}><CheckCircle2 className="h-4 w-4" aria-hidden="true" />Godkänn</Button><Button variant="secondary" onClick={() => onReview(item.id, "unclear")}>Oklart</Button><Button variant="ghost" onClick={() => onReview(item.id, "rejected")}>Avvisa</Button></div></div></div>;
}

function DocumentRow({ item, source }: { item: ProjectRow; source: string }) {
  return <div className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-medium text-ink-950">{String(item.file_name ?? item.fileName ?? "Dokument")}</p><p className="text-xs text-ink-500">{source} · {String(item.status ?? item.extraction_method ?? "Ej behandlad")}</p></div><span className="text-xs text-ink-500">{formatDate(item.created_at)}</span></div>;
}

function suggestionName(item: ProjectRow) {
  const snapshot = isRecord(item.product_snapshot) ? item.product_snapshot : {};
  return String(snapshot.name ?? item.product_id ?? "Produkt");
}

function Metric({ label, value }: { label: string; value: number }) { return <div className="rounded-lg border border-ink-200 bg-white p-4 shadow-sm"><p className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-500">{label}</p><p className="mt-2 text-2xl font-semibold text-ink-950">{value}</p></div>; }
function InfoCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) { return <article className="rounded-lg border border-ink-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-2"><span>{icon}</span><h2 className="font-semibold text-ink-950">{title}</h2></div><div className="mt-4">{children}</div></article>; }
function TextArea({ name, label, defaultValue }: { name: string; label: string; defaultValue: string }) { return <label className="block"><span className="mb-2 block text-sm font-medium text-ink-700">{label}</span><textarea name={name} rows={4} defaultValue={defaultValue} className="block w-full rounded-lg border-ink-200 bg-white text-sm text-ink-900 shadow-sm focus:border-flow-500 focus:ring-flow-500" /></label>; }
function formatDate(value: unknown) { if (typeof value !== "string" || !value) return ""; return new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium" }).format(new Date(value)); }
function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
