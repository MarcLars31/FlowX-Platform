# Databasbeslut

1. `organization_id` behålls som tenantbegrepp; befintliga organizations,
   profiles och members ersätts inte.
2. Projektfiler använder `project_documents`; tabellen `documents` reserveras
   för global produktkällkatalog.
3. AI-förslag och bekräftade krav är separata tabeller så att användaren alltid
   kan se råtext, konfidens och beslut.
4. Tekniskt resultat lagras före ranking. Pris eller leveranstid kan aldrig
   göra ett obligatoriskt tekniskt FAIL godkänt.
5. Materiallistor får versionsrader och alternativ i stället för att skriva
   över godkända versioner.
6. Globala tekniska produkter separeras från organisationsspecifika
   leverantörsofferter.
7. Befintliga projektinställningskolumner behålls; en parallell
   `project_settings`-modell skulle skapa drift och otydlig äganderätt.
8. Audit-logg är append-only och skrivs av databas-/livscykeltriggers.
