# Säkerhet

## Implementerat

- Supabase Auth och befintlig organisations-RBAC återanvänds.
- Tenantdata skyddas av RLS med aktivt medlemskap och projektåtkomst.
- Storage-bucket `project-files` är privat; sökvägen måste börja med
  organisationens UUID.
- Globala produkter är read-only för vanliga autentiserade klienter.
- Offerter, importer, matchningar, materiallistor och exporter är
  organisations-/projektisolerade.
- SECURITY DEFINER-funktioner har explicit `search_path` och stängd EXECUTE.
- Kritiska ändringar får audit-logg; vanliga användare kan inte redigera
  audit-tabellen.
- Självregistrering mot ett befintligt företag använder
  `organization_join_requests`. Begäran skrivs och granskas via säkra
  SECURITY DEFINER-funktioner; klienten kan inte ange användare eller beslut
  direkt i tabellen.

## Kvarstående risker

Storage-policyn verifierar organisationens första sökvägssegment. Projektets
metadata-RLS verifierar dessutom projektåtkomst, men Storage-namn bör i nästa
fas bindas direkt till `project_documents` för strikt projektisolering.
Teknisk beskrivning använder ännu ingen separat bakgrundskö; stora OCR-jobb
kan därför behöva flyttas till worker/Edge Function.

Join-request-flödet kräver fortfarande ett server/API-lager för att söka på
organisationsnummer, visa vänteläge och skicka aviseringar. Databasen skapar
inte e-post och exponerar inte invitation tokens.

Kontrollera alltid att `SUPABASE_SERVICE_ROLE_KEY` endast finns i servermiljö,
att loggar inte innehåller tokens eller råa kunddokument och att globala
katalogskrivningar sker genom en validerad import.
