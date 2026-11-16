# Roller och valfri arbetsgranskning

Implementerat på `codex/scipx-upgrades` för lokal testning. Ingen publicering
eller produktionsmigrering ingår.

## Roller

De ordinarie valen i organisationen är Organisationsägare,
Företagsadministratör, Projektledare, Ingenjör / medarbetare och Läsare.
Äldre medlemskap behåller sina lagrade roller och behörigheter:
`organization_admin` visas som Företagsadministratör, `full_user` som
Projektledare och `read_only` som Läsare. Befintlig `mini_user` visas som
Produktsökning och kan behållas; den läggs inte bland nya standardval.

Ingenjör behåller arbete med poster, produktval, analyser och materiallistor,
men får inte skapa/radera projekt, ändra allmänna projektinställningar,
skapa projektversioner eller ladda upp/radera dokument. En uttryckligen utsedd
projektansvarig behåller ledningen av arbetsfördelningen i just sitt projekt;
organisationsrollen gör inte personen till projektledare i alla projekt.

Arbetsledare utses som tidigare per projektavdelning. Projektrollen Granskare
ger läsåtkomst till det uttryckligen tilldelade projektets underlag och poster,
utan redigerings- eller fördelningsbehörighet. Projektets utsedda granskare
och projektledare kan granska. Avstängda medlemskap och läsarroller uppgraderas
inte automatiskt. Gamla projektroller `reviewer` blir därmed läsroller för
innehållet; eventuella arbetsuppgifter behöver fördelas till en medarbetare.

## Granskningsflöde

Granskning är av som standard och slås på i **Avdelinger, frister og granskning**.
Välj en aktiv person som saknar annan projektroll eller redan är granskare.
En ny projektmedlem får uttryckligen rollen Granskare. Andra medlemskap skrivs
inte över. Byte av utsedd granskare återkallar den förras granskningsrätt, men
tar inte bort personens befintliga läsmedlemskap.

- Avstängt: medarbetaren markerar posten som färdig, som tidigare.
- Påslaget: **Pågår → Klar til granskning → Godkjent / Sendt tilbake**.
- Vid aktivering skickas redan färdigmarkerade poster till granskning.
- En återföring kräver en kommentar. Medarbetaren kan korrigera och lämna in igen.
- Den som skickade in eller nu ansvarar för posten kan inte godkänna den själv.
- Alla öppna hjälpbehov måste vara lösta före inlämning och godkännande.
- Inlämnat och godkänt innehåll är låst. Återöppning tar bort godkännandet och
  kräver ny inlämning. Låsningen gäller även äldre API:er och projektledare.
- Väntande granskningar måste hanteras eller återöppnas innan funktionen stängs av.
- Händelser, aktörer och kommentarer sparas i historik samt audit-logg.
  Aviseringar om inlämning och beslut visas i ScipX.

Granskningen gäller arbetsstatus på poster. Befintliga tekniska produktkontroller,
exportregler och det separata beslutet att avsluta ett projekt behålls.
Frister ändras fortfarande av projektledaren. I vyn finns statusfilter för
väntande granskning, godkända och återförda poster.

## Testa lokalt

Stoppa den lokala servern och kör från `apps/web`:

```powershell
node --no-wasm-code-gc scripts/seed-review-demo.mjs
npm.cmd run dev
```

Kommandot skapar ett separat, idempotent exempel med tre poster och två fiktiva
konton. Tidigare lokala projekt återställs inte. Länken skrivs ut i terminalen.
En post ligger redan för granskning. Använd testknapparna i sidans överkant:
**Projektledare**, **Medarbetare** och **Granskare**. Varje knapp byter lokal
session och öppnar exempelprojektet; testkonton och länkar är fasta och fungerar
bara i den isolerade lokala miljön.

Prova återföring med kommentar som Granskare, ny inlämning som Medarbetare och
godkännande som Granskare. Öppna sedan posten igen och kontrollera att den
behöver granskas på nytt. En direktlänk i postdialogen öppnar projektets
underlag och produktval för läsning.

## Databas och verifiering

Den nya migrationen är `20261109200024_project_roles_and_review.sql`.
Den måste följa med appen vid en framtida, separat godkänd publicering.
Publika anropsfunktioner använder SECURITY INVOKER; privilegierade funktioner
ligger i ett privat schema med explicita rättigheter och kontroll av användare,
projekt, medlemskap, tilldelning och revision. Granskningshistoriken har RLS.
Postredigering och tillståndsändringar använder samma projektlås.

Databastester kör den fullständiga migrationskedjan och verkliga autentiserade
roller, inklusive läsning genom RLS, återkallade medlemskap, egen granskning,
innehållslås, revisionskonflikter, valfri aktivering och äldre klarmarkeringsanrop.

Verifierat lokalt 9 november 2026:

- `node scripts/release-check.mjs`: typkontroll, ESLint utan varningar och
  **1 340 tester godkända**, inga fel eller överhoppade tester.
- Webbläsare: byte mellan projektledare, medarbetare och granskare;
  återföring med obligatorisk kommentar, ny inlämning, godkännande,
  återöppning med återkallat godkännande och ny inlämning.
- Granskaren kan läsa postunderlag och produktval med låsta redigeringsreglage.
  Projektinställningar, dokumentuppladdning och projektavslut följer behörigheten
  även i den tidigare produktvyn; navigering i läsläge ändrar inte projektsteg.
- Exempelprojektet lämnades med en post som väntar på granskning och två pågående
  poster. Tidigare lokala testprojekt bevarades. Ingen publicering eller ändring
  i produktionsdatabasen gjordes.
