import { after, NextResponse } from "next/server";
import { callSupabaseRpc } from "@/lib/supabase-rest";
import { runImportWorker } from "@/lib/import-worker.server";
import { consumeRateLimit, requestRateLimitKey } from "@/lib/request-rate-limit";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function POST(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token || !/^[a-f0-9-]{72}$/.test(token)) return new NextResponse(null,{status:401});
  const limit = consumeRateLimit(requestRateLimitKey(request,"import-scheduler"),10,60_000);
  if (!limit.allowed) return new NextResponse(null,{status:429});
  const valid = await callSupabaseRpc<boolean>("authorize_import_scheduler",{requested_token:token});
  if (!valid) return new NextResponse(null,{status:403});
  after(()=>runImportWorker());
  return new NextResponse(null,{status:202});
}
