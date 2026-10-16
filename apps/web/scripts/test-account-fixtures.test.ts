import assert from "node:assert/strict";
import test from "node:test";
import {
  KNOWN_PRODUCTION_SUPABASE_HOSTS,
  ORGANIZATION_ADMIN_ROLE_ID,
  readTestAccountEnvironment,
  removeTestUsers,
  seedTestUsers,
  TEST_ACCOUNTS,
  TEST_ACCOUNT_FIXTURE,
  TEST_ORGANIZATIONS,
  type AuthUser,
  type TestAccountStore
} from "./test-account-fixtures";

const SAFE_ENVIRONMENT: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  TEST_ACCOUNT_SEEDING_ENABLED: "true",
  TEST_ACCOUNT_ENVIRONMENT: "test",
  TEST_ACCOUNT_PASSWORD: "S3cure-local-fixture-2026!",
  SUPABASE_URL: "http://127.0.0.1:54321",
  SUPABASE_SECRET_KEY: `sb_secret_${"x".repeat(32)}`
};

class MemoryStore implements TestAccountStore {
  users: AuthUser[] = [];
  organizations: Array<Record<string, unknown>> = [];
  profiles: Array<Record<string, unknown>> = [];
  memberships: Array<Record<string, unknown>> = [];
  createdUsers = 0;
  updatedUsers = 0;
  deletedUsers = 0;

  async listAuthUsers() {
    return structuredClone(this.users);
  }

  async createAuthUser(input: {
    email: string;
    password: string;
    appMetadata: Record<string, unknown>;
    userMetadata: Record<string, unknown>;
  }) {
    assert.ok(input.password.length >= 12);
    this.createdUsers += 1;
    const user = {
      id: `test-user-${this.createdUsers}`,
      email: input.email,
      app_metadata: structuredClone(input.appMetadata),
      user_metadata: structuredClone(input.userMetadata)
    };
    this.users.push(user);
    return structuredClone(user);
  }

  async updateAuthUser(
    id: string,
    input: {
      password: string;
      appMetadata: Record<string, unknown>;
      userMetadata: Record<string, unknown>;
    }
  ) {
    assert.ok(input.password.length >= 12);
    this.updatedUsers += 1;
    const user = this.users.find((candidate) => candidate.id === id);
    if (!user) throw new Error("missing user");
    user.app_metadata = structuredClone(input.appMetadata);
    user.user_metadata = structuredClone(input.userMetadata);
    return structuredClone(user);
  }

  async deleteAuthUser(id: string) {
    this.deletedUsers += 1;
    this.users = this.users.filter((candidate) => candidate.id !== id);
    this.profiles = this.profiles.filter((profile) => profile.id !== id);
    this.memberships = this.memberships.filter(
      (membership) => membership.user_id !== id
    );
  }

  async selectRows<T>(table: string, filters: Record<string, string>) {
    const rows = this.table(table).filter((row) =>
      Object.entries(filters).every(([key, filter]) => {
        if (filter.startsWith("eq.")) return row[key] === filter.slice(3);
        if (filter.startsWith("ilike.")) {
          return (
            typeof row[key] === "string" &&
            row[key].toLowerCase() === filter.slice(6).toLowerCase()
          );
        }
        assert.fail(`Unsupported filter ${filter}`);
      })
    );
    return structuredClone(rows) as T[];
  }

  async insertRow<T>(table: string, payload: Record<string, unknown>) {
    const row = structuredClone(payload);
    this.table(table).push(row);
    return structuredClone(row) as T;
  }

  async upsertRow<T>(
    table: string,
    conflictColumns: string,
    payload: Record<string, unknown>
  ) {
    const rows = this.table(table);
    const keys = conflictColumns.split(",");
    const existing = rows.find((row) =>
      keys.every((key) => row[key] === payload[key])
    );
    if (existing) Object.assign(existing, structuredClone(payload));
    else rows.push(structuredClone(payload));
    return structuredClone(existing ?? payload) as T;
  }

  private table(name: string) {
    if (name === "organizations") return this.organizations;
    if (name === "profiles") return this.profiles;
    if (name === "organization_members") return this.memberships;
    throw new Error(`Unexpected table ${name}`);
  }
}

test("environment guard blocks production even when fixture flags are enabled", () => {
  assert.throws(
    () =>
      readTestAccountEnvironment(
        { ...SAFE_ENVIRONMENT, VERCEL_ENV: "production" },
        { requirePassword: true }
      ),
    /production/
  );
  assert.throws(
    () =>
      readTestAccountEnvironment(
        { ...SAFE_ENVIRONMENT, NODE_ENV: "production" },
        { requirePassword: true }
      ),
    /production/
  );
});

