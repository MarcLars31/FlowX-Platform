# Stabilisering efter kodgranskning – 12 oktober 2026

Status: implementerat i arbetskopian på `codex/restore-pdf-card`, utgående från
`37f944cca5d144031a1e351b28fe31dc5c89ef0e`. Inte publicerat. Ingen produktionsdata
har ändrats. Den separata, redan ändrade huvudkopian har lämnats orörd.

## Genomförda ändringar

| Granskningspunkt | Åtgärd |
| --- | --- |
| Ändrat datablad på samma URL ignorerades | Versionskedja med kontrollsumma och aktuell version. Äldre källa och försökshistorik bevaras; en gammal läsare får inte skriva över en nyare version. |
| Produktläsningar fastnade eller kördes i långa synkrona batcher | Varaktig kö, ett försök per arbetarkörning, tidsbudget, lås med tidsgräns och högst fem försök. Befintliga avbrutna bearbetningar får återhämtningsjobb. |
| Importrelationer blockerade projektradering | Kaskadradering av importjobb och checkpoints; filreferenser sparas i städkön före raderingen. Även posternas behörighetstrigger hanterar den auktoriserade kaskaden. |
| Övergivna OCR-jobb blockerade nya importer | Väntande jobb kan avbrytas. Jobb utan OCR-aktivitet i 14 dagar avslutas automatiskt. Aktiv bearbetning får slutföra sitt försök. |
| Leverantörsändring nollställde distributören | Oangivna val bevaras. Även en ändring av enbart distributör fungerar. |
| Delvis sparade inställningar vid fel | Projekt, leverantörsval och organisationsinställningar sparas via transaktioner. |
| En trasig PDF-sida stoppade resten | Sidfel markeras för OCR/granskning; senare sidor läses vidare. Fel vid lagring av checkpoints avbryter fortfarande jobbet. |
| Övergivna projektuppladdningar blev kvar | Uppladdningar registreras före signering, städas med återförsök och skyddas medan importen arbetar. En slutlig städning fångar sena uppladdningar. |
| Kravgranskning saknade konfliktkontroll | PATCH kräver `expectedRevision`; saknad revision ger 428 och ändrad revision 409. |
| Upprepad autentisering och flera behörighetsfrågor | Ett Auth-anrop och en färsk behörighetsfråga i organisationens API-skydd. Ingen global användarcache. |
| Dyr första öppning av stora projekt | Kravdetaljer hämtas i grupper om 500. Cache-skrivningar körs efter sidans svar. Behörigheter och källrevision kontrolleras fortfarande. |
| Tät pollning mot leverantörscachen | Identiska samtidiga anrop i samma process delar arbete. Andra instanser väntar med ökande intervall. Den gemensamma leverantörsgränsen behålls. |
| En import blockerade alla organisationer | Högst två organisationer kan läsa parallellt, en import per organisation och en gemensam fas för sparning av kravdata. |
| Lokal trafikbegränsare växte och räckte inte mellan instanser | Verklig gräns på 10 000 lokala poster samt gemensam inloggningsbegränsning för IP och konto. Leverantörsanrop och importköer har egna databasgränser. |
| Auth-avbrott såg ut som utloggning | Tidsgräns samt särskilt 503-svar vid tjänste-/nätverksfel. Ogiltig session skiljs från tillfälligt avbrott. |
| Papperskorgens knappar låste sig vid nätverksfel | Felhantering och återställning av knappens tillstånd i `finally`. |
| Retention kontrollerades inte vid permanent radering | Databasen kontrollerar retention före radering. Gränssnittet döljer radering innan perioden har gått ut. |
| Ofullständig testkedja och gammal dokumentation | Automatisk upptäckt av lokala tester, lint som stoppvillkor samt separata databas- och crawlerjobb i CI. README beskriver nu rätt körkommandon. |

Den bredare testkedjan hittade även att den egna rubriken ”Specialventil” inte
identifierades som ventil. Den rättningen omfattar svenska/norska benämningar;
kommentarer om ingående ventiler klassificerar fortfarande inte en annan produkt.
Regelkatalogen och översiktscachen har versionsmärkts för ändringen.

## Verifiering

- `apps/web`: 1 001 lokala tester godkända, inklusive PDF-sidbrytningar, kapitel,
  mängder, produktval, nya felinjektioner och databastester.
- Typkontroll och lint utan fel eller varningar godkända.
- Lokalt produktionsbygge (`next build --webpack`) godkänt. Befintliga varningar
  om Nexts middleware-konvention och `unpdf`/`import.meta` kvarstår.
- `npm audit --omit=dev --audit-level=moderate`: inga kända sårbarheter rapporterade.
- `supabase`: 75 SQL-migrationer, 182 publika tabeller och tre upprepningsbara
  seed-filer verifierade från tom PGlite-databas. Den gamla installationen av
  Supabases schemaläggare är uttryckligen undantagen; den kräver riktiga tjänster.
- `apps/document-crawler`: 56 tester godkända. Lokal Python 3.14 ger befintliga
  deprecieringsvarningar från testberoenden; CI använder Python 3.12.
- Databasfallen testar flera organisationer, återkallat medlemskap, föråldrade
  revisioner, lås som löpt ut, samtidiga importer, radering och nekad åtkomst.

Testet med 3 850 kalla översiktsrader ger **8 detaljläsningar i stället för 39**
och åtta cache-skrivningar efter svaret. Detta är antalet anrop i den testade
funktionen, inte alla sidans anrop eller en mätning av Supabases CPU i produktion.

## Installation och återställning

1. Granska de sex nya migrationerna `20261012120000` till `20261012125000`.
2. Prova installation, verklig Storage-städning och den autentiserade
   schemaläggaren i en isolerad Supabase-miljö. Kontrollera både nya importer,
   återstart efter avbrott, annan organisations åtkomst och en aktiv projekt-PDF.
3. Installera migrationerna före den nya webbversionen. Funktionerna används
   direkt av nya API-routes; frontend får inte publiceras mot den gamla databasen.
4. Kontrollera att cron-jobbet `scipx-import-worker`, Vault-hemligheten och
   `/api/internal/import-worker` fungerar. Jobben måste fortsätta även när ingen
   webbläsare är öppen. Kontrollera att avbrutna jobb och filer faktiskt städas.
5. Publicera webbversionen först efter godkänd granskning och stagingkontroll.

Migreringarna breddar schema och köfunktioner. Återställning ska normalt göras
med en korrigerande framåtriktad migration; radera inte tabeller med körhistorik
eller städköer. Äldre synkrona produktarbetare ska ha avslutats innan den nya
schemaläggaren börjar bearbeta samma dokument.

HTTP-tester mot verkliga kundkonton, Vault/pg_net/pg_cron och produktionslast har
inte körts här. Det externa OCR-/produkt-PDF-systemets tillgänglighet verifieras
vid stagingkontrollen. Detta arbete gör inte anspråk på att alla tänkbara fel i
hela produkten är borta. De stora befintliga parser- och UI-filerna har inte
skrivits om i samma leverans; kö, autentisering och samordning har fått egna moduler.
