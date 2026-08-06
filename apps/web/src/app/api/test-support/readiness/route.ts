import { NextResponse } from "next/server";
import {
  E2E_READINESS_HEADER,
  evaluateTestAccountE2eReadiness
} from "@/lib/test-account-e2e-readiness";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStoreHeaders = {
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache"
};

export async function GET(request: Request) {
  const readiness = evaluateTestAccountE2eReadiness(
    process.env,
    request.headers.get(E2E_READINESS_HEADER)
  );

  if (!readiness.ready) {
    if (readiness.status === 404) {
      return new NextResponse(null, {
        status: 404,
        headers: noStoreHeaders
      });
    }

    return NextResponse.json(
      { ready: false, code: readiness.code },
      { status: readiness.status, headers: noStoreHeaders }
    );
  }

  return NextResponse.json(readiness, { headers: noStoreHeaders });
}
