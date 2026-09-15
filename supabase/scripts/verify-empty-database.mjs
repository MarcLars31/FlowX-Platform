import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const supabaseDirectory = join(scriptDirectory, "..");
const migrationsDirectory = join(supabaseDirectory, "migrations");
const seedDirectory = join(supabaseDirectory, "seed");

const bootstrapSql = String.raw`
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;

  create schema auth;
  create schema storage;

  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text,
    raw_user_meta_data jsonb not null default '{}'::jsonb,
    raw_app_meta_data jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );

  create or replace function auth.uid()
  returns uuid
  language sql
  stable
  as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;

  create or replace function auth.jwt()
  returns jsonb
  language sql
  stable
  as $$
    select coalesce(
      nullif(current_setting('request.jwt.claims', true), '')::jsonb,
      '{}'::jsonb
    )
  $$;

  create table storage.buckets (
    id text primary key,
    name text not null unique,
    public boolean not null default false,
    file_size_limit bigint,
    allowed_mime_types text[],
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );

  create table storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text references storage.buckets(id) on delete cascade,
    name text not null,
    owner uuid,
    metadata jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (bucket_id, name)
  );

  create or replace function storage.foldername(name text)
  returns text[]
  language sql
  immutable
  as $$
    select case
      when strpos(name, '/') = 0 then array[]::text[]
      else string_to_array(regexp_replace(name, '/[^/]*$', ''), '/')
    end
  $$;
`;

const expectedTables = [
  "organizations",
  "organization_members",
  "projects",
  "project_documents",
  "project_requirements",
  "products",
  "product_variants",
  "attribute_definitions",
  "product_attribute_values",
  "match_runs",
  "match_candidates",
  "material_lists",
  "supplier_offers",
  "project_systems",
  "project_buildings",
  "project_floors",
  "project_zones",
  "project_positions",
  "data_sources",
  "data_sets",
  "import_jobs",
  "product_families",
  "price_lists",
  "matching_decisions",
  "product_learning_events",
];

const database = new PGlite({ extensions: { pgcrypto } });

async function expectDatabaseRejection(label, sql) {
  try {
    await database.exec(sql);
  } catch {
    process.stdout.write(`PASS invariant ${label}\n`);
    return;
  }
  throw new Error(`Database invariant did not reject: ${label}`);
}

