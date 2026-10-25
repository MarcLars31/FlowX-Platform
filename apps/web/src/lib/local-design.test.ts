import assert from "node:assert/strict";
import test from "node:test";
import { localDesignEnabled, localDesignRequestAllowed } from "./local-design";

const development = { NODE_ENV: "development", SCIPX_LOCAL_DESIGN: "1" };
test("local design is unavailable in production and without explicit opt-in", () => {
  for (const NODE_ENV of ["production", "test", undefined]) {
    assert.equal(localDesignEnabled({ ...development, NODE_ENV }, "localhost:3100"), false);
  }
  assert.equal(localDesignEnabled({ NODE_ENV: "development" }, "localhost:3100"), false);
});
test("only loopback hostnames can open the design workspace", () => {
  for (const host of ["localhost:3100", "127.0.0.1:3100", "[::1]:3100"]) assert.equal(localDesignEnabled(development, host), true);
  for (const host of [null, "", "scipx.ai", "www.scipx.ai", "localhost.evil.example", "localhost@evil.example", "evil.example@localhost", "localhost/path"]) {
    assert.equal(localDesignEnabled(development, host), false);
  }
});
test("local PDF parsing rejects cross-origin requests and ordinary form posts", () => {
  const request = (extra: Record<string, string>) => new Request("http://localhost:3100/api/local/pdf", {
    method: "POST", headers: { host: "localhost:3100", ...extra }
  });
  assert.equal(localDesignRequestAllowed(request({}), development), false);
  assert.equal(localDesignRequestAllowed(request({ "x-scipx-local-design": "1", origin: "https://evil.example" }), development), false);
  assert.equal(localDesignRequestAllowed(request({ "x-scipx-local-design": "1", origin: "http://localhost:3100" }), development), true);
  assert.equal(localDesignRequestAllowed(request({ "x-scipx-local-design": "1" }), { ...development, NODE_ENV: "production" }), false);
});
