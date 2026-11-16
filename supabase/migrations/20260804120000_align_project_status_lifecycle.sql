-- Keep the project status constraint aligned with the lifecycle used by the
-- project workspace and its API.

alter table public.projects
  drop constraint if exists projects_status_check;

alter table public.projects
  add constraint projects_status_check
  check (
    status in (
      'draft',
      'analysis',
      'awaiting_input',
      'proposal_ready',
      'in_review',
      'approved',
      'quoted',
      'ordered',
      'delivered',
      'active',
      'completed',
      'archived'
    )
  ) not valid;

alter table public.projects
  validate constraint projects_status_check;
