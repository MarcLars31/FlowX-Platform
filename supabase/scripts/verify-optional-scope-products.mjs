import assert from "node:assert/strict";

export async function verifyOptionalScopeProducts(database, projectId) {
  const cases = [
    { id: "f1000000-0000-4000-8000-000000000001", operation: "remove", unit: "RS", method: "manual" },
    { id: "f1000000-0000-4000-8000-000000000002", operation: "remove", unit: "m", method: "catalog" },
    { id: "f1000000-0000-4000-8000-000000000003", operation: "install", unit: "RS", method: "manual" }
  ];
  for (const scope of cases) {
    await database.query(`insert into public.project_requirements
      (id, organization_id, project_id, category, requirement_key, value_text, value_json, status, created_by)
      select $1::uuid, organization_id, id, 'pipe', ($1::uuid)::text, 'Optional replacement scope', $3::jsonb,
        'extracted_unreviewed', created_by from public.projects where id = $2`,
    [scope.id, projectId, JSON.stringify({ operation: scope.operation, quantity: 1, unit: scope.unit })]);
  }
  try {
    await database.exec("set role authenticated");
    for (const scope of cases) {
      await database.query(`select public.approve_distributor_product_mapping_v2(
        requested_project_id := $1, requested_requirement_id := $2,
        requested_user_approved := true, requested_product_name := 'Optional replacement pipe',
        requested_product_number := 'OPTIONAL-TEST', requested_entry_method := $3,
        requested_manufacturer_name := 'Fixture manufacturer', requested_manufacturer_article_number := 'TEST-1',
        requested_delivery_time_days := 1, requested_unit_price := 100, requested_currency := 'NOK')`,
      [projectId, scope.id, scope.method]);
      const saved = (await database.query(`select r.value_json, r.status::text,
        (select count(*)::integer from public.project_product_suggestions s where s.requirement_id = r.id and s.status = 'selected') as selections
        from public.project_requirements r where r.id = $1`, [scope.id])).rows[0];
      assert.equal(saved.selections, 1);
      assert.equal(saved.value_json.operation, scope.operation);
      assert.equal(saved.value_json.unit, scope.unit);
      assert.equal(saved.value_json.quantity, 1);
    }
    await database.query("select set_config('request.jwt.claim.sub', $1, false)", ["d0000000-0000-4000-8000-000000000202"]);
    await assert.rejects(database.query(`select public.prepare_requirement_for_direct_product_mapping($1, $2)`, [projectId, cases[0].id]), /access denied/i);
  } finally {
    await database.exec("reset role");
    await database.query("select set_config('request.jwt.claim.sub', $1, false)", ["d0000000-0000-4000-8000-000000000201"]);
  }
  process.stdout.write("PASS optional removal and RS products save through manual/catalog approval without changing source scope; project access stays enforced\n");
}
