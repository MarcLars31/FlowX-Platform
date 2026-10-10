import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_TECHNICAL_DESCRIPTION_BYTES,
  technicalDescriptionUploadPath,
  validateTechnicalDescriptionFile
} from "./technical-description-file";
import { uploadTechnicalDescription } from "./technical-description-upload-flow";

const uploadId = "33333333-3333-4333-8333-333333333333";
const signedUrl = "https://storage.example/storage/v1/object/upload/sign/project-files/test.pdf?token=example";
const owner = {
  organizationId: "11111111-1111-4111-8111-111111111111",
  userId: "22222222-2222-4222-8222-222222222222"
};

function pdf(size = 7_693_820) {
  return new File([new Uint8Array(size)], "Bilag 9.pdf", { type: "application/pdf" });
}

test("7.7 MB and 30 MB PDFs bypass the app server; only storage receives file bytes", async () => {
  for (const size of [7_693_820, MAX_TECHNICAL_DESCRIPTION_BYTES]) {
    const file = pdf(size);
    const form = new FormData();
    form.set("file", file);
    form.set("createProject", "true");
    let calls = 0;
    const progress: number[] = [];
    const response = await uploadTechnicalDescription(form, file, {
      fetch: async (url, options) => {
        calls++;
        if (calls === 1) {
          assert.equal(url, "/api/technical-descriptions/upload");
          assert.ok(Buffer.byteLength(options?.body as string) < 4096);
          assert.equal(JSON.parse(options?.body as string).size, size);
          return Response.json({ uploadId, signedUrl });
        }
        if (calls === 2) {
          assert.equal(url, signedUrl);
          assert.equal(options?.method, "PUT");
          assert.equal(options?.credentials, "omit");
          assert.equal(options?.body, file);
          return Response.json({ Key: "test" });
        }
        assert.equal(url, "/api/technical-descriptions");
        const request = new Request("https://scipx.example/api/technical-descriptions", options);
        assert.ok((await request.clone().arrayBuffer()).byteLength < 4096);
        const payload = await request.formData();
        assert.equal(payload.get("file"), null);
        assert.equal(payload.get("uploadId"), uploadId);
        assert.equal(payload.get("fileName"), file.name);
        assert.equal(payload.get("createProject"), "true");
        return Response.json({ projectId: "result" }, { status: 201 });
      },
      extractOcr: async () => assert.fail("Unexpected OCR")
    }, value => progress.push(value.percent));
    assert.equal(response.status, 201);
    assert.equal(calls, 3);
    assert.deepEqual(progress, [0, 5, 30, 100]);
    assert.equal(form.get("file"), file);
  }
});

test("OCR retries reuse the stored PDF and preserve project context with monotonic progress", async () => {
  const file = pdf();
  const form = new FormData();
  form.set("file", file);
  form.set("projectId", owner.organizationId);
  const progress: number[] = [];
  let storageUploads = 0;
  let analysisCalls = 0;
  const response = await uploadTechnicalDescription(form, file, {
    fetch: async (url, options) => {
      if (url === signedUrl) {
        storageUploads++;
        return Response.json({});
      }
      if (url === "/api/technical-descriptions/upload") return Response.json({ uploadId, signedUrl });
      analysisCalls++;
      const request = new Request("https://scipx.example/analyze", options);
      assert.ok((await request.clone().arrayBuffer()).byteLength < 4096);
      const payload = await request.formData();
      assert.equal(payload.get("uploadId"), uploadId);
      assert.equal(payload.get("projectId"), owner.organizationId);
      assert.ok([...payload.values()].every(value => typeof value === "string"));
      if (analysisCalls === 1) return Response.json({ code: "OCR_REQUIRED", pageNumbers: [1] }, { status: 422 });
      assert.equal(payload.get("ocrRetry"), "true");
      assert.equal(JSON.parse(payload.get("ocrPages") as string)[0].text, "cover text");
      return Response.json({ projectId: "result" }, { status: 201 });
    },
    extractOcr: async (source, pages, report) => {
      assert.equal(source, file);
      assert.deepEqual(pages, [1]);
      for (const value of [0, 0.8, 0.1, Number.NaN, 1]) report({ progress: value });
      return [{ pageNumber: 1, text: "cover text", confidence: 0.9 }];
    }
  }, value => progress.push(value.percent));
  assert.equal(response.status, 201);
  assert.equal(storageUploads, 1);
  assert.equal(analysisCalls, 2);
  assert.equal(progress.at(-1), 100);
  assert.deepEqual(progress, [...progress].sort((a, b) => a - b));
});

