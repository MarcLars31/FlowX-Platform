import assert from "node:assert/strict";
import test from "node:test";
import worker from "./worker.mjs";

test("Unicode and ASCII spellings of both old hosts redirect to the public catalog", () => {
  for (const host of ["sprsøk.no", "www.sprsøk.no", "xn--sprsk-yua.no", "www.xn--sprsk-yua.no"]) {
    for (const protocol of ["http", "https"]) {
      const result = worker.fetch(new Request(`${protocol}://${host}/old/path?q=TY123&leverandor=Tyco&token=secret&next=https://evil.example`));
      assert.equal(result.status, 301);
      assert.equal(result.headers.get("Location"), "https://www.scipx.ai/sprsok?q=TY123&leverandor=Tyco");
    }
  }
});
test("the redirect cannot loop on Scipx or forward form submissions", () => {
  assert.equal(worker.fetch(new Request("https://www.scipx.ai/sprsok")).status, 404);
  assert.equal(worker.fetch(new Request("https://sprsøk.no", { method: "POST", body: "private" })).status, 405);
  assert.equal(worker.fetch(new Request("https://sprsok.no")).status, 404);
});
