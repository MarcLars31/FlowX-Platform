import assert from "node:assert/strict";
import test from "node:test";
import {
  getPlatformAdminAccessStatus,
  getPostLoginDestination,
  getPlatformRole,
  isPlatformAdmin
} from "./platform-role";

test("accepts trusted platform admin roles from app_metadata", () => {
  assert.equal(isPlatformAdmin({ app_metadata: { role: "admin" } }), true);
  assert.equal(
    isPlatformAdmin({ app_metadata: { role: "platform_admin" } }),
    true
  );
});

test("rejects customer roles, missing and unknown app_metadata roles", () => {
  assert.equal(isPlatformAdmin({ app_metadata: { role: "customer" } }), false);
  assert.equal(
    isPlatformAdmin({ app_metadata: { role: "customer_admin" } }),
    false
  );
  assert.equal(isPlatformAdmin({ app_metadata: { role: "owner" } }), false);
  assert.equal(isPlatformAdmin({}), false);
  assert.equal(isPlatformAdmin(null), false);
});

test("does not trust a role supplied only through user_metadata", () => {
  const user = {
    app_metadata: {},
    user_metadata: { role: "admin" }
  };

  assert.equal(getPlatformRole(user), null);
  assert.equal(isPlatformAdmin(user), false);
});

test("returns fail-closed API authorization statuses", () => {
  assert.equal(getPlatformAdminAccessStatus(null), 401);
  assert.equal(
    getPlatformAdminAccessStatus({ app_metadata: { role: "customer" } }),
    403
  );
  assert.equal(
    getPlatformAdminAccessStatus({ app_metadata: { role: "admin" } }),
    200
  );
});

test("routes admins and customers to their own application areas", () => {
  assert.equal(
    getPostLoginDestination({ app_metadata: { role: "platform_admin" } }),
    "/admin"
  );
  assert.equal(
    getPostLoginDestination({ app_metadata: { role: "customer" } }),
    "/dashboard"
  );
  assert.equal(
    getPostLoginDestination({ app_metadata: { role: "customer_admin" } }),
    "/dashboard"
  );
  assert.equal(getPostLoginDestination({}), "/dashboard");
});
