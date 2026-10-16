# FlowX fas 1 – slutförd leverans och handover

> Verifieringsdatum: 2026-08-04
> Repository: `MarcLars31/FlowX-Platform`
> Branch: `Frontend-`
> Omfattning: organisationer, RBAC, tenant-RLS och projektlivscykel

## Status i en mening

Fas 1 är färdig i koden och verifierad lokalt. Organisationsmigrationerna är
också applicerade och verifierade i det länkade FlowX-projektet
`myzegtifgbvjhdlcpebi`.

En Git-commit eller en webbdeployment applicerar inte Supabase-migrationerna
automatiskt. Nya migrationer ska därför alltid appliceras och verifieras i
Supabase innan motsvarande webbapp deployas.

## Levererat i fas 1

### Databas

- `profiles` kopplad till `auth.users`.
- Organisationer och medlemskap i flera organisationer.
- Systemrollerna `organization_owner`, `organization_admin`, `full_user`,
  `mini_user` och `read_only`.
- Permissionkatalog och rollpaket som även stödjer framtida custom roles.
- Team, teammedlemmar och tenantvalidering.
- Projektåtkomstnivåerna `own`, `team`, `organization` och `restricted`.
- Projektmedlemmar samt organisationskopplade dokument-, analys- och
  materiallistetabeller.
- Subscription- och seat-limit-grund.
- Hashade inbjudningar och skyddad RPC för att skapa dem.
- Soft delete, restore och ägarbegränsad permanent radering.
- Append-only `audit_logs` och centrala audit-triggers.
- Säker backfill av befintliga användare och projekt utan ändrade projekt-ID:n.
- RLS på samtliga tenanttabeller.
- Databasfunktioner för medlemskap, roller, permissions och projektåtkomst.
- Skydd mot ändring av tenant- och skaparfält samt korskoppling mellan
  organisationer.
- Skydd mot självuppgradering, kundtilldelad `platform_admin`, sista ägaren och
  överskridna seat limits.

### Webbapplikation

- User-scoped Supabase REST använder den inloggade användarens JWT och RLS.
- Normal kundtrafik använder inte service-role-hjälparen.
- Aktiv organisation väljs server-side.
- Behörighetsstyrd navigation och serverkontrollerade layouts.
- Mini-användare saknar projekt- och analysåtkomst även via direkta API-anrop.
- Projekt skapas och listas permanent i Supabase.
- Projektets åtkomstnivå och team kan väljas vid skapande.
- Organisationsöversikt för medlemmar, roller, team, inbjudningar och seats.
- Skyddad inbjudningsroute.
- Projektlista, papperskorg, aktivitetslogg och lifecycle-API:er.
- Produktläsning och PDF-analys kräver rätt organisationspermission, med
  separat hantering för betrodd `platform_admin`.

### Tester och dokumentation

- TypeScript-enhetstester för roll- och permissionregler.
- 18 pgTAP-fall i `supabase/tests/organization_rbac_rls.sql`.
- Read-only produktionskontroll i
  `supabase/preflight/20260730_organization_rbac_preflight.sql`.
- Datamodell och säkerhetsbeslut i
  `docs/16-organization-rbac-foundation.md`.
- Migrationsordning och driftinstruktioner i
  `docs/17-organization-rbac-operations.md`.

## Supabase-läget som faktiskt verifierades

Länkat FlowX-projekt:

```text
myzegtifgbvjhdlcpebi
```

Read-only kontroll 2026-07-29 visade:

- 1 Auth-användare.
- 1 befintligt projekt.
- Ingen organisation/RBAC-tabell.
- Ingen `projects.organization_id`.
- Fyra gamla owner-baserade projektpolicyer.
- Befintlig `projects.owner_id` hade `ON DELETE CASCADE`.
- Följande migrationer var registrerade:
  - `20260709120000`
  - `20260710210000`
  - `20260712120000`
  - `20260718110000`

`20260729210000_harden_product_review_security.sql` har tidigare applicerats
manuellt och verifierats live, men syns inte i den registrerade
migrationshistoriken. Nästa agent ska verifiera objekten och reparera historiken
kontrollerat; migrationen ska inte blint återköras eller markeras utan kontroll.

Free-planen saknar Supabase-backup. Dashboarden kräver Pro för preview branches
och visade dessutom `$0.01344/hour` i branch compute. Användaren har valt att
vänta med betalningen. Ingen uppgradering eller produktionsmigration är
auktoriserad genom denna leverans.

## Migrationsordning

Den nya organisationskedjan ska köras i exakt filordning:

1. `20260730100000_create_organization_identity_and_rbac.sql`
2. `20260730110000_create_team_project_and_audit_foundation.sql`
3. `20260730120000_backfill_legacy_organization_and_authorization.sql`
4. `20260730130000_enable_organization_rls_and_project_lifecycle.sql`
5. `20260730140000_add_secure_membership_operations.sql`
6. `20260804100000_complete_team_management_rls.sql`

Kör först hela repositoryts migrationskedja och RLS-testet mot en isolerad
databas eller preview branch. Använd inte pgTAP-filen i produktion eftersom den
skapar rollback-fixtures.

## Lokal verifiering

Från `apps/web`:

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test:authz
npm.cmd run test:rbac
npm.cmd run test:extractor
npm.cmd run test:normalizer
npm.cmd run build
```

SQL-testet måste dessutom köras mot en isolerad PostgreSQL/Supabase-databas:

```text
supabase/tests/organization_rbac_rls.sql
```

## Viktiga säkerhetsregler

- Kör inte organisationsmigrationerna direkt i produktion utan ett uttryckligt
  riskbeslut från användaren.
- Driftsätt inte den nya webbappen före databasen; appen failar stängt om aktivt
  medlemskap saknas.
- Använd aldrig `SUPABASE_SERVICE_ROLE_KEY` för normal kundtrafik.
- `platform_admin` får endast komma från betrodd Auth `app_metadata`.
- Låt databasen vara den auktoritativa kontrollen även när UI döljer funktioner.
- Ändra inte gamla, redan applicerade migrationer.
- Radera inte befintliga projekt eller ändra deras ID:n under backfill.
- Lägg aldrig tokens, nycklar eller användardata i dokumentation eller Git.

## Inte del av fas 1

Detta är nästa arbete, inte en ofärdig del av fas 1:

- Inbjudningsmejl och säker acceptans av en inbjudan.
- Projektmedlems- och åtkomsteditor.
- Organisationsinställningar och ägarskapsöverföring.
- Privat Storage-bucket för projekt-PDF.
- Persistenta extraction jobs, analyser och materiallistor.
- Retention-jobb och audited support access för plattformsadmins.
- Växling mellan flera organisationer i UI.

## Rekommenderad fortsättning

1. Koppla inbjudningsmejl och bygg accepterande av en inbjudan.
2. Bygg projektmedlems- och åtkomsteditor.
3. Lägg till organisationsinställningar och ägarskapsöverföring.
4. Inför retention-jobb och granskat supportläge för plattformsadministratörer.
5. Kör RPC/RLS-test före varje ny säkerhetskänslig UI-funktion.
