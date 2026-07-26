# FlowX developer handover

> Senast verifierad: 2026-07-26
> Repository: `MarcLars31/FlowX-Platform`
> Arbetsbranch vid granskningen: `Frontend-`
> Bascommit före denna dokumentationsleverans: `e21fb20`

## 1. Läs detta först

FlowX befinner sig mellan arkitekturfas och fungerande prototyp. Repositoryt
innehåller omfattande strategisk arkitekturdokumentation, en Next.js-applikation,
en Supabase-databas och en PDF-extraktor. Delar av gränssnittet och
produktflödet fungerar, men systemet är ännu inte produktionssäkert eller en
fullständig fleranvändarplattform.

Det viktigaste för nästa utvecklare är att skilja på:

1. **Målarkitekturen** i `docs/Architecture`.
2. **Den versionshanterade baslinjen** på GitHub.
3. **Den lokala, ocommittade implementationen** i nuvarande arbetskatalog.

Vid granskningen innehöll arbetskatalogen många ocommittade kodändringar,
inklusive kundgränssnitt, Auth, projektlagring, produktimporter och
PDF-extraktionsförbättringar. Dokumentationscommiten inkluderar avsiktligt inte
dessa kodändringar. En ny klon från GitHub kan därför sakna funktioner som finns
i den nuvarande lokala arbetskatalogen.

Gör aldrig `git reset --hard`, `git checkout -- .`, `git clean` eller motsvarande
innan det är fastställt vilka lokala ändringar som ska bevaras.

## 2. Vad FlowX är

FlowX är tänkt som en teknisk arbetsplattform för entreprenörer, ingenjörer,
leverantörer och produktansvariga inom VVS, sprinkler och närliggande tekniska
områden.

Den långsiktiga produktidén är att:

1. En kund skapar ett projekt.
2. Kunden laddar upp en teknisk PDF.
3. FlowX extraherar krav, produkter, dimensioner och standardreferenser.
4. Kraven normaliseras och matchas mot produktdatabasen.
5. Saknade eller osäkra produkter går till manuell granskning.
6. En spårbar och versionshanterad materiallista skapas.
7. Resultatet kan granskas, godkännas och exporteras.

Nuvarande implementation når endast delar av detta flöde. Projektets
grunduppgifter sparas permanent, medan projekt-PDF, analys och materiallista
fortfarande huvudsakligen är lokala prototypdata.

## 3. Teknikstack

### Webbapplikation

- Next.js 15 med App Router
- React 19
- TypeScript i strict mode
- Tailwind CSS
- Lucide-ikoner
- `pdf-parse`/`pdfjs-dist` för PDF-text
- ESLint och Node test runner

Applikationen finns i `apps/web`.

### Backend

Backendlogiken består av Next.js Route Handlers under:

```text
apps/web/src/app/api
```

Det finns ingen separat applikationsserver. Route handlers anropar Supabase Auth
eller Supabase PostgREST.

### Databas och identitet

- Supabase Auth
- PostgreSQL i Supabase
- PostgREST-anrop med `fetch`
- SQL-migrationer under `supabase/migrations`

Länkat Supabase-projekt hade vid granskningen projektreferensen:

```text
myzegtifgbvjhdlcpebi
```

Lägg aldrig API-nycklar eller tokens i dokumentationen.

## 4. Repositorystruktur

```text
FlowX-Platform/
├── apps/
│   └── web/                    Next.js-applikationen
│       ├── src/app/            Sidor, layouts och API-rutter
│       ├── src/components/     UI-komponenter
│       ├── src/lib/            Auth, Supabase och pipelinehjälpare
│       ├── src/modules/        PDF-extraktorn
│       └── src/types/          Delade TypeScript-typer
├── docs/
│   ├── Architecture/           Strategisk målarkitektur
│   ├── 13-developer-handover.md
│   ├── 14-new-codex-start-prompt.md
│   └── 15-security-risks.md
├── supabase/
│   ├── config.toml
│   └── migrations/
├── packages/                   Reserverat för delade paket
└── README.md
```

Följande lokala mappar är inte auktoritativa källor:

- `.next`, `.flowx-next`, `dist`, `build` och `node_modules` är genererade.
- `.codex-tmp-pdf-extractor` är en otrackad arbetskopia av den fristående
  PDF-extraktorn och ska inte bli FlowX-källkod av misstag.
- `tmp` innehåller tillfälliga filer.

## 5. Starta projektet lokalt

Krav:

