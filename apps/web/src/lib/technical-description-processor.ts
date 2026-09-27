import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import * as userPersistence from "@/lib/supabase-user-rest";
import type { PermissionKey } from "@/lib/organization-rbac";
export type ImportAuthorization = { user: { id: string }; context: { organization: { id: string; name: string }; permissions: readonly PermissionKey[] } };
import { UserSupabaseError } from "@/lib/supabase-user-rest";
import type {
  TechnicalDescriptionMaterialLine
} from "@/modules/technical-description-extractor";
import { clientTechnicalDescriptionResult } from "@/lib/technical-description-client-result";
import { consumeRateLimit, requestRateLimitKey } from "@/lib/request-rate-limit";
import { hasPdfSignature } from "@/lib/pdf-security";
import { MAX_TECHNICAL_DESCRIPTION_BYTES } from "@/lib/technical-description-file";
import { StorageObjectTooLargeError } from "@/lib/supabase-admin-storage";
import {
  cleanupTechnicalDescriptionUpload,
  ownedTechnicalDescriptionUploadPath,
  readTechnicalDescriptionUpload,
  TechnicalDescriptionUploadError
} from "@/lib/technical-description-storage";
import {
  automaticProjectDetails,
  hasTechnicalDescriptionConflict,
  nextAvailableProjectNumber
} from "@/lib/technical-description-project";
import {
  ClientOcrPayloadError,
  mergeClientOcrPages,
  parseClientOcrPages
} from "@/lib/technical-description-ocr-payload";
import {
  isCompleteTechnicalDescription,
  persistenceKey,
  persistTechnicalDescriptionBatches,
  planTechnicalDescriptionRows
} from "@/lib/technical-description-persistence";



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
type ExistingSourceDocumentRow = {
  id: string;
  project_id: string | null;
};
type ExistingProjectSourceDocumentRow = {
  id: string;
  file_sha256: string | null;
};

