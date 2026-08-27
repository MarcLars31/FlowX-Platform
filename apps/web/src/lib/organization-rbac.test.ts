import assert from "node:assert/strict";
import test from "node:test";
import {
  canAccessProjectForRole,
  canAssignOrganizationRole,
  canViewDeletedProject,
  hasRolePermission
} from "./organization-rbac";
import { filterOrganizationNavigation } from "./organization-navigation";

test("a member cannot access another organization's project", () => {
  assert.equal(
    canAccessProjectForRole({
      role: "organization_owner",
      sameOrganization: false,
      accessLevel: "organization",
      isCreator: false,
      isAssigned: false,
      isExplicitMember: false,
      isTeamMember: false
    }),
    false
  );
});

test("mini users can search products but cannot access projects", () => {
  assert.equal(hasRolePermission("mini_user", "product.search"), true);
  assert.equal(hasRolePermission("mini_user", "project.view_own"), false);

  const navigation = filterOrganizationNavigation([
    "product.search",
    "product.view",
    "news.view"
  ]);

  assert.equal(navigation.some((item) => item.href.startsWith("/projects")), false);
  assert.equal(navigation.some((item) => item.href === "/statistics"), false);
});

test("full users can create projects but cannot invite members", () => {
  assert.equal(hasRolePermission("full_user", "project.create"), true);
  assert.equal(hasRolePermission("full_user", "member.invite"), false);

  const navigation = filterOrganizationNavigation([
    "project.view_own",
    "project.create"
  ]);
  assert.equal(
    navigation.some((item) => item.href === "/project-history"),
    true
  );
  assert.equal(
    navigation.some((item) => item.href === "/statistics"),
    true
  );
  assert.deepEqual(
    navigation
      .filter((item) => ["/project-history", "/statistics"].includes(item.href))
      .map((item) => item.href),
    ["/project-history", "/statistics"]
  );
  assert.equal(
    navigation.some((item) => item.href.startsWith("/organization")),
    false
  );
});

test("organization admins can invite but cannot assign platform admin", () => {
  assert.equal(hasRolePermission("organization_admin", "member.invite"), true);
  assert.equal(
    canAssignOrganizationRole({
      actorRole: "organization_admin",
      actorUserId: "admin",
      targetUserId: "member",
      targetCurrentRole: "full_user",
      requestedRole: "platform_admin",
      activeOwnerCount: 1
    }),
    false
  );
});

test("canonical phase-one roles inherit the intended permissions", () => {
  assert.equal(hasRolePermission("company_admin", "member.invite"), true);
  assert.equal(hasRolePermission("project_manager", "project.create"), true);
  assert.equal(hasRolePermission("engineer", "analysis.create"), true);
  assert.equal(hasRolePermission("viewer", "project.update"), false);
  assert.equal(hasRolePermission("viewer", "project.view_own"), true);

  assert.equal(
    canAssignOrganizationRole({
      actorRole: "company_admin",
      actorUserId: "admin",
      targetUserId: "member",
      targetCurrentRole: "viewer",
      requestedRole: "engineer",
      activeOwnerCount: 1
    }),
    true
  );
  assert.equal(
    canAssignOrganizationRole({
      actorRole: "company_admin",
      actorUserId: "admin",
      targetUserId: "member",
      targetCurrentRole: "viewer",
      requestedRole: "company_admin",
      activeOwnerCount: 1
    }),
    false
  );
});

test("members cannot promote their own role", () => {
  assert.equal(
    canAssignOrganizationRole({
      actorRole: "organization_owner",
      actorUserId: "same-user",
      targetUserId: "same-user",
      targetCurrentRole: "organization_owner",
      requestedRole: "organization_admin",
      activeOwnerCount: 2
    }),
    false
  );
});

test("the last active owner cannot be downgraded", () => {
  assert.equal(
    canAssignOrganizationRole({
      actorRole: "organization_owner",
      actorUserId: "owner-1",
      targetUserId: "owner-2",
      targetCurrentRole: "organization_owner",
      requestedRole: "full_user",
      activeOwnerCount: 1
    }),
    false
  );
});

test("team and restricted project access follow assignment rules", () => {
  assert.equal(
    canAccessProjectForRole({
      role: "full_user",
      sameOrganization: true,
      accessLevel: "team",
      isCreator: false,
      isAssigned: false,
      isExplicitMember: false,
      isTeamMember: true
    }),
    true
  );

  assert.equal(
    canAccessProjectForRole({
      role: "read_only",
      sameOrganization: true,
      accessLevel: "restricted",
      isCreator: false,
      isAssigned: false,
      isExplicitMember: true,
      isTeamMember: false
    }),
    true
  );
});

test("soft-deleted projects are hidden except from restore roles", () => {
  assert.equal(
    canAccessProjectForRole({
      role: "organization_admin",
      sameOrganization: true,
      accessLevel: "organization",
      isCreator: false,
      isAssigned: false,
      isExplicitMember: false,
      isTeamMember: false,
      isDeleted: true
    }),
    false
  );
  assert.equal(canViewDeletedProject("organization_admin", true), true);
  assert.equal(canViewDeletedProject("full_user", true), false);
});
