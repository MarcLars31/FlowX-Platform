export type OffsetPageRequest = {
  limit: number;
  offset: number;
};

export type CollectAllRowsOptions = {
  pageSize?: number;
  maxRows?: number;
  resourceLabel?: string;
};

const DEFAULT_PAGE_SIZE = 1000;
const MAX_PAGE_SIZE = 1000;
const DEFAULT_MAX_ROWS = 50_000;

/**
 * Collects an offset-paginated result without ever returning a known partial set.
 * An empty-page probe avoids treating a server-side response cap as the end of
 * the result. At `maxRows`, a one-row probe distinguishes an exact result from
 * a truncated one.
 */
export async function collectAllRows<T>(
  loadPage: (request: OffsetPageRequest) => Promise<T[]>,
  options: CollectAllRowsOptions = {}
) {
  const pageSize = positiveInteger(
    options.pageSize ?? DEFAULT_PAGE_SIZE,
    "pageSize"
  );
  const maxRows = positiveInteger(
    options.maxRows ?? DEFAULT_MAX_ROWS,
    "maxRows"
  );

  if (pageSize > MAX_PAGE_SIZE) {
    throw new Error(`pageSize cannot exceed ${MAX_PAGE_SIZE}.`);
  }

  const resourceLabel = options.resourceLabel?.trim() || "Paginated query";
  const rows: T[] = [];

  while (true) {
    const remainingCapacity = maxRows - rows.length;
    const requestedLimit = Math.min(pageSize, remainingCapacity + 1);
    const page = await loadPage({
      limit: requestedLimit,
      offset: rows.length
    });

    if (page.length > requestedLimit) {
      throw new Error(
        `${resourceLabel} returned ${page.length} rows for a page limited to ${requestedLimit}.`
      );
    }

    if (page.length === 0) return rows;

    if (page.length > remainingCapacity) {
      throw new Error(
        `${resourceLabel} exceeds the safety limit of ${maxRows} rows. Narrow the query or raise maxRows explicitly.`
      );
    }

    rows.push(...page);
  }
}

function positiveInteger(value: number, optionName: string) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${optionName} must be a positive safe integer.`);
  }
  return value;
}

/** Continue after the last ID so the database need not re-scan and authorize
 * all earlier rows for every page. Empty probes still detect backend caps. */
export async function collectAllRowsById<T>(
  loadPage: (request: { limit: number; afterId: string | null }) => Promise<T[]>,
  options: CollectAllRowsOptions = {}
) {
  let afterId: string | null = null;
  return collectAllRows(async ({ limit }) => {
    const page = await loadPage({ limit, afterId });
    for (const row of page) {
      const id = row && typeof row === "object" && "id" in row ? row.id : null;
      if (typeof id !== "string" || !id || (afterId !== null && id <= afterId)) {
        throw new Error("ID pagination requires unique string IDs in ascending order.");
      }
      afterId = id;
    }
    return page;
  }, options);
}
