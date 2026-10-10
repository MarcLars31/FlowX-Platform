import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import {
  reconcileSprsok,
  reconciliationCsv
} from "../lib/sprsok-reconcile";
import { getSprsokSourceConfig, createSprsokSource } from "../lib/sprsok-source-client";
import { runSprsokSynchronization } from "../lib/sprsok-sync-core";
import { createSprsokSyncStore, SprsokSupabaseClient } from "../lib/sprsok-supabase";

if (existsSync(".env.local")) loadEnvFile(".env.local");

const [command, ...arguments_] = process.argv.slice(2);
const sourceName = option(arguments_, "--source") ?? "sprsok";
if (sourceName !== "sprsok") fail("Only --source sprsok is supported.");

const client = new SprsokSupabaseClient();
const store = createSprsokSyncStore(client);

if (command === "sync") {
  const apply = arguments_.includes("--apply");
  requireWriteOptIn(apply);
  const source = createSprsokSource(getSprsokSourceConfig());
  const result = await runSprsokSynchronization(source, store, {
    resume: arguments_.includes("--resume"),
    dryRun: !apply,
    maxPages: numberOption(arguments_, "--max-pages")
  });
  console.log(JSON.stringify(result, null, 2));
} else if (command === "reconcile") {
  const source = createSprsokSource(getSprsokSourceConfig());
  const repair = arguments_.includes("--repair");
  requireWriteOptIn(repair);
  if (!repair && !arguments_.includes("--dry-run")) {
    fail("Reconciliation requires --dry-run or --repair.");
  }
  const report = await reconcileSprsok({ source, client, store, repair });
  console.log(JSON.stringify({ ...report, issues: undefined }, null, 2));
  const output = option(arguments_, "--output");
  if (output) {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(output, reconciliationCsv(report), "utf8");
    console.log(`Wrote ${report.issues.length} discrepancies to ${output}.`);
  }
} else if (command === "reindex") {
  const apply = arguments_.includes("--apply");
  requireWriteOptIn(apply);
  const dryRun = !apply;
  const result = await client.rpc<{ indexed: number; candidates: number }>(
    "reindex_sprsok_products",
    { p_source_record_keys: null, p_dry_run: dryRun }
  );
  console.log(JSON.stringify({ dryRun, ...result }, null, 2));
} else {
  fail(
    "Usage: product-sync sync|reconcile|reindex --source sprsok [--dry-run|--apply|--repair|--resume]"
  );
}

function option(arguments_: string[], name: string) {
  const index = arguments_.indexOf(name);
  return index >= 0 ? arguments_[index + 1] : undefined;
}

function numberOption(arguments_: string[], name: string) {
  const value = option(arguments_, name);
  if (!value) return undefined;
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number) || number < 1) fail(`${name} must be a positive integer.`);
  return number;
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function requireWriteOptIn(willWrite: boolean) {
  if (willWrite && process.env.PRODUCT_SYNC_WRITES_ENABLED !== "true") {
    fail(
      "Product writes are disabled. Set PRODUCT_SYNC_WRITES_ENABLED=true in the explicit execution environment."
    );
  }
}
