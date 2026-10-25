import { spawn, execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";

const directory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") {
  throw new Error("Designläget får inte startas i produktion.");
}
process.env.NODE_ENV = "development";
nextEnv.loadEnvConfig(directory, true);
const branch = execFileSync("git", ["branch", "--show-current"], { cwd: directory, encoding: "utf8" }).trim();
if (branch !== "codex/scipx-upgrades") {
  throw new Error("Starta designläget i arbetskopian för codex/scipx-upgrades.");
}
const forbidden = Object.keys(process.env).filter(name =>
  /SUPABASE|DOCLING_OCR|SPRSOK_API|PRODUCT_PDF_EXTRACTOR|CRAWLER_INGEST_TOKEN/.test(name) && process.env[name]?.trim()
);
if (forbidden.length) {
  throw new Error("Designläget kräver en miljö utan databas- eller tjänstekopplingar. Ta bort dessa inställningar från denna arbetskopias miljö: " + forbidden.join(", "));
}
const environment = {
  ...process.env,
  SCIPX_LOCAL_DESIGN: "1",
  PRODUCT_SYNC_WRITES_ENABLED: "false",
  NEXT_TELEMETRY_DISABLED: "1"
};
console.log("ScipX lokalt designläge: http://127.0.0.1:3100");
console.log("PDF och ändringar finns bara i flikens minne. Ingen databas används.");
if (!process.argv.includes("--check")) {
  const child = spawn(process.execPath, [resolve(directory, "node_modules/next/dist/bin/next"), "dev", "--hostname", "127.0.0.1", "--port", "3100"], {
    cwd: directory, env: environment, stdio: "inherit"
  });
  child.on("error", error => { console.error(error.message); process.exitCode = 1; });
  child.on("exit", code => { process.exitCode = code ?? 1; });
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
}