export async function processTechnicalDescription(request: Request, authorization: ImportAuthorization, db = userPersistence,
  options: { preserveStaged?: boolean; createdProject?: boolean; onPhase?: (phase: string) => Promise<void> } = {}) {
  const { callUserRpc, insertUserRowReturning, selectAllUserRows, selectUserRows, updateUserRowsReturning, uploadUserStorageObject } = db;
  let stagedPath: string | undefined;
  let awaitingOcr = false;
  try {

    const formData = await request.formData();
    const clientResultOptions = { summaryOnly: formData.get("responseMode") === "summary" };
    const hasClientOcrPayload = formData.has("ocrPages");
    const limit = consumeRateLimit(
      requestRateLimitKey(
        request,
        hasClientOcrPayload
          ? "technical-description-ocr-retry"
          : "technical-description",
        authorization.user.id
      ),
      5,
      60_000
    );
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "För många tekniska beskrivningar på kort tid. Försök igen senare." },
        { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
      );
    }

    const uploadId = formData.get("uploadId");
    if (uploadId !== null && formData.has("file")) {
      return NextResponse.json({ error: "Velg én PDF-kilde." }, { status: 400 });
    }
    if (uploadId !== null) {
      stagedPath = ownedTechnicalDescriptionUploadPath({
        organizationId: authorization.context.organization.id,
        userId: authorization.user.id
      }, uploadId);
    }
    // Only the small reference crosses Vercel. Keep multipart files working
    // for existing clients while the new browser bundle rolls out.
    const file = stagedPath
      ? await readTechnicalDescriptionUpload(stagedPath, formData.get("fileName"))
      : formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json(
        { error: "En PDF-fil krävs för teknisk beskrivning." }, { status: 400 }
      );
    }
    if (file.type && file.type !== "application/pdf") {
      return NextResponse.json({ error: "Filen måste vara en PDF." }, { status: 400 });
    }
    if (file.size > MAX_TECHNICAL_DESCRIPTION_BYTES) {
      return NextResponse.json(
        { error: "PDF-filen får vara högst 30 MB." }, { status: 413 }
      );
    }

    // Keep the PDF/OCR dependencies out of the route's module initialization.
    // Some runtimes (including Vercel's serverless runtime) cannot initialize
    // those browser-oriented dependencies while loading the route. Loading
    // them only for an actual extraction keeps authentication and error
    // responses JSON instead of falling back to an HTML 500 page.
    const {
      extractTechnicalDescriptionFromPages,
      extractTechnicalDescriptionPages,
      pagesRequiringOcr
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
    const fileSha256 = createHash("sha256").update(buffer).digest("hex");
    const serverPages = await extractTechnicalDescriptionPages(buffer);
    let clientOcrPages;
    try {
      clientOcrPages = parseClientOcrPages(
        formData.get("ocrPages"),
        serverPages.length
      );
    } catch (error) {
      if (error instanceof ClientOcrPayloadError) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      throw error;
    }
    const pages = mergeClientOcrPages(serverPages, clientOcrPages);
    const unreadablePageNumbers = pagesRequiringOcr(pages);
    if (!clientOcrPages && unreadablePageNumbers.length > 0) {
      awaitingOcr = true;
      return NextResponse.json(
        {
          code: "OCR_REQUIRED",
          error:
            "Dokumentet innehåller skannade sidor. OCR startar automatiskt i webbläsaren.",
          pageCount: pages.length,
          pageNumbers: unreadablePageNumbers
        },
        { status: 422 }
      );
    }
    if (clientOcrPages && pages.every((page) => page.text.trim().length === 0)) {
      return NextResponse.json(
        {
          code: "OCR_FAILED",
          error:
            "OCR kunde inte läsa dokumentet. Kontrollera bildkvaliteten och försök igen."
        },
        { status: 422 }
      );
    }
    const result = extractTechnicalDescriptionFromPages(pages, {
      fileName: file.name
    });
    let createdProjectName: string | null = options.createdProject ? result.project.name ?? file.name.replace(/\.pdf$/i, "") : null;
    if (createdProjectName && projectId) {
      const details = automaticProjectDetails({extractedName:result.project.name,extractedProjectNumber:result.project.projectNumber,
        extractedStandards:result.standards,fileName:file.name});
      await updateUserRowsReturning("projects", {
        id: `eq.${projectId}`, organization_id: `eq.${authorization.context.organization.id}`
      }, { name: details.name, description:details.description,standard:details.standard,
        ...(details.projectNumber ? {project_number:`${details.projectNumber.slice(0,85)}-${projectId.slice(0,8)}`} : {}) });
    }
    await options.onPhase?.("persisting");
    let reusedExistingEmptyProject = false;
    if (!projectId) {
      const [existingSourceDocument] =
        await selectUserRows<ExistingSourceDocumentRow>(
          "technical_description_documents",
          {
            select: "id,project_id",
            organization_id: `eq.${authorization.context.organization.id}`,
            file_sha256: `eq.${fileSha256}`,
            project_id: "not.is.null",
            order: "created_at.desc",
            limit: "1"
          }
        );
      if (existingSourceDocument?.project_id) {
        const [existingProject] = await selectUserRows<ProjectRow>("projects", {
          select: "id,organization_id,name",
          id: `eq.${existingSourceDocument.project_id}`,
          organization_id: `eq.${authorization.context.organization.id}`,
          deleted_at: "is.null",
          limit: "1"
        });
        if (existingProject) {
          // A partial batch is not a completed import. Resume this project and
          // check the document's completion marker below before returning.
          projectId = existingProject.id;
          reusedExistingEmptyProject = true;
        }
      }

      if (!projectId) {
        const details = automaticProjectDetails({
          extractedName: result.project.name,
          extractedProjectNumber: result.project.projectNumber,
          extractedStandards: result.standards,
          fileName: file.name
        });
        const existingProjectNumbers = await selectUserRows<{
          project_number: string | null;
        }>("projects", {
          select: "project_number",
          organization_id: `eq.${authorization.context.organization.id}`,
          deleted_at: "is.null"
        });
        const availableProjectNumber = nextAvailableProjectNumber(
          details.projectNumber,
          existingProjectNumbers.map((project) => project.project_number)
        );
        const automaticProjectPayload = {
          requested_organization_id: authorization.context.organization.id,
          requested_project_number: availableProjectNumber,
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
        };
        let rpcResult: unknown;
        try {
          rpcResult = await callUserRpc<unknown>(
            "create_project_with_details",
            automaticProjectPayload
          );
        } catch (projectError) {
          if (
            !(projectError instanceof UserSupabaseError) ||
            projectError.code !== "23505" ||
            !details.projectNumber
          ) {
            throw projectError;
          }
          const collisionSafeNumber = `${details.projectNumber.slice(0, 93)}-${randomUUID().slice(0, 6)}`;
          rpcResult = await callUserRpc<unknown>("create_project_with_details", {
            ...automaticProjectPayload,
            requested_project_number: collisionSafeNumber
          });
        }
        projectId = rpcProjectId(rpcResult);
        if (!projectId) {
          throw new Error("Supabase returned no project id after automatic creation.");
        }
        createdProjectName = details.name;
      }
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
    const existingProjectSourceDocuments =
      await selectUserRows<ExistingProjectSourceDocumentRow>(
        "technical_description_documents",
        {
          select: "id,file_sha256",
          organization_id: `eq.${authorization.context.organization.id}`,
          project_id: `eq.${projectId}`
        }
      );
    if (
      hasTechnicalDescriptionConflict(
        existingProjectSourceDocuments.map((item) => item.file_sha256),
        fileSha256
      )
    ) {
      return NextResponse.json(
        {
          error:
            "Projektet har redan en teknisk beskrivning. Starta en ny analys för att ladda upp en annan PDF."
        },
        { status: 409 }
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
          selectAllUserRows<{ id: string }>("technical_description_material_lines", {
            select: "id",
            organization_id: `eq.${authorization.context.organization.id}`,
            document_id: `eq.${document.id}`,
            order: "id.asc"
          }),
          selectAllUserRows<{ id: string }>("project_requirements", {
            select: "id",
            organization_id: `eq.${authorization.context.organization.id}`,
            project_id: `eq.${projectId}`,
            source_technical_description_document_id: `eq.${document.id}`,
            deleted_at: "is.null",
            order: "id.asc"
          })
        ]);
        if (isCompleteTechnicalDescription(
          projectDocument!.processing_status,
          persistedLines.length,
          persistedRequirements.length,
          result.materialLines.length,
          authorization.context.permissions.includes("project.requirement.create")
        )) {
          return NextResponse.json({
            projectId,
            projectName: projects[0].name,
            documentId: document.id,
            persistedLineCount: persistedLines.length,
            persistedRequirementCount: persistedRequirements.length,
            duplicate: true,
            ...clientTechnicalDescriptionResult(result, clientResultOptions)
          });
        }
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
              organization_id: `eq.${authorization.context.organization.id}`, project_id: `eq.${projectId}`
            },
            { upload_status: "uploaded", processing_status: "extracting" }
          );
        } catch (uploadError) {
          await updateUserRowsReturning<ProjectDocumentRow>(
            "project_documents",
            {
              id: `eq.${projectDocument.id}`,
              organization_id: `eq.${authorization.context.organization.id}`, project_id: `eq.${projectId}`
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
      const extractionRunPayload = {
        organization_id: authorization.context.organization.id,
        project_id: projectId,
        document_id: projectDocument.id,
        status: "running",
        extraction_provider: "flowx-technical-description-extractor",
        model_name:
          result.document.extractionMethod === "text"
            ? "deterministic-pdf-parser"
            : "browser-tesseract+deterministic-pdf-parser",
        model_version: result.document.extractionMethod === "text" ? "1" : "2",
        prompt_version: null,
        started_at: result.document.extractedAt,
        completed_at: null,
        raw_result: {
          document: result.document,
          project: result.project,
          standards: result.standards,
          warnings: result.warnings
        },
        created_by: authorization.user.id
      };
      extractionRun = existingExtractionRun
        ? await updateUserRowsReturning<ExtractionRunRow>(
            "extraction_runs",
            {
              id: `eq.${existingExtractionRun.id}`,
              organization_id: `eq.${authorization.context.organization.id}`,
              project_id: `eq.${projectId}`
            },
            extractionRunPayload
          )
        : await insertUserRowReturning<ExtractionRunRow>(
            "extraction_runs",
            extractionRunPayload
          );

      const existingPages = await selectAllUserRows<{
        id: string;
        page_number: number;
        extracted_text: string;
        extraction_method: string;
        metadata: unknown;
      }>(
        "document_pages",
        {
          select: "id,page_number,extracted_text,extraction_method,metadata",
          organization_id: `eq.${authorization.context.organization.id}`,
          project_id: `eq.${projectId}`,
          document_id: `eq.${projectDocument.id}`,
          order: "page_number.asc,id.asc"
        }
      );
      const existingPageNumbers = new Set(
        existingPages.map((page) => page.page_number)
      );
      const existingPageByNumber = new Map(
        existingPages.map((page) => [page.page_number, page] as const)
      );
      const projectDocumentId = projectDocument.id;
      const pageMetadata = (page: typeof result.pages[number]) => ({
        confidence: page.confidence,
        annotations: page.annotations ?? [],
        annotation_read_failed: page.annotationReadFailed ?? false
      });
      const changedPages = result.pages.filter(page => {
        const previous = existingPageByNumber.get(page.pageNumber);
        return previous && (previous.extracted_text !== page.text
          || previous.extraction_method !== page.method
          || persistenceKey(previous.metadata) !== persistenceKey(pageMetadata(page)));
      });
      for (let offset = 0; offset < changedPages.length; offset += 4) {
        await Promise.all(changedPages.slice(offset, offset + 4).map(page =>
          updateUserRowsReturning<{ id: string }>(
              "document_pages",
              {
                id: `eq.${existingPageByNumber.get(page.pageNumber)?.id}`,
                organization_id: `eq.${authorization.context.organization.id}`,
                project_id: `eq.${projectId}`,
                document_id: `eq.${projectDocumentId}`
              },
              {
                extracted_text: page.text,
                extraction_method: page.method,
                metadata: pageMetadata(page)
              }
            )
          ));
      }
      await persistRows(db,
        "document_pages",
        { organization_id: `eq.${authorization.context.organization.id}`, project_id: `eq.${projectId}`, document_id: `eq.${projectDocumentId}` },
        "page_number",
        row => row.page_number,
        result.pages
          .filter((page) => !existingPageNumbers.has(page.pageNumber))
          .map((page) => ({
            organization_id: authorization.context.organization.id,
            project_id: projectId,
            document_id: projectDocumentId,
            page_number: page.pageNumber,
            extracted_text: page.text,
            extraction_method: page.method,
            metadata: pageMetadata(page)
          }))
      );
    }

    const documentScope = {
      organization_id: `eq.${authorization.context.organization.id}`,
      document_id: `eq.${document.id}`
    };
    await persistRows(db,
      "technical_description_material_lines",
      documentScope,
      "source_page,post_number,ns_code,source_text",
      row => [row.source_page, row.post_number, row.ns_code, row.source_text],
      result.materialLines.map((line) =>
        materialLinePayload(
          line,
          authorization.context.organization.id,
          document.id,
          authorization.user.id
        )
      )
    );

    await persistRows(db,
      "technical_description_rule_hints",
      documentScope,
      "rule_key,rule_value,source_page,source_text",
      row => [row.rule_key, row.rule_value, row.source_page, row.source_text],
      result.ruleHints.map((hint) => ({
        organization_id: authorization.context.organization.id,
        document_id: document.id,
        rule_key: hint.key,
        rule_value: hint.value,
        source_page: hint.sourcePage,
        source_text: hint.sourceText,
        confidence: hint.confidence
      }))
    );

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

      const requirementSetId = requirementSet.id;
      const candidatePayloads = result.materialLines.map((line) => ({
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
          sourceChapter: line.sourceChapter ?? null,
          sourcePages: line.sourcePages ?? [line.sourcePage],
          postNumber: line.postNumber ?? null,
          postScope: line.postScope ?? null,
          parentPostNumber: line.parentPostNumber ?? null,
          parentDescription: line.parentDescription ?? null,
          attributeSources: line.attributeSources ?? {},
          nsCode: line.nsCode ?? null,
          operation: line.operation,
          quantity: line.quantity ?? null,
          quantityText: line.quantityText ?? null,
          unit: line.unit ?? null,
          attributes: line.attributes,
          system: line.system ?? null,
          standardRefs: line.standardRefs,
          reviewFlags: line.reviewFlags,
          technicalSpecification: line.technicalSpecification ?? line.sourceText
        },
        unit: line.unit ?? null,
        confidence: line.confidence,
        source_coordinates: [],
        status: line.reviewFlags.length ? "requires_review" : "extracted",
        created_by: authorization.user.id
      }));
      const savedCandidates = await persistRows(db, "requirement_candidates", {
        organization_id: `eq.${authorization.context.organization.id}`,
        project_id: `eq.${projectId}`,
        technical_description_document_id: `eq.${document.id}`
      }, "page_number,raw_text", row => [row.page_number, row.raw_text], candidatePayloads);

      await persistRows(db,
        "project_requirements",
        {
          organization_id: `eq.${authorization.context.organization.id}`,
          project_id: `eq.${projectId}`,
          source_technical_description_document_id: `eq.${document.id}`
        },
        "source_page,source_excerpt",
        row => [row.source_page, row.source_excerpt],
        result.materialLines.map((line, index) => ({
          organization_id: authorization.context.organization.id,
          project_id: projectId,
          requirement_set_id: requirementSetId,
          source_candidate_id: savedCandidates[index].id,
          category: line.category,
          requirement_key: line.nsCode ?? line.category,
          attribute_key: line.nsCode ?? line.category,
          display_name: line.description,
          operator: "contains",
          value_type: "text",
          value_text: line.description,
          value_json: {
            extractionVersion: 1,
            sourceText: line.sourceText,
            sourceChapter: line.sourceChapter ?? null,
            sourcePages: line.sourcePages ?? [line.sourcePage],
            postNumber: line.postNumber ?? null,
            postScope: line.postScope ?? null,
            parentPostNumber: line.parentPostNumber ?? null,
          parentDescription: line.parentDescription ?? null,
          attributeSources: line.attributeSources ?? {},
            nsCode: line.nsCode ?? null,
            operation: line.operation,
            quantity: line.quantity ?? null,
            quantityText: line.quantityText ?? null,
            unit: line.unit ?? null,
            attributes: line.attributes,
            system: line.system ?? null,
            standardRefs: line.standardRefs,
            reviewFlags: line.reviewFlags,
            technicalSpecification: line.technicalSpecification ?? line.sourceText
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
          source_document_id: projectDocument?.id ?? null,
          source_technical_description_document_id: document.id,
          source_page: line.sourcePage,
          source_excerpt: line.sourceText,
          created_by: authorization.user.id
        }))
      );
      persistedRequirementCount = result.materialLines.length;
    }

    await options.onPhase?.("finalizing");
    if (extractionRun) await updateUserRowsReturning("extraction_runs", {
      id: `eq.${extractionRun.id}`, organization_id: `eq.${authorization.context.organization.id}`, project_id: `eq.${projectId}`
    }, { status: status === "review_required" ? "requires_review" : "completed", completed_at: new Date().toISOString() });
    if (projectDocument) {
      await updateUserRowsReturning<ProjectDocumentRow>(
        "project_documents",
        {
          id: `eq.${projectDocument.id}`,
          organization_id: `eq.${authorization.context.organization.id}`, project_id: `eq.${projectId}`
        },
        {
          upload_status: "uploaded",
          processing_status:
            status === "review_required" ? "requires_review" : "completed"
        }
      );
    }

    if (createdProjectName || reusedExistingEmptyProject) {
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
        reusedExistingProject: reusedExistingEmptyProject,
        documentId: document.id,
        persistedLineCount: result.materialLines.length,
        persistedRequirementCount,
        ...clientTechnicalDescriptionResult(result, clientResultOptions)
      },
      { status: 201 }
    );
  } catch (error) {
    return technicalDescriptionErrorResponse(error);
  } finally {
    if (stagedPath && !awaitingOcr && !options.preserveStaged) await cleanupTechnicalDescriptionUpload(stagedPath);
  }
}

