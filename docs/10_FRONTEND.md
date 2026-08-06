# Frontend och projektytor

`/projects` är startpunkten med sökning, status/steg-filter, sortering och
"mina projekt". `/projects/new` skapar genom server-RPC. `/projects/[id]` visar
översikt, visuellt arbetsflöde och nästa steg. Sektioner under projektet har
gemensam åtkomstkontroll och kan byggas ut utan nya tenantmodeller.

`ProjectWorkspace` använder den centrala stegkonstanten i
`src/lib/project-governance.ts`, så UI och serverns validerade steg håller ihop.
