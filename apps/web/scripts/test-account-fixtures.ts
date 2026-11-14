import { Buffer } from "node:buffer";
import { KNOWN_PRODUCTION_SUPABASE_HOSTS } from "../src/lib/test-account-e2e-readiness";

export { KNOWN_PRODUCTION_SUPABASE_HOSTS };

export const TEST_ACCOUNT_FIXTURE = "scipx_admin_test_v1";
export const ORGANIZATION_ADMIN_ROLE_ID =
  "00000000-0000-4000-8000-000000000002";

export const TEST_ORGANIZATIONS = {
  scipx: {
    id: "51000000-0000-4000-8000-000000000001",
    name: "Scipx"
  },
  ovasia: {
    id: "51000000-0000-4000-8000-000000000002",
    name: "Ovasia AB"
  },
  undersia: {
    id: "51000000-0000-4000-8000-000000000003",
    name: "Undersia AB"
  }
} as const;

export type TestOrganizationKey = keyof typeof TEST_ORGANIZATIONS;
export type TestAccountRole = "platform_admin" | "customer_admin";

export type TestAccountDefinition = {
  key: string;
  email: string;
  firstName: string;
  lastName: string;
  displayName: string;
  role: TestAccountRole;
  organization: TestOrganizationKey;
};

export const TEST_ACCOUNTS: readonly TestAccountDefinition[] = [
  {
    key: "scipx_admin_1",
    email: "scipx-admin-1@example.test",
    firstName: "Scipx",
    lastName: "Admin 1",
    displayName: "Scipx Admin 1",
    role: "platform_admin",
    organization: "scipx"
  },
  {
    key: "scipx_admin_2",
    email: "scipx-admin-2@example.test",
    firstName: "Scipx",
    lastName: "Admin 2",
    displayName: "Scipx Admin 2",
    role: "platform_admin",
    organization: "scipx"
  },
  {
    key: "ovasia_admin",
    email: "ovasia-admin@example.test",
    firstName: "Ovasia",
    lastName: "Admin",
    displayName: "Ovasia Admin",
    role: "customer_admin",
    organization: "ovasia"
  },
  {
    key: "undersia_admin",
    email: "undersia-admin@example.test",
    firstName: "Undersia",
    lastName: "Admin",
    displayName: "Undersia Admin",
    role: "customer_admin",
    organization: "undersia"
  }
] as const;

export type AuthUser = {
  id: string;
  email?: string;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
};

type OrganizationRow = {
  id: string;
  name: string;
  status: string;
  is_test_organization: boolean;
  test_organization_fixture: string | null;
  test_organization_key: string | null;
};

type ProfileRow = {
  id: string;
  is_test_account: boolean;
  test_account_fixture: string | null;
  test_account_key: string | null;
};

type MembershipRow = {
  id: string;
  organization_id: string;
  user_id: string;
  role_id: string;
  status: string;
};

export interface TestAccountStore {
  listAuthUsers(): Promise<AuthUser[]>;
  createAuthUser(input: {
    email: string;
    password: string;
    appMetadata: Record<string, unknown>;
    userMetadata: Record<string, unknown>;
  }): Promise<AuthUser>;
  updateAuthUser(
    id: string,
    input: {
      password: string;
      appMetadata: Record<string, unknown>;
      userMetadata: Record<string, unknown>;
    }
  ): Promise<AuthUser>;
  deleteAuthUser(id: string): Promise<void>;
  selectRows<T>(table: string, filters: Record<string, string>): Promise<T[]>;
  insertRow<T>(table: string, payload: Record<string, unknown>): Promise<T>;
  upsertRow<T>(
    table: string,
    conflictColumns: string,
    payload: Record<string, unknown>
  ): Promise<T>;
}

export type TestAccountEnvironment = {
  supabaseUrl: string;
  serviceRoleKey: string;
  testPassword?: string;
};

const ALLOWED_TEST_ENVIRONMENTS = new Set([
  "local",
  "development",
  "test",
  "staging"
]);
const ENVIRONMENT_SIGNALS = [
  "NODE_ENV",
  "VERCEL_ENV",
  "APP_ENV",
  "ENVIRONMENT",
  "DEPLOYMENT_ENV",
  "SUPABASE_ENVIRONMENT"
] as const;

