import assert from "node:assert/strict";
import test from "node:test";
import {
  DEMO_ACCOUNT,
  DEMO_ACCOUNT_FIXTURE,
  DEMO_ORGANIZATION_ID,
  removeDemoUser,
  seedDemoUser
} from "./demo-account-fixture";
import type {
  AuthUser,
  TestAccountStore
} from "./test-account-fixtures";

class DemoMemoryStore implements TestAccountStore {
  users: AuthUser[] = [];
  organizations: Array<Record<string, unknown>> = [{
    id: DEMO_ORGANIZATION_ID,
    name: "Scipx Demo Company",
    organization_number: "DEMO-000001",
    status: "active"
  }];
  profiles: Array<Record<string, unknown>> = [];
  memberships: Array<Record<string, unknown>> = [];
  createdUsers = 0;
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
    const user: AuthUser = {
      id: `demo-user-${this.createdUsers}`,
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
    const user = this.users.find((candidate) => candidate.id === id);
    if (!user) throw new Error("missing user");
    user.app_metadata = structuredClone(input.appMetadata);
    user.user_metadata = structuredClone(input.userMetadata);
    return structuredClone(user);
  }

  async deleteAuthUser(id: string) {
    this.deletedUsers += 1;
    this.users = this.users.filter((user) => user.id !== id);
    this.profiles = this.profiles.filter((profile) => profile.id !== id);
    this.memberships = this.memberships.filter(
      (membership) => membership.user_id !== id
    );
  }

  async selectRows<T>(table: string, filters: Record<string, string>) {
    const rows = this.table(table).filter((row) =>
      Object.entries(filters).every(
        ([key, filter]) => filter.startsWith("eq.")
          && row[key] === filter.slice(3)
      )
    );
    return structuredClone(rows) as T[];
  }

  async insertRow<T>(table: string, payload: Record<string, unknown>) {
    this.table(table).push(structuredClone(payload));
    return structuredClone(payload) as T;
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

const PASSWORD = "S3cure-demo-fixture-2026!";

test("demo user seed is idempotent and linked to the stable demo organization", async () => {
  const store = new DemoMemoryStore();
  const first = await seedDemoUser(store, PASSWORD);
  const second = await seedDemoUser(store, PASSWORD);

  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(store.createdUsers, 1);
  assert.equal(store.users.length, 1);
  assert.equal(store.memberships.length, 1);
  assert.equal(store.memberships[0].organization_id, DEMO_ORGANIZATION_ID);
  assert.equal(store.profiles[0].test_account_fixture, DEMO_ACCOUNT_FIXTURE);
});

test("demo user seed never takes over an existing real account", async () => {
  const store = new DemoMemoryStore();
  store.users.push({
    id: "real-user",
    email: DEMO_ACCOUNT.email,
    app_metadata: { is_test_account: false }
  });

  await assert.rejects(seedDemoUser(store, PASSWORD), /Refusing to take over/);
  assert.equal(store.users[0].id, "real-user");
});

test("demo user removal requires both Auth and profile fixture markers", async () => {
  const store = new DemoMemoryStore();
  await seedDemoUser(store, PASSWORD);

  const dryRun = await removeDemoUser(store, { dryRun: true });
  assert.equal(dryRun.length, 1);
  assert.equal(store.users.length, 1);

  store.profiles[0].is_test_account = false;
  assert.deepEqual(await removeDemoUser(store, { dryRun: false }), []);
  assert.equal(store.users.length, 1);

  store.profiles[0].is_test_account = true;
  const removed = await removeDemoUser(store, { dryRun: false });
  assert.equal(removed.length, 1);
  assert.equal(store.users.length, 0);
  assert.equal(store.deletedUsers, 1);
});
