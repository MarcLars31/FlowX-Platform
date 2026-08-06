import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { requireOrganizationApi } from "@/lib/organization-api-authorization";
import {
  insertUserRowReturning,
  selectUserRows,
  updateUserRowsReturning,
  uploadUserStorageObject,
  UserSupabaseError
} from "@/lib/supabase-user-rest";
import type { TechnicalDescriptionMaterialLine } from "@/modules/technical-description-extractor";
import { consumeRateLimit, requestRateLimitKey } from "@/lib/request-rate-limit";
import { hasPdfSignature } from "@/lib/pdf-security";

export const runtime = "nodejs";

const MAX_PDF_BYTES = 30 * 1024 * 1024;

type ProjectRow = { id: string; organization_id: string };
type ProjectModuleRow = { id: string; project_id: string; module_code: string };
type DocumentRow = { id: string };
type ProjectDocumentRow = { id: string; upload_status: string; processing_status: string };
type RequirementSetRow = { id: string; version: number; status: string };
type ExtractionRunRow = { id: string };

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

    const limit = consumeRateLimit(
      requestRateLimitKey(request, "technical-description", authorization.user.id),
      5,
      60_000
    );
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "För många tekniska beskrivningar på kort tid. Försök igen senare." },
        { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
      );
    }

    // Keep the PDF/OCR dependencies out of the route's module initialization.
    // Some runtimes (including Vercel's serverless runtime) cannot initialize
    // those browser-oriented dependencies while loading the route. Loading
    // them only for an actual extraction keeps authentication and error
    // responses JSON instead of falling back to an HTML 500 page.
    const {
      extractTechnicalDescriptionFromPages,
      extractTechnicalDescriptionPages
    } = await import("@/modules/technical-description-extractor");

    const projectIdValue = formData.get("projectId");
    const projectId =
      typeof projectIdValue === "string" && projectIdValue.trim()
        ? projectIdValue.trim()
        : null;
    if (!projectId) {
      return NextResponse.json(
        { error: "Öppna eller skapa ett projekt innan du laddar upp teknisk beskrivning." },
        { status: 400 }
      );
    }
    if (!isUuid(projectId)) {
      return NextResponse.json({ error: "Ogiltigt projekt-id." }, { status: 400 });
    }

    const projects = await selectUserRows<ProjectRow>("projects", {
      select: "id,organization_id",
      id: `eq.${projectId}`,
      organization_id: `eq.${authorization.context.organization.id}`,
      deleted_at: "is.null",
      limit: "1"
    });
    if (!projects[0]) {
      return NextResponse.json(
        { error: "Projektet hittades inte eller du saknar projektåtkomst." },
        { status: 404 }
      );
    }
    const projectModules = await selectUserRows<ProjectModuleRow>("project_modules", {
      select: "id,project_id,module_code",
      project_id: `eq.${projectId}`,
      organization_id: `eq.${authorization.context.organization.id}`,
      module_code: "eq.sprinkler",
      status: "eq.active",
      limit: "1"
    });
    const projectModule = projectModules[0];
    if (!projectModule) {
      return NextResponse.json(
        { error: "Projektet saknar en aktiv sprinkler-modul. Kontakta projektadministratören." },
        { status: 409 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (!hasPdfSignature(buffer.subarray(0, 5))) {
      return NextResponse.json({ error: "Filen är inte en giltig PDF." }, { status: 415 });
    }
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
        project_module_id: projectModule.id,
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

    let projectDocument: ProjectDocumentRow | null = null;
    let extractionRun: ExtractionRunRow | null = null;
    let requirementSet: RequirementSetRow | null = null;

    if (projectId) {
      const safeFileName = file.name
        .replace(/[^a-zA-Z0-9._-]/g, "_")
        .slice(0, 120) || "technical-description.pdf";
      const storageBucket = "project-files";
      const storagePath = `${authorization.context.organization.id}/${projectId}/technical-description/${fileSha256}-${safeFileName}`;

      const existingProjectDocuments = await selectUserRows<ProjectDocumentRow>(
        "project_documents",
        {
          select: "id,upload_status,processing_status",
          organization_id: `eq.${authorization.context.organization.id}`,
          project_id: `eq.${projectId}`,
          checksum: `eq.${fileSha256}`,
          deleted_at: "is.null",
          limit: "1"
        }
      );

      projectDocument = existingProjectDocuments[0] ?? null;
      if (!projectDocument) {
        projectDocument = await insertUserRowReturning<ProjectDocumentRow>(
          "project_documents",
          {
            organization_id: authorization.context.organization.id,
            project_id: projectId,
            storage_bucket: storageBucket,
            storage_path: storagePath,
            file_name: file.name.slice(0, 255),
            original_filename: file.name.slice(0, 255),
            document_type: "technical_description",
            content_type: file.type || "application/pdf",
            mime_type: file.type || "application/pdf",
            size_bytes: file.size,
            file_size: file.size,
            checksum: fileSha256,
            file_sha256: fileSha256,
            upload_status: "uploading",
            processing_status: "extracting",
            status: "active",
            uploaded_by: authorization.user.id
          }
        );
        try {
          await uploadUserStorageObject(
            storageBucket,
            storagePath,
            buffer,
            file.type || "application/pdf"
          );
          projectDocument = await updateUserRowsReturning<ProjectDocumentRow>(
            "project_documents",
            {
              id: `eq.${projectDocument.id}`,
              organization_id: `eq.${authorization.context.organization.id}`
            },
            { upload_status: "uploaded", processing_status: status === "review_required" ? "requires_review" : "completed" }
          );
        } catch (uploadError) {
          await updateUserRowsReturning<ProjectDocumentRow>(
            "project_documents",
            {
              id: `eq.${projectDocument.id}`,
              organization_id: `eq.${authorization.context.organization.id}`
            },
            { upload_status: "failed", processing_status: "failed" }
          ).catch(() => undefined);
          throw uploadError;
        }
      }

      extractionRun = await insertUserRowReturning<ExtractionRunRow>(
        "extraction_runs",
        {
          organization_id: authorization.context.organization.id,
          project_id: projectId,
          document_id: projectDocument.id,
          status: status === "review_required" ? "requires_review" : "completed",
          extraction_provider: "flowx-technical-description-extractor",
          model_name: "deterministic-pdf-parser",
          model_version: "1",
          prompt_version: null,
          started_at: result.document.extractedAt,
          completed_at: result.document.extractedAt,
          raw_result: {
            document: result.document,
            project: result.project,
            standards: result.standards,
            warnings: result.warnings
          },
          created_by: authorization.user.id
        }
      );

      for (const page of result.pages) {
        await insertUserRowReturning("document_pages", {
          organization_id: authorization.context.organization.id,
          project_id: projectId,
          document_id: projectDocument.id,
          page_number: page.pageNumber,
          extracted_text: page.text,
          extraction_method: page.method,
          metadata: { confidence: page.confidence }
        });
      }
    }

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

    let persistedRequirementCount = 0;
    if (
      projectId &&
      authorization.context.permissions.includes("project.requirement.create")
    ) {
      const requirementSets = await selectUserRows<RequirementSetRow>(
        "requirement_sets",
        {
          select: "id,version,status",
          organization_id: `eq.${authorization.context.organization.id}`,
          project_id: `eq.${projectId}`,
          status: "eq.draft",
          order: "version.desc",
          limit: "1"
        }
      );
      requirementSet = requirementSets[0] ?? null;
      if (!requirementSet) {
        requirementSet = await insertUserRowReturning<RequirementSetRow>(
          "requirement_sets",
          {
            organization_id: authorization.context.organization.id,
            project_id: projectId,
            version: 1,
            status: "draft",
            created_by: authorization.user.id
          }
        );
      }

      for (const line of result.materialLines) {
        const candidate = await insertUserRowReturning<{ id: string }>(
          "requirement_candidates",
          {
            organization_id: authorization.context.organization.id,
            project_id: projectId,
            extraction_run_id: extractionRun?.id ?? null,
            document_id: projectDocument?.id ?? null,
            technical_description_document_id: document.id,
            page_number: line.sourcePage,
            raw_text: line.sourceText || line.description,
            requirement_category: line.category,
            attribute_key: line.nsCode ?? line.category,
            raw_value: line.description,
            normalized_value: {
              operation: line.operation,
              quantity: line.quantity ?? null,
              unit: line.unit ?? null,
              attributes: line.attributes,
              system: line.system ?? null,
              standardRefs: line.standardRefs
            },
            unit: line.unit ?? null,
            confidence: line.confidence,
            source_coordinates: [],
            status: line.reviewFlags.length ? "requires_review" : "extracted",
            created_by: authorization.user.id
          }
        );

        await insertUserRowReturning("project_requirements", {
          organization_id: authorization.context.organization.id,
          project_id: projectId,
          requirement_set_id: requirementSet.id,
          source_candidate_id: candidate.id,
          category: line.category,
          requirement_key: line.nsCode ?? line.category,
          attribute_key: line.nsCode ?? line.category,
          display_name: line.description,
          operator: "contains",
          value_type: "text",
          value_text: line.description,
          value_json: {
            operation: line.operation,
            quantity: line.quantity ?? null,
            unit: line.unit ?? null,
            attributes: line.attributes,
            system: line.system ?? null
          },
          certainty: "interpreted",
          confidence: line.confidence,
          verification_status: "unknown",
          is_mandatory: false,
          severity: "technical",
          requirement_type: "informational",
          status: line.reviewFlags.length
            ? "inferred_unreviewed"
            : "extracted_unreviewed",
          source_technical_description_document_id: document.id,
          source_page: line.sourcePage,
          source_excerpt: line.sourceText,
          created_by: authorization.user.id
        });
        persistedRequirementCount += 1;
      }
    }

    return NextResponse.json(
      {
        documentId: document.id,
        persistedLineCount: result.materialLines.length,
        persistedRequirementCount,
        ...result
      },
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
  console.error("Technical description extraction failed", {
    name: error instanceof Error ? error.name : "UnknownError",
    status: error instanceof UserSupabaseError ? error.status : undefined,
    code: error instanceof UserSupabaseError ? error.code : undefined
  });

  if (error instanceof UserSupabaseError) {
    const forbidden =
      error.status === 401 || error.status === 403 || error.code === "42501";
    return NextResponse.json(
      {
        error: forbidden
          ? "Åtgärden nekades av behörighetsreglerna."
          : "Tekniska beskrivningen kunde inte sparas.",
      },
      { status: forbidden ? 403 : 500 }
    );
  }

  if (error instanceof Error) {
    return NextResponse.json(
      { error: "Extraktionen av teknisk beskrivning misslyckades." },
      { status: 500 }
    );
  }

  return NextResponse.json(
    { error: "Extraktionen av teknisk beskrivning misslyckades." },
    { status: 500 }
  );
}