export function readTestAccountEnvironment(
  environment: NodeJS.ProcessEnv,
  options: { requirePassword: boolean }
): TestAccountEnvironment {
  if (environment.TEST_ACCOUNT_SEEDING_ENABLED !== "true") {
    throw new Error(
      "Test-account tooling is disabled. Set TEST_ACCOUNT_SEEDING_ENABLED=true only in local, test or staging configuration."
    );
  }

  const declaredEnvironment = environment.TEST_ACCOUNT_ENVIRONMENT
    ?.trim()
    .toLowerCase();
  if (!declaredEnvironment || !ALLOWED_TEST_ENVIRONMENTS.has(declaredEnvironment)) {
    throw new Error(
      "TEST_ACCOUNT_ENVIRONMENT must explicitly be local, development, test or staging."
    );
  }

  for (const name of ENVIRONMENT_SIGNALS) {
    const value = environment[name]?.trim().toLowerCase();
    if (value === "production" || value === "prod") {
      throw new Error(
        `Test accounts are blocked because ${name} identifies this environment as production.`
      );
    }
  }

  const supabaseUrl = (
    environment.SUPABASE_URL ?? environment.NEXT_PUBLIC_SUPABASE_URL
  )?.trim();
  const serviceRoleKey = (
    environment.SUPABASE_SECRET_KEY ?? environment.SUPABASE_SERVICE_ROLE_KEY
  )?.trim();

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_URL and a backend Supabase secret/service-role key are required."
    );
  }

  assertSafeSupabaseUrl(supabaseUrl, environment);
  assertServiceRoleKey(serviceRoleKey);

  const testPassword = environment.TEST_ACCOUNT_PASSWORD;
  if (options.requirePassword) {
    if (!testPassword || testPassword.length < 12) {
      throw new Error(
        "TEST_ACCOUNT_PASSWORD must be configured with at least 12 characters in test-only configuration."
      );
    }
    if (/replace|password|changeme/i.test(testPassword)) {
      throw new Error("TEST_ACCOUNT_PASSWORD still contains a placeholder value.");
    }
  }

  return { supabaseUrl, serviceRoleKey, testPassword };
}

function assertSafeSupabaseUrl(
  value: string,
  environment: NodeJS.ProcessEnv
) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("SUPABASE_URL is not a valid URL.");
  }

  if (url.username || url.password) {
    throw new Error("SUPABASE_URL must not contain embedded credentials.");
  }

  const hostname = normalizeHostname(url.hostname);
  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  const isLocal = localHosts.has(hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLocal)) {
    throw new Error(
      "Remote test-account operations require HTTPS; HTTP is allowed only for localhost."
    );
  }

  if (isLocal) return;

  const productionHosts = productionSupabaseHosts(environment);
  if (productionHosts.has(hostname)) {
    throw new Error(
      "Test-account operations are blocked for the configured production Supabase host."
    );
  }

  const expectedHost = configuredHostname(
    environment.TEST_ACCOUNT_EXPECTED_SUPABASE_HOST,
    "TEST_ACCOUNT_EXPECTED_SUPABASE_HOST"
  );
  if (!expectedHost) {
    throw new Error(
      "Remote test-account operations require TEST_ACCOUNT_EXPECTED_SUPABASE_HOST."
    );
  }
  if (hostname !== expectedHost) {
    throw new Error(
      "SUPABASE_URL does not match TEST_ACCOUNT_EXPECTED_SUPABASE_HOST."
    );
  }
}

function productionSupabaseHosts(environment: NodeJS.ProcessEnv) {
  const hosts = new Set<string>(KNOWN_PRODUCTION_SUPABASE_HOSTS);
  const configured = environment.TEST_ACCOUNT_PRODUCTION_HOSTS?.split(",") ?? [];
  for (const value of configured) {
    const host = configuredHostname(value, "TEST_ACCOUNT_PRODUCTION_HOSTS");
    if (host) hosts.add(host);
  }
  return hosts;
}

function configuredHostname(value: string | undefined, variableName: string) {
  const candidate = value?.trim();
  if (!candidate) return null;
  if (
    candidate.includes("://") ||
    /[/?#@]/.test(candidate) ||
    candidate.includes(":")
  ) {
    throw new Error(`${variableName} must contain bare hostnames only.`);
  }

  const normalized = normalizeHostname(candidate);
  if (
    !normalized ||
    normalized.length > 253 ||
    !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(
      normalized
    )
  ) {
    throw new Error(`${variableName} contains an invalid hostname.`);
  }
  return normalized;
}

function normalizeHostname(value: string) {
  const normalized = value.trim().toLowerCase().replace(/\.+$/, "");
  return normalized.startsWith("[") && normalized.endsWith("]")
    ? normalized.slice(1, -1)
    : normalized;
}

function assertServiceRoleKey(key: string) {
  if (key.startsWith("sb_publishable_") || key.startsWith("eyJ") && jwtRole(key) !== "service_role") {
    throw new Error("A publishable/anon key cannot manage test accounts.");
  }
  if (key.startsWith("replace-") || key.length < 20) {
    throw new Error("The configured Supabase backend key is a placeholder or invalid.");
  }
}

function jwtRole(token: string) {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const decoded = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    ) as { role?: unknown };
    return typeof decoded.role === "string" ? decoded.role : null;
  } catch {
    return null;
  }
}

