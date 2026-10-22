---
document_id: chapter-workspace-review-2026-10-22
title: Kapitelhantering – granskning och förenkling
version: 1.0
status: Ready for review
owner: Marcus Larsson
dependencies: [project-chapter-workspace, product-post-groups, requirement-snapshot]
related_adrs: []
---

# Krav och avgränsning

Marcus vill se över den växande kodbasen och rätta det som gör kapitelhanteringen
krånglig. Granskningen utgår från `Frontend-` vid `b382623` och omfattar
projektstrukturen, den senaste kapiteländringen, PDF-tolkningens kontrakt,
kravprojektioner och webbappens befintliga kontrollkedja. Detta dokument skiljer
verifierade rättningar från återstående större refaktoreringar.

Kapitelvyn ska visa varje aktiv produktpost exakt en gång. Kravtexter ska gå att
öppna även när deras föräldrakoppling är ofullständig eller när de saknar
produktposter. Dokument och postområden får inte blandas. En uttrycklig men
ogiltig föräldraidentitet får inte ersättas med en gissad koppling. Sparade
PDF-kapitel får användas som navigeringsetiketter utan att skapa nya ärvda krav.
Produktval, manuella korrigeringar, mängder och originaltext ska bevaras.

Förändringen görs i en separat rättningsgren och kräver ingen databasmigrering.
Inget återställs eller publiceras i produktion som del av granskningen.

# Iakttagelser

- Den nya vyn bygger ett eget föräldraträd, medan den tidigare listan grupperar
  efter sparad `sourceChapter`. En giltig kapiteletikett räcker därför inte
  längre för att placera en produktpost.
- Informationsrader med en saknad eller tvetydig förälder försvinner ur vyn.
  Även djupare informationsrader utan produktbarn kan sakna en väg att öppnas.
- Saknad `parentRequirementId` kan falla tillbaka till `parentPostNumber`,
  trots att detta kan peka ut en annan post.
- Underkapitlets kravruta visas även när något underkapitel inte finns.
  En produktpost som samtidigt är sektionens källa kan få sin egen text visad
  som överordnat krav.
- Kapitelsvaret cachas under hela komponentens livstid utan koppling till
  ändrade kravrader.

# Genomförda rättningar

- Gemensam dokument-/områdesidentitet har brutits ut och återanvänds av
  översikten och kapitelträdet. Föräldrakopplingarna har fått en separat,
  deterministisk funktion.
- En ogiltig uttrycklig föräldraidentitet ersätts aldrig med en annan post som
  råkar ha samma nummer. Cykler, bakåtriktade källkopplingar och kopplingar mellan
  olika importer avvisas.
- Informationsrader med trasiga kopplingar finns under PDF-text för kontroll.
  Även djupa informationsrader utan produktbarn får en öppningsbar sektion.
  Osäker text får inte bli ett gemensamt krav bara för att den har barnposter.
- När en sparad sidrubrik finns men en separat kapitelrad saknas används den
  som navigeringsetikett. Detta skapar ingen ny kravtext eller ärvd koppling.
  Den äldre grupperingens kontrakt för arbetsfördelning har behållits.
- Produktbladens fulltext bearbetas inte längre för att omedelbart kastas bort
  i kapitel-API:t. Textprojektionen görs för de källrader som faktiskt ska visas.
  API:t läser fortfarande alla kravrader; detta är ingen lastmätning eller
  fullständig lösning på stora projekts databasbelastning.
- Kapitel med ett avsnitt öppnas direkt. Tomma underkapitelsrutor försvinner
  och aktiv produkttext visas inte dubbelt som överordnat krav.
- Kapitelvyn uppdateras när sparade krav ändras, avvisas eller tas bort.
  Ett uppdateringsfel visas även om en äldre vy fortfarande finns tillgänglig.
- Den dubblerade historikhanteringen ersätts med befintlig, testad
  `createProductCardHistory`. Manuell stängning förbrukar arbetsvyns
  historiksteg; Bakåt/Framåt och osparade ändringar använder samma regler.
