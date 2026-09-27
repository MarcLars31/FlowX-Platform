import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  getOrganizationContext,
  ORGANIZATION_COOKIE
} from "@/lib/organization-context";
import { getCurrentUser } from "@/lib/supabase-auth";
import { selectUserRows } from "@/lib/supabase-user-rest";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication is required." }, {
      status: 401
    });
  }

  const context = await getOrganizationContext();
  if (!context) {
    return NextResponse.json(
      { error: "No active organization membership was found." },
      { status: 404 }
    );
  }

  return NextResponse.json({ context });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication is required." }, {
      status: 401
    });
  }

  const body = (await request.json().catch(() => null)) as
    | { organizationId?: string }
    | null;
  const organizationId = body?.organizationId;
  if (!organizationId || !isUuid(organizationId)) {
    return NextResponse.json(
      { error: "A valid organizationId is required." },
      { status: 400 }
    );
  }

  const memberships = await selectUserRows<{ id: string }>(
    "organization_members",
    {
      select: "id",
      organization_id: `eq.${organizationId}`,
      user_id: `eq.${user.id}`,
      status: "eq.active",
      limit: "1"
    }
  );
  if (memberships.length === 0) {
    return NextResponse.json(
      { error: "The organization is not available to this user." },
      { status: 403 }
    );
  }

  const cookieStore = await cookies();
  cookieStore.set(ORGANIZATION_COOKIE, organizationId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365
  });

  return NextResponse.json({ organizationId });
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}
