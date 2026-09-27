import test from "node:test";
import assert from "node:assert/strict";
import { gunzipSync } from "node:zlib";
import { sharedAhlsellFetch, ahlsellRequestContext } from "./ahlsell-shared-fetch.server";

test("shared supplier transport fails closed, caches only public content, and preserves supplier backoff",async(t)=>{
  const oldUrl=process.env.SUPABASE_URL,oldKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL="https://database.example.test"; process.env.SUPABASE_SERVICE_ROLE_KEY="local-test-only";
  t.after(()=>{if(oldUrl===undefined) delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=oldUrl;if(oldKey===undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=oldKey;});
  let mode="acquired", supplierCalls=0; const finished:Record<string,unknown>[]=[];
  t.mock.method(globalThis,"fetch",async(input:RequestInfo|URL,init?:RequestInit)=>{
    const url=String(input);
    if (url.includes("/rpc/claim_ahlsell_request")) {
      if(mode==="offline") throw new TypeError("database offline");
      return Response.json({state:mode==="cached"?"cached":mode==="limited"?"limited":"acquired",retryAfter:17,
        ...(mode==="cached"?{response:{status:200,body:"cached article",headers:{"content-type":"text/plain"}}}:{})});
    }
    if(url.includes("/rpc/finish_ahlsell_request")){finished.push(JSON.parse(String(init?.body)));return Response.json(null);}
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
});
