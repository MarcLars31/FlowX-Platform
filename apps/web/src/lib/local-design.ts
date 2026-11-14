type LocalEnvironment = { NODE_ENV?: string; SCIPX_LOCAL_DESIGN?: string };

export function localDesignEnabled(environment: LocalEnvironment, host: string | null) {
  if (environment.NODE_ENV !== "development" || environment.SCIPX_LOCAL_DESIGN !== "1" || !host) return false;
  try {
    const url = new URL(`http://${host}`);
    return !url.username && !url.password && url.pathname === "/" &&
      ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  } catch { return false; }
}

export function localDesignRequestAllowed(request: Request, environment: LocalEnvironment) {
  if (!localDesignEnabled(environment, request.headers.get("host"))) return false;
  // Custom header prevents ordinary cross-origin forms from invoking this local-only parser.
  if (request.headers.get("x-scipx-local-design") !== "1") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true; // Local command-line verification.
  return origin === `http://${request.headers.get("host")}`;
}
