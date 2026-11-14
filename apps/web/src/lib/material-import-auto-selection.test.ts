import { materialWorkbookFixture } from "./material-import-workbook.test-fixtures";
import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MaterialRowReview } from "../components/MaterialExcelImport";
import { highestScoredMaterialCandidate, initialMaterialReview, materialBatchRows, materialRowStatus, type MaterialCandidate, type MaterialReview, type MaterialRow } from "./material-import";
import { MaterialSearchRequestError, requestMaterialMatch, runMaterialSearchQueue } from "./material-import-client";
import { exportMaterialWorkbook } from "./material-import-workbook";
import { consumeRateLimit } from "./request-rate-limit";

const row: MaterialRow = { id: "row-0", sheet: "Material", sourceRow: 2, description: "Stålrør", dimension: "100", fittingDimension: "",
  category: "Rør", unit: "m", quantity: 2, quantityText: "2", issues: [] };
const candidate = (articleNumber: string, score?: number): MaterialCandidate => ({ articleNumber, score,
  productName: "Stålrør", subtitle: "DN100", productUrl: `https://www.ahlsell.no/products/test/${articleNumber}/`,
  specifications: [], warnings: [], conflict: false, identityVerified: true });
const high = candidate("1001126", 89), low = candidate("1001124", 24);
const result = { candidates: [low, high], warnings: [], partial: false, searchUrl: "https://www.ahlsell.no/search?q=ror" };
const noWait = async () => {};
function fixture(count: number) {
  const rows = Array.from({ length: count }, (_, index) => ({ ...row, id: `row-${index}`, sourceRow: index + 2 }));
  const reviews: Record<string, MaterialReview> = Object.fromEntries(rows.map(item => [item.id, initialMaterialReview(item)]));
  const state = { ...reviews };
  return { rows, reviews, state, ids: rows.map(item => item.id), onReview: (id: string, review: MaterialReview) => { state[id] = review; } };
}

test("automatic selection uses the maximum valid score, stable ties and no hidden minimum or conflict gate", () => {
  assert.equal(highestScoredMaterialCandidate([low, high]), high);
  assert.equal(highestScoredMaterialCandidate([high, candidate("1234567", 89)]), high);
  const mismatch = { ...low, conflict: true, identityVerified: false };
  assert.equal(highestScoredMaterialCandidate([mismatch, candidate("1234567", 0)]), mismatch);
  const zero = candidate("1234567", 0);
  assert.equal(highestScoredMaterialCandidate([zero]), zero);
  assert.equal(highestScoredMaterialCandidate([undefined, NaN, Infinity, -1, 101].map((score, index) => candidate(String(index), score))), undefined);
  assert.equal(highestScoredMaterialCandidate([]), undefined);
});

test("all rows includes previous reviews and choices but excludes zero quantities and invalid input", () => {
  const data = fixture(30);
  for (const [index, status] of ["selected", "review", "empty", "error"].entries()) data.reviews[`row-${index}`].status = status as MaterialReview["status"];
  data.rows[28].quantity = 0;
  data.rows[29].issues = ["Enhet saknas"];
  assert.equal(materialBatchRows(data.rows, data.reviews, true).length, 28);
  assert.equal(materialBatchRows(data.rows, data.reviews).length, 25);
  assert.equal(materialBatchRows(data.rows, data.reviews, true).at(-1)?.id, "row-27");
});

