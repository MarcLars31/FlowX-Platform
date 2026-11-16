import { registerHooks } from "node:module";

// Next aliases this marker during a server build. Use its bundled empty marker
// for Node integration tests; production keeps Next's client-import protection.
registerHooks({
  resolve(specifier, context, nextResolve) {
    return nextResolve(
      specifier === "server-only" ? "next/dist/compiled/server-only/empty.js" : specifier,
      context
    );
  }
});
