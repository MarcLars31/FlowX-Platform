export class AuthServiceUnavailableError extends Error {
  constructor() { super("Authentication service is temporarily unavailable."); this.name = "AuthServiceUnavailableError"; }
}
/** Service/network failures must never masquerade as an invalid session. */
export async function authRequest(url: string | URL, init: RequestInit, fetcher: typeof fetch = fetch) {
  let response: Response;
  try {
    response = await fetcher(url, { ...init, signal: AbortSignal.any([AbortSignal.timeout(8_000), ...(init.signal ? [init.signal] : [])]) });
  } catch { throw new AuthServiceUnavailableError(); }
  if (response.status >= 500 || response.status === 429) throw new AuthServiceUnavailableError();
  return response;
}
