import { isUserApprovedProductAssignment } from "./approved-product-assignment";
import type { BusinessDevelopmentRequirementRow } from "./business-development-statistics";
import { splitDistributorRequirementLines } from "./distributor-requirement-lines";
import { productRequirementResolution } from "./product-requirement-resolution";

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const STALE_AFTER_DAYS = 14;
const UNKNOWN_CUSTOMER = "Kund ej angiven";

export type CommercialProjectRow = Record<string, unknown> & {
  id: string;
  name: string;
  customer_name?: string | null;
  end_customer?: string | null;
  project_number?: string | null;
  status: string;
  current_stage?: string | null;
  created_at: string;
  updated_at: string;
  created_by?: string | null;
  assigned_to?: string | null;
  project_manager_id?: string | null;
  expected_delivery_date?: string | null;
  demo_data_set_id?: string | null;
};

export type CommercialAssignmentRow = Record<string, unknown> & {
  id?: string;
  project_id: string;
  requirement_id: string | null;
  status: string;
  product_snapshot: unknown;
  selected_at?: string | null;
};

export type CommercialTechnicalPhaseKey =
  | "new_request"
  | "analysis"
  | "product_selection"
  | "review"
  | "completed";

export type CommercialProjectInsight = {
  id: string;
  name: string;
  customerName: string;
  projectNumber: string | null;
  status: string;
  currentStage: string;
  technicalPhase: string;
  technicalPhaseKey: CommercialTechnicalPhaseKey;
  createdAt: string;
  updatedAt: string;
  expectedDeliveryDate: string | null;
  ownerUserId: string | null;
  totalProductRequirements: number;
  approvedProductRequirements: number;
  notInAssortmentCount: number;
  handledProductRequirements: number;
  remainingProductRequirements: number;
  productProgress: number;
  isCompleted: boolean;
  isActive: boolean;
  isArchived: boolean;
  isStale: boolean;
  isOverdue: boolean;
  needsFollowUp: boolean;
  nextAction: string;
};

export type CommercialPipelineItem = {
  key: CommercialTechnicalPhaseKey;
  label: string;
  count: number;
  percentage: number;
};

export type CommercialCustomerSummary = {
  customerName: string;
  totalProjects: number;
  activeProjects: number;
  completedProjects: number;
  productProgress: number;
  notInAssortmentCount: number;
};

export type CommercialMonthlyActivity = {
  monthKey: string;
  label: string;
  created: number;
  completed: number;
};

export type CommercialTopApprovedProduct = {
  key: string;
  name: string;
  nrfNumber: string | null;
  approvals: number;
  projectCount: number;
};

export type CommercialProjectInsights = {
  projects: CommercialProjectInsight[];
  totalProjects: number;
  activeProjects: number;
  completedProjects: number;
  archivedProjects: number;
  createdThisMonth: number;
  staleProjects: number;
  overdueProjects: number;
  customerCount: number;
  averageProductProgress: number;
  pipeline: CommercialPipelineItem[];
  customerSummaries: CommercialCustomerSummary[];
  monthlyActivity: CommercialMonthlyActivity[];
  topApprovedProducts: CommercialTopApprovedProduct[];
};