- Node.js 20 eller senare
- npm
- en konfigurerad `apps/web/.env.local`

På Windows kan PowerShell blockera `npm.ps1`. Använd då `npm.cmd`:

```powershell
cd apps/web
npm.cmd install
npm.cmd run dev
```

Öppna:

```text
http://localhost:3000
```

Relevanta kommandon:

```powershell
npm.cmd run lint
npm.cmd run test:extractor
npm.cmd run test:normalizer
npm.cmd run build
```

Miljövariabler som används:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
```

Backend ska i framtiden använda en separat user-scoped Supabase-klient för
normala användaroperationer. `SUPABASE_SERVICE_ROLE_KEY` får aldrig exponeras
till klientkod eller bli standardval för användartrafik.

## 6. Nuvarande användarflöden

### Inloggning

`apps/web/src/lib/supabase-auth.ts` anropar Supabase Auths REST-endpoints direkt.
Access- och refresh-token sparas i HttpOnly-cookies:

```text
flowx_access_token
flowx_refresh_token
```

`getCurrentUser()` validerar access-token genom `/auth/v1/user`.

Rollstyrning sker i dag genom `user_metadata.role`. Live-användaren hade både
`user_metadata.role = customer` och `app_metadata.role = customer`, men koden
läser endast `user_metadata`.

### Kundgränssnitt

`CustomerShell` skyddar kundsidor och visar en gemensam toppnavigation.

Viktiga kundområden:

- `/dashboard`
- `/company`
- `/projects/new`
- `/projects/demo/*`
- `/products`
- `/intelligence`
- `/partners`
- `/news`
- `/profile`
- `/settings`

### Admin

Adminområdet ligger under `/admin`. Nuvarande layout är inte fail-closed:
oinloggade användare omdirigeras inte. Detta är en kritisk säkerhetsbrist.

### Projekt

`POST /api/projects` skapar ett projekt i Supabase:

```text
projects.owner_id = auth user id
```

`GET /api/projects` och företagssidan filtrerar på samma `owner_id`.

Projektet är permanent, men ägs av en individ. `company_name` i Auth-metadata är
bara visningsdata och motsvarar ingen organisationstabell.

### PDF och analys

`POST /api/pdf-extractor/extract`:

1. tar emot PDF som multipart/form-data,
2. läser filen i serverminnet,
3. extraherar sidtext,
4. returnerar ett JSON-resultat.

Original-PDF och projektanalys sparas inte i Supabase.

`apps/web/src/lib/upload-session.ts` sparar i stället följande i webbläsarens
`localStorage`:

- aktivt dokument,
- extraktionsresultat,
- materialrader,
- produktmatchningar,
- saknade produkter,
- kategoriöversikt.

Lagringen är inte namnsatt per användare eller projekt.

Företagssidan länkar till:

```text
/projects/demo/upload?projectId=<uuid>
```

Uppladdningssidan använder inte `projectId` när data sparas. Analysen är därför
inte kopplad till projektet.

`analysis/page.tsx` kan läsa den lokala sessionen. Materialliste- och
produktmatchningssidorna använder fortfarande huvudsakligen demodata.

### Produktdatabas

Det finns två importvägar:

- JSON-import till produktgranskningskön.
- Produktdatabladsextraktion från PDF till samma granskningsflöde.

Produkter skapas med status `needs_review`. Granskningssidan kan redigera rader,
och `approve_product_review(uuid)` flyttar produkten till `approved`.

Detta flöde är globalt och saknar koppling till projekt, användare eller
organisation.

## 7. Datapersistens

| Data | Lagring | Ägare/koppling |
|---|---|---|
| Auth-användare | `auth.users` | Supabase Auth |
| Namn, företag och enkel roll | Auth-metadata | Användaren |
| Projektmetadata | `public.projects` | `owner_id` |
| Projekt-PDF | Inte permanent | Ingen |
| Analysresultat | Webbläsarens `localStorage` | Ingen |
| Produktmatchningar | `localStorage` eller demodata | Ingen |
| Materiallista | Demodata/lokalt tillstånd | Ingen |
| Produktdatablad | Produktkatalogtabeller | Global katalog |
| Importjobb | `extraction_jobs` | Ingen användarkoppling |

## 8. Live-Supabase vid granskningen

Skrivskyddad kontroll 2026-07-26 visade:

- 1 Auth-användare, provider `email`
- 1 projekt
- 1 dokumentpost i produktkatalogen
- 12 extraktionsjobb
- ingen Storage-bucket
- inga projekt-PDF:er i Supabase Storage

Publika bastabeller:

```text
accessories
accessory_product_compatibility
approvals
categories
certifications
documents
extraction_jobs
extraction_raw_lines
manufacturers
product_approvals
product_certifications
product_datasheet_imports
product_documents
product_relationships
product_standards
product_synonyms
product_variants
products
projects
standards
```

Vyer:

```text
approved_products
pkms_review_queue
```

Saknade domäntabeller:

```text
profiles
organizations
organization_members
teams
roles
permissions
project_members
analyses
material_lists
audit_events
```

`documents` och `product_documents` avser produktdatablad. De är inte ett
projektfilsystem.

## 9. Migrationer och schema-drift

Lokala migrationer:

```text
20260709120000_sync_pkms_json_import_schema.sql
20260710210000_add_product_temperature_and_color.sql
20260712120000_add_product_review_workflow.sql
20260718110000_add_product_datasheet_fields.sql
20260726210000_add_customer_projects.sql
```

Live migrationshistorik innehöll endast de fyra första. `projects` och dess fyra
RLS-policyer fanns live men projektmigrationen var inte registrerad.

Dessutom finns stora delar av produktdatabasens grundschema live utan
motsvarande baseline-migration i repositoryt.

Innan fler migrationer skapas:

1. Ta en `supabase db pull`/schema-baseline.
2. Granska diffen manuellt.
3. Versionshantera den befintliga PKMS-strukturen.
4. Reparera migrationshistoriken utan att återköra destruktiv DDL.
5. Skapa nya, framåtriktade migrationer i stället för att ändra gamla.

## 10. Säkerhetsstatus

Systemet är inte produktionsredo.

Kritiska fynd:

1. PKMS-import, granskningskö och godkännande saknar autentiseringskontroll.
2. Rutterna använder service role och kringgår RLS.
3. Adminlayouten tillåter en oinloggad användare att fortsätta.
4. Live-funktionen `approve_product_review(uuid)` kan exekveras av `anon` och
   `authenticated`.
5. `pkms_review_queue` är en `postgres`-ägd vy utan `security_invoker` och har
   anonym SELECT-behörighet.

Läs den fullständiga riskbedömningen i
[15-security-risks.md](./15-security-risks.md).

## 11. Viktigaste källfilerna

### Auth och Supabase

```text
apps/web/src/lib/supabase-auth.ts
apps/web/src/lib/supabase-rest.ts
apps/web/src/app/api/auth/login/route.ts
apps/web/src/app/api/auth/logout/route.ts
apps/web/src/components/CustomerShell.tsx
apps/web/src/app/admin/layout.tsx
```

### Projekt

```text
apps/web/src/app/api/projects/route.ts
apps/web/src/app/projects/new/page.tsx
apps/web/src/app/company/page.tsx
supabase/migrations/20260726210000_add_customer_projects.sql
```

### PDF och analys

```text
apps/web/src/app/api/pdf-extractor/extract/route.ts
apps/web/src/modules/pdf-extractor/extractor.ts
apps/web/src/modules/pdf-extractor/pdf-text.ts
apps/web/src/modules/pdf-extractor/types.ts
apps/web/src/lib/upload-session.ts
apps/web/src/app/projects/demo/upload/page.tsx
apps/web/src/app/projects/demo/analysis/page.tsx
apps/web/src/app/projects/demo/material-list/page.tsx
apps/web/src/app/projects/demo/product-resolution/page.tsx
```

### Produktkatalog och review

```text
apps/web/src/lib/pkms-product-normalizer.ts
apps/web/src/app/api/pkms/import-json/route.ts
apps/web/src/app/api/pkms/import-pdf/route.ts
apps/web/src/app/api/pkms/products/route.ts
apps/web/src/app/api/pkms/review-queue/route.ts
apps/web/src/app/api/pkms/review-queue/approve/route.ts
apps/web/src/app/admin/review/page.tsx
```

## 12. Fristående PDF Product Extractor

Användaren har också arbetat med en fristående applikation kallad **PDF Product
Extractor**, separat från FlowX.

En otrackad arbetskopia finns under:

```text
.codex-tmp-pdf-extractor
```

Den körs normalt på port 4173, kräver Node.js 20+ och Python 3.10+ och exporterar
granskad JSON. Den stöder bland annat:

- sprinklerprodukter per SIN,
- kopplingar per Style eller dimensionsrad,
- generiska specifikationsrader,
- K-faktornormalisering där `6.1 → 61` och `4 → 40`.

Arbetskopian bör flyttas till ett eget repository eller en tydligt versionerad
plats. Den ska inte blandas in i FlowX utan ett avsiktligt arkitekturbeslut.

## 13. Rekommenderad målmodell

Inför följande domäner:

```text
profiles
organizations
organization_members
roles
permissions
role_permissions
teams
team_members
projects
project_members
project_teams
project_documents
analyses
analysis_items
material_lists
material_list_items
audit_events
```

Principer:

- Organisationen, inte personen, äger projektet.
- `platform_admin` kan ligga i kontrollerad `app_metadata`.
- Organisationsroller och permissions ligger i databasen.
- Normal användartrafik använder användarens JWT och RLS.
- Service role används endast i små, skyddade admin-/jobbgränser.
- Projekt kan vara synliga för hela organisationen eller begränsade till
  medlemmar/team.
- Projektfiler lagras i privat Supabase Storage.
- Publicerade analyser och materiallistor versionshanteras.
- Soft delete använder `deleted_at` och `deleted_by`.
- Viktiga ändringar skapar immutable audit events.

## 14. Rekommenderad utvecklingsordning

### Fas 0: bevara arbetet

1. Läs `git status -sb`.
2. Identifiera vilka ocommittade kodändringar som hör ihop.
3. Verifiera att genererade `.next`-filer inte ska med.
4. Gör små, tematiska commits.
5. Pusha kodbasen innan större refaktorering.

### Fas 1: kritisk säkerhet

1. Gör adminlayouten fail-closed.
2. Kräv autentiserad admin/reviewer på samtliga PKMS-rutter.
3. Begränsa `approve_product_review` till service role eller en säker AuthZ-RPC.
4. Säkra vyerna och återkalla onödiga `anon`-grants.
5. Separera user-scoped och admin Supabase-klient.

### Fas 2: schema-baseline

1. Synkronisera live-schema och lokala migrationer.
2. Lägg till reproducerbara migrationstester.
3. Dokumentera varje avvikelse.

### Fas 3: organisation och RBAC

1. Skapa profiler och organisationer.
2. Backfilla befintlig användare och projekt.
3. Lägg till medlemskap, team, roller och permissions.
4. Ersätt owner-only-RLS med organisationsbaserad RLS.

### Fas 4: projektpipeline

1. Skapa privat Storage-bucket.
2. Spara PDF som `project_documents`.
3. Spara analyser och analysrader.
4. Spara produktmatchningar och materiallistor.
5. Ersätt `/projects/demo` med `/projects/[projectId]`.

### Fas 5: spårbarhet och produktionsberedskap

1. Soft delete.
2. Audit-logg.
3. Correlation IDs och strukturerad loggning.
4. Backup-/restore-test.
5. Rate limiting, CSRF-skydd och säkerhetstester.

## 15. Designprinciper att bevara

- Teknisk källdata ska kunna spåras till dokument och sida.
- AI får förklara och assistera men inte bli auktoritativ teknisk källa.
- Produktgodkännande ska vara ett explicit mänskligt steg.
- Extraktion ska bevara råtext, normaliserat värde och confidence.
- Publicerade resultat ska versionshanteras i stället för att skrivas över.
- Organisationsisolering ska genomdrivas i databasen, inte bara i UI.
- Säkerhetskritiska operationer ska vara fail-closed.
- Genererade filer ska inte versionshanteras.

## 16. Saker som inte bör ändras utan analys

- Förstör inte ocommittade lokala ändringar.
- Ändra inte gamla, redan tillämpade migrationer för att “fixa” live-schema.
- Slå inte ihop projekt- och produktdokument utan tydlig migrationsplan.
- Flytta inte tekniska regler till AI-prompts.
- Exponera inte service role i `NEXT_PUBLIC_*` eller `VITE_*`.
- Gör inte globala katalogprodukter organisationsägda utan ett produktbeslut.
- Byt inte PDF-extraktorns normaliseringskontrakt utan regressionstester mot
  Victaulic-filerna.

## 17. Definition of done för nästa större fas

En organisations- och projektfas är inte klar förrän:

- två användare i samma organisation kan dela ett projekt,
- en användare i en annan organisation nekas i databasen,
- begränsade projekt respekterar team och medlemskap,
- PDF, analys och materiallista överlever ny webbläsare/inloggning,
- alla ändringar kan härledas till en användare,
- soft delete och återställning är testade,
- service role inte används för normal projekttrafik,
- RLS-tester körs automatiskt.
