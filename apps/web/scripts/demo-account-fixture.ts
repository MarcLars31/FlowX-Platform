import type { AuthUser, TestAccountStore } from "./test-account-fixtures";

export const DEMO_ACCOUNT_FIXTURE = "scipx_demo_user_v1";
export const DEMO_ORGANIZATION_ID = "d0000000-0000-4000-8000-000000000003";
export const DEMO_COMPANY_ADMIN_ROLE_ID =
  "00000000-0000-4000-8000-000000000006";

export const DEMO_ACCOUNT = {
  key: "flowx_demo_company_admin",
  email: "flowx-demo-user@example.test",
  firstName: "FlowX",
  lastName: "Demo",
  displayName: "FlowX Demo User"
} as const;

type DemoOrganizationRow = {
  id: string;
  name: string;
  organization_number: string | null;
  status: string;
};

type DemoProfileRow = {
  id: string;
  is_test_account: boolean;
  test_account_fixture: string | null;
  test_account_key: string | null;
};

export type DemoAccountResult = {
  email: string;
  userId: string;
  created: boolean;
};

export async function seedDemoUser(
  store: TestAccountStore,
  password: string
): Promise<DemoAccountResult> {
  if (password.length < 12) {
    throw new Error("The demo-account password must contain at least 12 characters.");
  }

  const [organization] = await store.selectRows<DemoOrganizationRow>(
    "organizations",
    { id: `eq.${DEMO_ORGANIZATION_ID}` }
  );
  if (
    !organization
    || organization.name !== "Scipx Demo Company"
    || organization.organization_number !== "DEMO-000001"
    || organization.status !== "active"
  ) {
    throw new Error(
      "The exact active FlowX demo organization is missing. Run the demo data seed first."
    );
  }

  const users = await store.listAuthUsers();
  const existingUser = users.find(
    (candidate) => candidate.email?.toLowerCase() === DEMO_ACCOUNT.email
  );
  if (existingUser && !isOwnedDemoAuthUser(existingUser)) {
    throw new Error("Refusing to take over an existing non-demo Auth account.");
  }

  const authMetadata = {
    is_test_account: true,
    test_account_fixture: DEMO_ACCOUNT_FIXTURE,
    test_account_key: DEMO_ACCOUNT.key
  };
  const userMetadata = {
    first_name: DEMO_ACCOUNT.firstName,
    last_name: DEMO_ACCOUNT.lastName,
    full_name: DEMO_ACCOUNT.displayName,
    is_test_account: true,
    test_account_fixture: DEMO_ACCOUNT_FIXTURE,
    test_account_key: DEMO_ACCOUNT.key
  };

  const user = existingUser
    ? await store.updateAuthUser(existingUser.id, {
        password,
        appMetadata: authMetadata,
        userMetadata
      })
    : await store.createAuthUser({
        email: DEMO_ACCOUNT.email,
        password,
        appMetadata: authMetadata,
        userMetadata
      });

  const [existingProfile] = await store.selectRows<DemoProfileRow>("profiles", {
    id: `eq.${user.id}`
  });
  if (existingProfile && !isOwnedDemoProfile(existingProfile)) {
    if (!existingUser) await store.deleteAuthUser(user.id);
    throw new Error("Refusing to take over an existing non-demo profile.");
  }

  await store.upsertRow("profiles", "id", {
    id: user.id,
    first_name: DEMO_ACCOUNT.firstName,
    last_name: DEMO_ACCOUNT.lastName,
    display_name: DEMO_ACCOUNT.displayName,
    email: DEMO_ACCOUNT.email,
    is_test_account: true,
    test_account_fixture: DEMO_ACCOUNT_FIXTURE,
    test_account_key: DEMO_ACCOUNT.key
  });
  await store.upsertRow("organization_members", "organization_id,user_id", {
    organization_id: DEMO_ORGANIZATION_ID,
    user_id: user.id,
    role_id: DEMO_COMPANY_ADMIN_ROLE_ID,
    status: "active",
    joined_at: new Date().toISOString()
  });

  return {
    email: DEMO_ACCOUNT.email,
    userId: user.id,
    created: !existingUser
  };
}

export async function removeDemoUser(
  store: TestAccountStore,
  options: { dryRun: boolean }
): Promise<DemoAccountResult[]> {
  const users = await store.listAuthUsers();
  const user = users.find(
    (candidate) => candidate.email?.toLowerCase() === DEMO_ACCOUNT.email
  );
  if (!user || !isOwnedDemoAuthUser(user)) return [];

  const [profile] = await store.selectRows<DemoProfileRow>("profiles", {
    id: `eq.${user.id}`
  });
  if (!profile || !isOwnedDemoProfile(profile)) return [];

  if (!options.dryRun) await store.deleteAuthUser(user.id);
  return [{ email: DEMO_ACCOUNT.email, userId: user.id, created: false }];
}

function isOwnedDemoAuthUser(user: AuthUser) {
  return user.app_metadata?.is_test_account === true
    && user.app_metadata?.test_account_fixture === DEMO_ACCOUNT_FIXTURE
    && user.app_metadata?.test_account_key === DEMO_ACCOUNT.key;
}

function isOwnedDemoProfile(profile: DemoProfileRow) {
  return profile.is_test_account === true
    && profile.test_account_fixture === DEMO_ACCOUNT_FIXTURE
    && profile.test_account_key === DEMO_ACCOUNT.key;
}