export function buildCommercialProjectInsights(
  {
    projects,
    requirements,
    assignments
  }: {
    projects: readonly CommercialProjectRow[];
    requirements: readonly BusinessDevelopmentRequirementRow[];
    assignments: readonly CommercialAssignmentRow[];
  },
  now = new Date()
): CommercialProjectInsights {
  const liveProjects = projects.filter((project) => !project.demo_data_set_id);
  const liveProjectIds = new Set(liveProjects.map((project) => project.id));
  const productRequirements = splitDistributorRequirementLines(
    requirements.filter((requirement) => liveProjectIds.has(requirement.project_id))
  ).productRequirements;
  const productRequirementById = new Map(
    productRequirements.map((requirement) => [requirement.id, requirement] as const)
  );
  const approvedAssignmentByRequirementId = latestApprovedAssignments(
    assignments,
    productRequirementById
  );
  const productRequirementsByProject = groupBy(
    productRequirements,
    (requirement) => requirement.project_id
  );

  const projectInsights = liveProjects
    .map((project) => buildProjectInsight({
      project,
      productRequirements: productRequirementsByProject.get(project.id) ?? [],
      approvedAssignmentByRequirementId,
      now
    }))
    .sort(compareProjects);
  const activeProjects = projectInsights.filter((project) => project.isActive);
  const completedProjects = projectInsights.filter((project) => project.isCompleted);
  const pipelineProjects = projectInsights.filter((project) => !project.isArchived);
  const progressProjects = projectInsights.filter(
    (project) => project.totalProductRequirements > 0
  );
  return {
    projects: projectInsights,
    totalProjects: projectInsights.length,
    activeProjects: activeProjects.length,
    completedProjects: completedProjects.length,
    archivedProjects: projectInsights.filter((project) => project.isArchived).length,
    createdThisMonth: projectInsights.filter((project) =>
      isSameUtcMonth(project.createdAt, now)
    ).length,
    staleProjects: activeProjects.filter((project) => project.isStale).length,
    overdueProjects: activeProjects.filter((project) => project.isOverdue).length,
    customerCount: identifiedCustomerCount(projectInsights),
    averageProductProgress: progressProjects.length > 0
      ? Math.round(average(progressProjects.map((project) => project.productProgress)))
      : 0,
    pipeline: buildPipeline(pipelineProjects),
    customerSummaries: buildCustomerSummaries(projectInsights),
    monthlyActivity: buildMonthlyActivity(projectInsights, now),
    topApprovedProducts: buildTopApprovedProducts({
      approvedAssignmentByRequirementId,
      productRequirementById
    })
  };
}

function buildProjectInsight({
  project,
  productRequirements,
  approvedAssignmentByRequirementId,
  now
}: {
  project: CommercialProjectRow;
  productRequirements: readonly BusinessDevelopmentRequirementRow[];
  approvedAssignmentByRequirementId: ReadonlyMap<string, CommercialAssignmentRow>;
  now: Date;
}): CommercialProjectInsight {
  const approvedRequirementIds = new Set(
    productRequirements
      .filter((requirement) => approvedAssignmentByRequirementId.has(requirement.id))
      .map((requirement) => requirement.id)
  );
  const notInAssortmentRequirementIds = new Set(
    productRequirements
      .filter((requirement) => productRequirementResolution(requirement) !== null)
      .map((requirement) => requirement.id)
  );
  const handledRequirementIds = new Set([
    ...approvedRequirementIds,
    ...notInAssortmentRequirementIds
  ]);
  const totalProductRequirements = productRequirements.length;
  const handledProductRequirements = handledRequirementIds.size;
  const currentStage = firstText(project.current_stage) ?? "setup";
  const isArchived = project.status === "archived";
  const isCompleted = !isArchived && (
    project.status === "completed" || currentStage === "completed"
  );
  const isActive = !isArchived && !isCompleted;
  const technicalPhase = resolveTechnicalPhase(currentStage, isCompleted);
  const isStale = isActive && daysBetween(project.updated_at, now) > STALE_AFTER_DAYS;
  const isOverdue = isActive && isDateBeforeToday(project.expected_delivery_date, now);
  const remainingProductRequirements = Math.max(
    0,
    totalProductRequirements - handledProductRequirements
  );
  const notInAssortmentCount = notInAssortmentRequirementIds.size;
  const needsFollowUp = isActive && (
    isOverdue || isStale || notInAssortmentCount > 0 || remainingProductRequirements > 0
  );

  return {
    id: project.id,
    name: firstText(project.name) ?? "Projekt utan namn",
    customerName: projectCustomerName(project),
    projectNumber: firstText(project.project_number),
    status: project.status,
    currentStage,
    technicalPhase: technicalPhase.label,
    technicalPhaseKey: technicalPhase.key,
    createdAt: project.created_at,
    updatedAt: project.updated_at,
    expectedDeliveryDate: firstText(project.expected_delivery_date),
    ownerUserId: firstText(
      project.assigned_to,
      project.project_manager_id,
      project.created_by
    ),
    totalProductRequirements,
    approvedProductRequirements: approvedRequirementIds.size,
    notInAssortmentCount,
    handledProductRequirements,
    remainingProductRequirements,
    productProgress: percent(handledProductRequirements, totalProductRequirements),
    isCompleted,
    isActive,
    isArchived,
    isStale,
    isOverdue,
    needsFollowUp,
    nextAction: projectNextAction({
      isArchived,
      isCompleted,
      isOverdue,
      isStale,
      notInAssortmentCount,
      remainingProductRequirements,
      totalProductRequirements,
      technicalPhaseKey: technicalPhase.key
    })
  };
}

