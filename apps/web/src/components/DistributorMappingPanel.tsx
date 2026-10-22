"use client";
import { projectRequirementPageLabel } from "@/lib/project-requirement-details";



import { type ComponentProps, type ReactNode, useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { type ProjectDeliveryResource } from "@/lib/project-delivery-resource";
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Download, ExternalLink, FileText, Loader2, Mail, PackagePlus, Paperclip, Plus, Search, ShieldCheck, Tag, Upload } from "lucide-react";
import { ProjectPostSpecification } from "@/components/ProjectPostSpecification";
import { ChapterOverview, ChapterRequirements, ChapterSectionProgress, OtherSectionPosts } from "@/components/ChapterWorkspaceNavigation";
import { chapterWorkspaceRevision, initialSectionPost, type ChapterWorkspace, type ChapterSection, type WorkspaceChapter } from "@/lib/project-chapter-workspace";
import { createProductWorkspaceResource, type ProductWorkspaceResource } from "@/lib/product-workspace-resource";
import { createProductCardHistory } from "@/lib/product-card-history";
import { Button } from "@/components/Button";
import { ManualProductCard, type ManualProductChoice } from "@/components/ManualProductCard";
import { ProductSelectionCheckbox } from "@/components/ProductSelectionCheckbox";
import { ProductQuantityFields } from "@/components/ProductQuantityFields";
import { productChoiceSnapshots } from "@/lib/product-choice-collection";
import { parseProductOrderQuantity } from "@/lib/product-order-quantity";
import { ProductPostComments } from "@/components/ProductPostComments";
import { AccessoryProductPicker } from "@/components/AccessoryProductPicker";
import { assemblyComponentSearch, productAssemblyPlan, type AssemblyComponent } from "@/lib/product-assembly-plan";
import { isRigidPipeProduct } from "@/lib/pipe-product-family";
import { ahlsellRequirementIntent } from "@/lib/ahlsell-requirement-intent";
import type { AhlsellLookupProduct } from "@/lib/ahlsell-product-lookup";
import { buildAhlsellRequirementGuide, type AhlsellAccessorySuggestion, type AhlsellPublicCandidate, type AhlsellRequirementGuide } from "@/lib/ahlsell-public-match";
import type { AhlsellCatalogResult } from "@/lib/ahlsell-public-catalog";
import { isUserApprovedProductAssignment } from "@/lib/approved-product-assignment";
import {
  resolveDistributorProductName,
  validateManualDistributorProduct
} from "@/lib/distributor-product-mapping";
import {
  productRequirementResolution,
  type ProductRequirementResolutionStatus
} from "@/lib/product-requirement-resolution";
import { formatProjectQuantity, projectRequirementQuantity } from "@/lib/project-requirement-quantity";
import { projectRequirementDetails, projectRequirementSystemLabel, specificationLabel } from "@/lib/project-requirement-details";
import { projectRequirementDataWarnings } from "@/lib/project-requirement-data-warnings";
import { visibleProjectRequirements } from "@/lib/project-requirement-views";
import { ahlsellCatalogStatusFromPayload, type AhlsellCatalogMatchStatus } from "@/lib/ahlsell-match-groups";
import { orderAhlsellCandidatesForDisplay } from "@/lib/ahlsell-candidate-ranking";
import { effectiveRequirements } from "@/lib/effective-requirements";
import { TechnicalEvaluationDetails } from "./TechnicalEvaluationDetails";
import { ahlsellMldlProduct } from "@/lib/ahlsell-mldl-catalog";
import { AhlsellCandidateList } from "@/components/AhlsellCandidateList";
import { AhlsellProductLookup } from "@/components/AhlsellProductLookup";
import { normalizeNrfNumber } from "@/lib/product-card-candidates";
import { candidateSelectionReview, productSelectionReviewNotes, readProductSelectionReview, type ProductSelectionReview } from "@/lib/product-selection-review";
import {
  newProductAccessoryDraft,
  productAccessoryDraftError,
  productAccessoryPayload,
  readProductAccessoryDrafts,
  type ProductAccessoryDraft
} from "@/lib/product-card-accessories";
import {
  projectRequirementSourcePdfHref,
  projectRequirementSourcePdfFileName,
  type ProjectSourcePdfLookup
} from "@/lib/project-source-pdf";
type Row = Record<string, unknown> & { id: string };
type ProductSelection = {
  productName: string;
  productSubtitle: string;
  productNumber: string;
  manufacturerArticleNumber: string;
  manufacturerName: string;
  deliveryTimeDays: string;
  unitPrice: string;
  currency: string;
};
type PostProductChoice = ManualProductChoice & {
  id: string;
  notes: string;
  suggestions: AhlsellAccessorySuggestion[];
};

type RequirementAttachment = {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  comment: string | null;
  uploadedAt: string;
  uploadedBy: string;
  downloadUrl: string;
};
export type ProductEditState = { dirty: boolean; saving: boolean };