test("all 242 searchable rows automatically choose the highest score across pagination and the real rate limit", async () => {
  const data = fixture(247);
  for (const index of [242, 243, 244]) data.rows[index].quantity = 0;
  for (const index of [245, 246]) data.rows[index].issues = ["Enhet saknas"];
  data.reviews["row-0"] = { ...data.reviews["row-0"], status: "selected", selected: low, selectionMode: "manual" };
  data.reviews["row-1"].status = "review";
  let clock = 1000000, calls = 0, inFlight = 0, peak = 0;
  const key = crypto.randomUUID();
  const summary = await runMaterialSearchQueue({ ...data, ids: materialBatchRows(data.rows, data.reviews, true).map(item => item.id), autoSelect: true,
    signal: new AbortController().signal, onProgress: () => {}, now: () => clock, wait: async ms => { clock += ms; },
    match: async (input, signal, onWait) => {
      calls++; inFlight++; peak = Math.max(peak, inFlight);
      try { return await requestMaterialMatch(input, signal, onWait, async () => {
        assert.equal(consumeRateLimit(key, 20, 60000, clock).allowed, true);
        return Response.json(result);
      }); } finally { inFlight--; }
    }
  });
  assert.equal(calls, 242); assert.equal(peak, 1); assert.equal(summary.selectedCount, 242);
  assert.equal(summary.completed, 242); assert.equal(summary.failed, 0); assert.deepEqual(summary.remainingIds, []);
  for (let index = 0; index < 242; index++) {
    assert.equal(data.state[`row-${index}`].selected?.articleNumber, high.articleNumber);
    assert.equal(data.state[`row-${index}`].selectionMode, "automatic");
    assert.equal(data.state[`row-${index}`].status, "selected");
  }
  assert.equal(data.state["row-242"].status, "pending");
});

test("ordinary searches never opt in implicitly; empty and legacy unscored results do not create choices", async () => {
  for (const autoSelect of [false, true]) {
    const data = fixture(3);
    let calls = 0;
    const summary = await runMaterialSearchQueue({ ...data, autoSelect, signal: new AbortController().signal, onProgress: () => {}, wait: noWait,
      match: async () => ({ ...result, candidates: calls++ === 0 ? result.candidates : calls === 2 ? [] : [candidate("1234567")] }) });
    assert.equal(data.state["row-0"].status, autoSelect ? "selected" : "review");
    assert.equal(data.state["row-1"].status, "empty");
    assert.equal(data.state["row-2"].status, "review");
    assert.equal(data.state["row-2"].selected, undefined);
    assert.equal(summary.selectedCount, autoSelect ? 1 : 0);
    assert.equal(summary.unscored, autoSelect ? 1 : 0);
    if (autoSelect) assert.match(data.state["row-2"].result!.warnings.join(" "), /saknar giltiga poäng/);
  }
});

test("cancellation preserves completed automatic choices and resumes even previously selected unvisited rows", async () => {
  const data = fixture(3), controller = new AbortController();
  const old = { ...data.reviews["row-1"], status: "selected" as const, selected: low, selectionMode: "manual" as const };
  data.reviews["row-1"] = old; data.state["row-1"] = old;
  const summary = await runMaterialSearchQueue({ ...data, autoSelect: true, signal: controller.signal, onProgress: () => {}, match: async () => result,
    wait: async (_ms, signal) => { controller.abort(); signal.throwIfAborted(); } });
  assert.equal(summary.selectedCount, 1);
  assert.deepEqual(summary.remainingIds, ["row-1", "row-2"]);
  assert.equal(data.state["row-1"], old);
  const continued = await runMaterialSearchQueue({ ...data, reviews: data.state, ids: summary.remainingIds, autoSelect: true,
    signal: new AbortController().signal, onProgress: () => {}, wait: noWait, match: async () => result });
  assert.equal(continued.selectedCount, 2); assert.deepEqual(continued.remainingIds, []);
  assert.ok(Object.values(data.state).every(item => item.selected?.articleNumber === high.articleNumber));
});

