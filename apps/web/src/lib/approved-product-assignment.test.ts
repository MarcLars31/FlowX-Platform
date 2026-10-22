import assert from "node:assert/strict";
import test from "node:test";
import { isUserApprovedProductAssignment } from "./approved-product-assignment";

test("requires an explicit user approval marker", () => {
  assert.equal(
    isUserApprovedProductAssignment({
      status: "selected",
      product_snapshot: { source: "distributor_manual" }
    }),
    false
  );
  assert.equal(
    isUserApprovedProductAssignment({
      status: "selected",
      product_snapshot: {
        source: "distributor_manual",
        approvedByUser: true,
        approvalStatus: "user_approved"
      }
    }),
    true
  );
});

test("rejects suggestions and non-selected assignments", () => {
  assert.equal(
    isUserApprovedProductAssignment({
      status: "suggested",
      product_snapshot: {
        source: "distributor_manual",
        approvedByUser: true,
        approvalStatus: "user_approved"
      }
    }),
    false
  );
  assert.equal(
    isUserApprovedProductAssignment({
      status: "selected",
      product_snapshot: {
        source: "product_matcher",
        approvedByUser: true,
        approvalStatus: "user_approved"
      }
    }),
    false
  );
});