test("environment guard requires explicit opt-in and safe transport", () => {
  assert.throws(
    () =>
      readTestAccountEnvironment(
        { ...SAFE_ENVIRONMENT, TEST_ACCOUNT_SEEDING_ENABLED: "false" },
        { requirePassword: true }
      ),
    /disabled/
  );
  assert.throws(
    () =>
      readTestAccountEnvironment(
        { ...SAFE_ENVIRONMENT, SUPABASE_URL: "http://remote.example.test" },
        { requirePassword: true }
      ),
    /HTTPS/
  );
  assert.equal(
    readTestAccountEnvironment(SAFE_ENVIRONMENT, { requirePassword: true })
      .supabaseUrl,
    SAFE_ENVIRONMENT.SUPABASE_URL
  );
});

test("remote staging requires an exact Supabase host pin", () => {
  const stagingEnvironment: NodeJS.ProcessEnv = {
    ...SAFE_ENVIRONMENT,
    TEST_ACCOUNT_ENVIRONMENT: "staging",
    SUPABASE_URL: "https://isolated-staging.supabase.co"
  };

  assert.throws(
    () =>
      readTestAccountEnvironment(stagingEnvironment, {
        requirePassword: true
      }),
    /TEST_ACCOUNT_EXPECTED_SUPABASE_HOST/
  );
  assert.throws(
    () =>
      readTestAccountEnvironment(
        {
          ...stagingEnvironment,
          TEST_ACCOUNT_EXPECTED_SUPABASE_HOST:
            "another-staging.supabase.co"
        },
        { requirePassword: true }
      ),
    /does not match/
  );

  assert.equal(
    readTestAccountEnvironment(
      {
        ...stagingEnvironment,
        TEST_ACCOUNT_EXPECTED_SUPABASE_HOST:
          "ISOLATED-STAGING.SUPABASE.CO."
      },
      { requirePassword: true }
    ).supabaseUrl,
    stagingEnvironment.SUPABASE_URL
  );
});

test("known and explicitly listed production Supabase hosts cannot be pinned", () => {
  const knownProductionHost = KNOWN_PRODUCTION_SUPABASE_HOSTS[0];
  assert.throws(
    () =>
      readTestAccountEnvironment(
        {
          ...SAFE_ENVIRONMENT,
          TEST_ACCOUNT_ENVIRONMENT: "staging",
          SUPABASE_URL: `https://${knownProductionHost}`,
          TEST_ACCOUNT_EXPECTED_SUPABASE_HOST: knownProductionHost
        },
        { requirePassword: true }
      ),
    /production Supabase host/
  );

  assert.throws(
    () =>
      readTestAccountEnvironment(
        {
          ...SAFE_ENVIRONMENT,
          TEST_ACCOUNT_ENVIRONMENT: "staging",
          SUPABASE_URL: "https://customer-production.supabase.co",
          TEST_ACCOUNT_EXPECTED_SUPABASE_HOST:
            "customer-production.supabase.co",
          TEST_ACCOUNT_PRODUCTION_HOSTS:
            "customer-production.supabase.co,legacy-production.supabase.co"
        },
        { requirePassword: true }
      ),
    /production Supabase host/
  );
});

test("database host controls reject URLs, ports and malformed list entries", () => {
  for (const invalidHost of [
    "https://isolated-staging.supabase.co",
    "isolated-staging.supabase.co:443",
    "isolated-staging.supabase.co/path"
  ]) {
    assert.throws(
      () =>
        readTestAccountEnvironment(
          {
            ...SAFE_ENVIRONMENT,
            TEST_ACCOUNT_ENVIRONMENT: "staging",
            SUPABASE_URL: "https://isolated-staging.supabase.co",
            TEST_ACCOUNT_EXPECTED_SUPABASE_HOST: invalidHost
          },
          { requirePassword: true }
        ),
      /bare hostnames/
    );
  }

  assert.throws(
    () =>
      readTestAccountEnvironment(
        {
          ...SAFE_ENVIRONMENT,
          TEST_ACCOUNT_ENVIRONMENT: "staging",
          SUPABASE_URL: "https://isolated-staging.supabase.co",
          TEST_ACCOUNT_EXPECTED_SUPABASE_HOST:
            "isolated-staging.supabase.co",
          TEST_ACCOUNT_PRODUCTION_HOSTS: "safe.example,https://invalid.example"
        },
        { requirePassword: true }
      ),
    /bare hostnames/
  );
});

test("localhost remains available without a remote host pin", () => {
  assert.doesNotThrow(() =>
    readTestAccountEnvironment(
      {
        ...SAFE_ENVIRONMENT,
        SUPABASE_URL: "http://localhost:54321",
        TEST_ACCOUNT_EXPECTED_SUPABASE_HOST: undefined
      },
      { requirePassword: true }
    )
  );
  assert.doesNotThrow(() =>
    readTestAccountEnvironment(
      {
        ...SAFE_ENVIRONMENT,
        SUPABASE_URL: "http://[::1]:54321",
        TEST_ACCOUNT_EXPECTED_SUPABASE_HOST: undefined
      },
      { requirePassword: true }
    )
  );
});

