begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, auth, pg_catalog;
select plan(20);

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
)
select
  '00000000-0000-0000-0000-000000000000'::uuid,
  fixture.id,
  'authenticated',
  'authenticated',
  fixture.email,
  '',
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  now(),
  now(),
  '',
  '',
  '',
  ''
from (
  values
    ('10000000-0000-4000-8000-000000000001'::uuid, 'owner-a@flowx.test'),
    ('10000000-0000-4000-8000-000000000002'::uuid, 'admin-a@flowx.test'),
    ('10000000-0000-4000-8000-000000000003'::uuid, 'full-a@flowx.test'),
    ('10000000-0000-4000-8000-000000000004'::uuid, 'mini-a@flowx.test'),
    ('10000000-0000-4000-8000-000000000005'::uuid, 'reader-a@flowx.test'),
    ('20000000-0000-4000-8000-000000000001'::uuid, 'owner-b@flowx.test')
) fixture(id, email)
on conflict (id) do nothing;

insert into public.organizations (id, name, status, created_by)
values
  (
    'a0000000-0000-4000-8000-000000000001',
    'Ahlsell fixture',
    'active',
    '10000000-0000-4000-8000-000000000001'
  ),
  (
    'b0000000-0000-4000-8000-000000000001',
    'Other company fixture',
    'active',
    '20000000-0000-4000-8000-000000000001'
  )
on conflict (id) do nothing;

update public.organization_subscriptions
set status = 'active'
where organization_id in (
  'a0000000-0000-4000-8000-000000000001',
  'b0000000-0000-4000-8000-000000000001'
);

update public.organization_seat_limits
set seat_limit = 1
where organization_id = 'a0000000-0000-4000-8000-000000000001'
  and seat_type = 'mini_user';

insert into public.organization_members (
  id,
  organization_id,
  user_id,
  role_id,
  status,
  joined_at
)
values
  (
    'a1000000-0000-4000-8000-000000000001',
    'a0000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000001',
    'active',
    now()
  ),
  (
    'a1000000-0000-4000-8000-000000000002',
    'a0000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000002',
    'active',
    now()
  ),
  (
    'a1000000-0000-4000-8000-000000000003',
    'a0000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000003',
    '00000000-0000-4000-8000-000000000003',
    'active',
    now()
  ),
  (
    'a1000000-0000-4000-8000-000000000004',
    'a0000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000004',
    '00000000-0000-4000-8000-000000000004',
    'active',
    now()
  ),
  (
    'a1000000-0000-4000-8000-000000000005',
    'a0000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000005',
    '00000000-0000-4000-8000-000000000005',
    'active',
    now()
  ),
  (
    'b1000000-0000-4000-8000-000000000001',
    'b0000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000001',
    'active',
    now()
  )
on conflict (organization_id, user_id) do nothing;

insert into public.teams (id, organization_id, name, created_by)
values (
  'a2000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001',
  'Region West',
  '10000000-0000-4000-8000-000000000001'
)
on conflict (id) do nothing;

insert into public.team_members (team_id, organization_member_id)
values (
  'a2000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000003'
)
on conflict do nothing;

insert into public.projects (
  id,
  organization_id,
  team_id,
  owner_id,
  created_by,
  name,
  access_level,
  status
)
values
  (
    'a3000000-0000-4000-8000-000000000001',
    'a0000000-0000-4000-8000-000000000001',
    'a2000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'Team project',
    'team',
    'active'
  ),
  (
    'a3000000-0000-4000-8000-000000000002',
    'a0000000-0000-4000-8000-000000000001',
    null,
    '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'Restricted project',
    'restricted',
    'active'
  ),
  (
    'a3000000-0000-4000-8000-000000000003',
    'a0000000-0000-4000-8000-000000000001',
    null,
    '10000000-0000-4000-8000-000000000003',
    '10000000-0000-4000-8000-000000000003',
    'Full user project',
    'own',
    'active'
  ),
  (
    'b3000000-0000-4000-8000-000000000001',
    'b0000000-0000-4000-8000-000000000001',
    null,
    '20000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    'Other company project',
    'organization',
    'active'
  )
on conflict (id) do nothing;

insert into public.project_members (
  project_id,
  organization_member_id,
  project_role
)
values (
  'a3000000-0000-4000-8000-000000000002',
  'a1000000-0000-4000-8000-000000000005',
  'viewer'
)
on conflict do nothing;

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}';

select is(
  (
    select count(*)::integer
    from public.projects
    where organization_id = 'b0000000-0000-4000-8000-000000000001'
  ),
  0,
  '1. cross-organization projects are invisible'
);

set local request.jwt.claims =
  '{"sub":"10000000-0000-4000-8000-000000000004","role":"authenticated"}';
select ok(
  public.has_permission(
    'a0000000-0000-4000-8000-000000000001',
    'product.search'
  )
  and not public.has_permission(
    'a0000000-0000-4000-8000-000000000001',
    'project.view_own'
  )
  and (select count(*) from public.projects) = 0,
  '2. mini user can search products but cannot read projects'
);

set local request.jwt.claims =
  '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}';
