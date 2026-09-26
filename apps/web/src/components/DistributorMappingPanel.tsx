"use client";



import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent as ReactDragEvent } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, CircleX, Download, ExternalLink, FileText, GripVertical, Loader2, Mail, PackagePlus, Paperclip, Plus, RotateCcw, Search, ShieldCheck, SlidersHorizontal, Tag, Upload, X } from "lucide-react";
import { Button } from "@/components/Button";
import { AhlsellProductLookup } from "@/components/AhlsellProductLookup";
import { ProductSelectionCheckbox } from "@/components/ProductSelectionCheckbox";
import { ProductQuantityFields } from "@/components/ProductQuantityFields";
import { parseProductOrderQuantity } from "@/lib/product-order-quantity";
import { groupProductRequirementsByMainPost } from "@/lib/product-post-groups";
import { ProductPostComments } from "@/components/ProductPostComments";
import { AccessoryProductPicker } from "@/components/AccessoryProductPicker";
import { assemblyComponentSearch, productAssemblyPlan, type AssemblyComponent } from "@/lib/product-assembly-plan";
import { isRigidPipeProduct } from "@/lib/pipe-product-family";
import { ahlsellRequirementIntent } from "@/lib/ahlsell-requirement-intent";
import type { AhlsellLookupProduct } from "@/lib/ahlsell-product-lookup";
import { ns3420CodeInfo } from "@/lib/ns3420-code-catalog";
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
import { hasProjectRequirementDataWarning, projectRequirementDataWarnings } from "@/lib/project-requirement-data-warnings";
import { splitDistributorRequirementLines } from "@/lib/distributor-requirement-lines";
import { bulkProductApprovalSelection, mapBulkProductApprovals, previousBulkProductApprovals, type BulkProductApprovalSelection, type PreviousBulkProductApproval } from "@/lib/bulk-product-approval";
import { ahlsellCatalogStatusFromPayload, mergeAhlsellCatalogAssessments, type AhlsellCatalogAssessment, hasReusableProductMemory, splitAhlsellMatchGroups, type AhlsellCatalogMatchStatus, type AhlsellMatchGroup } from "@/lib/ahlsell-match-groups";
import { isMatchingAhlsellCandidate, orderAhlsellCandidatesForDisplay } from "@/lib/ahlsell-candidate-ranking";
import { ahlsellMldlProduct } from "@/lib/ahlsell-mldl-catalog";
import { MAX_AHLSELL_PRODUCT_LABEL_ITEMS, type AhlsellProductLabel, type AhlsellProductLabelItem } from "@/lib/ahlsell-product-labels";
import { AhlsellCandidateList } from "@/components/AhlsellCandidateList";
import { filterAhlsellCandidatesByNrf, normalizeNrfNumber } from "@/lib/product-card-candidates";
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
  PRODUCT_REQUIREMENT_CATEGORIES,
  productRequirementCategory,
  productRequirementCategoryLabel,
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
  productTableRowClass,
  setProductTableColumnVisible,
  type ProductTableColumnId,
  type ProductTableLayout
} from "@/lib/product-table-layout";

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
type ManualProductDraft = {
  quantity: string;
  unit: string;
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
  nsCode: { label: "NS-kod", className: "min-w-40", minimumWidth: 160 },
  requirement: { label: "Produktkrav", className: "min-w-64", minimumWidth: 320 },
  category: { label: "Produktgrupp", className: "w-36", minimumWidth: 160 },
  quantity: { label: "Mängd", className: "w-24", minimumWidth: 104 },
  product: { label: "Vald produkt", className: "w-48", minimumWidth: 208 }
};

const productTableCollator = new Intl.Collator("sv-SE", { numeric: true, sensitivity: "base" });

