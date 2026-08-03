import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { requireOrganizationApi } from "@/lib/organization-api-authorization";
import {
  insertUserRowReturning,
  selectUserRows,
  UserSupabaseError
} from "@/lib/supabase-user-rest";
import {
  extractTechnicalDescriptionFromPages,
  extractTechnicalDescriptionPages
} from "@/modules/technical-description-extractor";
import type { TechnicalDescriptionMaterialLine } from "@/modules/technical-description-extractor";

export const runtime = "nodejs";

const MAX_PDF_BYTES = 30 * 1024 * 1024;

type ProjectRow = { id: string; organization_id: string };
type DocumentRow = { id: string };

export async function GET() {
  try {
    const authorization = await requireOrganizationApi([
      "technical_description.view"
    ]);
    if (authorization.error) return authorization.error;

    const documents = await selectUserRows("technical_description_documents", {
      select:
        "id,project_id,file_name,status,extraction_method,page_count,project_name,project_number,chapter,standards,warnings,created_by,created_at,updated_at",
      organization_id: `eq.${authorization.context.organization.id}`,
      order: "created_at.desc",
      limit: "50"
    });

    return NextResponse.json({ documents });
  } catch (error) {
    return technicalDescriptionErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const authorization = await requireOrganizationApi([
      "technical_description.create"
    ]);
    if (authorization.error) return authorization.error;

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json(
        { error: "En PDF-fil krävs för teknisk beskrivning." },
        { status: 400 }
      );
    }
    if (file.type && file.type !== "application/pdf") {
      return NextResponse.json(
        { error: "Filen måste vara en PDF." },
        { status: 400 }
      );
    }
    if (file.size > MAX_PDF_BYTES) {
      return NextResponse.json(
        { error: "PDF-filen får vara högst 30 MB." },
        { status: 413 }
      );
    }

    const projectIdValue = formData.get("projectId");
    const projectId =
      typeof projectIdValue === "string" && projectIdValue.trim()
        ? projectIdValue.trim()
        : null;
    if (projectId && !isUuid(projectId)) {
      return NextResponse.json({ error: "Ogiltigt projekt-id." }, { status: 400 });
    }

    if (projectId) {
      const projects = await selectUserRows<ProjectRow>("projects", {
        select: "id,organization_id",
        id: `eq.${projectId}`,
        organization_id: `eq.${authorization.context.organization.id}`,
        deleted_at: "is.null",
        limit: "1"
      });
      if (!projects[0]) {
        return NextResponse.json(
          { error: "Projektet hittades inte i den aktiva organisationen." },
          { status: 404 }
        );
      }
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const pages = await extractTechnicalDescriptionPages(buffer);
    const result = extractTechnicalDescriptionFromPages(pages, {
      fileName: file.name
    });
    const fileSha256 = createHash("sha256").update(buffer).digest("hex");
    const status = result.warnings.some((warning) => warning.severity === "warning")
      ? "review_required"
      : "extracted";

    const document = await insertUserRowReturning<DocumentRow>(
      "technical_description_documents",
      {
        organization_id: authorization.context.organization.id,
        project_id: projectId,
        file_name: file.name.slice(0, 255),
        file_sha256: fileSha256,
        status,
        extraction_method: result.document.extractionMethod,
        page_count: result.document.pageCount,
        project_name: result.project.name ?? null,
        project_number: result.project.projectNumber ?? null,
        chapter: result.project.chapter ?? null,
        source_pages: result.pages,
        standards: result.standards,
        rule_hints: result.ruleHints,
        warnings: result.warnings,
        created_by: authorization.user.id
      }
    );

    for (const line of result.materialLines) {
      await insertUserRowReturning(
        "technical_description_material_lines",
        materialLinePayload(
          line,
          authorization.context.organization.id,
          document.id,
          authorization.user.id
        )
      );
    }

    for (const hint of result.ruleHints) {
      await insertUserRowReturning("technical_description_rule_hints", {
        organization_id: authorization.context.organization.id,
        document_id: document.id,
        rule_key: hint.key,
        rule_value: hint.value,
        source_page: hint.sourcePage,
        source_text: hint.sourceText,
        confidence: hint.confidence
      });
    }

    return NextResponse.json(
      { documentId: document.id, persistedLineCount: result.materialLines.length, ...result },
      { status: 201 }
    );
  } catch (error) {
    return technicalDescriptionErrorResponse(error);
  }
}

function materialLinePayload(
  line: TechnicalDescriptionMaterialLine,
  organizationId: string,
  documentId: string,
  createdBy: string
) {
  return {
    organization_id: organizationId,
    document_id: documentId,
    post_number: line.postNumber ?? null,
    ns_code: line.nsCode ?? null,
    category: line.category,
    description: line.description,
    operation: line.operation,
    quantity: line.quantity ?? null,
    unit: line.unit ?? null,
    quantity_text: line.quantityText ?? null,
    attributes: line.attributes,
    system: line.system ?? null,
    standard_refs: line.standardRefs,
    source_page: line.sourcePage,
    source_text: line.sourceText,
    confidence: line.confidence,
    review_flags: line.reviewFlags,
    created_by: createdBy
  };
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function technicalDescriptionErrorResponse(error: unknown) {
  if (error instanceof UserSupabaseError) {
    const forbidden =
      error.status === 401 || error.status === 403 || error.code === "42501";
    return NextResponse.json(
      {
        error: forbidden
          ? "Åtgärden nekades av behörighetsreglerna."
          : "Tekniska beskrivningen kunde inte sparas.",
        detail: error.message
      },
      { status: forbidden ? 403 : 500 }
    );
  }

  return NextResponse.json(
    {
      error: "Extraktionen av teknisk beskrivning misslyckades.",
      detail: error instanceof Error ? error.message : "Okänt fel."
    },
    { status: 500 }
  );
}
