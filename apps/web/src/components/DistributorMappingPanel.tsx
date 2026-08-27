"use client";

import { useEffect, useMemo, useRef, useState, type DragEvent as ReactDragEvent } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, CircleX, Download, ExternalLink, FileText, GripVertical, History, Loader2, Mail, PackagePlus, Paperclip, Plus, RotateCcw, Search, ShieldCheck, SlidersHorizontal, Tag, Trash2, Upload, X } from "lucide-react";
import { Button } from "@/components/Button";
import { buildAhlsellRequirementGuide, type AhlsellPublicCandidate, type AhlsellRequirementGuide } from "@/lib/ahlsell-public-match";
import type { AhlsellCatalogResult } from "@/lib/ahlsell-public-catalog";
import { isUserApprovedProductAssignment } from "@/lib/approved-product-assignment";
import { resolveDistributorProductName } from "@/lib/distributor-product-mapping";
import {
  isProductRequirementResolvedWithoutProduct,
  productRequirementResolution,
  type ProductRequirementResolutionStatus
} from "@/lib/product-requirement-resolution";
import { formatProjectQuantity, projectRequirementQuantity } from "@/lib/project-requirement-quantity";
import { projectRequirementDetails, projectRequirementSystemLabel, specificationLabel } from "@/lib/project-requirement-details";
import { splitDistributorRequirementLines } from "@/lib/distributor-requirement-lines";
import { ahlsellCatalogStatusFromPayload, splitAhlsellMatchGroups, type AhlsellCatalogMatchStatus, type AhlsellMatchGroup } from "@/lib/ahlsell-match-groups";
import { orderAhlsellCandidatesForDisplay } from "@/lib/ahlsell-candidate-ranking";
import { filterAhlsellCandidatesByNrf, normalizeNrfNumber } from "@/lib/product-card-candidates";
import {
  accessoriesForSelectedProduct,
  newProductAccessoryDraft,
  productAccessoryDraftError,
  productAccessoryPayload,
  readProductAccessoryDrafts,
  type ProductAccessoryDraft
} from "@/lib/product-card-accessories";
import {
  PRODUCT_REQUIREMENT_CATEGORIES,
  productRequirementCategory,
  productRequirementCategoryLabel,
  sortProductRequirementsByCategory,
  type ProductRequirementCategory
} from "@/lib/product-requirement-category";
import {
  projectRequirementSourcePdfHref,
  type ProjectSourcePdfLookup
} from "@/lib/project-source-pdf";
import {
  DEFAULT_PRODUCT_TABLE_LAYOUT,
  isProductTableColumnLocked,
  moveProductTableColumn,
  moveProductTableColumnByOffset,
  normalizeProductTableLayout,
  parseProductTableLayout,
  PRODUCT_TABLE_COLUMN_IDS,
  PRODUCT_TABLE_LAYOUT_STORAGE_KEY,
  setProductTableColumnVisible,
  type ProductTableColumnId,
  type ProductTableLayout
} from "@/lib/product-table-layout";

