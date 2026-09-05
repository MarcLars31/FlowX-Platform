import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase-auth";
import { isPlatformAdmin } from "@/lib/platform-role";

export async function authorizeCrawlerOrPlatformAdmin(request: Request) {
  const configuredToken = process.env.CRAWLER_INGEST_TOKEN?.trim();
  const suppliedToken = crawlerToken(request);
  if (
    configuredToken &&
    configuredToken.length >= 32 &&
    suppliedToken &&
    tokenMatches(configuredToken, suppliedToken)
  ) {
    return { actor: "crawler" as const, userId: null, error: null };
  }

  const user = await getCurrentUser();
  if (!user) {
    return {
      actor: null,
      userId: null,
      error: NextResponse.json({ error: "Authentication is required." }, { status: 401 })
    };
  }
  if (!isPlatformAdmin(user)) {
    return {
      actor: null,
      userId: null,
      error: NextResponse.json(
        { error: "Platform administrator access is required." },
        { status: 403 }
      )
    };
  }

  return { actor: "platform_admin" as const, userId: user.id, error: null };
}

function crawlerToken(request: Request) {
  const explicit = request.headers.get("x-scipx-crawler-token")?.trim();
  if (explicit) return explicit;
  const authorization = request.headers.get("authorization")?.trim();
  return authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : null;
}

function tokenMatches(expected: string, actual: string) {
  const expectedHash = createHash("sha256").update(expected).digest();
  const actualHash = createHash("sha256").update(actual).digest();
  return timingSafeEqual(expectedHash, actualHash);
}