export function DistributorMappingPanel({ projectId, currency = "NOK", requirements, assignments, memories: allMemories, sourcePdfLookup, onReload, onGoToDocuments, onEditStateChange, workspaceNavigation, onRequirementSaved }: {
  deliveryResource?: ProjectDeliveryResource;
  workspaceNavigation?: ReactNode;
  onRequirementSaved?: (id: string) => Promise<void>;
  projectId: string; currency?: string; requirements: Row[]; assignments: Row[]; memories: Row[];
  sourcePdfLookup: ProjectSourcePdfLookup;
  onReload: () => Promise<unknown>; onGoToDocuments: () => void;
  onEditStateChange?: (state: ProductEditState) => void;
}) {
  const resource = useMemo(() => ({ projectId, ...createProductWorkspaceResource() }), [projectId]);
  const workspaceRevision = useMemo(() => chapterWorkspaceRevision(requirements), [requirements]);
  const [workspace, setWorkspace] = useState<ChapterWorkspace | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedChapter, setExpandedChapter] = useState<string | null>(null);
  const [sectionId, setSectionId] = useState<string | null>(null);
  const [activeRequirementId, setActiveRequirementId] = useState<string | null>(null);
  const [productCardSaving, setProductCardSaving] = useState(false);
  const [productCardDirty, setProductCardDirty] = useState(false);
  const listPosition = useRef(0);
  const rememberedPosts = useRef(new Map<string, string>());
  const chapterHistory = useRef<ReturnType<typeof createProductCardHistory> | null>(null);
  const initialHistoryRestored = useRef(false);
  const approvedAssignments = useMemo(() => assignments.filter(isUserApprovedProductAssignment), [assignments]);
  const approvedAssignmentByRequirementId = useMemo(() => new Map(approvedAssignments.map(row => [String(row.requirement_id), row])), [approvedAssignments]);
  const approvedRequirementIds = useMemo(() => new Set(approvedAssignments.map(row => String(row.requirement_id))), [approvedAssignments]);
  const visible = useMemo(() => visibleProjectRequirements(requirements), [requirements]);
  const rowsById = useMemo(() => new Map(visible.map(row => [row.id, row])), [visible]);
  const chapter = workspace?.chapters.find(item => item.sections.some(section => section.id === sectionId));
  const section = chapter?.sections.find(item => item.id === sectionId);
  const sectionRows = useMemo(() => section?.requirementIds.flatMap(id => rowsById.get(id) ? [rowsById.get(id)!] : []) ?? [], [section, rowsById]);
  const activeRequirement = sectionRows.find(row => row.id === activeRequirementId)
    ?? sectionRows.find(row => !approvedRequirementIds.has(row.id)) ?? sectionRows[0];
  const activeAssignment = activeRequirement ? approvedAssignmentByRequirementId.get(activeRequirement.id) : undefined;
  const activeIndex = sectionRows.findIndex(row => row.id === activeRequirement?.id);
  const memories = useMemo(() => allMemories.filter(memory => ahlsellMldlProduct(String(memory.product_number ?? "")) && !readProductSelectionReview(memory.notes)), [allMemories]);
  const recordFullCatalogResult = useCallback(() => {}, []);

  useEffect(() => {
    let current = true;
    resource.load<ChapterWorkspace>(`/api/projects/${projectId}/chapters`, workspaceRevision).then(data => {
      if (current) { setWorkspace(data); setLoadError(null); }
    }).catch(error => { if (current) setLoadError(error instanceof Error ? error.message : "Kapitlen kunde inte hämtas."); });
    return () => { current = false; };
  }, [resource, projectId, workspaceRevision, loadAttempt]);
  useEffect(() => {
    onEditStateChange?.({ dirty: productCardDirty, saving: productCardSaving });
    return () => onEditStateChange?.({ dirty: false, saving: false });
  }, [onEditStateChange, productCardDirty, productCardSaving]);
  useEffect(() => {
    if (!productCardDirty && !productCardSaving) return;
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    const navigate = (event: MouseEvent) => {
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const destination = new URL(anchor.href, window.location.href);
      if (!["http:", "https:"].includes(destination.protocol) || destination.href === window.location.href) return;
      if (productCardSaving || !window.confirm("Du har osparade ändringar. Lämna sidan utan att spara?")) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener("beforeunload", unload); document.addEventListener("click", navigate, true);
    return () => { window.removeEventListener("beforeunload", unload); document.removeEventListener("click", navigate, true); };
  }, [productCardDirty, productCardSaving]);
  function canNavigate() { return !productCardSaving && (!productCardDirty || window.confirm("Du har osparade ändringar. Byt vy utan att spara?")); }
  function focusWorkspace() { requestAnimationFrame(() => document.getElementById("product-post-detail")?.focus({ preventScroll: true })); }
  function remember(id: string, targetSection = sectionId) {
    if (!targetSection) return;
    rememberedPosts.current.set(targetSection, id);
    try { sessionStorage.setItem(`scipx-post:${projectId}:${targetSection}`, id); } catch { /* Navigation works without browser storage. */ }
  }
  function returnToOverview() {
    setSectionId(null); setActiveRequirementId(null); setProductCardDirty(false); setMessage(null); setError(null);
    requestAnimationFrame(() => {
      window.scrollTo({ top: listPosition.current, behavior: "instant" });
      document.getElementById(`chapter-section-${encodeURIComponent(sectionId ?? "")}`)?.focus({ preventScroll: true });
    });
  }
  const canLeaveHistory = useEffectEvent(() => canNavigate());
  const handleHistory = useEffectEvent((targetSectionId: string | null) => {
    if (!targetSectionId) { returnToOverview(); return; }
    const nextSection = workspace?.chapters.flatMap(item => item.sections).find(item => item.id === targetSectionId);
    if (!nextSection) { returnToOverview(); return; }
    setSectionId(nextSection.id); setActiveRequirementId(initialSectionPost(nextSection, approvedRequirementIds, rememberedPosts.current.get(nextSection.id)));
    setProductCardDirty(false); setMessage(null); setError(null); focusWorkspace();
  });
  useEffect(() => {
    const navigation = createProductCardHistory(window, `${projectId}:chapters`, {
      canLeave: () => canLeaveHistory(), onNavigate: id => handleHistory(id)
    });
    chapterHistory.current = navigation;
    return () => { navigation.dispose(); chapterHistory.current = null; };
  }, [projectId]);
  useEffect(() => {
    if (!workspace || initialHistoryRestored.current) return;
    initialHistoryRestored.current = true;
    const current = chapterHistory.current?.current();
    if (current) handleHistory(current);
  }, [workspace]);
  function openSection(nextChapter: WorkspaceChapter, nextSection: ChapterSection) {
    if (!canNavigate()) return;
    if (!chapterHistory.current?.open(nextSection.id)) return;
    let remembered = rememberedPosts.current.get(nextSection.id);
    try { remembered ??= sessionStorage.getItem(`scipx-post:${projectId}:${nextSection.id}`) ?? undefined; } catch { /* Optional. */ }
    const id = initialSectionPost(nextSection, approvedRequirementIds, remembered);
    listPosition.current = window.scrollY;
    setExpandedChapter(nextChapter.id); setSectionId(nextSection.id); setActiveRequirementId(id);
    if (id) remember(id, nextSection.id);
    setProductCardDirty(false); setMessage(null); setError(null);
    requestAnimationFrame(() => { document.getElementById("product-post-detail")?.scrollIntoView({ block: "start", behavior: "instant" }); focusWorkspace(); });
  }
  function showRequirement(id: string) {
    if (!section?.requirementIds.includes(id) || !canNavigate()) return false;
    remember(id); setActiveRequirementId(id); setProductCardDirty(false); setMessage(null); setError(null);
    requestAnimationFrame(() => { const anchor = document.getElementById("chapter-active-anchor"); anchor?.scrollIntoView({ block: "start", behavior: "instant" }); anchor?.focus({ preventScroll: true }); });
    return true;
  }
  return <section id="project-requirement-table" aria-label="Produktöversikt" className="product-selection-workspace chapter-workspace" data-post-open={Boolean(section)}>
    {!section && <div className="product-selection-heading"><h2>Kapitelöversikt</h2><p>{visible.length} poster · {visible.filter(row => approvedRequirementIds.has(row.id)).length} valda</p></div>}
    {workspaceNavigation}
    {!workspace && <div className="product-selection-empty" role={loadError ? "alert" : "status"}>
      <p>{loadError ?? "Laddar PDF-filens kapitel…"}</p>{loadError && <Button variant="secondary" onClick={() => setLoadAttempt(value => value + 1)}>Försök igen</Button>}
    </div>}
    {workspace && loadError && <p role="alert">{loadError} <Button variant="secondary" onClick={() => setLoadAttempt(value => value + 1)}>Försök igen</Button></p>}
    {workspace && !section && <ChapterOverview workspace={workspace} selected={approvedRequirementIds} expanded={expandedChapter} onToggle={id => setExpandedChapter(current => current === id ? null : id)} onOpen={openSection} />}
    {workspace && chapter && section && <section id="product-post-detail" tabIndex={-1} className="product-post-detail" aria-label="Arbetsvy för underkapitel">
      <header className="chapter-workspace-header">
        <Button variant="secondary" disabled={productCardSaving} onClick={() => { if (canNavigate()) { chapterHistory.current?.close(); returnToOverview(); } }}><ChevronLeft aria-hidden="true" className="h-4 w-4" />Tillbaka till kapitelöversikten</Button>
        <nav aria-label="Navigeringsspår">{chapter.number} {chapter.title}<ChevronRight aria-hidden="true" /><span aria-current="page">{section.number} {section.title}</span></nav>
        <h2>{section.number} {section.title}</h2><ChapterSectionProgress chapter={chapter} section={section} selected={approvedRequirementIds} />
      </header>
      <ChapterRequirements workspace={workspace} chapter={chapter} section={section} activeId={activeRequirement?.id} />
      {(message || error) && <p role={error ? "alert" : "status"} className="product-selection-feedback">{error ?? message}</p>}
      <div id="chapter-active-anchor" className="scroll-mt-24" tabIndex={-1} aria-label="Aktiv produktpost" />
      {activeRequirement ? <LazyRequirementProductMappingCard
        key={`${activeRequirement.id}:${String(activeRequirement.edit_revision ?? "")}:${String(activeAssignment?.updated_at ?? "new")}:${productRequirementResolution(activeRequirement)?.status ?? ""}`}
        projectId={projectId} currency={currency} requirement={activeRequirement} assignment={activeAssignment} resource={resource}
        relatedPosts={<OtherSectionPosts rows={sectionRows} activeId={activeRequirement.id} assignments={approvedAssignmentByRequirementId} disabled={productCardSaving} onSelect={showRequirement} />}
        sourcePdfHref={projectRequirementSourcePdfHref(projectId, activeRequirement, sourcePdfLookup)} sourcePdfFileName={projectRequirementSourcePdfFileName(activeRequirement, sourcePdfLookup)}
        position={activeIndex + 1} memories={memories.filter(memory => memory.requirement_fingerprint === activeRequirement.mapping_fingerprint)}
        onCatalogResult={recordFullCatalogResult} onSavingChange={setProductCardSaving} onDirtyChange={setProductCardDirty}
        onSaved={async success => { resource.invalidate(`/api/projects/${projectId}/requirements/${activeRequirement.id}`); if (onRequirementSaved) await onRequirementSaved(activeRequirement.id); else await onReload(); setProductCardDirty(false); setError(null); setMessage(success); }}
        onError={errorMessage => { setMessage(null); setError(errorMessage || null); }}
      /> : chapter.kind !== "review" && <p className="product-selection-empty">Detta avsnitt innehåller kravtext och har inga egna produktval.</p>}
    </section>}
    {workspace && !workspace.chapters.length && <div className="product-selection-empty"><p>Inga produktposter att visa.</p>{!requirements.length && <Button variant="secondary" onClick={onGoToDocuments}>Gå till dokument</Button>}</div>}
    <footer className="product-selection-footer"><span>{productCardSaving ? "Sparar produktval…" : productCardDirty ? "Osparade ändringar" : "Klar"}</span></footer>
  </section>;
}


function LazyRequirementProductMappingCard(props: ComponentProps<typeof RequirementProductMappingCard>) {
  const [detail, setDetail] = useState<{ requirement: Row; assignments: Row[]; mappingMemories: Row[] } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const needsDetails = Boolean(props.requirement.overview);
  useEffect(() => {
    if (!needsDetails) return;
    let current = true;
    void props.resource.load<{ requirement: Row; assignments: Row[]; mappingMemories: Row[] }>(`/api/projects/${props.projectId}/requirements/${props.requirement.id}`, String(props.requirement.edit_revision ?? "")).then(payload => {
      if (!payload.requirement || !Array.isArray(payload.assignments) || !Array.isArray(payload.mappingMemories)) throw new Error("Produktpostens svar var ofullständigt.");
      if (payload.requirement.id !== props.requirement.id) throw new Error("Fel produktpost i svaret.");
      if (current) setDetail(payload);
    }).catch(error => {
      if (current) setLoadError(error instanceof Error ? error.message : "Produktposten kunde inte laddas.");
    });
    return () => { current = false; };
  }, [attempt, needsDetails, props.projectId, props.requirement.id, props.requirement.edit_revision, props.resource]);
  if (!needsDetails) return <RequirementProductMappingCard {...props} />;
  if (detail) return <RequirementProductMappingCard {...props} requirement={detail.requirement}
    assignment={detail.assignments.find(isUserApprovedProductAssignment)} memories={detail.mappingMemories.filter(memory =>
      ahlsellMldlProduct(String(memory.product_number ?? "")) && !readProductSelectionReview(memory.notes))} />;
  return <div className="space-y-4 p-6" aria-live="polite">
    <p role={loadError ? "alert" : "status"}>{loadError ?? "Laddar produktpostens krav och produktval…"}</p>
    <div className="flex gap-3">
      {loadError && <Button variant="secondary" onClick={() => { props.resource.invalidate(`/api/projects/${props.projectId}/requirements/${props.requirement.id}`); setLoadError(null); setAttempt(value => value + 1); }}>Försök igen</Button>}
    </div>
  </div>;
}