test("failed rows and unvisited rows remain resumable while an earlier choice survives a failed repeat search", async () => {
  const data = fixture(4), controller = new AbortController();
  data.reviews["row-0"] = { ...data.reviews["row-0"], status: "selected", selected: low, selectionMode: "manual" };
  const summary = await runMaterialSearchQueue({ ...data, autoSelect: true, signal: controller.signal, onProgress: () => {},
    wait: async (ms, signal) => { if (ms >= 30000) { controller.abort(); signal.throwIfAborted(); } },
    match: async () => { throw new MaterialSearchRequestError("Unavailable", false); } });
  assert.equal(summary.failed, 3); assert.equal(summary.cancelled, true);
  assert.deepEqual(summary.remainingIds, data.ids);
  assert.equal(data.state["row-0"].selected, low);
  assert.equal(data.state["row-0"].status, "error");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await exportMaterialWorkbook(await materialWorkbookFixture(data.rows), data.rows, data.state) as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  assert.equal(workbook.worksheets[0].getCell("G2").value, low.articleNumber);
  assert.equal(workbook.worksheets[0].columnCount, 7);
});

test("automatic choice remains visibly distinct from approval and exports only its article number", async () => {
  const data = fixture(1);
  await runMaterialSearchQueue({ ...data, autoSelect: true, signal: new AbortController().signal, onProgress: () => {}, wait: noWait, match: async () => result });
  const review = data.state["row-0"];
  assert.equal(materialRowStatus(row, review), "Automatiskt vald produkt");
  const html = renderToStaticMarkup(createElement(MaterialRowReview, { row, review, busy: false, onInput: () => {}, onReview: () => {}, onSearch: () => {} }));
  assert.match(html, /Automatiskt vald efter högsta poäng/);
  assert.match(html, />Ta bort produktval<\/button>/);
  assert.match(html, />Välj produkt<\/button>/);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await exportMaterialWorkbook(await materialWorkbookFixture([row]), [row], data.state) as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  const sheet = workbook.worksheets[0];
  assert.equal(sheet.getCell("G2").value, high.articleNumber);
  assert.equal(sheet.columnCount, 7);
});

test("242 rows retain automatic highest-score selection through faults, long throttling and recovery", async () => {
  const data = fixture(242), visits = new Map<string, number>(), progress: import("./material-import-client").MaterialQueueProgress[] = [];
  let clock = 1000000, calls = 0, inFlight = 0, peak = 0, rejections = 0;
  const key = crypto.randomUUID();
  const wait = async (ms: number) => { clock += ms; };
  const summary = await runMaterialSearchQueue({ ...data, autoSelect: true, signal: new AbortController().signal,
    now: () => clock, wait, onProgress: value => progress.push(value),
    match: async (input, signal, notice) => {
      const id = progress.at(-1)!.id;
      const visit = (visits.get(id) ?? 0) + 1; visits.set(id, visit);
      if (["row-20", "row-21", "row-22", "row-241"].includes(id) && visit === 1) throw new MaterialSearchRequestError("Gateway unavailable", false);
      inFlight++; peak = Math.max(peak, inFlight);
      let throttled = false;
      try { return await requestMaterialMatch(input, signal, notice, async () => {
        calls++;
        if (!consumeRateLimit(key, 20, 60000, clock).allowed) {
          rejections++; return new Response(null, {status:429,headers:{"Retry-After":"5"}});
        }
        if (id === "row-100" && !throttled) { throttled = true; return new Response(null, {status:429,headers:{"Retry-After":"900"}}); }
        return Response.json(result);
      }, wait); } finally { inFlight--; }
    }
  });
  assert.equal(summary.completed, 242); assert.equal(summary.selectedCount, 242); assert.equal(summary.failed, 0);
  assert.deepEqual(summary.remainingIds, []); assert.equal(peak, 1); assert.equal(calls, 243); assert.equal(rejections, 0);
  assert.equal(visits.get("row-0"), 1); assert.equal(visits.get("row-241"), 2);
  assert.ok(progress.some(value => value.seconds === 900 && value.reason === "rate-limit"));
  assert.ok(progress.some(value => value.reason === "recovery"));
  assert.ok(Object.values(data.state).every(review => review.status === "selected" && review.selectionMode === "automatic" && review.selected?.articleNumber === high.articleNumber));
});
