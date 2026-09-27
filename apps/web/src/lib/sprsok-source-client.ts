import {
  parseSprsokSourcePage,
  SprsokHttpError,
  type SprsokCheckpoint,
  type SprsokSource
} from "./sprsok-sync-core";

export type SprsokSourceConfig = {
  apiUrl: string;
  token: string | null;
  paginationMode: "cursor" | "offset";
  pageSize: number;
  timeoutMs: number;
  cursorParameter: string;
  offsetParameter: string;
  limitParameter: string;
  minimumIntervalMs: number;
  maxResponseBytes: number;
};

export function getSprsokSourceConfig(
  environment: NodeJS.ProcessEnv = process.env
): SprsokSourceConfig {
  const apiUrl = environment.SPRSOK_API_URL?.trim();
  if (!apiUrl) throw new Error("SPRSOK_API_URL is not configured.");
  const parsedUrl = new URL(apiUrl);
  const localDevelopment =
    environment.NODE_ENV !== "production" &&
    ["localhost", "127.0.0.1", "::1"].includes(parsedUrl.hostname);
  if (parsedUrl.protocol !== "https:" && !localDevelopment) {
    throw new Error("SPRSOK_API_URL must use HTTPS outside local development.");
  }
  const paginationMode = environment.SPRSOK_API_PAGINATION === "offset"
    ? "offset"
    : "cursor";
  return {
    apiUrl: parsedUrl.toString(),
    token: environment.SPRSOK_API_TOKEN?.trim() || null,
    paginationMode,
    pageSize: integer(environment.SPRSOK_API_PAGE_SIZE, 100, 1, 1000),
    timeoutMs: integer(environment.SPRSOK_API_TIMEOUT_MS, 30_000, 1_000, 120_000),
    cursorParameter: safeParameter(environment.SPRSOK_API_CURSOR_PARAM, "cursor"),
    offsetParameter: safeParameter(environment.SPRSOK_API_OFFSET_PARAM, "offset"),
    limitParameter: safeParameter(environment.SPRSOK_API_LIMIT_PARAM, "limit"),
    minimumIntervalMs: integer(environment.SPRSOK_API_RATE_LIMIT_MS, 250, 0, 60_000),
    maxResponseBytes: integer(
      environment.SPRSOK_API_MAX_RESPONSE_BYTES,
      10_000_000,
      10_000,
      50_000_000
    )
  };
}

export function createSprsokSource(
  config: SprsokSourceConfig,
  dependencies: {
    fetch?: typeof fetch;
    now?: () => number;
    sleep?: (milliseconds: number) => Promise<void>;
  } = {}
): SprsokSource {
  const fetcher = dependencies.fetch ?? fetch;
  const now = dependencies.now ?? Date.now;
  const sleep = dependencies.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  let lastRequestAt = 0;

  return {
    async fetchPage(checkpoint: SprsokCheckpoint) {
      const wait = config.minimumIntervalMs - (now() - lastRequestAt);
      if (wait > 0) await sleep(wait);

      const url = new URL(config.apiUrl);
      url.searchParams.set(config.limitParameter, String(config.pageSize));
      if (config.paginationMode === "cursor") {
        if (checkpoint.cursor) {
          url.searchParams.set(config.cursorParameter, checkpoint.cursor);
        }
      } else {
        url.searchParams.set(config.offsetParameter, String(checkpoint.offset));
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
      try {
        lastRequestAt = now();
        const response = await fetcher(url, {
          method: "GET",
          headers: {
            Accept: "application/json",
            "User-Agent": "Scipx-Sprsok-Sync/1.0",
            ...(config.token ? { Authorization: `Bearer ${config.token}` } : {})
          },
          cache: "no-store",
          // Never forward the bearer token to an unverified redirect target.
          redirect: "error",
          signal: controller.signal
        });
        if (!response.ok) {
          throw new SprsokHttpError(
            response.status,
            `Sprsok page ${checkpoint.pageNumber} returned HTTP ${response.status}.`
          );
        }
        const payload = await readJsonResponse(response, config.maxResponseBytes);
        return parseSprsokSourcePage(
          payload,
          checkpoint,
          config.pageSize,
          config.paginationMode
        );
      } finally {
        clearTimeout(timeout);
      }
    }
  };
}

async function readJsonResponse(response: Response, maxBytes: number) {
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new SprsokHttpError(413, "Sprsok response exceeds the configured size limit.");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new SprsokHttpError(502, "Sprsok returned an empty response.");
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new SprsokHttpError(413, "Sprsok response exceeds the configured size limit.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    throw new SprsokHttpError(502, "Sprsok returned invalid JSON.");
  }
}

function integer(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? Math.min(Math.max(parsed, min), max) : fallback;
}

function safeParameter(value: string | undefined, fallback: string) {
  return value && /^[A-Za-z][A-Za-z0-9_]*$/.test(value) ? value : fallback;
}
