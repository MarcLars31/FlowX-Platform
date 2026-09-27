import {
  type NormalizedSprsokRecord,
  type SprsokCheckpoint,
  type SprsokSyncCounts,
  type SprsokSyncStore,
  type SprsokUpsertOutcome
} from "./sprsok-sync-core";

type SupabaseRuntimeConfig = { url: string; key: string };

export type SprsokDatabaseProduct = {
  id: number;
  source_record_key: string;
  external_product_id: string | null;
  sin: string | null;
  leverandor: string | null;
  utforelse: string | null;
};

export class SprsokSupabaseClient {
  private readonly config: SupabaseRuntimeConfig;

  constructor(
    environment: NodeJS.ProcessEnv = process.env,
    private readonly fetcher: typeof fetch = fetch
  ) {
    const url =
      environment.SUPABASE_URL?.trim() ||
      environment.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const key =
      environment.SUPABASE_SECRET_KEY?.trim() ||
      environment.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (!url || !key) throw new Error("Supabase backend configuration is missing.");
    this.config = { url, key };
  }

  async rpc<T>(name: string, payload: Record<string, unknown> = {}) {
    const base = this.config.url.endsWith("/") ? this.config.url : `${this.config.url}/`;
    const response = await this.fetcher(new URL(`rest/v1/rpc/${name}`, base), {
      method: "POST",
      headers: this.headers("return=representation"),
      body: JSON.stringify(payload),
      cache: "no-store"
    });
    if (!response.ok) throw new Error(await safeError(response));
    return (await response.json()) as T;
  }

  async select<T>(table: string, parameters: Record<string, string> = {}) {
    const base = this.config.url.endsWith("/") ? this.config.url : `${this.config.url}/`;
    const url = new URL(`rest/v1/${table}`, base);
    url.searchParams.set("select", "*");
    for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, value);
    const response = await this.fetcher(url, {
      headers: this.headers("count=exact"),
      cache: "no-store"
    });
    if (!response.ok) throw new Error(await safeError(response));
    const contentRange = response.headers.get("content-range")?.split("/").at(-1);
    return {
      rows: (await response.json()) as T[],
      total: contentRange && contentRange !== "*" ? Number(contentRange) : 0
    };
  }

  async selectAll<T>(table: string, select: string, additional: Record<string, string> = {}) {
    const rows: T[] = [];
    const pageSize = 1000;
    for (let offset = 0; ; offset += pageSize) {
      const page = await this.select<T>(table, {
        select,
        ...additional,
        limit: String(pageSize),
        offset: String(offset)
      });
      rows.push(...page.rows);
      if (page.rows.length < pageSize) return rows;
    }
  }

  private headers(prefer: string) {
    return {
      apikey: this.config.key,
      Authorization: `Bearer ${this.config.key}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      Prefer: prefer
    };
  }
}

export function createSprsokSyncStore(client: SprsokSupabaseClient): SprsokSyncStore {
  return {
    async beginRun(options) {
      return client.rpc<{
        runId: string;
        checkpoint: SprsokCheckpoint;
        counts?: SprsokSyncCounts;
      }>(
        "begin_sprsok_sync",
        { p_resume: options.resume, p_dry_run: options.dryRun }
      );
    },

    async saveSourceRecord(runId, record, dryRun) {
      const result = await client.rpc<{ outcome: SprsokUpsertOutcome }>(
        "upsert_sprsok_product",
        { p_run_id: runId, p_record: toDatabaseRecord(record), p_dry_run: dryRun }
      );
      return result.outcome;
    },

    async enqueueDatasheet(runId, record) {
      await client.rpc("queue_sprsok_datasheet", {
        p_run_id: runId,
        p_source_record_key: record.sourceRecordKey
      });
    },

    async recordPage(input) {
      await client.rpc("record_sprsok_sync_page", {
        p_run_id: input.runId,
        p_checkpoint: input.checkpoint,
        p_received: input.received,
        p_next_checkpoint: input.next,
        p_source_total: input.sourceTotal
      });
    },

    async recordError(input) {
      await client.rpc("record_sprsok_sync_error", {
        p_run_id: input.runId,
        p_scope: input.scope,
        p_source_record_key: input.recordKey ?? null,
        p_checkpoint: input.checkpoint,
        p_error_message: errorMessage(input.error)
      });
    },

    async finishRun(input) {
      await client.rpc("finish_sprsok_sync", {
        p_run_id: input.runId,
        p_status: input.status,
        p_checkpoint: input.checkpoint,
        p_counts: input.counts satisfies SprsokSyncCounts
      });
    }
  };
}

function toDatabaseRecord(record: NormalizedSprsokRecord) {
  return {
    source: record.source,
    source_record_key: record.sourceRecordKey,
    external_product_id: record.externalProductId,
    supplier: record.supplier,
    manufacturer_article_number: record.manufacturerArticleNumber,
    product_name: record.productName,
    variant: record.variant,
    category: record.category,
    source_status: record.sourceStatus,
    sin: record.sin,
    leverandor: record.leverandor,
    type: record.type,
    utforelse: record.utforelse,
    k_verdi: record.kVerdi,
    rti: record.rti,
    datablad: record.datablad,
    validation_errors: record.validationErrors,
    source_data: record.sourceData
  };
}

function errorMessage(error: unknown) {
  return (error instanceof Error ? `${error.name}: ${error.message}` : "Unknown error").slice(
    0,
    2000
  );
}

async function safeError(response: Response) {
  const payload = await response.text();
  return `Supabase ${response.status}: ${payload.slice(0, 1000)}`;
}