export class SupabaseTestAccountStore implements TestAccountStore {
  private readonly baseUrl: URL;

  constructor(
    supabaseUrl: string,
    private readonly serviceRoleKey: string,
    private readonly fetchImplementation: typeof fetch = fetch
  ) {
    this.baseUrl = new URL(
      supabaseUrl.endsWith("/") ? supabaseUrl : `${supabaseUrl}/`
    );
  }

  async listAuthUsers() {
    const users: AuthUser[] = [];
    const perPage = 1000;

    for (let page = 1; page <= 100; page += 1) {
      const response = await this.request(
        `auth/v1/admin/users?page=${page}&per_page=${perPage}`,
        { method: "GET" }
      );
      const payload = (await response.json()) as {
        users?: AuthUser[];
        next_page?: number | null;
      };
      const pageUsers = payload.users ?? [];
      users.push(...pageUsers);
      if (!payload.next_page && pageUsers.length < perPage) break;
    }

    return users;
  }

  async createAuthUser(input: {
    email: string;
    password: string;
    appMetadata: Record<string, unknown>;
    userMetadata: Record<string, unknown>;
  }) {
    const response = await this.request("auth/v1/admin/users", {
      method: "POST",
      body: JSON.stringify({
        email: input.email,
        password: input.password,
        email_confirm: true,
        app_metadata: input.appMetadata,
        user_metadata: input.userMetadata
      })
    });
    return (await response.json()) as AuthUser;
  }

  async updateAuthUser(
    id: string,
    input: {
      password: string;
      appMetadata: Record<string, unknown>;
      userMetadata: Record<string, unknown>;
    }
  ) {
    const response = await this.request(
      `auth/v1/admin/users/${encodeURIComponent(id)}`,
      {
        method: "PUT",
        body: JSON.stringify({
          password: input.password,
          app_metadata: input.appMetadata,
          user_metadata: input.userMetadata
        })
      }
    );
    return (await response.json()) as AuthUser;
  }

  async deleteAuthUser(id: string) {
    await this.request(
      `auth/v1/admin/users/${encodeURIComponent(id)}?should_soft_delete=false`,
      { method: "DELETE" }
    );
  }

  async selectRows<T>(table: string, filters: Record<string, string>) {
    const url = new URL(`rest/v1/${table}`, this.baseUrl);
    url.searchParams.set("select", "*");
    for (const [key, value] of Object.entries(filters)) {
      url.searchParams.set(key, value);
    }
    const response = await this.requestUrl(url, { method: "GET" });
    return (await response.json()) as T[];
  }

  async insertRow<T>(table: string, payload: Record<string, unknown>) {
    const response = await this.request(`rest/v1/${table}`, {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(payload)
    });
    return firstRow<T>(await response.json(), table);
  }

  async upsertRow<T>(
    table: string,
    conflictColumns: string,
    payload: Record<string, unknown>
  ) {
    const url = new URL(`rest/v1/${table}`, this.baseUrl);
    url.searchParams.set("on_conflict", conflictColumns);
    const response = await this.requestUrl(url, {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify(payload)
    });
    return firstRow<T>(await response.json(), table);
  }

  private request(path: string, init: RequestInit) {
    return this.requestUrl(new URL(path, this.baseUrl), init);
  }