async function persistRows<T extends Record<string, unknown>>(
  db: typeof userPersistence,
  table: string,
  scope: Record<string, string>,
  identityColumns: string,
  key: (row: Record<string, unknown>) => unknown,
  payloads: T[]
) {
  if (!payloads.length) return [] as Array<T & { id: string }>;
  try {
    const existing = await db.selectAllUserRows<Record<string, unknown> & { id: string }>(table, {
      ...scope, select: `id,${identityColumns}`, order: "created_at.asc,id.asc"
    });
    const plan = planTechnicalDescriptionRows(`${table}|${persistenceKey(scope)}`, payloads, existing, key);
    await persistTechnicalDescriptionBatches(plan.missing, batch =>
      db.insertUserRows(table, batch, { ignoreIdConflicts: true }));
    return plan.rows;
  } catch (error) {
    console.error("Technical description persistence failed", {
      table, rowCount: payloads.length,
      status: error instanceof UserSupabaseError ? error.status : undefined,
      code: error instanceof UserSupabaseError ? error.code : undefined
    });
    throw error;
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
  if (error instanceof StorageObjectTooLargeError) {
    return NextResponse.json(
      { error: "PDF-filen får vara högst 30 MB." }, { status: 413 }
    );
  }
  if (error instanceof TechnicalDescriptionUploadError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  console.error("Technical description extraction failed", {
    name: error instanceof Error ? error.name : "UnknownError",
    status: error instanceof UserSupabaseError ? error.status : undefined,
    code: error instanceof UserSupabaseError ? error.code : undefined,
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