try {
  await database.exec(bootstrapSql);

  const migrationFiles = (await readdir(migrationsDirectory))
    .filter((name) => name.endsWith(".sql"))
    .sort((left, right) => left.localeCompare(right));

  for (const migrationFile of migrationFiles) {
    const sql = await readFile(join(migrationsDirectory, migrationFile), "utf8");
    try {
      await database.exec(sql);
      process.stdout.write(`PASS ${migrationFile}\n`);
    } catch (error) {
      process.stderr.write(`FAIL ${migrationFile}\n${error.message}\n`);
      process.exitCode = 1;
      throw error;
    }
  }

  const rows = await database.query(`
    select table_name
    from information_schema.tables
    where table_schema = 'public'
  `);
  const actualTables = new Set(rows.rows.map((row) => row.table_name));
  const missingTables = expectedTables.filter((table) => !actualTables.has(table));

  if (missingTables.length > 0) {
    throw new Error(`Expected tables missing after migration: ${missingTables.join(", ")}`);
  }

  const seedFiles = (await readdir(seedDirectory))
    .filter((name) => name.endsWith(".sql"))
    .sort((left, right) => left.localeCompare(right));

  // Run the seed twice to prove that it is idempotent.
  for (let pass = 1; pass <= 2; pass += 1) {
    for (const seedFile of seedFiles) {
      const sql = await readFile(join(seedDirectory, seedFile), "utf8");
      try {
        await database.exec(sql);
        process.stdout.write(`PASS seed ${seedFile} (run ${pass})\n`);
      } catch (error) {
        process.stderr.write(`FAIL seed ${seedFile} (run ${pass})\n${error.message}\n`);
        process.exitCode = 1;
        throw error;
      }
    }
  }

  const demoRows = await database.query(`
    select
      dataset.disclaimer,
      (select count(*)::integer from public.products product
       where product.data_set_id = dataset.id) as product_count,
      (select count(*)::integer from public.products product
       where product.data_set_id = dataset.id
         and product.product_type = 'sprinkler_head') as sprinkler_count,
      (select count(distinct attribute_value.value_number)::integer
       from public.product_attribute_values attribute_value
       join public.product_variants variant on variant.id = attribute_value.product_variant_id
       join public.products product on product.id = variant.product_id
       where product.data_set_id = dataset.id
         and product.product_type = 'sprinkler_head'
         and attribute_value.attribute_definition_id =
           'd0000000-0000-4000-8000-000000000070') as k_factor_count,
      (select count(*)::integer from public.approvals approval
       where approval.data_set_id = dataset.id) as approval_count,
      (select count(*)::integer from public.flowx_product_search search_product
       where search_product.source = 'flowx'
         and search_product.is_demo
         and search_product.type = 'sprinkler_head') as searchable_sprinkler_count,
      (select count(*)::integer from public.products product
       where product.data_set_id = dataset.id
         and product.product_type = 'sprinkler_head'
         and not exists (
           select 1 from public.product_approvals product_approval
           where product_approval.product_id = product.id
             and product_approval.deleted_at is null
         )) as sprinklers_without_approval,
      (select count(*)::integer from public.projects project
       where project.demo_data_set_id = dataset.id) as project_count,
      (select count(*)::integer
       from public.project_documents document
       join public.projects project on project.id = document.project_id
       where project.demo_data_set_id = dataset.id) as document_count
    from public.data_sets dataset
    where dataset.id = 'd0000000-0000-4000-8000-000000000002'
  `);
  const demo = demoRows.rows[0];
  if (
    !demo
    || demo.disclaimer !== "Demo data – ej verifierad för projektering, installation eller inköp."
    || demo.product_count !== 51
    || demo.sprinkler_count !== 50
    || demo.k_factor_count !== 10
    || demo.approval_count !== 5
    || demo.searchable_sprinkler_count !== 50
    || demo.sprinklers_without_approval !== 0
    || demo.project_count !== 1
    || demo.document_count !== 1
  ) {
    throw new Error("Demo seed provenance or idempotency verification failed.");
  }
  process.stdout.write(
    "PASS demo catalog contains 50 sprinkler heads, 10 K-factors, and 5 fictional approval types\n",
  );

  await database.exec(`
    do $verification$
    declare
      target_requirement public.project_requirements%rowtype;
      verification_time timestamptz := now();
    begin
      select * into target_requirement
      from public.project_requirements
      order by created_at, id
      limit 1;
      if not found then
        raise exception 'A seeded requirement is needed to verify learning feedback.';
      end if;

      delete from public.product_learning_events
      where requirement_id = target_requirement.id;

      insert into public.product_learning_events (
        organization_id, project_id, requirement_id, event_type,
        requirement_snapshot, candidate_snapshot, event_key, occurred_at
      ) values (
        target_requirement.organization_id,
        target_requirement.project_id,
        target_requirement.id,
        'not_in_assortment',
        jsonb_build_object('verificationCase', 'latest-label'),
        '[{"articleNumber":"A","rank":1},{"articleNumber":"B","rank":2}]'::jsonb,
        'verification:not-in-assortment',
        verification_time
      );

      insert into public.product_learning_events (
        organization_id, project_id, requirement_id, event_type,
        requirement_snapshot, candidate_snapshot, selected_product,
        event_key, occurred_at
      ) values (
        target_requirement.organization_id,
        target_requirement.project_id,
        target_requirement.id,
        'product_selected',
        jsonb_build_object('verificationCase', 'latest-label'),
        '[{"articleNumber":"A","rank":1},{"articleNumber":"B","rank":2}]'::jsonb,
        '{"articleNumber":"B"}'::jsonb,
        'verification:selected',
        verification_time + interval '1 second'
      );

      -- Clearing an earlier assortment marker happens after product approval.
      -- It must not erase the newly confirmed product training example.
      insert into public.product_learning_events (
        organization_id, project_id, requirement_id, event_type,
        requirement_snapshot, event_key, occurred_at
      ) values (
        target_requirement.organization_id,
        target_requirement.project_id,
        target_requirement.id,
        'resolution_cleared',
        jsonb_build_object('verificationCase', 'latest-label'),
        'verification:resolution-cleared',
        verification_time + interval '2 seconds'
      );
    end
    $verification$;
  `);

  const learningRows = await database.query(`
    select
      count(*)::integer as candidate_count,
      count(*) filter (where is_positive)::integer as positive_count,
      count(*) filter (where outcome = 'not_in_assortment')::integer
        as assortment_negative_count
    from public.product_candidate_training_examples
    where requirement_snapshot ->> 'verificationCase' = 'latest-label'
  `);
  const learning = learningRows.rows[0];
  if (
    !learning
    || learning.candidate_count !== 2
    || learning.positive_count !== 1
    || learning.assortment_negative_count !== 0
  ) {
    throw new Error("Latest product-learning feedback did not produce a clean label set.");
  }
  process.stdout.write(
    "PASS product-learning feedback keeps one current positive label and supersedes stale assortment feedback\n",
  );

  const canonicalRoles = await database.query(`
    select role.slug, count(role_permission.permission_id)::integer as permission_count
    from public.roles role
    left join public.role_permissions role_permission on role_permission.role_id = role.id
    where role.slug in ('company_admin', 'project_manager', 'engineer', 'viewer')
      and role.organization_id is null
    group by role.slug
  `);
  if (
    canonicalRoles.rows.length !== 4
    || canonicalRoles.rows.some((role) => role.permission_count < 1)
  ) {
    throw new Error("Canonical FlowX roles or inherited permissions are missing.");
  }

  await database.exec(`
    insert into auth.users (id, email)
    values
      ('d0000000-0000-4000-8000-000000000201', 'phase-one-admin@example.test'),
      ('d0000000-0000-4000-8000-000000000202', 'phase-one-member@example.test');

    insert into public.organization_subscriptions (
      organization_id, plan_key, status
    ) values (
      'd0000000-0000-4000-8000-000000000003', 'verification', 'active'
    ) on conflict (organization_id) do update
      set plan_key = excluded.plan_key,
          status = excluded.status;

    insert into public.organization_seat_limits (
      organization_id, seat_type, seat_limit
    ) values
      ('d0000000-0000-4000-8000-000000000003', 'admin', 5),
      ('d0000000-0000-4000-8000-000000000003', 'full_user', 5),
      ('d0000000-0000-4000-8000-000000000003', 'mini_user', 5),
      ('d0000000-0000-4000-8000-000000000003', 'read_only', 5)
    on conflict (organization_id, seat_type) do update
      set seat_limit = excluded.seat_limit;

    insert into public.organization_members (
      organization_id, user_id, role_id, status, joined_at
    ) values (
      'd0000000-0000-4000-8000-000000000003',
      'd0000000-0000-4000-8000-000000000201',
      '00000000-0000-4000-8000-000000000006',
      'active',
      now()
    );

    select set_config(
      'request.jwt.claim.sub',
      'd0000000-0000-4000-8000-000000000201',
      false
    );

    select public.create_organization_invitation(
      'd0000000-0000-4000-8000-000000000003',
      'invited-project-manager@example.test',
      'project_manager',
      repeat('a', 64),
      now() + interval '1 day'
    );

    select public.create_project_with_details(
      requested_organization_id := 'd0000000-0000-4000-8000-000000000003',
      requested_project_number := 'EMPTY-DB-RPC-001',
      requested_name := 'Empty database RPC verification',
      requested_details := jsonb_build_object(
        'end_customer', 'Fixture end customer',
        'address', 'Fixture street 1',
        'procurement_strategy', 'verified alternatives',
        'technical_parameters', jsonb_build_object('hazard', 'OH1')
      )
    );
  `);

  const invitationRole = await database.query(`
    select role.slug
    from public.organization_invitations invitation
    join public.roles role on role.id = invitation.role_id
    where invitation.email = 'invited-project-manager@example.test'
  `);
  if (invitationRole.rows[0]?.slug !== "project_manager") {
    throw new Error("A company_admin could not invite a canonical project_manager.");
  }

  const createdProject = await database.query(`
    select
      project.id,
      project.address,
      project.end_customer,
      project.technical_parameters,
      (select count(*)::integer from public.project_settings settings
       where settings.project_id = project.id) as settings_count,
      (select count(*)::integer from public.project_modules module
       where module.project_id = project.id and module.module_code = 'sprinkler') as module_count,
      (select count(*)::integer from public.project_members member
       where member.project_id = project.id
         and member.user_id = 'd0000000-0000-4000-8000-000000000201') as owner_count
    from public.projects project
    where project.organization_id = 'd0000000-0000-4000-8000-000000000003'
      and project.project_number = 'EMPTY-DB-RPC-001'
  `);
  const project = createdProject.rows[0];
  if (
    !project
    || project.address !== "Fixture street 1"
    || project.end_customer !== "Fixture end customer"
    || project.technical_parameters?.hazard !== "OH1"
    || project.settings_count !== 1
    || project.module_count !== 1
    || project.owner_count !== 1
  ) {
    throw new Error("Atomic project creation did not persist exactly one complete project graph.");
  }
  process.stdout.write("PASS atomic project creation persists one complete project graph\n");

  await database.exec(`
    insert into public.project_requirements (
      id,
      organization_id,
      project_id,
      category,
      requirement_key,
      value_text,
      value_json,
      status,
      created_by
    )
    select
      'd0000000-0000-4000-8000-000000000203',
      project.organization_id,
      project.id,
      'sprinkler_head',
      'manual-product-verification',
      'Manual product verification requirement',
      '{"operation":"install"}'::jsonb,
      'extracted_unreviewed',
      'd0000000-0000-4000-8000-000000000201'
    from public.projects project
    where project.organization_id = 'd0000000-0000-4000-8000-000000000003'
      and project.project_number = 'EMPTY-DB-RPC-001';

    select public.approve_distributor_product_mapping_v2(
      requested_project_id := '${project.id}',
      requested_requirement_id := 'd0000000-0000-4000-8000-000000000203',
      requested_user_approved := true,
      requested_product_name := 'Manuellt verifierad sprinkler',
      requested_product_number := '9254043',
      requested_manufacturer_name := 'Victaulic',
      requested_entry_method := 'manual',
      requested_product_subtitle := '1/2 tum V2704 sprinklerhuvud',
      requested_manufacturer_article_number := 'V2704-QR',
      requested_delivery_time_days := 5,
      requested_unit_price := 1250.50,
      requested_currency := 'NOK'
    );
  `);

  const manualProductRows = await database.query(`
    select product_snapshot
    from public.project_product_suggestions
    where requirement_id = 'd0000000-0000-4000-8000-000000000203'
      and status = 'selected'
  `);
  const manualProduct = manualProductRows.rows[0]?.product_snapshot;
  if (
    manualProductRows.rows.length !== 1
    || !manualProduct
    || manualProduct.productNumber !== "9254043"
    || manualProduct.entryMethod !== "manual"
    || manualProduct.manufacturerArticleNumber !== "V2704-QR"
    || manualProduct.manufacturer !== "Victaulic"
    || manualProduct.deliveryTimeDays !== 5
    || Number(manualProduct.unitPrice) !== 1250.5
    || manualProduct.currency !== "NOK"
    || manualProduct.approvedByUser !== true
  ) {
    throw new Error("Manual product approval did not persist the complete product card atomically.");
  }
  process.stdout.write("PASS manual product approval persists NRF, article, manufacturer, lead time and price atomically\n");

  const manualApprovalPrivileges = await database.query(`
    select has_function_privilege(
      'authenticated',
      'public.approve_distributor_product_mapping_v2(uuid,uuid,boolean,text,text,text,text,jsonb,text,text,text,integer,numeric,text)',
      'EXECUTE'
    ) as authenticated_can_execute
  `);
  if (manualApprovalPrivileges.rows[0]?.authenticated_can_execute !== true) {
    throw new Error("Authenticated users cannot execute manual product approval v2.");
  }
  process.stdout.write("PASS authenticated users can execute manual product approval v2\n");

  await database.exec(`
    insert into public.project_requirements (
      id, organization_id, project_id, category, requirement_key,
      value_text, value_json, status, created_by
    )
    select
      'd0000000-0000-4000-8000-000000000204',
      project.organization_id,
      project.id,
      'sprinkler_head',
      'manual-product-rollback-verification',
      'Manual product rollback verification requirement',
      '{"operation":"install"}'::jsonb,
      'extracted_unreviewed',
      'd0000000-0000-4000-8000-000000000201'
    from public.projects project
    where project.id = '${project.id}';

    create or replace function public.reject_manual_detail_snapshot_for_verification()
    returns trigger
    language plpgsql
    set search_path = pg_catalog
    as $verification_trigger$
    begin
      if new.product_snapshot ? 'entryMethod' then
        raise exception 'Forced failure after base product approval.';
      end if;
      return new;
    end
    $verification_trigger$;

    create trigger reject_manual_detail_snapshot_for_verification
    before update on public.project_product_suggestions
    for each row execute function public.reject_manual_detail_snapshot_for_verification();
  `);
  await expectDatabaseRejection(
    "failure after base manual approval rolls the complete selection back",
    `select public.approve_distributor_product_mapping_v2(
       requested_project_id := '${project.id}',
       requested_requirement_id := 'd0000000-0000-4000-8000-000000000204',
       requested_user_approved := true,
       requested_product_name := 'Invalid manual product',
       requested_product_number := '9999999',
       requested_manufacturer_name := 'Verification manufacturer',
       requested_entry_method := 'manual',
       requested_manufacturer_article_number := 'VERIFY-999',
       requested_delivery_time_days := 2,
       requested_unit_price := 100,
       requested_currency := 'NOK'
     )`,
  );
  await database.exec(`
    drop trigger reject_manual_detail_snapshot_for_verification
      on public.project_product_suggestions;
    drop function public.reject_manual_detail_snapshot_for_verification();
  `);
  const manualRollbackRows = await database.query(`
    select
      (select count(*)::integer
       from public.project_product_suggestions
       where requirement_id = 'd0000000-0000-4000-8000-000000000204') as assignment_count,
      (select count(*)::integer
       from public.distributor_product_memories
       where product_number = '9999999') as memory_count,
      (select status::text
       from public.project_requirements
       where id = 'd0000000-0000-4000-8000-000000000204') as requirement_status
  `);
  if (
    manualRollbackRows.rows[0]?.assignment_count !== 0
    || manualRollbackRows.rows[0]?.memory_count !== 0
    || manualRollbackRows.rows[0]?.requirement_status !== "extracted_unreviewed"
  ) {
    throw new Error("Failed atomic manual approval left a partial assignment or memory row.");
  }
  process.stdout.write("PASS failure after base manual approval rolls back assignment and product memory\n");

  await expectDatabaseRejection(
    "duplicate project numbers remain blocked",
    `select public.create_project_with_defaults(
       'd0000000-0000-4000-8000-000000000003',
       'EMPTY-DB-RPC-001',
       'Duplicate project number'
     )`,
  );

  await expectDatabaseRejection(
    "platform_admin cannot be assigned as an organization membership",
    `insert into public.organization_members (
       organization_id, user_id, role_id, status
     ) values (
       'd0000000-0000-4000-8000-000000000003',
       'd0000000-0000-4000-8000-000000000202',
       '00000000-0000-4000-8000-000000000010',
       'active'
     )`,
  );

  await expectDatabaseRejection(
    "commercial ranking cannot survive a technical failure",
    `update public.match_candidates
     set technical_result = 'fail'
     where id = 'd0000000-0000-4000-8000-000000000131'`,
  );
  await expectDatabaseRejection(
    "failed material-list item cannot remain selected",
    `update public.material_list_items
     set technical_status = 'fail'
     where id = 'd0000000-0000-4000-8000-000000000142'`,
  );
  await expectDatabaseRejection(
    "demo dataset requires the exact warning",
    `insert into public.data_sets (
       data_source_id, code, name, version, data_mode, quality_status, disclaimer
     ) values (
       'd0000000-0000-4000-8000-000000000001',
       'invalid_demo', 'Invalid demo', '1', 'demo', 'demo_unverified', 'wrong warning'
     )`,
  );
  await expectDatabaseRejection(
    "demo products cannot be promoted to verified quality",
    `update public.products
     set quality_status = 'verified'
     where id = 'd0000000-0000-4000-8000-000000000040'`,
  );
  await expectDatabaseRejection(
    "demo attributes cannot be marked manufacturer verified",
    `update public.product_attribute_values
     set verification_status = 'manufacturer_verified'
     where id = 'd0000000-0000-4000-8000-000000000080'`,
  );

  const rlsRows = await database.query(`
    select count(*)::integer as policy_count
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'project_systems', 'project_buildings', 'project_floors', 'project_zones',
        'project_positions', 'requirement_reviews', 'price_lists', 'import_jobs',
        'matching_decisions', 'data_sets'
      )
  `);
  if ((rlsRows.rows[0]?.policy_count ?? 0) < 20) {
    throw new Error("Expected RLS policies are missing from the FAS 1 tables.");
  }

  const projectStoragePolicy = await database.query(`
    select with_check::text as expression
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'project_files_insert'
  `);
  const storageExpression = projectStoragePolicy.rows[0]?.expression ?? "";
  if (
    !storageExpression
    || storageExpression.includes("candidate_project.name")
    || storageExpression.includes("project.name")
  ) {
    throw new Error("Project file storage is correlated to a project name instead of the storage object path.");
  }
  process.stdout.write("PASS project file storage policy uses the outer object path\n");
  const projectDocumentPrivileges = await database.query(`
    select has_table_privilege(
      'authenticated',
      'public.project_documents',
      'update'
    ) as can_update
  `);
  if (projectDocumentPrivileges.rows[0]?.can_update !== true) {
    throw new Error("Authenticated document workflows cannot update upload status.");
  }
  process.stdout.write("PASS project document upload status can be updated\n");

  const removeDemoFile = join(
    seedDirectory,
    "remove",
    "20260806_remove_demo_data.sql",
  );
  const removeDemoSql = await readFile(removeDemoFile, "utf8");
  await database.exec(removeDemoSql);
  await database.exec(removeDemoSql);
  const removedDemoRows = await database.query(`
    select
      (select count(*)::integer from public.data_sets
       where id = 'd0000000-0000-4000-8000-000000000002') as dataset_count,
      (select count(*)::integer from public.projects
       where id = 'd0000000-0000-4000-8000-000000000110') as project_count,
      (select count(*)::integer from public.products
       where data_set_id = 'd0000000-0000-4000-8000-000000000002') as product_count
  `);
  const removedDemo = removedDemoRows.rows[0];
  if (
    !removedDemo
    || removedDemo.dataset_count !== 0
    || removedDemo.project_count !== 0
    || removedDemo.product_count !== 0
  ) {
    throw new Error("The explicit demo removal script did not remove only the stable fixture.");
  }
  process.stdout.write("PASS idempotent demo removal (run twice)\n");

  process.stdout.write(
    `Verified ${migrationFiles.length} migrations, ${actualTables.size} public tables, and ${seedFiles.length} idempotent seed file(s) from an empty database.\n`,
  );
} finally {
  await database.close();
}