function latestApprovedAssignments(
  assignments: readonly CommercialAssignmentRow[],
  productRequirementById: ReadonlyMap<string, BusinessDevelopmentRequirementRow>
) {
  const result = new Map<string, CommercialAssignmentRow>();
  for (const assignment of assignments) {
    const requirementId = assignment.requirement_id;
    if (
      typeof requirementId !== "string"
      || !productRequirementById.has(requirementId)
      || !isUserApprovedProductAssignment(assignment)
    ) {
      continue;
    }

    const existing = result.get(requirementId);
    if (!existing || approvalTimestamp(assignment) >= approvalTimestamp(existing)) {
      result.set(requirementId, assignment);
    }
  }
  return result;
}

function buildPipeline(
  projects: readonly CommercialProjectInsight[]
): CommercialPipelineItem[] {
  const total = projects.length;
  return TECHNICAL_PHASES.map((phase) => {
    const count = projects.filter(
      (project) => project.technicalPhaseKey === phase.key
    ).length;
    return { ...phase, count, percentage: percent(count, total) };
  });
}

function buildCustomerSummaries(
  projects: readonly CommercialProjectInsight[]
): CommercialCustomerSummary[] {
  const groups = new Map<string, CustomerAccumulator>();
  for (const project of projects) {
    const key = normalize(project.customerName);
    const current = groups.get(key) ?? {
      customerName: project.customerName,
      totalProjects: 0,
      activeProjects: 0,
      completedProjects: 0,
      totalProductRequirements: 0,
      handledProductRequirements: 0,
      notInAssortmentCount: 0
    };
    current.totalProjects += 1;
    if (project.isActive) current.activeProjects += 1;
    if (project.isCompleted) current.completedProjects += 1;
    current.totalProductRequirements += project.totalProductRequirements;
    current.handledProductRequirements += project.handledProductRequirements;
    current.notInAssortmentCount += project.notInAssortmentCount;
    groups.set(key, current);
  }

  return [...groups.values()]
    .map((group) => ({
      customerName: group.customerName,
      totalProjects: group.totalProjects,
      activeProjects: group.activeProjects,
      completedProjects: group.completedProjects,
      productProgress: percent(
        group.handledProductRequirements,
        group.totalProductRequirements
      ),
      notInAssortmentCount: group.notInAssortmentCount
    }))
    .sort((left, right) =>
      right.activeProjects - left.activeProjects
      || right.totalProjects - left.totalProjects
      || left.customerName.localeCompare(right.customerName, "sv")
    );
}

function buildMonthlyActivity(
  projects: readonly CommercialProjectInsight[],
  now: Date
): CommercialMonthlyActivity[] {
  const months = Array.from({ length: 6 }, (_, index) => {
    const offset = 5 - index;
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));
  });

  return months.map((month) => {
    const monthKey = utcMonthKey(month);
    return {
      monthKey,
      label: `${SWEDISH_MONTHS[month.getUTCMonth()]} ${month.getUTCFullYear()}`,
      created: projects.filter((project) => utcMonthKey(project.createdAt) === monthKey).length,
      completed: projects.filter((project) =>
        project.isCompleted && utcMonthKey(project.updatedAt) === monthKey
      ).length
    };
  });
}

