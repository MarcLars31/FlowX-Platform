# Seeddata

## Fiktiv demodatabas

`20260806_demo_data.sql` och `20260806_demo_sprinkler_catalog.sql` innehåller
en sammanhängande, helt fiktiv datamängd för FlowX:

- två produktkategorier
- 50 sprinklerhuvuden och en rörkoppling med egna produktvarianter
- tio olika metriska K-faktorer: 28, 36, 40, 57, 80, 115, 160, 202, 242 och 363
- normaliserat arbetstryck, temperatur, respons, montage, anslutning, finish och värmeelement
- fem helt fiktiva godkännandetyper med temperaturvillkor och olika produktkombinationer
- en fiktiv distributör med pris-, lager- och ledtidsdata för samtliga sprinklerhuvuden
- ett projekt med system, byggnad, våning, zon och position
- PDF-metadata, dokumentsida, extraktionskörning och källevidens
- kravset, tekniskt godkänd matchningskandidat och materiallista

Alla berörda rader kopplas till det stabila dataset-id:t
`d0000000-0000-4000-8000-000000000002`. Datasetet har läget `demo`, kvaliteten
`demo_unverified` och exakt denna obligatoriska text:

> Demo data – ej verifierad för projektering, installation eller inköp.

Seedfilerna är idempotenta. Verifieringskommandot kör båda två gånger och
kontrollerar att det fortfarande finns exakt 50 sprinklerhuvuden, tio olika
K-faktorer, fem godkännandetyper, ett demoprojekt och en dokumentpost:

```powershell
cd supabase
npm.cmd install
npm.cmd run verify:empty
```

Demodata får finnas i produktion endast om gränssnitt, export och API-svar visar
varningen. Den får aldrig blandas med `verified` data eller användas för faktisk
projektering, installation eller inköp.

Den separata filen `remove/20260806_remove_demo_data.sql` körs aldrig av normal
seedning. Den tar endast bort den fasta demo-fixturen, kan köras flera gånger
och bevarar append-only audit-loggar. Den tomma demoorganisationen inaktiveras
i stället för att audit-historiken försvagas.

Ett valfritt demokonto för lokal/staging skapas efter seedningen med:

```powershell
cd apps/web
npm.cmd run accounts -- seed-demo-user
npm.cmd run accounts -- remove-demo-user --dry-run
npm.cmd run accounts -- remove-demo-user
```

Samma produktionsspärrar och testlösenordskrav som för administrativa
testkonton gäller.

## Säkra testkonton

Projektet skapar aldrig testkonton automatiskt. Administrativa testidentiteter
skapas endast med det uttryckliga CLI-kommandot i `apps/web` och bara när
miljöspärrarna är aktiverade.

1. Applicera migrationerna i lokal, test- eller stagingdatabas.
2. Kopiera `apps/web/.env.test.example` till `apps/web/.env.test.local`.
3. Ange ett unikt testlösenord och testmiljöns Supabase-hemlighet.
4. Säkerställ att ingen miljösignal är `production` eller `prod`.
5. För en fjärrdatabas ska `TEST_ACCOUNT_EXPECTED_SUPABASE_HOST` exakt matcha
   värdnamnet i `SUPABASE_URL`.
6. Lägg kända produktionsvärdar i `TEST_ACCOUNT_PRODUCTION_HOSTS`.

Scipx kända produktionsvärd `myzegtifgbvjhdlcpebi.supabase.co` nekas alltid.
`.env.test.local` ignoreras av Git och lösenord skrivs aldrig till CLI-loggen.

Kör från `apps/web`:

```powershell
npm.cmd run accounts -- seed-test-users
npm.cmd run accounts -- remove-test-users --dry-run
npm.cmd run accounts -- remove-test-users
```

Testkontoseed är idempotent och ändrar inte befintliga riktiga användare.
Borttagning kräver `is_test_account = true`, korrekt fixturemarkering i Auth
`app_metadata`, samma profilmarkering och en identitet i den fasta
fixture-definitionen. E-postdomänen används aldrig ensam som bevis.
