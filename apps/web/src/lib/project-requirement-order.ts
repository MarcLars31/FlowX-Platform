export function sortProjectRequirementsBySource<
  T extends Record<string, unknown>
>(requirements: readonly T[]): T[] {
  return requirements
    .map((requirement, extractionIndex) => ({ requirement, extractionIndex }))
    .sort((left, right) => {
      const pageDifference = sourcePage(left.requirement) - sourcePage(right.requirement);
      if (pageDifference !== 0) return pageDifference;

      const leftValue = record(left.requirement.value_json);
      const rightValue = record(right.requirement.value_json);
      const informationDifference = Number(rightValue.chapterInformation === true) - Number(leftValue.chapterInformation === true);
      if (informationDifference !== 0) return informationDifference;
      const leftOrder = Number(leftValue.sourceOrder);
      const rightOrder = Number(rightValue.sourceOrder);
      if (leftOrder > 0 && rightOrder > 0 && Number.isFinite(leftOrder) && Number.isFinite(rightOrder)
        && leftOrder !== rightOrder) return leftOrder - rightOrder;

      const postDifference = comparePostNumbers(
        projectRequirementOrderPostNumber(left.requirement),
        projectRequirementOrderPostNumber(right.requirement)
      );
      if (postDifference !== 0) return postDifference;
      return left.extractionIndex - right.extractionIndex;
    })
    .map(({ requirement }) => requirement);
}

export function comparePostNumbers(left: string | null, right: string | null) {
  if (left === right) return 0;
  if (!left) return 1;
  if (!right) return -1;

  const leftParts = numberParts(left);
  const rightParts = numberParts(right);
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const leftPart = leftParts[index];
    const rightPart = rightParts[index];
    if (leftPart === undefined) return -1;
    if (rightPart === undefined) return 1;
    if (leftPart !== rightPart) return leftPart - rightPart;
  }
  return left.localeCompare(right, "sv", { numeric: true });
}

function sourcePage(requirement: Record<string, unknown>) {
  const value = Number(requirement.source_page);
  return Number.isFinite(value) && value > 0 ? value : Number.MAX_SAFE_INTEGER;
}

export function projectRequirementOrderPostNumber(requirement: Record<string, unknown>) {
  const overview = record(requirement.overview);
  if ("sortPostNumber" in overview) return typeof overview.sortPostNumber === "string" ? overview.sortPostNumber : null;
  const value = record(requirement.value_json).postNumber;
  if (typeof value === "string" && value.trim()) return value.trim();
  if ("postNumber" in record(requirement.value_json)) return null;
  const source = typeof requirement.source_excerpt === "string"
    ? requirement.source_excerpt
    : "";
  return source.match(/\b(?:post(?:nr|nummer)?\.?\s*)?(\d+(?:\.\d+)+(?:\s+\d+(?:\.\d+)+)?)\b/i)?.[1] ?? null;
}

function numberParts(value: string) {
  return [...value.matchAll(/\d+/g)].map((match) => Number(match[0]));
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}
