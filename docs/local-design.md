# Hela ScipX lokalt

Arbetskopia: `C:/Users/marcu/.codex/worktrees/scipx-upgrades/FlowX-Platform`.
Gren: `codex/scipx-upgrades`.

```powershell
cd C:\Users\marcu\.codex\worktrees\scipx-upgrades\FlowX-Platform\apps\web
npm.cmd run dev
```

Öppna http://127.0.0.1:3100. Kundvyn öppnas automatiskt med det lokala testkontot, utan inloggningsformulär eller startsteg. `dev:local` fungerar också och startar samma miljö.
Den tidigare adressen `/local` leder till plattformens arbetsöversikt.
I sidans överkant kan du växla mellan **Kundvy** och **Administration**. Ett befintligt val av administrationskonto behålls när sidan laddas om.

Appens vanliga sidor, komponenter, API-routes, databasfunktioner och
behörighetsregler används. Kundkontot är organisationsägare och kan använda
projekt, projektstyrning, historik, statistik, CRM, regler och organisation.
Administrationskontot öppnar produktkatalog och import/granskning.

En separat PostgreSQL-databas körs med PGlite och repositoryts SQL-migrationer.
Projektets fiktiva produktkatalog och ett lokalt exempelprojekt läggs in första
gången. Projekt, inloggning och uppladdade filer sparas i den Git-ignorerade
mappen `apps/web/.local-platform` och finns kvar efter omstart. Mappen innehåller
lokala lösenord och ska inte delas eller läggas i Git. Ingen produktionsdata kopieras.

## Avgränsning och isolering

Startkommandot kräver utvecklingsgrenen, avvisar produktionsläge och befintliga
databas-/tjänsteuppgifter och ansluter endast till sin egen backend på
`127.0.0.1:54329`. Backend och webbapp lyssnar endast på loopback. Databasens
vanliga RLS-policyer används även lokalt. Lokala snabbkonton är otillgängliga
i produktion och kräver en förfrågan från samma lokala webbplats.

Backend använder en lokal adapter för de REST-anrop appen behöver, inte den
driftsatta Supabase-tjänsten. Ej stödda REST-operationer ger uttryckliga fel.
Detta ersätter därför inte slutlig integrationstestning mot en separat Supabase-
testmiljö före publicering. Auth-SSO, e-postinbjudningar, extern synk och
externa bearbetningstjänster är frånkopplade. Inga e-postmeddelanden skickas.
Publika kataloger kan läsas; externa skrivningar och Supabase-molnåtkomst
blockeras i den lokala webbprocessen.

Nya migrationer tillämpas vid nästa start enbart i den lokala databasen.
Om en redan tillämpad migration har ändrats avbryts starten för att bevara
lokal data. Lägg då till en ny migration. Den hostade pg_cron/pg_net-migrationen
används inte; launchern kör appens befintliga bakgrundsjobb lokalt.

## Det tidigare PDF-testläget

Det avgränsade PDF-läget finns kvar med `npm.cmd run dev:pdf`. Stoppa först
den andra lokala servern eftersom båda använder port 3100. Detta läge saknar
databas, och uppladdning/ändringar försvinner när fliken laddas om.

## Om Git saknas i terminalens PATH

Starten söker först efter `git` i PATH. På Windows kontrolleras även vanliga
Git för Windows-installationer och Git i Codex lokala runtime-cache.
Den installerade Git-klienten används alltid för att kontrollera grenen.
Om Git saknas helt visas ett kort fel med instruktion att installera Git eller
lägga det i PATH och öppna terminalen igen.

## Kontroller

```powershell
npm.cmd run test:local-platform
npm.cmd run typecheck
```

Liveversionen förblir fryst enligt [frysningen](production-freeze-2026-11-09.md).
