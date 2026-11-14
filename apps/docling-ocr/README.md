# Scipx Docling OCR reserve

Private Python service for **one failed OCR page per request**. Normal digital
reading and successful browser OCR never call this service. It uses Docling
2.141.0 with RapidOCR (Latin recognizer), forced OCR and positioned text cells.
TableFormer is disabled. The TypeScript application reconstructs rows using its
existing OCR layout reader; Markdown tables are not used as quantity data.

## Run locally

Use Python 3.12 in an isolated environment, install `requirements.txt`, and set
`DOCLING_OCR_TOKEN` to a random secret of at least 32 characters. Run
`python service.py`. Models initialize before the HTTP listener starts. The
first start downloads model weights; PDF bytes are never sent to model hosts.

Configure the **web server**, never browser/public environment variables:

```dotenv
DOCLING_OCR_URL=http://127.0.0.1:8090/v1/ocr/page
DOCLING_OCR_TOKEN=<same random secret>
DOCLING_OCR_TIMEOUT_MS=90000
```

Leave URL/token empty to disable. Non-loopback URLs require HTTPS. Redirects
are rejected. The original PDF stays in existing private storage; only a copy
of the failed page is sent to the configured service.

## Deployment

Build from this directory with `docker build -t scipx-docling-ocr .`. Run behind
an HTTPS reverse proxy with `DOCLING_OCR_TOKEN` supplied as a secret, port 8090
on a private network, a writable temporary directory and a memory limit suited
to the workload (see the measured Vercel evaluation below). Model weights
are fetched at image build time. The process runs as a non-root user and does
not save source PDFs. Do not expose an unauthenticated proxy in front of it.

This container can run on Vercel or another container host. Configure its reachable
HTTPS URL and the shared secret in the web server environment. The web integration
remains disabled until those values are present. No database migration or UI change
is required.

## Vercel evaluation

`vercel.json` uses Vercel Services with `Dockerfile.vercel` as an explicit container
entrypoint. The configuration is for this directory as an independent test project;
it does not change the web application's root directory, routes or production domain.
Use the default Hobby capacity (2 GB RAM) when evaluating that plan. Enable large
functions with `VERCEL_SUPPORT_LARGE_FUNCTIONS=1` at build and runtime. Set `PORT=8090`,
`DOCLING_OCR_TOKEN` (a fresh private secret), and `DOCLING_NUM_THREADS=2` at runtime.

An isolated project may assign its first deployment to its own production environment;
this does not publish anything to scipx.ai. Use `--environment preview` for subsequent
tests. Keep deployment protection enabled. `vercel curl --deployment <url>` can test
the protected deployment using the signed-in CLI; the OCR Bearer token is still required.

Set `DOCLING_OCR_METRICS=1` only for evaluation to include model initialization time,
conversion time and Linux memory measurements in authenticated OCR responses. Normal
responses contain no metrics. The platform's request-body limit also applies; the
current test pages are about 200 KB each. Never upload real PDFs as deployment files.

The models are included in the image at build time; runtime uses `HF_HUB_OFFLINE=1`.
Test an initial request and consecutive requests through the existing web reader.
Record whether the primary OCR failure was simulated, and verify post IDs, units and
quantities against the original pages before enabling the reserve in production.

### Verified on Vercel, 2026-10-21

Preview `dpl_JCttYhJWCuSnturEXbQZ5tb6AXky` in project `scipx-docling-test`
(existing `vvs-search` Hobby account), runtime region `lhr1`, successfully ran the
container. Image digest:
`sha256:21788a57c626291326c63546b84bf8583ccbf6a5bb1a478ecc268e98c0deb58c`.
The reported function image was 900.83 MB and the build took 3m39s.

Two previously rasterized source pages (20 and 249) were sent over HTTPS, followed
by a repeat of page 20. Empty primary OCR was simulated; this is not evidence that
Tesseract naturally fails on those pages. The existing Scipx fallback and extraction
code ran locally against the real Vercel responses, including source-hash validation,
acceptance checks and checkpoints. All 10 distinct post/unit/quantity cases passed;
all three OCR calls returned HTTP 200 and an accepted fallback.

