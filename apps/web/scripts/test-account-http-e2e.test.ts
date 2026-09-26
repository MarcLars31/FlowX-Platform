import assert from "node:assert/strict";
import test from "node:test";
import {
  TEST_ACCOUNTS,
  TEST_ORGANIZATIONS,
  type TestAccountDefinition
} from "./test-account-fixtures";
import {
  E2E_READINESS_HEADER,
  hasBlockingProductionEnvironmentSignal,
  isStrongE2eReadinessToken,
  KNOWN_PRODUCTION_SUPABASE_HOSTS,
  normalizeBareHostname
} from "../src/lib/test-account-e2e-readiness";

type JsonRecord = Record<string, unknown>;

const configuration = e2eConfiguration(process.env);

test(
  "seeded administrative accounts enforce page, API and tenant boundaries over HTTP",
  { skip: configuration.skipReason },
  async (t) => {
    assert.equal(configuration.unsafeReason, null, configuration.unsafeReason ?? "");
    assert.ok(configuration.baseUrl);
    assert.ok(configuration.password);
    assert.ok(configuration.readinessToken);
    assert.ok(configuration.expectedSupabaseHost);

    await assertServerReadiness(
      new HttpSession(configuration.baseUrl),
      configuration.readinessToken,
      configuration.expectedSupabaseHost
    );

    const platformAccounts = TEST_ACCOUNTS.filter(
      (account) => account.role === "platform_admin"
    );
    for (const account of platformAccounts) {
      await t.test(`${account.key} can use central administration`, async () => {
        const session = new HttpSession(configuration.baseUrl!);
        const redirectTo = await login(session, account, configuration.password!);
        assert.equal(redirectTo, "/admin");

        for (const page of [
          "/admin",
          "/admin/review",
          "/admin/documents/failed",
          "/admin/sprsok",
          "/products"
        ]) {
          await assertStatus(session, page, 200);
        }

        await assertStatus(
          session,
          "/api/pkms/document-processing?limit=1",
          200
        );
        await assertStatus(session, "/api/pkms/review-queue", 200);

        await assertStatus(
          session,
          "/api/admin/sprsok/reconciliation?limit=1",
          200
        );

        if (account.key === "scipx_admin_2") {
          const workflowResponse = await session.request(
            "/api/admin/sprsok/actions",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "reindex", dryRun: true })
            }
          );
          assert.equal(workflowResponse.status, 200);
          const workflow = await workflowResponse.json() as JsonRecord;
          assert.equal(workflow.action, "reindex");
          assert.equal(workflow.dryRun, true);
          assert.ok("result" in workflow);
        }
      });
    }

    const customerAccounts = TEST_ACCOUNTS.filter(
      (account) => account.role === "customer_admin"
    );
    for (const account of customerAccounts) {
      await t.test(`${account.key} is isolated to its customer organization`, async (customerTest) => {
        const session = new HttpSession(configuration.baseUrl!);
        const redirectTo = await login(session, account, configuration.password!);
        assert.equal(redirectTo, "/dashboard");

        for (const page of ["/dashboard", "/organization", "/products"]) {
          await assertStatus(session, page, 200);
        }

        const ownOrganization = TEST_ORGANIZATIONS[account.organization];
        const foreignOrganization = account.organization === "ovasia"
          ? TEST_ORGANIZATIONS.undersia
          : TEST_ORGANIZATIONS.ovasia;

        const context = await jsonRequest(session, "/api/organizations/context");
        assert.equal(
          nestedString(context, "context", "organization", "id"),
          ownOrganization.id
        );

        const switchResponse = await session.request(
          "/api/organizations/context",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ organizationId: foreignOrganization.id })
          }
        );
        assert.equal(switchResponse.status, 403);

        const contextAfterTampering = await jsonRequest(
          session,
          "/api/organizations/context"
        );
        assert.equal(
          nestedString(contextAfterTampering, "context", "organization", "id"),
          ownOrganization.id
        );

        const projectPayload = await jsonRequest(
          session,
          `/api/projects?organizationId=${encodeURIComponent(foreignOrganization.id)}`
        );
        const projects = Array.isArray(projectPayload.projects)
          ? projectPayload.projects
          : [];
        for (const project of projects) {
          assert.equal(
            recordString(project, "organization_id"),
            ownOrganization.id,
            "A customer project response contained another tenant's data."
          );
        }

        await assertStatus(session, "/api/products/search?q=sprinkler&limit=1", 200);
        await assertStatus(session, "/api/pkms/document-processing?limit=1", 403);
        await assertStatus(session, "/api/pkms/review-queue", 403);
        await assertStatus(
          session,
          "/api/admin/sprsok/reconciliation?limit=1",
          403
        );
        const deniedAction = await session.request(
          "/api/admin/sprsok/actions",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "reindex", dryRun: true })
          }
        );
        assert.equal(deniedAction.status, 403);

        const adminPage = await session.request("/admin", {
          redirect: "manual"
        });
        assert.ok(
          [302, 303, 307, 308].includes(adminPage.status),
          `GET /admin returned ${adminPage.status}; expected a customer redirect.`
        );
        assert.equal(
          new URL(
            adminPage.headers.get("location") ?? "",
            configuration.baseUrl!
          )
            .pathname,
          "/dashboard"
        );

        await customerTest.test(
          "can open the configured published datasheet",
          {
            skip: configuration.productDocumentId
              ? false
              : "Set E2E_PRODUCT_DOCUMENT_ID to a published test document."
          },
          async () => {
            const response = await session.request(
              `/api/products/documents/${configuration.productDocumentId}/file`
            );
            assert.equal(response.status, 200);
            assert.match(
              response.headers.get("content-type") ?? "",
              /^application\/pdf(?:;|$)/i
            );
          }
        );
      });
    }
  }
);