function buildTopApprovedProducts({
  approvedAssignmentByRequirementId,
  productRequirementById
}: {
  approvedAssignmentByRequirementId: ReadonlyMap<string, CommercialAssignmentRow>;
  productRequirementById: ReadonlyMap<string, BusinessDevelopmentRequirementRow>;
}): CommercialTopApprovedProduct[] {
  const groups = new Map<string, ApprovedProductAccumulator>();
  for (const [requirementId, assignment] of approvedAssignmentByRequirementId) {
    const requirement = productRequirementById.get(requirementId);
    if (!requirement) continue;
    const snapshot = record(assignment.product_snapshot);
    const nrfNumber = firstText(
      snapshot.productNumber,
      snapshot.nrfNumber,
      snapshot.articleNumber
    );
    const name = firstText(snapshot.subtitle, snapshot.name)
      ?? (nrfNumber ? `NRF ${nrfNumber}` : "Godkänd produkt");
    const key = nrfNumber
      ? `nrf:${normalizeProductNumber(nrfNumber)}`
      : `name:${normalize(name)}`;
    const current = groups.get(key) ?? {
      key,
      name,
      nrfNumber,
      approvals: 0,
      projectIds: new Set<string>()
    };
    current.approvals += 1;
    current.projectIds.add(requirement.project_id);
    groups.set(key, current);
  }

  return [...groups.values()]
    .map((group) => ({
      key: group.key,
      name: group.name,
      nrfNumber: group.nrfNumber,
      approvals: group.approvals,
      projectCount: group.projectIds.size
    }))
    .sort((left, right) =>
      right.approvals - left.approvals
      || right.projectCount - left.projectCount
      || left.name.localeCompare(right.name, "sv")
    );
}

const TECHNICAL_PHASES: ReadonlyArray<{
  key: CommercialTechnicalPhaseKey;
  label: string;
}> = [
  { key: "new_request", label: "Ny förfrågan" },
  { key: "analysis", label: "Under analys" },
  { key: "product_selection", label: "Produktval" },
  { key: "review", label: "Underlag och granskning" },
  { key: "completed", label: "Klart" }
];

const SWEDISH_MONTHS = [
  "jan", "feb", "mar", "apr", "maj", "jun",
  "jul", "aug", "sep", "okt", "nov", "dec"
] as const;

function resolveTechnicalPhase(
  stage: string,
  isCompleted: boolean
): { key: CommercialTechnicalPhaseKey; label: string } {
  if (isCompleted || stage === "completed") return TECHNICAL_PHASES[4];
  if (stage === "product_matching") return TECHNICAL_PHASES[2];
  if (stage === "material_list" || stage === "approval") return TECHNICAL_PHASES[3];
  if (["technical_description", "requirements_review", "analysis"].includes(stage)) {
    return TECHNICAL_PHASES[1];
  }
  return TECHNICAL_PHASES[0];
}

function projectNextAction({
  isArchived,
  isCompleted,
  isOverdue,
  isStale,
  notInAssortmentCount,
  remainingProductRequirements,
  totalProductRequirements,
  technicalPhaseKey
}: {
  isArchived: boolean;
  isCompleted: boolean;
  isOverdue: boolean;
  isStale: boolean;
  notInAssortmentCount: number;
  remainingProductRequirements: number;
  totalProductRequirements: number;
  technicalPhaseKey: CommercialTechnicalPhaseKey;
}) {
  if (isArchived) return "Arkiverat – ingen projektåtgärd";
  if (isCompleted) return "Projektunderlaget är klart";
  if (isOverdue) return "Följ upp passerat leveransdatum";
  if (notInAssortmentCount > 0) {
    return `Bedöm ${countLabel(notInAssortmentCount, "produktpost", "produktposter")} utanför sortimentet`;
  }
  if (remainingProductRequirements > 0) {
    return `Hantera ${countLabel(remainingProductRequirements, "återstående produktpost", "återstående produktposter")}`;
  }
  if (isStale) return "Följ upp projektet – ingen uppdatering på över 14 dagar";
  if (technicalPhaseKey === "new_request") return "Granska och strukturera projektunderlaget";
  if (technicalPhaseKey === "analysis") return "Fortsätt den tekniska kravanalysen";
  if (technicalPhaseKey === "product_selection") {
    return totalProductRequirements > 0
      ? "Färdigställ produktvalet"
      : "Kontrollera de extraherade produktkraven";
  }
  return "Slutför underlag och granskning";
}