  private async requestUrl(url: URL, init: RequestInit) {
    const response = await this.fetchImplementation(url, {
      ...init,
      headers: {
        apikey: this.serviceRoleKey,
        Authorization: `Bearer ${this.serviceRoleKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        ...init.headers
      }
    });

    if (!response.ok) {
      throw new Error(await safeApiError(response));
    }
    return response;
  }
}

function firstRow<T>(payload: unknown, table: string) {
  if (!Array.isArray(payload) || !payload[0]) {
    throw new Error(`Supabase ${table} mutation returned no row.`);
  }
  return payload[0] as T;
}

async function safeApiError(response: Response) {
  let message = "request failed";
  try {
    const payload = (await response.json()) as {
      message?: unknown;
      msg?: unknown;
      error_description?: unknown;
      code?: unknown;
    };
    const candidate =
      payload.message ?? payload.msg ?? payload.error_description ?? payload.code;
    if (typeof candidate === "string" && candidate.length <= 300) {
      message = candidate;
    }
  } catch {
    // Deliberately do not echo arbitrary response bodies or request data.
  }
  return `Supabase ${response.status}: ${message}`;
}

function authMetadataFor(
  definition: TestAccountDefinition,
  existing: Record<string, unknown> = {}
) {
  const organization = TEST_ORGANIZATIONS[definition.organization];
  return {
    ...existing,
    role: definition.role,
    organization_id: organization.id,
    organization_role: "organization_admin",
    is_test_account: true,
    test_account_fixture: TEST_ACCOUNT_FIXTURE,
    test_account_key: definition.key
  };
}

function userMetadataFor(
  definition: TestAccountDefinition,
  existing: Record<string, unknown> = {}
) {
  return {
    ...existing,
    first_name: definition.firstName,
    last_name: definition.lastName,
    full_name: definition.displayName,
    display_name: definition.displayName
  };
}

function hasFixtureIdentity(user: AuthUser, definition: TestAccountDefinition) {
  return (
    user.app_metadata?.is_test_account === true &&
    user.app_metadata?.test_account_fixture === TEST_ACCOUNT_FIXTURE &&
    user.app_metadata?.test_account_key === definition.key
  );
}

function accountByIdentity(users: AuthUser[], definition: TestAccountDefinition) {
  const byFixture = users.filter(
    (user) =>
      user.app_metadata?.test_account_fixture === TEST_ACCOUNT_FIXTURE &&
      user.app_metadata?.test_account_key === definition.key
  );
  const byEmail = users.filter(
    (user) => user.email?.toLowerCase() === definition.email.toLowerCase()
  );

  if (byFixture.length > 1 || byEmail.length > 1) {
    throw new Error(`Ambiguous existing identity for ${definition.key}.`);
  }

  const existing = byFixture[0] ?? byEmail[0];
  if (!existing) return null;
  if (!hasFixtureIdentity(existing, definition)) {
    throw new Error(
      `Refusing to modify existing unmarked or foreign account ${definition.email}.`
    );
  }
  if (existing.email?.toLowerCase() !== definition.email.toLowerCase()) {
    throw new Error(`Fixture ${definition.key} has an unexpected email address.`);
  }
  return existing;
}

async function ensureOrganization(
  store: TestAccountStore,
  key: TestOrganizationKey
) {
  const definition = TEST_ORGANIZATIONS[key];
  const rows = await store.selectRows<OrganizationRow>("organizations", {
    id: `eq.${definition.id}`
  });
  if (rows.length > 1) throw new Error(`Duplicate organization id ${definition.id}.`);

  const existing = rows[0];
  if (existing) {
    if (
      existing.name !== definition.name ||
      existing.status !== "active" ||
      existing.is_test_organization !== true ||
      existing.test_organization_fixture !== TEST_ACCOUNT_FIXTURE ||
      existing.test_organization_key !== key
    ) {
      throw new Error(
        `Stable test organization ${definition.id} is unmarked or has unexpected data.`
      );
    }
    return existing;
  }

  const sameName = await store.selectRows<OrganizationRow>("organizations", {
    name: `ilike.${definition.name}`
  });
  if (sameName.length > 0) {
    throw new Error(
      `Organization ${definition.name} already exists with a different id; refusing to create a duplicate.`
    );
  }

  return store.insertRow<OrganizationRow>("organizations", {
    id: definition.id,
    name: definition.name,
    status: "active",
    is_test_organization: true,
    test_organization_fixture: TEST_ACCOUNT_FIXTURE,
    test_organization_key: key
  });
}

async function ensureProfile(
  store: TestAccountStore,
  user: AuthUser,
  definition: TestAccountDefinition
) {
  const rows = await store.selectRows<ProfileRow>("profiles", {
    id: `eq.${user.id}`
  });
  if (rows.length > 1) throw new Error(`Duplicate profile for ${definition.key}.`);
  const existing = rows[0];
  if (
    existing?.is_test_account === true &&
    (existing.test_account_fixture !== TEST_ACCOUNT_FIXTURE ||
      existing.test_account_key !== definition.key)
  ) {
    throw new Error(`Profile ${user.id} belongs to another test fixture.`);
  }

  return store.upsertRow<ProfileRow>("profiles", "id", {
    id: user.id,
    email: definition.email,
    first_name: definition.firstName,
    last_name: definition.lastName,
    display_name: definition.displayName,
    is_test_account: true,
    test_account_fixture: TEST_ACCOUNT_FIXTURE,
    test_account_key: definition.key
  });
}

async function ensureMembership(
  store: TestAccountStore,
  user: AuthUser,
  definition: TestAccountDefinition
) {
  const organization = TEST_ORGANIZATIONS[definition.organization];
  const memberships = await store.selectRows<MembershipRow>(
    "organization_members",
    { user_id: `eq.${user.id}` }
  );
  const foreignMembership = memberships.find(
    (membership) => membership.organization_id !== organization.id
  );
  if (foreignMembership) {
    throw new Error(
      `Test identity ${definition.key} already belongs to another organization.`
    );
  }

  const existing = memberships[0];
  return store.upsertRow<MembershipRow>(
    "organization_members",
    "organization_id,user_id",
    {
      ...(existing ? { id: existing.id } : {}),
      organization_id: organization.id,
      user_id: user.id,
      role_id: ORGANIZATION_ADMIN_ROLE_ID,
      status: "active",
      joined_at: new Date().toISOString()
    }
  );
}

export type SeedResult = {
  key: string;
  email: string;
  userId: string;
  created: boolean;
  role: TestAccountRole;
  organizationId: string;
};

export async function seedTestUsers(
  store: TestAccountStore,
  password: string
): Promise<SeedResult[]> {
  if (password.length < 12) {
    throw new Error("The test password must contain at least 12 characters.");
  }

  const users = await store.listAuthUsers();
  const existingAccounts = new Map(
    TEST_ACCOUNTS.map((definition) => [
      definition.key,
      accountByIdentity(users, definition)
    ])
  );

  // Complete the collision preflight before making the first mutation. This is
  // what guarantees that a real account using a fixture email remains untouched.
  for (const key of Object.keys(TEST_ORGANIZATIONS) as TestOrganizationKey[]) {
    await ensureOrganization(store, key);
  }

  const results: SeedResult[] = [];
  for (const definition of TEST_ACCOUNTS) {
    const existing = existingAccounts.get(definition.key) ?? null;
    const appMetadata = authMetadataFor(
      definition,
      existing?.app_metadata ?? {}
    );
    const userMetadata = userMetadataFor(
      definition,
      existing?.user_metadata ?? {}
    );
    const user = existing
      ? await store.updateAuthUser(existing.id, {
          password,
          appMetadata,
          userMetadata
        })
      : await store.createAuthUser({
          email: definition.email,
          password,
          appMetadata,
          userMetadata
        });

    if (!user.id) throw new Error(`Auth did not return an id for ${definition.key}.`);
    await ensureProfile(store, user, definition);
    await ensureMembership(store, user, definition);
    if (!existing) users.push(user);

    results.push({
      key: definition.key,
      email: definition.email,
      userId: user.id,
      created: !existing,
      role: definition.role,
      organizationId: TEST_ORGANIZATIONS[definition.organization].id
    });
  }
  return results;
}

export type RemovalResult = {
  key: string;
  email: string;
  userId: string;
  removed: boolean;
};

export async function removeTestUsers(
  store: TestAccountStore,
  options: { dryRun: boolean }
): Promise<RemovalResult[]> {
  const users = await store.listAuthUsers();
  const results: RemovalResult[] = [];

  for (const definition of TEST_ACCOUNTS) {
    const user = users.find((candidate) => hasFixtureIdentity(candidate, definition));
    if (!user) continue;
    if (user.email?.toLowerCase() !== definition.email.toLowerCase()) {
      throw new Error(`Fixture ${definition.key} has an unexpected email address.`);
    }

    const profiles = await store.selectRows<ProfileRow>("profiles", {
      id: `eq.${user.id}`
    });
    const profile = profiles[0];
    const hasDatabaseMarker =
      profiles.length === 1 &&
      profile?.is_test_account === true &&
      profile.test_account_fixture === TEST_ACCOUNT_FIXTURE &&
      profile.test_account_key === definition.key;
    if (!hasDatabaseMarker) {
      throw new Error(
        `Refusing to remove ${definition.key}: protected Auth and database test markers do not both match.`
      );
    }

    if (!options.dryRun) await store.deleteAuthUser(user.id);
    results.push({
      key: definition.key,
      email: definition.email,
      userId: user.id,
      removed: !options.dryRun
    });
  }

  return results;
}
