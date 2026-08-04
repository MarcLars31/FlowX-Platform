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

`/api/organizations/join-requests` använder `organization_join_requests`:

- `GET` listar den inloggade användarens egna anslutningsbegäran.
- `POST` skapar en begäran till ett befintligt företag via
  `create_organization_join_request`.
- `PATCH` godkänner/avslår en begäran som administratör eller avbryter den egna
  begäran. Databasen kontrollerar organisation, medlemskap och behörighet.

Organisationsadministrationen visar väntande begäranden på `/organization` och
använder samma endpoint. Namn och e-post visas från den begränsade snapshot som
skapas av databasen; ingen profil-RLS kringgås för en ännu ej godkänd användare.
