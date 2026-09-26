import {
  readTestAccountEnvironment,
  removeTestUsers,
  seedTestUsers,
  SupabaseTestAccountStore
} from "./test-account-fixtures";
import { removeDemoUser, seedDemoUser } from "./demo-account-fixture";

function usage() {
  return [
    "Usage:",
    "  npm run accounts -- seed-test-users",
    "  npm run accounts -- remove-test-users --dry-run",
    "  npm run accounts -- remove-test-users",
    "  npm run accounts -- seed-demo-user",
    "  npm run accounts -- remove-demo-user --dry-run",
    "  npm run accounts -- remove-demo-user"
  ].join("\n");
}

export async function runAccountsCli(args: string[], environment: NodeJS.ProcessEnv) {
  const command = args[0];
  const unknownArguments = args.slice(1).filter((value) => value !== "--dry-run");
  if (
    !command ||
    ![
      "seed-test-users",
      "remove-test-users",
      "seed-demo-user",
      "remove-demo-user"
    ].includes(command) ||
    unknownArguments.length > 0 ||
    (["seed-test-users", "seed-demo-user"].includes(command)
      && args.includes("--dry-run"))
  ) {
    throw new Error(usage());
  }

  const config = readTestAccountEnvironment(environment, {
    requirePassword: ["seed-test-users", "seed-demo-user"].includes(command)
  });
  const store = new SupabaseTestAccountStore(
    config.supabaseUrl,
    config.serviceRoleKey
  );

  if (command === "seed-test-users") {
    const results = await seedTestUsers(store, config.testPassword!);
    for (const result of results) {
      console.log(
        `${result.created ? "Created" : "Reconciled"} ${result.email} as ${result.role} in ${result.organizationId}.`
      );
    }
    console.log(`Test fixture ready: ${results.length} accounts.`);
    return;
  }

  if (command === "seed-demo-user") {
    const result = await seedDemoUser(store, config.testPassword!);
    console.log(
      `${result.created ? "Created" : "Reconciled"} ${result.email} in the FlowX demo organization.`
    );
    return;
  }

  const dryRun = args.includes("--dry-run");
  if (command === "remove-demo-user") {
    const results = await removeDemoUser(store, { dryRun });
    for (const result of results) {
      console.log(`${dryRun ? "Would remove" : "Removed"} ${result.email}.`);
    }
    console.log(
      `${dryRun ? "Dry-run" : "Removal"} complete: ${results.length} explicitly marked demo account(s) matched.`
    );
    return;
  }

  const results = await removeTestUsers(store, { dryRun });
  for (const result of results) {
    console.log(
      `${dryRun ? "Would remove" : "Removed"} ${result.email} (${result.key}).`
    );
  }
  console.log(
    dryRun
      ? `Dry-run complete: ${results.length} explicitly marked accounts matched.`
      : `Removal complete: ${results.length} explicitly marked accounts removed.`
  );
}

runAccountsCli(process.argv.slice(2), process.env).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown account-tool error.";
  console.error(message);
  process.exitCode = 1;
});
