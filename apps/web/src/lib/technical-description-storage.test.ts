import assert from "node:assert/strict";
import test, { beforeEach, afterEach } from "node:test";
import {
  createAdminStorageUploadUrl,
  downloadAdminStorageObject,
  StorageObjectTooLargeError
} from "./supabase-admin-storage";
import { readTechnicalDescriptionUpload } from "./technical-description-storage";

const originalUrl = process.env.SUPABASE_URL;
const originalKey = process.env.SUPABASE_SECRET_KEY;
beforeEach(() => {
  process.env.SUPABASE_URL = "https://storage.example";
  process.env.SUPABASE_SECRET_KEY = "sb_secret_test";
});
afterEach(() => {
  if (originalUrl === undefined) delete process.env.SUPABASE_URL;
  else process.env.SUPABASE_URL = originalUrl;
  if (originalKey === undefined) delete process.env.SUPABASE_SECRET_KEY;
  else process.env.SUPABASE_SECRET_KEY = originalKey;
});

test("storage signing limits the URL to one non-overwritable object and never returns the admin key", async context => {
  context.mock.method(globalThis, "fetch", async (url: string, options: RequestInit) => {
    assert.equal(url, "https://storage.example/storage/v1/object/upload/sign/project-files/owned/test.pdf");
    assert.equal(options.method, "POST");
    assert.equal((options.headers as Record<string, string>)["x-upsert"], undefined);
    assert.equal((options.headers as Record<string, string>).apikey, "sb_secret_test");
    return Response.json({ url: "/object/upload/sign/project-files/owned/test.pdf?token=limited-token" });
  });
  const url = await createAdminStorageUploadUrl("project-files", "owned/test.pdf");
  assert.equal(url, "https://storage.example/storage/v1/object/upload/sign/project-files/owned/test.pdf?token=limited-token");
  assert.ok(!url.includes("sb_secret"));
});

test("unexpected signed storage paths are rejected", async context => {
  context.mock.method(globalThis, "fetch", async () => Response.json({ url: "/object/upload/sign/project-files/other.pdf?token=test" }));
  await assert.rejects(createAdminStorageUploadUrl("project-files", "owned.pdf"), /invalid upload URL/);
});

test("storage enforces the actual byte limit even with missing or false content-length", async context => {
  for (const length of [undefined, "2", "30"]) {
    const headers = length ? { "content-length": length } : undefined;
    context.mock.method(globalThis, "fetch", async () => new Response(new Uint8Array(20), { headers }));
    await assert.rejects(downloadAdminStorageObject("project-files", "owned.pdf", { maxBytes: 10 }), StorageObjectTooLargeError);
    context.mock.restoreAll();
  }
});

test("bounded storage reads preserve every byte and the original PDF filename", async context => {
  const bytes = new TextEncoder().encode("%PDF-1.4\nexample\n%%EOF");
  context.mock.method(globalThis, "fetch", async () => new Response(bytes));
  const file = await readTechnicalDescriptionUpload("owned.pdf", "Beskrivelse K2.pdf");
  assert.equal(file.name, "Beskrivelse K2.pdf");
  assert.equal(file.type, "application/pdf");
  assert.deepEqual(new Uint8Array(await file.arrayBuffer()), bytes);
});