- Regelkatalogens beskrivning och källfingeravtryck har uppdaterats till
  `scipx-product-rules-2026-10-22.3` efter granskning av det ändrade beteendet.

# Verifiering

- Åtta nya fel reproducerades på ursprungsversionen. Den riktade kontrollen
  passerade därefter 50 tester. Efter sista justeringen av kapitelgrupperingen
  passerade ytterligare en riktad körning med 40 tester, inklusive historik,
  arbetsfördelning och regelkatalog.
- Webbappens fulla lokala testsvit: 1 239 passerade, inga överhoppade tester.
- Typkontroll och full ESLint-kontroll passerade i releasekedjan.
- Beroendegranskning: inga rapporterade sårbarheter i produktionsberoendena.
- Tom lokal PGlite-databas: 76 migrationer, 183 publika tabeller och tre
  upprepningsbara seed-filer verifierade. En Supabase-specifik
  schemaläggningsmigration är undantagen enligt befintligt kontrollskript.
- Dokumentcrawler: 56 tester passerade. Lokal testmiljö behövde `socksio`
  för miljöns proxy; projektets beroenden har inte ändrats.
- Docling-tjänstens kontrakttester: sex passerade utan nedladdning av modeller.

Produktionsbygget passerade, inklusive statisk generering av 57 sidor.
Byggvarningar kvarstår för `unpdf/import.meta`, Nexts middleware-konvention och
Node-API:er i Nexts Edge-bundle. Dessa har inte åtgärdats i kapiteländringen.

Granskningen har inte kört mot kunddata eller en autentiserad produktionsmiljö.
Användarens ursprungliga problem-PDF fanns inte i repositoryt. PDF-testerna
använder befintliga testunderlag och genererade PDF-filer. En jämförelse på
original-PDF:n i en testmiljö återstår före publicering.

# Vad den bredare kodgenomgången visar

Vid utgångsversionen fanns 418 TypeScript-produktionsfiler. Följande är
underhållsproblem och prioriteringar, inte påståenden om nya reproducerade fel:

| Område | Iakttagelse | Rekommenderat nästa arbete |
| --- | --- | --- |
| Produktarbetsyta | `DistributorMappingPanel.tsx` hade 1 320 rader och blandar navigering, formulärtillstånd, kandidater, bilagor och sparande. | Dela ut produktformulär och nätverksanrop bakom befintliga kontrakt. Behåll regressionstester för sparande och navigering. |
| PDF-tolkning | Teknisk extractor hade 1 265 rader. `document-parser`, `document-structure` och den sparade projektvyn bygger olika representationer av samma underlag. | Definiera ett gemensamt versionsmärkt strukturkontrakt vid import och låt läsvyer använda det. Äldre importer behöver en uttrycklig adapter och jämförelser mot riktiga PDF-filer. |
| Produktmatchning | Kandidatrankningen hade 1 282 rader och den publika matchningen 1 097. | Dela efter produktfamilj och ansvar med befintliga matchningsfall som kontroll. Ändra inte sökregler och kapitelmodell i samma stora omskrivning. |
| Testernas koppling till gränssnittet | Den gamla `ProductPostNavigation` finns kvar med tester, men den aktuella arbetsytan använder `ChapterWorkspaceNavigation`. Historikfunktionen var också testad men hade slutat användas. | Lägg till ett fåtal browsertester av det verkliga flödet: öppna kapitel, byt post, spara, Bakåt/Framåt och ändrade krav. Inventera äldre komponenter innan de tas bort. |
| Dokumentation | Äldre kodgranskningsanteckningar beskriver delar av matchning och köhantering som ännu ej implementerade, trots senare kod och stabiliseringsleverans. | Markera äldre anteckningar som historiska och håll en aktuell ingång till arkitektur och driftskrav. |

Detta är en genomgång av strukturen och kontrollkedjan med detaljerad rättning
av kapitelvägen. Det är inte en rad-för-rad-certifiering av samtliga filer.