class HttpSession {
  private readonly cookies = new Map<string, string>();

  constructor(private readonly baseUrl: URL) {}

  async request(relativePath: string, init: RequestInit = {}) {
    const url = new URL(relativePath, this.baseUrl);
    if (url.origin !== this.baseUrl.origin) {
      throw new Error("E2E requests may not leave the configured origin.");
    }

    const headers = new Headers(init.headers);
    if (this.cookies.size > 0) {
      headers.set(
        "Cookie",
        [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; ")
      );
    }

    const response = await fetch(url, {
      ...init,
      headers,
      cache: "no-store"
    });
    this.captureCookies(response.headers);
    return response;
  }

  private captureCookies(headers: Headers) {
    const extendedHeaders = headers as Headers & {
      getSetCookie?: () => string[];
    };
    const values = extendedHeaders.getSetCookie?.() ?? splitSetCookie(headers.get("set-cookie"));
    for (const value of values) {
      const pair = value.split(";", 1)[0];
      const separator = pair.indexOf("=");
      if (separator <= 0) continue;
      const name = pair.slice(0, separator).trim();
      const cookieValue = pair.slice(separator + 1).trim();
      if (cookieValue) this.cookies.set(name, cookieValue);
      else this.cookies.delete(name);
    }
  }
}

async function login(
  session: HttpSession,
  account: TestAccountDefinition,
  password: string
) {
  const response = await session.request("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: account.email, password })
  });
  assert.equal(
    response.status,
    200,
    `Login failed for fixture ${account.key} with status ${response.status}.`
  );
  const payload = await response.json() as JsonRecord;
  return typeof payload.redirectTo === "string" ? payload.redirectTo : null;
}

async function assertServerReadiness(
  session: HttpSession,
  readinessToken: string,
  expectedSupabaseHost: string
) {
  const response = await session.request("/api/test-support/readiness", {
    headers: { [E2E_READINESS_HEADER]: readinessToken },
    redirect: "manual"
  });
  assert.equal(
    response.status,
    200,
    `The server refused the test-environment readiness check with status ${response.status}; no login requests were sent.`
  );

  const payload = await response.json() as JsonRecord;
  assert.equal(payload.ready, true);
  assert.equal(
    recordString(payload, "supabaseHost"),
    expectedSupabaseHost,
    "The server's actual Supabase host did not match E2E_EXPECTED_SUPABASE_HOST; no login requests were sent."
  );
}

async function assertStatus(
  session: HttpSession,
  relativePath: string,
  expectedStatus: number
) {
  const response = await session.request(relativePath, { redirect: "manual" });
  assert.equal(
    response.status,
    expectedStatus,
    `GET ${relativePath} returned ${response.status}, expected ${expectedStatus}.`
  );
  return response;
}

async function jsonRequest(session: HttpSession, relativePath: string) {
  const response = await assertStatus(session, relativePath, 200);
  return await response.json() as JsonRecord;
}

function nestedString(value: unknown, ...keys: string[]) {
  let current: unknown = value;
  for (const key of keys) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return null;
    }
    current = (current as JsonRecord)[key];
  }
  return typeof current === "string" ? current : null;
}

function recordString(value: unknown, key: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = (value as JsonRecord)[key];
  return typeof candidate === "string" ? candidate : null;
}

function splitSetCookie(value: string | null) {
  return value?.split(/,(?=\s*[^;,=]+=[^;,]*)/) ?? [];
}

