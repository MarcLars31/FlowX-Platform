import { NextResponse } from "next/server";
import { clearAuthSession } from "@/lib/supabase-auth";

export async function POST(request: Request) {
  await clearAuthSession();

  return NextResponse.redirect(new URL("/", request.url), 303);
}
