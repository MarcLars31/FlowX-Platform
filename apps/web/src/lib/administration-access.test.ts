import assert from "node:assert/strict";
import test from "node:test";
import {
  getOrganizationAccessStatus,
  type OrganizationAccessSnapshot
} from "./organization-access-policy";
import {
  canAssignOrganizationRole,
  ROLE_PERMISSION_KEYS
} from "./organization-rbac";
import {
  getPlatformAdminAccessStatus,
  getPostLoginDestination,
  getPlatformRole,
  isPlatformAdmin
} from "./platform-role";

const ORGANIZATIONS = {
  scipx: "51000000-0000-4000-8000-000000000001",
  ovasia: "51000000-0000-4000-8000-000000000002",
  undersia: "51000000-0000-4000-8000-000000000003"
} as const;

const USERS = {
  scipxAdmin1: "52000000-0000-4000-8000-000000000001",
  scipxAdmin2: "52000000-0000-4000-8000-000000000002",
  ovasiaAdmin: "52000000-0000-4000-8000-000000000003",
  undersiaAdmin: "52000000-0000-4000-8000-000000000004"
} as const;

const customerAdminPermissions = ROLE_PERMISSION_KEYS.organization_admin;

function activeOrganizationAdmin(
  userId: string,
  organizationId: string
): OrganizationAccessSnapshot {
  return {
    userId,
    organizationId,
    membership: {
      userId,
      organizationId,
      status: "active"
    },
    permissions: customerAdminPermissions
  };
}

test("both Scipx platform administrators can reach central admin routes and APIs", () => {
  for (const id of [USERS.scipxAdmin1, USERS.scipxAdmin2]) {
    const user = { id, app_metadata: { role: "platform_admin" } };
    assert.equal(isPlatformAdmin(user), true);
    assert.equal(getPlatformAdminAccessStatus(user), 200);
    assert.equal(getPostLoginDestination(user), "/admin");
  }
});

test("customer_admin is a customer role and never grants central platform access", () => {
  for (const id of [USERS.ovasiaAdmin, USERS.undersiaAdmin]) {
    const user = { id, app_metadata: { role: "customer_admin" } };
    assert.equal(getPlatformRole(user), "customer_admin");
    assert.equal(isPlatformAdmin(user), false);
    assert.equal(getPlatformAdminAccessStatus(user), 403);
    assert.equal(getPostLoginDestination(user), "/dashboard");
  }
});

test("Ovasia and Undersia customer admins can use their own customer APIs", () => {
  const principals = [
    activeOrganizationAdmin(USERS.ovasiaAdmin, ORGANIZATIONS.ovasia),
    activeOrganizationAdmin(USERS.undersiaAdmin, ORGANIZATIONS.undersia)
  ];

  for (const principal of principals) {
    assert.equal(
      getOrganizationAccessStatus(principal, {
        anyPermissions: ["organization.update", "member.view"]
      }),
      200
    );
    assert.equal(
      getOrganizationAccessStatus(principal, {
        anyPermissions: ["product.search", "product.view"]
      }),
      200
    );
    assert.equal(
      getOrganizationAccessStatus(principal, {
        anyPermissions: ["audit_log.view"]
      }),
      200
    );
  }
});

test("organization IDs from URLs, queries and bodies are constraints, never selectors", () => {
  const ovasia = activeOrganizationAdmin(
    USERS.ovasiaAdmin,
    ORGANIZATIONS.ovasia
  );
  const undersia = activeOrganizationAdmin(
    USERS.undersiaAdmin,
    ORGANIZATIONS.undersia
  );

  for (const tamperedOrganizationId of [
    ORGANIZATIONS.undersia,
    ORGANIZATIONS.scipx
  ]) {
    assert.equal(
      getOrganizationAccessStatus(ovasia, {
        anyPermissions: ["member.view"],
        requestedOrganizationId: tamperedOrganizationId
      }),
      403
    );
  }
  for (const tamperedOrganizationId of [
    ORGANIZATIONS.ovasia,
    ORGANIZATIONS.scipx
  ]) {
    assert.equal(
      getOrganizationAccessStatus(undersia, {
        anyPermissions: ["member.view"],
        requestedOrganizationId: tamperedOrganizationId
      }),
      403
    );
  }

  assert.equal(
    getOrganizationAccessStatus(ovasia, {
      anyPermissions: ["member.view"],
      requestedOrganizationId: ORGANIZATIONS.ovasia
    }),
    200
  );
});

test("a stale or forged cross-tenant membership context fails closed", () => {
  const forged: OrganizationAccessSnapshot = {
    userId: USERS.ovasiaAdmin,
    organizationId: ORGANIZATIONS.undersia,
    membership: {
      userId: USERS.ovasiaAdmin,
      organizationId: ORGANIZATIONS.ovasia,
      status: "active"
    },
    permissions: customerAdminPermissions
  };

  assert.equal(getOrganizationAccessStatus(forged), 403);
  assert.equal(
    getOrganizationAccessStatus({
      ...forged,
      organizationId: ORGANIZATIONS.ovasia,
      membership: {
        ...forged.membership!,
        userId: USERS.undersiaAdmin
      }
    }),
    403
  );
});

test("missing and inactive organization sessions fail closed", () => {
  assert.equal(getOrganizationAccessStatus({ userId: null }), 401);
  assert.equal(
    getOrganizationAccessStatus({
      ...activeOrganizationAdmin(USERS.ovasiaAdmin, ORGANIZATIONS.ovasia),
      membership: {
        userId: USERS.ovasiaAdmin,
        organizationId: ORGANIZATIONS.ovasia,
        status: "disabled"
      }
    }),
    403
  );
});

test("customer admins cannot create platform administrators or change themselves", () => {
  assert.equal(
    canAssignOrganizationRole({
      actorRole: "organization_admin",
      actorUserId: USERS.ovasiaAdmin,
      targetUserId: "52000000-0000-4000-8000-000000000099",
      targetCurrentRole: "full_user",
      requestedRole: "platform_admin",
      activeOwnerCount: 1
    }),
    false
  );
  assert.equal(
    canAssignOrganizationRole({
      actorRole: "organization_admin",
      actorUserId: USERS.ovasiaAdmin,
      targetUserId: USERS.ovasiaAdmin,
      targetCurrentRole: "organization_admin",
      requestedRole: "full_user",
      activeOwnerCount: 1
    }),
    false
  );
});