type Row = Record<string, unknown> & { id: string };
type ProductSelection = {
  productName: string;
  productNumber: string;
  manufacturerName: string;
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
type ProductTableSortKey = ProductTableColumnId;
type ProductTableSort = { key: ProductTableSortKey; direction: "asc" | "desc" };

type ProductTableColumnDefinition = {
  label: string;
  className: string;
  align?: "left" | "center";
  minimumWidth: number;
};

const PRODUCT_TABLE_COLUMNS: Record<ProductTableColumnId, ProductTableColumnDefinition> = {
  control: { label: "Kontroll", className: "w-16 text-center", align: "center", minimumWidth: 72 },
  post: { label: "PDF-post", className: "w-28", minimumWidth: 120 },
  requirement: { label: "Produktkrav", className: "min-w-64", minimumWidth: 320 },
  category: { label: "Produktgrupp", className: "w-36", minimumWidth: 160 },
  quantity: { label: "Mängd", className: "w-24", minimumWidth: 104 },
  product: { label: "Vald produkt", className: "w-48", minimumWidth: 208 }
};

const productTableCollator = new Intl.Collator("sv-SE", { numeric: true, sensitivity: "base" });

export function DistributorMappingPanel({ projectId, requirements, assignments, memories, sourcePdfLookup, onReload, onGoToDocuments, onFinish, finishing = false }: {
  projectId: string;
  requirements: Row[];
  assignments: Row[];
  memories: Row[];
  sourcePdfLookup: ProjectSourcePdfLookup;
  onReload: () => Promise<unknown>;
  onGoToDocuments: () => void;
  onFinish: () => Promise<void>;
  finishing?: boolean;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { productRequirements, removalRequirements, workRequirements } = useMemo(
    () => splitDistributorRequirementLines(requirements),
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
    () => new Set(productRequirements
      .filter(isProductRequirementResolvedWithoutProduct)
      .map((requirement) => requirement.id)),
    [productRequirements]
  );
  const handledRequirementIds = useMemo(
    () => new Set([...approvedRequirementIds, ...resolvedRequirementIds]),
    [approvedRequirementIds, resolvedRequirementIds]
  );
  const remainingRequirements = useMemo(
    () => productRequirements.filter((requirement) => !handledRequirementIds.has(requirement.id)),
    [handledRequirementIds, productRequirements]
  );
  const memoryFingerprints = useMemo(() => new Set(
    memories.flatMap((memory) => typeof memory.requirement_fingerprint === "string"
      ? [memory.requirement_fingerprint]
      : [])
  ), [memories]);
  const preferredMemoryByFingerprint = useMemo(() => {
    const preferred = new Map<string, Row>();
    for (const memory of memories) {
      const fingerprint = typeof memory.requirement_fingerprint === "string"
        ? memory.requirement_fingerprint
        : null;
      if (fingerprint && !preferred.has(fingerprint)) preferred.set(fingerprint, memory);
    }
    return preferred;
  }, [memories]);
  const staticallySafeRequirementIds = useMemo(() => new Set(productRequirements.flatMap((requirement) => {
    const fingerprint = typeof requirement.mapping_fingerprint === "string" ? requirement.mapping_fingerprint : null;
    const safe = handledRequirementIds.has(requirement.id)
      || Boolean(fingerprint && memoryFingerprints.has(fingerprint))
      || buildAhlsellRequirementGuide(requirement).directCandidates.length > 0;
    return safe ? [requirement.id] : [];
  })), [handledRequirementIds, memoryFingerprints, productRequirements]);
  const catalogCheckRequirementIds = useMemo(
    () => productRequirements
      .filter((requirement) => !staticallySafeRequirementIds.has(requirement.id))
      .map((requirement) => requirement.id),
    [productRequirements, staticallySafeRequirementIds]
  );
  const catalogCheckKey = useMemo(() => catalogCheckRequirementIds.join(","), [catalogCheckRequirementIds]);
  const [catalogStatuses, setCatalogStatuses] = useState<Record<string, AhlsellCatalogMatchStatus>>({});

  useEffect(() => {
    const controller = new AbortController();
    const requirementIds = catalogCheckKey ? catalogCheckKey.split(",") : [];
    let nextIndex = 0;

    async function worker() {
      let statusBatch: Record<string, AhlsellCatalogMatchStatus> = {};
      const flush = () => {
        if (Object.keys(statusBatch).length === 0 || controller.signal.aborted) return;
        const completedBatch = statusBatch;
        statusBatch = {};
        setCatalogStatuses((current) => ({ ...current, ...completedBatch }));
      };
      while (!controller.signal.aborted) {
        const requirementId = requirementIds[nextIndex];
        nextIndex += 1;
        if (!requirementId) {
          flush();
          return;
        }
        try {
          const response = await fetch(`/api/projects/${projectId}/requirements/${requirementId}/ahlsell-candidates?classification=1`, {
            signal: controller.signal,
            headers: { Accept: "application/json" }
          });
          if (!response.ok) continue;
          const payload = await response.json().catch(() => null);
          const classification = ahlsellCatalogStatusFromPayload(payload);
          if (!classification) continue;
          statusBatch[requirementId] = classification;
          if (Object.keys(statusBatch).length >= 4) flush();
        } catch (error) {
          if (error instanceof Error && error.name === "AbortError") return;
        }
      }
    }

    void Promise.all(Array.from({ length: Math.min(3, requirementIds.length) }, () => worker()));
    return () => controller.abort();
  }, [catalogCheckKey, projectId]);

  const { greenRequirements, yellowRequirements, redRequirements } = useMemo(
    () => splitAhlsellMatchGroups(productRequirements, {
      approvedRequirementIds: handledRequirementIds,
      memoryFingerprints,
      catalogStatuses,
      staticallySafeRequirementIds
    }),
    [catalogStatuses, handledRequirementIds, memoryFingerprints, productRequirements, staticallySafeRequirementIds]
  );
  const groupByRequirementId = useMemo(() => new Map<string, AhlsellMatchGroup>([
    ...greenRequirements.map((requirement) => [requirement.id, "green"] as const),
    ...yellowRequirements.map((requirement) => [requirement.id, "yellow"] as const),
    ...redRequirements.map((requirement) => [requirement.id, "red"] as const)
  ]), [greenRequirements, redRequirements, yellowRequirements]);
  const [selectedProductCategories, setSelectedProductCategories] = useState<ProductRequirementCategory[] | null>(null);
  const [productTableSort, setProductTableSort] = useState<ProductTableSort | null>(null);
  const [productTableLayout, setProductTableLayout] = useState<ProductTableLayout>(() => normalizeProductTableLayout(DEFAULT_PRODUCT_TABLE_LAYOUT));
  const [productTableLayoutLoaded, setProductTableLayoutLoaded] = useState(false);
  const [productTableLayoutEditorOpen, setProductTableLayoutEditorOpen] = useState(false);
  const [draggedProductTableColumn, setDraggedProductTableColumn] = useState<ProductTableColumnId | null>(null);
  const [productTableLayoutAnnouncement, setProductTableLayoutAnnouncement] = useState("");
  const [selectedRequirementIds, setSelectedRequirementIds] = useState<Set<string>>(() => new Set());
  const totalPosts = productRequirements.length + workRequirements.length + removalRequirements.length;
  const [activeRequirementId, setActiveRequirementId] = useState<string | null>(null);
  const [productCardSaving, setProductCardSaving] = useState(false);
  const [productCardDirty, setProductCardDirty] = useState(false);
  const productDialogRef = useRef<HTMLDialogElement>(null);
  const visibleProductTableColumns = productTableLayout.order.filter(
    (columnId) => !productTableLayout.hidden.includes(columnId)
  );
  const productTableMinimumWidth = Math.max(
    640,
    112 + visibleProductTableColumns.reduce(
      (total, columnId) => total + PRODUCT_TABLE_COLUMNS[columnId].minimumWidth,
      0
    )
  );

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        setProductTableLayout(parseProductTableLayout(window.localStorage.getItem(PRODUCT_TABLE_LAYOUT_STORAGE_KEY)));
      } catch {
        setProductTableLayout(normalizeProductTableLayout(DEFAULT_PRODUCT_TABLE_LAYOUT));
      } finally {
        setProductTableLayoutLoaded(true);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!productTableLayoutLoaded) return;
    try {
      window.localStorage.setItem(PRODUCT_TABLE_LAYOUT_STORAGE_KEY, JSON.stringify(productTableLayout));
    } catch {
      // The customized table still works for this session when browser storage is unavailable.
    }
  }, [productTableLayout, productTableLayoutLoaded]);
  const allQueueRequirements = useMemo(
    () => sortProductRequirementsByCategory(productRequirements),
    [productRequirements]
  );
  const productCategoryCounts = useMemo(() => {
    const counts = new Map<ProductRequirementCategory, number>();
    for (const requirement of allQueueRequirements) {
      const category = productRequirementCategory(requirement);
      counts.set(category, (counts.get(category) ?? 0) + 1);
    }
    return counts;
  }, [allQueueRequirements]);
  const availableProductCategories = useMemo(
    () => PRODUCT_REQUIREMENT_CATEGORIES.filter(
      (category) => (productCategoryCounts.get(category.id) ?? 0) > 0
    ),
    [productCategoryCounts]
  );
  const queueRequirements = useMemo(() => {
    const filteredRequirements = selectedProductCategories === null
      ? allQueueRequirements
      : allQueueRequirements.filter((requirement) => selectedProductCategories.includes(productRequirementCategory(requirement)));
    if (!productTableSort) return filteredRequirements;

    const direction = productTableSort.direction === "asc" ? 1 : -1;
    return filteredRequirements
      .map((requirement, originalIndex) => ({
        requirement,
        originalIndex,
        value: productTableSortValue(
          requirement,
          productTableSort.key,
          approvedRequirementIds.has(requirement.id),
          groupByRequirementId.get(requirement.id) ?? "yellow",
          approvedAssignmentByRequirementId.get(requirement.id),
          typeof requirement.mapping_fingerprint === "string"
            ? preferredMemoryByFingerprint.get(requirement.mapping_fingerprint)
            : undefined
        )
      }))
      .sort((left, right) => {
        if (left.value === null || right.value === null) {
          if (left.value === right.value) return left.originalIndex - right.originalIndex;
          return left.value === null ? 1 : -1;
        }
        const compared = typeof left.value === "number" && typeof right.value === "number"
          ? left.value - right.value
          : productTableCollator.compare(String(left.value), String(right.value));
        return compared === 0 ? left.originalIndex - right.originalIndex : compared * direction;
      })
      .map(({ requirement }) => requirement);
  }, [allQueueRequirements, approvedAssignmentByRequirementId, approvedRequirementIds, groupByRequirementId, preferredMemoryByFingerprint, productTableSort, selectedProductCategories]);
  const queuePositionById = useMemo(
    () => new Map(allQueueRequirements.map((requirement, index) => [requirement.id, index + 1])),
    [allQueueRequirements]
  );
  const selectedVisibleRequirements = queueRequirements.filter((requirement) => selectedRequirementIds.has(requirement.id));
  const allVisibleRequirementsSelected = queueRequirements.length > 0
    && selectedVisibleRequirements.length === queueRequirements.length;
  const requestedActiveIndex = queueRequirements.findIndex((requirement) => requirement.id === activeRequirementId);
  const activeIndex = requestedActiveIndex;
  const activeRequirement = activeIndex >= 0 ? queueRequirements[activeIndex] : undefined;
  const productCardOpen = Boolean(activeRequirement);

  useEffect(() => {
    const dialog = productDialogRef.current;
    if (!dialog || !productCardOpen || dialog.open) return;
    dialog.showModal();
  }, [productCardOpen]);

  useEffect(() => {
    if (!productCardOpen) return;
    const previousBodyOverflow = document.body.style.overflow;
    const previousRootOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousRootOverflow;
    };
  }, [productCardOpen]);

  useEffect(() => {
    if (!productCardOpen || !productCardDirty) return;
    const protectUnsavedProduct = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", protectUnsavedProduct);
    return () => window.removeEventListener("beforeunload", protectUnsavedProduct);
  }, [productCardDirty, productCardOpen]);

  const handledCount = productRequirements.length - remainingRequirements.length;
  const visibleQueueRemainingCount = queueRequirements.filter(
    (requirement) => !handledRequirementIds.has(requirement.id)
  ).length;
  const checkedCatalogCount = catalogCheckRequirementIds.filter((requirementId) => catalogStatuses[requirementId]).length;
  const catalogChecksRemaining = Math.max(0, catalogCheckRequirementIds.length - checkedCatalogCount);
  const matchedRequirementCount = greenRequirements.length + yellowRequirements.length;
  const ahlsellCoveragePercent = productRequirements.length > 0
    ? Math.round((matchedRequirementCount / productRequirements.length) * 100)
    : 0;
  const visibleHandledCount = queueRequirements.length - visibleQueueRemainingCount;
  const progressPercent = queueRequirements.length > 0
    ? Math.round((visibleHandledCount / queueRequirements.length) * 100)
    : 100;

  function showRequirement(requirementId: string) {
    if (productCardSaving) return;
    if (activeRequirementId && activeRequirementId !== requirementId && !confirmDiscardProductChanges()) return;
    setProductCardDirty(false);
    setActiveRequirementId(requirementId);
    setMessage(null);
    setError(null);
    window.requestAnimationFrame(() => document.getElementById("product-card-scroll")?.scrollTo({ top: 0, behavior: "smooth" }));
  }

  function toggleProductCategory(category: ProductRequirementCategory) {
    setSelectedProductCategories((current) => current === null
      ? [category]
      : current.includes(category)
        ? current.filter((item) => item !== category)
        : [...current, category]
    );
    setActiveRequirementId(null);
    setSelectedRequirementIds(new Set());
    setMessage(null);
    setError(null);
  }

  function showAllProductCategories() {
    setSelectedProductCategories(null);
    setActiveRequirementId(null);
    setSelectedRequirementIds(new Set());
    setMessage(null);
    setError(null);
  }

  function closeRequirement() {
    if (productCardSaving) return;
    if (!confirmDiscardProductChanges()) return;
    if (productDialogRef.current?.open) productDialogRef.current.close();
    setProductCardDirty(false);
    setActiveRequirementId(null);
    setMessage(null);
    setError(null);
  }

  function confirmDiscardProductChanges() {
    if (!productCardDirty) return true;
    return window.confirm("Du har osparade ändringar i produktkortet. Tryck Avbryt för att fortsätta och spara, eller OK för att stänga utan att spara.");
  }

  function toggleRequirementSelection(requirementId: string, selected: boolean) {
    setSelectedRequirementIds((current) => {
      const next = new Set(current);
      if (selected) next.add(requirementId);
      else next.delete(requirementId);
      return next;
    });
  }

  function toggleAllVisibleRequirements(selected: boolean) {
    setSelectedRequirementIds(selected
      ? new Set(queueRequirements.map((requirement) => requirement.id))
      : new Set());
  }

  function toggleProductTableSort(key: ProductTableSortKey) {
    setProductTableSort((current) => current?.key === key
      ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
      : { key, direction: "asc" }
    );
  }

  function announceProductTableColumnPosition(columnId: ProductTableColumnId, layout: ProductTableLayout) {
    const position = layout.order.indexOf(columnId) + 1;
    setProductTableLayoutAnnouncement(
      `${PRODUCT_TABLE_COLUMNS[columnId].label} flyttad till plats ${position} av ${layout.order.length}.`
    );
  }

  function moveProductTableColumnTo(columnId: ProductTableColumnId, targetColumnId: ProductTableColumnId, placement: "before" | "after") {
    const nextLayout = moveProductTableColumn(productTableLayout, columnId, targetColumnId, placement);
    setProductTableLayout(nextLayout);
    announceProductTableColumnPosition(columnId, nextLayout);
  }

  function moveProductTableColumnOneStep(columnId: ProductTableColumnId, offset: -1 | 1) {
    const nextLayout = moveProductTableColumnByOffset(productTableLayout, columnId, offset);
    setProductTableLayout(nextLayout);
    announceProductTableColumnPosition(columnId, nextLayout);
  }

  function setProductTableColumnVisibility(columnId: ProductTableColumnId, visible: boolean) {
    const nextLayout = setProductTableColumnVisible(productTableLayout, columnId, visible);
    setProductTableLayout(nextLayout);
    if (!visible && productTableSort?.key === columnId) setProductTableSort(null);
    setProductTableLayoutAnnouncement(
      `${PRODUCT_TABLE_COLUMNS[columnId].label} ${visible ? "visas" : "är dold"}.`
    );
  }

  function resetProductTableLayout() {
    setProductTableLayout(normalizeProductTableLayout(DEFAULT_PRODUCT_TABLE_LAYOUT));
    setProductTableSort(null);
    setProductTableLayoutAnnouncement("Standardvyn är återställd.");
  }

  function startProductTableColumnDrag(event: ReactDragEvent, columnId: ProductTableColumnId) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", columnId);
    setDraggedProductTableColumn(columnId);
  }

  function dropProductTableColumn(event: ReactDragEvent, targetColumnId: ProductTableColumnId) {
    event.preventDefault();
    const transferredColumnId = event.dataTransfer.getData("text/plain");
    const sourceColumnId = PRODUCT_TABLE_COLUMN_IDS.find(
      (columnId) => columnId === (draggedProductTableColumn ?? transferredColumnId)
    );
    const targetBounds = event.currentTarget.getBoundingClientRect();
    const placement = event.clientX >= targetBounds.left + targetBounds.width / 2 ? "after" : "before";
    if (sourceColumnId) moveProductTableColumnTo(sourceColumnId, targetColumnId, placement);
    setDraggedProductTableColumn(null);
  }

  return (
    <section className="space-y-6">
      <div className="rounded-2xl border border-cyan-300/20 bg-[#06213d] p-5 text-white shadow-[0_16px_35px_rgba(2,17,38,0.12)] sm:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-sm font-bold uppercase tracking-[0.08em] text-cyan-300">Steg 2 av 3 · Välj produkter</p>
            <h2 className="mt-2 text-2xl font-bold text-white sm:text-3xl">
              {remainingRequirements.length === 0 ? "Alla produktposter är hanterade" : `Hantera ${remainingRequirements.length} ${remainingRequirements.length === 1 ? "produktpost" : "produktposter"}`}
            </h2>
            <p className="mt-3 text-base leading-7 text-slate-300">
              Kontrollera PDF-kravet och godkänn rätt artikel. Om Ahlsell saknar varan kan du märka posten som ”Inte i sortiment”.
            </p>
          </div>
          <div className="grid min-w-[250px] grid-cols-3 overflow-hidden rounded-xl border border-flow-200 bg-white text-center shadow-sm">
            <StatusNumber value={productRequirements.length} label="Produktval" />
            <StatusNumber value={handledCount} label="Hanterade" tone="success" />
            <StatusNumber value={remainingRequirements.length} label="Att hantera" tone="warning" />
          </div>
        </div>
        <div className="mt-5 flex max-w-3xl items-start gap-3 rounded-xl border border-cyan-300/30 bg-white/10 p-4 text-sm font-semibold leading-6 text-cyan-50">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-cyan-300" aria-hidden="true" />
          <p>Du bestämmer alltid själv. Godkänn en verifierad produkt eller märk raden som Inte i sortiment när Ahlsell saknar varan.</p>
        </div>
      </div>

      {productRequirements.length > 0 && (
        <section id="product-table" aria-labelledby="product-table-heading" className="scroll-mt-5 overflow-hidden rounded-xl border border-ink-200 bg-white shadow-sm">
          <div className="flex flex-col gap-2 border-b border-ink-200 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 id="product-table-heading" className="text-xl font-black text-ink-950">Produktposter ({queueRequirements.length})</h3>
              <p className="mt-0.5 text-xs font-semibold text-ink-600">
                {catalogChecksRemaining > 0
                  ? `Scipx kontrollerar Ahlsell för ${catalogChecksRemaining} ${catalogChecksRemaining === 1 ? "post" : "poster"}.`
                  : `Ahlsellträff för ${matchedRequirementCount} av ${productRequirements.length} poster (${ahlsellCoveragePercent} %).`}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {selectedVisibleRequirements.length > 0 && <span className="rounded-full bg-flow-100 px-2.5 py-1 text-xs font-black text-flow-900">{selectedVisibleRequirements.length} valda</span>}
              <Button
                type="button"
                variant="secondary"
                aria-expanded={productTableLayoutEditorOpen}
                aria-controls="product-table-layout-editor"
                className="min-h-9 px-3 py-1.5 text-sm"
                disabled={!productTableLayoutLoaded}
                onClick={() => setProductTableLayoutEditorOpen((open) => !open)}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
                Anpassa tabell
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 border-b border-ink-200 bg-ink-50/70 px-4 py-2" role="group" aria-label="Filtrera produkter efter produktgrupp">
            <ProductCategoryButton active={selectedProductCategories === null} count={allQueueRequirements.length} label="Alla" onClick={showAllProductCategories} />
            {availableProductCategories.map((category) => (
              <ProductCategoryButton key={category.id} active={selectedProductCategories?.includes(category.id) ?? false} count={productCategoryCounts.get(category.id) ?? 0} label={category.shortLabel} onClick={() => toggleProductCategory(category.id)} />
            ))}
          </div>

          {productTableLayoutLoaded && productTableLayoutEditorOpen && (
            <section id="product-table-layout-editor" aria-labelledby="product-table-layout-heading" className="border-b border-ink-200 bg-white px-4 py-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h4 id="product-table-layout-heading" className="text-sm font-black text-ink-950">Anpassa tabellvyn</h4>
                  <p className="mt-1 text-xs leading-5 text-ink-600">Dra i handtaget eller använd pilarna för att flytta kolumner. Dina val sparas i den här webbläsaren.</p>
                </div>
                <Button type="button" variant="secondary" className="min-h-9 shrink-0 px-3 py-1.5 text-sm" onClick={resetProductTableLayout}>
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  Återställ standardvy
                </Button>
              </div>
              <ol className="mt-3 grid gap-2 lg:grid-cols-2 xl:grid-cols-3">
                {productTableLayout.order.map((columnId, index) => {
                  const column = PRODUCT_TABLE_COLUMNS[columnId];
                  const locked = isProductTableColumnLocked(columnId);
                  const visible = !productTableLayout.hidden.includes(columnId);
                  return (
                    <li
                      key={columnId}
                      onDragOver={(event) => {
                        event.preventDefault();
                        event.dataTransfer.dropEffect = "move";
                      }}
                      onDrop={(event) => dropProductTableColumn(event, columnId)}
                      className={draggedProductTableColumn === columnId
                        ? "flex min-h-12 items-center gap-2 rounded-lg border-2 border-flow-500 bg-flow-50 px-2 py-1.5 opacity-70"
                        : "flex min-h-12 items-center gap-2 rounded-lg border border-ink-200 bg-ink-50 px-2 py-1.5"}
                    >
                      <span
                        draggable
                        aria-hidden="true"
                        title={`Dra för att flytta ${column.label}`}
                        onDragStart={(event) => startProductTableColumnDrag(event, columnId)}
                        onDragEnd={() => setDraggedProductTableColumn(null)}
                        className="inline-flex h-9 w-8 shrink-0 cursor-grab items-center justify-center rounded-md text-ink-500 active:cursor-grabbing"
                      >
                        <GripVertical className="h-5 w-5" />
                      </span>
                      <label className="flex min-w-0 flex-1 items-center gap-2 text-sm font-bold text-ink-900">
                        <input
                          type="checkbox"
                          checked={visible}
                          disabled={locked}
                          onChange={(event) => setProductTableColumnVisibility(columnId, event.target.checked)}
                          className="h-4 w-4 rounded border-ink-300 text-flow-700 focus:ring-flow-500 disabled:opacity-50"
                        />
                        <span className="truncate">{column.label}</span>
                        {locked && <span className="sr-only">Alltid synlig</span>}
                      </label>
                      <button type="button" disabled={index === 0} onClick={() => moveProductTableColumnOneStep(columnId, -1)} aria-label={`Flytta ${column.label} åt vänster`} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-ink-700 transition hover:bg-white hover:text-flow-800 disabled:cursor-not-allowed disabled:opacity-30"><ChevronLeft className="h-4 w-4" aria-hidden="true" /></button>
                      <button type="button" disabled={index === productTableLayout.order.length - 1} onClick={() => moveProductTableColumnOneStep(columnId, 1)} aria-label={`Flytta ${column.label} åt höger`} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-ink-700 transition hover:bg-white hover:text-flow-800 disabled:cursor-not-allowed disabled:opacity-30"><ChevronRight className="h-4 w-4" aria-hidden="true" /></button>
                    </li>
                  );
                })}
              </ol>
              <p role="status" aria-live="polite" className="sr-only">{productTableLayoutAnnouncement}</p>
            </section>
          )}

          {queueRequirements.length > 0 ? (
            productTableLayoutLoaded ? (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left" style={{ minWidth: `${productTableMinimumWidth}px` }}>
                <thead className="bg-ink-50 text-[11px] font-black uppercase tracking-[0.04em] text-ink-600">
                  <tr>
                    <th className="w-11 border-b border-r border-ink-200 px-3 py-2 text-center"><input type="checkbox" aria-label="Välj alla synliga produktposter" checked={allVisibleRequirementsSelected} onChange={(event) => toggleAllVisibleRequirements(event.target.checked)} className="h-4 w-4 rounded border-ink-300 text-flow-700 focus:ring-flow-500" /></th>
                    {visibleProductTableColumns.map((columnId) => {
                      const column = PRODUCT_TABLE_COLUMNS[columnId];
                      return (
                        <ProductSortHeader
                          key={columnId}
                          className={column.className}
                          align={column.align}
                          label={column.label}
                          sortKey={columnId}
                          sort={productTableSort}
                          dragging={draggedProductTableColumn === columnId}
                          onSort={toggleProductTableSort}
                          onDragStart={startProductTableColumnDrag}
                          onDragEnd={() => setDraggedProductTableColumn(null)}
                          onDragOver={(event) => {
                            event.preventDefault();
                            event.dataTransfer.dropEffect = "move";
                          }}
                          onDrop={(event) => dropProductTableColumn(event, columnId)}
                        />
                      );
                    })}
                    <th className="w-14 border-b border-ink-200 px-2 py-2 text-center">Öppna</th>
                  </tr>
                </thead>
                <tbody>
                  {queueRequirements.map((requirement) => (
                    <RequirementQueueRow
                      key={requirement.id}
                      requirement={requirement}
                      position={queuePositionById.get(requirement.id) ?? 1}
                      approved={approvedRequirementIds.has(requirement.id)}
                      group={groupByRequirementId.get(requirement.id) ?? "yellow"}
                      assignment={approvedAssignmentByRequirementId.get(requirement.id)}
                      memory={typeof requirement.mapping_fingerprint === "string" ? preferredMemoryByFingerprint.get(requirement.mapping_fingerprint) : undefined}
                      sourcePdfHref={projectRequirementSourcePdfHref(projectId, requirement, sourcePdfLookup)}
                      columns={visibleProductTableColumns}
                      selected={selectedRequirementIds.has(requirement.id)}
                      onSelectedChange={(selected) => toggleRequirementSelection(requirement.id, selected)}
                      onOpen={() => showRequirement(requirement.id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            ) : (
              <div className="flex min-h-28 items-center justify-center gap-2 p-5 text-sm font-bold text-ink-700" role="status">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Laddar din tabellvy…
              </div>
            )
          ) : (
            <div className="p-5 text-center"><p className="font-bold text-ink-950">Ingen produktgrupp är vald.</p><p className="mt-1 text-sm text-ink-700">Välj en grupp ovan eller tryck på Alla.</p></div>
          )}
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
            const activeGroup = groupByRequirementId.get(requirement.id) ?? "yellow";
            const assignment = approvedAssignmentByRequirementId.get(requirement.id);
            const matchingMemories = memories.filter((memory) => memory.requirement_fingerprint === requirement.mapping_fingerprint).slice(0, 3);
            return (
              <dialog
                ref={productDialogRef}
                aria-label={`Produktval för PDF-post ${projectRequirementDetails(requirement).postNumber ?? activeIndex + 1}`}
                className="fixed inset-0 m-0 h-[100dvh] max-h-none w-screen max-w-none overflow-hidden border-0 bg-white p-0 shadow-none backdrop:bg-ink-950/65 backdrop:backdrop-blur-sm"
                onCancel={(event) => {
                  event.preventDefault();
                  closeRequirement();
                }}
              >
                <div id="product-work-queue" className="flex h-full w-full flex-col overflow-hidden">
                  <nav aria-label="Navigera mellan produktposter" className="shrink-0 border-b border-ink-200 bg-white px-3 py-2.5 sm:px-4 sm:py-3">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div className="flex items-center gap-3">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-ink-50">
                          {activeGroup === "red" ? <CircleX className="h-5 w-5 text-rose-600" aria-hidden="true" /> : <AlertTriangle className="h-5 w-5 text-amber-600" aria-hidden="true" />}
                        </span>
                        <div>
                          <p className={activeGroup === "red" ? "text-xs font-bold uppercase tracking-[0.08em] text-rose-700" : "text-xs font-bold uppercase tracking-[0.08em] text-amber-800"}>{activeGroup === "red" ? "Produkten hittas inte hos Ahlsell" : "Produkten måste ses över"}</p>
                          <p className="mt-0.5 text-sm font-bold text-ink-950 sm:text-base">Produkt {activeIndex + 1} av {queueRequirements.length} · {visibleQueueRemainingCount} kvar i visningen</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button variant="secondary" className="min-h-10 justify-center px-3 py-2" disabled={productCardSaving || activeIndex === 0} onClick={() => showRequirement(queueRequirements[activeIndex - 1].id)}><ChevronLeft className="h-4 w-4" aria-hidden="true" />Föregående</Button>
                        <Button variant="secondary" className="min-h-10 justify-center px-3 py-2" disabled={productCardSaving || activeIndex === queueRequirements.length - 1} onClick={() => showRequirement(queueRequirements[activeIndex + 1].id)}>Nästa<ChevronRight className="h-4 w-4" aria-hidden="true" /></Button>
                        <Button autoFocus variant="secondary" className="min-h-10 justify-center px-3 py-2" disabled={productCardSaving} onClick={closeRequirement}>{productCardSaving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <X className="h-4 w-4" aria-hidden="true" />}{productCardSaving ? "Sparar…" : "Stäng kortet"}</Button>
                      </div>
                    </div>
                    <div
                      role="progressbar"
                      aria-label="Hanterade produktposter"
                      aria-valuenow={progressPercent}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      className="mt-2 h-1 overflow-hidden rounded-full bg-ink-100"
                    >
                      <div className="h-full rounded-full bg-emerald-500 transition-[width] duration-300" style={{ width: `${progressPercent}%` }} />
                    </div>
                    {(message || error) && (
                      <div role="status" aria-live="polite" className={error ? "mt-3 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-900" : "mt-3 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-900"}>
                        {error ?? message}
                      </div>
                    )}
                  </nav>
                  <div id="product-card-scroll" className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-white p-0 lg:overflow-hidden">
                    <RequirementProductMappingCard
                      key={`${requirement.id}:${String(assignment?.updated_at ?? "new")}`}
                      projectId={projectId}
                      requirement={requirement}
                      assignment={assignment}
                      sourcePdfHref={projectRequirementSourcePdfHref(projectId, requirement, sourcePdfLookup)}
                      position={activeIndex + 1}
                      totalPosts={queueRequirements.length}
                      memories={matchingMemories}
                      onSavingChange={setProductCardSaving}
                      onDirtyChange={setProductCardDirty}
                      onSaved={async (successMessage) => {
                        setProductCardDirty(false);
                        setError(null);
                        setMessage(successMessage);
                        await onReload();
                        if (productDialogRef.current?.open) productDialogRef.current.close();
                        setActiveRequirementId(null);
                      }}
                      onError={(errorMessage) => { setMessage(null); setError(errorMessage || null); }}
                    />
                  </div>
                </div>
              </dialog>
            );
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
                  <NonProductRequirementCard key={requirement.id} requirement={requirement} position={productRequirements.length + workRequirements.length + index + 1} totalPosts={totalPosts} kind="remove" />
                ))}
              </div>
            </details>
          )}

          {workRequirements.length > 0 && (
            <details className="group rounded-2xl border-2 border-slate-300 bg-slate-50">
              <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 p-5 sm:p-6">
                <div>
                  <p className="text-sm font-bold uppercase tracking-[0.08em] text-slate-700">Arbetsmoment</p>
                  <h3 className="mt-1 text-xl font-bold text-ink-950">{workRequirements.length} {workRequirements.length === 1 ? "post" : "poster"} ska inte sökas som Ahlsell-produkter</h3>
                  <p className="mt-1 text-sm text-ink-700">Exempelvis håltagning, schaktning och totalsummor följer med i resultatet men påverkar inte produktträffarna.</p>
                </div>
                <span className="inline-flex shrink-0 items-center gap-2 rounded-full bg-white px-3 py-2 text-sm font-bold text-ink-800">Visa poster<ChevronDown className="h-5 w-5 transition group-open:rotate-180" aria-hidden="true" /></span>
              </summary>
              <div className="space-y-4 border-t border-slate-300 p-5 sm:p-6">
                {workRequirements.map((requirement, index) => (
                  <NonProductRequirementCard key={requirement.id} requirement={requirement} position={productRequirements.length + index + 1} totalPosts={totalPosts} kind="work" />
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
                  <p className="mt-2 text-base leading-7 text-emerald-900">Alla inköpsposter är antingen godkända med en produkt eller märkta som Inte i sortiment. Projektet kan nu slutföras.</p>
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
              <p className="text-lg font-bold text-flow-950">{remainingRequirements.length} {remainingRequirements.length === 1 ? "produktpost återstår" : "produktposter återstår"}</p>
              <p className="mt-1 text-base text-flow-800">Öppna varje post, kontrollera produktvalet och godkänn produkten eller märk posten som Inte i sortiment.</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function RequirementProductMappingCard({ projectId, requirement, assignment, sourcePdfHref, position, totalPosts, memories, onSavingChange, onDirtyChange, onSaved, onError }: {
  projectId: string;
  requirement: Row;
  assignment?: Row;
  sourcePdfHref: string | null;
  position: number;
  totalPosts: number;
  memories: Row[];
  onSavingChange: (saving: boolean) => void;
  onDirtyChange: (dirty: boolean) => void;
  onSaved: (message: string) => Promise<void>;
  onError: (message: string) => void;
}) {
  const currentSnapshot = record(assignment?.product_snapshot);
  const [productName, setProductName] = useState(String(currentSnapshot.name ?? ""));
  const [productNumber, setProductNumber] = useState(String(currentSnapshot.productNumber ?? ""));
  const [manufacturerName, setManufacturerName] = useState(String(currentSnapshot.manufacturer ?? ""));
  const [accessories, setAccessories] = useState<ProductAccessoryDraft[]>(() => readProductAccessoryDrafts(currentSnapshot.accessories));
  const [accessoryOwnerProductNumber, setAccessoryOwnerProductNumber] = useState(() => accessories.length > 0 ? productNumber : "");
  const [accessoriesExpanded, setAccessoriesExpanded] = useState(() => accessories.length > 0);
  const [saving, setSaving] = useState(false);
  const [hasUnapprovedChanges, setHasUnapprovedChanges] = useState(false);
  const [draftNotice, setDraftNotice] = useState<string | null>(null);
  const [memoryExpanded, setMemoryExpanded] = useState(false);
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
  const quantity = projectRequirementQuantity(requirement.value_json);
  const resolution = productRequirementResolution(requirement);
  const hasAttachmentDraft = Boolean(attachmentFile || attachmentComment.trim());
  const hasUnsavedChanges = hasUnapprovedChanges || hasAttachmentDraft;
  const selectedProductAccessories = accessoriesForSelectedProduct({
    currentProductNumber: accessoryOwnerProductNumber,
    nextProductNumber: productNumber,
    accessories
  });
  const accessoryError = productAccessoryDraftError(selectedProductAccessories);
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

  function selectionFromMemory(memory: Row): ProductSelection {
    return {
      productName: String(memory.product_name ?? ""),
      productNumber: String(memory.product_number ?? ""),
      manufacturerName: String(memory.manufacturer_name ?? "")
    };
  }

  function showSelection(selection: ProductSelection, notice: string) {
    const nextAccessories = accessoriesForSelectedProduct({
      currentProductNumber: accessoryOwnerProductNumber,
      nextProductNumber: selection.productNumber,
      accessories
    });
    setProductName(selection.productName);
    setProductNumber(selection.productNumber);
    setManufacturerName(selection.manufacturerName);
    setAccessories(nextAccessories);
    setAccessoryOwnerProductNumber(nextAccessories.length > 0 ? selection.productNumber : "");
    setAccessoriesExpanded(nextAccessories.length > 0);
    setHasUnapprovedChanges(true);
    setDraftNotice(notice);
    setMemoryExpanded(false);
  }

  function applyMemory(memory: Row) {
    showSelection(
      selectionFromMemory(memory),
      `Tidigare godkänd produkt har valts för kontroll: ${String(memory.product_name)} · NRF-nummer ${String(memory.product_number)}.`
    );
    onError("");
  }

  function applyAhlsellCandidate(candidate: AhlsellPublicCandidate) {
    showSelection({
      productName: candidate.productName,
      productNumber: candidate.articleNumber,
      manufacturerName: candidate.manufacturer
    }, `${candidate.recommendation === "recommended" ? "Rekommenderad produkt" : "Produkt"} har valts för kontroll: ${candidate.productName} · NRF-nummer ${candidate.articleNumber}.`);
    onError("");
  }

  function clearSelectedProduct() {
    setProductName("");
    setProductNumber("");
    setManufacturerName("");
    setDraftNotice(null);
    setHasUnapprovedChanges(true);
  }

  function changeProductNumber(nextProductNumber: string) {
    setProductNumber(nextProductNumber);
    setProductName("");
    setDraftNotice(null);
    setHasUnapprovedChanges(true);
  }

  function startManualProductEntry() {
    if (productNumber.trim()) clearSelectedProduct();
    window.requestAnimationFrame(() => document.getElementById(`product-number-${requirement.id}`)?.focus());
  }

  function showAllProductAlternatives() {
    if (productNumber.trim()) clearSelectedProduct();
    window.requestAnimationFrame(() => document.getElementById(`ahlsell-products-${requirement.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function addAccessory() {
    if (!productNumber.trim() || selectedProductAccessories.length >= 20) return;
    if (accessories.length > 0 && selectedProductAccessories.length === 0 && !window.confirm(`Tillbehören för NRF ${accessoryOwnerProductNumber} ersätts med tillbehör för NRF ${productNumber.trim()}. Vill du fortsätta?`)) return;
    const nextIndex = selectedProductAccessories.length;
    setAccessories([...selectedProductAccessories, newProductAccessoryDraft()]);
    setAccessoryOwnerProductNumber(productNumber);
    setAccessoriesExpanded(true);
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
      setAccessoriesExpanded(false);
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
      document.getElementById(`product-attachments-${requirement.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
      document.getElementById(`attachment-comment-${requirement.id}`)?.focus();
    });
  }

  async function save() {
    if (hasAttachmentDraft) {
      setAttachmentExpanded(true);
      setAttachmentError("Spara vedlegget eller töm fälten innan du godkänner produkten.");
      return;
    }
    if (accessoryError) {
      setAccessoriesExpanded(true);
      onError(accessoryError);
      return;
    }
    const sameApprovedProduct = Boolean(normalizeNrfNumber(productNumber)) && normalizeNrfNumber(productNumber) === normalizeNrfNumber(String(currentSnapshot.productNumber ?? ""));
    const chosen = {
      productName: resolveDistributorProductName({
        productName,
        requirementName: requirement.value_text,
        productNumber
      }),
      productNumber,
      manufacturerName,
      notes:
        sameApprovedProduct && typeof currentSnapshot.notes === "string"
          ? currentSnapshot.notes
          : "",
      accessories: productAccessoryPayload(selectedProductAccessories)
    };
    setSaving(true);
    onSavingChange(true);
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
      await onSaved(`Produkten för post ${details.postNumber ?? position} är godkänd och sparad för framtida projekt.`);
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
        body: JSON.stringify({ requirementId: requirement.id, resolution: nextResolution })
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

  return (
    <article id={`post-${requirement.id}`} className="min-h-0 bg-white lg:grid lg:h-full lg:grid-cols-[minmax(340px,0.9fr)_minmax(520px,1.15fr)]">
      <section aria-labelledby={`pdf-specification-${requirement.id}`} className="border-b border-ink-200 bg-ink-50/50 lg:min-h-0 lg:overflow-y-auto lg:border-b-0 lg:border-r">
        <div className="px-4 py-4 sm:px-6 sm:py-5">
          <div className="flex flex-wrap items-center gap-2">
            {resolution ? (
              <span className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-bold text-slate-800"><Tag className="h-3.5 w-3.5" aria-hidden="true" />{resolution.label}</span>
            ) : isApproved ? (
              <span className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-800"><CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />Godkänd</span>
            ) : (
              <span className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-900"><AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />Inte godkänd</span>
            )}
            {sourcePdfHref && (
              <a href={sourcePdfHref} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-ink-200 bg-white px-2.5 py-1 text-xs font-bold text-flow-800 transition hover:border-flow-500 hover:bg-flow-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-flow-600">
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                Öppna PDF{details.sourcePage ? ` · sida ${details.sourcePage}` : ""}
              </a>
            )}
          </div>

          <div className="mt-4">
            <p className="text-xs font-bold uppercase tracking-[0.08em] text-flow-700">Produkt {position} av {totalPosts}</p>
            <h3 id={`pdf-specification-${requirement.id}`} className="mt-1 text-xl font-bold text-ink-950">PDF-post {details.postNumber ?? "saknas"}</h3>
            <p className="mt-2 text-sm font-semibold leading-6 text-ink-800">{String(requirement.value_text ?? "Tekniskt krav")}</p>
          </div>

          <div className="mt-4 overflow-hidden rounded-md border border-ink-200 bg-white">
            <div className="border-b border-ink-200 px-4 py-3">
              <p className="text-xs font-bold uppercase tracking-[0.08em] text-flow-700">Fullständig specifikation från PDF</p>
              <p className="mt-1 text-xs leading-5 text-ink-600">Alla extraherade krav visas här medan du väljer produkt.</p>
            </div>
            <dl className="grid sm:grid-cols-2">
              <SpecificationRow label="PDF-postnummer" value={details.postNumber ?? "Saknas"} />
              <SpecificationRow label="Antal" value={formatProjectQuantity(quantity)} />
              {details.chapterPost && <SpecificationRow label="Kapitelpost" value={details.chapterPost} />}
              {details.parentPostNumber && <SpecificationRow label="Huvudpost" value={details.parentPostNumber} />}
              {details.nsCode && <SpecificationRow label="NS-kod" value={details.nsCode} />}
              {details.system && <SpecificationRow label="System" value={projectRequirementSystemLabel(details.system)} />}
              {details.standardRefs.length > 0 && <SpecificationRow label="Standarder" value={details.standardRefs.join(", ")} />}
              {pdfArticleNumber && <SpecificationRow label="NRF-nummer i PDF" value={pdfArticleNumber} />}
              {details.sourcePage && <SpecificationRow label="Källsida" value={String(details.sourcePage)} />}
              {details.attributes.map(([key, value]) => <SpecificationRow key={key} label={specificationLabel(key)} value={value} />)}
            </dl>
          </div>
        </div>
      </section>

      <fieldset disabled={saving || attachmentSaving} aria-busy={saving || attachmentSaving} className="m-0 min-w-0 border-0 p-0 lg:min-h-0 lg:overflow-y-auto">
        <div className="sticky top-0 z-20 border-b border-ink-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.08em] text-flow-700">Välj produkt</p>
              <h4 className="mt-0.5 text-base font-bold text-ink-950">Ahlsellprodukter för PDF-post {details.postNumber ?? position}</h4>
              <p className="mt-0.5 text-xs font-semibold text-ink-600">{hasUnsavedChanges ? "Osparade ändringar" : isApproved ? "Produkten är godkänd" : "Ingen produkt är godkänd ännu"}</p>
            </div>
            <Button aria-label="Godkänn och spara produkt" title={hasAttachmentDraft ? "Spara vedlegget först" : accessoryError ?? "Godkänn och spara produkt"} className="min-h-10 shrink-0 justify-center px-4 py-2 text-sm" type="button" onClick={() => void save()} disabled={saving || attachmentSaving || !productNumber.trim() || hasAttachmentDraft || Boolean(accessoryError)}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ShieldCheck className="h-4 w-4" aria-hidden="true" />}
              {saving ? "Sparar…" : "Godkänn och spara"}
            </Button>
          </div>
        </div>

        <div className="space-y-4 px-4 py-4 sm:px-6 sm:py-5">
          <section id={`product-selection-${requirement.id}`}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1">
                <ProductFormInput id={`product-number-${requirement.id}`} label="NRF-nummer" value={productNumber} onChange={changeProductNumber} required />
              </div>
              <div className="min-w-0 flex-1">
                <ProductFormInput id={`manufacturer-${requirement.id}`} label="Tillverkare" optional value={manufacturerName} onChange={(value) => { setManufacturerName(value); setHasUnapprovedChanges(true); }} />
              </div>
            </div>
            <p className="mt-2 text-xs leading-5 text-ink-600">Skriv ett NRF-nummer manuellt eller välj en produkt nedan. När ett nummer är ifyllt visas bara matchande produkter.</p>
            {draftNotice && hasUnapprovedChanges && (
              <div className="mt-3 flex items-start gap-2 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2.5" role="status" aria-live="polite">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" aria-hidden="true" />
                <p className="text-xs font-semibold leading-5 text-emerald-900">{draftNotice} Kontrollera NRF-numret och godkänn sedan produkten.</p>
              </div>
            )}
          </section>

          <nav aria-label="Åtgärder för produktposten" className="flex flex-wrap gap-2 rounded-md border border-ink-200 bg-ink-50 p-3">
            <Button type="button" variant="secondary" className="min-h-9 px-3 py-1.5 text-xs" onClick={startManualProductEntry}>
              <Plus className="h-4 w-4" aria-hidden="true" />Lägg till manuellt
            </Button>
            <Button type="button" variant="secondary" className="min-h-9 px-3 py-1.5 text-xs" onClick={addAccessory} disabled={!productNumber.trim() || selectedProductAccessories.length >= 20} title={!productNumber.trim() ? "Välj en huvudprodukt först" : selectedProductAccessories.length >= 20 ? "Högst 20 tillbehör" : "Lägg till tillbehör på den valda produkten"}>
              <PackagePlus className="h-4 w-4" aria-hidden="true" />Lägg till tillbehör
            </Button>
            <Button type="button" variant="secondary" className="min-h-9 px-3 py-1.5 text-xs" onClick={showAllProductAlternatives}>
              <Search className="h-4 w-4" aria-hidden="true" />Visa alternativ
            </Button>
            {!resolution && (
              <Button type="button" variant="secondary" className="min-h-9 px-3 py-1.5 text-xs" onClick={markAsNotInAssortment}>
                <Tag className="h-4 w-4" aria-hidden="true" />Inte i sortiment
              </Button>
            )}
            <a href={productPostMailHref} className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-xs font-bold text-ink-800 transition hover:border-flow-300 hover:bg-flow-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-flow-600">
              <Mail className="h-4 w-4" aria-hidden="true" />Maila post
            </a>
            <Button type="button" variant="secondary" className="min-h-9 px-3 py-1.5 text-xs" onClick={openAttachmentPanel}>
              <Paperclip className="h-4 w-4" aria-hidden="true" />Legg til vedlegg
            </Button>
          </nav>

          <div id={`ahlsell-products-${requirement.id}`} className="scroll-mt-24 overflow-hidden rounded-md border border-ink-200 bg-white">
            <AhlsellPublicMatchPanel
              projectId={projectId}
              requirementId={requirement.id}
              guide={ahlsellGuide}
              disabled={saving}
              selectedArticleNumber={productNumber}
              onClearSelection={clearSelectedProduct}
              onUseCandidate={applyAhlsellCandidate}
            />
          </div>

          {accessoriesExpanded && selectedProductAccessories.length > 0 && (
            <section id={`product-accessories-${requirement.id}`} aria-labelledby={`product-accessories-title-${requirement.id}`} className="scroll-mt-24 overflow-hidden rounded-md border border-flow-300 bg-white">
              <div className="flex flex-col gap-3 border-b border-flow-200 bg-flow-50 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h5 id={`product-accessories-title-${requirement.id}`} className="flex items-center gap-2 text-sm font-bold text-ink-950"><PackagePlus className="h-4 w-4 text-flow-800" aria-hidden="true" />Tillbehör till vald produkt</h5>
                  <p className="mt-0.5 text-xs leading-5 text-ink-600">Tillbehören kopplas till huvudproduktens NRF-nummer {productNumber.trim()} och sparas tillsammans med den.</p>
                </div>
                <Button type="button" variant="secondary" className="min-h-9 shrink-0 px-3 py-1.5 text-xs" onClick={addAccessory} disabled={selectedProductAccessories.length >= 20}>
                  <Plus className="h-4 w-4" aria-hidden="true" />Lägg till ett till
                </Button>
              </div>
              <div className="space-y-3 p-3">
                {selectedProductAccessories.map((accessory, index) => (
                  <div key={index} className="grid gap-3 rounded-md border border-ink-200 bg-ink-50 p-3 md:grid-cols-[minmax(180px,1.7fr)_minmax(140px,1.2fr)_minmax(120px,0.8fr)_minmax(90px,0.6fr)_auto]">
                    <AccessoryInput id={`accessory-name-${requirement.id}-${index}`} label="Tillbehör" value={accessory.name} required onChange={(value) => updateAccessory(index, "name", value)} />
                    <AccessoryInput id={`accessory-nrf-${requirement.id}-${index}`} label="NRF-nummer" value={accessory.productNumber} onChange={(value) => updateAccessory(index, "productNumber", value)} />
                    <AccessoryInput id={`accessory-quantity-${requirement.id}-${index}`} label="Antal per produkt" type="number" min="0.001" max="100000" step="0.001" value={accessory.quantity} onChange={(value) => updateAccessory(index, "quantity", value)} />
                    <AccessoryInput id={`accessory-unit-${requirement.id}-${index}`} label="Enhet" value={accessory.unit} onChange={(value) => updateAccessory(index, "unit", value)} />
                    <button type="button" aria-label={`Ta bort tillbehör ${index + 1}`} title="Ta bort tillbehör" onClick={() => removeAccessory(index)} className="mt-6 flex h-10 w-10 items-center justify-center rounded-md border border-transparent text-ink-500 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-flow-600">
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                ))}
                {accessoryError && <p role="alert" className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-900">{accessoryError}</p>}
                <p className="text-xs leading-5 text-ink-500">Tillbehören följer bara den valda huvudprodukten. Om huvudproduktens NRF-nummer ändras rensas tillbehören.</p>
              </div>
            </section>
          )}

          <div className={resolution ? "rounded-md border border-slate-300 bg-slate-50 px-3 py-2.5" : "rounded-md border border-ink-200 bg-white px-3 py-2.5"}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="flex items-center gap-2 text-sm font-bold text-ink-950"><Tag className="h-4 w-4" aria-hidden="true" />Ahlsell saknar varan?</p>
                <p className="mt-0.5 text-xs leading-5 text-ink-600">Märk posten som Inte i sortiment. Den räknas som hanterad och blockerar inte projektet.</p>
              </div>
            </div>
          </div>

          {memories.length > 0 && (
            <details open={memoryExpanded} onToggle={(event) => setMemoryExpanded(event.currentTarget.open)} className="group overflow-hidden rounded-md border border-ink-200 bg-white">
              <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-bold text-ink-800 hover:bg-ink-50">
                <span className="flex items-center gap-2"><History className="h-4 w-4 text-flow-700" aria-hidden="true" />Tidigare bekräftade produkter ({memories.length})</span>
                <ChevronDown className="h-4 w-4 shrink-0 transition group-open:rotate-180" aria-hidden="true" />
              </summary>
              <div className="border-t border-ink-200 p-3">
                <p className="text-xs leading-5 text-ink-600">Ett tidigare val fyller i uppgifterna men måste godkännas på nytt i detta projekt.</p>
                <div className="mt-2 grid gap-2 lg:grid-cols-2">
                  {memories.map((memory) => (
                    <button key={memory.id} type="button" disabled={saving} onClick={() => applyMemory(memory)} className="rounded-md border border-ink-200 bg-ink-50 px-3 py-2.5 text-left transition hover:border-flow-400 hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-flow-600 disabled:cursor-wait disabled:opacity-60">
                      <p className="text-sm font-bold text-ink-950">{String(memory.product_name)}</p>
                      <p className="mt-0.5 text-xs text-ink-600">NRF-nummer {String(memory.product_number)}</p>
                      <p className="mt-2 text-xs font-bold text-flow-800">Använd produkt</p>
                    </button>
                  ))}
                </div>
              </div>
            </details>
          )}

          <details id={`product-attachments-${requirement.id}`} open={attachmentExpanded} onToggle={(event) => setAttachmentExpanded(event.currentTarget.open)} className="group scroll-mt-24 overflow-hidden rounded-md border border-ink-200 bg-white">
            <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-bold text-ink-800 hover:bg-ink-50">
              <span className="flex items-center gap-2"><Paperclip className="h-4 w-4 text-flow-700" aria-hidden="true" />Vedlegg{attachments.length > 0 ? ` · ${attachments.length}` : ""}</span>
              <ChevronDown className="h-4 w-4 shrink-0 transition group-open:rotate-180" aria-hidden="true" />
            </summary>
            <div className="space-y-4 border-t border-ink-200 p-3">
              <form className="space-y-3 rounded-md border border-ink-200 bg-ink-50 p-3" onSubmit={(event) => { event.preventDefault(); void saveAttachment(); }}>
                <div>
                  <h5 className="text-sm font-bold text-ink-950">Legg til vedlegg</h5>
                  <p className="mt-0.5 text-xs leading-5 text-ink-600">Skriv en egen kommentar och välj filen som ska sparas med denna PDF-post.</p>
                </div>
                <label className="block" htmlFor={`attachment-comment-${requirement.id}`}>
                  <span className="mb-1 flex items-center justify-between gap-3 text-xs font-semibold text-ink-600"><span>Kommentar <span className="font-normal text-ink-500">(valfritt)</span></span><span>{attachmentComment.length}/2000</span></span>
                  <textarea id={`attachment-comment-${requirement.id}`} rows={3} maxLength={2000} value={attachmentComment} onChange={(event) => { setAttachmentComment(event.target.value); setAttachmentError(null); setAttachmentMessage(null); }} className="block w-full resize-y rounded-sm border-ink-300 bg-white text-sm text-ink-900 shadow-none focus:border-flow-500 focus:ring-flow-500" />
                </label>
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                  <label className="block" htmlFor={`attachment-file-${requirement.id}`}>
                    <span className="mb-1 block text-xs font-semibold text-ink-600">Fil</span>
                    <input ref={attachmentInputRef} id={`attachment-file-${requirement.id}`} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.csv,.txt" onChange={(event) => { setAttachmentFile(event.target.files?.[0] ?? null); setAttachmentError(null); setAttachmentMessage(null); }} className="block min-h-10 w-full rounded-sm border border-ink-300 bg-white text-sm text-ink-800 file:mr-3 file:min-h-10 file:border-0 file:border-r file:border-ink-200 file:bg-ink-50 file:px-3 file:text-xs file:font-bold file:text-ink-800 hover:file:bg-flow-50" />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="secondary" className="min-h-10 justify-center px-3 py-2 text-sm" disabled={attachmentSaving || !hasAttachmentDraft} onClick={() => { setAttachmentComment(""); setAttachmentFile(null); setAttachmentError(null); setAttachmentMessage(null); if (attachmentInputRef.current) attachmentInputRef.current.value = ""; }}>
                      Rensa
                    </Button>
                    <Button type="submit" className="min-h-10 justify-center px-4 py-2 text-sm" disabled={attachmentSaving || !attachmentFile}>
                      {attachmentSaving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Upload className="h-4 w-4" aria-hidden="true" />}
                      {attachmentSaving ? "Sparar…" : "Spara vedlegg"}
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-ink-500">Max 4 MB. Tillåtna format: PDF, PNG, JPG, WebP, TXT och CSV. Sparade filer hämtas som nedladdningar.</p>
                {attachmentError && <p role="alert" className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-900">{attachmentError}</p>}
                {attachmentMessage && <p role="status" className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900">{attachmentMessage}</p>}
              </form>

              <div>
                <h5 className="text-xs font-bold uppercase tracking-[0.08em] text-ink-600">Sparade vedlegg</h5>
                {attachmentsLoading ? (
                  <p className="mt-2 flex items-center gap-2 text-xs font-semibold text-ink-600"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Hämtar vedlegg…</p>
                ) : attachments.length === 0 ? (
                  <p className="mt-2 text-xs text-ink-600">Inga vedlegg har sparats för posten.</p>
                ) : (
                  <div className="mt-2 divide-y divide-ink-200 overflow-hidden rounded-md border border-ink-200 bg-white">
                    {attachments.map((attachment) => (
                      <article key={attachment.id} className="flex items-start gap-3 p-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-flow-50 text-flow-800"><FileText className="h-4 w-4" aria-hidden="true" /></span>
                        <div className="min-w-0 flex-1">
                          <p className="break-words text-sm font-bold text-ink-950">{attachment.fileName}</p>
                          <p className="mt-0.5 text-xs text-ink-500">{formatAttachmentSize(attachment.sizeBytes)} · {formatAttachmentDate(attachment.uploadedAt)}</p>
                          {attachment.comment && <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-ink-700">{attachment.comment}</p>}
                        </div>
                        <a href={attachment.downloadUrl} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-ink-200 bg-white text-flow-800 hover:border-flow-400 hover:bg-flow-50" aria-label={`Hämta ${attachment.fileName}`} title="Hämta vedlegg"><Download className="h-4 w-4" aria-hidden="true" /></a>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </details>
        </div>
      </fieldset>
    </article>
  );
}

const CANDIDATES_PER_PAGE = 6;

function AhlsellPublicMatchPanel({ projectId, requirementId, guide, disabled, selectedArticleNumber, onClearSelection, onUseCandidate }: {
  projectId: string;
  requirementId: string;
  guide: AhlsellRequirementGuide;
  disabled: boolean;
  selectedArticleNumber: string;
  onClearSelection: () => void;
  onUseCandidate: (candidate: AhlsellPublicCandidate) => void;
}) {
  const [catalogResult, setCatalogResult] = useState<AhlsellCatalogResult | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const candidateFilterKey = normalizeNrfNumber(selectedArticleNumber);
  const [candidatePagination, setCandidatePagination] = useState({ filterKey: candidateFilterKey, page: 1 });
  const candidatePage = candidatePagination.filterKey === candidateFilterKey ? candidatePagination.page : 1;

  function setCandidatePage(update: number | ((page: number) => number)) {
    setCandidatePagination((current) => {
      const currentPage = current.filterKey === candidateFilterKey ? current.page : 1;
      const nextPage = typeof update === "function" ? update(currentPage) : update;
      return { filterKey: candidateFilterKey, page: nextPage };
    });
  }

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
  const candidates = orderAhlsellCandidatesForDisplay([...candidatesByArticle.values()]);
  const filteredCandidates = filterAhlsellCandidatesByNrf(candidates, selectedArticleNumber);
  const hasNrfFilter = Boolean(normalizeNrfNumber(selectedArticleNumber));
  const pageCount = Math.max(1, Math.ceil(filteredCandidates.length / CANDIDATES_PER_PAGE));
  const activeCandidatePage = Math.min(candidatePage, pageCount);
  const visibleCandidates = filteredCandidates.slice(
    (activeCandidatePage - 1) * CANDIDATES_PER_PAGE,
    activeCandidatePage * CANDIDATES_PER_PAGE
  );

  function selectCandidate(candidate: AhlsellPublicCandidate) {
    setCandidatePage(1);
    onUseCandidate(candidate);
  }

  function clearSelection() {
    setCandidatePage(1);
    onClearSelection();
  }

  return (
    <section aria-labelledby="ahlsell-match-heading">
      <header className="px-3 py-3 sm:px-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.08em] text-flow-700">Produktval</p>
            <h4 id="ahlsell-match-heading" className="mt-0.5 text-base font-bold text-ink-950">Välj en produkt från Ahlsell</h4>
          </div>
          <div className="flex shrink-0 items-center gap-3 pt-0.5 text-xs font-semibold">
            {!loadingCatalog && <span className="text-ink-600">{filteredCandidates.length} {filteredCandidates.length === 1 ? "träff" : "träffar"}</span>}
            {hasNrfFilter && (
              <button type="button" className="font-bold text-flow-800 underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-flow-600" onClick={clearSelection}>
                Rensa NRF
              </button>
            )}
          </div>
        </div>
        <p className="mt-1.5 text-xs leading-5 text-ink-600">Produkterna visas till höger om PDF-specifikationen. Markera en produkt i välj-cirkeln för att fylla NRF-numret.</p>
      </header>

      {loadingCatalog && (
        <div className="flex min-h-16 items-center justify-center gap-2 border-t border-ink-200 bg-ink-50 px-3 py-3 text-sm font-bold text-ink-800" role="status">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Hämtar alla Ahlsell-träffar…
        </div>
      )}

      {catalogError && (
        <div className="border-t border-amber-300 bg-amber-50 px-3 py-3 text-xs leading-5 text-amber-950 sm:px-4" role="alert">
          <p className="font-bold">Produktlistan kunde inte hämtas automatiskt.</p>
          <p>{catalogError} Använd knappen ”Sök på Ahlsell” som reserv.</p>
        </div>
      )}

      {!loadingCatalog && !catalogError && catalogResult?.truncated && (
        <div className="border-t border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold leading-5 text-amber-950 sm:px-4">
          Ahlsell uppgav {catalogResult.total} träffar. Scipx visar de {catalogResult.candidates.length} första; förfina sökningen för en fullständig och relevant lista.
        </div>
      )}

      {!loadingCatalog && hasNrfFilter && filteredCandidates.length === 0 && candidates.length > 0 && (
        <div className="flex flex-col gap-3 border-t border-amber-300 bg-amber-50 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4" role="status">
          <p className="text-sm font-semibold text-amber-950">Inga hämtade produkter har NRF-nummer {selectedArticleNumber.trim()}.</p>
          <Button type="button" variant="secondary" className="min-h-9 shrink-0 justify-center px-3 py-1.5 text-xs" onClick={clearSelection}>
            <RotateCcw className="h-4 w-4" aria-hidden="true" />Visa alla produkter
          </Button>
        </div>
      )}

      {!loadingCatalog && !catalogError && !hasNrfFilter && candidates.length === 0 && (
        <div className="border-t border-ink-200 bg-ink-50 px-3 py-4 text-sm text-ink-700 sm:px-4">
          <p className="font-semibold">Ingen produkt hittades med denna sökning.</p>
          <a href={guide.searchUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-flow-800 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-flow-600">
            Sök på Ahlsell<ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        </div>
      )}

      {visibleCandidates.length > 0 && (
        <div className="divide-y divide-ink-200 border-t border-ink-200" role="radiogroup" aria-label="Välj Ahlsellprodukt">
          {visibleCandidates.map((candidate) => {
            const isSelected = normalizeNrfNumber(candidate.articleNumber) === normalizeNrfNumber(selectedArticleNumber);
            return (
            <article key={candidate.articleNumber} className={isSelected ? "bg-cyan-50 px-3 py-3 sm:px-4" : "bg-white px-3 py-3 sm:px-4"}>
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold leading-5 text-ink-950">{candidate.productName}</p>
                  <p className="mt-0.5 text-xs font-bold text-flow-800">NRF-nummer {candidate.articleNumber}</p>
                  <p className="mt-1 text-xs leading-5 text-ink-600">{candidateSourceLabel(candidate.source)}</p>
                  {candidate.matchWarnings && candidate.matchWarnings.length > 0 && (
                    <div className="mt-1.5 rounded-sm border border-rose-200 bg-rose-50 px-2 py-1.5 text-xs leading-4 text-rose-900">
                      <p className="font-bold">Matchar inte PDF-kravet:</p>
                      <ul className="mt-0.5 list-disc space-y-0.5 pl-4">
                        {candidate.matchWarnings.map((warning, index) => (
                          <li key={`${candidate.articleNumber}-${index}`}>{warning}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="flex items-center gap-2">
                  <input
                    type="radio"
                    name={`ahlsell-product-${requirementId}`}
                    value={candidate.articleNumber}
                    checked={isSelected}
                    disabled={disabled}
                    onChange={() => selectCandidate(candidate)}
                    aria-label={`Välj ${candidate.productName}, NRF-nummer ${candidate.articleNumber}`}
                    className="h-5 w-5 shrink-0 cursor-pointer border-ink-300 text-flow-700 focus:ring-flow-600 disabled:cursor-not-allowed"
                  />
                    <span className="text-xs font-bold text-flow-800" aria-hidden="true">{isSelected ? "Vald" : "Välj"}</span>
                  </span>
                  <a href={candidate.productUrl} target="_blank" rel="noreferrer" aria-label={`Öppna Ahlsell artikel ${candidate.articleNumber}`} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-ink-200 bg-white text-ink-700 transition hover:border-cyan-500 hover:text-cyan-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-flow-600">
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                </a>
                </div>
              </div>
            </article>
          );})}
        </div>
      )}

      {pageCount > 1 && (
        <div className="flex flex-col items-center justify-between gap-2 border-t border-ink-200 bg-ink-50 px-3 py-2 sm:flex-row sm:px-4">
          <p className="text-xs font-bold text-ink-700">Visar {(activeCandidatePage - 1) * CANDIDATES_PER_PAGE + 1}–{Math.min(activeCandidatePage * CANDIDATES_PER_PAGE, filteredCandidates.length)} av {filteredCandidates.length}</p>
          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" className="min-h-8 px-2 py-1 text-xs" disabled={activeCandidatePage === 1} onClick={() => setCandidatePage((page) => Math.max(1, page - 1))}><ChevronLeft className="h-4 w-4" aria-hidden="true" /> Föregående</Button>
            <span className="min-w-16 text-center text-xs font-bold text-ink-700">{activeCandidatePage} av {pageCount}</span>
            <Button type="button" variant="secondary" className="min-h-8 px-2 py-1 text-xs" disabled={activeCandidatePage === pageCount} onClick={() => setCandidatePage((page) => Math.min(pageCount, page + 1))}>Nästa <ChevronRight className="h-4 w-4" aria-hidden="true" /></Button>
          </div>
        </div>
      )}

      {(guide.recognitionNotes.length > 0 || guide.warnings.length > 0 || (catalogResult?.queries ?? guide.searchQueries ?? [guide.searchQuery]).length > 0) && (
        <details className="border-t border-ink-200 bg-ink-50/70">
          <summary className="cursor-pointer px-3 py-2 text-xs font-bold text-ink-700 hover:bg-ink-100 sm:px-4">Sök- och kontrolluppgifter</summary>
          <div className="space-y-2 border-t border-ink-200 px-3 py-3 text-xs text-ink-700 sm:px-4">
            <div className="flex flex-wrap gap-1.5">
              {(catalogResult?.queries ?? guide.searchQueries ?? [guide.searchQuery]).map((query) => (
                <span key={query} className="rounded border border-ink-200 bg-white px-2 py-1 font-semibold">{query}</span>
              ))}
            </div>
            {guide.recognitionNotes.length > 0 && (
              <ul className="list-disc space-y-1 pl-5 leading-5">
                {guide.recognitionNotes.map((note) => <li key={note}>{note}</li>)}
              </ul>
            )}
            {guide.warnings.length > 0 && (
              <ul className="list-disc space-y-1 pl-5 font-semibold leading-5 text-amber-900">
                {guide.warnings.map((warning) => <li key={warning}>{warning}</li>)}
              </ul>
            )}
            <a href={guide.searchUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-bold text-flow-800 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-flow-600">
              Sök på Ahlsell<ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          </div>
        </details>
      )}
    </section>
  );
}

function candidateSourceLabel(source: AhlsellPublicCandidate["source"]) {
  if (source === "pdf_reference") return "NRF-numret står i den uppladdade PDF-filen";
  if (source === "catalog_search") return "Träff i Ahlsells offentliga katalog – kontroll krävs";
  return "Tidigare verifierad i Ahlsells offentliga katalog";
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
    "Vi behöver hjälp med följande produktpost:",
    `PDF-post: ${postNumber}`,
    nsCode ? `NS-kod: ${nsCode}` : null,
    system ? `System: ${system}` : null,
    `Produktkrav: ${productRequirement}`,
    `Antal: ${quantity}`,
    technicalDetails || null,
    sourceExcerpt ? `\nOriginaltext från PDF:\n${sourceExcerpt.slice(0, 1200)}` : null,
    "",
    "Vänligen återkom med lämplig produkt och NRF-nummer."
  ].filter((line): line is string => line !== null).join("\n");

  return `mailto:?subject=${encodeURIComponent(`Produktfråga – PDF-post ${postNumber}`)}&body=${encodeURIComponent(body)}`;
}

function NonProductRequirementCard({ requirement, position, totalPosts, kind }: { requirement: Row; position: number; totalPosts: number; kind: "remove" | "work" }) {
  const details = projectRequirementDetails(requirement);
  const quantity = projectRequirementQuantity(requirement.value_json);
  const operationLabel = kind === "remove" ? "Demontering" : "Arbetsmoment";
  return (
    <article className={kind === "remove" ? "overflow-hidden rounded-xl border-2 border-amber-300 bg-white" : "overflow-hidden rounded-xl border-2 border-slate-300 bg-white"}>
      <div className="p-5">
        <p className={kind === "remove" ? "text-sm font-bold text-amber-800" : "text-sm font-bold text-slate-700"}>POST {position} AV {totalPosts} · {operationLabel.toUpperCase()}</p>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div><h4 className="text-2xl font-bold text-ink-950">PDF-post {details.postNumber ?? "saknas"}</h4><p className="mt-2 text-base font-semibold leading-7 text-ink-800">{String(requirement.value_text ?? (kind === "remove" ? "Demontering enligt teknisk beskrivning" : "Arbetsmoment enligt teknisk beskrivning"))}</p></div>
          <span className={kind === "remove" ? "shrink-0 rounded-xl bg-amber-100 px-4 py-2 text-base font-bold text-amber-950" : "shrink-0 rounded-xl bg-slate-100 px-4 py-2 text-base font-bold text-ink-950"}>{formatProjectQuantity(quantity)}</span>
        </div>
        <details className="mt-4 rounded-lg border border-ink-200">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-4 py-3 text-base font-bold text-ink-800">Visa alla uppgifter<ChevronDown className="h-5 w-5" aria-hidden="true" /></summary>
          <dl className="grid border-t border-ink-100 sm:grid-cols-2 xl:grid-cols-3">
            <SpecificationRow label="PDF-postnummer" value={details.postNumber ?? "Saknas"} />
            {details.chapterPost && <SpecificationRow label="Kapitelpost" value={details.chapterPost} />}
            <SpecificationRow label="Åtgärd" value={operationLabel} />
            <SpecificationRow label="Antal" value={formatProjectQuantity(quantity)} />
            {details.parentPostNumber && <SpecificationRow label="Huvudpost" value={details.parentPostNumber} />}
            {details.nsCode && <SpecificationRow label="NS-kod" value={details.nsCode} />}
            {details.system && <SpecificationRow label="System" value={projectRequirementSystemLabel(details.system)} />}
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

function RequirementQueueRow({ requirement, assignment, memory, sourcePdfHref, columns, position, approved, group, selected, onSelectedChange, onOpen }: {
  requirement: Row;
  assignment?: Row;
  memory?: Row;
  sourcePdfHref: string | null;
  columns: ProductTableColumnId[];
  position: number;
  approved: boolean;
  group: AhlsellMatchGroup;
  selected: boolean;
  onSelectedChange: (selected: boolean) => void;
  onOpen: () => void;
}) {
  const details = projectRequirementDetails(requirement);
  const quantity = projectRequirementQuantity(requirement.value_json);
  const productSnapshot = record(assignment?.product_snapshot);
  const resolution = productRequirementResolution(requirement);
  const productName = String(productSnapshot.name ?? "").trim();
  const productNumber = String(productSnapshot.productNumber ?? "").trim();
  const memoryProductName = String(memory?.product_name ?? "").trim();
  const memoryProductNumber = String(memory?.product_number ?? "").trim();
  const hasReusableMemory = !approved && Boolean(memoryProductName && memoryProductNumber);
  const categoryLabel = productRequirementCategoryLabel(productRequirementCategory(requirement));
  const rowClass = selected ? "bg-cyan-50 ring-1 ring-inset ring-flow-500" : "bg-white hover:bg-ink-50/80";

  function renderProductTableCell(columnId: ProductTableColumnId) {
    if (columnId === "control") {
      return (
        <td key={columnId} className="px-2 py-2.5 text-center align-middle">
          {resolution ? (
            <span title={resolution.label} className="inline-flex text-slate-700"><Tag className="h-5 w-5" aria-hidden="true" /><span className="sr-only">{resolution.label}</span></span>
          ) : approved ? (
            <span title="Godkänd" className="inline-flex text-emerald-700"><CheckCircle2 className="h-5 w-5" aria-hidden="true" /><span className="sr-only">Godkänd</span></span>
          ) : group === "red" ? (
            <span title="Produkten hittas inte hos Ahlsell" className="inline-flex text-rose-600"><CircleX className="h-5 w-5" aria-hidden="true" /><span className="sr-only">Produkten hittas inte hos Ahlsell</span></span>
          ) : (
            <span title="Produkten måste ses över" className="inline-flex text-amber-600"><AlertTriangle className="h-5 w-5" aria-hidden="true" /><span className="sr-only">Produkten måste ses över</span></span>
          )}
        </td>
      );
    }
    if (columnId === "post") {
      return (
        <td key={columnId} className="px-3 py-2.5 align-middle">
          {sourcePdfHref ? (
            <a
              href={sourcePdfHref}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Öppna PDF-post ${details.postNumber ?? position}${details.sourcePage ? ` på sida ${details.sourcePage}` : ""}`}
              title={details.sourcePage ? `Öppna posten på sida ${details.sourcePage} i PDF` : "Öppna posten i PDF"}
              className="inline-flex items-center gap-1 text-sm font-black text-flow-800 hover:text-flow-950 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-flow-600"
            >
              {details.postNumber ?? position}
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
          ) : (
            <button
              type="button"
              aria-haspopup="dialog"
              aria-label={`Öppna produktkort för PDF-post ${details.postNumber ?? position}`}
              onClick={onOpen}
              className="text-sm font-black text-flow-800 hover:text-flow-950 hover:underline"
            >
              {details.postNumber ?? position}
            </button>
          )}
          {details.nsCode && <span className="block text-[10px] text-ink-500">{details.nsCode}</span>}
        </td>
      );
    }
    if (columnId === "requirement") {
      return (
        <td key={columnId} className="px-3 py-2.5 align-middle">
          <button type="button" aria-haspopup="dialog" onClick={onOpen} className="line-clamp-1 max-w-xl text-left text-xs font-semibold leading-5 text-ink-950 hover:text-flow-800">{String(requirement.value_text ?? "Tekniskt produktkrav")}</button>
        </td>
      );
    }
    if (columnId === "category") return <td key={columnId} className="px-3 py-2.5 align-middle text-xs font-semibold text-ink-800">{categoryLabel}</td>;
    if (columnId === "quantity") return <td key={columnId} className="whitespace-nowrap px-3 py-2.5 align-middle text-xs font-bold text-ink-900">{formatProjectQuantity(quantity)}</td>;
    return (
      <td key={columnId} className="px-3 py-2.5 align-middle text-xs">
        {productName ? (
          <><span className="line-clamp-1 block font-bold text-ink-950">{productName}</span>{productNumber && <span className="block text-[10px] text-ink-600">NRF-nummer {productNumber}</span>}</>
        ) : hasReusableMemory ? (
          <><span className="line-clamp-1 block font-bold text-sky-900">{memoryProductName}</span><span className="block text-[10px] text-sky-700">Tidigare · NRF-nummer {memoryProductNumber}</span></>
        ) : (
          <span className="italic text-ink-500">Ingen produkt vald</span>
        )}
      </td>
    );
  }

  return (
    <tr className={`border-b border-ink-100 transition last:border-b-0 ${rowClass}`}>
      <td className="border-r border-ink-100 px-3 py-2.5 text-center">
        <input type="checkbox" aria-label={`Välj PDF-post ${details.postNumber ?? position}`} checked={selected} onChange={(event) => onSelectedChange(event.target.checked)} className="h-4 w-4 rounded border-ink-300 text-flow-700 focus:ring-flow-500" />
      </td>
      {columns.map(renderProductTableCell)}
      <td className="px-2 py-2 text-center align-middle">
        <button type="button" aria-haspopup="dialog" onClick={onOpen} aria-label={`Öppna produktkort för PDF-post ${details.postNumber ?? position}`} title="Öppna produktkort" className="inline-flex h-8 w-8 items-center justify-center rounded-md text-flow-800 transition hover:bg-flow-100 hover:text-flow-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-flow-600">
          <Plus className="h-4 w-4" aria-hidden="true" />
        </button>
      </td>
    </tr>
  );
}

function productTableSortValue(
  requirement: Row,
  key: ProductTableSortKey,
  approved: boolean,
  group: AhlsellMatchGroup,
  assignment?: Row,
  memory?: Row
): string | number | null {
  if (key === "control") {
    if (productRequirementResolution(requirement)) return 3;
    if (approved) return 2;
    return group === "red" ? 0 : 1;
  }
  if (key === "post") return projectRequirementDetails(requirement).postNumber;
  if (key === "requirement") return String(requirement.value_text ?? "Tekniskt produktkrav");
  if (key === "category") return productRequirementCategoryLabel(productRequirementCategory(requirement));
  if (key === "quantity") return projectRequirementQuantity(requirement.value_json).quantity;

  const productSnapshot = record(assignment?.product_snapshot);
  const productName = String(productSnapshot.name ?? "").trim();
  if (productName) return productName;
  const memoryProductName = String(memory?.product_name ?? "").trim();
  const memoryProductNumber = String(memory?.product_number ?? "").trim();
  return !approved && memoryProductName && memoryProductNumber ? memoryProductName : null;
}

function ProductSortHeader({ label, sortKey, sort, dragging, onSort, onDragStart, onDragEnd, onDragOver, onDrop, align = "left", className = "" }: {
  label: string;
  sortKey: ProductTableSortKey;
  sort: ProductTableSort | null;
  dragging: boolean;
  onSort: (key: ProductTableSortKey) => void;
  onDragStart: (event: ReactDragEvent, columnId: ProductTableColumnId) => void;
  onDragEnd: () => void;
  onDragOver: (event: ReactDragEvent) => void;
  onDrop: (event: ReactDragEvent) => void;
  align?: "left" | "center";
  className?: string;
}) {
  const active = sort?.key === sortKey;
  const nextDirectionLabel = active && sort.direction === "asc" ? "fallande" : "stigande";
  const ariaSort = active ? (sort.direction === "asc" ? "ascending" : "descending") : "none";

  return (
    <th scope="col" aria-sort={ariaSort} onDragOver={onDragOver} onDrop={onDrop} className={`border-b border-ink-200 px-1 py-2 ${dragging ? "bg-flow-50 opacity-60" : ""} ${className}`}>
      <div className={`flex items-center gap-0.5 ${align === "center" ? "justify-center" : "justify-start"}`}>
        <span
          draggable
          aria-hidden="true"
          title={`Dra för att flytta ${label}`}
          onDragStart={(event) => onDragStart(event, sortKey)}
          onDragEnd={onDragEnd}
          className="inline-flex h-7 w-6 shrink-0 cursor-grab items-center justify-center rounded text-ink-400 transition hover:bg-white hover:text-flow-700 active:cursor-grabbing"
        >
          <GripVertical className="h-4 w-4" />
        </span>
        <button
          type="button"
          onClick={() => onSort(sortKey)}
          aria-label={`Sortera ${label} ${nextDirectionLabel}`}
          className={`inline-flex min-w-0 flex-1 items-center gap-1.5 rounded-sm px-1 transition hover:text-flow-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-flow-600 ${align === "center" ? "justify-center" : "justify-start"}`}
        >
          <span>{label}</span>
          {active && sort.direction === "asc" ? (
            <ArrowUp className="h-3.5 w-3.5 shrink-0 text-flow-700" aria-hidden="true" />
          ) : active ? (
            <ArrowDown className="h-3.5 w-3.5 shrink-0 text-flow-700" aria-hidden="true" />
          ) : (
            <ArrowUpDown className="h-3.5 w-3.5 shrink-0 text-ink-400" aria-hidden="true" />
          )}
        </button>
      </div>
    </th>
  );
}

function ProductCategoryButton({ active, count, label, onClick }: {
  active: boolean;
  count: number;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={active
        ? "inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-flow-700 bg-flow-700 px-2.5 py-1 text-xs font-black text-white shadow-sm"
        : "inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-2.5 py-1 text-xs font-bold text-ink-800 transition hover:border-flow-500 hover:bg-flow-50"}
    >
      <span>{label}</span>
      <span className={active ? "rounded-full bg-white/20 px-1.5 py-0.5 text-[10px] text-white" : "rounded-full bg-ink-100 px-1.5 py-0.5 text-[10px] text-ink-700"}>{count}</span>
    </button>
  );
}

function StatusNumber({ value, label, tone = "neutral" }: { value: number; label: string; tone?: "neutral" | "success" | "warning" }) {
  const color = tone === "success" ? "text-emerald-700" : tone === "warning" ? "text-amber-700" : "text-ink-950";
  return <div className="border-r border-ink-100 px-3 py-3 last:border-r-0"><p className={`text-2xl font-bold ${color}`}>{value}</p><p className="mt-0.5 text-xs font-semibold text-ink-600">{label}</p></div>;
}

function SpecificationRow({ label, value }: { label: string; value: string }) {
  return <div className="border-b border-ink-100 px-4 py-3 sm:border-r"><dt className="text-xs font-bold uppercase tracking-wide text-ink-500">{label}</dt><dd className="mt-1 break-words text-sm leading-6 text-ink-900">{value}</dd></div>;
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
      <span className="mb-1 block text-xs font-semibold text-ink-600">{label}{required && <span className="ml-1 font-black text-rose-600">*</span>}</span>
      <input id={id} type={type} min={min} max={max} step={step} required={required} value={value} onChange={(event) => onChange(event.target.value)} className="block h-10 w-full rounded-sm border-ink-300 bg-white text-sm text-ink-900 shadow-none focus:border-flow-500 focus:ring-flow-500" />
    </label>
  );
}

function ProductFormInput({ id, label, value, onChange, required = false, optional = false }: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  optional?: boolean;
}) {
  return (
    <label className="block" htmlFor={id}>
      <span className="mb-1 block text-xs font-semibold text-ink-600">
        {label}{required && <span className="ml-1 font-black text-rose-600">*</span>}{optional && <span className="ml-1 font-normal text-ink-500">(valfritt)</span>}
      </span>
      <input id={id} required={required} value={value} onChange={(event) => onChange(event.target.value)} className="block h-10 w-full rounded-sm border-ink-300 bg-ink-50 text-sm text-ink-900 shadow-none focus:border-flow-500 focus:ring-flow-500" />
    </label>
  );
}

function formatAttachmentSize(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "Okänd storlek";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} kB`;
  return `${(value / (1024 * 1024)).toLocaleString("sv-SE", { maximumFractionDigits: 1 })} MB`;
}

function formatAttachmentDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Okänt datum";
  return new Intl.DateTimeFormat("sv-SE", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