export function DistributorMappingPanel({ projectId, currency = "NOK", requirements, assignments, memories: allMemories, sourcePdfLookup, onReload, onGoToDocuments, onFinish, finishing = false }: {
  projectId: string;
  currency?: string;
  requirements: Row[];
  assignments: Row[];
  memories: Row[];
  sourcePdfLookup: ProjectSourcePdfLookup;
  onReload: () => Promise<unknown>;
  onGoToDocuments: () => void;
  onFinish: () => Promise<void>;
  finishing?: boolean;
}) {
  const memories = useMemo(() => allMemories.filter(memory =>
    ahlsellMldlProduct(String(memory.product_number ?? "")) && !readProductSelectionReview(memory.notes)), [allMemories]);
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
  const memoriesByFingerprint = useMemo(() => {
    const grouped = new Map<string, Row[]>();
    for (const memory of memories) {
      const fingerprint = typeof memory.requirement_fingerprint === "string"
        ? memory.requirement_fingerprint
        : null;
      if (!fingerprint) continue;
      const matching = grouped.get(fingerprint) ?? [];
      matching.push(memory);
      grouped.set(fingerprint, matching);
    }
    return grouped;
  }, [memories]);
  const staticallySafeRequirementIds = useMemo(() => new Set(productRequirements.flatMap((requirement) => {
    const fingerprint = typeof requirement.mapping_fingerprint === "string" ? requirement.mapping_fingerprint : null;
    const safe = handledRequirementIds.has(requirement.id)
      || (!hasProjectRequirementDataWarning(requirement) && (
        Boolean(fingerprint && hasReusableProductMemory(requirement, memoryFingerprints))
        || buildAhlsellRequirementGuide(requirement).directCandidates.some(isMatchingAhlsellCandidate)
      ));
    return safe ? [requirement.id] : [];
  })), [handledRequirementIds, memoryFingerprints, productRequirements]);
  const catalogCheckRequirementIds = useMemo(
    () => productRequirements
      .filter((requirement) =>
        !handledRequirementIds.has(requirement.id)
        && !hasProjectRequirementDataWarning(requirement)
      )
      .map((requirement) => requirement.id),
    [productRequirements, handledRequirementIds]
  );
  const catalogRevisions = useMemo(() => Object.fromEntries(productRequirements.map(requirement => [
    requirement.id, JSON.stringify([projectId, requirement.category, requirement.value_text, requirement.value_json, requirement.source_excerpt])
  ])), [productRequirements, projectId]);
  const catalogCheckKey = useMemo(() => JSON.stringify(catalogCheckRequirementIds.map(id => [id, catalogRevisions[id]])), [catalogCheckRequirementIds, catalogRevisions]);
  const [catalogAssessments, setCatalogAssessments] = useState<Record<string, AhlsellCatalogAssessment>>({});
  const completedCatalogChecks = useRef(new Set<string>());
  const catalogStatuses = useMemo(() => Object.fromEntries(Object.entries(catalogAssessments)
    .filter(([id, result]) => result.revision === catalogRevisions[id])
    .map(([id, result]) => [id, result.status])), [catalogAssessments, catalogRevisions]);
  const recordFullCatalogResult = useCallback((requirementId: string, status: AhlsellCatalogMatchStatus) => {
    setCatalogAssessments(current => mergeAhlsellCatalogAssessments(current, {
      [requirementId]: { revision: catalogRevisions[requirementId], status, fullSearch: true }
    }));
  }, [catalogRevisions]);

  useEffect(() => {
    const controller = new AbortController();
    const requirementIds = (JSON.parse(catalogCheckKey) as Array<[string, string]>)
      .filter(entry => !completedCatalogChecks.current.has(JSON.stringify(entry)));
    let nextIndex = 0;

    async function worker() {
      while (!controller.signal.aborted) {
        const [requirementId, revision] = requirementIds[nextIndex] ?? [];
        nextIndex += 1;
        if (!requirementId) return;
        let status: AhlsellCatalogMatchStatus = "incomplete";
        let fullSearch = false;
        try {
          const response = await fetch(`/api/projects/${projectId}/requirements/${requirementId}/ahlsell-candidates?classification=1`, {
            signal: controller.signal,
            headers: { Accept: "application/json" }
          });
          if (!response.ok) throw new Error("Ahlsell-sökningen kunde inte slutföras.");
          const payload = await response.json().catch(() => null);
          const classification = ahlsellCatalogStatusFromPayload(payload);
          if (classification) status = classification;
          fullSearch = payload?.fullSearch === true;
        } catch (error) {
          if (error instanceof Error && error.name === "AbortError") return;
        }
        if (controller.signal.aborted) return;
        completedCatalogChecks.current.add(JSON.stringify([requirementId, revision]));
        setCatalogAssessments(current => mergeAhlsellCatalogAssessments(current, {
          [requirementId]: { revision, status, fullSearch }
        }));
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
      staticallySafeRequirementIds,
      manualReviewGroups: Object.fromEntries(approvedAssignments.flatMap(assignment => {
        const review = readProductSelectionReview(record(assignment.product_snapshot).notes);
        return review ? [[String(assignment.requirement_id), review.status === "mismatch" ? "red" as const : "yellow" as const]] : [];
      }))
    }),
    [approvedAssignments, catalogStatuses, handledRequirementIds, memoryFingerprints, productRequirements, staticallySafeRequirementIds]
  );
  const groupByRequirementId = useMemo(() => new Map<string, AhlsellMatchGroup>([
    ...greenRequirements.map((requirement) => [requirement.id, "green"] as const),
    ...yellowRequirements.map((requirement) => [requirement.id, "yellow"] as const),
    ...redRequirements.map((requirement) => [requirement.id, "red"] as const)
  ]), [greenRequirements, redRequirements, yellowRequirements]);
  const [selectedProductCategories, setSelectedProductCategories] = useState<ProductRequirementCategory[] | null>(null);
  const [expandedMainPosts, setExpandedMainPosts] = useState<Set<string>>(() => new Set());
  const [productTableSort, setProductTableSort] = useState<ProductTableSort | null>(null);
  const [productTableLayout, setProductTableLayout] = useState<ProductTableLayout>(() => normalizeProductTableLayout(DEFAULT_PRODUCT_TABLE_LAYOUT));
  const [productTableLayoutLoaded, setProductTableLayoutLoaded] = useState(false);
  const [productTableLayoutEditorOpen, setProductTableLayoutEditorOpen] = useState(false);
  const [draggedProductTableColumn, setDraggedProductTableColumn] = useState<ProductTableColumnId | null>(null);
  const [productTableLayoutAnnouncement, setProductTableLayoutAnnouncement] = useState("");
  const [selectedRequirementIds, setSelectedRequirementIds] = useState<Set<string>>(() => new Set());
  const [bulkApproving, setBulkApproving] = useState(false);
  const [bulkApprovalProgress, setBulkApprovalProgress] = useState<{ completed: number; total: number } | null>(null);
  const [productLabelsByRequirementId, setProductLabelsByRequirementId] = useState<Record<string, AhlsellProductLabel>>({});
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
  const allMainPostGroups = useMemo(
    () => groupProductRequirementsByMainPost(productRequirements),
    [productRequirements]
  );
  const allQueueRequirements = useMemo(() => allMainPostGroups.flatMap(group => group.requirements), [allMainPostGroups]);
  const approvedMainPostKeys = useMemo(() => new Set(allMainPostGroups
    .filter(group => group.requirements.every(requirement => approvedRequirementIds.has(requirement.id)))
    .map(group => group.key)), [allMainPostGroups, approvedRequirementIds]);
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
  const bulkApprovalSelectionByRequirementId = useMemo(() => {
    const selections = new Map<string, BulkProductApprovalSelection>();
    for (const requirement of productRequirements) {
      if (groupByRequirementId.get(requirement.id) !== "green") continue;
      const fingerprint = typeof requirement.mapping_fingerprint === "string"
        ? requirement.mapping_fingerprint
        : null;
      const selection = bulkProductApprovalSelection({
        requirement,
        memories: fingerprint ? memoriesByFingerprint.get(fingerprint) : undefined,
        handled: handledRequirementIds.has(requirement.id)
      });
      if (selection) selections.set(requirement.id, selection);
    }
    return selections;
  }, [groupByRequirementId, handledRequirementIds, memoriesByFingerprint, productRequirements]);
  const filteredQueueRequirements = useMemo(() => {
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
            : undefined,
          bulkApprovalSelectionByRequirementId.get(requirement.id),
          productLabelsByRequirementId[requirement.id]
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
  }, [allQueueRequirements, approvedAssignmentByRequirementId, approvedRequirementIds, bulkApprovalSelectionByRequirementId, groupByRequirementId, preferredMemoryByFingerprint, productLabelsByRequirementId, productTableSort, selectedProductCategories]);
  const mainPostGroups = useMemo(() => groupProductRequirementsByMainPost(filteredQueueRequirements, {
    allRequirements: allQueueRequirements, preserveRowOrder: Boolean(productTableSort)
  }), [filteredQueueRequirements, allQueueRequirements, productTableSort]);
  const queueRequirements = useMemo(() => mainPostGroups.flatMap(group => group.requirements), [mainPostGroups]);
  const expandedQueueRequirements = mainPostGroups.filter(group => expandedMainPosts.has(group.key)).flatMap(group => group.requirements);
  const queuePositionById = useMemo(
    () => new Map(allQueueRequirements.map((requirement, index) => [requirement.id, index + 1])),
    [allQueueRequirements]
  );
  const productLabelItems = useMemo(() => queueRequirements.flatMap((requirement) => {
    const assignmentSnapshot = record(approvedAssignmentByRequirementId.get(requirement.id)?.product_snapshot);
    if (typeof assignmentSnapshot.subtitle === "string" && assignmentSnapshot.subtitle.trim()) return [];
    const productNumber = String(
      assignmentSnapshot.productNumber
      ?? bulkApprovalSelectionByRequirementId.get(requirement.id)?.productNumber
      ?? ""
    ).trim();
    const loadedLabel = productLabelsByRequirementId[requirement.id];
    if (
      productNumber
      && loadedLabel?.subtitle
      && normalizeNrfNumber(loadedLabel.articleNumber) === normalizeNrfNumber(productNumber)
    ) return [];
    return productNumber
      ? [{ requirementId: requirement.id, articleNumber: productNumber } satisfies AhlsellProductLabelItem]
      : [];
  }), [approvedAssignmentByRequirementId, bulkApprovalSelectionByRequirementId, productLabelsByRequirementId, queueRequirements]);
  const productLabelRequestKey = JSON.stringify(productLabelItems);

  useEffect(() => {
    const controller = new AbortController();
    const requestedItems = JSON.parse(productLabelRequestKey) as AhlsellProductLabelItem[];
    if (requestedItems.length === 0) return () => controller.abort();
    void fetchAhlsellProductLabels(projectId, requestedItems, controller.signal)
      .then((labels) => {
        if (!controller.signal.aborted) {
          setProductLabelsByRequirementId((current) => ({ ...current, ...labels }));
        }
      })
      .catch(() => {
        // The saved product and NRF remain visible if Ahlsell is temporarily unavailable.
      });
    return () => controller.abort();
  }, [projectId, productLabelRequestKey]);

  const bulkEligibleVisibleRequirements = expandedQueueRequirements.filter((requirement) =>
    bulkApprovalSelectionByRequirementId.has(requirement.id)
  );
  const selectedVisibleRequirements = bulkEligibleVisibleRequirements.filter((requirement) =>
    selectedRequirementIds.has(requirement.id)
  );
  const previouslySelectedProducts = useMemo(
    () => previousBulkProductApprovals(productRequirements, bulkApprovalSelectionByRequirementId),
    [bulkApprovalSelectionByRequirementId, productRequirements]
  );
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
  const matchedRequirementCount = greenRequirements.length + yellowRequirements.filter(requirement => catalogStatuses[requirement.id] === "found").length;
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
    const mainPost = mainPostGroups.find(group => group.requirements.some(item => item.id === requirementId));
    if (mainPost) setExpandedMainPosts(current => new Set(current).add(mainPost.key));
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

  function toggleMainPost(key: string) {
    setExpandedMainPosts(current => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleGroupRequirements(requirementIds: string[], selected: boolean) {
    setSelectedRequirementIds(current => {
      const next = new Set(current);
      for (const id of requirementIds) {
        if (selected) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  async function approveSelectedGreenProducts() {
    const selectedProducts = selectedVisibleRequirements.flatMap((requirement) => {
      const selection = bulkApprovalSelectionByRequirementId.get(requirement.id);
      return selection ? [{ requirement, selection }] : [];
    });
    await approveBulkProducts(selectedProducts, "markerade produkter");
  }

  async function approveAllPreviouslySelectedProducts() {
    if (previouslySelectedProducts.length === 0 || bulkApproving) return;
    const approved = window.confirm(
      `Godkänn ${previouslySelectedProducts.length} tidigare valda produkter i den här specifikationen? Endast oförändrade poster med ett entydigt tidigare val tas med.`
    );
    if (!approved) return;
    await approveBulkProducts(previouslySelectedProducts, "tidigare valda produkter");
  }

  async function approveBulkProducts(
    selectedProducts: Array<PreviousBulkProductApproval<Row>>,
    successLabel: string
  ) {
    if (selectedProducts.length === 0 || bulkApproving) return;

    setBulkApproving(true);
    setBulkApprovalProgress({ completed: 0, total: selectedProducts.length });
    setMessage(null);
    setError(null);
    try {
      const labelItems = selectedProducts.flatMap(({ requirement, selection }) => {
        const loadedLabel = productLabelsByRequirementId[requirement.id];
        return loadedLabel
          && normalizeNrfNumber(loadedLabel.articleNumber) === normalizeNrfNumber(selection.productNumber)
          && loadedLabel.subtitle.trim()
          ? []
          : [{ requirementId: requirement.id, articleNumber: selection.productNumber }];
      });
      const fetchedLabels = labelItems.length > 0
        ? await fetchAhlsellProductLabels(projectId, labelItems)
        : {};
      const labels = { ...productLabelsByRequirementId, ...fetchedLabels };
      setProductLabelsByRequirementId(labels);
      const unresolved = selectedProducts.filter(({ requirement, selection }) => {
        const label = labels[requirement.id];
        return !label
          || normalizeNrfNumber(label.articleNumber) !== normalizeNrfNumber(selection.productNumber)
          || !label.subtitle.trim();
      });
      if (unresolved.length > 0) {
        const posts = unresolved
          .map(({ requirement }) => projectRequirementDetails(requirement).postNumber ?? requirement.id)
          .slice(0, 4)
          .join(", ");
        throw new Error(`Ahlsells tekniska produkttext kunde inte hämtas för ${posts}. Inga produkter godkändes.`);
      }

      const approvalResults = await mapBulkProductApprovals(selectedProducts, async ({ requirement, selection }) => {
        const label = labels[requirement.id];
        if (!label) {
          return { requirementId: requirement.id, message: "Ahlsells produkttext saknas." };
        }
        try {
          const response = await fetch(`/api/projects/${projectId}/product-mappings`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              requirementId: requirement.id,
              userApproved: true,
              entryMethod: "catalog",
              productName: label.productName || selection.productName,
              productSubtitle: label.subtitle,
              productNumber: selection.productNumber,
              manufacturerName: label.manufacturer || selection.manufacturerName,
              notes: "",
              accessories: []
            })
          });
          const payload = (await response.json().catch(() => null)) as { error?: string } | null;
          if (!response.ok) throw new Error(payload?.error ?? "Produkten kunde inte godkännas.");
          return { requirementId: requirement.id, message: null };
        } catch (approvalError) {
          return {
            requirementId: requirement.id,
            message: approvalError instanceof Error ? approvalError.message : "Produkten kunde inte godkännas."
          };
        } finally {
          setBulkApprovalProgress((current) => current
            ? { ...current, completed: Math.min(current.completed + 1, current.total) }
            : current);
        }
      });
      const approvedIds = approvalResults
        .filter((result) => result.message === null)
        .map((result) => result.requirementId);
      const failed = approvalResults.filter((result): result is { requirementId: string; message: string } =>
        typeof result.message === "string"
      );

      await onReload();
      setSelectedRequirementIds(new Set(failed.map((item) => item.requirementId)));
      if (failed.length > 0) {
        setError(`${approvedIds.length} produkter godkändes. ${failed.length} kunde inte sparas och är fortfarande markerade: ${failed[0].message}`);
      } else {
        setMessage(`${approvedIds.length} ${successLabel} godkändes och sparades.`);
      }
    } catch (approvalError) {
      setError(approvalError instanceof Error ? approvalError.message : "Produkterna kunde inte godkännas.");
    } finally {
      setBulkApproving(false);
      setBulkApprovalProgress(null);
    }
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
      <div className="rounded-2xl border border-cyan-300/20 portal-panel bg-portal-face p-4 text-ink-900 shadow-none">
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
        <section id="product-table" aria-labelledby="product-table-heading" className="scroll-mt-28 overflow-hidden border border-ink-200 bg-white">
          <div className="flex flex-col gap-2 border-b border-ink-200 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 id="product-table-heading" className="text-xl font-black text-ink-950">Produktposter ({queueRequirements.length})</h3>
              <p className="mt-1 text-sm text-ink-700">Klikk på et hovedpostnummer for å vise og velge en underpost.</p>
              <p className="mt-0.5 text-xs font-semibold text-ink-600">
                {catalogChecksRemaining > 0
                  ? `Scipx söker automatiskt på Ahlsells webbplats för ${catalogChecksRemaining} ${catalogChecksRemaining === 1 ? "post" : "poster"}.`
                  : catalogCheckRequirementIds.some(id => catalogStatuses[id] === "incomplete")
                  ? "Alla sökningar kunde inte slutföras. Berörda poster behöver kontrolleras när Ahlsell kan ge ett fullständigt sökresultat."
                  : `Produktförslag för ${matchedRequirementCount} av ${productRequirements.length} poster (${ahlsellCoveragePercent} %).`}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {selectedVisibleRequirements.length > 0 && <span className="rounded-full bg-flow-100 px-2.5 py-1 text-xs font-black text-flow-900">{selectedVisibleRequirements.length}  valda</span>}
              <Button
                type="button"
                className="min-h-9 px-3 py-1.5 text-sm"
                disabled={previouslySelectedProducts.length === 0 || bulkApproving}
                onClick={() => void approveAllPreviouslySelectedProducts()}
                title={previouslySelectedProducts.length > 0
                  ? "Godkänn alla otvetydiga tidigare produktval i den här specifikationen"
                  : "Det finns inga säkra tidigare produktval att godkänna"}
              >
                {bulkApproving ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />}
                {bulkApproving
                  ? bulkApprovalProgress && bulkApprovalProgress.completed > 0
                    ? `Godkänner ${bulkApprovalProgress.completed}/${bulkApprovalProgress.total}…`
                    : `Förbereder ${bulkApprovalProgress?.total ?? ""}…`
                  : `Godkänn alla tidigare valda (${previouslySelectedProducts.length})`}
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="min-h-9 px-3 py-1.5 text-sm"
                disabled={selectedVisibleRequirements.length === 0 || bulkApproving}
                onClick={() => void approveSelectedGreenProducts()}
                title="Godkänner endast poster med ett otvetydigt tidigare val eller en exakt direktträff"
              >
                {bulkApproving ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />}
                {bulkApproving
                  ? bulkApprovalProgress && bulkApprovalProgress.completed > 0
                    ? `Godkänner ${bulkApprovalProgress.completed}/${bulkApprovalProgress.total}…`
                    : `Förbereder ${bulkApprovalProgress?.total ?? ""}…`
                  : `Godkänn markerade${selectedVisibleRequirements.length > 0 ? ` (${selectedVisibleRequirements.length})` : ""}`}
              </Button>
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
            <div className="divide-y divide-ink-200">
              {mainPostGroups.map((mainPost, index) => {
                const expanded = expandedMainPosts.has(mainPost.key);
                const mainPostApproved = approvedMainPostKeys.has(mainPost.key);
                const label = mainPost.postNumber ?? "Hovedpost mangler";
                const regionId = `main-post-${index}-products`;
                const headingId = `main-post-${index}-heading`;
                const mainPostCategories = new Set((allMainPostGroups.find(group => group.key === mainPost.key)?.requirements ?? mainPost.requirements).map(productRequirementCategory));
                const categoryLabels = PRODUCT_REQUIREMENT_CATEGORIES.filter(category => mainPostCategories.has(category.id)).map(category => category.shortLabel).join(" · ");
                const eligibleIds = mainPost.requirements.filter(item => bulkApprovalSelectionByRequirementId.has(item.id)).map(item => item.id);
                const allGroupSelected = eligibleIds.length > 0 && eligibleIds.every(id => selectedRequirementIds.has(id));
                return <section key={mainPost.key} aria-labelledby={headingId}>
                  <h4 id={headingId}>
                    <button type="button" aria-expanded={expanded} aria-controls={regionId}
                      aria-label={`Hovedpost ${label}`} aria-describedby={`${headingId}-category`} onClick={() => toggleMainPost(mainPost.key)}
                      className={`flex min-h-14 w-full items-center justify-between gap-3 px-4 py-3 text-left text-base font-black transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-flow-600 ${mainPostApproved ? "bg-emerald-100 text-emerald-900 hover:bg-emerald-200" : expanded ? "bg-flow-50 text-flow-900 hover:bg-flow-50" : "bg-white text-flow-900 hover:bg-flow-50"}`}>
                      <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="flex items-center gap-2">{mainPostApproved && <><CheckCircle2 className="h-5 w-5 text-emerald-700" aria-hidden="true" /><span className="sr-only">Godkjent · </span></>}{label}</span>
                        <span id={`${headingId}-category`} className="text-sm font-semibold">{categoryLabels}</span>
                      </span>
                      <ChevronDown className={`h-5 w-5 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} aria-hidden="true" />
                    </button>
                  </h4>
                  {expanded && <div id={regionId} role="region" aria-labelledby={headingId} className="overflow-x-auto border-t border-ink-200" tabIndex={0}>
              <table className="w-full border-collapse whitespace-nowrap text-left" style={{ minWidth: `${productTableMinimumWidth}px` }}>
                <thead className="bg-ink-50 text-[11px] font-black uppercase tracking-[0.04em] text-ink-600">
                  <tr>
                    <th className="w-11 border-b border-r border-ink-200 px-3 py-2 text-center"><input type="checkbox" aria-label={`Velg alle produktposter under hovedpost ${label} som kan godkjennes direkte`} checked={allGroupSelected} disabled={eligibleIds.length === 0 || bulkApproving} onChange={(event) => toggleGroupRequirements(eligibleIds, event.target.checked)} className="h-4 w-4 rounded border-ink-300 text-flow-700 focus:ring-flow-500 disabled:cursor-not-allowed disabled:opacity-40" /></th>
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
                  {mainPost.requirements.map((requirement) => (
                    <RequirementQueueRow
                      key={requirement.id}
                      requirement={requirement}
                      position={queuePositionById.get(requirement.id) ?? 1}
                      approved={approvedRequirementIds.has(requirement.id)}
                      group={groupByRequirementId.get(requirement.id) ?? "yellow"}
                      assignment={approvedAssignmentByRequirementId.get(requirement.id)}
                      memory={typeof requirement.mapping_fingerprint === "string" ? preferredMemoryByFingerprint.get(requirement.mapping_fingerprint) : undefined}
                      bulkSelection={bulkApprovalSelectionByRequirementId.get(requirement.id)}
                      productLabel={productLabelsByRequirementId[requirement.id]}
                      sourcePdfHref={projectRequirementSourcePdfHref(projectId, requirement, sourcePdfLookup)}
                      columns={visibleProductTableColumns}
                      selected={bulkApprovalSelectionByRequirementId.has(requirement.id) && selectedRequirementIds.has(requirement.id)}
                      selectionDisabled={!bulkApprovalSelectionByRequirementId.has(requirement.id) || bulkApproving}
                      onSelectedChange={(selected) => toggleRequirementSelection(requirement.id, selected)}
                      onOpen={() => showRequirement(requirement.id)}
                    />
                  ))}
                </tbody>
              </table>
                  </div>}
                </section>;
              })}
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
            const assignment = approvedAssignmentByRequirementId.get(requirement.id);
            const activeApproved = Boolean(assignment) && !productCardDirty;
            const activeGroup = activeApproved ? "green" : assignment && productCardDirty ? "yellow" : groupByRequirementId.get(requirement.id) ?? "yellow";
            const activeResolution = productRequirementResolution(requirement);
            const matchingMemories = memories.filter((memory) => memory.requirement_fingerprint === requirement.mapping_fingerprint);
            return (
              <dialog
                ref={productDialogRef}
                aria-label={`Produktval för PDF-post ${projectRequirementDetails(requirement).postNumber ?? activeIndex + 1}`}
                className="fixed inset-0 m-0 h-[100dvh] max-h-none w-screen max-w-none overflow-hidden border-0 bg-white p-0 text-neutral-900 shadow-none backdrop:bg-neutral-950/65 backdrop:backdrop-blur-sm"
                onCancel={(event) => {
                  event.preventDefault();
                  closeRequirement();
                }}
              >
                <div id="product-work-queue" className="flex h-full w-full flex-col overflow-hidden">
                  <nav aria-label="Navigera mellan produktposter" className="shrink-0 border-b border-neutral-200 bg-white px-3 py-2.5 sm:px-4 sm:py-3">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div className="flex items-center gap-3">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-neutral-50">
                          {activeGroup === "green" ? <CheckCircle2 className="h-5 w-5 text-neutral-700" aria-hidden="true" /> : activeGroup === "red" ? <CircleX className="h-5 w-5 text-neutral-600" aria-hidden="true" /> : <AlertTriangle className="h-5 w-5 text-neutral-600" aria-hidden="true" />}
                        </span>
                        <div>
                          <p className={activeGroup === "green" ? "text-xs font-bold uppercase tracking-[0.08em] text-neutral-800" : activeGroup === "red" ? "text-xs font-bold uppercase tracking-[0.08em] text-neutral-700" : "text-xs font-bold uppercase tracking-[0.08em] text-neutral-800"}>{activeApproved ? "Produkten är godkänd" : productCardDirty ? "Osparade ändringar" : activeResolution ? `Posten är hanterad · ${activeResolution.label}` : activeGroup === "green" ? "Match hittad · kontrollera och godkänn" : activeGroup === "red" ? "Ingen match bland kontrollerade produkter" : "Produkten måste ses över"}</p>
                          <p className="mt-0.5 text-sm font-bold text-neutral-950 sm:text-base">Produkt {activeIndex + 1} av {queueRequirements.length} · {visibleQueueRemainingCount}  kvar i visningen</p>
                          <p className="mt-1 text-sm font-semibold text-neutral-900">Produktgrupp: {productRequirementCategoryLabel(productRequirementCategory(requirement))}</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button neutral variant="secondary" className="min-h-10 justify-center px-3 py-2" disabled={productCardSaving || activeIndex === 0} onClick={() => showRequirement(queueRequirements[activeIndex - 1].id)}><ChevronLeft className="h-4 w-4" aria-hidden="true" />Föregående</Button>
                        <Button neutral variant="secondary" className="min-h-10 justify-center px-3 py-2" disabled={productCardSaving || activeIndex === queueRequirements.length - 1} onClick={() => showRequirement(queueRequirements[activeIndex + 1].id)}>Nästa<ChevronRight className="h-4 w-4" aria-hidden="true" /></Button>
                        <Button neutral autoFocus variant="secondary" className="min-h-10 justify-center px-3 py-2" disabled={productCardSaving} onClick={closeRequirement}>{productCardSaving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <X className="h-4 w-4" aria-hidden="true" />}{productCardSaving ? "Sparar…" : "Stäng kortet"}</Button>
                      </div>
                    </div>
                    <div
                      role="progressbar"
                      aria-label="Hanterade produktposter"
                      aria-valuenow={progressPercent}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      className="mt-2 h-1 overflow-hidden rounded-full bg-neutral-100"
                    >
                      <div className="h-full rounded-full bg-neutral-500 transition-[width] duration-300" style={{ width: `${progressPercent}%` }} />
                    </div>
                    {(message || error) && (
                      <div role="status" aria-live="polite" className={error ? "mt-3 rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-2 text-sm font-semibold text-neutral-900" : "mt-3 rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-2 text-sm font-semibold text-neutral-900"}>
                        {error ?? message}
                      </div>
                    )}
                  </nav>
                  <div id="product-card-scroll" className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-white p-0 lg:overflow-hidden">
                    <RequirementProductMappingCard
                      key={`${requirement.id}:${String(assignment?.updated_at ?? "new")}`}
                      projectId={projectId}
                      currency={currency}
                      requirement={requirement}
                      assignment={assignment}
                      sourcePdfHref={projectRequirementSourcePdfHref(projectId, requirement, sourcePdfLookup)}
                      position={activeIndex + 1}
                      totalPosts={queueRequirements.length}
                      memories={matchingMemories}
                      onCatalogResult={recordFullCatalogResult}
                      onSavingChange={setProductCardSaving}
                      onDirtyChange={setProductCardDirty}
                      onSaved={async (successMessage) => {
                        setProductCardDirty(false);
                        setSelectedRequirementIds((current) => {
                          const next = new Set(current);
                          next.delete(requirement.id);
                          return next;
                        });
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
                <h3 className="mt-1 text-xl font-bold text-amber-950">{removalRequirements.length} {removalRequirements.length === 1 ? "post" : "poster"}  utan nytt produktval</h3>
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
                  <h3 className="mt-1 text-xl font-bold text-ink-950">{workRequirements.length} {workRequirements.length === 1 ? "post" : "poster"}  ska inte sökas som Ahlsell-produkter</h3>
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

function RequirementProductMappingCard({ projectId, currency, requirement, assignment, sourcePdfHref, position, totalPosts, memories, onCatalogResult, onSavingChange, onDirtyChange, onSaved, onError }: {
  projectId: string;
  currency: string;
  requirement: Row;
  assignment?: Row;
  sourcePdfHref: string | null;
  position: number;
  totalPosts: number;
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
    currentSnapshot.manufacturerArticleNumber != null
    || currentSnapshot.deliveryTimeDays != null
    || currentSnapshot.unitPrice != null
  ));
  const [manualProductRequired, setManualProductRequired] = useState(false);
  const [manualProductOpen, setManualProductOpen] = useState(false);
  const [manualProductDraftDirty, setManualProductDraftDirty] = useState(false);
  const [manualProductError, setManualProductError] = useState<string | null>(null);
  const [manualProductDraft, setManualProductDraft] = useState<ManualProductDraft>(() => ({
    quantity: orderQuantity?.quantity ?? String(quantity.quantity ?? ""),
    unit: orderQuantity?.unit ?? (quantity.unit || "st"),
    productNumber: String(currentSnapshot.productNumber ?? ""),
    manufacturerArticleNumber: String(currentSnapshot.manufacturerArticleNumber ?? ""),
    manufacturerName: String(currentSnapshot.manufacturer ?? ""),
    deliveryTimeDays: String(currentSnapshot.deliveryTimeDays ?? ""),
    unitPrice: String(currentSnapshot.unitPrice ?? ""),
    currency: normalizeCurrencyCode(String(currentSnapshot.currency ?? "")) || defaultCurrency
  }));
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
  const hasAccessoryStep = Boolean(assemblyPlan?.components.length || suggestedAccessories.length || selectedProductAccessories.length);
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
    setManualProductRequired(false);
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
      const panel = selectedCard?.closest("fieldset");
      const scrollContainer = panel && window.getComputedStyle(panel).overflowY === "auto" ? panel : document.getElementById("product-card-scroll");
      const header = document.getElementById(`product-selection-header-${requirement.id}`);
      if (selectedCard && scrollContainer) {
        scrollContainer.scrollTo({
          top: scrollContainer.scrollTop + selectedCard.getBoundingClientRect().top - scrollContainer.getBoundingClientRect().top - (header?.offsetHeight ?? 0) - 16,
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth"
        });
      }
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
    setManualProductRequired(false);
    setSuggestedAccessories([]);
    setDraftNotice(null);
    setHasUnapprovedChanges(true);
  }

  function openManualProductCard() {
    setManualProductDraft({
      quantity: orderQuantity?.quantity ?? String(quantity.quantity ?? ""),
      unit: orderQuantity?.unit ?? (quantity.unit || "st"),
      productNumber,
      manufacturerArticleNumber,
      manufacturerName,
      deliveryTimeDays,
      unitPrice,
      currency: priceCurrency
    });
    setManualProductDraftDirty(false);
    setManualProductError(null);
    setManualProductOpen(true);
    window.requestAnimationFrame(() => document.getElementById(`ahlsell-product-lookup-${requirement.id}`)?.focus());
  }

  function closeManualProductCard() {
    setManualProductOpen(false);
    setManualProductDraftDirty(false);
    setManualProductError(null);
    window.requestAnimationFrame(() => document.getElementById(`manual-product-trigger-${requirement.id}`)?.focus());
  }

  function updateManualProductDraft(key: keyof ManualProductDraft, value: string) {
    setManualProductDraft((current) => ({ ...current, [key]: value }));
    setManualProductDraftDirty(true);
    setManualProductError(null);
  }

  function applyManualProduct() {
    const amount = parseProductOrderQuantity(manualProductDraft);
    if (!amount) {
      setManualProductError("Angi en gyldig total mengde (0,001–100 000) og enhet for produktet.");
      return;
    }
    const validation = validateManualDistributorProduct({
      ...manualProductDraft
    }, defaultCurrency);
    if ("error" in validation) {
      setManualProductError(validation.error);
      return;
    }
    const manualProduct = validation.data;
    const preservesSelectedProduct = Boolean(normalizeNrfNumber(productNumber))
      && normalizeNrfNumber(productNumber) === normalizeNrfNumber(manualProduct.productNumber);
    showSelection({
      productName: preservesSelectedProduct ? productName : "",
      productSubtitle: preservesSelectedProduct ? productSubtitle : "",
      productNumber: manualProduct.productNumber,
      manufacturerArticleNumber: manualProduct.manufacturerArticleNumber,
      manufacturerName: manualProduct.manufacturerName,
      deliveryTimeDays: String(manualProduct.deliveryTimeDays),
      unitPrice: String(manualProduct.unitPrice),
      currency: manualProduct.currency
    }, `Produkten med NRF-nummer ${manualProduct.productNumber} har lagts till för kontroll.`, true);
    setOrderQuantity({ quantity: String(amount.quantity), unit: amount.unit });
    setManualProductOpen(false);
    setManualProductDraftDirty(false);
    setManualProductError(null);
    onError("");
  }

  function showAllProductAlternatives() {
    if (productNumber.trim()) clearSelectedProduct();
    window.requestAnimationFrame(() => document.getElementById(`ahlsell-products-${requirement.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }));
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
    if (!hasAccessoryStep || !productNumber.trim() || selectedProductAccessories.length >= 20) return;
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
    if (manualProductRequired || manualProductDraftDirty) {
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
        setManualProductDraft({
          quantity: orderQuantity?.quantity ?? String(quantity.quantity ?? ""),
          unit: orderQuantity?.unit ?? (quantity.unit || "st"),
          productNumber,
          manufacturerArticleNumber,
          manufacturerName,
          deliveryTimeDays,
          unitPrice,
          currency: priceCurrency
        });
        setManualProductOpen(true);
        setManualProductError(manualValidation.error);
        window.requestAnimationFrame(() => document.getElementById(`manual-product-nrf-${requirement.id}`)?.focus());
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
        body: JSON.stringify({ requirementId: requirement.id, userApproved: true, ...chosen })
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

  const accessoryLookup = hasAccessoryStep && accessoryLookupOpen && productNumber.trim() ? (
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
      onDeselect={candidate => removeAccessory(selectedProductAccessories.findIndex(item => normalizeNrfNumber(item.productNumber) === normalizeNrfNumber(candidate.articleNumber)))} />
  ) : null;

  const accessorySection = hasAccessoryStep && productNumber.trim() ? (
    <section id={`accessory-step-${requirement.id}`} tabIndex={-1} aria-labelledby={`accessory-step-title-${requirement.id}`} className="border-t border-neutral-200 bg-white p-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-neutral-600">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h5 id={`accessory-step-title-${requirement.id}`} className="flex items-center gap-2 text-base font-bold text-neutral-950"><PackagePlus className="h-5 w-5" aria-hidden="true" />{accessoryStepOpen ? "3. Välj tillbehör" : `Dina tillbehör (${selectedProductAccessories.length})`}</h5>
          <p className="mt-1 text-sm text-neutral-700">{accessoryStepOpen ? "Välj tillbehör nedan. Tryck på Klar med tillbehör när dina val är färdiga." : "Huvudprodukten och tillbehören sparas tillsammans när du godkänner."}</p>
        </div>
        {!accessoryStepOpen && <Button neutral type="button" variant="secondary" onClick={editAccessories}>Ändra tillbehör</Button>}
      </div>
      {accessoryStepOpen && <div className="mb-4 space-y-4">
        {assemblyPlan && assemblyPlan.components.length > 0 && <div>
          <label htmlFor={"accessory-type-" + requirement.id} className="mb-2 block text-sm font-bold text-neutral-900">Tillbehörstyp</label>
          <select id={"accessory-type-" + requirement.id} value={accessoryComponentId ?? ""} disabled={saving}
            className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-neutral-600 focus:ring-neutral-600"
            onChange={event => openAccessoryLookup(assemblyPlan.components.find(component => component.id === event.target.value))}>
            {assemblyPlan.components.map(component => <option key={component.id} value={component.id}>{component.label}</option>)}
            <option value="">Övriga tillbehör</option>
          </select>
        </div>}
        {accessoryComponent && <p className="text-xs leading-5 text-neutral-600">{accessoryComponent.requirement}</p>}
        {accessoryLookup}

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
                <p className="text-xs leading-5 text-neutral-500">Tillbehören följer bara den valda huvudprodukten. Om huvudproduktens NRF-nummer ändras rensas tillbehören.</p>
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
      {({ postComments, productComments }) => <article id={`post-${requirement.id}`} className="min-h-0 bg-white lg:grid lg:h-full lg:grid-cols-[minmax(340px,0.9fr)_minmax(520px,1.15fr)]">
      <section id={`pdf-requirement-${requirement.id}`} tabIndex={-1} aria-labelledby={`pdf-specification-${requirement.id}`} className="border-b border-neutral-200 bg-neutral-50/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-neutral-600 lg:min-h-0 lg:overflow-y-auto lg:border-b-0 lg:border-r">
        <div className="px-4 py-4 sm:px-6 sm:py-5">
          <div className="flex flex-wrap items-center gap-2">
            {isApproved ? (
              <span className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-neutral-300 bg-neutral-100 px-2.5 py-1 text-xs font-bold text-neutral-800"><CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />Godkänd</span>
            ) : resolution ? (
              <span className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-2.5 py-1 text-xs font-bold text-neutral-800"><Tag className="h-3.5 w-3.5" aria-hidden="true" />{resolution.label}</span>
            ) : (
              <span className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-neutral-300 bg-neutral-50 px-2.5 py-1 text-xs font-bold text-neutral-900"><AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />Inte godkänd</span>
            )}
            {sourcePdfHref && (
              <a href={sourcePdfHref} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-2.5 py-1 text-xs font-bold text-neutral-800 transition hover:border-neutral-500 hover:bg-neutral-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-600">
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />

                Öppna PDF{details.sourcePage ? ` · sida ${details.sourcePage}` : ""}
              </a>
            )}
          </div>

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

          <div className="mt-4">
            <p className="text-xs font-bold uppercase tracking-[0.08em] text-neutral-700">Produkt {position} av {totalPosts}</p>
            <h3 id={`pdf-specification-${requirement.id}`} className="mt-1 text-xl font-bold text-neutral-950">PDF-post {details.postNumber ?? "saknas"}</h3>
            <p className="mt-2 text-sm font-semibold leading-6 text-neutral-800">{String(requirement.value_text ?? "Tekniskt krav")}</p>
          </div>

          <div className="mt-4 overflow-hidden rounded-md border border-neutral-200 bg-white">
            <div className="border-b border-neutral-200 px-4 py-3">
              <h4 className="text-sm font-bold text-neutral-700">1. Gå igenom postens krav</h4>
              <p className="mt-1 text-xs leading-5 text-neutral-600">Alla extraherade krav visas här medan du väljer produkt.</p>
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
              {details.attributes.map(([key, value]) => <SpecificationRow key={key} label={specificationLabel(key)} value={value} />)}
            </dl>
          </div>
          <div id={`post-comments-${requirement.id}`} className="mt-4 scroll-mt-4">{postComments}</div>
          {Boolean(ahlsellGuide.interpretationNotes?.length || ahlsellGuide.interpretationWarnings?.length) && (
            <section aria-label="Så tolkas PDF-kraven" className="rounded-md border border-neutral-200 bg-neutral-50 p-4">
              <h4 className="text-sm font-bold text-neutral-950">Så tolkas PDF-kraven</h4>
              <p className="mt-1 text-xs leading-5 text-neutral-600">Tolkningen väger ihop villkor, placering och lokalisering. Originaluppgifterna visas ovan.</p>
              <ul className="mt-2 list-disc space-y-2 pl-4 text-xs leading-5 text-neutral-800">
                {ahlsellGuide.interpretationNotes?.map((note) => <li key={note}>{note}</li>)}
                {ahlsellGuide.interpretationWarnings?.map((warning) => <li key={warning} className="font-semibold text-neutral-900">{warning}</li>)}
              </ul>
            </section>
          )}
        </div>
      </section>

      <fieldset disabled={saving || attachmentSaving || commentsSaving} aria-busy={saving || attachmentSaving || commentsSaving} className="m-0 min-w-0 border-0 p-0 lg:min-h-0 lg:overflow-y-auto">
        <div id={`product-selection-header-${requirement.id}`} className="sticky top-0 z-20 border-b border-neutral-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-6">
          <nav id={`product-post-actions-${requirement.id}`} aria-label="Åtgärder för produktposten" className="mb-3 flex flex-wrap gap-2 rounded-md border border-neutral-200 bg-neutral-50 p-3">
            <Button neutral type="button" variant="secondary" className="min-h-9 px-3 py-1.5 text-xs" onClick={() => { const scope = productNumber.trim() ? "product" : "post"; document.getElementById(`${scope}-comments-${requirement.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }); document.getElementById(`comment-${scope}-${requirement.id}`)?.focus({ preventScroll: true }); }}>Kommentera</Button>
            {!productNumber.trim() && <Button neutral id={`manual-product-trigger-${requirement.id}`} type="button" variant="secondary" className="min-h-9 px-3 py-1.5 text-xs" aria-expanded={manualProductOpen} aria-controls={`manual-product-card-${requirement.id}`} onClick={manualProductOpen ? closeManualProductCard : openManualProductCard}>
              <Plus className="h-4 w-4" aria-hidden="true" />Lägg till produkt
            </Button>}
            {!resolution && (
              <Button neutral type="button" variant="secondary" className="min-h-9 px-3 py-1.5 text-xs" onClick={markAsNotInAssortment}>
                <Tag className="h-4 w-4" aria-hidden="true" />Inte i sortiment
              </Button>
            )}
            <a href={productPostMailHref} className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-bold text-neutral-800 transition hover:border-neutral-300 hover:bg-neutral-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-600">
              <Mail className="h-4 w-4" aria-hidden="true" />Maila post
            </a>
            <Button neutral type="button" variant="secondary" className="min-h-9 px-3 py-1.5 text-xs" onClick={openAttachmentPanel}>
              <Paperclip className="h-4 w-4" aria-hidden="true" />Legg til vedlegg
            </Button>
            <a href="https://www.ahlsell.no/" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-bold text-neutral-800 transition hover:border-neutral-300 hover:bg-neutral-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-600">
              <ExternalLink className="h-4 w-4" aria-hidden="true" />Ahlsells hemsida
            </a>
          </nav>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.08em] text-neutral-700">{!productNumber.trim() ? "2. Välj huvudprodukt" : accessoryStepOpen ? "3. Välj tillbehör" : "Ditt produktval"}</p>
              <h4 className="mt-0.5 text-base font-bold text-neutral-950">Produkter för PDF-post {details.postNumber ?? position}</h4>
              <p className={`mt-1 flex items-center gap-2 text-sm font-bold ${isApproved ? "text-neutral-800" : productNumber.trim() ? "text-neutral-800" : "text-neutral-600"}`}>
                {productNumber.trim() && <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden="true" />}
                {isApproved ? "Produkten är godkänd" : productNumber.trim() ? "Produkt valgt – ikke godkjent ennå" : "Ingen produkt valgt"}
              </p>
            </div>
          </div>
          <p className="mt-2 text-xs leading-5 text-neutral-600">{hasAccessoryStep
            ? "Arbetsflöde: gå igenom postens krav → välj huvudprodukt → komplettera med tillbehör → godkänn."
            : "Arbetsflöde: gå igenom postens krav → välj huvudprodukt → godkänn."}</p>
        </div>

        <div className="space-y-4 px-4 py-4 sm:px-6 sm:py-5">
          <p role="status" aria-live="polite" className="sr-only">{hasUnapprovedChanges ? draftNotice : ""}</p>
          {productNumber.trim() && !manualProductOpen && (
            <section id={`selected-pipe-${requirement.id}`} tabIndex={-1} aria-label="Valgt hovedprodukt" className={`scroll-mt-80 overflow-hidden rounded-lg border-2 shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-600 lg:scroll-mt-60 border-neutral-400 bg-white`}>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 bg-neutral-100 px-4 py-3">
                <p className="flex items-center gap-2 text-lg font-bold text-neutral-950"><CheckCircle2 className="h-7 w-7 shrink-0" aria-hidden="true" />{isApproved ? "Godkjent hovedprodukt" : "Produkt valgt"}</p>
                <ProductSelectionCheckbox checked approved={isApproved} disabled={saving} label={`${productName || "hovedprodukt"}, NRF ${productNumber}`} onChange={clearSelectedProduct} />
              </div>
              <div className="space-y-4 p-4">
                <div>
                  <h5 className="break-words text-xl font-bold leading-snug text-neutral-950">{productName || `NRF ${productNumber}`}</h5>
                  {productSubtitle && productSubtitle.trim() !== productName.trim() && <p className="mt-1 text-sm text-neutral-700">{productSubtitle}</p>}
                  <p className="mt-2 inline-flex rounded-md border border-neutral-200 bg-white px-2.5 py-1 text-sm font-bold text-neutral-800">NRF {productNumber}</p>
                </div>
                {!isApproved && <p className="text-sm font-semibold leading-5 text-neutral-900">{accessoryStepOpen ? "Huvudprodukten är vald. Välj tillbehör direkt nedan." : hasAccessoryStep ? "Kontrollera huvudprodukten och tillbehören nedan. Tryck sedan på Godkänn och spara." : "Kontrollera huvudprodukten. Tryck sedan på Godkänn och spara."}</p>}
                <div>
                  <ProductQuantityFields id={`selected-product-${requirement.id}`} quantity={orderQuantity?.quantity ?? String(quantity.quantity ?? "")} unit={orderQuantity?.unit ?? (quantity.unit || "st")} disabled={saving}
                    onQuantityChange={value => updateOrderQuantity({ quantity: value, unit: orderQuantity?.unit ?? (quantity.unit || "st") })}
                    onUnitChange={value => updateOrderQuantity({ quantity: orderQuantity?.quantity ?? String(quantity.quantity ?? ""), unit: value })} />
                  <p className="mt-1 text-xs text-neutral-600">PDF-posten: {formatProjectQuantity(quantity)}. Total mengde og enhet ovenfor følger med til Excel.</p>
                </div>
                {(manufacturerArticleNumber || deliveryTimeDays || unitPrice) && (
                  <dl className="grid overflow-hidden rounded-md border border-neutral-200 bg-white sm:grid-cols-3">
                    {manufacturerArticleNumber && <CompactProductDetail label="Artikelnummer" value={manufacturerArticleNumber} />}
                    {deliveryTimeDays && <CompactProductDetail label="Leveranstid" value={`${deliveryTimeDays} dagar`} />}
                    {unitPrice && <CompactProductDetail label="Pris" value={formatUnitPrice(unitPrice, priceCurrency)} />}
                  </dl>
                )}
                <Button neutral type="button" variant="secondary" disabled={saving} onClick={showAllProductAlternatives}>Bytt hovedprodukt</Button>
              </div>
              {accessorySection}
            </section>
          )}



          {productNumber.trim() && selectionReview?.status === "mismatch" && (
            <details className="text-sm text-neutral-700">
              <summary className="cursor-pointer font-semibold">Avvikelser mot postens krav · NRF {productNumber}</summary>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-xs">{selectionReview.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>
            </details>
          )}

          {manualProductOpen && (
            <section id={`manual-product-card-${requirement.id}`} aria-labelledby={`manual-product-title-${requirement.id}`} className="scroll-mt-24 overflow-hidden rounded-md border-2 border-neutral-300 bg-white shadow-sm">
              <div className="flex items-start justify-between gap-4 border-b border-neutral-200 bg-neutral-50 px-4 py-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.08em] text-neutral-700">Produktval från Ahlsell</p>
                  <h5 id={`manual-product-title-${requirement.id}`} className="mt-0.5 text-base font-bold text-neutral-950">Lägg till produkt</h5>
                  <p className="mt-1 text-xs leading-5 text-neutral-600">Sök på Ahlsells webbplats eller klistra in produktens länk. Produkten sparas när du godkänner valet.</p>
                </div>
                <button type="button" aria-label="Stäng Lägg till produkt" title="Stäng" onClick={closeManualProductCard} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-neutral-200 bg-white text-neutral-600 transition hover:border-neutral-300 hover:bg-neutral-50 hover:text-neutral-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-600">
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
              <div className="p-4">
                <AhlsellProductLookup projectId={projectId} requirementId={requirement.id} id={`ahlsell-product-lookup-${requirement.id}`} disabled={saving}
                  defaultQuantity={String(quantity.quantity ?? "")} defaultUnit={quantity.unit || "st"}
                  selections={productNumber ? [{ productNumber, quantity: orderQuantity?.quantity ?? String(quantity.quantity ?? ""), unit: orderQuantity?.unit ?? (quantity.unit || "st") }] : []}
                  onSelect={(candidate, amount) => { applyAhlsellCandidate(candidate, candidate.subtitle); updateOrderQuantity(amount); }}
                  onDeselect={clearSelectedProduct} onQuantityChange={(_candidate, amount) => updateOrderQuantity(amount)} />
              </div>
              <details className="border-t border-neutral-200">
                <summary className="cursor-pointer px-4 py-3 text-sm font-bold text-neutral-800">Registrera produkt manuellt</summary>
                <form className="space-y-4 p-4" onSubmit={(event) => { event.preventDefault(); applyManualProduct(); }}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <ProductFormInput id={`manual-product-nrf-${requirement.id}`} label="NRF-nummer" value={manualProductDraft.productNumber} onChange={(value) => updateManualProductDraft("productNumber", value)} required />
                  <ProductFormInput id={`manual-product-article-${requirement.id}`} label="Artikelnummer" value={manualProductDraft.manufacturerArticleNumber} onChange={(value) => updateManualProductDraft("manufacturerArticleNumber", value)} required />
                  <ProductFormInput id={`manual-product-manufacturer-${requirement.id}`} label="Tillverkare" value={manualProductDraft.manufacturerName} onChange={(value) => updateManualProductDraft("manufacturerName", value)} required />
                  <ProductFormInput id={`manual-product-delivery-${requirement.id}`} label="Leveranstid (dagar)" type="number" min="0" max="3650" step="1" inputMode="numeric" value={manualProductDraft.deliveryTimeDays} onChange={(value) => updateManualProductDraft("deliveryTimeDays", value)} required />
                  <ProductFormInput id={`manual-product-price-${requirement.id}`} label={`Pris per enhet (${normalizeCurrencyCode(manualProductDraft.currency) || defaultCurrency})`} inputMode="decimal" placeholder="0,00" value={manualProductDraft.unitPrice} onChange={(value) => updateManualProductDraft("unitPrice", value)} required />
                </div>
                <ProductQuantityFields id={`manual-product-${requirement.id}`} quantity={manualProductDraft.quantity} unit={manualProductDraft.unit} disabled={saving}
                  onQuantityChange={value => updateManualProductDraft("quantity", value)} onUnitChange={value => updateManualProductDraft("unit", value)} />
                {manualProductError && <p role="alert" className="rounded-md border border-neutral-300 bg-neutral-50 px-3 py-2 text-sm font-semibold text-neutral-900">{manualProductError}</p>}
                <div className="flex flex-col-reverse gap-2 border-t border-neutral-100 pt-4 sm:flex-row sm:justify-end">
                  <Button neutral type="button" variant="secondary" className="justify-center" onClick={closeManualProductCard}>Avbryt</Button>
                  <Button neutral type="submit" className="justify-center"><Plus className="h-4 w-4" aria-hidden="true" />Lägg till produkt</Button>
                </div>
              </form>
              </details>
            </section>
          )}

          <div id={`ahlsell-products-${requirement.id}`} hidden={Boolean(productNumber.trim()) || manualProductOpen} className="scroll-mt-24 overflow-hidden rounded-md border border-neutral-200 bg-white">
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

          {productNumber.trim() && !accessoryStepOpen && (
            <section id={`product-approval-${requirement.id}`} aria-labelledby={`product-approval-title-${requirement.id}`} className="rounded-md border border-neutral-300 bg-neutral-50 p-4">
              <h5 id={`product-approval-title-${requirement.id}`} className="text-base font-bold text-neutral-950">{hasAccessoryStep ? "4. Godkänn" : "3. Godkänn"}</h5>
              <p className="mt-1 text-sm leading-6 text-neutral-700">{hasAccessoryStep
                ? "Godkänn när du har gått igenom postens krav, valt huvudprodukt och kompletterat med de tillbehör som behövs."
                : "Godkänn när du har gått igenom postens krav och valt huvudprodukt."}</p>
              {commentDraftDirty && <p className="mt-2 text-xs font-semibold text-neutral-900">Spara kommentarerna eller töm kommentarsfälten före godkännandet.</p>}
              <Button neutral aria-label="Godkänn och spara produkt" title={manualProductRequired || manualProductDraftDirty ? "Lägg till produkten från kortet först" : hasAttachmentDraft ? "Spara vedlegget först" : accessoryError ?? "Godkänn och spara produkt"} className="mt-3 min-h-10 justify-center px-4 py-2 text-sm" type="button" onClick={() => void save()} disabled={saving || attachmentSaving || commentsSaving || commentDraftDirty || manualProductRequired || manualProductDraftDirty || hasAttachmentDraft || Boolean(accessoryError)}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ShieldCheck className="h-4 w-4" aria-hidden="true" />}
                {saving ? "Sparar…" : "Godkänn och spara"}
              </Button>
            </section>
          )}
          <div id={`product-comments-${requirement.id}`} className="scroll-mt-52">
            {productComments}
          </div>

        </div>

        {attachmentExpanded && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
            <button
              type="button"
              aria-label="Stäng vedlegg"
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
                  <p className="mt-0.5 text-xs leading-5 text-neutral-600">Lägg en kommentar och fil till PDF-post {details.postNumber ?? position}.</p>
                </div>
                <button
                  type="button"
                  aria-label="Stäng"
                  title="Stäng"
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
                    <span className="mb-1 flex items-center justify-between gap-3 text-xs font-semibold text-neutral-600"><span>Kommentar <span className="font-normal text-neutral-500">(valfritt)</span></span><span>{attachmentComment.length}/2000</span></span>
                    <textarea id={`attachment-comment-${requirement.id}`} rows={3} maxLength={2000} value={attachmentComment} onChange={(event) => { setAttachmentComment(event.target.value); setAttachmentError(null); setAttachmentMessage(null); }} className="block w-full resize-y rounded-sm border-neutral-300 bg-white text-sm text-neutral-900 shadow-none focus:border-neutral-500 focus:ring-neutral-500" />
                  </label>
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                    <label className="block" htmlFor={`attachment-file-${requirement.id}`}>
                      <span className="mb-1 block text-xs font-semibold text-neutral-600">Fil</span>
                      <input ref={attachmentInputRef} id={`attachment-file-${requirement.id}`} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.csv,.txt" onChange={(event) => { setAttachmentFile(event.target.files?.[0] ?? null); setAttachmentError(null); setAttachmentMessage(null); }} className="block min-h-10 w-full rounded-sm border border-neutral-300 bg-white text-sm text-neutral-800 file:mr-3 file:min-h-10 file:border-0 file:border-r file:border-neutral-200 file:bg-neutral-50 file:px-3 file:text-xs file:font-bold file:text-neutral-800 hover:file:bg-neutral-50" />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <Button neutral type="button" variant="secondary" className="min-h-10 justify-center px-3 py-2 text-sm" disabled={attachmentSaving || !hasAttachmentDraft} onClick={() => { setAttachmentComment(""); setAttachmentFile(null); setAttachmentError(null); setAttachmentMessage(null); if (attachmentInputRef.current) attachmentInputRef.current.value = ""; }}>

                        Rensa
                      </Button>
                      <Button neutral type="submit" className="min-h-10 justify-center px-4 py-2 text-sm" disabled={attachmentSaving || !attachmentFile}>
                        {attachmentSaving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Upload className="h-4 w-4" aria-hidden="true" />}
                        {attachmentSaving ? "Sparar…" : "Spara vedlegg"}
                      </Button>
                    </div>
                  </div>
                  <p className="text-xs text-neutral-500">Max 4 MB. Tillåtna format: PDF, PNG, JPG, WebP, TXT och CSV.</p>
                  {attachmentError && <p role="alert" className="rounded-md border border-neutral-300 bg-neutral-50 px-3 py-2 text-xs font-semibold text-neutral-900">{attachmentError}</p>}
                  {attachmentMessage && <p role="status" className="rounded-md border border-neutral-300 bg-neutral-50 px-3 py-2 text-xs font-semibold text-neutral-900">{attachmentMessage}</p>}
                </form>

                <div className="border-t border-neutral-200 pt-4">
                  <h5 className="text-xs font-bold uppercase tracking-[0.08em] text-neutral-600">Sparade vedlegg{attachments.length > 0 ? ` · ${attachments.length}` : ""}</h5>
                  {attachmentsLoading ? (
                    <p className="mt-2 flex items-center gap-2 text-xs font-semibold text-neutral-600"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Hämtar vedlegg…</p>
                  ) : attachments.length === 0 ? (
                    <p className="mt-2 text-xs text-neutral-600">Inga vedlegg har sparats för posten.</p>
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
                          <a href={attachment.downloadUrl} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-neutral-200 bg-white text-neutral-800 hover:border-neutral-400 hover:bg-neutral-50" aria-label={`Hämta ${attachment.fileName}`} title="Hämta vedlegg"><Download className="h-4 w-4" aria-hidden="true" /></a>
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
        if (!response.ok) throw new Error(payload?.error ?? "Ahlsell-sökningen misslyckades.");
        if (!payload) throw new Error("Ahlsell-sökningen gav inget läsbart svar.");
        if (controller.signal.aborted) return;
        setCatalogResult(payload);
        const status = ahlsellCatalogStatusFromPayload(payload);
        if (status) onCatalogResult(requirementId, status);
      })
      .catch((error) => {
        if (error instanceof Error && error.name === "AbortError") return;
        setCatalogError(error instanceof Error ? error.message : "Ahlsell-sökningen misslyckades.");
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
  // Selecting a listed article must keep the other matches available.
  const hasNrfFilter = Boolean(normalizeNrfNumber(selectedArticleNumber))
    && !candidatesByArticle.has(normalizeNrfNumber(selectedArticleNumber))
    && !memoryArticleNumbers.has(normalizeNrfNumber(selectedArticleNumber));
  const filteredCandidates = filterAhlsellCandidatesByNrf(candidates, hasNrfFilter ? selectedArticleNumber : "");
  const filteredMemories = usableMemories.filter((memory) => {
    const filter = hasNrfFilter ? normalizeNrfNumber(selectedArticleNumber) : "";
    return !filter || normalizeNrfNumber(String(memory.product_number)) === filter;
  });
  const totalResultCount = usableMemories.length + candidates.length;
  const filteredResultCount = filteredMemories.length + filteredCandidates.length;
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

  function clearSelection() {
    onClearSelection();
  }

  return (
    <section aria-labelledby="ahlsell-match-heading">
      <header className="px-3 py-3 sm:px-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.08em] text-neutral-700">Produktval</p>
            <h4 id="ahlsell-match-heading" className="mt-0.5 text-base font-bold text-neutral-950">Automatiska produktförslag från Ahlsell</h4>
          </div>
          <div className="flex shrink-0 items-center gap-3 pt-0.5 text-xs font-semibold">
            {!loadingCatalog && (
              <span className="text-neutral-600">
                {filteredResultCount} {filteredResultCount === 1 ? "träff" : "träffar"}
              </span>
            )}
            {hasNrfFilter && (
              <button type="button" className="font-bold text-neutral-800 underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-600" onClick={clearSelection}>

                Rensa NRF
              </button>
            )}
          </div>
        </div>
        <p className="mt-1.5 text-xs leading-5 text-neutral-600">Scipx söker automatiskt i Ahlsells sortiment utifrån PDF-postens krav. Markera en produkt för att fylla NRF-numret.</p>
      </header>

      {loadingCatalog && (
        <div className="flex min-h-16 items-center justify-center gap-2 border-t border-neutral-200 bg-neutral-50 px-3 py-3 text-sm font-bold text-neutral-800" role="status">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Söker automatiskt på Ahlsells webbplats…
        </div>
      )}

      {catalogError && (
        <div className="border-t border-neutral-300 bg-neutral-50 px-3 py-3 text-xs leading-5 text-neutral-950 sm:px-4" role="alert">
          <p className="font-bold">Produktlistan kunde inte hämtas.</p>
          <p>{catalogError}  Du kan söka manuellt via ”Lägg till produkt”.</p>
        </div>
      )}

      {!loadingCatalog && catalogResult?.publicSearchStatus && catalogResult.publicSearchStatus !== "available" && (
        <div className="border-t border-neutral-300 bg-neutral-50 px-3 py-2 text-xs leading-5 text-neutral-950 sm:px-4" role="status">
          {catalogResult.publicSearchStatus === "unavailable"
            ? "Ahlsells webbplats kunde inte nås. Produktförslagen från MLDL finns kvar."
            : "En del av Ahlsell-sökningen kunde inte slutföras. MLDL och de hämtade webbträffarna visas."}
        </div>
      )}

      {!loadingCatalog && !catalogError && catalogResult?.truncated && (
        <div className="border-t border-neutral-300 bg-neutral-50 px-3 py-2 text-xs font-semibold leading-5 text-neutral-950 sm:px-4">

          Fler träffar finns hos Ahlsell. Listan innehåller alla matchande produkter från den avgränsade sökningen.
        </div>
      )}

      {!loadingCatalog && hasNrfFilter && filteredResultCount === 0 && totalResultCount > 0 && (
        <div className="flex flex-col gap-3 border-t border-neutral-300 bg-neutral-50 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4" role="status">
          <p className="text-sm font-semibold text-neutral-950">Inga hämtade produkter har NRF-nummer {selectedArticleNumber.trim()}.</p>
          <Button neutral type="button" variant="secondary" className="min-h-9 shrink-0 justify-center px-3 py-1.5 text-xs" onClick={clearSelection}>
            <RotateCcw className="h-4 w-4" aria-hidden="true" />Visa alla produkter
          </Button>
        </div>
      )}

      {filteredMemories.length > 0 && (
        <div className="border-t border-neutral-300" role="group" aria-label="Tidigare bekräftade produkter">
          <div className={memoriesAreExact ? "bg-neutral-100/80 px-3 py-2 sm:px-4" : "bg-neutral-50 px-3 py-2 sm:px-4"}>
            <p className={memoriesAreExact ? "flex items-center gap-1.5 text-xs font-bold text-neutral-900" : "flex items-center gap-1.5 text-xs font-bold text-neutral-900"}>
              {memoriesAreExact ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : <AlertTriangle className="h-4 w-4" aria-hidden="true" />}
              {memoriesAreExact ? "Exakt match från tidigare bekräftade val" : "Tidigare val finns, men PDF-uppgifterna måste kontrolleras"}
            </p>
            <p className="mt-0.5 text-xs text-neutral-600">Valet måste godkännas på nytt i detta projekt.</p>
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
                        {memoriesAreExact ? "Exakt match · tidigare bekräftad" : "Tidigare bekräftad · kontroll krävs"}
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
                        aria-label={`${isSelected ? "Ta bort valet av" : "Välj"} tidigare bekräftad produkt ${productName}, NRF-nummer ${articleNumber}`}
                        className="h-5 w-5 shrink-0 cursor-pointer rounded border-neutral-300 text-neutral-700 focus:ring-neutral-600 disabled:cursor-not-allowed"
                      />
                      <span aria-hidden="true">{isSelected ? "Ta bort val" : "Välj"}</span>
                    </label>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      )}

      <AhlsellCandidateList
        candidates={filteredCandidates}
        requirementId={requirementId}
        selectedArticleNumber={selectedArticleNumber}
        disabled={disabled}
        allowMatches={memoriesAreExact}
        accessoryRequirements={guide.accessoryRequirements}
        showNoMatch={!loadingCatalog && !catalogError && !hasNrfFilter && filteredMemories.length === 0}
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
            {details.attributes.map(([key, value]) => <SpecificationRow key={key} label={specificationLabel(key)} value={value} />)}
          </dl>
          {details.sourceExcerpt && <pre className="max-h-72 overflow-auto whitespace-pre-wrap border-t border-ink-100 bg-ink-50 p-4 font-sans text-sm leading-6 text-ink-700">{details.sourceExcerpt}</pre>}
        </details>
      </div>
    </article>
  );
}

function RequirementQueueRow({ requirement, assignment, memory, bulkSelection, productLabel, sourcePdfHref, columns, position, approved, group, selected, selectionDisabled, onSelectedChange, onOpen }: {
  requirement: Row;
  assignment?: Row;
  memory?: Row;
  bulkSelection?: BulkProductApprovalSelection;
  productLabel?: AhlsellProductLabel;
  sourcePdfHref: string | null;
  columns: ProductTableColumnId[];
  position: number;
  approved: boolean;
  group: AhlsellMatchGroup;
  selected: boolean;
  selectionDisabled: boolean;
  onSelectedChange: (selected: boolean) => void;
  onOpen: () => void;
}) {
  const details = projectRequirementDetails(requirement);
  const dataWarnings = projectRequirementDataWarnings(requirement);
  const quantity = projectRequirementQuantity(requirement.value_json);
  const productSnapshot = record(assignment?.product_snapshot);
  const resolution = productRequirementResolution(requirement);
  const productName = String(productSnapshot.name ?? "").trim();
  const productSubtitle = String(productSnapshot.subtitle ?? "").trim();
  const productNumber = String(productSnapshot.productNumber ?? "").trim();
  const memoryProductName = String(memory?.product_name ?? "").trim();
  const memoryProductNumber = String(memory?.product_number ?? "").trim();
  const memoryProductSubtitle = String(memory?.product_subtitle ?? "").trim();
  const hasReusableMemory = !approved && Boolean(memoryProductName && memoryProductNumber);
  const displayProductNumber = productNumber || bulkSelection?.productNumber || memoryProductNumber;
  const matchingProductLabel = productLabel
    && normalizeNrfNumber(productLabel.articleNumber) === normalizeNrfNumber(displayProductNumber)
      ? productLabel
      : undefined;
  const selectedProductDisplayName = productSubtitle || matchingProductLabel?.subtitle || productName;
  const suggestedProductDisplayName = matchingProductLabel?.subtitle
    || memoryProductSubtitle
    || bulkSelection?.productName
    || memoryProductName;
  const categoryLabel = productRequirementCategoryLabel(productRequirementCategory(requirement));
  const rowClass = productTableRowClass({ approved, selected });

  function renderProductTableCell(columnId: ProductTableColumnId) {
    if (columnId === "control") {
      return (
        <td key={columnId} className="px-2 py-2.5 text-center align-middle">
          {approved ? (
            <span title="Godkänd" className="inline-flex text-emerald-700"><CheckCircle2 className="h-5 w-5" aria-hidden="true" /><span className="sr-only">Godkänd</span></span>
          ) : resolution ? (
            <span title={resolution.label} className="inline-flex text-slate-700"><Tag className="h-5 w-5" aria-hidden="true" /><span className="sr-only">{resolution.label}</span></span>
          ) : group === "red" ? (
            <span title="Ingen match bland kontrollerade produkter" className="inline-flex text-rose-600"><CircleX className="h-5 w-5" aria-hidden="true" /><span className="sr-only">Ingen match bland kontrollerade produkter</span></span>
          ) : group === "green" ? (
            <span title="Match utan kvarstående tekniska varningar – kontrollera och godkänn" className="inline-flex text-emerald-700"><CheckCircle2 className="h-5 w-5" aria-hidden="true" /><span className="sr-only">Match utan kvarstående tekniska varningar – kontrollera och godkänn</span></span>
          ) : (
            <span title="Produkten måste ses över" className="inline-flex text-amber-600"><AlertTriangle className="h-5 w-5" aria-hidden="true" /><span className="sr-only">Produkten måste ses över</span></span>
          )}
        </td>
      );
    }
    if (columnId === "post") {
      return (
        <td key={columnId} className="px-3 py-2.5 align-middle">
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-haspopup="dialog"
              aria-label={`Öppna produktkort för PDF-post ${details.postNumber ?? position}`}
              onClick={onOpen}
              className="text-sm font-black text-flow-800 hover:text-flow-950 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-flow-600"
            >
              {details.postNumber ?? position}
            </button>
          {sourcePdfHref && (
            <a
              href={sourcePdfHref}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Öppna PDF-post ${details.postNumber ?? position}${details.sourcePage ? ` på sida ${details.sourcePage}` : ""}`}
              title={details.sourcePage ? `Öppna posten på sida ${details.sourcePage} i PDF` : "Öppna posten i PDF"}
              className="inline-flex items-center gap-1 text-sm font-black text-flow-800 hover:text-flow-950 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-flow-600"
            >
              <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
            </a>
          )}
          </div>
        </td>
      );
    }
    if (columnId === "nsCode") {
      return (
        <td key={columnId} className="px-3 py-2.5 align-middle text-xs font-semibold text-ink-800">
          <button type="button" aria-haspopup="dialog" onClick={onOpen} aria-label={`Öppna produktkort för ${details.nsCode ?? "posten"}`} className="text-left hover:text-flow-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-flow-600">
            <span className="whitespace-nowrap font-semibold">{details.nsCode || "—"}</span>
          </button>
        </td>
      );
    }
    if (columnId === "requirement") {
      return (
        <td key={columnId} className="px-3 py-2.5 align-middle">
          <button type="button" aria-haspopup="dialog" onClick={onOpen} className="text-left text-xs font-semibold leading-5 text-ink-950 hover:text-flow-800">{productTableRequirementLabel(requirement)}</button>
          {!approved && dataWarnings.map((warning) => (
            <span key={warning.code} title={warning.message} className="mt-0.5 flex items-center gap-1 text-[10px] font-bold leading-4 text-amber-800">
              <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" />
              {warning.label}
            </span>
          ))}
        </td>
      );
    }
    if (columnId === "category") return <td key={columnId} className="px-3 py-2.5 align-middle text-xs font-semibold text-ink-800">{categoryLabel}</td>;
    if (columnId === "quantity") return <td key={columnId} className="whitespace-nowrap px-3 py-2.5 align-middle text-xs font-bold text-ink-900">{formatProjectQuantity(quantity)}</td>;
    return (
      <td key={columnId} className="px-3 py-2.5 align-middle text-xs">
        {productName || productNumber ? (
          <><span className="block font-bold leading-4 text-ink-950" title={productName || selectedProductDisplayName}>{selectedProductDisplayName || `NRF ${productNumber}`}</span>{productNumber && <span className="block text-[10px] text-ink-600">NRF-nummer {productNumber}</span>}</>
        ) : bulkSelection ? (
          <><span className="block font-bold leading-4 text-sky-950" title={bulkSelection.productName}>{suggestedProductDisplayName}</span><span className="block text-[10px] text-sky-700">{bulkSelection.source === "memory" ? "Tidigare val" : "Direktträff"} · NRF-nummer {bulkSelection.productNumber}</span></>
        ) : hasReusableMemory ? (
          <><span className="block font-bold leading-4 text-sky-900">{memoryProductSubtitle || memoryProductName}</span><span className="block text-[10px] text-sky-700">Tidigare · NRF-nummer {memoryProductNumber}</span></>
        ) : (
          <span className="italic text-ink-500">Ingen produkt vald</span>
        )}
      </td>
    );
  }

  return (
    <tr className={`border-b border-ink-100 transition last:border-b-0 ${rowClass}`}>
      <td className="border-r border-ink-100 px-3 py-2.5 text-center">
        <input type="checkbox" aria-label={`Välj PDF-post ${details.postNumber ?? position}`} title={selectionDisabled ? "Endast poster med ett otvetydigt produktval kan massgodkännas" : "Välj för gemensamt godkännande"} checked={selected} disabled={selectionDisabled} onChange={(event) => onSelectedChange(event.target.checked)} className="h-4 w-4 rounded border-ink-300 text-flow-700 focus:ring-flow-500 disabled:cursor-not-allowed disabled:opacity-35" />
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

function productTableRequirementLabel(requirement: Row) {
  const codeInfo = ns3420CodeInfo(projectRequirementDetails(requirement).nsCode);
  return codeInfo?.kind === "reference"
    ? codeInfo.label
    : String(requirement.value_text ?? "Tekniskt produktkrav");
}

function productTableSortValue(
  requirement: Row,
  key: ProductTableSortKey,
  approved: boolean,
  group: AhlsellMatchGroup,
  assignment?: Row,
  memory?: Row,
  bulkSelection?: BulkProductApprovalSelection,
  productLabel?: AhlsellProductLabel
): string | number | null {
  if (key === "control") {
    if (productRequirementResolution(requirement)) return 4;
    if (approved) return 3;
    if (group === "green") return 2;
    return group === "red" ? 0 : 1;
  }
  if (key === "post") return projectRequirementDetails(requirement).postNumber;
  if (key === "nsCode") return projectRequirementDetails(requirement).nsCode;
  if (key === "requirement") return productTableRequirementLabel(requirement);
  if (key === "category") return productRequirementCategoryLabel(productRequirementCategory(requirement));
  if (key === "quantity") return projectRequirementQuantity(requirement.value_json).quantity;

  const productSnapshot = record(assignment?.product_snapshot);
  const productSubtitle = String(productSnapshot.subtitle ?? "").trim();
  const productName = String(productSnapshot.name ?? "").trim();
  const productNumber = String(productSnapshot.productNumber ?? "").trim();
  const displayProductNumber = productNumber || bulkSelection?.productNumber || String(memory?.product_number ?? "").trim();
  const resolvedLabel = productLabel
    && normalizeNrfNumber(productLabel.articleNumber) === normalizeNrfNumber(displayProductNumber)
      ? productLabel.subtitle
      : "";
  if (productSubtitle || resolvedLabel || productName) return productSubtitle || resolvedLabel || productName;
  if (bulkSelection) return bulkSelection.productName;
  const memoryProductSubtitle = String(memory?.product_subtitle ?? "").trim();
  const memoryProductName = String(memory?.product_name ?? "").trim();
  const memoryProductNumber = String(memory?.product_number ?? "").trim();
  return !approved && memoryProductName && memoryProductNumber
    ? memoryProductSubtitle || memoryProductName
    : null;
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
  return <div className="border-b border-neutral-100 px-4 py-3 sm:border-r"><dt className="text-xs font-bold uppercase tracking-wide text-neutral-500">{label}</dt><dd className="mt-1 break-words text-sm leading-6 text-neutral-900">{value}</dd></div>;
}

function CompactProductDetail({ label, value }: { label: string; value: string }) {
  return <div className="border-b border-neutral-100 px-3 py-2.5 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0"><dt className="text-[10px] font-bold uppercase tracking-wide text-neutral-500">{label}</dt><dd className="mt-0.5 break-words text-xs font-bold leading-5 text-neutral-900">{value}</dd></div>;
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

function ProductFormInput({ id, label, value, onChange, required = false, optional = false, readOnly = false, type = "text", min, max, step, inputMode, placeholder }: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  optional?: boolean;
  readOnly?: boolean;
  type?: string;
  min?: string;
  max?: string;
  step?: string;
  inputMode?: "none" | "text" | "tel" | "url" | "email" | "numeric" | "decimal" | "search";
  placeholder?: string;
}) {
  return (
    <label className="block" htmlFor={id}>
      <span className="mb-1 block text-xs font-semibold text-neutral-600">
        {label}{required && <span className="ml-1 font-black text-neutral-600">*</span>}{optional && <span className="ml-1 font-normal text-neutral-500">(valfritt)</span>}
      </span>
      <input id={id} type={type} min={min} max={max} step={step} inputMode={inputMode} placeholder={placeholder} required={required} readOnly={readOnly} value={value} onChange={(event) => onChange(event.target.value)} className="block h-10 w-full rounded-sm border-neutral-300 bg-neutral-50 text-sm text-neutral-900 shadow-none focus:border-neutral-500 focus:ring-neutral-500 read-only:cursor-default read-only:bg-neutral-100" />
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
    return new Intl.NumberFormat("sv-SE", {
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
      throw new Error(payload?.error ?? "Ahlsells produkttexter kunde inte hämtas.");
    }
    Object.assign(labels, payload?.labels ?? {});
  }
  return labels;
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
