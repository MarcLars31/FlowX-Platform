import assert from "node:assert/strict";
import test from "node:test";
import {
  fetchAhlsellProductSubtitles,
  parseAhlsellProductSubtitle,
  validateAhlsellProductSubtitleItems
} from "./ahlsell-product-subtitle";

test("extracts Ahlsells technical subtitle directly below the product heading", () => {
  const html = productPage(
    "Sprinklerhoder Modell V2762 QR Victaulic® FireLock™ - Ned",
    "1/2&quot; V2762 Sprinklerhode K80 SSP 68C QR. hvit"
  );

  assert.equal(
    parseAhlsellProductSubtitle(html),
    "1/2\" V2762 Sprinklerhode K80 SSP 68C QR. hvit"
  );
});

test("does not mistake a later product description for the subtitle", () => {
  const html = `
    <h1 data-test="product-name">Sprinklerhode</h1>
    <section><p>Lang produktbeskrivelse som ikke er underraden.</p></section>
  `;

  assert.equal(parseAhlsellProductSubtitle(html), null);
});

test("accepts only a small batch of public Ahlsell product pages", () => {
  const valid = validateAhlsellProductSubtitleItems({ items: [
    { articleNumber: "9257423", productUrl: "https://www.ahlsell.no/products/sprinkler/9257423---sprinklerhode/" },
    { articleNumber: "9257423", productUrl: "https://www.ahlsell.no/products/sprinkler/9257423---duplicate/" }
  ] });
  assert.ok("data" in valid);
  if ("data" in valid) assert.equal(valid.data.length, 1);

  const external = validateAhlsellProductSubtitleItems({ items: [
    { articleNumber: "9257423", productUrl: "https://example.com/products/9257423" }
  ] });
  assert.deepEqual(external, { error: "En produktlänk går inte till Ahlsell." });

  const tooMany = validateAhlsellProductSubtitleItems({
    items: Array.from({ length: 7 }, (_, index) => ({
      articleNumber: `92574${index}`,
      productUrl: `https://www.ahlsell.no/products/sprinkler/92574${index}/`
    }))
  });
  assert.ok("error" in tooMany);
});

test("rejects nonstandard ports and product URLs that do not contain the NRF number", () => {
  const nonstandardPort = validateAhlsellProductSubtitleItems({ items: [
    { articleNumber: "9257423", productUrl: "https://www.ahlsell.no:8443/products/sprinkler/9257423" }
  ] });
  assert.deepEqual(nonstandardPort, { error: "En produktlänk går inte till Ahlsell." });

  const mismatchedArticle = validateAhlsellProductSubtitleItems({ items: [
    { articleNumber: "9257423", productUrl: "https://www.ahlsell.no/products/sprinkler/9257999---sprinklerhode/" }
  ] });
  assert.deepEqual(mismatchedArticle, { error: "En produktlänk går inte till Ahlsell." });
});

test("does not follow Ahlsell redirects to external or internal hosts", async () => {
  for (const location of [
    "https://example.com/products/sprinkler/9257423",
    "https://127.0.0.1/products/sprinkler/9257423"
  ]) {
    let calls = 0;
    const subtitles = await fetchAhlsellProductSubtitles({
      items: [{
        articleNumber: "9257423",
        productUrl: "https://www.ahlsell.no/products/sprinkler/9257423"
      }],
      fetchImpl: async () => {
        calls += 1;
        return new Response(null, { status: 302, headers: { Location: location } });
      }
    });

    assert.equal(subtitles["9257423"], null);
    assert.equal(calls, 1);
  }
});

test("follows two validated Ahlsell redirects and rejects a third", async () => {
  const requestedUrls: string[] = [];
  const subtitles = await fetchAhlsellProductSubtitles({
    items: [{
      articleNumber: "9257423",
      productUrl: "https://www.ahlsell.no/products/sprinkler/9257423"
    }],
    fetchImpl: async (input, init) => {
      requestedUrls.push(String(input));
      assert.equal(init?.redirect, "manual");
      if (requestedUrls.length <= 2) {
        return new Response(null, {
          status: 302,
          headers: {
            Location: requestedUrls.length === 1
              ? "/products/sprinkler/9257423---sprinklerhode/"
              : "https://ahlsell.no/products/sprinkler/9257423---sprinklerhode-final/"
          }
        });
      }
      return new Response(productPage("Sprinklerhode", "Teknisk underrad 9257423"), {
        headers: { "Content-Type": "text/html" }
      });
    }
  });

  assert.equal(subtitles["9257423"], "Teknisk underrad 9257423");
  assert.equal(requestedUrls.length, 3);

  let redirectCalls = 0;
  const rejected = await fetchAhlsellProductSubtitles({
    items: [{
      articleNumber: "9257424",
      productUrl: "https://www.ahlsell.no/products/sprinkler/9257424"
    }],
    fetchImpl: async () => {
      redirectCalls += 1;
      return new Response(null, {
        status: 302,
        headers: { Location: `/products/sprinkler/9257424---redirect-${redirectCalls}/` }
      });
    }
  });

  assert.equal(rejected["9257424"], null);
  assert.equal(redirectCalls, 3);
});

