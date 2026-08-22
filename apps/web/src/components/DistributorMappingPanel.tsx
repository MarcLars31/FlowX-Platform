"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, ExternalLink, History, ListChecks, Loader2, Plus, Search, ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { buildAhlsellRequirementGuide, type AhlsellPublicCandidate, type AhlsellRequirementGuide } from "@/lib/ahlsell-public-match";
import type { AhlsellCatalogResult } from "@/lib/ahlsell-public-catalog";
import { isUserApprovedProductAssignment } from "@/lib/approved-product-assignment";
import { formatProjectQuantity, projectRequirementQuantity } from "@/lib/project-requirement-quantity";
import { projectRequirementDetails, specificationLabel } from "@/lib/project-requirement-details";
import { splitDistributorRequirementLines } from "@/lib/distributor-requirement-lines";
import { splitAhlsellMatchGroups, type AhlsellMatchGroup } from "@/lib/ahlsell-match-groups";

type Row = Record<string, unknown> & { id: string };
type AccessoryDraft = { name: string; productNumber: string; quantity: number; unit: string; notes: string };
type ProductSelection = {
  productName: string;
  productNumber: string;
  manufacturerName: string;
  notes: string;
  accessories: AccessoryDraft[];
};

export function DistributorMappingPanel({ projectId, requirements, assignments, memories, memoryAccessories, onReload, onGoToDocuments, onFinish, finishing = false }: {
  projectId: string;
  requirements: Row[];
  assignments: Row[];
  memories: Row[];
  memoryAccessories: Row[];
  onReload: () => Promise<unknown>;
  onGoToDocuments: () => void;
  onFinish: () => Promise<void>;
  finishing?: boolean;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { productRequirements, removalRequirements } = splitDistributorRequirementLines(requirements);
  const approvedAssignments = assignments.filter(isUserApprovedProductAssignment);
  const approvedRequirementIds = new Set(approvedAssignments.map((assignment) => String(assignment.requirement_id)));
  const remainingRequirements = productRequirements.filter((requirement) => !approvedRequirementIds.has(requirement.id));
  const memoryFingerprints = new Set(
    memories.flatMap((memory) => typeof memory.requirement_fingerprint === "string"
      ? [memory.requirement_fingerprint]
      : [])
  );
  const { greenRequirements, yellowRequirements } = splitAhlsellMatchGroups(
    productRequirements,
    { approvedRequirementIds, memoryFingerprints }
  );
  const initialGroup: AhlsellMatchGroup = greenRequirements.some(
    (requirement) => !approvedRequirementIds.has(requirement.id)
  ) || yellowRequirements.length === 0
    ? "green"
    : "yellow";
  const initialQueue = initialGroup === "green" ? greenRequirements : yellowRequirements;
  const [queueGroup, setQueueGroup] = useState<AhlsellMatchGroup>(initialGroup);
  const totalPosts = productRequirements.length + removalRequirements.length;
  const [activeRequirementId, setActiveRequirementId] = useState<string | null>(
    () => initialQueue.find((requirement) => !approvedRequirementIds.has(requirement.id))?.id ?? initialQueue[0]?.id ?? null
  );
  const effectiveQueueGroup: AhlsellMatchGroup = queueGroup === "green"
    && greenRequirements.length === 0
    && yellowRequirements.length > 0
      ? "yellow"
      : queueGroup === "yellow"
        && yellowRequirements.length === 0
        && greenRequirements.length > 0
          ? "green"
          : queueGroup;
  const queueRequirements = effectiveQueueGroup === "green"
    ? greenRequirements
    : yellowRequirements;
  const requestedActiveIndex = queueRequirements.findIndex((requirement) => requirement.id === activeRequirementId);
  const activeIndex = requestedActiveIndex >= 0 ? requestedActiveIndex : 0;
  const activeRequirement = queueRequirements[activeIndex];
  const approvedCount = productRequirements.length - remainingRequirements.length;
  const greenRemainingCount = greenRequirements.filter((requirement) => !approvedRequirementIds.has(requirement.id)).length;
  const yellowRemainingCount = yellowRequirements.filter((requirement) => !approvedRequirementIds.has(requirement.id)).length;
  const activeGroupRemainingCount = effectiveQueueGroup === "green"
    ? greenRemainingCount
    : yellowRemainingCount;
  const activeGroupApprovedCount = queueRequirements.length - activeGroupRemainingCount;
  const progressPercent = queueRequirements.length > 0
    ? Math.round((activeGroupApprovedCount / queueRequirements.length) * 100)
    : 100;

  function showRequirement(requirementId: string) {
    setActiveRequirementId(requirementId);
    setMessage(null);
    setError(null);
  }

  function showQueue(group: AhlsellMatchGroup) {
    const nextQueue = group === "green" ? greenRequirements : yellowRequirements;
    if (nextQueue.length === 0) return;
    setQueueGroup(group);
    setActiveRequirementId(
      nextQueue.find((requirement) => !approvedRequirementIds.has(requirement.id))?.id
        ?? nextQueue[0]?.id
        ?? null
    );
    setMessage(null);
    setError(null);
  }

  return (
    <section className="space-y-6">
      <div className="rounded-2xl border border-cyan-300/20 bg-[#06213d] p-5 text-white shadow-[0_16px_35px_rgba(2,17,38,0.12)] sm:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-sm font-bold uppercase tracking-[0.08em] text-cyan-300">Steg 2 av 3 · Välj produkter</p>
            <h2 className="mt-2 text-2xl font-bold text-white sm:text-3xl">
              {remainingRequirements.length === 0 ? "Alla produkter är godkända" : `Godkänn ${remainingRequirements.length} ${remainingRequirements.length === 1 ? "produkt" : "produkter"}`}
            </h2>
            <p className="mt-3 text-base leading-7 text-slate-300">
              Börja uppifrån. Kontrollera PDF-kravet, välj rätt artikel och godkänn varje produkt med den stora knappen. Inget förslag godkänns eller sparas automatiskt.
            </p>
          </div>
          <div className="grid min-w-[250px] grid-cols-3 overflow-hidden rounded-xl border border-flow-200 bg-white text-center shadow-sm">
            <StatusNumber value={productRequirements.length} label="Produktval" />
            <StatusNumber value={approvedCount} label="Godkända" tone="success" />
            <StatusNumber value={remainingRequirements.length} label="Att godkänna" tone="warning" />
          </div>
        </div>
        <div className="mt-5 flex max-w-3xl items-start gap-3 rounded-xl border border-cyan-300/30 bg-white/10 p-4 text-sm font-semibold leading-6 text-cyan-50">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-cyan-300" aria-hidden="true" />
          <p>Du bestämmer alltid själv. Tidigare produktval fyller bara i ett utkast. Produkten blir godkänd först när du trycker på ”Godkänn produkt”.</p>
        </div>
      </div>

      {productRequirements.length > 0 && (
        <section aria-labelledby="match-queues-heading" className="rounded-2xl border-2 border-ink-200 bg-white p-4 shadow-sm sm:p-5">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.08em] text-flow-700">Välj arbetskö</p>
            <h3 id="match-queues-heading" className="mt-1 text-2xl font-bold text-ink-950">Arbeta med gröna och gula produkter var för sig</h3>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-700">Grön betyder att Scipx redan har en Ahlsellträff. Gul betyder att produkten behöver sökas och väljas manuellt.</p>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <QueueButton
              group="green"
              active={effectiveQueueGroup === "green"}
              count={greenRequirements.length}
              remaining={greenRemainingCount}
              onClick={() => showQueue("green")}
            />
            <QueueButton
              group="yellow"
              active={effectiveQueueGroup === "yellow"}
              count={yellowRequirements.length}
              remaining={yellowRemainingCount}
              onClick={() => showQueue("yellow")}
            />
          </div>
          <div className={effectiveQueueGroup === "green"
            ? "mt-4 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-950"
            : "mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950"}
          >
            {effectiveQueueGroup === "green"
              ? "Du arbetar nu med gröna produkter. Kontrollera träffen och godkänn varje produkt själv."
              : "Du arbetar nu med gula produkter. Sök hos Ahlsell eller fyll i rätt artikel manuellt."}
          </div>
        </section>
      )}

      {(message || error) && (
        <div role="status" aria-live="polite" className={error ? "rounded-xl border-2 border-rose-300 bg-rose-50 p-5 text-base font-semibold text-rose-900" : "rounded-xl border-2 border-emerald-300 bg-emerald-50 p-5 text-base font-semibold text-emerald-900"}>
          {error ?? message}
        </div>
      )}

      {totalPosts === 0 ? (
        <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-6 text-center">
          <p className="text-lg font-bold text-amber-950">Inga produktrader hittades</p>
          <p className="mx-auto mt-2 max-w-2xl text-base leading-7 text-amber-900">Ladda upp en ny eller tydligare teknisk beskrivning och försök igen.</p>
          <Button className="mt-5 min-h-12 text-base" variant="secondary" onClick={onGoToDocuments}>Gå tillbaka och ladda upp PDF</Button>
        </div>
      ) : (
        <div className="space-y-6">
          {activeRequirement && (() => {
            const requirement = activeRequirement;
            const assignment = approvedAssignments.find((item) => item.requirement_id === requirement.id);
            const matchingMemories = memories.filter((memory) => memory.requirement_fingerprint === requirement.mapping_fingerprint).slice(0, 3);
            return <div id="product-work-queue" className="space-y-4 scroll-mt-5">
              <nav aria-label="Navigera mellan produktposter" className={effectiveQueueGroup === "green" ? "rounded-2xl border-2 border-emerald-300 bg-white p-4 shadow-sm sm:p-5" : "rounded-2xl border-2 border-amber-300 bg-white p-4 shadow-sm sm:p-5"}>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex items-center gap-3">
                    <span className={effectiveQueueGroup === "green" ? "flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white" : "flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-500 text-amber-950"}><ListChecks className="h-5 w-5" aria-hidden="true" /></span>
                    <div>
                      <p className={effectiveQueueGroup === "green" ? "text-sm font-bold uppercase tracking-[0.08em] text-emerald-700" : "text-sm font-bold uppercase tracking-[0.08em] text-amber-800"}>{effectiveQueueGroup === "green" ? "Grön kö · Ahlsellträff" : "Gul kö · Manuell matchning"}</p>
                      <p className="mt-0.5 text-base font-bold text-ink-950">Produkt {activeIndex + 1} av {queueRequirements.length} · {activeGroupRemainingCount} kvar i denna kö</p>
                    </div>
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                    <label className="block min-w-64"><span className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink-600">Hoppa till PDF-post i denna kö</span><select value={requirement.id} onChange={(event) => showRequirement(event.target.value)} className="block h-12 w-full rounded-xl border-2 border-ink-200 bg-white px-3 text-base font-bold text-ink-900 focus:border-flow-500 focus:ring-flow-500">{queueRequirements.map((item, index) => { const details = projectRequirementDetails(item); return <option key={item.id} value={item.id}>{approvedRequirementIds.has(item.id) ? "✓" : "○"} {details.postNumber ? `PDF-post ${details.postNumber}` : `Produkt ${index + 1}`}</option>; })}</select></label>
                    <div className="grid grid-cols-2 gap-2">
                      <Button variant="secondary" className="min-h-12 justify-center" disabled={activeIndex === 0} onClick={() => showRequirement(queueRequirements[activeIndex - 1].id)}><ChevronLeft className="h-5 w-5" aria-hidden="true" />Föregående</Button>
                      <Button variant="secondary" className="min-h-12 justify-center" disabled={activeIndex === queueRequirements.length - 1} onClick={() => showRequirement(queueRequirements[activeIndex + 1].id)}>Nästa<ChevronRight className="h-5 w-5" aria-hidden="true" /></Button>
                    </div>
                  </div>
                </div>
                <div className="mt-4 h-3 overflow-hidden rounded-full bg-ink-100" aria-label={`${progressPercent} procent av produkterna godkända`}><div className="h-full rounded-full bg-emerald-500 transition-[width] duration-300" style={{ width: `${progressPercent}%` }} /></div>
              </nav>
              <RequirementProductMappingCard
                key={`${requirement.id}:${String(assignment?.updated_at ?? "new")}`}
                projectId={projectId}
                requirement={requirement}
                assignment={assignment}
                position={activeIndex + 1}
                totalPosts={queueRequirements.length}
                memories={matchingMemories}
                memoryAccessories={memoryAccessories}
                onSaved={async (successMessage) => {
                  setError(null);
                  setMessage(successMessage);
                  const remainingAfterApproval = queueRequirements.filter(
                    (item) => item.id !== requirement.id && !approvedRequirementIds.has(item.id)
                  );
                  const nextRequirement = remainingAfterApproval.find(
                    (item) => queueRequirements.findIndex((candidate) => candidate.id === item.id) > activeIndex
                  ) ?? remainingAfterApproval[0];
                  if (nextRequirement) {
                    setActiveRequirementId(nextRequirement.id);
                  } else {
                    const otherQueue = effectiveQueueGroup === "green"
                      ? yellowRequirements
                      : greenRequirements;
                    const nextInOtherQueue = otherQueue.find(
                      (item) => !approvedRequirementIds.has(item.id)
                    );
                    if (nextInOtherQueue) {
                      setQueueGroup(effectiveQueueGroup === "green" ? "yellow" : "green");
                      setActiveRequirementId(nextInOtherQueue.id);
                    }
                  }
                  await onReload();
                  window.requestAnimationFrame(() => document.getElementById("product-work-queue")?.scrollIntoView({ behavior: "smooth", block: "start" }));
                }}
                onError={(errorMessage) => { setMessage(null); setError(errorMessage || null); }}
              />
            </div>;
          })()}

          {removalRequirements.length > 0 && (
            <details className="group rounded-2xl border-2 border-amber-300 bg-amber-50">
              <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 p-5 sm:p-6">
                <div>
                <p className="text-sm font-bold uppercase tracking-[0.08em] text-amber-800">Demontering</p>
                <h3 className="mt-1 text-xl font-bold text-amber-950">{removalRequirements.length} {removalRequirements.length === 1 ? "post" : "poster"} utan nytt produktval</h3>
                <p className="mt-1 text-sm text-amber-900">De följer med i Excel men behöver inget produktval.</p>
                </div>
                <span className="inline-flex shrink-0 items-center gap-2 rounded-full bg-white px-3 py-2 text-sm font-bold text-amber-900">Visa poster<ChevronDown className="h-5 w-5 transition group-open:rotate-180" aria-hidden="true" /></span>
              </summary>
              <div className="space-y-4 border-t border-amber-300 p-5 sm:p-6">
                {removalRequirements.map((requirement, index) => (
                  <RemovalRequirementCard key={requirement.id} requirement={requirement} position={productRequirements.length + index + 1} totalPosts={totalPosts} />
                ))}
              </div>
            </details>
          )}

          {remainingRequirements.length === 0 ? (
            <div className="rounded-2xl border-2 border-emerald-400 bg-emerald-50 p-6 shadow-sm sm:p-7">
              <div className="flex items-start gap-4">
                <CheckCircle2 className="mt-0.5 h-8 w-8 shrink-0 text-emerald-700" aria-hidden="true" />
                <div>
                  <h3 className="text-2xl font-bold text-emerald-950">Bra – steg 2 är färdigt</h3>
                  <p className="mt-2 text-base leading-7 text-emerald-900">Du har själv godkänt alla inköpsposter. Tryck på knappen nedan för att gå till sammanfattningen och ladda ner Excel eller PDF.</p>
                </div>
              </div>
              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                <Button className="min-h-14 justify-center px-6 text-lg" disabled={finishing} onClick={onFinish}>
                  <CheckCircle2 className="h-5 w-5" aria-hidden="true" />{finishing ? "Slutför projektet…" : "Nästa: visa resultat"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border-2 border-flow-300 bg-flow-50 p-4 text-center">
              <p className="text-lg font-bold text-flow-950">{remainingRequirements.length} produktval återstår</p>
              <p className="mt-1 text-base text-flow-800">Gröna kvar: {greenRemainingCount} · Gula kvar: {yellowRemainingCount}. Godkänn produkten ovan eller byt arbetskö.</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function RequirementProductMappingCard({ projectId, requirement, assignment, position, totalPosts, memories, memoryAccessories, onSaved, onError }: {
  projectId: string;
  requirement: Row;
  assignment?: Row;
  position: number;
  totalPosts: number;
  memories: Row[];
  memoryAccessories: Row[];
  onSaved: (message: string) => Promise<void>;
  onError: (message: string) => void;
}) {
  const currentSnapshot = record(assignment?.product_snapshot);
  const [productName, setProductName] = useState(String(currentSnapshot.name ?? ""));
  const [productNumber, setProductNumber] = useState(String(currentSnapshot.productNumber ?? ""));
  const [manufacturerName, setManufacturerName] = useState(String(currentSnapshot.manufacturer ?? ""));
  const [notes, setNotes] = useState(String(currentSnapshot.notes ?? ""));
  const [accessories, setAccessories] = useState<AccessoryDraft[]>(() => snapshotAccessories(currentSnapshot.accessories));
  const [saving, setSaving] = useState(false);
  const [hasUnapprovedChanges, setHasUnapprovedChanges] = useState(false);
  const details = projectRequirementDetails(requirement);
  const quantity = projectRequirementQuantity(requirement.value_json);
  const isApproved = Boolean(assignment) && !hasUnapprovedChanges;
  const ahlsellGuide = buildAhlsellRequirementGuide(requirement);
  const pdfArticleNumber = ahlsellGuide.directCandidates.find(
    (candidate) => candidate.source === "pdf_reference"
  )?.articleNumber ?? null;

  function selectionFromMemory(memory: Row): ProductSelection {
    return {
      productName: String(memory.product_name ?? ""),
      productNumber: String(memory.product_number ?? ""),
      manufacturerName: String(memory.manufacturer_name ?? ""),
      notes: String(memory.notes ?? ""),
      accessories: memoryAccessories.filter((accessory) => accessory.memory_id === memory.id).map((accessory) => ({
      name: String(accessory.product_name ?? ""), productNumber: String(accessory.product_number ?? ""), quantity: numeric(accessory.quantity_per_main_product, 1), unit: String(accessory.unit ?? "st"), notes: String(accessory.notes ?? "")
      }))
    };
  }

  function showSelection(selection: ProductSelection) {
    setProductName(selection.productName);
    setProductNumber(selection.productNumber);
    setManufacturerName(selection.manufacturerName);
    setNotes(selection.notes);
    setAccessories(selection.accessories);
    setHasUnapprovedChanges(true);
  }

  function applyMemory(memory: Row) {
    showSelection(selectionFromMemory(memory));
    onError("");
  }

  function applyAhlsellCandidate(candidate: AhlsellPublicCandidate) {
    const candidateNote = candidate.source === "pdf_reference"
      ? "Artikelnumret hämtades från den uppladdade PDF-posten. Kontrollera produkten hos Ahlsell före beställning."
      : candidate.source === "catalog_search"
        ? "Produkten hittades i Ahlsells offentliga katalog. Kontrollera tekniska krav, godkännanden, pris och saldo före beställning."
        : `Offentlig Ahlsell-träff kontrollerad ${candidate.verifiedAt}. Aktuella godkännanden, pris och saldo måste verifieras före beställning.`;
    showSelection({
      productName: candidate.productName,
      productNumber: candidate.articleNumber,
      manufacturerName: candidate.manufacturer,
      notes: notes.trim() || candidateNote,
      accessories
    });
    onError("");
  }

  async function save() {
    const chosen = {
      productName,
      productNumber,
      manufacturerName,
      notes,
      accessories
    };
    setSaving(true);
    onError("");
    try {
      const response = await fetch(`/api/projects/${projectId}/product-mappings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requirementId: requirement.id, userApproved: true, ...chosen })
      });
      const payload = (await response.json().catch(() => null)) as { error?: string; message?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? "Produktvalet kunde inte sparas.");
      setHasUnapprovedChanges(false);
      await onSaved(`Produkten för post ${details.postNumber ?? position} är godkänd.`);
    } catch (saveError) {
      onError(saveError instanceof Error ? saveError.message : "Produktvalet kunde inte sparas.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <article id={`post-${requirement.id}`} className={isApproved ? "scroll-mt-6 overflow-hidden rounded-2xl border-2 border-emerald-300 bg-white shadow-sm" : "scroll-mt-6 overflow-hidden rounded-2xl border-2 border-amber-300 bg-white shadow-[0_12px_30px_rgba(120,53,15,0.08)]"}>
      <div className={isApproved ? "bg-emerald-50 p-5 sm:p-6" : "bg-amber-50 p-5 sm:p-6"}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className={isApproved ? "text-sm font-bold text-emerald-800" : "text-sm font-bold text-amber-900"}>1 · KONTROLLERA PDF-KRAVET · POST {position} AV {totalPosts}</p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <h3 className="text-2xl font-bold text-ink-950 sm:text-3xl">PDF-post {details.postNumber ?? "saknas"}</h3>
              {isApproved ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-1.5 text-sm font-bold text-white"><CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Godkänd</span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-600 px-3 py-1.5 text-sm font-bold text-white">Inte godkänd</span>
              )}
            </div>
            <p className="mt-3 max-w-4xl text-lg font-semibold leading-7 text-ink-900">{String(requirement.value_text ?? "Tekniskt krav")}</p>
          </div>
          <div className="shrink-0 rounded-xl border border-ink-200 bg-white px-4 py-3">
            <p className="text-xs font-bold uppercase tracking-wide text-ink-500">Mängd</p>
            <p className="mt-1 text-xl font-bold text-ink-950">{formatProjectQuantity(quantity)}</p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Fact label="PDF-postnummer" value={details.postNumber ?? "Saknas"} strong />
          {details.chapterPost && <Fact label="Kapitelpost" value={details.chapterPost} />}
          {pdfArticleNumber && <Fact label="Ahlsell artikelnummer i PDF" value={pdfArticleNumber} strong />}
          <Fact label="Antal" value={formatProjectQuantity(quantity)} />
          {details.nsCode && <Fact label="NS-kod" value={details.nsCode} />}
          {details.system && <Fact label="System" value={details.system} />}
        </div>

        <details className="mt-4 rounded-xl border border-ink-200 bg-white">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-base font-bold text-ink-800">Visa alla tekniska uppgifter<ChevronDown className="h-5 w-5 shrink-0" aria-hidden="true" /></summary>
          <div className="border-t border-ink-100">
            <dl className="grid sm:grid-cols-2 xl:grid-cols-3">
              {details.parentPostNumber && <SpecificationRow label="Huvudpost" value={details.parentPostNumber} />}
              {details.standardRefs.length > 0 && <SpecificationRow label="Standarder" value={details.standardRefs.join(", ")} />}
              {details.sourcePage && <SpecificationRow label="Källsida" value={String(details.sourcePage)} />}
              {details.attributes.map(([key, value]) => <SpecificationRow key={key} label={specificationLabel(key)} value={value} />)}
            </dl>
            {details.sourceExcerpt && <details className="border-t border-ink-100"><summary className="cursor-pointer px-4 py-3 text-sm font-bold text-flow-800 hover:bg-flow-50">Visa originaltext från PDF</summary><pre className="max-h-72 overflow-auto whitespace-pre-wrap border-t border-ink-100 bg-ink-50 p-4 font-sans text-sm leading-6 text-ink-700">{details.sourceExcerpt}</pre></details>}
          </div>
        </details>
      </div>

      <div className="space-y-5 p-5 sm:p-6">
        {memories.length > 0 && (
          <div className="rounded-xl border-2 border-sky-200 bg-sky-50 p-4">
            <div className="flex items-center gap-2 text-base font-bold text-sky-900"><History className="h-5 w-5" aria-hidden="true" /> Förslag från ett tidigare projekt – inte godkänt</div>
            <p className="mt-1 text-sm leading-6 text-sky-900">Välj ett förslag för att fylla i fälten. Kontrollera sedan uppgifterna och godkänn produkten själv.</p>
            <div className="mt-3 grid gap-3 lg:grid-cols-3">
              {memories.map((memory) => (
                <button key={memory.id} type="button" disabled={saving} onClick={() => applyMemory(memory)} className="min-h-24 rounded-xl border-2 border-sky-200 bg-white p-4 text-left transition hover:border-sky-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:cursor-wait disabled:opacity-60">
                  <p className="text-base font-bold text-ink-950">{String(memory.product_name)}</p>
                  <p className="mt-1 text-sm text-ink-700">Art.nr {String(memory.product_number)}</p>
                  <p className="mt-3 text-sm font-bold text-sky-800">Fyll i detta förslag</p>
                </button>
              ))}
            </div>
          </div>
        )}

        <AhlsellPublicMatchPanel
          projectId={projectId}
          requirementId={requirement.id}
          guide={ahlsellGuide}
          disabled={saving}
          onUseCandidate={applyAhlsellCandidate}
        />

        <div><p className="text-sm font-bold uppercase tracking-[0.08em] text-flow-700">2 · Välj produkt</p><h4 className="mt-1 text-xl font-bold text-ink-950">Fyll i den produkt du vill använda</h4><p className="mt-1 text-sm text-ink-600">Fälten med * måste fyllas i. Produkten sparas som godkänd först när du trycker på ”Godkänn produkt”.</p></div>
        <div className="grid gap-4 md:grid-cols-3">
          <Input className="h-12 text-base" id={`product-name-${requirement.id}`} label="Produktnamn *" value={productName} onChange={(event) => { setProductName(event.target.value); setHasUnapprovedChanges(true); }} required />
          <Input className="h-12 text-base" id={`product-number-${requirement.id}`} label="Ahlsells artikelnummer *" value={productNumber} onChange={(event) => { setProductNumber(event.target.value); setHasUnapprovedChanges(true); }} required />
          <Input className="h-12 text-base" id={`manufacturer-${requirement.id}`} label="Tillverkare (valfritt)" value={manufacturerName} onChange={(event) => { setManufacturerName(event.target.value); setHasUnapprovedChanges(true); }} />
        </div>

        <details className="rounded-xl border border-ink-200 bg-ink-50">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-base font-bold text-ink-800">Tillbehör och intern kommentar (valfritt)<ChevronDown className="h-5 w-5 shrink-0" aria-hidden="true" /></summary>
          <div className="space-y-5 border-t border-ink-200 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-ink-700">Lägg till produkter som normalt beställs tillsammans med huvudprodukten.</p>
              <Button type="button" variant="secondary" onClick={() => { setAccessories((current) => [...current, { name: "", productNumber: "", quantity: 1, unit: "st", notes: "" }]); setHasUnapprovedChanges(true); }}><Plus className="h-4 w-4" aria-hidden="true" /> Lägg till tillbehör</Button>
            </div>
            {accessories.map((accessory, index) => (
              <div key={index} className="grid gap-3 rounded-xl border border-ink-200 bg-white p-4 md:grid-cols-[2fr_1.3fr_0.8fr_0.7fr_auto]">
                <CompactInput label="Tillbehör" value={accessory.name} onChange={(value) => { updateAccessory(setAccessories, index, "name", value); setHasUnapprovedChanges(true); }} />
                <CompactInput label="Artikelnummer" value={accessory.productNumber} onChange={(value) => { updateAccessory(setAccessories, index, "productNumber", value); setHasUnapprovedChanges(true); }} />
                <CompactInput label="Antal per produkt" type="number" min="0.001" step="0.001" value={String(accessory.quantity)} onChange={(value) => { updateAccessory(setAccessories, index, "quantity", Number(value)); setHasUnapprovedChanges(true); }} />
                <CompactInput label="Enhet" value={accessory.unit} onChange={(value) => { updateAccessory(setAccessories, index, "unit", value); setHasUnapprovedChanges(true); }} />
                <button type="button" aria-label="Ta bort tillbehör" onClick={() => { setAccessories((current) => current.filter((_, itemIndex) => itemIndex !== index)); setHasUnapprovedChanges(true); }} className="mt-7 flex h-11 w-11 items-center justify-center rounded-lg text-ink-500 transition hover:bg-rose-50 hover:text-rose-700"><Trash2 className="h-5 w-5" aria-hidden="true" /></button>
              </div>
            ))}
            <label className="block"><span className="mb-2 block text-sm font-semibold text-ink-700">Intern kommentar</span><textarea rows={3} value={notes} onChange={(event) => { setNotes(event.target.value); setHasUnapprovedChanges(true); }} className="block w-full rounded-lg border-ink-200 bg-white text-base text-ink-900 shadow-sm focus:border-flow-500 focus:ring-flow-500" /></label>
          </div>
        </details>

        <div className={isApproved ? "flex flex-col gap-4 rounded-xl border-2 border-emerald-200 bg-emerald-50 p-4 sm:flex-row sm:items-center sm:justify-between" : "flex flex-col gap-4 rounded-xl border-2 border-amber-300 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between"}>
          <div>
            <p className={isApproved ? "text-sm font-bold uppercase tracking-[0.08em] text-emerald-800" : "text-sm font-bold uppercase tracking-[0.08em] text-amber-900"}>3 · Godkänn produkten</p>
            <p className={isApproved ? "mt-1 text-sm font-medium text-emerald-900" : "mt-1 text-sm font-medium text-amber-950"}>{isApproved ? "Produkten är godkänd. Alla ändringar måste godkännas på nytt." : "Produkten är inte godkänd ännu. Kontrollera uppgifterna och tryck sedan på knappen."}</p>
          </div>
          <Button className="min-h-14 w-full justify-center px-6 text-lg sm:w-auto" type="button" onClick={() => void save()} disabled={saving || !productName.trim() || !productNumber.trim()}>
            {saving ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <ShieldCheck className="h-5 w-5" aria-hidden="true" />}
            {saving ? "Godkänner…" : assignment ? `Godkänn ändringar för post ${details.postNumber ?? position}` : `Godkänn produkt för post ${details.postNumber ?? position}`}
          </Button>
        </div>
      </div>
    </article>
  );
}

const CANDIDATES_PER_PAGE = 6;

function AhlsellPublicMatchPanel({ projectId, requirementId, guide, disabled, onUseCandidate }: {
  projectId: string;
  requirementId: string;
  guide: AhlsellRequirementGuide;
  disabled: boolean;
  onUseCandidate: (candidate: AhlsellPublicCandidate) => void;
}) {
  const [catalogResult, setCatalogResult] = useState<AhlsellCatalogResult | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [candidatePage, setCandidatePage] = useState(1);

  useEffect(() => {
    const controller = new AbortController();

    void fetch(`/api/projects/${projectId}/requirements/${requirementId}/ahlsell-candidates`, {
      signal: controller.signal,
      headers: { Accept: "application/json" }
    })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as (AhlsellCatalogResult & { error?: string }) | null;
        if (!response.ok) throw new Error(payload?.error ?? "Ahlsell-sökningen misslyckades.");
        if (!payload) throw new Error("Ahlsell-sökningen gav inget läsbart svar.");
        setCatalogResult(payload);
      })
      .catch((error) => {
        if (error instanceof Error && error.name === "AbortError") return;
        setCatalogError(error instanceof Error ? error.message : "Ahlsell-sökningen misslyckades.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingCatalog(false);
      });

    return () => controller.abort();
  }, [projectId, requirementId]);

  const candidatesByArticle = new Map<string, AhlsellPublicCandidate>();
  for (const candidate of guide.directCandidates) candidatesByArticle.set(candidate.articleNumber, candidate);
  for (const candidate of catalogResult?.candidates ?? []) candidatesByArticle.set(candidate.articleNumber, candidate);
  const candidates = [...candidatesByArticle.values()];
  const pageCount = Math.max(1, Math.ceil(candidates.length / CANDIDATES_PER_PAGE));
  const visibleCandidates = candidates.slice(
    (candidatePage - 1) * CANDIDATES_PER_PAGE,
    candidatePage * CANDIDATES_PER_PAGE
  );

  return (
    <section className="rounded-xl border-2 border-cyan-200 bg-cyan-50 p-4 sm:p-5" aria-labelledby="ahlsell-match-heading">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <p className="text-sm font-bold uppercase tracking-[0.08em] text-cyan-900">Ahlsell-matchning · inte godkänd</p>
          <h4 id="ahlsell-match-heading" className="mt-1 text-xl font-bold text-ink-950">
            {loadingCatalog
              ? "Söker alla produkter hos Ahlsell…"
              : candidates.length > 0
                ? `${candidates.length} ${candidates.length === 1 ? "produkt hittad" : "produkter hittade"}`
                : "Ingen produkt hittades med denna sökning"}
          </h4>
          <p className="mt-1 text-sm leading-6 text-ink-700">
            Scipx söker i Ahlsells offentliga katalog med uppgifterna i PDF-posten. Välj en kandidat för att fylla i utkastet. Ingen produkt godkänns automatiskt.
          </p>
        </div>
        <a href={guide.searchUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#06213d] px-5 py-3 text-base font-bold text-white transition hover:bg-[#0a3158] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-700">
          <Search className="h-5 w-5" aria-hidden="true" />Sök på Ahlsell<ExternalLink className="h-4 w-4" aria-hidden="true" />
        </a>
      </div>

      <div className="mt-4 rounded-lg border border-cyan-200 bg-white px-4 py-3">
        <p className="text-xs font-bold uppercase tracking-wide text-ink-500">Förifylld sökning</p>
        <p className="mt-1 break-words text-sm font-semibold text-ink-900">{guide.searchQuery}</p>
      </div>

      {loadingCatalog && (
        <div className="mt-4 flex min-h-24 items-center justify-center gap-3 rounded-xl border border-cyan-200 bg-white text-base font-bold text-cyan-950" role="status">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> Hämtar alla Ahlsell-träffar…
        </div>
      )}

      {catalogError && (
        <div className="mt-4 rounded-xl border-2 border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-950" role="alert">
          <p className="font-bold">Produktlistan kunde inte hämtas automatiskt.</p>
          <p>{catalogError} Använd knappen ”Sök på Ahlsell” som reserv.</p>
        </div>
      )}

      {!loadingCatalog && !catalogError && catalogResult?.truncated && (
        <div className="mt-4 rounded-xl border-2 border-amber-300 bg-amber-50 p-4 text-sm font-semibold text-amber-950">
          Ahlsell uppgav {catalogResult.total} träffar. Scipx visar de {catalogResult.candidates.length} första; förfina sökningen för en fullständig och relevant lista.
        </div>
      )}

      {guide.warnings.length > 0 && (
        <div className="mt-4 rounded-lg border-2 border-amber-300 bg-amber-50 p-4 text-amber-950">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden="true" />
            <div>
              <p className="font-bold">Manuell kontroll krävs</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm leading-6">
                {guide.warnings.map((warning) => <li key={warning}>{warning}</li>)}
              </ul>
            </div>
          </div>
        </div>
      )}

      {visibleCandidates.length > 0 && (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {visibleCandidates.map((candidate) => (
            <article key={candidate.articleNumber} className="rounded-xl border-2 border-cyan-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-base font-bold text-ink-950">{candidate.productName}</p>
                  <p className="mt-1 text-sm font-bold text-cyan-900">Ahlsell art.nr {candidate.articleNumber}</p>
                  <p className="mt-1 text-xs font-semibold text-ink-600">{candidateSourceLabel(candidate.source)}</p>
                </div>
                <a href={candidate.productUrl} target="_blank" rel="noreferrer" aria-label={`Öppna Ahlsell artikel ${candidate.articleNumber}`} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-ink-200 text-ink-700 transition hover:border-cyan-500 hover:text-cyan-800">
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                </a>
              </div>
              {candidate.description && <p className="mt-3 line-clamp-4 text-sm leading-6 text-ink-700">{candidate.description}</p>}
              {candidate.specifications.length > 0 && <p className="mt-3 text-sm font-semibold leading-6 text-ink-700">{candidate.specifications.join(" · ")}</p>}
              <Button type="button" variant="secondary" className="mt-4 min-h-12 w-full justify-center" disabled={disabled} onClick={() => onUseCandidate(candidate)}>
                Fyll i som utkast
              </Button>
              <p className="mt-2 text-center text-xs font-semibold text-amber-800">Fyller bara i fälten – produkten är fortfarande inte godkänd.</p>
            </article>
          ))}
        </div>
      )}

      {pageCount > 1 && (
        <div className="mt-4 flex flex-col items-center justify-between gap-3 rounded-xl border border-cyan-200 bg-white p-3 sm:flex-row">
          <p className="text-sm font-bold text-ink-700">Visar {(candidatePage - 1) * CANDIDATES_PER_PAGE + 1}–{Math.min(candidatePage * CANDIDATES_PER_PAGE, candidates.length)} av {candidates.length}</p>
          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" disabled={candidatePage === 1} onClick={() => setCandidatePage((page) => Math.max(1, page - 1))}><ChevronLeft className="h-4 w-4" aria-hidden="true" /> Föregående</Button>
            <span className="min-w-20 text-center text-sm font-bold text-ink-700">Sida {candidatePage} av {pageCount}</span>
            <Button type="button" variant="secondary" disabled={candidatePage === pageCount} onClick={() => setCandidatePage((page) => Math.min(pageCount, page + 1))}>Nästa <ChevronRight className="h-4 w-4" aria-hidden="true" /></Button>
          </div>
        </div>
      )}
    </section>
  );
}

function candidateSourceLabel(source: AhlsellPublicCandidate["source"]) {
  if (source === "pdf_reference") return "Artikelnumret står i den uppladdade PDF-filen";
  if (source === "catalog_search") return "Träff i Ahlsells offentliga katalog – kontroll krävs";
  return "Tidigare verifierad i Ahlsells offentliga katalog";
}

function RemovalRequirementCard({ requirement, position, totalPosts }: { requirement: Row; position: number; totalPosts: number }) {
  const details = projectRequirementDetails(requirement);
  const quantity = projectRequirementQuantity(requirement.value_json);
  return (
    <article className="overflow-hidden rounded-xl border-2 border-amber-300 bg-white">
      <div className="p-5">
        <p className="text-sm font-bold text-amber-800">POST {position} AV {totalPosts} · DEMONTERING</p>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div><h4 className="text-2xl font-bold text-ink-950">PDF-post {details.postNumber ?? "saknas"}</h4><p className="mt-2 text-base font-semibold leading-7 text-ink-800">{String(requirement.value_text ?? "Demontering enligt teknisk beskrivning")}</p></div>
          <span className="shrink-0 rounded-xl bg-amber-100 px-4 py-2 text-base font-bold text-amber-950">{formatProjectQuantity(quantity)}</span>
        </div>
        <details className="mt-4 rounded-lg border border-ink-200">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-4 py-3 text-base font-bold text-ink-800">Visa alla uppgifter<ChevronDown className="h-5 w-5" aria-hidden="true" /></summary>
          <dl className="grid border-t border-ink-100 sm:grid-cols-2 xl:grid-cols-3">
            <SpecificationRow label="PDF-postnummer" value={details.postNumber ?? "Saknas"} />
            {details.chapterPost && <SpecificationRow label="Kapitelpost" value={details.chapterPost} />}
            <SpecificationRow label="Åtgärd" value="Demontering" />
            <SpecificationRow label="Antal" value={formatProjectQuantity(quantity)} />
            {details.parentPostNumber && <SpecificationRow label="Huvudpost" value={details.parentPostNumber} />}
            {details.nsCode && <SpecificationRow label="NS-kod" value={details.nsCode} />}
            {details.system && <SpecificationRow label="System" value={details.system} />}
            {details.standardRefs.length > 0 && <SpecificationRow label="Standarder" value={details.standardRefs.join(", ")} />}
            {details.sourcePage && <SpecificationRow label="Källsida" value={String(details.sourcePage)} />}
            {details.attributes.map(([key, value]) => <SpecificationRow key={key} label={specificationLabel(key)} value={value} />)}
          </dl>
          {details.sourceExcerpt && <pre className="max-h-72 overflow-auto whitespace-pre-wrap border-t border-ink-100 bg-ink-50 p-4 font-sans text-sm leading-6 text-ink-700">{details.sourceExcerpt}</pre>}
        </details>
      </div>
    </article>
  );
}

function QueueButton({ group, active, count, remaining, onClick }: {
  group: AhlsellMatchGroup;
  active: boolean;
  count: number;
  remaining: number;
  onClick: () => void;
}) {
  const green = group === "green";
  const title = green ? "Gröna · Ahlsellträff finns" : "Gula · manuell matchning";
  const description = green
    ? "Artikelnummer, tidigare produktval eller säker katalogträff finns."
    : "Ingen säker artikelträff finns ännu. Sök eller fyll i produkten manuellt.";
  const className = green
    ? active
      ? "min-h-36 rounded-2xl border-4 border-emerald-600 bg-emerald-50 p-5 text-left shadow-sm"
      : "min-h-36 rounded-2xl border-2 border-emerald-300 bg-emerald-50/60 p-5 text-left transition hover:border-emerald-500"
    : active
      ? "min-h-36 rounded-2xl border-4 border-amber-500 bg-amber-50 p-5 text-left shadow-sm"
      : "min-h-36 rounded-2xl border-2 border-amber-300 bg-amber-50/60 p-5 text-left transition hover:border-amber-500";

  return (
    <button type="button" aria-pressed={active} disabled={count === 0} onClick={onClick} className={`${className} disabled:cursor-not-allowed disabled:opacity-45`}>
      <span className="flex items-start justify-between gap-4">
        <span>
          <span className={green ? "block text-lg font-black text-emerald-950" : "block text-lg font-black text-amber-950"}>{title}</span>
          <span className="mt-1 block text-sm leading-6 text-ink-700">{description}</span>
        </span>
        <span className={green ? "flex h-12 min-w-12 items-center justify-center rounded-full bg-emerald-600 px-3 text-xl font-black text-white" : "flex h-12 min-w-12 items-center justify-center rounded-full bg-amber-400 px-3 text-xl font-black text-amber-950"}>{count}</span>
      </span>
      <span className={green ? "mt-3 block text-sm font-bold text-emerald-800" : "mt-3 block text-sm font-bold text-amber-800"}>{remaining === 0 ? "Klar" : `${remaining} kvar att godkänna`}{active ? " · Öppen nu" : ""}</span>
    </button>
  );
}

function StatusNumber({ value, label, tone = "neutral" }: { value: number; label: string; tone?: "neutral" | "success" | "warning" }) {
  const color = tone === "success" ? "text-emerald-700" : tone === "warning" ? "text-amber-700" : "text-ink-950";
  return <div className="border-r border-ink-100 px-3 py-3 last:border-r-0"><p className={`text-2xl font-bold ${color}`}>{value}</p><p className="mt-0.5 text-xs font-semibold text-ink-600">{label}</p></div>;
}

function Fact({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <div className="rounded-lg border border-ink-200 bg-white px-4 py-3"><p className="text-xs font-bold uppercase tracking-wide text-ink-500">{label}</p><p className={strong ? "mt-1 text-lg font-bold text-ink-950" : "mt-1 text-base font-semibold text-ink-900"}>{value}</p></div>;
}

function SpecificationRow({ label, value }: { label: string; value: string }) {
  return <div className="border-b border-ink-100 px-4 py-3 sm:border-r"><dt className="text-xs font-bold uppercase tracking-wide text-ink-500">{label}</dt><dd className="mt-1 break-words text-sm leading-6 text-ink-900">{value}</dd></div>;
}

function CompactInput({ label, value, onChange, type = "text", min, step }: { label: string; value: string; onChange: (value: string) => void; type?: string; min?: string; step?: string }) {
  return <label className="block"><span className="mb-1 block text-xs font-semibold text-ink-600">{label}</span><input type={type} min={min} step={step} value={value} onChange={(event) => onChange(event.target.value)} className="block h-11 w-full rounded-lg border-ink-200 bg-white text-base text-ink-900 focus:border-flow-500 focus:ring-flow-500" /></label>;
}

function updateAccessory(setAccessories: Dispatch<SetStateAction<AccessoryDraft[]>>, index: number, key: keyof AccessoryDraft, value: string | number) {
  setAccessories((current) => current.map((accessory, itemIndex) => itemIndex === index ? { ...accessory, [key]: value } : accessory));
}

function snapshotAccessories(value: unknown): AccessoryDraft[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const accessory = record(item);
    const name = String(accessory.name ?? "");
    if (!name) return [];
    return [{ name, productNumber: String(accessory.productNumber ?? ""), quantity: numeric(accessory.quantity, 1), unit: String(accessory.unit ?? "st"), notes: String(accessory.notes ?? "") }];
  });
}

function numeric(value: unknown, fallback: number) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
