# Scipx: genomförda arkitekturändringar, 27 september 2026

Underlag: granskningen av ab1276d. Utgångspunkt för denna ändring: a27ab51.

**Status:** Produktionsversionen är publicerad efter användarens godkännande.
Alla fem databasändringar är installerade och importkön är aktiverad. Vercels
produktionsbygge och GitHub-kontroller passerade med 663 godkända tester.
Schemaläggaren har körts utan fel; intern köstart gav HTTP 202 och obehöriga
anrop gav HTTP 401. Hem, projektlistan, 3 560 poster och ett produktkort har
kontrollerats inloggat. Väggkanalsposten visar 71,75 m och förslag på kanaler.
Kontrollen med tom kö bevisar inte en fullständig produktionsimport.
Den tidigare optimeringen av projektöversikten i facd58f/a27ab51 är redan publicerad.

| ID | Ändring | Verifiering |
| --- | --- | --- |
| F01 | Next 16.3.6, Sharp 0.35.4 och korrigerade transitiva beroenden | Produktionsaudit: 0 kända sårbarheter; produktionsbygge passerar |
| F02 | Kompakt översikt, detaljer vid kortöppning, omladdning av ändrad post | Befintliga regressionstester; tidigare publicerat |
| F03 | Hem hämtar databasberäknade antal i stället för alla krav och produktval | PostgreSQL-kontrakt/RLS-fixturer; samma klassificering för alla 3 560 sparade poster, 2 904 produktposter |
| F04 | Ingen omextraktion vid sidöppning; indexerat explicit uppslag, max tre samtidiga minnesfrågor, REST-timeouter | TypeScript, översikts- och samtidighetstester; två nya databasindex |
| F05 | Fack och egen rubrik före äldre VVS-kategori; generell sökning för el/ventilation; meter ensamt blir inte rör | Kabel, kabelstege, armaturskena, kanal, ventilation samt befintliga VVS-regressioner |
| F06 | Gemensamt sparat kravunderlag i visning, matchning, godkännande och export | Version 1 för nya importer; äldre underlag behålls som version 0; inga tysta PDF-omtolkningar vid läsning |
| F07 | Beständig importkö, leases, återförsök, ägaravgränsad Importstatus och återupptagbar OCR | Riktig tvåsidig PDF, avbruten batch, återförsök utan dubbletter, slutmarkering efter sparade poster; SQL-test av leaseåtertagning och återkallad behörighet |
| F08 | Databasrevision omfattar både post och produktval; atomisk kontroll vid godkännande/Inte i sortiment | Två konkurrerande sparningar ger en vinnare; gammalt kort ger konflikt; fel rullar tillbaka |
| F09 | Delad Ahlsell-kvot, deduplicering, komprimerat begränsat cache och gemensam backoff | 20 samtidiga lokala kvotanrop, max 6 aktiva, cachegräns 64 poster, 429/backoff och fel vid otillgänglig koordinering |
| F10 | Sparat arbete skiljs från misslyckad vyuppdatering; importstatus, korrelations-id och fasloggar | Polling/nätverksavbrott, felgränser, strukturerad loggning utan PDF-innehåll |
| F11 | Vercels faktiska byggkommando kör audit, TypeScript och regressionssviter; motsvarande GitHub-flöde | 663 tester passerar; produktionsbygge passerar. Separat staging och realistiskt 20-användartest återstår |
| F12 | Tillfälligt authfel behåller cookies och ger återförsök; uttryckligt ogiltig session rensas | Tester för nätverksfel, 429/5xx, felaktigt svar och återkallad session |

Regler-sidan och matchningsmotorns källsnapshot har granskats och uppdaterats till
`ahlsell-product-rules-2026-09-27.3`. Regel-ID:n för befintliga flaggningar behålls.

## Driftobservationer

Läsande kontroll av produktionen: Supabase Free/Nano i London; ungefär 312 MB
uppmätt databasstorlek vid kontrollen. Dashboardens mätare visade 327/500 MB,
14 % CPU, 60 % minne och 17/60 anslutningar vid ett annat mättillfälle.
Det är ögonblicksbilder, ingen kapacitetscertifiering.

Efter publicering svarade Hem på cirka 5,5 sekunder och kapitelöversikten med
3 560 poster på cirka 6,2 sekunder enligt Vercels runtime-loggar. Dessa enskilda
anrop lyckades, men svarstiderna visar att fortsatt kapacitetsarbete behövs.
Ett lyckat PostgREST-anrop med HTTP 204 upptäcktes felaktigt ge en kvotvarning;
svaret hanteras nu utan JSON-tolkning och transporttestet täcker detta.
Importstatus uppdateras bara var femte sekund vid aktiv import, var trettionde
sekund vid vila och gör inga anrop när fliken är dold.

RLS är aktiverat för projektkraven. Både `project-files` och `product-documents`
är privata. De fem tidigare kravindexen inventerades. Historiska SQL-statistikgrupper
för kravfrågor visade bland annat 94 anrop med cirka 3 995 ms medeltid och
7 850 ms max. Detta är historiska servermätningar, inte svarstider för den nya koden.

Dashboarden visade **No backups**. Databas och PDF-objekt behöver en gemensam
backupplan och ett återställningstest till separat miljö. Ingen betald plan har
beställts. Det finns ingen separat testdatabas enligt användaren.

## Kontroller som inte är genomförda

- Verkligt test med 20 samtidiga inloggade användare mot en separat miljö.
- Produktionslik kundisolering med riktiga testkonton och hela RLS-uppsättningen.
- Genomförd återställning av databas och Storage från backup.
- Aktiverad extern larmleverans med utsedd mottagare.

Lokala PostgreSQL-fixturer och komponenttester är inte bevis för dessa punkter.
Drift-, återställnings- och aktiveringsstegen finns i [scipx-operations.md](scipx-operations.md).

Den bifogade PDF-filen med 2 236 sidor lästes även om lokalt: 3 560 poster,
cirka 3,7 sekunder PDF-läsning och 1,8 sekunder tolkning. Mätningen omfattar
inte databas, nätverk eller samtidiga användare.