test("rejects oversized Ahlsell pages by Content-Length and streamed bytes", async () => {
  let streamedBodyCancelled = false;
  const oversizedStream = new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.enqueue(new Uint8Array(1024 * 1024));
    },
    cancel() {
      streamedBodyCancelled = true;
    }
  });
  let request = 0;
  const subtitles = await fetchAhlsellProductSubtitles({
    items: [
      {
        articleNumber: "9257423",
        productUrl: "https://www.ahlsell.no/products/sprinkler/9257423"
      },
      {
        articleNumber: "9257424",
        productUrl: "https://www.ahlsell.no/products/sprinkler/9257424"
      }
    ],
    fetchImpl: async () => {
      request += 1;
      if (request === 1) {
        return new Response("small", {
          headers: {
            "Content-Type": "text/html",
            "Content-Length": String(4 * 1024 * 1024)
          }
        });
      }
      return new Response(oversizedStream, { headers: { "Content-Type": "text/html" } });
    }
  });

  assert.equal(subtitles["9257423"], null);
  assert.equal(subtitles["9257424"], null);
  assert.equal(streamedBodyCancelled, true);
});

test("propagates an external abort signal to the Ahlsell request", async () => {
  const controller = new AbortController();
  let publishReceivedSignal: ((signal: AbortSignal) => void) | undefined;
  const receivedSignalPromise = new Promise<AbortSignal>((resolve) => {
    publishReceivedSignal = resolve;
  });
  const resultPromise = fetchAhlsellProductSubtitles({
    items: [{
      articleNumber: "9257423",
      productUrl: "https://www.ahlsell.no/products/sprinkler/9257423"
    }],
    signal: controller.signal,
    fetchImpl: async (_input, init) => {
      if (!init?.signal) throw new Error("Fetch request did not receive an abort signal.");
      publishReceivedSignal?.(init.signal);
      return await new Promise<Response>((_resolve, reject) => {
        if (init.signal?.aborted) {
          reject(createAbortError());
          return;
        }
        init.signal?.addEventListener("abort", () => reject(createAbortError()), { once: true });
      });
    }
  });
  const receivedSignal = await receivedSignalPromise;
  controller.abort();

  const subtitles = await resultPromise;
  assert.equal(receivedSignal?.aborted, true);
  assert.equal(subtitles["9257423"], null);
});

test("fetches six visible subtitles with bounded concurrency and partial fallback", async () => {
  let activeRequests = 0;
  let peakRequests = 0;
  const fetchImpl: typeof fetch = async (input) => {
    activeRequests += 1;
    peakRequests = Math.max(peakRequests, activeRequests);
    await new Promise((resolve) => setTimeout(resolve, 5));
    const articleNumber = new URL(String(input)).pathname.match(/\/(\d+)\/?$/)?.[1] ?? "";
    activeRequests -= 1;
    if (articleNumber === "9257403") {
      return new Response("Unavailable", { status: 503, headers: { "Content-Type": "text/html" } });
    }
    return new Response(productPage(`Produkt ${articleNumber}`, `Teknisk underrad ${articleNumber}`), {
      headers: { "Content-Type": "text/html; charset=utf-8" }
    });
  };
  const items = Array.from({ length: 6 }, (_, index) => ({
    articleNumber: `925740${index}`,
    productUrl: `https://www.ahlsell.no/products/sprinkler/925740${index}`
  }));

  const subtitles = await fetchAhlsellProductSubtitles({ items, fetchImpl });

  assert.equal(peakRequests, 3);
  assert.equal(subtitles["9257400"], "Teknisk underrad 9257400");
  assert.equal(subtitles["9257403"], null);
  assert.equal(Object.keys(subtitles).length, 6);
});

test("limits outbound Ahlsell requests to six across simultaneous batches", async () => {
  let activeRequests = 0;
  let peakRequests = 0;
  const fetchImpl: typeof fetch = async (input) => {
    activeRequests += 1;
    peakRequests = Math.max(peakRequests, activeRequests);
    await new Promise((resolve) => setTimeout(resolve, 5));
    activeRequests -= 1;
    const articleNumber = new URL(String(input)).pathname.match(/\/(\d+)\/?$/)?.[1] ?? "";
    return new Response(productPage(`Produkt ${articleNumber}`, `Teknisk underrad ${articleNumber}`), {
      headers: { "Content-Type": "text/html" }
    });
  };

  await Promise.all(Array.from({ length: 3 }, (_, batch) => {
    const items = Array.from({ length: 6 }, (__, index) => {
      const articleNumber = `925${batch}${index}00`;
      return {
        articleNumber,
        productUrl: `https://www.ahlsell.no/products/sprinkler/${articleNumber}`
      };
    });
    return fetchAhlsellProductSubtitles({ items, fetchImpl });
  }));

  assert.equal(peakRequests, 6);
});

function productPage(productName: string, subtitle: string) {
  return `
    <html><body>
      <div class="flex flex-col gap-1">
        <h1 class="heading" data-test="product-name">${productName}</h1>
        <div class="text-body text-gray">${subtitle}</div>
      </div>
      <p>En längre produktbeskrivning.</p>
    </body></html>
  `;
}

function createAbortError() {
  const error = new Error("aborted");
  error.name = "AbortError";
  return error;
}