function RequirementProductMappingCard({ projectId, currency, requirement, assignment, sourcePdfHref, sourcePdfFileName, position, memories, resource, relatedPosts, onCatalogResult, onSavingChange, onDirtyChange, onSaved, onError }: {
  projectId: string;
  currency: string;
  requirement: Row;
  assignment?: Row;
  sourcePdfHref: string | null;
  sourcePdfFileName: string | null;
  position: number;
  memories: Row[];
  resource: ProductWorkspaceResource;
  relatedPosts: ReactNode;
  onCatalogResult: (requirementId: string, status: AhlsellCatalogMatchStatus) => void;
  onSavingChange: (saving: boolean) => void;
  onDirtyChange: (dirty: boolean) => void;
  onSaved: (message: string) => Promise<void>;
  onError: (message: string) => void;
}) {
  const quantity = projectRequirementQuantity(requirement.value_json);
  const defaultCurrency = normalizeCurrencyCode(currency) || "NOK";
  const emptyChoice = (): PostProductChoice => ({ id: "", product: {
    productName: "", productSubtitle: "", productNumber: "", manufacturerArticleNumber: "",
    manufacturerName: "", deliveryTimeDays: "", unitPrice: "", currency: defaultCurrency },
    quantity: { quantity: String(quantity.quantity ?? ""), unit: quantity.unit || "st" },
    accessories: [], manual: true, review: null, notes: "", suggestions: [] });
  const [choices, setChoices] = useState<PostProductChoice[]>(() => productChoiceSnapshots(assignment?.product_snapshot).map((snapshot, index) => {
    const savedQuantity = parseProductOrderQuantity(snapshot.orderQuantity);
    return { ...emptyChoice(), id: String(index), product: {
      productName: String(snapshot.name ?? ""), productSubtitle: String(snapshot.subtitle ?? ""),
      productNumber: String(snapshot.productNumber ?? ""), manufacturerArticleNumber: String(snapshot.manufacturerArticleNumber ?? ""),
      manufacturerName: String(snapshot.manufacturer ?? ""), deliveryTimeDays: String(snapshot.deliveryTimeDays ?? ""),
      unitPrice: String(snapshot.unitPrice ?? ""), currency: normalizeCurrencyCode(String(snapshot.currency ?? "")) || defaultCurrency },
      quantity: savedQuantity ? { quantity: String(savedQuantity.quantity), unit: savedQuantity.unit } : emptyChoice().quantity,
      manual: snapshot.entryMethod === "manual" || snapshot.entryMethod == null && [snapshot.manufacturerArticleNumber, snapshot.deliveryTimeDays, snapshot.unitPrice].some(value => value != null && String(value).trim() !== ""),
      accessories: readProductAccessoryDrafts(snapshot.accessories), review: readProductSelectionReview(snapshot.notes),
      notes: String(snapshot.notes ?? "") };
  }));
  const [activeChoiceId, setActiveChoiceId] = useState(choices[0]?.id ?? "");
  const activeChoice = choices.find(choice => choice.id === activeChoiceId) ?? choices[0] ?? emptyChoice();
  const { productName, productSubtitle, productNumber, manufacturerName } = activeChoice.product;
  const accessories = activeChoice.accessories;
  const selectedProductAccessories = accessories;
  const suggestedAccessories = activeChoice.suggestions;
  const [manualEditingId, setManualEditingId] = useState<string | null>(null);
  const [manualProductOpen, setManualProductOpen] = useState(false);
  const [manualProductDraftDirty, setManualProductDraftDirty] = useState(false);
  const [manualProductError, setManualProductError] = useState<string | null>(null);
  const [accessoryStepOpen, setAccessoryStepOpen] = useState(false);
  const [accessoryLookupOpen, setAccessoryLookupOpen] = useState(false);
  const [accessoryComponentId, setAccessoryComponentId] = useState<string | null>(null);
  const [commentDraftDirty, setCommentDraftDirty] = useState(false);
  const [commentsSaving, setCommentsSaving] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasUnapprovedChanges, setHasUnapprovedChanges] = useState(false);
  const [draftNotice, setDraftNotice] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<RequirementAttachment[]>([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(true);
  const [attachmentExpanded, setAttachmentExpanded] = useState(false);
  const [attachmentComment, setAttachmentComment] = useState("");
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [attachmentSaving, setAttachmentSaving] = useState(false);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [attachmentMessage, setAttachmentMessage] = useState<string | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const details = projectRequirementDetails(requirement);
  const dataWarnings = projectRequirementDataWarnings(requirement);
  const resolution = productRequirementResolution(requirement);
  const hasAttachmentDraft = Boolean(attachmentFile || attachmentComment.trim());
  const hasUnsavedChanges = hasUnapprovedChanges || hasAttachmentDraft || manualProductDraftDirty || commentDraftDirty;
  const accessoryError = choices.map(choice => productAccessoryDraftError(choice.accessories)).find(Boolean) ?? null;
  const assemblyPlan = productAssemblyPlan(requirement);
  const accessoryComponent = assemblyPlan?.components.find(component => component.id === accessoryComponentId);
  const accessoryQuery = accessoryComponent
    ? assemblyComponentSearch(accessoryComponent, `${productName} ${productSubtitle} ${manufacturerName}`)
    : !assemblyPlan?.components.length ? suggestedAccessories[0]?.productName ?? "" : "";
  const clearingSavedSelection = Boolean(assignment) && hasUnapprovedChanges && !productNumber.trim();
  const isApproved = Boolean(assignment) && !hasUnapprovedChanges;
  const ahlsellGuide = buildAhlsellRequirementGuide(requirement);
  const pdfArticleNumber = ahlsellGuide.directCandidates.find(
    (candidate) => candidate.source === "pdf_reference"
  )?.articleNumber ?? null;
  const productPostMailHref = buildProductPostMailHref({
    postNumber: details.postNumber ?? String(position),
    productRequirement: String(requirement.value_text ?? "Tekniskt krav"),
    quantity: formatProjectQuantity(quantity),
    nsCode: details.nsCode,
    system: details.system ? projectRequirementSystemLabel(details.system) : null,
    attributes: details.attributes,
    sourceExcerpt: details.sourceExcerpt
  });

  useEffect(() => {
    onDirtyChange(hasUnsavedChanges);
    return () => onDirtyChange(false);
  }, [hasUnsavedChanges, onDirtyChange]);

  useEffect(() => { onSavingChange(commentsSaving || saving || attachmentSaving); }, [commentsSaving, saving, attachmentSaving, onSavingChange]);

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/projects/${projectId}/requirements/${requirement.id}/attachments`, {
      headers: { Accept: "application/json" },
      signal: controller.signal
    })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as { attachments?: RequirementAttachment[]; error?: string } | null;
        if (!response.ok) throw new Error(payload?.error ?? "Vedlegget kunde inte hämtas.");
        const loadedAttachments = payload?.attachments ?? [];
        setAttachments((current) => {
          const merged = new Map(current.map((attachment) => [attachment.id, attachment]));
          for (const attachment of loadedAttachments) merged.set(attachment.id, attachment);
          return [...merged.values()].sort((left, right) =>
            right.uploadedAt.localeCompare(left.uploadedAt)
          );
        });
      })
      .catch((loadError) => {
        if (loadError instanceof Error && loadError.name === "AbortError") return;
        setAttachmentError(loadError instanceof Error ? loadError.message : "Vedlegget kunde inte hämtas.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setAttachmentsLoading(false);
      });
    return () => controller.abort();
  }, [projectId, requirement.id]);

  function selectionFromMemory(memory: Row, resolved?: { productName?: string; productSubtitle?: string }): ProductSelection {
    return {
      productName: resolved?.productName || String(memory.product_name ?? ""),
      productSubtitle: resolved?.productSubtitle || String(memory.product_subtitle ?? ""),
      productNumber: String(memory.product_number ?? ""),
      manufacturerArticleNumber: "",
      manufacturerName: String(memory.manufacturer_name ?? ""),
      deliveryTimeDays: "",
      unitPrice: "",
      currency: defaultCurrency
    };
  }

  function updateChoice(id: string, update: (choice: PostProductChoice) => PostProductChoice) {
    setChoices(current => current.map(choice => choice.id === id ? update(choice) : choice));
    setHasUnapprovedChanges(true);
  }

  function setAccessories(update: ProductAccessoryDraft[] | ((items: ProductAccessoryDraft[]) => ProductAccessoryDraft[])) {
    updateChoice(activeChoice.id, choice => ({ ...choice, accessories: typeof update === "function" ? update(choice.accessories) : update }));
  }

  function activateChoice(id: string) {
    setActiveChoiceId(id);
    setAccessoryStepOpen(false);
    setAccessoryLookupOpen(false);
    setAccessoryComponentId(null);
  }

  function focusSelectedProduct() {
    window.requestAnimationFrame(() => document.getElementById(`selected-pipe-${requirement.id}-${activeChoice.id}`)?.focus({ preventScroll: true }));
  }

  function showSelection(selection: ProductSelection, review: ProductSelectionReview | null, suggestions: AhlsellAccessorySuggestion[] = [], amount?: { quantity: string; unit: string }) {
    const existing = choices.find(choice => normalizeNrfNumber(choice.product.productNumber) === normalizeNrfNumber(selection.productNumber));
    if (existing) { activateChoice(existing.id); return; }
    const choice = { ...emptyChoice(), id: crypto.randomUUID(), product: selection, manual: false, review, suggestions,
      quantity: amount ?? emptyChoice().quantity };
    // Replacing a proposal preserves other explicitly added products. The new
    // choice is shown as saved only after the existing save endpoint succeeds.
    const next = choices.length ? choices.map(item => item.id === activeChoice.id ? choice : item) : [choice];
    void save(next);
  }

  function applyMemory(memory: Row, resolved?: { productName?: string; productSubtitle?: string; candidate?: AhlsellPublicCandidate }) {
    showSelection(selectionFromMemory(memory, resolved), candidateSelectionReview(resolved?.candidate));
  }

  function applyAhlsellCandidate(candidate: AhlsellPublicCandidate, resolvedSubtitle = "", amount?: { quantity: string; unit: string }) {
    showSelection({ productName: candidate.productName, productSubtitle: resolvedSubtitle, productNumber: candidate.articleNumber,
      manufacturerArticleNumber: "", manufacturerName: candidate.manufacturer, deliveryTimeDays: "", unitPrice: "", currency: defaultCurrency },
      candidateSelectionReview(candidate) ?? (dataWarnings.length ? { status: "review", warnings: dataWarnings.map(warning => warning.message) } : null),
      candidate.suggestedAccessories ?? [], amount);
  }

  function removeProduct(id: string) {
    const remaining = choices.filter(choice => choice.id !== id);
    void save(remaining);
  }

  function clearSelectedProduct() { removeProduct(activeChoice.id); }

  function openManualProductCard(editId: string | null = null) {
    setManualEditingId(editId);
    if (hasAttachmentDraft || attachments.length > 0) setAttachmentExpanded(true);
    setManualProductDraftDirty(false);
    setManualProductError(null);
    setManualProductOpen(true);
  }

  function closeManualProductCard() {
    if (attachmentSaving) return;
    setManualProductOpen(false);
    setManualProductDraftDirty(false);
    setManualProductError(null);
    window.requestAnimationFrame(() => document.getElementById(`manual-product-trigger-${requirement.id}`)?.focus());
  }

  function applyManualProduct(choice: ManualProductChoice) {
    if (choices.some(item => item.id !== manualEditingId && normalizeNrfNumber(item.product.productNumber) === normalizeNrfNumber(choice.product.productNumber))) {
      setManualProductError("Produktet er allerede valgt. Endre mengden på den eksisterende raden."); return;
    }
    if (!manualEditingId && choices.length >= 20) { setManualProductError("Du kan velge inntil 20 produkter per post."); return; }
    const previous = choices.find(item => item.id === manualEditingId);
    const sameProduct = previous && normalizeNrfNumber(previous.product.productNumber) === normalizeNrfNumber(choice.product.productNumber);
    const next: PostProductChoice = { ...emptyChoice(), ...choice, id: previous?.id ?? crypto.randomUUID(),
      notes: sameProduct ? previous.notes : "", suggestions: sameProduct ? previous.suggestions : [] };
    setChoices(current => previous ? current.map(item => item.id === previous.id ? next : item) : [...current, next]);
    activateChoice(next.id);
    closeManualProductCard();
    setHasUnapprovedChanges(true);
    setDraftNotice("Produkt og tilbehør er lagt til. Lagre produktvalget for å bekrefte posten.");
    onError("");
  }

  function addAccessory() {
    openAccessoryLookup();
  }

  function finishAccessories() {
    if (accessoryError) return;
    setAccessoryStepOpen(false);
    setAccessoryLookupOpen(false);
    setAccessoryComponentId(null);
    focusSelectedProduct();
  }

  function editAccessories() {
    setAccessoryStepOpen(true);
    setAccessoryComponentId(assemblyPlan?.components.find(component => !component.optional)?.id ?? null);
    setAccessoryLookupOpen(true);
    window.requestAnimationFrame(() => document.getElementById(`accessory-step-${requirement.id}`)?.focus({ preventScroll: true }));
  }

  function openAccessoryLookup(component?: AssemblyComponent) {
    if (!productNumber.trim() || selectedProductAccessories.length >= 20) return;
    setAccessoryStepOpen(true);
    setAccessoryComponentId(component?.id ?? null);
    setAccessoryLookupOpen(true);
    window.requestAnimationFrame(() => {
      const target = `accessory-lookup-card-${requirement.id}`;
      document.getElementById(target)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }

  function applyAhlsellAccessory(candidate: AhlsellLookupProduct, amount: { quantity: string; unit: string }) {
    if (!productNumber.trim() || selectedProductAccessories.length >= 20) return;
    if (selectedProductAccessories.some((accessory) => normalizeNrfNumber(accessory.productNumber) === normalizeNrfNumber(candidate.articleNumber))) {
      onError(`Tillbehöret med Artikelnummer ${candidate.articleNumber} är redan tillagt.`);
      return;
    }
    setAccessories([...selectedProductAccessories, {
      ...newProductAccessoryDraft(), name: candidate.subtitle || candidate.productName,
      productNumber: candidate.articleNumber,
      ...amount,
      notes: `${accessoryComponent ? `Kravdel: ${accessoryComponent.label}. ` : ""}Valt från leverantören: ${candidate.productUrl}`
    }]);
    setAccessoryStepOpen(true);
    setAccessoryLookupOpen(false);
    setHasUnapprovedChanges(true);
    setDraftNotice(`Tillbehöret med Artikelnummer ${candidate.articleNumber} har lagts till för kontroll.`);
    onError("");
    window.requestAnimationFrame(() => document.getElementById(`accessory-${requirement.id}-${selectedProductAccessories.length}-quantity`)?.focus());
  }

  function addManualAccessory() {
    if (!productNumber.trim() || selectedProductAccessories.length >= 20) return;
    const nextIndex = selectedProductAccessories.length;
    setAccessories([...selectedProductAccessories, { ...newProductAccessoryDraft(), ...(assemblyPlan?.kind === "pipe" ? { quantity: "" } : {}) }]);
    setAccessoryStepOpen(true);
    setAccessoryLookupOpen(false);
    setHasUnapprovedChanges(true);
    onError("");
    window.requestAnimationFrame(() => {
      document.getElementById(`product-accessories-${requirement.id}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      document.getElementById(`accessory-name-${requirement.id}-${nextIndex}`)?.focus();
    });
  }

  function updateAccessory(index: number, key: keyof ProductAccessoryDraft, value: string) {
    setAccessories((current) => current.map((accessory, itemIndex) =>
      itemIndex === index ? { ...accessory, [key]: value } : accessory
    ));
    setHasUnapprovedChanges(true);
    onError("");
  }

  function removeAccessory(index: number) {
    const next = accessories.filter((_, itemIndex) => itemIndex !== index);
    setAccessories(next);
    setHasUnapprovedChanges(true);
    onError("");
  }

  function openAttachmentPanel() {
    setAttachmentExpanded(true);
    setAttachmentMessage(null);
    window.requestAnimationFrame(() => {
      document.getElementById(`attachment-comment-${requirement.id}`)?.focus();
    });
  }

  function closeAttachmentPanel() {
    if (!attachmentSaving) setAttachmentExpanded(false);
  }

  async function save(nextChoices = choices) {
    if (saving || requirement.can_edit === false) return;
    const removingSelection = Boolean(assignment) && nextChoices.length === 0;
    for (const choice of nextChoices) {
      if (choice.quantity.quantity.trim() && !parseProductOrderQuantity(choice.quantity)) {
        onError(`Angi gyldig mengde og enhet for ${choice.product.productName}.`); return;
      }
      if (choice.manual) {
        const validation = validateManualDistributorProduct(choice.product, defaultCurrency);
        if ("error" in validation) { openManualProductCard(choice.id); setManualProductError(validation.error); return; }
      }
    }
    if (commentDraftDirty || commentsSaving) {
      onError("Spara kommentarerna eller töm kommentarsfälten före godkännandet.");
      return;
    }
    if (manualProductDraftDirty) {
      setManualProductOpen(true);
      setManualProductError("Lägg till produkten från kortet innan du godkänner och sparar.");
      return;
    }
    if (hasAttachmentDraft) {
      setManualProductOpen(true);
      setAttachmentExpanded(true);
      setAttachmentError("Spara vedlegget eller töm fälten innan du godkänner produkten.");
      return;
    }
    if (accessoryError) {
      setAccessoryStepOpen(true);
      onError(accessoryError);
      return;
    }
    if (!nextChoices.length && !removingSelection) { setChoices([]); setHasUnapprovedChanges(false); return; }
    setSaving(true);
    onSavingChange(true);
    onError("");
    try {
      if (removingSelection) {
        const response = await fetch(`/api/projects/${projectId}/product-mappings`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requirementId: requirement.id, expectedRevision: requirement.edit_revision })
        });
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        if (!response.ok) throw new Error(payload?.error ?? "Produktvalget kunne ikke fjernes.");
        await onSaved(`Produktvalget og tilbehøret for post ${details.postNumber ?? position} er fjernet. Posten er åpen igjen.`);
        setHasUnapprovedChanges(false);
        return;
      }
      const products = nextChoices.map(choice => ({
        ...choice.product, entryMethod: choice.manual ? "manual" : "catalog", userApproved: true,
        productName: resolveDistributorProductName({ productName: choice.product.productName, productNumber: choice.product.productNumber }),
        notes: productSelectionReviewNotes(choice.review, choice.notes), accessories: productAccessoryPayload(choice.accessories),
        ...(choice.quantity.quantity.trim() ? { orderQuantity: choice.quantity } : {})
      }));
      const response = await fetch(`/api/projects/${projectId}/product-mappings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requirementId: requirement.id, expectedRevision: requirement.edit_revision, requirementRevision: effectiveRequirements(requirement).revision, userApproved: true, products })
      });
      const payload = (await response.json().catch(() => null)) as { error?: string; message?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? "Produktvalet kunde inte sparas.");
      await onSaved(`Produktvalet för post ${details.postNumber ?? position} är godkänt och sparat.`);
      setChoices(nextChoices); activateChoice(nextChoices[0]?.id ?? ""); setHasUnapprovedChanges(false);
    } catch (saveError) {
      onError(saveError instanceof Error ? saveError.message : "Produktvalet kunde inte sparas.");
    } finally {
      setSaving(false);
      onSavingChange(false);
    }
  }

  async function saveAttachment() {
    if (!attachmentFile) {
      setAttachmentError("Välj en fil som ska sparas som vedlegg.");
      return;
    }
    if (attachmentFile.size > 4 * 1024 * 1024) {
      setAttachmentError("Vedlegget får vara högst 4 MB.");
      return;
    }

    const formData = new FormData();
    formData.set("file", attachmentFile);
    formData.set("comment", attachmentComment);
    setAttachmentSaving(true);
    onSavingChange(true);
    setAttachmentError(null);
    setAttachmentMessage(null);
    try {
      const response = await fetch(`/api/projects/${projectId}/requirements/${requirement.id}/attachments`, {
        method: "POST",
        body: formData
      });
      const payload = (await response.json().catch(() => null)) as { attachment?: RequirementAttachment; error?: string } | null;
      if (!response.ok || !payload?.attachment) {
        throw new Error(payload?.error ?? "Vedlegget kunde inte sparas.");
      }
      const savedAttachment = payload.attachment;
      setAttachments((current) => [savedAttachment, ...current.filter((item) => item.id !== savedAttachment.id)]);
      setAttachmentComment("");
      setAttachmentFile(null);
      if (attachmentInputRef.current) attachmentInputRef.current.value = "";
      setAttachmentMessage(`${savedAttachment.fileName} har sparats som vedlegg.`);
    } catch (uploadError) {
      setAttachmentError(uploadError instanceof Error ? uploadError.message : "Vedlegget kunde inte sparas.");
    } finally {
      setAttachmentSaving(false);
      onSavingChange(false);
    }
  }

  async function saveResolution(nextResolution: ProductRequirementResolutionStatus | null) {
    setSaving(true);
    onSavingChange(true);
    onError("");
    try {
      const response = await fetch(`/api/projects/${projectId}/product-resolutions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requirementId: requirement.id, expectedRevision: requirement.edit_revision, resolution: nextResolution })
      });
      const payload = (await response.json().catch(() => null)) as { error?: string; message?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? "Märkningen kunde inte sparas.");
      await onSaved(payload?.message ?? (nextResolution
        ? `Post ${details.postNumber ?? position} är märkt som Inte i sortiment.`
        : `Märkningen för post ${details.postNumber ?? position} har tagits bort.`));
    } catch (resolutionError) {
      onError(resolutionError instanceof Error ? resolutionError.message : "Märkningen kunde inte sparas.");
    } finally {
      setSaving(false);
      onSavingChange(false);
    }
  }

  function markAsNotInAssortment() {
    if ((assignment || hasUnsavedChanges) && !window.confirm("Produkten och osparade ändringar ersätts av märkningen Inte i sortiment. Vill du fortsätta?")) return;
    void saveResolution("not_in_assortment");
  }

  const accessoryTypeSelector = assemblyPlan && assemblyPlan.components.length > 0 ? <div>
      <label htmlFor={"accessory-type-" + requirement.id} className="mb-2 block text-sm font-bold text-neutral-900">Tillbehörstyp</label>
      <select id={"accessory-type-" + requirement.id} value={accessoryComponentId ?? ""} disabled={saving}
        className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-neutral-600 focus:ring-neutral-600"
        onChange={event => openAccessoryLookup(assemblyPlan.components.find(component => component.id === event.target.value))}>
        {assemblyPlan.components.map(component => <option key={component.id} value={component.id}>{component.label}</option>)}
        <option value="">Övriga tillbehör</option>
      </select>
    </div> : null;

  const accessoryLookup = accessoryLookupOpen && productNumber.trim() ? (
    <AccessoryProductPicker key={productNumber + ":" + (accessoryComponentId ?? "manual")} projectId={projectId} requirementId={requirement.id}
      mainArticleNumber={productNumber} component={accessoryComponent} automaticQuery={accessoryQuery} suggestions={suggestedAccessories}
      selections={selectedProductAccessories.map(item => item.productNumber)} disabled={saving} selectionLimitReached={selectedProductAccessories.length >= 20}
      onSelect={candidate => {
        const suggestion = suggestedAccessories.find(item => normalizeNrfNumber(item.articleNumber) === normalizeNrfNumber(candidate.articleNumber));
        applyAhlsellAccessory(candidate, {
          quantity: suggestion && !accessoryComponent?.quantityFromDrawing && !accessoryComponent?.quantityNeedsReview && quantity.quantity !== null ? String(suggestion.quantity * quantity.quantity) : "",
          unit: suggestion?.unit || (accessoryComponent?.kind === "pipe" ? "m" : "st")
        });
      }}
      onDeselect={candidate => removeAccessory(selectedProductAccessories.findIndex(item => normalizeNrfNumber(item.productNumber) === normalizeNrfNumber(candidate.articleNumber)))}>
      {accessoryTypeSelector}
    </AccessoryProductPicker>
  ) : null;

  const accessorySection = productNumber.trim() ? (
    <section id={`accessory-step-${requirement.id}`} tabIndex={-1} aria-labelledby={`accessory-step-title-${requirement.id}`} className="border-t border-neutral-200 bg-white p-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-neutral-600">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h5 id={`accessory-step-title-${requirement.id}`} className="flex items-center gap-2 text-base font-bold text-neutral-950"><PackagePlus className="h-5 w-5" aria-hidden="true" />{`Tilbehør (${selectedProductAccessories.length})`}</h5>
        </div>
        {!accessoryStepOpen && <div className="flex flex-wrap gap-2">
          <Button neutral type="button" variant="secondary" onClick={editAccessories}><Search className="h-4 w-4" aria-hidden="true" />{selectedProductAccessories.length ? "Endre tilbehør" : "Velg tilbehør"}</Button>
          <Button neutral type="button" variant="secondary" onClick={addManualAccessory} disabled={selectedProductAccessories.length >= 20}><Plus className="h-4 w-4" aria-hidden="true" />Legg til manuelt</Button>
        </div>}
      </div>
      {accessoryStepOpen && <div className="mb-4 space-y-4">
        {accessoryLookup ?? accessoryTypeSelector}

        <div className="flex flex-wrap gap-2">
          {!accessoryLookupOpen && <Button neutral type="button" variant="secondary" onClick={() => openAccessoryLookup(accessoryComponent)} disabled={selectedProductAccessories.length >= 20}><Search className="h-4 w-4" aria-hidden="true" />Välj fler tillbehör</Button>}
          <Button neutral type="button" variant="secondary" onClick={addManualAccessory} disabled={selectedProductAccessories.length >= 20}><Plus className="h-4 w-4" aria-hidden="true" />Registrera tillbehör manuellt</Button>
        </div>
      </div>}
      <div id={`accessory-summary-${requirement.id}`} tabIndex={-1} className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-neutral-600">
          {selectedProductAccessories.length > 0 && (
            <section id={`product-accessories-${requirement.id}`} aria-label="Valda tillbehör" className="product-accessories-summary scroll-mt-24 overflow-hidden">
              {accessoryStepOpen && <div className="flex flex-col gap-3 border-b border-neutral-200 bg-neutral-50 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h5 id={`product-accessories-title-${requirement.id}`} className="flex items-center gap-2 text-sm font-bold text-neutral-950"><PackagePlus className="h-4 w-4 text-neutral-800" aria-hidden="true" />Valgte tilbehør ({selectedProductAccessories.length})</h5>
                  <p className="mt-0.5 text-xs leading-5 text-neutral-600">Angi total mengde for hele posten. For eksempel gir 5 T-stykker 5 i Excel.</p>
                </div>
                {accessoryStepOpen && <Button neutral type="button" variant="secondary" className="min-h-9 shrink-0 px-3 py-1.5 text-xs" onClick={addAccessory} disabled={selectedProductAccessories.length >= 20}>
                  <Plus className="h-4 w-4" aria-hidden="true" />Lägg till ett till
                </Button>}
              </div>}
              <div className="space-y-3 p-3">
                {selectedProductAccessories.map((accessory, index) => (
                  <div key={index} className="product-accessory-item space-y-3 p-3">
                    {accessoryStepOpen ? <>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-bold text-neutral-800">Tilbehør {index + 1}</p>
                      <ProductSelectionCheckbox checked disabled={saving} label={accessory.name || `tilbehør ${index + 1}`} onChange={() => removeAccessory(index)} />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                    <AccessoryInput id={`accessory-name-${requirement.id}-${index}`} label="Delprodukt / tillbehör" value={accessory.name} required onChange={(value) => updateAccessory(index, "name", value)} />
                    <AccessoryInput id={`accessory-nrf-${requirement.id}-${index}`} label="Artikelnummer" value={accessory.productNumber} onChange={(value) => updateAccessory(index, "productNumber", value)} />
                    </div>
                    {accessory.quantityBasis === "total" ? <ProductQuantityFields id={`accessory-${requirement.id}-${index}`} quantity={accessory.quantity} unit={accessory.unit} disabled={saving}
                      onQuantityChange={value => updateAccessory(index, "quantity", value)} onUnitChange={value => updateAccessory(index, "unit", value)} /> : <div className="space-y-2">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <AccessoryInput id={`accessory-quantity-${requirement.id}-${index}`} label="Tidligere mengde per postenhet" type="number" min="0.001" max="100000" step="0.001" value={accessory.quantity} onChange={value => updateAccessory(index, "quantity", value)} />
                        <AccessoryInput id={`accessory-unit-${requirement.id}-${index}`} label="Enhet" value={accessory.unit} onChange={value => updateAccessory(index, "unit", value)} />
                      </div>
                      <button type="button" disabled={saving} className="text-xs font-bold text-neutral-800 underline" onClick={() => {
                        setAccessories(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, quantityBasis: "total", quantity: quantity.quantity === null ? "" : String(Number(item.quantity) * quantity.quantity) } : item));
                        setHasUnapprovedChanges(true);
                      }}>Endre til total mengde for posten</button>
                    </div>}
                    </> : <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-sm font-bold text-neutral-950">{accessory.name}</p>
                        {accessory.productNumber && <p className="mt-1 text-xs font-semibold text-neutral-800">NRF {accessory.productNumber}</p>}
                      </div>
                      <p className="text-sm font-semibold text-neutral-800">{accessory.quantityBasis === "total" ? accessory.quantity : quantity.quantity === null ? "Mängd behöver kontrolleras" : String(Number(accessory.quantity) * quantity.quantity)} {accessory.unit}</p>
                    </div>}
                  </div>
                ))}
                {accessoryError && <p role="alert" className="rounded-md border border-neutral-300 bg-neutral-50 px-3 py-2 text-xs font-semibold text-neutral-900">{accessoryError}</p>}
              </div>
            </section>
          )}


        {!selectedProductAccessories.length && <p className="text-sm text-neutral-600">Inga tillbehör valda.</p>}
      </div>
      {accessoryStepOpen && <Button neutral type="button" className="mt-4 w-full justify-center sm:w-auto" disabled={Boolean(accessoryError)} onClick={finishAccessories}><CheckCircle2 className="h-4 w-4" aria-hidden="true" />Klar med tillbehör</Button>}
    </section>
  ) : null;

  const attachmentSection = (
    <section className="manual-product-card-section" aria-labelledby={`attachment-title-${requirement.id}`}>
      <div className="manual-product-section-heading">
        <h3 id={`attachment-title-${requirement.id}`}><Paperclip className="h-5 w-5" aria-hidden="true" />Vedlegg <span>(valgfritt)</span></h3>
        <Button type="button" variant="secondary" aria-expanded={attachmentExpanded} aria-controls={`attachment-panel-${requirement.id}`}
          disabled={attachmentSaving} onClick={attachmentExpanded ? closeAttachmentPanel : openAttachmentPanel}>
          <Paperclip className="h-4 w-4" aria-hidden="true" />{attachmentExpanded ? "Skjul vedlegg" : "Legg til vedlegg"}
        </Button>
      </div>
      <p className="manual-product-empty">Legg til for eksempel et datablad eller tilbud. Vedlegg lagres på PDF-posten når du trykker «Lagre vedlegg».</p>
      <div id={`attachment-panel-${requirement.id}`} hidden={!attachmentExpanded} className="space-y-4">
        <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void saveAttachment(); }}>
          <label className="block" htmlFor={`attachment-comment-${requirement.id}`}>
            <span className="mb-1 flex items-center justify-between gap-3 text-xs font-semibold text-neutral-600"><span>Kommentar <span className="font-normal text-neutral-500">(valgfritt)</span></span><span>{attachmentComment.length}/2000</span></span>
            <textarea id={`attachment-comment-${requirement.id}`} rows={3} maxLength={2000} value={attachmentComment} onChange={(event) => { setAttachmentComment(event.target.value); setAttachmentError(null); setAttachmentMessage(null); }} className="block w-full resize-y rounded-sm border-neutral-300 bg-white text-sm text-neutral-900 shadow-none focus:border-neutral-500 focus:ring-neutral-500" />
          </label>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <label className="block" htmlFor={`attachment-file-${requirement.id}`}>
              <span className="mb-1 block text-xs font-semibold text-neutral-600">Fil</span>
              <input ref={attachmentInputRef} id={`attachment-file-${requirement.id}`} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.csv,.txt" onChange={(event) => { setAttachmentFile(event.target.files?.[0] ?? null); setAttachmentError(null); setAttachmentMessage(null); }} className="block min-h-10 w-full rounded-sm border border-neutral-300 bg-white text-sm text-neutral-800 file:mr-3 file:min-h-10 file:border-0 file:border-r file:border-neutral-200 file:bg-neutral-50 file:px-3 file:text-xs file:font-bold file:text-neutral-800 hover:file:bg-neutral-50" />
            </label>
            <div className="flex flex-wrap gap-2">
              <Button neutral type="button" variant="secondary" className="min-h-10 justify-center px-3 py-2 text-sm" disabled={attachmentSaving || !hasAttachmentDraft} onClick={() => { setAttachmentComment(""); setAttachmentFile(null); setAttachmentError(null); setAttachmentMessage(null); if (attachmentInputRef.current) attachmentInputRef.current.value = ""; }}>

                Tøm
              </Button>
              <Button neutral type="submit" className="min-h-10 justify-center px-4 py-2 text-sm" disabled={attachmentSaving || !attachmentFile}>
                {attachmentSaving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Upload className="h-4 w-4" aria-hidden="true" />}
                {attachmentSaving ? "Sparar…" : "Lagre vedlegg"}
              </Button>
            </div>
          </div>
          {attachmentFile && <p className="break-words text-xs text-neutral-700">Valgt fil: {attachmentFile.name}</p>}
          <p className="text-xs text-neutral-500">Max 4 MB. Tillatte format: PDF, PNG, JPG, WebP, TXT og CSV.</p>
          {attachmentError && <p role="alert" className="rounded-md border border-neutral-300 bg-neutral-50 px-3 py-2 text-xs font-semibold text-neutral-900">{attachmentError}</p>}
          {attachmentMessage && <p role="status" className="rounded-md border border-neutral-300 bg-neutral-50 px-3 py-2 text-xs font-semibold text-neutral-900">{attachmentMessage}</p>}
        </form>

        <div className="border-t border-neutral-200 pt-4">
          <h5 className="text-xs font-bold uppercase tracking-[0.08em] text-neutral-600">Lagrede vedlegg{attachments.length > 0 ? ` · ${attachments.length}` : ""}</h5>
          {attachmentsLoading ? (
            <p className="mt-2 flex items-center gap-2 text-xs font-semibold text-neutral-600"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Henter vedlegg…</p>
          ) : attachments.length === 0 ? (
            <p className="mt-2 text-xs text-neutral-600">Ingen vedlegg er lagret for posten.</p>
          ) : (
            <div className="mt-2 divide-y divide-neutral-200 overflow-hidden rounded-md border border-neutral-200 bg-white">
              {attachments.map((attachment) => (
                <article key={attachment.id} className="flex items-start gap-3 p-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-neutral-50 text-neutral-800"><FileText className="h-4 w-4" aria-hidden="true" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-sm font-bold text-neutral-950">{attachment.fileName}</p>
                    <p className="mt-0.5 text-xs text-neutral-500">{formatAttachmentSize(attachment.sizeBytes)} · {formatAttachmentDate(attachment.uploadedAt)}</p>
                    {attachment.comment && <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-neutral-700">{attachment.comment}</p>}
                  </div>
                  <a href={attachment.downloadUrl} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-neutral-200 bg-white text-neutral-800 hover:border-neutral-400 hover:bg-neutral-50" aria-label={`Hent ${attachment.fileName}`} title="Hent vedlegg"><Download className="h-4 w-4" aria-hidden="true" /></a>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );

  return (
    <ProductPostComments projectId={projectId} requirementId={requirement.id} productNumber={productNumber} productName={productName}
      disabled={requirement.can_edit === false || saving || attachmentSaving} onDirtyChange={setCommentDraftDirty} onSavingChange={setCommentsSaving}>
      {({ postComments, productComments }) => <>
      {requirement.can_edit === false && <p className="product-readonly-notice">Läsläge: posten är tilldelad en annan person. Projektansvarig kan ändra tilldelningen.</p>}
      <article id={`post-${requirement.id}`} className="product-mapping-card">
      <section id={`pdf-requirement-${requirement.id}`} tabIndex={-1} aria-labelledby={`pdf-specification-${requirement.id}`} className="product-requirement-summary">
        <div className="product-panel-caption"><h3 id={`pdf-specification-${requirement.id}`}>Krav fra PDF</h3><span>{projectRequirementPageLabel(details)}</span></div>
        <div className="product-requirement-content">
          <h3 className="chapter-active-post-title">{details.postNumber} {String(requirement.value_text ?? "Produktpost")}</h3>
          <ProjectPostSpecification id={requirement.id} details={details} section="detail" description={String(record(requirement.value_json).description ?? requirement.value_text ?? "")} quantity={quantity} sourcePdfHref={sourcePdfHref} sourcePdfFileName={sourcePdfFileName} pdfArticleNumber={pdfArticleNumber} />
          <section className="chapter-active-selection" aria-label="Vald produkt">
            <h3>Vald produkt</h3>
            {!choices.length && <p>Ingen produkt vald</p>}
            {choices.map(choice => <div key={choice.id}><strong>{choice.product.productName}</strong><p>Art. {choice.product.productNumber}</p>
              <div className="chapter-selection-actions"><Button variant="secondary" disabled={saving || requirement.can_edit === false} onClick={() => document.getElementById(`ahlsell-products-${requirement.id}`)?.scrollIntoView({ block: "start", behavior: "smooth" })}>Byt produkt</Button>
              <Button variant="secondary" disabled={saving || requirement.can_edit === false} onClick={() => removeProduct(choice.id)}>Ta bort produkt</Button></div></div>)}
            {hasUnapprovedChanges && <p role="status">Ändringar är inte sparade.</p>}
          </section>
          {dataWarnings.length > 0 && (isApproved ? (
            <details className="mt-4 rounded-md border border-neutral-200 bg-white p-3">
              <summary className="cursor-pointer text-sm font-bold text-neutral-800">Lagrede merknader til PDF-grunnlaget</summary>
              <ul className="mt-2 list-disc space-y-2 pl-4 text-xs text-neutral-700">{dataWarnings.map(warning => <li key={warning.code}>{warning.message}</li>)}</ul>
            </details>
          ) : (
            <div className="mt-4 space-y-2" role="alert">
              {dataWarnings.map((warning) => (
                <div key={warning.code} className="flex items-start gap-2 rounded-md border border-neutral-300 bg-neutral-50 px-3 py-2.5 text-neutral-950">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-neutral-700" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-black">{warning.label}</p>
                    <p className="mt-0.5 text-xs font-semibold leading-5">{warning.message}</p>
                  </div>
                </div>
              ))}
            </div>
          ))}


          <div className="product-post-extras">
          <details>
            <summary>Kommentarer til posten</summary>
            <div id={`post-comments-${requirement.id}`} className="mt-3 scroll-mt-28">{postComments}</div>
          </details>
          </div>
        </div>
      </section>

      {relatedPosts}
      <fieldset disabled={requirement.can_edit === false} className="contents">
      <fieldset disabled={saving || attachmentSaving || commentsSaving} aria-busy={saving || attachmentSaving || commentsSaving} className="product-mapping-fields">
        <div id={`product-selection-header-${requirement.id}`} className="product-action-bar">
          <nav id={`product-post-actions-${requirement.id}`} aria-label="Handlinger for produktposten" className="product-post-actions">
            <Button neutral id={`manual-product-trigger-${requirement.id}`} type="button" variant="secondary" className="min-h-9 px-3 py-1.5 text-xs" aria-haspopup="dialog" aria-expanded={manualProductOpen} aria-controls={`manual-product-card-${requirement.id}`} disabled={choices.length >= 20} onClick={() => openManualProductCard()}>
              <Plus className="h-4 w-4" aria-hidden="true" />Legg til produkt
            </Button>
            {!resolution && (
              <Button neutral type="button" variant="secondary" className="min-h-9 px-3 py-1.5 text-xs" onClick={markAsNotInAssortment}>
                <Tag className="h-4 w-4" aria-hidden="true" />Ikke i sortiment
              </Button>
            )}
            <a href={productPostMailHref} className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-bold text-neutral-800 transition hover:border-neutral-300 hover:bg-neutral-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-600">
              <Mail className="h-4 w-4" aria-hidden="true" />Send e-post om post
            </a>
            {sourcePdfHref && (
              <a href={sourcePdfHref} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-bold text-neutral-800 transition hover:border-neutral-300 hover:bg-neutral-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-600">
                <FileText className="h-4 w-4" aria-hidden="true" />

                Åpne PDF{details.sourcePage ? ` · sida ${details.sourcePage}` : ""}
              </a>
            )}
            <a href="https://www.ahlsell.no/" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-bold text-neutral-800 transition hover:border-neutral-300 hover:bg-neutral-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-600">
              <ExternalLink className="h-4 w-4" aria-hidden="true" />Leverandørens nettside
            </a>
          </nav>
        </div>

          {manualProductOpen && <ManualProductCard projectId={projectId} requirementId={requirement.id} postNumber={details.postNumber}
            initial={choices.find(choice => choice.id === manualEditingId) ?? emptyChoice()}
            initialError={manualProductError} attachments={attachmentSection} attachmentSaving={attachmentSaving} hasAttachmentDraft={hasAttachmentDraft}
            onApply={applyManualProduct} onCancel={closeManualProductCard} onDirtyChange={setManualProductDraftDirty} />}

          <div id={`ahlsell-products-${requirement.id}`} className={`product-catalog-panel${productNumber.trim() ? " product-selected-panel" : ""}`}>
            <h3 className="product-panel-caption">Produktförslag<span>Post {details.postNumber ?? position}</span></h3>
            <div className="product-catalog-scroll">
            <details open className="product-catalog-search">
              <summary>Søk etter produkt eller lim inn produktlenke</summary>
              <AhlsellProductLookup key={choices.map(choice => choice.product.productNumber).join(":")} selectionLimitReached={choices.length >= 20}
                projectId={projectId} requirementId={requirement.id} id={`product-search-${requirement.id}`}
                disabled={saving || attachmentSaving || commentsSaving || requirement.can_edit === false}
                defaultQuantity={String(quantity.quantity ?? "")}
                defaultUnit={quantity.unit || "st"}
                selections={choices.map(choice => ({ productNumber: choice.product.productNumber, ...choice.quantity }))}
                onSelect={(candidate, amount) => applyAhlsellCandidate(candidate, candidate.subtitle ?? candidate.description ?? "", amount)}
                onDeselect={candidate => { const choice = choices.find(item => normalizeNrfNumber(item.product.productNumber) === normalizeNrfNumber(candidate.articleNumber)); if (choice) removeProduct(choice.id); }}
                onQuantityChange={(candidate, amount) => { const choice = choices.find(item => normalizeNrfNumber(item.product.productNumber) === normalizeNrfNumber(candidate.articleNumber)); if (choice) updateChoice(choice.id, item => ({ ...item, quantity: amount })); }} />
            </details>
            <AhlsellPublicMatchPanel
              resource={resource}
              projectId={projectId}
              requirementId={requirement.id}
              requirementRevision={effectiveRequirements(requirement).revision}
              guide={ahlsellGuide}
              onCatalogResult={onCatalogResult}
              disabled={saving}
              selectedArticleNumber={productNumber}
              memories={memories}
              memoriesAreExact={dataWarnings.length === 0 && !assemblyPlan}
              pipeMainProduct={ahlsellRequirementIntent(requirement) === "pipe"}
              onClearSelection={clearSelectedProduct}
              onUseCandidate={applyAhlsellCandidate}
              onUseMemory={applyMemory}
              renderSelected={candidateFor => (
                <div className="product-linked-content">
                <p role="status" aria-live="polite" className="sr-only">{hasUnapprovedChanges ? draftNotice : ""}</p>
                {choices.map((choice, index) => <section key={choice.id} id={`selected-pipe-${requirement.id}-${choice.id}`} tabIndex={-1} aria-label={`Valgt produkt ${index + 1}: ${choice.product.productName}`} className="product-selected-item">
                  <div className="product-selected-summary">
                    <div className="product-selected-description">
                      <div className="product-selected-heading"><a href={`https://www.ahlsell.no/productVariantProxy/${encodeURIComponent(choice.product.productNumber)}`} target="_blank" rel="noreferrer" className="underline">Art. {choice.product.productNumber}</a>
                        <ProductSelectionCheckbox checked approved={isApproved} disabled={saving || commentDraftDirty} label={choice.product.productName} onChange={() => removeProduct(choice.id)} /></div>
                      <h4>{choice.product.productName || "Produkt"}</h4>
                      {choice.product.productSubtitle && choice.product.productSubtitle !== choice.product.productName && <p>{choice.product.productSubtitle}</p>}
                    </div>
                    <ProductQuantityFields id={`selected-product-${requirement.id}-${choice.id}`} quantity={choice.quantity.quantity} unit={choice.quantity.unit} disabled={saving}
                      onQuantityChange={value => updateChoice(choice.id, item => ({ ...item, quantity: { ...item.quantity, quantity: value } }))}
                      onUnitChange={value => updateChoice(choice.id, item => ({ ...item, quantity: { ...item.quantity, unit: value } }))} />
                    <Button neutral type="button" variant="secondary" onClick={() => openManualProductCard(choice.id)}>Endre produkt og tilbehør</Button>
                  </div>
                  {(choice.product.manufacturerArticleNumber || choice.product.deliveryTimeDays || choice.product.unitPrice) && <dl className="product-requirement-facts">
                    {choice.product.manufacturerArticleNumber && <div><dt>Artikkelnummer</dt><dd>{choice.product.manufacturerArticleNumber}</dd></div>}
                    {choice.product.deliveryTimeDays && <div><dt>Leveringstid</dt><dd>{choice.product.deliveryTimeDays} dager</dd></div>}
                    {choice.product.unitPrice && <div><dt>Pris</dt><dd>{formatUnitPrice(choice.product.unitPrice, choice.product.currency)}</dd></div>}
                  </dl>}
                  <div className="product-selected-assessment"><TechnicalEvaluationDetails evaluation={candidateFor(choice.product.productNumber)?.technicalEvaluation} searchScore={candidateFor(choice.product.productNumber)?.searchScore} /></div>
                  {choice.review?.status === "mismatch" && <details className="p-3 text-sm"><summary>Avvikelser mot postens krav</summary><ul>{choice.review.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul></details>}
                  {choice.id === activeChoice.id ? accessorySection : <div className="border-t border-neutral-200 bg-white p-4">
                    <h5 className="mb-3 font-bold">Tilbehør ({choice.accessories.length})</h5>
                    {choice.accessories.map((accessory, accessoryIndex) => <p key={accessoryIndex} className="mb-2 text-sm">{accessory.name} · {accessory.quantityBasis === "total" ? accessory.quantity : quantity.quantity === null ? "Kontroller mengde" : Number(accessory.quantity) * quantity.quantity} {accessory.unit}</p>)}
                    <Button neutral variant="secondary" disabled={commentDraftDirty} onClick={() => { activateChoice(choice.id); setAccessoryStepOpen(true); setAccessoryLookupOpen(true); }}>Velg eller legg til tilbehør</Button>
                  </div>}
                </section>)}
                <Button neutral type="button" variant="secondary" disabled={choices.length >= 20} onClick={() => openManualProductCard()}><Plus className="h-4 w-4" aria-hidden="true" />Legg til produkt</Button>

                {productNumber.trim() && commentDraftDirty && <p className="text-xs font-semibold text-neutral-900">Spara kommentarerna eller töm kommentarsfälten före godkännandet.</p>}
                <details>
                  <summary className="cursor-pointer text-sm font-semibold">Produktkommentarer · Art. {productNumber}</summary>
                  <div id={`product-comments-${requirement.id}`} className="mt-3 scroll-mt-28">
                    {choices.length > 1 && <label className="mb-3 block text-sm">Velg produkt
                      <select className="mt-1 block w-full rounded border-neutral-300 text-sm" value={activeChoice.id} disabled={commentDraftDirty} onChange={event => activateChoice(event.target.value)}>
                        {choices.map(choice => <option key={choice.id} value={choice.id}>{choice.product.productName} · {choice.product.productNumber}</option>)}
                      </select>
                    </label>}{productComments}</div>
                </details>

                </div>
              )}
            />
            </div>
          </div>

        <div className="product-save-footer">
          <span role="status" className="text-sm text-neutral-600">{clearingSavedSelection ? "Produkt og tilbehør fjernes når du lagrer" : isApproved ? "Produktvalget er lagret" : productNumber.trim() ? `${choices.length} produkter valgt · ikke lagret` : "Velg et produkt for å lagre posten"}</span>
          {hasUnsavedChanges && <Button type="button" onClick={() => void save()}
            disabled={(!productNumber.trim() && !clearingSavedSelection) || (isApproved && !hasUnsavedChanges) || saving || attachmentSaving || commentsSaving || commentDraftDirty || manualProductDraftDirty || hasAttachmentDraft || Boolean(accessoryError)}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ShieldCheck className="h-4 w-4" aria-hidden="true" />}
            {saving ? "Lagrer…" : clearingSavedSelection ? "Lagre uten produkt" : isApproved && !hasUnsavedChanges ? "Produktvalg lagret" : "Lagre produktvalg"}
          </Button>}
        </div>

      </fieldset>
    </fieldset></article></>}
    </ProductPostComments>
  );
}

function AhlsellPublicMatchPanel({ resource, projectId, requirementId, requirementRevision, guide, disabled, selectedArticleNumber, memories, memoriesAreExact, pipeMainProduct, onCatalogResult, onClearSelection, onUseCandidate, onUseMemory, renderSelected }: {
  resource: ProductWorkspaceResource;
  projectId: string;
  requirementId: string;
  requirementRevision: string;
  guide: AhlsellRequirementGuide;
  disabled: boolean;
  selectedArticleNumber: string;
  memories: Row[];
  memoriesAreExact: boolean;
  pipeMainProduct: boolean;
  onCatalogResult: (requirementId: string, status: AhlsellCatalogMatchStatus) => void;
  onClearSelection: () => void;
  onUseCandidate: (candidate: AhlsellPublicCandidate, productSubtitle?: string) => void;
  renderSelected: (candidateFor: (number: string) => AhlsellPublicCandidate | undefined) => ReactNode;
  onUseMemory: (memory: Row, resolved?: { productName?: string; productSubtitle?: string; candidate?: AhlsellPublicCandidate }) => void;
}) {
  const [catalogResult, setCatalogResult] = useState<AhlsellCatalogResult | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [catalogAttempt, setCatalogAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    resource.load<AhlsellCatalogResult & { effectiveRequirements?: { revision: string } }>(`/api/projects/${projectId}/requirements/${requirementId}/ahlsell-candidates`, requirementRevision)
      .then(payload => {
        if (!current) return;
        if (payload.effectiveRequirements?.revision !== requirementRevision) throw new Error("Kravgrunnlaget er endret. Last inn prosjektet på nytt.");
        setCatalogResult(payload);
        const status = ahlsellCatalogStatusFromPayload(payload);
        if (status) onCatalogResult(requirementId, status);
      }).catch(error => { if (current) setCatalogError(error instanceof Error ? error.message : "Produktsøket mislyktes."); })
      .finally(() => { if (current) setLoadingCatalog(false); });
    return () => { current = false; };
  }, [resource, onCatalogResult, projectId, requirementId, requirementRevision, catalogAttempt]);

  const usableMemoriesByArticle = new Map<string, Row>();
  for (const memory of memories) {
    const productName = String(memory.product_name ?? "").trim();
    if (pipeMainProduct && !isRigidPipeProduct(productName)) continue;
    const articleNumber = normalizeNrfNumber(String(memory.product_number ?? ""));
    if (productName && articleNumber && !usableMemoriesByArticle.has(articleNumber)) {
      usableMemoriesByArticle.set(articleNumber, memory);
    }
  }
  const usableMemories = [...usableMemoriesByArticle.values()];
  const memoryArticleNumbers = new Set(usableMemories.map((memory) =>
    normalizeNrfNumber(String(memory.product_number))
  ));
  // Server results already contain the combined assessment. Re-merging the
  // initial guide would restore missing-value warnings resolved by Ahlsell.
  const currentCandidates = catalogResult?.candidates.filter(candidate => candidate.technicalEvaluation?.requirementRevision === requirementRevision);
  const mergedCandidates = (currentCandidates ?? guide.directCandidates)
    .filter(candidate => !pipeMainProduct || isRigidPipeProduct(candidate.productName));
  const candidatesByArticle = new Map(mergedCandidates.map((candidate) => [
    normalizeNrfNumber(candidate.articleNumber),
    candidate
  ]));
  const candidates = orderAhlsellCandidatesForDisplay(mergedCandidates)
    .filter((candidate) => !memoryArticleNumbers.has(normalizeNrfNumber(candidate.articleNumber)));
  const filteredCandidates = candidates;
  const filteredMemories = usableMemories;
  function selectCandidate(candidate: AhlsellPublicCandidate) {
    if (normalizeNrfNumber(candidate.articleNumber) === normalizeNrfNumber(selectedArticleNumber)) {
      onClearSelection();
      return;
    }
    onUseCandidate(
      candidate,
      candidate.description ?? ""
    );
  }

  // Keep the catalog mounted so clearing a choice restores the current results.

  return (
    <section aria-label="Produkter">
      {selectedArticleNumber.trim() && <details className="chapter-selected-details"><summary>Vald produkt: mängd, tillbehör och kommentarer</summary>{renderSelected(number => candidatesByArticle.get(normalizeNrfNumber(number)))}</details>}
      {loadingCatalog && (
        <div className="flex min-h-16 items-center justify-center gap-2 border-t border-neutral-200 bg-neutral-50 px-3 py-3 text-sm font-bold text-neutral-800" role="status">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Søker automatisk på leverandørens nettsted…
        </div>
      )}

      {catalogError && (
        <div className="border-t border-neutral-300 bg-neutral-50 px-3 py-3 text-xs leading-5 text-neutral-950 sm:px-4" role="alert">
          <p className="font-bold">Produktlisten kunne ikke hentes.</p>
          <p>{catalogError}  Du kan søke manuelt via ”Legg til produkt”.</p>
          <Button variant="secondary" onClick={() => { resource.invalidate(`/api/projects/${projectId}/requirements/${requirementId}/ahlsell-candidates`); setCatalogError(null); setLoadingCatalog(true); setCatalogAttempt(value => value + 1); }}>Försök igen</Button>
        </div>
      )}

      {!loadingCatalog && catalogResult?.publicSearchStatus && catalogResult.publicSearchStatus !== "available" && (
        <div className="border-t border-neutral-300 bg-neutral-50 px-3 py-2 text-xs leading-5 text-neutral-950 sm:px-4" role="status">
          {catalogResult.publicSearchStatus === "unavailable"
            ? "Søket kunne ikke fullføres. Tilgjengelige produktforslag vises."
            : "En del av produktsøket kunne ikke fullføres. Tilgjengelige produktforslag vises."}
        </div>
      )}

      {!loadingCatalog && !catalogError && catalogResult?.truncated && (
        <div className="border-t border-neutral-300 bg-neutral-50 px-3 py-2 text-xs font-semibold leading-5 text-neutral-950 sm:px-4">

          Flere treff finnes hos leverandøren. Listen inneholder alle samsvarende produkter fra den avgrensede søket.
        </div>
      )}

      {filteredMemories.length > 0 && (
        <div className="border-t border-neutral-300" role="group" aria-label="Produktforslag">
          <div className={memoriesAreExact ? "bg-neutral-100/80 px-3 py-2 sm:px-4" : "bg-neutral-50 px-3 py-2 sm:px-4"}>
            <p className={memoriesAreExact ? "flex items-center gap-1.5 text-xs font-bold text-neutral-900" : "flex items-center gap-1.5 text-xs font-bold text-neutral-900"}>
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
              Må kontrolleres mot dagens krav
            </p>
            <p className="mt-0.5 text-xs text-neutral-600">Valget må godkjennes i dette prosjekt.</p>
          </div>
          <div className="divide-y divide-neutral-200">
            {filteredMemories.map((memory) => {
              const articleNumber = String(memory.product_number);
              const productName = String(memory.product_name);
              const candidate = candidatesByArticle.get(normalizeNrfNumber(articleNumber));
              const resolvedSubtitle = candidate?.description ?? "";
              const productSubtitle = resolvedSubtitle;
              const isSelected = normalizeNrfNumber(articleNumber) === normalizeNrfNumber(selectedArticleNumber);
              return (
                <article key={String(memory.id)} className={memoriesAreExact ? "bg-neutral-50 px-3 py-3 sm:px-4" : "bg-neutral-50/50 px-3 py-3 sm:px-4"}>
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold leading-5 text-neutral-950">{productName}</p>
                      {productSubtitle && (
                        <p className="mt-0.5 line-clamp-2 break-words text-xs leading-5 text-neutral-700" title={productSubtitle}>{productSubtitle}</p>
                      )}
                      <p className="mt-0.5 text-xs font-bold text-neutral-800">Artikelnummer {articleNumber}</p>
                      <p className={memoriesAreExact ? "mt-1 flex items-center gap-1.5 text-xs font-bold text-neutral-800" : "mt-1 flex items-center gap-1.5 text-xs font-bold text-neutral-900"}>
                        <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                        Tidligere bekreftet · dagens tekniske kontroll gjelder
                      </p>
                      <TechnicalEvaluationDetails evaluation={candidate?.technicalEvaluation} searchScore={candidate?.searchScore} />
                    </div>
                    <label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs font-bold text-neutral-800">
                      <input
                        type="checkbox"
                        name={`ahlsell-product-${requirementId}`}
                        value={articleNumber}
                        checked={isSelected}
                        disabled={disabled}
                        onChange={() => isSelected ? onClearSelection() : onUseMemory(memory, {
                          productName: candidate?.productName || productName,
                          productSubtitle: resolvedSubtitle,
                          candidate
                        })}
                        aria-label={`${isSelected ? "Fjern valget av" : "Velg"} tidligere bekreftet produkt ${productName}, Artikelnummer ${articleNumber}`}
                        className="h-5 w-5 shrink-0 cursor-pointer rounded border-neutral-300 text-neutral-700 focus:ring-neutral-600 disabled:cursor-not-allowed"
                      />
                      <span aria-hidden="true">{isSelected ? "Fjern valg" : "Velg"}</span>
                    </label>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      )}

      <AhlsellCandidateList
        compact
        expandedMatches
        candidates={filteredCandidates}
        requirementId={requirementId}
        selectedArticleNumber={selectedArticleNumber}
        disabled={disabled}
        allowMatches={memoriesAreExact}
        accessoryRequirements={guide.accessoryRequirements}
        showNoMatch={!loadingCatalog && !catalogError && filteredMemories.length === 0}
        onSelect={selectCandidate}
      />

    </section>
  );
}

function buildProductPostMailHref({ postNumber, productRequirement, quantity, nsCode, system, attributes, sourceExcerpt }: {
  postNumber: string;
  productRequirement: string;
  quantity: string;
  nsCode?: string | null;
  system?: string | null;
  attributes: Array<[string, string]>;
  sourceExcerpt?: string | null;
}) {
  const technicalDetails = attributes
    .slice(0, 12)
    .map(([key, value]) => `${specificationLabel(key)}: ${value}`)
    .join("\n");
  const body = [
    "Hej,",
    "",
    "Vi trenger hjelp med følgende produktpost:",
    `PDF-post: ${postNumber}`,
    nsCode ? `NS-kode: ${nsCode}` : null,
    system ? `System: ${system}` : null,
    `Produktkrav: ${productRequirement}`,
    `Antall: ${quantity}`,
    technicalDetails || null,
    sourceExcerpt ? `
Originaltext fra PDF:
${sourceExcerpt.slice(0, 1200)}` : null,
    "",
    "Vennligst kom tilbake med egnet produkt og Artikelnummer."
  ].filter((line): line is string => line !== null).join("\n");

  return `mailto:?subject=${encodeURIComponent(`Produktspørsmål – PDF-post ${postNumber}`)}&body=${encodeURIComponent(body)}`;
}

function AccessoryInput({ id, label, value, onChange, type = "text", min, max, step, required = false }: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  min?: string;
  max?: string;
  step?: string;
  required?: boolean;
}) {
  return (
    <label className="block" htmlFor={id}>
      <span className="mb-1 block text-xs font-semibold text-neutral-600">{label}{required && <span className="ml-1 font-black text-neutral-600">*</span>}</span>
      <input id={id} type={type} min={min} max={max} step={step} required={required} value={value} onChange={(event) => onChange(event.target.value)} className="block h-10 w-full rounded-sm border-neutral-300 bg-white text-sm text-neutral-900 shadow-none focus:border-neutral-500 focus:ring-neutral-500" />
    </label>
  );
}

function normalizeCurrencyCode(value: string) {
  const normalized = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(normalized) ? normalized : "";
}

function formatUnitPrice(value: string, currency: string) {
  const amount = Number(value.replace(/[\s ]/g, "").replace(",", "."));
  const currencyCode = normalizeCurrencyCode(currency) || "NOK";
  if (!Number.isFinite(amount)) return `${value} ${currencyCode}`.trim();
  try {
    return new Intl.NumberFormat("nb-NO", {
      style: "currency",
      currency: currencyCode,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currencyCode}`;
  }
}

function formatAttachmentSize(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "Ukjent størrelse";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} kB`;
  return `${(value / (1024 * 1024)).toLocaleString("nb-NO", { maximumFractionDigits: 1 })} MB`;
}

function formatAttachmentDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Ukjent dato";
  return new Intl.DateTimeFormat("nb-NO", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