function e2eConfiguration(environment: NodeJS.ProcessEnv) {
  const enabled = environment.RUN_TEST_ACCOUNT_E2E === "true";
  const baseUrlValue = environment.E2E_BASE_URL?.trim();
  const password = environment.TEST_ACCOUNT_PASSWORD;
  const baseUrl = parseBaseUrl(baseUrlValue);
  const readinessToken = environment.TEST_ACCOUNT_E2E_READINESS_TOKEN;
  const expectedSupabaseHost = normalizeBareHostname(
    environment.E2E_EXPECTED_SUPABASE_HOST
  );
  let unsafeReason = enabled && baseUrl
    ? unsafeE2eReason(baseUrl, environment)
    : null;

  if (enabled && !unsafeReason && !isStrongE2eReadinessToken(readinessToken)) {
    unsafeReason =
      "TEST_ACCOUNT_E2E_READINESS_TOKEN must be a non-placeholder secret of at least 32 bytes.";
  }
  if (enabled && !unsafeReason && !environment.E2E_EXPECTED_SUPABASE_HOST?.trim()) {
    unsafeReason =
      "E2E_EXPECTED_SUPABASE_HOST must pin the Supabase host used by the web server.";
  }
  if (
    enabled &&
    !unsafeReason &&
    environment.E2E_EXPECTED_SUPABASE_HOST?.trim() &&
    !expectedSupabaseHost
  ) {
    unsafeReason = "E2E_EXPECTED_SUPABASE_HOST must be a bare hostname.";
  }
  if (
    enabled &&
    !unsafeReason &&
    expectedSupabaseHost &&
    KNOWN_PRODUCTION_SUPABASE_HOSTS.includes(
      expectedSupabaseHost as (typeof KNOWN_PRODUCTION_SUPABASE_HOSTS)[number]
    )
  ) {
    unsafeReason = "HTTP test-account E2E refuses the production Supabase host.";
  }

  let skipReason: string | false = false;
  if (!enabled) {
    skipReason = "Set RUN_TEST_ACCOUNT_E2E=true to run the opt-in HTTP suite.";
  } else if (!baseUrlValue) {
    skipReason = "E2E_BASE_URL is not configured.";
  } else if (!baseUrl) {
    // Invalid URLs fail inside the test instead of being silently skipped.
  } else if (!unsafeReason && !password) {
    skipReason = "TEST_ACCOUNT_PASSWORD is not configured in the test environment.";
  }

  return {
    baseUrl,
    password,
    readinessToken,
    expectedSupabaseHost,
    unsafeReason:
      enabled && baseUrlValue && !baseUrl
        ? "E2E_BASE_URL is not a valid HTTP(S) URL."
        : unsafeReason,
    skipReason,
    productDocumentId: uuid(environment.E2E_PRODUCT_DOCUMENT_ID)
  };
}

function parseBaseUrl(value: string | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function unsafeE2eReason(baseUrl: URL, environment: NodeJS.ProcessEnv) {
  const declaredEnvironment = environment.TEST_ACCOUNT_ENVIRONMENT
    ?.trim()
    .toLowerCase();
  if (!new Set(["local", "development", "test", "staging"]).has(declaredEnvironment ?? "")) {
    return "TEST_ACCOUNT_ENVIRONMENT must explicitly identify local, development, test or staging.";
  }

  if (
    hasBlockingProductionEnvironmentSignal(environment, declaredEnvironment)
  ) {
    return "HTTP test-account E2E is blocked because the runtime identifies production.";
  }

  const productionHosts = new Set([
    "scipx.ai",
    "www.scipx.ai",
    ...(environment.E2E_PRODUCTION_HOSTS ?? "")
      .split(",")
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean)
  ]);
  if (productionHosts.has(baseUrl.hostname.toLowerCase())) {
    return "HTTP test-account E2E refuses the configured production host.";
  }

  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  if (localHosts.has(baseUrl.hostname)) return null;

  if (
    declaredEnvironment !== "staging" ||
    environment.E2E_ALLOW_REMOTE_STAGING !== "true"
  ) {
    return "Remote HTTP E2E requires explicit staging environment and E2E_ALLOW_REMOTE_STAGING=true.";
  }
  if (baseUrl.protocol !== "https:") {
    return "Remote staging E2E requires HTTPS.";
  }
  const expectedHost = environment.E2E_EXPECTED_HOST?.trim().toLowerCase();
  if (!expectedHost || expectedHost !== baseUrl.hostname.toLowerCase()) {
    return "E2E_EXPECTED_HOST must exactly match the remote staging host.";
  }

  return null;
}

function uuid(value: string | undefined) {
  const candidate = value?.trim();
  return candidate && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate)
    ? candidate
    : null;
}
