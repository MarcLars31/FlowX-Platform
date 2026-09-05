import "server-only";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase-auth";
import { getPlatformAdminAccessStatus } from "@/lib/platform-role";

export async function requireAuthenticatedApi() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      { error: "Authentication is required." },
      { status: 401 }
    );
  }

  return null;
}

export async function requirePlatformAdminApi() {
  const user = await getCurrentUser();
  const status = getPlatformAdminAccessStatus(user);

  if (status === 401) {
    return NextResponse.json(
      { error: "Authentication is required." },
      { status: 401 }
    );
  }

  if (status === 403) {
    return NextResponse.json(
      { error: "Platform administrator access is required." },
      { status: 403 }
    );
  }

  return null;
}
