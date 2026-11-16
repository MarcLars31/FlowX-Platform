import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateTestAccountE2eReadiness,
  KNOWN_PRODUCTION_SUPABASE_HOSTS
} from "./test-account-e2e-readiness";

const TOKEN = "local-e2e-gate-7M2xQ9vR4kP8nT6cW3zB";
const SAFE_LOCAL_ENVIRONMENT: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  TEST_ACCOUNT_E2E_SUPPORT_ENABLED: "true",
  TEST_ACCOUNT_ENVIRONMENT: "test",
  TEST_ACCOUNT_E2E_READINESS_TOKEN: TOKEN,
  TEST_ACCOUNT_EXPECTED_SUPABASE_HOST: "127.0.0.1",
  SUPABASE_URL: "http://127.0.0.1:54321"
};

test("a localhost web app cannot approve the production Supabase database", () => {
  const productionHost = KNOWN_PRODUCTION_SUPABASE_HOSTS[0];
  assert.deepEqual(
    evaluateTestAccountE2eReadiness(
      {
        ...SAFE_LOCAL_ENVIRONMENT,
        SUPABASE_URL: `https://${productionHost}`,
        TEST_ACCOUNT_EXPECTED_SUPABASE_HOST: productionHost
      },
      TOKEN
    ),
    { ready: false, status: 503, code: "production_supabase" }
  );
});

test("the server rejects a Supabase host that does not match its exact pin", () => {
  assert.deepEqual(
    evaluateTestAccountE2eReadiness(
      {
        ...SAFE_LOCAL_ENVIRONMENT,
        TEST_ACCOUNT_EXPECTED_SUPABASE_HOST: "localhost"
      },
      TOKEN
    ),
    { ready: false, status: 503, code: "supabase_pin_mismatch" }
  );
});

test("the endpoint remains hidden without the readiness token", () => {
  assert.deepEqual(
    evaluateTestAccountE2eReadiness(SAFE_LOCAL_ENVIRONMENT, undefined),
    { ready: false, status: 404, code: "unauthorized" }
  );
  assert.deepEqual(
    evaluateTestAccountE2eReadiness(SAFE_LOCAL_ENVIRONMENT, "wrong-token"),
    { ready: false, status: 404, code: "unauthorized" }
  );
});

test("readiness fails closed when the Supabase pin is missing", () => {
  assert.deepEqual(
    evaluateTestAccountE2eReadiness(
      {
        ...SAFE_LOCAL_ENVIRONMENT,
        TEST_ACCOUNT_EXPECTED_SUPABASE_HOST: undefined
      },
      TOKEN
    ),
    { ready: false, status: 503, code: "missing_supabase_pin" }
  );
});

test("readiness rejects production environment signals", () => {
  assert.deepEqual(
    evaluateTestAccountE2eReadiness(
      { ...SAFE_LOCAL_ENVIRONMENT, VERCEL_ENV: "production" },
      TOKEN
    ),
    { ready: false, status: 503, code: "production_environment" }
  );

  assert.deepEqual(
    evaluateTestAccountE2eReadiness(
      { ...SAFE_LOCAL_ENVIRONMENT, NODE_ENV: "production" },
      TOKEN
    ),
    { ready: false, status: 503, code: "production_environment" }
  );
});

test("an explicit Vercel Preview staging runtime may use an optimized production build", () => {
  assert.deepEqual(
    evaluateTestAccountE2eReadiness(
      {
        ...SAFE_LOCAL_ENVIRONMENT,
        NODE_ENV: "production",
        VERCEL_ENV: "preview",
        TEST_ACCOUNT_ENVIRONMENT: "staging",
        SUPABASE_URL: "https://isolated-staging.supabase.co",
        TEST_ACCOUNT_EXPECTED_SUPABASE_HOST:
          "isolated-staging.supabase.co"
      },
      TOKEN
    ),
    {
      ready: true,
      environment: "staging",
      supabaseHost: "isolated-staging.supabase.co"
    }
  );
});

test("readiness accepts an exactly pinned local Supabase runtime", () => {
  assert.deepEqual(
    evaluateTestAccountE2eReadiness(SAFE_LOCAL_ENVIRONMENT, TOKEN),
    {
      ready: true,
      environment: "test",
      supabaseHost: "127.0.0.1"
    }
  );
});

test("readiness accepts an exactly pinned HTTPS staging Supabase runtime", () => {
  assert.deepEqual(
    evaluateTestAccountE2eReadiness(
      {
        ...SAFE_LOCAL_ENVIRONMENT,
        NODE_ENV: "test",
        TEST_ACCOUNT_ENVIRONMENT: "staging",
        SUPABASE_URL: "https://isolated-staging.supabase.co",
        TEST_ACCOUNT_EXPECTED_SUPABASE_HOST:
          "ISOLATED-STAGING.SUPABASE.CO."
      },
      TOKEN
    ),
    {
      ready: true,
      environment: "staging",
      supabaseHost: "isolated-staging.supabase.co"
    }
  );
});

test("readiness is inactive and undiscoverable by default", () => {
  assert.deepEqual(
    evaluateTestAccountE2eReadiness(
      {
        ...SAFE_LOCAL_ENVIRONMENT,
        TEST_ACCOUNT_E2E_SUPPORT_ENABLED: undefined
      },
      TOKEN
    ),
    { ready: false, status: 404, code: "disabled" }
  );
});