test("fixture contains two platform admins and isolated customer admins", () => {
  assert.deepEqual(
    TEST_ACCOUNTS.map(({ role, organization }) => ({ role, organization })),
    [
      { role: "platform_admin", organization: "scipx" },
      { role: "platform_admin", organization: "scipx" },
      { role: "customer_admin", organization: "ovasia" },
      { role: "customer_admin", organization: "undersia" }
    ]
  );
  assert.equal(new Set(Object.values(TEST_ORGANIZATIONS).map(({ id }) => id)).size, 3);
});

test("seeding is idempotent and maps customer_admin to organization_admin", async () => {
  const store = new MemoryStore();
  const first = await seedTestUsers(store, SAFE_ENVIRONMENT.TEST_ACCOUNT_PASSWORD!);
  const second = await seedTestUsers(store, SAFE_ENVIRONMENT.TEST_ACCOUNT_PASSWORD!);

  assert.equal(first.length, 4);
  assert.ok(first.every(({ created }) => created));
  assert.ok(second.every(({ created }) => !created));
  assert.equal(store.createdUsers, 4);
  assert.equal(store.users.length, 4);
  assert.equal(store.profiles.length, 4);
  assert.equal(store.memberships.length, 4);
  assert.equal(store.organizations.length, 3);
  assert.ok(
    store.memberships.every(
      (membership) => membership.role_id === ORGANIZATION_ADMIN_ROLE_ID
    )
  );
  assert.equal(
    store.users.find(({ email }) => email === "ovasia-admin@example.test")
      ?.app_metadata?.role,
    "customer_admin"
  );
});

test("seeding never takes over a real account with a fixture email", async () => {
  const store = new MemoryStore();
  store.users.push({
    id: "real-user",
    email: "ovasia-admin@example.test",
    app_metadata: { role: "customer" }
  });

  await assert.rejects(
    seedTestUsers(store, SAFE_ENVIRONMENT.TEST_ACCOUNT_PASSWORD!),
    /Refusing to modify existing unmarked/
  );
  assert.equal(store.updatedUsers, 0);
  assert.equal(store.organizations.length, 0);
  assert.equal(store.users.find(({ id }) => id === "real-user")?.app_metadata?.role, "customer");
});

test("seeding never takes over an unmarked organization with a stable fixture id", async () => {
  const store = new MemoryStore();
  store.organizations.push({
    id: TEST_ORGANIZATIONS.scipx.id,
    name: TEST_ORGANIZATIONS.scipx.name,
    status: "active",
    is_test_organization: false,
    test_organization_fixture: null,
    test_organization_key: null
  });

  await assert.rejects(
    seedTestUsers(store, SAFE_ENVIRONMENT.TEST_ACCOUNT_PASSWORD!),
    /unmarked or has unexpected data/
  );
  assert.equal(store.createdUsers, 0);
  assert.equal(store.organizations.length, 1);
  assert.equal(store.organizations[0]?.is_test_organization, false);
});

test("removal requires matching protected Auth and profile markers", async () => {
  const store = new MemoryStore();
  await seedTestUsers(store, SAFE_ENVIRONMENT.TEST_ACCOUNT_PASSWORD!);
  const target = store.users.find(
    ({ email }) => email === "scipx-admin-1@example.test"
  )!;
  const profile = store.profiles.find(({ id }) => id === target.id)!;
  profile.is_test_account = false;

  await assert.rejects(
    removeTestUsers(store, { dryRun: false }),
    /protected Auth and database test markers/
  );
  assert.equal(store.deletedUsers, 0);
});

test("dry-run changes nothing and confirmed removal deletes only the fixture", async () => {
  const store = new MemoryStore();
  await seedTestUsers(store, SAFE_ENVIRONMENT.TEST_ACCOUNT_PASSWORD!);
  store.users.push({
    id: "real-user",
    email: "real@example.test",
    app_metadata: { is_test_account: false }
  });

  const preview = await removeTestUsers(store, { dryRun: true });
  assert.equal(preview.length, 4);
  assert.equal(store.deletedUsers, 0);
  assert.equal(store.users.length, 5);

  const removed = await removeTestUsers(store, { dryRun: false });
  assert.equal(removed.length, 4);
  assert.equal(store.deletedUsers, 4);
  assert.deepEqual(store.users.map(({ id }) => id), ["real-user"]);
  assert.ok(
    removed.every(({ key }) =>
      TEST_ACCOUNTS.some(
        (definition) =>
          definition.key === key && TEST_ACCOUNT_FIXTURE === "scipx_admin_test_v1"
      )
    )
  );
});