select lives_ok(
  $$
    insert into public.projects (
      id, organization_id, owner_id, created_by, name, access_level, status
    )
    values (
      'a3000000-0000-4000-8000-000000000004',
      'a0000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000003',
      '10000000-0000-4000-8000-000000000003',
      'Created through RLS',
      'own',
      'active'
    )
  $$,
  '3. full user can create a project'
);

select throws_ok(
  $$
    select public.create_organization_invitation(
      'a0000000-0000-4000-8000-000000000001',
      'blocked@flowx.test',
      'full_user',
      repeat('1', 64),
      now() + interval '7 days'
    )
  $$,
  '4. full user cannot invite members'
);

set local request.jwt.claims =
  '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}';
select lives_ok(
  $$
    select public.create_organization_invitation(
      'a0000000-0000-4000-8000-000000000001',
      'invited-full@flowx.test',
      'full_user',
      repeat('2', 64),
      now() + interval '7 days'
    )
  $$,
  '5. admin can invite a full user'
);

select throws_ok(
  $$
    select public.create_organization_invitation(
      'a0000000-0000-4000-8000-000000000001',
      'platform@flowx.test',
      'platform_admin',
      repeat('3', 64),
      now() + interval '7 days'
    )
  $$,
  '6. customer admin cannot assign platform_admin'
);

select throws_ok(
  $$
    select public.change_organization_member_role(
      'a1000000-0000-4000-8000-000000000002',
      'organization_owner'
    )
  $$,
  '7. member cannot promote their own role'
);

set local request.jwt.claims =
  '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}';
select ok(
  public.can_access_project(
    'a3000000-0000-4000-8000-000000000001'
  ),
  '8. team member can access a team project'
);

select ok(
  not public.can_access_project(
    'a3000000-0000-4000-8000-000000000002'
  ),
  '9. restricted project is hidden from non-project members'
);

select lives_ok(
  $$
    select public.soft_delete_project(
      'a3000000-0000-4000-8000-000000000003',
      'Test removal',
      'Full user project'
    )
  $$,
  '10. an owned project can be soft-deleted'
);

select ok(
  not public.can_access_project(
    'a3000000-0000-4000-8000-000000000003'
  ),
  '11. soft-deleted project is hidden from the normal project scope'
);

set local request.jwt.claims =
  '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}';
select lives_ok(
  $$
    select public.restore_project(
      'a3000000-0000-4000-8000-000000000003'
    )
  $$,
  '12. organization admin can restore a project'
);

select ok(
  (
    select count(*)
    from public.audit_logs
    where entity_id = 'a3000000-0000-4000-8000-000000000003'
      and action in ('project.deleted', 'project.restored')
  ) = 2,
  '13. delete and restore create audit events'
);

set local request.jwt.claims =
  '{"sub":"10000000-0000-4000-8000-000000000004","role":"authenticated"}';
select ok(
  not public.has_permission(
    'a0000000-0000-4000-8000-000000000001',
    'analysis.create'
  ),
  '14. mini user is denied by backend permission checks'
);

set local request.jwt.claims =
  '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}';
select throws_ok(
  $$
    insert into public.projects (
      organization_id, owner_id, created_by, name, access_level, status
    )
    values (
      'b0000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000003',
      '10000000-0000-4000-8000-000000000003',
      'Tenant manipulation',
      'own',
      'active'
    )
  $$,
  '15. organization_id manipulation is rejected'
);

select lives_ok(
  $$
    select public.create_project_with_defaults(
      'a0000000-0000-4000-8000-000000000001',
      'RPC-REGRESSION-001',
      'Atomic RPC regression project'
    )
  $$,
  '16. atomic project creation does not duplicate the creator membership'
);

select ok(
  (
    select count(*) = 1
      and count(settings.id) = 1
      and count(module.id) = 1
      and count(project_member.project_id) = 1
    from public.projects project
    left join public.project_settings settings on settings.project_id = project.id
    left join public.project_modules module
      on module.project_id = project.id and module.module_code = 'sprinkler'
    left join public.project_members project_member
      on project_member.project_id = project.id
      and project_member.organization_member_id = 'a1000000-0000-4000-8000-000000000003'
    where project.organization_id = 'a0000000-0000-4000-8000-000000000001'
      and project.project_number = 'RPC-REGRESSION-001'
  ),
  '17. atomic project creation persists exactly one settings, module and owner membership row'
);

set local request.jwt.claims =
  '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}';
select throws_ok(
  $$
    update public.organization_members
    set status = 'disabled'
    where id = 'a1000000-0000-4000-8000-000000000001'
  $$,
  '18. the last active organization owner cannot be disabled'
);

select throws_ok(
  $$
    select public.create_organization_invitation(
      'a0000000-0000-4000-8000-000000000001',
      'second-mini@flowx.test',
      'mini_user',
      repeat('4', 64),
      now() + interval '7 days'
    )
  $$,
  '19. seat limits are enforced by the database'
);

do $$
begin
  perform public.set_organization_member_status(
    'a1000000-0000-4000-8000-000000000003',
    'disabled'
  );
end;
$$;
set local request.jwt.claims =
  '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}';
select ok(
  not public.has_permission(
    'a0000000-0000-4000-8000-000000000001',
    'project.view_own'
  )
  and (select count(*) from public.projects) = 0,
  '20. disabled users immediately lose access and RLS remains authoritative'
);

select * from finish();
rollback;