function compareProjects(
  left: CommercialProjectInsight,
  right: CommercialProjectInsight
) {
  return Number(right.needsFollowUp) - Number(left.needsFollowUp)
    || Number(right.isOverdue) - Number(left.isOverdue)
    || Number(right.isStale) - Number(left.isStale)
    || dateTimestamp(right.updatedAt) - dateTimestamp(left.updatedAt)
    || left.name.localeCompare(right.name, "sv");
}

function identifiedCustomerCount(projects: readonly CommercialProjectInsight[]) {
  return new Set(
    projects
      .map((project) => project.customerName)
      .filter((customer) => customer !== UNKNOWN_CUSTOMER)
      .map(normalize)
  ).size;
}

function projectCustomerName(project: CommercialProjectRow) {
  return firstText(project.customer_name, project.end_customer) ?? UNKNOWN_CUSTOMER;
}

function approvalTimestamp(assignment: CommercialAssignmentRow) {
  const snapshot = record(assignment.product_snapshot);
  return dateTimestamp(firstText(assignment.selected_at, snapshot.approvedAt));
}

function isDateBeforeToday(value: unknown, now: Date) {
  const timestamp = dateTimestamp(value);
  if (!Number.isFinite(timestamp)) return false;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const date = new Date(timestamp);
  const targetDay = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate()
  );
  return targetDay < today;
}

function isSameUtcMonth(value: unknown, date: Date) {
  return utcMonthKey(value) === utcMonthKey(date);
}

function utcMonthKey(value: unknown) {
  const timestamp = dateTimestamp(value);
  if (!Number.isFinite(timestamp)) return "";
  const date = new Date(timestamp);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function daysBetween(start: unknown, end: Date) {
  const startTimestamp = dateTimestamp(start);
  if (!Number.isFinite(startTimestamp)) return 0;
  return Math.max(0, (end.getTime() - startTimestamp) / DAY_IN_MS);
}

function dateTimestamp(value: unknown) {
  if (value instanceof Date) return value.getTime();
  if (typeof value !== "string" || !value.trim()) return Number.NaN;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : Number.NaN;
}

function countLabel(value: number, singular: string, plural: string) {
  return `${value} ${value === 1 ? singular : plural}`;
}

function percent(value: number, total: number) {
  return total > 0 ? Math.round((value / total) * 100) : 0;
}

function average(values: readonly number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function normalize(value: string) {
  return value.toLocaleLowerCase("sv").replace(/\s+/g, " ").trim();
}

function normalizeProductNumber(value: string) {
  return value.replace(/[^a-z0-9]/gi, "").toUpperCase();
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function groupBy<Row>(
  rows: readonly Row[],
  keyFor: (row: Row) => string
) {
  const groups = new Map<string, Row[]>();
  for (const row of rows) {
    const key = keyFor(row);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return groups;
}

type CustomerAccumulator = {
  customerName: string;
  totalProjects: number;
  activeProjects: number;
  completedProjects: number;
  totalProductRequirements: number;
  handledProductRequirements: number;
  notInAssortmentCount: number;
};

type ApprovedProductAccumulator = {
  key: string;
  name: string;
  nrfNumber: string | null;
  approvals: number;
  projectIds: Set<string>;
};
