"use client";



import { type ComponentProps, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Download, ExternalLink, FileText, Loader2, Mail, PackagePlus, Paperclip, Plus, Search, ShieldCheck, Tag, Upload, X } from "lucide-react";
import { ProjectPostSpecification } from "@/components/ProjectPostSpecification";
import { ProductPostNavigation } from "@/components/ProductPostNavigation";
import { Button } from "@/components/Button";
import { ManualProductCard, type ManualProductChoice } from "@/components/ManualProductCard";
import { ProductSelectionCheckbox } from "@/components/ProductSelectionCheckbox";
import { ProductQuantityFields } from "@/components/ProductQuantityFields";
import { parseProductOrderQuantity } from "@/lib/product-order-quantity";
import { productPostNavigationGroups, productPostExpansionKeys } from "@/lib/product-post-tree";
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
  isProductRequirementResolvedWithoutProduct,
  productRequirementResolution,
  type ProductRequirementResolutionStatus
} from "@/lib/product-requirement-resolution";
import { formatProjectQuantity, projectRequirementQuantity } from "@/lib/project-requirement-quantity";
import { projectRequirementDetails, projectRequirementSystemLabel, specificationLabel } from "@/lib/project-requirement-details";
import { projectRequirementDataWarnings } from "@/lib/project-requirement-data-warnings";
import { groupProjectRequirementViews, PROJECT_REQUIREMENT_VIEWS, type ProjectRequirementView } from "@/lib/project-requirement-views";
import { ahlsellCatalogStatusFromPayload, type AhlsellCatalogMatchStatus } from "@/lib/ahlsell-match-groups";
import { orderAhlsellCandidatesForDisplay } from "@/lib/ahlsell-candidate-ranking";
import { ahlsellMldlProduct } from "@/lib/ahlsell-mldl-catalog";
import { MAX_AHLSELL_PRODUCT_LABEL_ITEMS, type AhlsellProductLabel, type AhlsellProductLabelItem } from "@/lib/ahlsell-product-labels";
import { AhlsellCandidateList } from "@/components/AhlsellCandidateList";
import { normalizeNrfNumber } from "@/lib/product-card-candidates";
import { candidateSelectionReview, productSelectionReviewNotes, readProductSelectionReview, type ProductSelectionReview } from "@/lib/product-selection-review";
import {
  accessoriesForSelectedProduct,
  newProductAccessoryDraft,
  productAccessoryDraftError,
  productAccessoryPayload,
  readProductAccessoryDrafts,
  type ProductAccessoryDraft
} from "@/lib/product-card-accessories";
import {
  projectRequirementSourcePdfHref,
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

export function DistributorMappingPanel({ view = "all", projectId, currency = "NOK", requirements, assignments, memories: allMemories, sourcePdfLookup, onReload, onGoToDocuments, onEditStateChange, workspaceNavigation, onRequirementSaved }: {
  workspaceNavigation?: ReactNode;
  view?: ProjectRequirementView | "all";
  onRequirementSaved?: (id: string) => Promise<void>;
  projectId: string;
  currency?: string;
  requirements: Row[];
  assignments: Row[];
  memories: Row[];
  sourcePdfLookup: ProjectSourcePdfLookup;
  onReload: () => Promise<unknown>;
  onGoToDocuments: () => void;
  onEditStateChange?: (state: ProductEditState) => void;
}) {
  const memories = useMemo(() => allMemories.filter(memory =>
    ahlsellMldlProduct(String(memory.product_number ?? "")) && !readProductSelectionReview(memory.notes)), [allMemories]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { products: productRequirements, removal: removalRequirements, rs: rsRequirements } = useMemo(
    () => groupProjectRequirementViews(requirements),
    [requirements]
  );
  const approvedAssignments = useMemo(
    () => assignments.filter(isUserApprovedProductAssignment),
    [assignments]
  );
  const approvedAssignmentByRequirementId = useMemo(
    () => {
      const assignmentsByRequirement = new Map<string, Row>();
      for (const assignment of approvedAssignments) {
        const requirementId = String(assignment.requirement_id);
        if (!assignmentsByRequirement.has(requirementId)) assignmentsByRequirement.set(requirementId, assignment);
      }
      return assignmentsByRequirement;
    },
    [approvedAssignments]
  );
  const approvedRequirementIds = useMemo(
    () => new Set(approvedAssignments.map((assignment) => String(assignment.requirement_id))),
    [approvedAssignments]
  );
  const resolvedRequirementIds = useMemo(
    () => new Set(requirements
      .filter(isProductRequirementResolvedWithoutProduct)
      .map((requirement) => requirement.id)),
    [requirements]
  );
  const handledRequirementIds = useMemo(
    () => new Set([...approvedRequirementIds, ...resolvedRequirementIds]),
    [approvedRequirementIds, resolvedRequirementIds]
  );
  // Search only the opened post. Overview rows intentionally omit detailed specifications.
  const recordFullCatalogResult = useCallback(() => {}, []);
  const viewRequirements = useMemo(() => view === "all" ? [...productRequirements, ...rsRequirements, ...removalRequirements]
    : view === "products" ? productRequirements : view === "removal" ? removalRequirements : rsRequirements, [view, productRequirements, rsRequirements, removalRequirements]);
  const mainPostGroups = useMemo(() => productPostNavigationGroups(viewRequirements, requirements), [viewRequirements, requirements]);
  const queueRequirements = useMemo(() => mainPostGroups.flatMap(group => group.requirements), [mainPostGroups]);
  const [expandedMainPosts, setExpandedMainPosts] = useState<Set<string>>(() => new Set(mainPostGroups.slice(0, 1).map(group => group.key)));
  const [activeRequirementId, setActiveRequirementId] = useState<string | null>(() => queueRequirements[0]?.id ?? null);
  const [productCardSaving, setProductCardSaving] = useState(false);
  const [productCardDirty, setProductCardDirty] = useState(false);
  const requestedIndex = queueRequirements.findIndex(requirement => requirement.id === activeRequirementId);
  const activeIndex = requestedIndex >= 0 ? requestedIndex : 0;
  const activeRequirement = queueRequirements[activeIndex];
  const activeAssignment = activeRequirement ? approvedAssignmentByRequirementId.get(activeRequirement.id) : undefined;
  const handledCount = queueRequirements.filter(requirement => handledRequirementIds.has(requirement.id)).length;
  useEffect(() => {
    onEditStateChange?.({ dirty: productCardDirty, saving: productCardSaving });
    return () => onEditStateChange?.({ dirty: false, saving: false });
  }, [onEditStateChange, productCardDirty, productCardSaving]);

  useEffect(() => {
    if (!productCardDirty && !productCardSaving) return;
    const protectUnsavedProduct = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    // The main navigation remains usable while the product is open. Protect
    // drafts when Next.js handles a link without a browser page unload.
    const protectNavigation = (event: MouseEvent) => {
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const destination = new URL(anchor.href, window.location.href);
      if (!["http:", "https:"].includes(destination.protocol)) return;
      if (destination.origin === window.location.origin && destination.pathname === window.location.pathname && destination.search === window.location.search) return;
      if (productCardSaving || !window.confirm("Du har ulagrede endringer i produktvalget. Vil du forlate siden uten å lagre?")) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", protectUnsavedProduct);
    document.addEventListener("click", protectNavigation, true);
    return () => {
      window.removeEventListener("beforeunload", protectUnsavedProduct);
      document.removeEventListener("click", protectNavigation, true);
    };
  }, [productCardDirty, productCardSaving]);

  function showRequirement(requirementId: string) {
    if (productCardSaving) return false;
    if (requirementId === activeRequirement?.id) return true;
    if (productCardDirty && !window.confirm("Du har ulagrede endringer i produktvalget. Vil du bytte post uten å lagre?")) return false;
    setProductCardDirty(false);
    setActiveRequirementId(requirementId);
    const keys = productPostExpansionKeys(mainPostGroups, requirementId);
    setExpandedMainPosts(current => new Set([...current, ...keys]));
    setMessage(null);
    setError(null);
    window.requestAnimationFrame(() => {
      const detail = document.getElementById("product-post-detail");
      if (window.matchMedia("(max-width: 900px)").matches) detail?.scrollIntoView({ block: "start", behavior: "instant" });
      detail?.focus({ preventScroll: true });
    });
    return true;
  }

  function toggleMainPost(key: string) {
    setExpandedMainPosts(current => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <section id="project-requirement-table" aria-label={view === "all" ? "Alle poster" : PROJECT_REQUIREMENT_VIEWS.find(item => item.id === view)?.label} className="product-selection-workspace">
      <div className="product-selection-heading">
        <h2>Produktvalg</h2>
        <p>{queueRequirements.length} poster · {handledCount} håndtert</p>
      </div>
      <div className={`product-selection-layout${workspaceNavigation ? " has-project-navigation" : ""}`}>
        {workspaceNavigation && <aside className="product-project-navigation" aria-label="Prosjektvisninger"><h2 className="product-panel-caption">Prosjekt</h2>{workspaceNavigation}</aside>}
        <ProductPostNavigation groups={mainPostGroups} activeRequirementId={activeRequirement?.id}
          expanded={expandedMainPosts} handledIds={handledRequirementIds} disabled={productCardSaving}
          onToggle={toggleMainPost} onSelect={showRequirement} />
        <section id="product-post-detail" tabIndex={-1} aria-label="Valgt post og produktvalg" className="product-post-detail">
          {activeRequirement ? <>
            <header className="product-post-toolbar">
              <p aria-live="polite">Post {projectRequirementDetails(activeRequirement).postNumber ?? activeIndex + 1}<span> · {activeIndex + 1} av {queueRequirements.length}</span></p>
              <div>
                <Button type="button" variant="secondary" disabled={productCardSaving || activeIndex === 0}
                  onClick={() => showRequirement(queueRequirements[activeIndex - 1].id)}><ChevronLeft className="h-4 w-4" aria-hidden="true" />Forrige post</Button>
                <Button type="button" variant="secondary" disabled={productCardSaving || activeIndex === queueRequirements.length - 1}
                  onClick={() => showRequirement(queueRequirements[activeIndex + 1].id)}>Neste post<ChevronRight className="h-4 w-4" aria-hidden="true" /></Button>
              </div>
            </header>
            {(message || error) && <p role={error ? "alert" : "status"} aria-live="polite" className="product-selection-feedback">{error ?? message}</p>}
            <LazyRequirementProductMappingCard
              key={`${activeRequirement.id}:${String(activeAssignment?.updated_at ?? "new")}:${productRequirementResolution(activeRequirement)?.status ?? ""}`}
              projectId={projectId} currency={currency} requirement={activeRequirement} assignment={activeAssignment}
              sourcePdfHref={projectRequirementSourcePdfHref(projectId, activeRequirement, sourcePdfLookup)}
              position={activeIndex + 1}
              memories={memories.filter(memory => memory.requirement_fingerprint === activeRequirement.mapping_fingerprint)}
              onCatalogResult={recordFullCatalogResult} onSavingChange={setProductCardSaving} onDirtyChange={setProductCardDirty}
              onSaved={async successMessage => {
                setProductCardDirty(false);
                setError(null);
                if (onRequirementSaved) await onRequirementSaved(activeRequirement.id);
                else await onReload();
                setMessage(successMessage);
              }}
              onError={errorMessage => { setMessage(null); setError(errorMessage || null); }}
            />
          </> : <div className="product-selection-empty">
            <FileText className="h-6 w-6" aria-hidden="true" />
            <h3>Ingen poster å vise</h3>
            <p>{requirements.length ? "Ingen poster finnes i denne visningen." : "Last opp en teknisk beskrivelse for å velge produkter."}</p>
            {!requirements.length && <Button type="button" variant="secondary" onClick={onGoToDocuments}>Gå til dokument</Button>}
          </div>}
        </section>
      </div>
      <footer className="product-selection-footer"><span>{productCardSaving ? "Lagrer produktvalg…" : productCardDirty ? "Ulagrede endringer" : "Klar"}</span><span>{queueRequirements.length} poster · {mainPostGroups.length} hovedposter</span></footer>
    </section>
  );
}

function LazyRequirementProductMappingCard(props: ComponentProps<typeof RequirementProductMappingCard>) {
  const [detail, setDetail] = useState<{ requirement: Row; assignments: Row[]; mappingMemories: Row[] } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const needsDetails = Boolean(props.requirement.overview);
  useEffect(() => {
    if (!needsDetails) return;
    const controller = new AbortController();
    void fetch(`/api/projects/${props.projectId}/requirements/${props.requirement.id}`, {
      cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)])
    }).then(async response => {
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Produktposten kunde inte laddas.");
      if (!payload.requirement || !Array.isArray(payload.assignments) || !Array.isArray(payload.mappingMemories)) throw new Error("Produktpostens svar var ofullständigt.");
      if (!controller.signal.aborted) setDetail(payload);
    }).catch(error => {
      if (!controller.signal.aborted) setLoadError(error instanceof Error ? error.message : "Produktposten kunde inte laddas.");
    });
    return () => controller.abort();
  }, [attempt, needsDetails, props.projectId, props.requirement.id]);
  if (!needsDetails) return <ResolvedRequirementCard {...props} />;
  if (detail) return <ResolvedRequirementCard {...props} requirement={detail.requirement}
    assignment={detail.assignments.find(isUserApprovedProductAssignment)} memories={detail.mappingMemories.filter(memory =>
      ahlsellMldlProduct(String(memory.product_number ?? "")) && !readProductSelectionReview(memory.notes))} />;
  return <div className="space-y-4 p-6" aria-live="polite">
    <p role={loadError ? "alert" : "status"}>{loadError ?? "Laddar produktpostens krav och produktval…"}</p>
    <div className="flex gap-3">
      {loadError && <Button variant="secondary" onClick={() => { setLoadError(null); setAttempt(value => value + 1); }}>Försök igen</Button>}
    </div>
  </div>;
}

function ResolvedRequirementCard(props: ComponentProps<typeof RequirementProductMappingCard>) {
  const [chooseProduct, setChooseProduct] = useState(false);
  const informationOnly = groupProjectRequirementViews([props.requirement]).removal.length > 0 && !props.assignment;
  if (!informationOnly || chooseProduct) return <RequirementProductMappingCard {...props} />;
  return <RequirementInformationCard {...props} onChooseProduct={() => setChooseProduct(true)} />;
}

function RequirementInformationCard({ projectId, requirement, sourcePdfHref, onDirtyChange, onSavingChange, onChooseProduct }: ComponentProps<typeof RequirementProductMappingCard> & { onChooseProduct: () => void }) {
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const details = projectRequirementDetails(requirement);
  useEffect(() => { onSavingChange(saving); return () => onSavingChange(false); }, [saving, onSavingChange]);
  useEffect(() => { onDirtyChange(dirty); return () => onDirtyChange(false); }, [dirty, onDirtyChange]);
  return <ProductPostComments projectId={projectId} requirementId={requirement.id} productNumber="" productName=""
    disabled={false} onDirtyChange={setDirty} onSavingChange={setSaving}>
    {({ postComments }) => <article className="product-information-card">
      <header className="product-panel-caption">Prosjektinformasjon<Button neutral variant="secondary" type="button" disabled={saving || dirty} onClick={onChooseProduct}>Velg produkt</Button></header>
      <div className="product-information-content"><ProjectPostSpecification id={requirement.id} details={details} informationOnly
        description={String(record(requirement.value_json).description ?? requirement.value_text ?? "")}
        quantity={projectRequirementQuantity(requirement.value_json)} sourcePdfHref={sourcePdfHref} />
        <details className="mt-3"><summary>Kommentarer til posten</summary>{postComments}</details>
      </div>
    </article>}
  </ProductPostComments>;
}

function RequirementProductMappingCard({ projectId, currency, requirement, assignment, sourcePdfHref, position, memories, onCatalogResult, onSavingChange, onDirtyChange, onSaved, onError }: {
  projectId: string;
  currency: string;
  requirement: Row;
  assignment?: Row;
  sourcePdfHref: string | null;
  position: number;
  memories: Row[];
  onCatalogResult: (requirementId: string, status: AhlsellCatalogMatchStatus) => void;
  onSavingChange: (saving: boolean) => void;
  onDirtyChange: (dirty: boolean) => void;
  onSaved: (message: string) => Promise<void>;
  onError: (message: string) => void;
}) {
  const currentSnapshot = record(assignment?.product_snapshot);
  const quantity = projectRequirementQuantity(requirement.value_json);
  const [orderQuantity, setOrderQuantity] = useState<{ quantity: string; unit: string } | null>(() => {
    const saved = parseProductOrderQuantity(currentSnapshot.orderQuantity);
    return saved ? { quantity: String(saved.quantity), unit: saved.unit } : null;
  });
  const [selectionReview, setSelectionReview] = useState<ProductSelectionReview | null>(() => readProductSelectionReview(currentSnapshot.notes));
  const defaultCurrency = normalizeCurrencyCode(currency) || "NOK";
  const [productName, setProductName] = useState(String(currentSnapshot.name ?? ""));
  const [productSubtitle, setProductSubtitle] = useState(String(currentSnapshot.subtitle ?? ""));
  const [productNumber, setProductNumber] = useState(String(currentSnapshot.productNumber ?? ""));
  const [manufacturerArticleNumber, setManufacturerArticleNumber] = useState(String(currentSnapshot.manufacturerArticleNumber ?? ""));
  const [manufacturerName, setManufacturerName] = useState(String(currentSnapshot.manufacturer ?? ""));
  const [deliveryTimeDays, setDeliveryTimeDays] = useState(String(currentSnapshot.deliveryTimeDays ?? ""));
  const [unitPrice, setUnitPrice] = useState(String(currentSnapshot.unitPrice ?? ""));
  const [priceCurrency, setPriceCurrency] = useState(normalizeCurrencyCode(String(currentSnapshot.currency ?? "")) || defaultCurrency);
  const [manualProductSelected, setManualProductSelected] = useState(Boolean(
    currentSnapshot.entryMethod === "manual"
    || currentSnapshot.entryMethod == null && [currentSnapshot.manufacturerArticleNumber, currentSnapshot.deliveryTimeDays, currentSnapshot.unitPrice]
      .some(value => value != null && String(value).trim() !== "")
  ));
  const [manualProductOpen, setManualProductOpen] = useState(false);
  const [manualProductDraftDirty, setManualProductDraftDirty] = useState(false);
  const [manualProductError, setManualProductError] = useState<string | null>(null);
  const [accessories, setAccessories] = useState<ProductAccessoryDraft[]>(() => readProductAccessoryDrafts(currentSnapshot.accessories));
  const [accessoryOwnerProductNumber, setAccessoryOwnerProductNumber] = useState(() => accessories.length > 0 ? productNumber : "");
  const [accessoryStepOpen, setAccessoryStepOpen] = useState(false);
  const [accessoryLookupOpen, setAccessoryLookupOpen] = useState(false);
  const [accessoryComponentId, setAccessoryComponentId] = useState<string | null>(null);
  const [suggestedAccessories, setSuggestedAccessories] = useState<AhlsellAccessorySuggestion[]>([]);
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
  const selectedProductAccessories = accessoriesForSelectedProduct({
    currentProductNumber: accessoryOwnerProductNumber,
    nextProductNumber: productNumber,
    accessories
  });
  const accessoryError = productAccessoryDraftError(selectedProductAccessories);
  const assemblyPlan = productAssemblyPlan(requirement);
  const accessoryComponent = assemblyPlan?.components.find(component => component.id === accessoryComponentId);
  const accessoryQuery = accessoryComponent
    ? assemblyComponentSearch(accessoryComponent, `${productName} ${productSubtitle} ${manufacturerName}`)
    : !assemblyPlan?.components.length ? suggestedAccessories[0]?.productName ?? "" : "";
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

  useEffect(() => { onSavingChange(commentsSaving); }, [commentsSaving, onSavingChange]);

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

  function showSelection(
    selection: ProductSelection,
    notice: string,
    manual = false,
    accessorySuggestions: AhlsellAccessorySuggestion[] = []
  ) {
    const nextAccessories = accessoriesForSelectedProduct({
      currentProductNumber: accessoryOwnerProductNumber,
      nextProductNumber: selection.productNumber,
      accessories
    });
    setProductName(selection.productName);
    setProductSubtitle(selection.productSubtitle);
    setProductNumber(selection.productNumber);
    if (normalizeNrfNumber(selection.productNumber) !== normalizeNrfNumber(productNumber)) setOrderQuantity(null);
    setManufacturerArticleNumber(selection.manufacturerArticleNumber);
    setManufacturerName(selection.manufacturerName);
    setDeliveryTimeDays(selection.deliveryTimeDays);
    setUnitPrice(selection.unitPrice);
    setPriceCurrency(normalizeCurrencyCode(selection.currency) || defaultCurrency);
    setManualProductSelected(manual);
    setSelectionReview(manual ? candidateSelectionReview() : null);
    setManualProductOpen(false);
    setManualProductDraftDirty(false);
    setManualProductError(null);
    setAccessories(nextAccessories);
    setAccessoryOwnerProductNumber(nextAccessories.length > 0 ? selection.productNumber : "");
    setAccessoryStepOpen(Boolean(assemblyPlan?.components.length || accessorySuggestions.length || nextAccessories.length));
    const firstComponent = assemblyPlan?.components.find(component => !component.optional);
    setAccessoryComponentId(firstComponent?.id ?? null);
    setAccessoryLookupOpen(Boolean(firstComponent || accessorySuggestions.length));
    setSuggestedAccessories(accessorySuggestions);
    setHasUnapprovedChanges(true);
    setDraftNotice(notice);
    focusSelectedProduct();
  }

  function focusSelectedProduct() {
    window.requestAnimationFrame(() => {
      const selectedCard = document.getElementById(`selected-pipe-${requirement.id}`);
      selectedCard?.scrollIntoView({ block: "nearest", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
      selectedCard?.focus({ preventScroll: true });
    });
  }

  function applyMemory(memory: Row, resolved?: { productName?: string; productSubtitle?: string }) {
    showSelection(
      selectionFromMemory(memory, resolved),
      `Tidigare godkänd produkt har valts för kontroll: ${String(memory.product_name)} · NRF-nummer ${String(memory.product_number)}.`
    );
    setSelectionReview(readProductSelectionReview(memory.notes));
    onError("");
  }

  function applyAhlsellCandidate(candidate: AhlsellPublicCandidate, resolvedSubtitle = "") {
    showSelection({
      productName: candidate.productName,
      productSubtitle: resolvedSubtitle,
      productNumber: candidate.articleNumber,
      manufacturerArticleNumber: "",
      manufacturerName: candidate.manufacturer,
      deliveryTimeDays: "",
      unitPrice: "",
      currency: defaultCurrency
    }, `Produkt har valts för kontroll: ${candidate.productName} · NRF-nummer ${candidate.articleNumber}.`, false, candidate.suggestedAccessories ?? []);
    setSelectionReview(candidateSelectionReview(candidate) ?? (dataWarnings.length ? {
      status: "review", warnings: dataWarnings.map(warning => warning.message)
    } : null));
    onError("");
  }

  function clearSelectedProduct() {
    setSelectionReview(null);
    setAccessoryLookupOpen(false);
    setAccessoryStepOpen(false);
    setAccessoryComponentId(null);
    setProductName("");
    setProductSubtitle("");
    setProductNumber("");
    setOrderQuantity(null);
    setManufacturerArticleNumber("");
    setManufacturerName("");
    setDeliveryTimeDays("");
    setUnitPrice("");
    setPriceCurrency(defaultCurrency);
    setManualProductSelected(false);
    setSuggestedAccessories([]);
    setDraftNotice(null);
    setHasUnapprovedChanges(true);
  }

  function openManualProductCard() {
    setManualProductDraftDirty(false);
    setManualProductError(null);
    setManualProductOpen(true);
  }

  function closeManualProductCard() {
    setManualProductOpen(false);
    setManualProductDraftDirty(false);
    setManualProductError(null);
    window.requestAnimationFrame(() => document.getElementById(`manual-product-trigger-${requirement.id}`)?.focus());
  }

  function applyManualProduct(choice: ManualProductChoice) {
    showSelection(choice.product, "Produkt og tilbehør er lagt til. Lagre produktvalget for å bekrefte posten.", choice.manual);
    setOrderQuantity(choice.quantity);
    setAccessories(choice.accessories);
    setAccessoryOwnerProductNumber(choice.product.productNumber);
    setAccessoryStepOpen(false);
    setAccessoryLookupOpen(false);
    setSelectionReview(choice.review ?? (dataWarnings.length ? { status: "review", warnings: dataWarnings.map(warning => warning.message) } : null));
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
      onError(`Tillbehöret med NRF-nummer ${candidate.articleNumber} är redan tillagt.`);
      return;
    }
    setAccessories([...selectedProductAccessories, {
      ...newProductAccessoryDraft(), name: candidate.subtitle || candidate.productName,
      productNumber: candidate.articleNumber,
      ...amount,
      notes: `${accessoryComponent ? `Kravdel: ${accessoryComponent.label}. ` : ""}Valt från Ahlsell: ${candidate.productUrl}`
    }]);
    setAccessoryOwnerProductNumber(productNumber);
    setAccessoryStepOpen(true);
    setAccessoryLookupOpen(false);
    setHasUnapprovedChanges(true);
    setDraftNotice(`Tillbehöret med NRF-nummer ${candidate.articleNumber} har lagts till för kontroll.`);
    onError("");
    window.requestAnimationFrame(() => document.getElementById(`accessory-${requirement.id}-${selectedProductAccessories.length}-quantity`)?.focus());
  }

  function updateOrderQuantity(amount: { quantity: string; unit: string }) {
    setOrderQuantity(amount);
    setHasUnapprovedChanges(true);
  }

  function addManualAccessory() {
    if (!productNumber.trim() || selectedProductAccessories.length >= 20) return;
    if (accessories.length > 0 && selectedProductAccessories.length === 0 && !window.confirm(`Tillbehören för NRF ${accessoryOwnerProductNumber} ersätts med tillbehör för NRF ${productNumber.trim()}. Vill du fortsätta?`)) return;
    const nextIndex = selectedProductAccessories.length;
    setAccessories([...selectedProductAccessories, { ...newProductAccessoryDraft(), ...(assemblyPlan?.kind === "pipe" ? { quantity: "" } : {}) }]);
    setAccessoryOwnerProductNumber(productNumber);
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
    if (next.length === 0) {
      setAccessoryOwnerProductNumber("");
    }
    setHasUnapprovedChanges(true);
    onError("");
  }

  function openAttachmentPanel() {
    setAttachmentExpanded(true);
    setAttachmentError(null);
    setAttachmentMessage(null);
    window.requestAnimationFrame(() => {
      document.getElementById(`attachment-comment-${requirement.id}`)?.focus();
    });
  }

  function closeAttachmentPanel() {
    if (!attachmentSaving) setAttachmentExpanded(false);
  }

  async function save() {
    if (orderQuantity && !parseProductOrderQuantity(orderQuantity)) {
      onError("Angi en gyldig total mengde (0,001–100 000) og enhet for hovedproduktet.");
      return;
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
    if (manualProductSelected) {
      const manualValidation = validateManualDistributorProduct({
        productNumber,
        manufacturerArticleNumber,
        manufacturerName,
        deliveryTimeDays,
        unitPrice,
        currency: priceCurrency
      }, priceCurrency || defaultCurrency);
      if ("error" in manualValidation) {
        setManualProductOpen(true);
        setManualProductError(manualValidation.error);
        window.requestAnimationFrame(() => document.getElementById(`manual-product-${requirement.id}-nrf`)?.focus());
        return;
      }
    }
    if (hasAttachmentDraft) {
      setAttachmentExpanded(true);
      setAttachmentError("Spara vedlegget eller töm fälten innan du godkänner produkten.");
      return;
    }
    if (accessoryError) {
      setAccessoryStepOpen(true);
      onError(accessoryError);
      return;
    }
    const sameApprovedProduct = Boolean(normalizeNrfNumber(productNumber)) && normalizeNrfNumber(productNumber) === normalizeNrfNumber(String(currentSnapshot.productNumber ?? ""));
    setSaving(true);
    onSavingChange(true);
    onError("");
    try {
      let resolvedProductName = productName;
      let resolvedProductSubtitle = productSubtitle;
      let resolvedManufacturerName = manufacturerName;
      if (productNumber.trim() && !resolvedProductSubtitle.trim() && !manualProductSelected) {
        try {
          const labels = await fetchAhlsellProductLabels(projectId, [{
            requirementId: requirement.id,
            articleNumber: productNumber
          }]);
          const label = labels[requirement.id];
          if (label && normalizeNrfNumber(label.articleNumber) === normalizeNrfNumber(productNumber)) {
            resolvedProductName = label.productName || resolvedProductName;
            resolvedProductSubtitle = label.subtitle;
            resolvedManufacturerName = label.manufacturer || resolvedManufacturerName;
            setProductName(resolvedProductName);
            setProductSubtitle(resolvedProductSubtitle);
            setManufacturerName(resolvedManufacturerName);
          }
        } catch {
          // Ahlsells produkttext förbättrar visningen men får inte blockera ett uttryckligt produktval.
        }
      }
      const chosen = {
        entryMethod: manualProductSelected ? "manual" as const : "catalog" as const,
        productName: resolveDistributorProductName({
          productName: resolvedProductName,
          requirementName: requirement.value_text,
          productNumber
        }),
        productSubtitle: resolvedProductSubtitle,
        productNumber,
        manufacturerArticleNumber,
        manufacturerName: resolvedManufacturerName,
        deliveryTimeDays,
        unitPrice,
        currency: priceCurrency,
        notes: productSelectionReviewNotes(selectionReview,
          sameApprovedProduct && typeof currentSnapshot.notes === "string"
            ? currentSnapshot.notes
            : ""),
        accessories: productAccessoryPayload(selectedProductAccessories),
        ...(orderQuantity ? { orderQuantity } : {})
      };
      const response = await fetch(`/api/projects/${projectId}/product-mappings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requirementId: requirement.id, expectedRevision: requirement.edit_revision, userApproved: true, ...chosen })
      });
      const payload = (await response.json().catch(() => null)) as { error?: string; message?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? "Produktvalet kunde inte sparas.");
      setHasUnapprovedChanges(false);
      await onSaved(`Produktvalet för post ${details.postNumber ?? position} är godkänt och sparat.`);
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
          <h5 id={`accessory-step-title-${requirement.id}`} className="flex items-center gap-2 text-base font-bold text-neutral-950"><PackagePlus className="h-5 w-5" aria-hidden="true" />{accessoryStepOpen ? "3. Välj tillbehör" : `Dina tillbehör (${selectedProductAccessories.length})`}</h5>
        </div>
        {!accessoryStepOpen && <Button neutral type="button" variant="secondary" onClick={editAccessories}>{selectedProductAccessories.length ? "Ändra tillbehör" : "Lägg till tillbehör"}</Button>}
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
            <section id={`product-accessories-${requirement.id}`} aria-label="Valda tillbehör" className="scroll-mt-24 overflow-hidden rounded-md border border-neutral-300 bg-white">
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
                  <div key={index} className="space-y-3 rounded-md border-2 border-neutral-300 bg-neutral-50/40 p-3">
                    {accessoryStepOpen ? <>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-bold text-neutral-800">Tilbehør {index + 1}</p>
                      <ProductSelectionCheckbox checked disabled={saving} label={accessory.name || `tilbehør ${index + 1}`} onChange={() => removeAccessory(index)} />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                    <AccessoryInput id={`accessory-name-${requirement.id}-${index}`} label="Delprodukt / tillbehör" value={accessory.name} required onChange={(value) => updateAccessory(index, "name", value)} />
                    <AccessoryInput id={`accessory-nrf-${requirement.id}-${index}`} label="NRF-nummer" value={accessory.productNumber} onChange={(value) => updateAccessory(index, "productNumber", value)} />
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

  return (
    <ProductPostComments projectId={projectId} requirementId={requirement.id} productNumber={productNumber} productName={productName}
      disabled={saving || attachmentSaving} onDirtyChange={setCommentDraftDirty} onSavingChange={setCommentsSaving}>
      {({ postComments, productComments }) => <article id={`post-${requirement.id}`} className="product-mapping-card">
      <section id={`pdf-requirement-${requirement.id}`} tabIndex={-1} aria-labelledby={`pdf-specification-${requirement.id}`} className="product-requirement-summary">
        <div className="product-panel-caption"><h3 id={`pdf-specification-${requirement.id}`}>PDF-post {details.postNumber ?? "saknas"}</h3><span>PDF-grunnlag</span></div>
        <div className="product-requirement-content">
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

          <ProjectPostSpecification id={"full-" + requirement.id} details={details}
              description={String(record(requirement.value_json).description ?? requirement.value_text ?? "")}
              quantity={quantity} quantityText={String(record(requirement.value_json).quantityText ?? "")}
              sourcePdfHref={sourcePdfHref} pdfArticleNumber={pdfArticleNumber} />

          <div className="product-post-extras">
          <details>
            <summary>Kommentarer til posten</summary>
            <div id={`post-comments-${requirement.id}`} className="mt-3 scroll-mt-28">{postComments}</div>
          </details>
          </div>
        </div>
      </section>

      <fieldset disabled={saving || attachmentSaving || commentsSaving} aria-busy={saving || attachmentSaving || commentsSaving} className="product-mapping-fields">
        <div id={`product-selection-header-${requirement.id}`} className="product-action-bar">
          <nav id={`product-post-actions-${requirement.id}`} aria-label="Handlinger for produktposten" className="product-post-actions">
            <Button neutral id={`manual-product-trigger-${requirement.id}`} type="button" variant="secondary" className="min-h-9 px-3 py-1.5 text-xs" aria-haspopup="dialog" aria-expanded={manualProductOpen} aria-controls={`manual-product-card-${requirement.id}`} onClick={manualProductOpen ? closeManualProductCard : openManualProductCard}>
              <Plus className="h-4 w-4" aria-hidden="true" />{productNumber.trim() ? "Endre produkt og tilbehør" : "Legg til produkt"}
            </Button>
            {!resolution && (
              <Button neutral type="button" variant="secondary" className="min-h-9 px-3 py-1.5 text-xs" onClick={markAsNotInAssortment}>
                <Tag className="h-4 w-4" aria-hidden="true" />Ikke i sortiment
              </Button>
            )}
            <a href={productPostMailHref} className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-bold text-neutral-800 transition hover:border-neutral-300 hover:bg-neutral-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-600">
              <Mail className="h-4 w-4" aria-hidden="true" />Send e-post om post
            </a>
            <Button neutral type="button" variant="secondary" className="min-h-9 px-3 py-1.5 text-xs" onClick={openAttachmentPanel}>
              <Paperclip className="h-4 w-4" aria-hidden="true" />Legg til vedlegg
            </Button>
            {sourcePdfHref && (
              <a href={sourcePdfHref} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-bold text-neutral-800 transition hover:border-neutral-300 hover:bg-neutral-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-600">
                <FileText className="h-4 w-4" aria-hidden="true" />

                Åpne PDF{details.sourcePage ? ` · sida ${details.sourcePage}` : ""}
              </a>
            )}
            <a href="https://www.ahlsell.no/" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-bold text-neutral-800 transition hover:border-neutral-300 hover:bg-neutral-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-600">
              <ExternalLink className="h-4 w-4" aria-hidden="true" />Ahlsells nettside
            </a>
          </nav>
        </div>

        <section className="product-linked-panel" aria-label="Koblede produkter">
          <h3 className="product-panel-caption">Koblede produkter <span>{isApproved ? "Lagret" : productNumber.trim() ? "Ikke lagret" : "Ingen valgt"}</span></h3>
          <div className="product-linked-content">
          {!productNumber.trim() && <p className="product-linked-empty">Velg et produkt fra listen over tilgjengelige produkter.</p>}
          <p role="status" aria-live="polite" className="sr-only">{hasUnapprovedChanges ? draftNotice : ""}</p>
          {productNumber.trim() && (
            <section id={`selected-pipe-${requirement.id}`} tabIndex={-1} aria-label="Valgt hovedprodukt" className="product-selected-item">
              <div className="product-linked-table-scroll"><table className="product-linked-table">
                <thead><tr><th scope="col">NRF</th><th scope="col">Produkt</th><th scope="col">Mengde / enhet</th><th scope="col">Valg</th></tr></thead>
                <tbody><tr aria-selected="true">
                  <td><a href={`https://www.ahlsell.no/productVariantProxy/${encodeURIComponent(productNumber)}`} target="_blank" rel="noreferrer" className="underline">{productNumber}</a></td>
                  <td><strong>{productName || "Produkt"}</strong>{productSubtitle && productSubtitle.trim() !== productName.trim() && <p>{productSubtitle}</p>}</td>
                  <td><ProductQuantityFields compact id={`selected-product-${requirement.id}`} quantity={orderQuantity?.quantity ?? String(quantity.quantity ?? "")} unit={orderQuantity?.unit ?? (quantity.unit || "st")} disabled={saving}
                    onQuantityChange={value => updateOrderQuantity({ quantity: value, unit: orderQuantity?.unit ?? (quantity.unit || "st") })}
                    onUnitChange={value => updateOrderQuantity({ quantity: orderQuantity?.quantity ?? String(quantity.quantity ?? ""), unit: value })} /></td>
                  <td><ProductSelectionCheckbox checked approved={isApproved} disabled={saving} label={`${productName || "hovedprodukt"}, NRF ${productNumber}`} onChange={clearSelectedProduct} /></td>
                </tr></tbody>
              </table></div>
              {(manufacturerArticleNumber || deliveryTimeDays || unitPrice) && <dl className="product-requirement-facts">
                {manufacturerArticleNumber && <div><dt>Artikkelnummer</dt><dd>{manufacturerArticleNumber}</dd></div>}
                {deliveryTimeDays && <div><dt>Leveringstid</dt><dd>{deliveryTimeDays} dager</dd></div>}
                {unitPrice && <div><dt>Pris</dt><dd>{formatUnitPrice(unitPrice, priceCurrency)}</dd></div>}
              </dl>}
              {accessorySection}
            </section>
          )}



          {productNumber.trim() && selectionReview?.status === "mismatch" && (
            <details className="text-sm text-neutral-700">
              <summary className="cursor-pointer font-semibold">Avvikelser mot postens krav · NRF {productNumber}</summary>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-xs">{selectionReview.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>
            </details>
          )}

          {manualProductOpen && <ManualProductCard projectId={projectId} requirementId={requirement.id} postNumber={details.postNumber}
            initial={{ product: { productName, productSubtitle, productNumber, manufacturerArticleNumber, manufacturerName, deliveryTimeDays, unitPrice, currency: priceCurrency },
              quantity: orderQuantity ?? { quantity: String(quantity.quantity ?? ""), unit: quantity.unit || "st" },
              accessories: selectedProductAccessories, manual: manualProductSelected || !productNumber.trim(), review: selectionReview }}
            initialError={manualProductError} onApply={applyManualProduct} onCancel={closeManualProductCard} onDirtyChange={setManualProductDraftDirty} />}

          {productNumber.trim() && commentDraftDirty && <p className="text-xs font-semibold text-neutral-900">Spara kommentarerna eller töm kommentarsfälten före godkännandet.</p>}
          <details>
            <summary className="cursor-pointer text-sm font-semibold">Produktkommentarer</summary>
            <div id={`product-comments-${requirement.id}`} className="mt-3 scroll-mt-28">{productComments}</div>
          </details>

          </div>
        </section>

          <div id={`ahlsell-products-${requirement.id}`} className="product-catalog-panel">
            <h3 className="product-panel-caption">Tilgjengelige produkter <span>Ahlsell</span></h3>
            <div className="product-catalog-scroll">
            <AhlsellPublicMatchPanel
              projectId={projectId}
              requirementId={requirement.id}
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
              onSearch={openManualProductCard}
              onCheckRequirement={() => {
                const element = document.getElementById(`pdf-requirement-${requirement.id}`);
                element?.scrollIntoView({ behavior: "smooth", block: "start" });
                element?.scrollTo({ top: 0, behavior: "smooth" });
                element?.focus({ preventScroll: true });
              }}
            />
            </div>
          </div>

        <div className="product-save-footer">
          <span className="text-sm text-neutral-600">{isApproved ? "Produktvalget er lagret" : productNumber.trim() ? "Produkt valgt · ikke lagret" : "Velg et produkt for å lagre posten"}</span>
          <Button type="button" onClick={() => void save()}
            disabled={!productNumber.trim() || (isApproved && !hasUnsavedChanges) || saving || attachmentSaving || commentsSaving || commentDraftDirty || manualProductDraftDirty || hasAttachmentDraft || accessoryStepOpen || Boolean(accessoryError)}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ShieldCheck className="h-4 w-4" aria-hidden="true" />}
            {saving ? "Lagrer…" : isApproved && !hasUnsavedChanges ? "Produktvalg lagret" : "Lagre produktvalg"}
          </Button>
        </div>
        {attachmentExpanded && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
            <button
              type="button"
              aria-label="Lukk vedlegg"
              className="absolute inset-0 bg-neutral-950/65 backdrop-blur-sm"
              onClick={closeAttachmentPanel}
              disabled={attachmentSaving}
            />
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby={`attachment-dialog-title-${requirement.id}`}
              className="relative z-10 max-h-[calc(100dvh-1.5rem)] w-full max-w-2xl overflow-y-auto rounded-xl border border-neutral-200 bg-white shadow-2xl sm:max-h-[calc(100dvh-3rem)]"
            >
              <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-neutral-200 bg-white px-4 py-3 sm:px-5">
                <div>
                  <h5 id={`attachment-dialog-title-${requirement.id}`} className="flex items-center gap-2 text-base font-bold text-neutral-950">
                    <Paperclip className="h-4 w-4 text-neutral-700" aria-hidden="true" />
                    Legg til vedlegg
                  </h5>
                  <p className="mt-0.5 text-xs leading-5 text-neutral-600">Legg en kommentar og fil til PDF-post {details.postNumber ?? position}.</p>
                </div>
                <button
                  type="button"
                  aria-label="Lukk"
                  title="Lukk"
                  onClick={closeAttachmentPanel}
                  disabled={attachmentSaving}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-neutral-200 bg-white text-neutral-600 transition hover:border-neutral-300 hover:bg-neutral-50 hover:text-neutral-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-600 disabled:cursor-wait disabled:opacity-50"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </header>

              <div className="space-y-5 p-4 sm:p-5">
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
                  <p className="text-xs text-neutral-500">Max 4 MB. Tillatte format: PDF, PNG, JPG, WebP, TXT og CSV.</p>
                  {attachmentError && <p role="alert" className="rounded-md border border-neutral-300 bg-neutral-50 px-3 py-2 text-xs font-semibold text-neutral-900">{attachmentError}</p>}
                  {attachmentMessage && <p role="status" className="rounded-md border border-neutral-300 bg-neutral-50 px-3 py-2 text-xs font-semibold text-neutral-900">{attachmentMessage}</p>}
                </form>

                <div className="border-t border-neutral-200 pt-4">
                  <h5 className="text-xs font-bold uppercase tracking-[0.08em] text-neutral-600">Lagrede vedlegg{attachments.length > 0 ? ` · ${attachments.length}` : ""}</h5>
                  {attachmentsLoading ? (
                    <p className="mt-2 flex items-center gap-2 text-xs font-semibold text-neutral-600"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Henter vedlegg…</p>
                  ) : attachments.length === 0 ? (
                    <p className="mt-2 text-xs text-neutral-600">Ingen vedlegg har lagret for posten.</p>
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
          </div>
        )}
      </fieldset>
    </article>}
    </ProductPostComments>
  );
}

function AhlsellPublicMatchPanel({ projectId, requirementId, guide, disabled, selectedArticleNumber, memories, memoriesAreExact, pipeMainProduct, onCatalogResult, onClearSelection, onUseCandidate, onUseMemory, onSearch, onCheckRequirement }: {
  projectId: string;
  requirementId: string;
  guide: AhlsellRequirementGuide;
  disabled: boolean;
  selectedArticleNumber: string;
  memories: Row[];
  memoriesAreExact: boolean;
  pipeMainProduct: boolean;
  onCatalogResult: (requirementId: string, status: AhlsellCatalogMatchStatus) => void;
  onClearSelection: () => void;
  onUseCandidate: (candidate: AhlsellPublicCandidate, productSubtitle?: string) => void;
  onUseMemory: (memory: Row, resolved?: { productName?: string; productSubtitle?: string }) => void;
  onSearch: () => void;
  onCheckRequirement: () => void;
}) {
  const [catalogResult, setCatalogResult] = useState<AhlsellCatalogResult | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [loadingCatalog, setLoadingCatalog] = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    void fetch(`/api/projects/${projectId}/requirements/${requirementId}/ahlsell-candidates`, {
      signal: controller.signal,
      headers: { Accept: "application/json" }
    })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as (AhlsellCatalogResult & { error?: string }) | null;
        if (!response.ok) throw new Error(payload?.error ?? "Ahlsell-søket mislyktes.");
        if (!payload) throw new Error("Ahlsell-søket gav ingen lesbart svar.");
        if (controller.signal.aborted) return;
        setCatalogResult(payload);
        const status = ahlsellCatalogStatusFromPayload(payload);
        if (status) onCatalogResult(requirementId, status);
      })
      .catch((error) => {
        if (error instanceof Error && error.name === "AbortError") return;
        setCatalogError(error instanceof Error ? error.message : "Ahlsell-søket mislyktes.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingCatalog(false);
      });

    return () => controller.abort();
  }, [onCatalogResult, projectId, requirementId]);

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
  const mergedCandidates = (catalogResult?.candidates ?? guide.directCandidates)
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

  return (
    <section aria-label="Ahlsellprodukter">
      {loadingCatalog && (
        <div className="flex min-h-16 items-center justify-center gap-2 border-t border-neutral-200 bg-neutral-50 px-3 py-3 text-sm font-bold text-neutral-800" role="status">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Søker automatisk på Ahlsells nettsted…
        </div>
      )}

      {catalogError && (
        <div className="border-t border-neutral-300 bg-neutral-50 px-3 py-3 text-xs leading-5 text-neutral-950 sm:px-4" role="alert">
          <p className="font-bold">Produktlisten kunne ikke hentes.</p>
          <p>{catalogError}  Du kan søke manuelt via ”Legg til produkt”.</p>
        </div>
      )}

      {!loadingCatalog && catalogResult?.publicSearchStatus && catalogResult.publicSearchStatus !== "available" && (
        <div className="border-t border-neutral-300 bg-neutral-50 px-3 py-2 text-xs leading-5 text-neutral-950 sm:px-4" role="status">
          {catalogResult.publicSearchStatus === "unavailable"
            ? "Ahlsells nettsted kunne ikke nås. Produktforslagene fra MLDL finnes igjen."
            : "En del av Ahlsell-søket kunne ikke fullføres. MLDL og de hentede nettreffene vises."}
        </div>
      )}

      {!loadingCatalog && !catalogError && catalogResult?.truncated && (
        <div className="border-t border-neutral-300 bg-neutral-50 px-3 py-2 text-xs font-semibold leading-5 text-neutral-950 sm:px-4">

          Flere treff finnes hos Ahlsell. Listen inneholder alle samsvarende produkter fra den avgrensede søket.
        </div>
      )}

      {filteredMemories.length > 0 && (
        <div className="border-t border-neutral-300" role="group" aria-label="Tidligere bekreftede produkter">
          <div className={memoriesAreExact ? "bg-neutral-100/80 px-3 py-2 sm:px-4" : "bg-neutral-50 px-3 py-2 sm:px-4"}>
            <p className={memoriesAreExact ? "flex items-center gap-1.5 text-xs font-bold text-neutral-900" : "flex items-center gap-1.5 text-xs font-bold text-neutral-900"}>
              {memoriesAreExact ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : <AlertTriangle className="h-4 w-4" aria-hidden="true" />}
              {memoriesAreExact ? "Eksakt treff fra tidligere bekreftede valg" : "Tidligere valg finnes, men PDF-opplysningene må kontrolleres"}
            </p>
            <p className="mt-0.5 text-xs text-neutral-600">Valget må godkjennes på nytt i dette prosjekt.</p>
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
                      <p className="mt-0.5 text-xs font-bold text-neutral-800">NRF-nummer {articleNumber}</p>
                      <p className={memoriesAreExact ? "mt-1 flex items-center gap-1.5 text-xs font-bold text-neutral-800" : "mt-1 flex items-center gap-1.5 text-xs font-bold text-neutral-900"}>
                        {memoriesAreExact ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> : <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />}
                        {memoriesAreExact ? "Eksakt treff · tidligere bekreftet" : "Tidligere bekreftet · kontroll kreves"}
                      </p>
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
                          productSubtitle: resolvedSubtitle
                        })}
                        aria-label={`${isSelected ? "Fjern valget av" : "Velg"} tidligere bekreftet produkt ${productName}, NRF-nummer ${articleNumber}`}
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
        onSearch={onSearch}
        onCheckRequirement={onCheckRequirement}
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
    "Vennligst kom tilbake med egnet produkt og NRF-nummer."
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

async function fetchAhlsellProductLabels(
  projectId: string,
  items: AhlsellProductLabelItem[],
  signal?: AbortSignal
) {
  const labels: Record<string, AhlsellProductLabel> = {};
  for (let index = 0; index < items.length; index += MAX_AHLSELL_PRODUCT_LABEL_ITEMS) {
    const batch = items.slice(index, index + MAX_AHLSELL_PRODUCT_LABEL_ITEMS);
    const response = await fetch(`/api/projects/${projectId}/ahlsell-product-labels`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ items: batch }),
      signal
    });
    const payload = (await response.json().catch(() => null)) as {
      labels?: Record<string, AhlsellProductLabel>;
      error?: string;
    } | null;
    if (!response.ok) {
      throw new Error(payload?.error ?? "Ahlsells produkttekster kunne ikke hentes.");
    }
    Object.assign(labels, payload?.labels ?? {});
  }
  return labels;
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
