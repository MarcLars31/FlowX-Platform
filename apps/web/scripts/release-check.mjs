import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

function run(args) {
  const result = spawnSync(process.execPath, args, { stdio: "inherit", env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const suites = ["authz", "security", "rbac", "rules", "technical-upload", "technical-description",
  "distributor-mapping", "ahlsell-hybrid", "ahlsell-lookup", "requirement-review", "project-governance", "material-list-export", "test-accounts"];
const files = [...new Set(suites.flatMap(name => pkg.scripts[`test:${name}`].split(/\s+/).filter(arg => arg.endsWith(".test.ts"))))];
files.push("src/lib/ahlsell-shared-fetch.test.ts", "scripts/import-recovery.test.ts", "scripts/import-jobs-database.test.ts", "src/lib/architecture-remediation.test.ts", "scripts/architecture-database.test.ts",
  "src/lib/project-overview.test.ts", "src/lib/paginated-rows.test.ts", "src/lib/commercial-project-insights.test.ts");
run(["node_modules/next/dist/bin/next", "typegen"]);
run(["node_modules/typescript/bin/tsc", "--noEmit", "--incremental", "false"]);
run(["--import", "./scripts/register-server-only-test.mjs", "--import", "tsx", "--test", "--test-concurrency=4", ...files]);
