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
- Supabase Auth-inbjudan skickas endast från serverroute med
  `SUPABASE_SECRET_KEY`/`SUPABASE_SERVICE_ROLE_KEY`; nyckeln används aldrig i
  klientkod.
- Självregistrering mot ett befintligt företag använder
  `organization_join_requests`. Begäran skrivs och granskas via säkra
  SECURITY DEFINER-funktioner; klienten kan inte ange användare eller beslut
  direkt i tabellen.

## Kvarstående risker

Storage-policyn verifierar nu både organisationens och projektets sökvägssegment
samt projektåtkomst. I nästa fas bör Storage-namn bindas direkt till
`project_documents` så att dokumentmetadata och objektlivscykel blir helt
transaktionella.
Teknisk beskrivning använder ännu ingen separat bakgrundskö; stora OCR-jobb
kan därför behöva flyttas till worker/Edge Function.

Join-request-flödet kräver fortfarande ett server/API-lager för att söka på
organisationsnummer, visa vänteläge och skicka aviseringar. Databasen skapar
inte e-post och exponerar inte invitation tokens. Inbjudningsacceptansen tar
emot access-token över HTTPS, använder den endast för att sätta lösenord och
aktivera rätt e-postmedlemskap, och sparar den inte i localStorage.

Kontrollera alltid att `SUPABASE_SERVICE_ROLE_KEY` endast finns i servermiljö,
att loggar inte innehåller tokens eller råa kunddokument och att globala
katalogskrivningar sker genom en validerad import.

Projektstyrningen fortsätter samma tenantmodell: projekt- och moduldata har RLS
som kontrollerar `organization_id` och projektmedlemskap tillsammans. Atomiskt
projektskapande och serverbaserade workflow-gates förhindrar att en klient
kringgår krav på dokument, bekräftade krav eller föregående körningar.

## Senaste hårdning

Migrationen `20260805110000_harden_storage_project_scope.sql` binder privata
Storage-filer till både organisation och projekt samt kräver projektåtkomst och
dokumentbehörighet för skrivning/radering. API:t validerar nu PDF-signaturen,
begränsar dyra inloggnings- och extraktionsförsök och returnerar inte längre
råa Supabase-/parserfel till klienten i API-flödena.
