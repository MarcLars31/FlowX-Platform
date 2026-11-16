// Read-only supplier regression runner. Inputs and cached responses stay outside the repository.
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { initialMaterialReview, highestScoredMaterialCandidate, type MaterialRow } from "../src/lib/material-import";
import { matchMaterialRow } from "../src/lib/material-import-matching";

async function main() {
const [inputRoot, outputRoot, mode = "all"] = process.argv.slice(2);
if (!inputRoot || !outputRoot) throw new Error("Usage: rfq-corpus-check.ts inputRoot outputRoot [pilot|all|replay]");
await fs.mkdir(path.join(outputRoot, "http-cache"), { recursive: true });
const baseFetch = fetch;
let outbound = 0;
let lastNetworkRow = 0;
let rowNetworkGate: Promise<void> | undefined;
const pending = new Map<string, Promise<{ status: number; type: string; body: string }>>();
const cachedFetch: typeof fetch = async (url, init) => {
  const address = String(url);
  if (!/^https:\/\/(?:www\.)?ahlsell\.no\//.test(address)) throw new Error("Unexpected supplier destination");
  if (init?.method && init.method !== "GET") throw new Error("Read-only regression runner");
  const key = createHash("sha256").update(address).digest("hex");
  const filename = path.join(outputRoot, "http-cache", key + ".json");
  if (!pending.has(key)) pending.set(key, (async () => {
    try { return JSON.parse(await fs.readFile(filename, "utf8")); } catch { /* Fetch uncached public data. */ }
    if (mode === "replay") throw new Error("Missing recorded response: " + address);
    if (mode === "refresh") {
      rowNetworkGate ??= new Promise<void>(resolve => setTimeout(resolve, Math.max(0, 3100 - (Date.now() - lastNetworkRow)))).then(() => { lastNetworkRow = Date.now(); });
      await rowNetworkGate;
    }
    outbound++;
    const response = await baseFetch(url, init);
    const value = { status: response.status, type: response.headers.get("content-type") || "text/plain", body: await response.text() };
    if (response.ok) await fs.writeFile(filename, JSON.stringify({ ...value, url:address, capturedAt:new Date().toISOString() }));
    return value;
  })());
  const value = await pending.get(key)!;
  return new Response(value.body, { status:value.status, headers:{"content-type":value.type} });
};
const results: unknown[] = [];
const dedup = new Map<string, Awaited<ReturnType<typeof matchMaterialRow>>>();
let lastStart = 0;
for (const id of ["1075", "1083"]) {
  const source = JSON.parse(await fs.readFile(path.join(inputRoot, id + "-rows.json"), "utf8")) as { rows: MaterialRow[] };
  const pilotRows = id === "1075" ? [1,11,25,283,367,407] : [13,35,149,202,203,204,205,206,209,212,217];
  for (const row of source.rows.filter(r => mode !== "pilot" || pilotRows.includes(Number(r.rfqSource?.lineNumber)))) {
    rowNetworkGate = undefined;
    const input = initialMaterialReview(row).input;
    const key = JSON.stringify(input);
    let result = dedup.get(key);
    let error: string | undefined;
    if (!result) {
      if (mode !== "replay" && mode !== "refresh") await new Promise(resolve => setTimeout(resolve, Math.max(0, 3100 - (Date.now() - lastStart))));
      lastStart = Date.now();
      try { result = await matchMaterialRow(input, { fetchImpl:cachedFetch, signal:AbortSignal.timeout(65000) }); dedup.set(key,result); }
      catch (cause) { error = String(cause); }
    }
    const selected = result && highestScoredMaterialCandidate(result.candidates, true);
    const record = { file:id, row:Number(row.rfqSource?.lineNumber), description:row.description, input, result, selected:selected?.articleNumber, error };
    results.push(record);
    await fs.writeFile(path.join(outputRoot, mode + "-results.json"), JSON.stringify({ at:new Date().toISOString(), rows:results, outbound, unique:dedup.size }, null, 2));
    console.log(JSON.stringify({ done:results.length, file:id,row:record.row,queries:result?.queries, candidates:result?.candidates.length,top:result?.candidates[0]?.productName,score:result?.candidates[0]?.score,selected:record.selected,error }));
  }
}
console.log(JSON.stringify({ complete:true, rows:results.length, outbound, unique:dedup.size }));
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