test("failed OCR cleans up only its upload even when cleanup itself fails", async () => {
  let deleted = false;
  await assert.rejects(uploadTechnicalDescription(new FormData(), pdf(), {
    fetch: async (url, options) => {
      if (options?.method === "DELETE") {
        deleted = true;
        assert.deepEqual(JSON.parse(options.body as string), { uploadId });
        throw new Error("Cleanup network error");
      }
      if (url === signedUrl) return Response.json({});
      if (url === "/api/technical-descriptions/upload") return Response.json({ uploadId, signedUrl });
      return Response.json({ code: "OCR_REQUIRED", pageNumbers: [1] }, { status: 422 });
    },
    extractOcr: async () => { throw new Error("OCR worker failed"); }
  }), /OCR worker failed/);
  assert.equal(deleted, true);
});

test("a rejected storage upload never starts analysis", async () => {
  const calls: string[] = [];
  await assert.rejects(uploadTechnicalDescription(new FormData(), pdf(), {
    fetch: async (url, options) => {
      calls.push(`${options?.method} ${url}`);
      if (options?.method === "DELETE") return new Response(null, { status: 204 });
      if (url === signedUrl) return new Response("Too large", { status: 413 });
      return Response.json({ uploadId, signedUrl });
    },
    extractOcr: async () => assert.fail("Unexpected OCR")
  }), /størrelse/);
  assert.equal(calls.length, 3);
  assert.ok(calls.at(-1)?.startsWith("DELETE"));
});

test("authorization failures and infrastructure errors produce readable responses", async () => {
  for (const status of [401, 403, 413, 500]) {
    let calls = 0;
    const response = await uploadTechnicalDescription(new FormData(), pdf(10), {
      fetch: async () => {
        calls++;
        return new Response("Infrastructure error", { status });
      },
      extractOcr: async () => assert.fail("Unexpected OCR")
    });
    assert.equal(response.status, status);
    assert.equal(typeof (await response.json()).error, "string");
    assert.equal(calls, 1);
  }
});

test("validation rejects oversize and empty files before allocating an upload", async () => {
  assert.equal(validateTechnicalDescriptionFile({ name: "ok.pdf", size: MAX_TECHNICAL_DESCRIPTION_BYTES, type: "" }), null);
  for (const size of [0, MAX_TECHNICAL_DESCRIPTION_BYTES + 1]) {
    await assert.rejects(uploadTechnicalDescription(new FormData(), pdf(size), {
      fetch: async () => assert.fail("Invalid file must not reach server"),
      extractOcr: async () => assert.fail("Unexpected OCR")
    }));
  }
});

test("upload references cannot select other owners or escape the staging prefix", () => {
  const path = technicalDescriptionUploadPath(owner, uploadId);
  assert.equal(path, `${owner.organizationId}/technical-description-uploads/${owner.userId}/${uploadId}.pdf`);
  assert.notEqual(path, technicalDescriptionUploadPath({ ...owner, userId: uploadId }, uploadId));
  assert.notEqual(path, technicalDescriptionUploadPath({ ...owner, organizationId: uploadId }, uploadId));
  for (const value of [null, {}, "../project/file", "https://example/file.pdf", `${uploadId}/../`, `${uploadId}%2f`, ""]) {
    assert.throws(() => technicalDescriptionUploadPath(owner, value), /Ugyldig/);
  }
});
