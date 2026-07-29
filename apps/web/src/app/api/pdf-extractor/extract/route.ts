import { NextResponse } from "next/server";
import { requireOrganizationApi } from "@/lib/organization-api-authorization";
import { getCurrentUser } from "@/lib/supabase-auth";
import { isPlatformAdmin } from "@/lib/platform-role";
import { extractTechnicalSpecificationFromPages } from "@/modules/pdf-extractor/extractor";
import {
  samplePdfFileName,
  samplePdfPages
} from "@/modules/pdf-extractor/sample-text";
import type { ExtractionWarning } from "@/modules/pdf-extractor/types";

export const runtime = "nodejs";

const maxPdfBytes = 30 * 1024 * 1024;

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "Authentication is required." },
      { status: 401 }
    );
  }

  if (!isPlatformAdmin(user)) {
    const authorization = await requireOrganizationApi(["analysis.create"]);
    if (authorization.error) return authorization.error;
  }

  try {
    const formData = await request.formData();
    const useSample = formData.get("sample") === "true";
    const file = formData.get("file");

    if (useSample) {
      const result = extractTechnicalSpecificationFromPages(samplePdfPages, {
        fileName: samplePdfFileName
      });

      result.warnings.unshift(sampleFallbackWarning());

      return NextResponse.json(result);
    }

    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json(
        {
          error: "PDF file is required. Use the sample fallback when no PDF is available."
        },
        { status: 400 }
      );
    }

    if (file.size > maxPdfBytes) {
      return NextResponse.json(
        { error: "PDF exceeds the 30 MB extraction limit for this prototype." },
        { status: 413 }
      );
    }

    const { extractPdfTextPages } = await import("@/modules/pdf-extractor/pdf-text");
    const buffer = Buffer.from(await file.arrayBuffer());
    const pages = await extractPdfTextPages(buffer);
    const result = extractTechnicalSpecificationFromPages(pages, {
      fileName: file.name
    });

    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown PDF extraction failure.";

    return NextResponse.json(
      {
        error: "PDF extraction failed.",
        detail: message
      },
      { status: 500 }
    );
  }
}

function sampleFallbackWarning(): ExtractionWarning {
  return {
    id: "warning-sample-fallback",
    code: "SAMPLE_TEXT_FALLBACK",
    message:
      "Loaded the local sample extraction fixture because no PDF file was submitted.",
    severity: "info"
  };
}
