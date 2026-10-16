export class SessionRefreshError extends Error {
  constructor(readonly invalidSession: boolean, readonly status: number) {
    super("Session refresh failed");
  }
}

// Only an explicit token/session rejection may remove the user's cookies.
export function isInvalidRefreshResponse(status: number, code: unknown) {
  return [400, 401, 403].includes(status) && typeof code === "string" && [
    "refresh_token_not_found", "refresh_token_already_used", "session_not_found",
    "session_expired", "user_not_found", "user_banned", "bad_jwt"
  ].includes(code);
}

export async function refreshSession(url: string | URL, headers: HeadersInit, token: string, fetcher = fetch) {
  const response = await fetcher(url, {
    method: "POST", headers, body: JSON.stringify({ refresh_token: token }),
    cache: "no-store", signal: AbortSignal.timeout(8_000)
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new SessionRefreshError(isInvalidRefreshResponse(response.status, payload?.error_code ?? payload?.code), response.status);
  if (!payload || typeof payload.access_token !== "string" || typeof payload.refresh_token !== "string"
    || !Number.isFinite(payload.expires_in) || payload.expires_in <= 0) throw new SessionRefreshError(false, 502);
  return payload as { access_token: string; refresh_token: string; expires_in: number };
}
