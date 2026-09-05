import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const appRoot = path.resolve(import.meta.dirname, "../app");

function source(relativePath: string) {
  return readFileSync(path.join(appRoot, relativePath), "utf8");
}

function routeFiles(relativeDirectory: string) {
  const directory = path.join(appRoot, relativeDirectory);
  if (!existsSync(directory)) return [];

  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name === "route.ts")
    .map((entry) => path.join(entry.parentPath, entry.name));
}

test("the central admin UI is protected by a server layout guard", () => {
  const layout = source("admin/layout.tsx");
  assert.match(layout, /getCurrentUser\s*\(/);
  assert.match(layout, /isPlatformAdmin\s*\(/);
  assert.match(layout, /redirect\s*\(\s*["']\/dashboard["']\s*\)/);
});

test("every central PKMS API has a backend guard", () => {
  for (const file of routeFiles("api/pkms")) {
    const contents = readFileSync(file, "utf8");
    const normalized = file.replaceAll("\\", "/");

    if (normalized.endsWith("/api/pkms/document-processing/ingest/route.ts")) {
      assert.match(contents, /authorizeCrawlerOrPlatformAdmin\s*\(/, file);
      continue;
    }

    if (normalized.endsWith("/api/pkms/products/route.ts")) {
      assert.match(contents, /requireOrganizationApi\s*\(/, file);
      assert.match(contents, /isPlatformAdmin\s*\(/, file);
      continue;
    }

    assert.match(contents, /requirePlatformAdminApi\s*\(/, file);
  }
});

test("every /api/admin endpoint is protected in backend code", () => {
  for (const file of routeFiles("api/admin")) {
    const contents = readFileSync(file, "utf8");
    assert.match(contents, /requirePlatformAdminApi\s*\(/, file);
  }
});

test("organization mutation and customer product APIs use server authorization", () => {
  const protectedRoutes = [
    "api/organizations/settings/route.ts",
    "api/organizations/invitations/route.ts",
    "api/organizations/members/[id]/role/route.ts",
    "api/organizations/members/[id]/status/route.ts",
    "api/products/search/route.ts",
    "api/products/documents/[id]/file/route.ts",
    "api/technical-descriptions/route.ts",
    "api/technical-descriptions/estimate/route.ts"
  ];

  for (const relativePath of protectedRoutes) {
    assert.match(source(relativePath), /requireOrganizationApi\s*\(/, relativePath);
  }

  for (const directory of ["api/projects", "api/teams"]) {
    for (const file of routeFiles(directory)) {
      assert.match(
        readFileSync(file, "utf8"),
        /requireOrganizationApi\s*\(/,
        file
      );
    }
  }
});

test("organization context switching verifies an active membership", () => {
  const contents = source("api/organizations/context/route.ts");
  assert.match(contents, /organization_members/);
  assert.match(contents, /organization_id:\s*`eq\.\$\{organizationId\}`/);
  assert.match(contents, /user_id:\s*`eq\.\$\{user\.id\}`/);
  assert.match(contents, /status:\s*["']eq\.active["']/);
  assert.match(contents, /status:\s*403/);
});
