import "server-only";
import { createHash } from "node:crypto";
import { callSupabaseRpc } from "./supabase-rest";
import { requestRateLimitKey } from "./request-rate-limit";
import { AuthServiceUnavailableError } from "./auth-transport";
export async function consumeLoginRateLimit(request: Request, email: string) {
  const hash = (value: string) => createHash("sha256").update(value).digest("hex");
  try {
    return await callSupabaseRpc<boolean>("consume_login_rate_limit", {
      requested_ip_hash: hash(requestRateLimitKey(request,"login-ip")),
      requested_account_hash: hash(`login-account:${email}`)
    });
  } catch { throw new AuthServiceUnavailableError(); }
}
