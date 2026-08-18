begin;

select plan(3);

select ok(
  has_column_privilege('authenticated', 'public.projects', 'current_stage', 'UPDATE'),
  'authenticated users can update current_stage subject to project RLS'
);

select ok(
  has_column_privilege('authenticated', 'public.projects', 'project_number', 'UPDATE'),
  'authenticated users can update project_number subject to project RLS'
);

select ok(
  has_column_privilege('authenticated', 'public.projects', 'technical_parameters', 'UPDATE'),
  'authenticated users can update technical_parameters subject to project RLS'
);

select * from finish();

rollback;
