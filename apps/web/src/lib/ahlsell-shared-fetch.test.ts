import test from "node:test";
import assert from "node:assert/strict";
import { gunzipSync } from "node:zlib";
import { sharedAhlsellFetch, ahlsellRequestContext } from "./ahlsell-shared-fetch.server";

test("shared supplier transport fails closed, caches only public content, and preserves supplier backoff",async(t)=>{
  const oldUrl=process.env.SUPABASE_URL,oldKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL="https://database.example.test"; process.env.SUPABASE_SERVICE_ROLE_KEY="local-test-only";
  t.after(()=>{if(oldUrl===undefined) delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=oldUrl;if(oldKey===undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=oldKey;});
  let mode="acquired", supplierCalls=0; const finished:Record<string,unknown>[]=[];
  const warnings=t.mock.method(console,"warn",()=>undefined);
  t.mock.method(globalThis,"fetch",async(input:RequestInfo|URL,init?:RequestInit)=>{
    const url=String(input);
    if (url.includes("/rpc/claim_ahlsell_request")) {
      if(mode==="offline") throw new TypeError("database offline");
      return Response.json({state:mode==="cached"?"cached":mode==="limited"?"limited":"acquired",retryAfter:17,
        ...(mode==="cached"?{response:{status:200,body:"cached article",headers:{"content-type":"text/plain"}}}:{})});
    }
    if(url.includes("/rpc/finish_ahlsell_request")){finished.push(JSON.parse(String(init?.body)));return new Response(null,{status:204});}
    assert.equal(new URL(url).hostname,"www.ahlsell.no");supplierCalls++;
    return mode==="backoff"?new Response("try later",{status:429,headers:{"retry-after":"30"}}):new Response("public article");
  });
  for(const [input,init] of [["https://internal.test",{}],["https://www.ahlsell.no/",{headers:{authorization:"private"}}],[new Request("https://www.ahlsell.no/",{method:"POST"}),{}]] as const) await assert.rejects(sharedAhlsellFetch(input,init));
  const url="https://www.ahlsell.no/products/example";
  assert.equal(await (await sharedAhlsellFetch(url)).text(),"public article");
  assert.equal(supplierCalls,1);assert.equal(gunzipSync(Buffer.from((finished[0].requested_response as {body:string}).body,"base64")).toString(),"public article");
  mode="cached";assert.equal(await (await sharedAhlsellFetch(url)).text(),"cached article");assert.equal(supplierCalls,1);
  mode="limited";const context=ahlsellRequestContext();assert.equal((await context.fetch(url)).status,429);assert.equal(context.retryAfter,17);assert.equal(supplierCalls,1);
  mode="backoff";assert.equal((await sharedAhlsellFetch(url)).status,429);assert.equal(finished.at(-1)?.requested_response,null);assert.equal(finished.at(-1)?.requested_backoff,30);
  mode="offline";await assert.rejects(sharedAhlsellFetch(url),/offline/);assert.equal(supplierCalls,2);
  assert.equal(warnings.mock.callCount(),0,"successful empty RPC responses must not be reported as lease failures");
});

test("shared article redirects complete instead of waiting for an unread cloned response", async (t) => {
  const oldUrl = process.env.SUPABASE_URL, oldKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = "https://database.example.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "local-test-only";
  t.after(() => {
    if (oldUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = oldKey;
  });
  const requested: string[] = [];
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/claim_ahlsell_request")) return Response.json({ state: "acquired" });
    if (url.pathname.endsWith("/finish_ahlsell_request")) return new Response(null, { status: 204 });
    assert.equal(url.hostname, "www.ahlsell.no");
    requested.push(url.pathname);
    if (url.pathname === "/productVariantProxy/1429835") return new Response("Product moved", {
      status: 302, headers: { location: "/33/ventiler/1429835---kuleventil/" }
    });
    assert.equal(url.pathname, "/products/ventiler/1429835---kuleventil/");
    return new Response('<h1 data-test="product-name">Kuleventil</h1><div>DN15 PN25</div><span class="text-card-item-number">1429835</span>', {
      headers: { "content-type": "text/html" }
    });
  });
  const { lookupAhlsellProduct } = await import("./ahlsell-product-lookup");
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      lookupAhlsellProduct({ query: "1429835", market: "no", fetchImpl: sharedAhlsellFetch }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Article lookup stalled on its redirect")), 1000); })
    ]);
    assert.deepEqual(result.products.map(product => product.articleNumber), ["1429835"]);
    assert.equal(result.products[0].subtitle, "DN15 PN25");
    assert.equal(requested.length, 2);
  } finally { clearTimeout(timer); }
});

test("concurrent shared callers can independently cancel or consume their response bodies", async (t) => {
  const oldUrl = process.env.SUPABASE_URL, oldKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = "https://database.example.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "local-test-only";
  t.after(() => {
    if (oldUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = oldKey;
  });
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/claim_ahlsell_request")) return Response.json({ state: "acquired" });
    if (url.pathname.endsWith("/finish_ahlsell_request")) return new Response(null, { status: 204 });
    calls++;
    return new Response("independent body", { headers: { "content-type": "text/plain" } });
  });
  const url = "https://www.ahlsell.no/products/shared-body";
  const [first, second] = await Promise.all([sharedAhlsellFetch(url), sharedAhlsellFetch(url)]);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const [, body] = await Promise.race([
      Promise.all([first.body!.cancel(), second.text()]),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Cancelling a shared response stalled")), 1000); })
    ]);
    assert.equal(body, "independent body");
    assert.equal(calls, 1);
  } finally { clearTimeout(timer); }
});
