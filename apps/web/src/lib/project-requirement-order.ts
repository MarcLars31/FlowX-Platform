export function sortProjectRequirementsBySource<
  T extends Record<string, unknown>
>(requirements: readonly T[]): T[] {
  return requirements
    .map((requirement, extractionIndex) => ({ requirement, extractionIndex }))
    .sort((left, right) => {
      const pageDifference = sourcePage(left.requirement) - sourcePage(right.requirement);
      if (pageDifference !== 0) return pageDifference;

      const postDifference = comparePostNumbers(
        postNumber(left.requirement),
        postNumber(right.requirement)
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

function postNumber(requirement: Record<string, unknown>) {
  const value = record(requirement.value_json).postNumber;
  if (typeof value === "string" && value.trim()) return value.trim();
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