| Measure | First page 20 | Next page 249 | Repeat page 20 |
| --- | ---: | ---: | ---: |
| OCR conversion | 8.731 s | 7.309 s | 7.819 s |
| Client elapsed (includes CLI/auth/network) | 28.313 s | 11.524 s | 12.049 s |
| Container peak memory | 1774.9 MiB | 1836.2 MiB | 1849.3 MiB |

Model initialization took 8.386 seconds. The highest measured memory usage fits
the 2048 MiB Hobby limit, with limited headroom; larger/denser pages remain untested.
An unauthenticated request returned 401 and an invalid content type returned 415.
Six local service tests passed. No web UI files were changed for this evaluation.

The test project remains protected and is not used by scipx.ai. Production uses the
separate Vercel project below, with its own application secret. Do not disable preview
protection to make test URLs callable.

## Scipx production configuration

Vercel project `vvs-search/scipx-docling` runs the reserve in region `lhr1` on the
existing Hobby account; no separately managed server is required. Its canonical
production endpoint is `https://scipx-docling.vercel.app/v1/ocr/page`. It requires
the private `DOCLING_OCR_TOKEN` on every request, including `/healthz`. The deployment
URLs and team alias remain protected by Vercel and are not suitable as the app endpoint.

The `scripx` project's Production environment has `DOCLING_OCR_URL` set to this endpoint,
the matching `DOCLING_OCR_TOKEN` stored as a secret, and `DOCLING_OCR_TIMEOUT_MS=90000`.
The reserve project stores its own token, `PORT=8090`, `DOCLING_NUM_THREADS=2`,
`DOCLING_OCR_METRICS=0`, and `VERCEL_SUPPORT_LARGE_FUNCTIONS=1`. None is public browser
configuration. The web code is released through the existing `Frontend-` branch.

Deploy reserve changes separately, from `apps/docling-ocr`, using
`vercel deploy --project scipx-docling --scope vvs-search --prod --yes`.
The reserve project currently uses CLI deployments, not automatic Git deployments.
Keep application secrets in Vercel; never include them in deployment files or commits.
To disable the reserve, remove `DOCLING_OCR_URL` from the web Production environment
and redeploy the web app. Previous source readings and saved user work remain intact.

Production service deployment `dpl_EwFyiS6tcNAeDN9hLeQfRLQoxWKa` was verified directly
over HTTPS using only the application Bearer token. Both sample pages were accepted,
all 10 quantities/units matched, and successful pages made no additional reserve
request. The measured requests took 10.48 and 8.49 seconds with warm models. Requests
without the token returned 401; production responses omitted evaluation metrics.
This verifies the reserve endpoint and local integration, not a production user upload.

## Failure behavior

* One warm model process; concurrent conversion requests receive HTTP 503 with
  a busy marker. The import queues a retry after 15 seconds, without caching a
  failed page or consuming the job's failure retry allowance.
* Conversion timeout kills the worker process; a subsequent request restarts it.
* Requests are authenticated before reading at most 30 MB. Conversion rejects
  PDFs containing more than one page. Responses are bounded to 2 MB.
* The client verifies the source SHA-256, response version, coordinates and OCR
  confidence. Only sufficiently readable results that preserve known post IDs
  and NS codes can replace failed OCR. OCR confidence is not proof of correctness;
  existing OCR/source review flags continue to apply.
* Rejected and unavailable results leave the previous reading intact. An outage
  stops further remote calls during that job attempt; import can finish with the
  existing incomplete-page warnings. A new import can try again.
* Separate, job-scoped and source-hash-bound checkpoints save each attempted
  fallback page. Time-budget continuation resumes at the next page without
  consuming the job's failure retry allowance. Existing cache cleanup applies.
* Source readings retain digital text, primary OCR and the candidate Docling
  text, plus acceptance/rejection metadata. Credentials and extracted text are
  not written to request logs.

Run service contract tests with `python -m unittest discover -s tests -v`.
Web tests live in `apps/web/src/lib/docling-ocr*.test.ts` and
`ocr-failure-pages.test.ts`. Test actual difficult scanned documents before
enabling broadly; the earlier digital-PDF benchmark did not validate OCR quality.
