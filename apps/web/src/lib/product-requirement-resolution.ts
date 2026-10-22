export const PRODUCT_REQUIREMENT_RESOLUTIONS = {
  not_in_assortment: "Inte i sortiment"
} as const;

export type ProductRequirementResolutionStatus = keyof typeof PRODUCT_REQUIREMENT_RESOLUTIONS;

export function productRequirementResolution(requirement: unknown) {
  const valueJson = record(record(requirement).value_json);
  const resolution = record(valueJson.productResolution);
  const status = resolution.status;
  if (typeof status !== "string" || !(status in PRODUCT_REQUIREMENT_RESOLUTIONS)) {
    return null;
  }

  return {
    status: status as ProductRequirementResolutionStatus,
    label: PRODUCT_REQUIREMENT_RESOLUTIONS[status as ProductRequirementResolutionStatus],
    resolvedAt: typeof resolution.resolvedAt === "string" ? resolution.resolvedAt : null,
    resolvedBy: typeof resolution.resolvedBy === "string" ? resolution.resolvedBy : null
  };
}

export function isProductRequirementResolvedWithoutProduct(requirement: unknown) {
  return productRequirementResolution(requirement) !== null;
}

export function withProductRequirementResolution(
  valueJson: unknown,
  status: ProductRequirementResolutionStatus | null,
  metadata: { resolvedAt: string; resolvedBy: string }
) {
  const next = { ...record(valueJson) };
  if (status === null) {
    delete next.productResolution;
    return next;
  }
  next.productResolution = {
    status,
    tag: PRODUCT_REQUIREMENT_RESOLUTIONS[status],
    ...metadata
  };
  return next;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
