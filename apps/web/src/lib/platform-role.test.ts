import assert from "node:assert/strict";
import test from "node:test";
import {
  getPlatformAdminAccessStatus,
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

test("rejects customer, missing and unknown app_metadata roles", () => {
  assert.equal(isPlatformAdmin({ app_metadata: { role: "customer" } }), false);
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
