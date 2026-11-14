import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
function run(args) {
  const result = spawnSync(process.execPath,args,{stdio:"inherit",env:process.env});
  if(result.error)throw result.error;
  if(result.status!==0)process.exit(result.status??1);
}
const files = ["src","scripts"].flatMap(directory => readdirSync(directory,{recursive:true}).filter(file => typeof file === "string" && file.endsWith(".test.ts") && !file.endsWith("test-account-http-e2e.test.ts")).map(file=>`${directory}/${file}`));
run(["node_modules/next/dist/bin/next","typegen"]);
run(["node_modules/typescript/bin/tsc","--noEmit","--incremental","false"]);
run(["node_modules/eslint/bin/eslint.js",".","--max-warnings=0"]);
// Wall-clock database budgets need an uncontended worker. Keep their production
// thresholds while running the remaining regression tests concurrently.
const timingTests = new Set([
  "scripts/direct-project-assignment.test.ts",
  "scripts/managed-project-read-scope.test.ts",
  "scripts/project-management-summary.test.ts",
]);
const testArgs = ["--import", "./scripts/register-server-only-test.mjs", "--import", "tsx", "--test"];
run([...testArgs, "--test-concurrency=4", ...files.filter(file => !timingTests.has(file))]);
run([...testArgs, "--test-concurrency=1", ...files.filter(file => timingTests.has(file))]);
