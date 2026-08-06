# Auth och projektåtkomst

Supabase Auth identifierar användaren. FlowX hämtar aktivt
organisationsmedlemskap på serversidan och återanvänder befintliga
organisation/RBAC-funktioner. Projekt-RLS kombinerar `organization_id` med
aktiv `project_members`-rad; organisationsägare och administratörer har
organisationsomfattande läsrättighet.

Klienten skickar aldrig service-role-nyckel eller organisationens tenant-id som
auktoritetsbevis. `create_project_with_defaults` härleder organisation och
skapar alla standardrader atomiskt.
