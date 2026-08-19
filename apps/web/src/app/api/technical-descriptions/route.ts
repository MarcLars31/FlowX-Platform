import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { requireOrganizationApi } from "@/lib/organization-api-authorization";
import {
  callUserRpc,
  insertUserRowReturning,
  selectUserRows,
  updateUserRowsReturning,
  uploadUserStorageObject,
  UserSupabaseError
} from "@/lib/supabase-user-rest";
import type { TechnicalDescriptionMaterialLine } from "@/modules/technical-description-extractor";
import { consumeRateLimit, requestRateLimitKey } from "@/lib/request-rate-limit";
import { hasPdfSignature } from "@/lib/pdf-security";
import { automaticProjectDetails } from "@/lib/technical-description-project";

export const runtime = "nodejs";

const MAX_PDF_BYTES = 30 * 1024 * 1024;

type ProjectRow = { id: string; organization_id: string; name: string };
type ProjectModuleRow = { id: string; project_id: string; module_code: string };
type DocumentRow = { id: string; status: string };
type ProjectDocumentRow = {
  id: string;
  upload_status: string;
  processing_status: string;
};
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
    let projectId =
      typeof projectIdValue === "string" && projectIdValue.trim()
        ? projectIdValue.trim()
        : null;
    const createProject = formData.get("createProject") === "true";
    if (!projectId && !createProject) {
      return NextResponse.json(
        { error: "Projekt-id saknas och automatisk projektskapning är inte begärd." },
        { status: 400 }
      );
    }
    if (projectId && !isUuid(projectId)) {
      return NextResponse.json({ error: "Ogiltigt projekt-id." }, { status: 400 });
    }
    if (
      !projectId &&
      !authorization.context.permissions.includes("project.create")
    ) {
      return NextResponse.json(
        { error: "Du saknar behörighet att skapa projekt." },
        { status: 403 }
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
    let createdProjectName: string | null = null;
    if (!projectId) {
      const details = automaticProjectDetails({
        extractedName: result.project.name,
        extractedProjectNumber: result.project.projectNumber,
        extractedStandards: result.standards,
        fileName: file.name
      });
      const rpcResult = await callUserRpc<unknown>("create_project_with_details", {
        requested_organization_id: authorization.context.organization.id,
        requested_project_number: details.projectNumber,
        requested_name: details.name,
        requested_description: details.description,
        requested_customer_name: authorization.context.organization.name,
        requested_project_type: "Teknisk beskrivningsanalys",
        requested_country_code: "Sweden",
        requested_language_code: "sv",
        requested_currency_code: "SEK",
        requested_owner_user_id: authorization.user.id,
        requested_module_code: "sprinkler",
        requested_standard: details.standard,
        requested_system_type: details.systemType,
        requested_supplier: null,
        requested_delivery_country: "Sweden",
        requested_access_level: "own",
        requested_team_id: null,
        requested_details: {
          procurement_strategy: "Ahlsell specialist selection",
          preferred_distributor: "Ahlsell",
          source_file_name: file.name.slice(0, 255),
          automatically_created: true
        }
      });
      projectId = rpcProjectId(rpcResult);
      if (!projectId) {
        throw new Error("Supabase returned no project id after automatic creation.");
      }
      createdProjectName = details.name;
    }

    const projects = await selectUserRows<ProjectRow>("projects", {
      select: "id,organization_id,name",
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
    const fileSha256 = createHash("sha256").update(buffer).digest("hex");
    const status = result.warnings.some((warning) => warning.severity === "warning")
      ? "review_required"
      : "extracted";

    const technicalDocumentPayload = {
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
    };
    const [existingTechnicalDocument] = await selectUserRows<DocumentRow>(
      "technical_description_documents",
      {
        select: "id,status",
        organization_id: `eq.${authorization.context.organization.id}`,
        project_id: `eq.${projectId}`,
        file_sha256: `eq.${fileSha256}`,
        order: "created_at.desc",
        limit: "1"
      }
    );
    const document = existingTechnicalDocument
      ? await updateUserRowsReturning<DocumentRow>(
          "technical_description_documents",
          {
            id: `eq.${existingTechnicalDocument.id}`,
            organization_id: `eq.${authorization.context.organization.id}`,
            project_id: `eq.${projectId}`
          },
          technicalDocumentPayload
        )
      : await insertUserRowReturning<DocumentRow>(
          "technical_description_documents",
          technicalDocumentPayload
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
      const alreadyProcessed =
        projectDocument?.upload_status === "uploaded" &&
        ["completed", "requires_review"].includes(
          projectDocument.processing_status
        );

      if (alreadyProcessed) {
        const [persistedLines, persistedRequirements] = await Promise.all([
          selectUserRows<{ id: string }>("technical_description_material_lines", {
            select: "id",
            document_id: `eq.${document.id}`
          }),
          selectUserRows<{ id: string }>("project_requirements", {
            select: "id",
            project_id: `eq.${projectId}`,
            source_technical_description_document_id: `eq.${document.id}`,
            deleted_at: "is.null"
          })
        ]);
        return NextResponse.json({
          projectId,
          projectName: projects[0].name,
          documentId: document.id,
          persistedLineCount: persistedLines.length,
          persistedRequirementCount: persistedRequirements.length,
          duplicate: true,
          ...result
        });
      }

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
      }

      if (projectDocument.upload_status !== "uploaded") {
        try {
          await uploadUserStorageObject(
            storageBucket,
            storagePath,
            buffer,
            file.type || "application/pdf",
            { upsert: true }
          );
          projectDocument = await updateUserRowsReturning<ProjectDocumentRow>(
            "project_documents",
            {
              id: `eq.${projectDocument.id}`,
              organization_id: `eq.${authorization.context.organization.id}`
            },
            { upload_status: "uploaded", processing_status: "extracting" }
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

      const [existingExtractionRun] = await selectUserRows<ExtractionRunRow>(
        "extraction_runs",
        {
          select: "id",
          organization_id: `eq.${authorization.context.organization.id}`,
          project_id: `eq.${projectId}`,
          document_id: `eq.${projectDocument.id}`,
          order: "created_at.desc",
          limit: "1"
        }
      );
      extractionRun = existingExtractionRun ??
        await insertUserRowReturning<ExtractionRunRow>("extraction_runs", {
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
        });

      const existingPages = await selectUserRows<{ page_number: number }>(
        "document_pages",
        {
          select: "page_number",
          organization_id: `eq.${authorization.context.organization.id}`,
          project_id: `eq.${projectId}`,
          document_id: `eq.${projectDocument.id}`
        }
      );
      const existingPageNumbers = new Set(
        existingPages.map((page) => page.page_number)
      );
      for (const page of result.pages) {
        if (existingPageNumbers.has(page.pageNumber)) continue;
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

    if (projectDocument) {
      await updateUserRowsReturning<ProjectDocumentRow>(
        "project_documents",
        {
          id: `eq.${projectDocument.id}`,
          organization_id: `eq.${authorization.context.organization.id}`
        },
        {
          upload_status: "uploaded",
          processing_status:
            status === "review_required" ? "requires_review" : "completed"
        }
      );
    }

    if (createdProjectName) {
      await updateUserRowsReturning<ProjectRow>(
        "projects",
        {
          id: `eq.${projectId}`,
          organization_id: `eq.${authorization.context.organization.id}`
        },
        {
          status: "analysis",
          current_stage: persistedRequirementCount > 0
            ? "product_matching"
            : "documents"
        }
      );
    }

    return NextResponse.json(
      {
        projectId,
        projectName: projects[0].name,
        projectCreated: Boolean(createdProjectName),
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

function rpcProjectId(value: unknown) {
  if (typeof value === "string" && isUuid(value)) return value;
  if (
    value &&
    typeof value === "object" &&
    "id" in value &&
    typeof value.id === "string" &&
    isUuid(value.id)
  ) {
    return value.id;
  }
  return null;
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
