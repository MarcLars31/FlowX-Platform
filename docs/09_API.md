# API och databasgränser

`apps/web/src/app/api/technical-descriptions/route.ts` är den viktigaste
uppdaterade routen. Den använder user-token mot Supabase REST och kontrollerar
`technical_description.create` innan fil, projektmetadata, Storage-objekt,
extraktionskörning, sidor, kandidater och bekräftade krav skrivs.

Databasfrågor ska använda `supabase-user-rest.ts` med aktuell Auth-token.
`service_role` får endast användas i serverkod för kontrollerade globala
katalogimporter och aldrig i frontend. RLS är den auktoritativa kontrollen även
om API:t gör en förhandskontroll.

Viktiga RPC-/databasfunktioner är `can_access_project`, `has_permission`,
`enforce_database_project_scope`, `audit_database_change` och
`validate_material_list_item_selection`. Matchnings- och kommersiella API:er
kan byggas ovanpå de versionshanterade tabellerna utan att skapa nya parallella
krav- eller produktmodeller.
