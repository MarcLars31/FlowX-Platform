import { timingSafeEqual } from "node:crypto";

export const E2E_READINESS_HEADER = "x-scipx-e2e-readiness-token";

export const KNOWN_PRODUCTION_SUPABASE_HOSTS = [
  "myzegtifgbvjhdlcpebi.supabase.co"
] as const;

const ALLOWED_TEST_ENVIRONMENTS = new Set([
  "local",
  "development",
  "test",
  "staging"
]);

const PRODUCTION_ENVIRONMENT_SIGNALS = [
  "NODE_ENV",
  "VERCEL_ENV",
  "APP_ENV",
  "ENVIRONMENT",
  "DEPLOYMENT_ENV",
  "SUPABASE_ENVIRONMENT"
] as const;

type ReadinessFailureCode =
  | "disabled"
  | "unauthorized"
  | "invalid_readiness_token"
  | "invalid_environment"
  | "production_environment"
  | "missing_supabase_url"
  | "invalid_supabase_url"
  | "unsafe_supabase_transport"
  | "production_supabase"
  | "missing_supabase_pin"
  | "invalid_supabase_pin"
  | "supabase_pin_mismatch";

export type TestAccountE2eReadiness =
  | {
      ready: true;
      environment: string;
      supabaseHost: string;
    }
  | {
      ready: false;
      status: 404 | 503;
      code: ReadinessFailureCode;
    };

/**
 * Verifies the web server's own runtime configuration before HTTP tests are
 * allowed to submit any test-account credentials. This deliberately checks
 * the Supabase URL loaded by the server, not an assertion made by the caller.
 */
export function evaluateTestAccountE2eReadiness(
  environment: NodeJS.ProcessEnv,
  suppliedToken: string | null | undefined
): TestAccountE2eReadiness {
  if (environment.TEST_ACCOUNT_E2E_SUPPORT_ENABLED !== "true") {
    return failure(404, "disabled");
  }

  const configuredToken = environment.TEST_ACCOUNT_E2E_READINESS_TOKEN;
  if (!isStrongE2eReadinessToken(configuredToken)) {
    return failure(503, "invalid_readiness_token");
  }
  if (!suppliedToken || !tokensMatch(configuredToken, suppliedToken)) {
    // Hide the existence of the test-only endpoint from unauthenticated callers.
    return failure(404, "unauthorized");
  }

  const declaredEnvironment = environment.TEST_ACCOUNT_ENVIRONMENT
    ?.trim()
    .toLowerCase();
  if (
    !declaredEnvironment ||
    !ALLOWED_TEST_ENVIRONMENTS.has(declaredEnvironment)
  ) {
    return failure(503, "invalid_environment");
  }

  if (hasBlockingProductionEnvironmentSignal(environment, declaredEnvironment)) {
    return failure(503, "production_environment");
  }

  const supabaseUrlValue = firstConfiguredValue(environment, [
    "SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_URL",
    "VITE_SUPABASE_URL"
  ]);
  if (!supabaseUrlValue) return failure(503, "missing_supabase_url");

  let supabaseUrl: URL;
  try {
    supabaseUrl = new URL(supabaseUrlValue);
  } catch {
    return failure(503, "invalid_supabase_url");
  }
  if (supabaseUrl.username || supabaseUrl.password) {
    return failure(503, "invalid_supabase_url");
  }

  const supabaseHost = normalizeHostname(supabaseUrl.hostname);
  const isLocal = isLocalHostname(supabaseHost);
  if (
    supabaseUrl.protocol !== "https:" &&
    !(supabaseUrl.protocol === "http:" && isLocal)
  ) {
    return failure(503, "unsafe_supabase_transport");
  }

  const productionHosts = configuredProductionHosts(environment);
  if (!productionHosts || productionHosts.has(supabaseHost)) {
    return failure(503, "production_supabase");
  }

  const rawExpectedHost = environment.TEST_ACCOUNT_EXPECTED_SUPABASE_HOST;
  if (!rawExpectedHost?.trim()) {
    return failure(503, "missing_supabase_pin");
  }
  const expectedHost = normalizeBareHostname(rawExpectedHost);
  if (!expectedHost) return failure(503, "invalid_supabase_pin");
  if (supabaseHost !== expectedHost) {
    return failure(503, "supabase_pin_mismatch");
  }

  return {
    ready: true,
    environment: declaredEnvironment,
    supabaseHost
  };
}

export function isStrongE2eReadinessToken(
  value: string | undefined
): value is string {
  if (!value || Buffer.byteLength(value, "utf8") < 32) return false;
  if (/\s/.test(value)) return false;
  return !/(?:replace|changeme|password|readiness-token)/i.test(value);
}

export function normalizeBareHostname(value: string | undefined) {
  const candidate = value?.trim();
  if (
    !candidate ||
    candidate.includes("://") ||
    /[/?#@]/.test(candidate) ||
    candidate.includes(":")
  ) {
    return null;
  }
  return normalizeHostname(candidate);
}

export function hasBlockingProductionEnvironmentSignal(
  environment: NodeJS.ProcessEnv,
  declaredEnvironment: string | undefined
) {
  const isVerifiedVercelPreview =
    environment.VERCEL_ENV?.trim().toLowerCase() === "preview" &&
    declaredEnvironment?.trim().toLowerCase() === "staging";

  for (const name of PRODUCTION_ENVIRONMENT_SIGNALS) {
    const value = environment[name]?.trim().toLowerCase();
    if (value !== "production" && value !== "prod") continue;

    // Next.js uses NODE_ENV=production for optimized Vercel Preview builds.
    // That build-mode signal is safe to ignore only when Vercel itself says
    // preview and the dedicated test environment is explicitly staging.
    if (name === "NODE_ENV" && isVerifiedVercelPreview) continue;
    return true;
  }

  return false;
}

function configuredProductionHosts(environment: NodeJS.ProcessEnv) {
  const hosts = new Set<string>(KNOWN_PRODUCTION_SUPABASE_HOSTS);
  for (const value of environment.TEST_ACCOUNT_PRODUCTION_HOSTS?.split(",") ?? []) {
    if (!value.trim()) continue;
    const host = normalizeBareHostname(value);
    if (!host) return null;
    hosts.add(host);
  }
  return hosts;
}

function firstConfiguredValue(
  environment: NodeJS.ProcessEnv,
  names: readonly string[]
) {
  for (const name of names) {
    const value = environment[name]?.trim();
    if (value) return value;
  }
  return null;
}

function tokensMatch(expected: string, supplied: string) {
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  return (
    expectedBytes.length === suppliedBytes.length &&
    timingSafeEqual(expectedBytes, suppliedBytes)
  );
}

function normalizeHostname(value: string) {
  return value.trim().toLowerCase().replace(/\.$/, "");
}

function isLocalHostname(value: string) {
  return new Set(["localhost", "127.0.0.1", "[::1]", "::1"]).has(value);
}

function failure(status: 404 | 503, code: ReadinessFailureCode) {
  return { ready: false, status, code } as const;
}
