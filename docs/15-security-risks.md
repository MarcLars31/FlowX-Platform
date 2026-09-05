# FlowX security risks

> Status: verifierad nulägesgranskning
> Datum: 2026-07-26
> Omfattning: lokal kod, lokala migrationer och live-Supabase
> Klassificering: internt utvecklingsunderlag

## 1. Sammanfattning

FlowX är inte produktionsredo ur säkerhetssynpunkt.

Supabase RLS är aktiverat på bastabellerna och `projects` har användarbaserade
policyer, men applikationens serverkod använder en generell service-role-klient
som kringgår RLS. Flera administrativa API-rutter saknar helt
autentiseringskontroll.

Den akuta prioriteten är:

1. stäng oautentiserad admin- och reviewåtkomst,
2. begränsa service role,
3. korrigera live-grants för reviewfunktionen och vyerna,
4. införa central, fail-closed AuthZ,
5. synkronisera migrationshistoriken.

### Mitigation status 2026-07-29

The first P0 hardening step is complete:

- the admin layout denies unauthenticated users and users without a trusted
  platform role,
- PKMS import and review routes require a platform administrator before they
  use the service-role client,
- product and PDF APIs require an authenticated user,
- authorization reads controlled `app_metadata` and denies unknown roles,
- the Auth client no longer falls back to the service-role key,
- `approve_product_review(uuid)` can only be executed by `service_role`,
- review views use `security_invoker=true`, and `anon` plus `authenticated`
  have no SELECT grant.

The database hardening was applied and verified live. Its reproducible migration
is `supabase/migrations/20260729210000_harden_product_review_security.sql`.
Because the live change was run in SQL Editor, migration history still needs to
be synchronized deliberately. The API protection takes effect in production
only after this code revision is deployed.

## 2. Granskningsmetod

Följande kontrollerades:

- Auth- och sessionskod.
- Next.js-layouts och API-rutter.
- Supabase REST-klienten.
- Projekt-, PDF- och produktflöden.
- Lokala SQL-migrationer.
- Live-tabeller, kolumner, foreign keys och radantal.
- `pg_policies`.
- tabell-/vygrants.
- funktioners ACL och definitioner.
- Supabase Storage-buckets.
- `supabase_migrations.schema_migrations`.

Live-kontrollen genomfördes med skrivskyddade `SELECT`-frågor. Inga tabeller,
policyer, data eller migrationer ändrades.

## 3. Riskklassning

- **P0 – kritisk:** kan ge obehörig administrativ ändring eller allvarlig
  dataexponering.
- **P1 – hög:** sannolik tenant-, sessions- eller integritetsrisk innan
  produktion.
- **P2 – medel:** bristande defense in depth, spårbarhet eller driftsäkerhet.
- **P3 – låg:** förbättring som bör planeras men inte blockerar en intern demo.

## 4. P0 – kritiska risker

### SEC-001: Oskyddade administrativa PKMS-rutter

**Berörda endpoints**

```text
POST  /api/pkms/import-json
POST  /api/pkms/import-pdf
GET   /api/pkms/review-queue
PATCH /api/pkms/review-queue
POST  /api/pkms/review-queue/approve
```

**Observation**

Rutterna anropar inte `getCurrentUser()` och gör ingen kontroll av admin-,
reviewer- eller permissionstatus. De använder därefter hjälpare i
`supabase-rest.ts` som autentiserar med `SUPABASE_SERVICE_ROLE_KEY`.

**Påverkan**

En oautentiserad anropare kan potentiellt:

- skapa granskningsprodukter,
- läsa granskningskön,
- ändra importerad produktdata,
- godkänna produkter,
- skapa extraktionsjobb.

**Rekommenderad omedelbar åtgärd**

Skapa en central serverfunktion, exempelvis:

```text
requirePermission("product.import")
requirePermission("product.review")
requirePermission("product.approve")
```

Blockera alla rutter med `401` eller `403` innan service-role-klienten anropas.
Tills RBAC finns kan en tillfällig, kontrollerad `app_metadata.platform_role`
användas för `platform_admin`.

**Verifiering**

- Oinloggad får `401`.
- Kund utan permission får `403`.
- Reviewer kan läsa/ändra review.
- Endast godkännare kan publicera.

### SEC-002: Adminlayouten är inte fail-closed

**Fil**

```text
apps/web/src/app/admin/layout.tsx
```

**Observation**

Layouten omdirigerar endast när:

```text
user?.user_metadata?.role === "customer"
```

Om `getCurrentUser()` returnerar `null` fortsätter renderingen.

**Påverkan**

Oinloggade användare kan nå admin-UI. I kombination med de oskyddade
API-rutterna blir detta en verklig administrativ risk, inte bara en
presentationsbugg.

**Rekommenderad omedelbar åtgärd**

Kräv först en användare och därefter en säker adminpermission. Okänd, saknad
eller felaktig roll ska alltid nekas.

### SEC-003: Review-RPC kan exekveras av anon/authenticated live

**Databasobjekt**

```text
public.approve_product_review(uuid)
```

**Observation**

Funktionen är `SECURITY DEFINER`, ägs av `postgres` och uppdaterar produktstatus
till `approved`. Live ACL visade explicit `EXECUTE` för:

```text
anon
authenticated
service_role
```

Funktionen innehåller ingen kontroll av `auth.uid()`, roll eller permission.

Den lokala migrationen avser att återkalla `PUBLIC` och ge endast service role
execute, men live-grants avviker från avsikten.

**Påverkan**

En anropare som känner till ett review-ID kan potentiellt publicera produkten
direkt genom Supabase RPC.

**Rekommenderad omedelbar åtgärd**

- Återkalla `EXECUTE` från `PUBLIC`, `anon` och `authenticated`.
- Ge endast en avsiktlig serverroll tillgång.
- Alternativt bygg in en säker `has_permission()`-kontroll och behåll
  `SECURITY DEFINER` med låst `search_path`.
- Lägg en regressionstest som läser ACL efter migration.

### SEC-004: Review-vy kan kringgå underliggande RLS

**Databasobjekt**

```text
public.pkms_review_queue
public.approved_products
```

**Observation**

Vyerna:

- ägs av `postgres`,
- saknar `security_invoker`,
- har SELECT-grant för `anon`,
- har ingen egen RLS.

Underliggande tabeller har RLS men inga policies. En ägarstyrd vy kan ändå läsa
underliggande data med vyägarens behörighet.

`approved_products` kan eventuellt vara avsiktligt publik läsdata, men
`pkms_review_queue` innehåller opublicerade produkter och ska inte vara anonymt
tillgänglig.

**Rekommenderad omedelbar åtgärd**

- Återkalla alla onödiga grants från `anon`.
- Sätt `security_invoker = true` där vyer ska följa anroparens RLS.
- Skapa vid behov en separat, explicit publik read model med endast godkända
  och säkra kolumner.
- Ge inte DELETE/INSERT/UPDATE/TRUNCATE-grants till klientroller på vyer.

## 5. P1 – höga risker

### SEC-005: Generell service-role-klient kringgår RLS

**Fil**

```text
apps/web/src/lib/supabase-rest.ts
```

**Observation**

Alla generella select/insert/update/RPC-hjälpare använder service-role-nyckeln.
Projekt-API:t filtrerar manuellt på `owner_id`, men databasen utvärderar inte
användarens RLS-policy eftersom anropet görs som service role.

**Påverkan**

Ett glömt eller felaktigt filter i en route kan ge korsanvändaråtkomst.

**Åtgärd**

Dela upp i:

```text
supabase-user-server.ts   användarens access token, RLS aktiv
supabase-admin.ts         service role, få tillåtna operationer
```

Gör admin-klienten svår att importera av misstag och undvik generiska
tabellnamnsargument i säkerhetskritiska flöden.

### SEC-006: Rollbeslut baseras på user_metadata

**Observation**

Login, kundskal och adminlayout läser `user_metadata.role`.

**Påverkan**

Användarstyrd metadata är olämplig som auktoritativ permissionkälla. Även om
aktuellt UI inte erbjuder metadataredigering blir modellen felaktig och skör.

**Åtgärd**

- Använd kontrollerad `app_metadata` endast för en liten plattformsroll.
- Lägg organisationsroller och permissions i databasen.
- Auktorisera varje serveroperation, inte bara navigation.

### SEC-007: Projektåtkomst genomdrivs delvis i applikationskod

**Observation**

`projects` har fyra korrekta owner-baserade RLS-policyer, men projekt-API och
företagssida använder service role och manuella filter.

**Påverkan**

RLS ger falsk trygghet eftersom den viktigaste applikationsvägen kringgår den.

**Åtgärd**

Använd user-scoped JWT för projekthämtning och projektskrivning. När
organisationer införs ska RLS utgå från medlemskap och projektåtkomst.

### SEC-008: Projekt raderas hårt och kaskaderar från Auth

**Observation**

`projects.owner_id` refererar `auth.users(id) ON DELETE CASCADE`. RLS tillåter
DELETE för ägaren.

**Påverkan**

Radering av Auth-användare kan permanent radera projekt. Det saknas återställning
och revisionsspår.

**Åtgärd**

- Organisationen ska äga projektet.
- Använd `created_by` med `ON DELETE SET NULL` eller skyddad referens.
- Inför soft delete med `deleted_at`, `deleted_by` och audit event.

### SEC-009: Projektdata ligger i global localStorage

**Fil**

```text
apps/web/src/lib/upload-session.ts
```

**Observation**

Analys, materialrader och produktmatchningar sparas i globala
`flowx.*`-nycklar utan user-/project-namespace.

**Påverkan**

- Data kan läsas av nästa användare i samma webbläsarprofil.
- Data försvinner vid rensad webbläsare eller byte av enhet.
- Projektisolering kan inte garanteras.
- Tekniska resultat saknar audit och versionshistorik.

**Åtgärd**

Spara PDF, analys och materiallista server-side. Använd `localStorage` endast för
icke-känslig, tillfällig UI-cache och namnsätt den per session/projekt.

### SEC-010: PDF-extraktions-API saknar autentisering och rate limit

**Endpoint**

```text
POST /api/pdf-extractor/extract
```

**Observation**

Rutten accepterar upp till 30 MB och gör CPU-/minneskrävande PDF-parsning utan
autentiseringskontroll eller användarspecifik begränsning.

**Påverkan**

Risk för resursmissbruk och denial of service.

**Åtgärd**

- Kräv autentisering och projektåtkomst.
- Rate-limita per användare/organisation/IP.
- Inför job queue, timeout och minnesgräns.
- Validera MIME, filsignatur, sidantal och krypterad/skadad PDF.

### SEC-011: Live-schema och migrationer har drift

**Observation**

- Fem lokala migrationer finns.
- Endast fyra är registrerade live.
- `projects` finns live trots att dess migration inte är registrerad.
- Produktdatabasens grundschema saknas som reproducerbar migration.

**Påverkan**

Nya miljöer kan inte reproduceras säkert. En framtida migration kan anta fel
schema eller återköra objekt.

**Åtgärd**

Skapa baseline, granska den och reparera versionshistoriken innan ny DDL.

## 6. P2 – medelhöga risker

### SEC-012: Refresh-token används inte

Refresh-token sparas i 30 dagar men det finns ingen rotations-/refreshlogik i
applikationen. Access-token som löper ut leder till att `getCurrentUser()`
returnerar null.

Inför en etablerad Supabase SSR-session eller en säker refresh-rutin med
rotation.

### SEC-013: Logout återkallar inte server-sessionen

Logout tar bort cookies lokalt men anropar inte Supabase logout/revoke.

Återkalla refresh-sessionen där möjligt innan cookies tas bort.

### SEC-014: Auth fallback till service-role-nyckel

`supabase-auth.ts` använder service-role-nyckeln om publishable key saknas.
Filen är server-only, men fallbacken gör felkonfiguration farligare.

Kräv en explicit publishable/anon key för Auth-anrop och faila tydligt om den
saknas.

### SEC-015: Ingen central CSRF-/Origin-policy

State-changing rutter använder cookie-baserad Auth men saknar central
Origin-/CSRF-validering. SameSite=Lax minskar men eliminerar inte behovet av
försvar.

Validera Origin/Host och inför CSRF-strategi för cookie-autentiserade skrivningar.

### SEC-016: Ingen audit-logg

Det går inte att säkert svara på vem som:

- importerade en produkt,
- redigerade reviewdata,
- godkände en produkt,
- skapade eller raderade ett projekt,
- körde en analys.

Skapa append-only `audit_events`. Approller ska sakna UPDATE/DELETE.

### SEC-017: Databasfel döljs i företagssidan

Företagssidans projektladdning returnerar tom lista vid databasfel. Det gör
incidenter svårare att upptäcka och kan ge användaren en felaktig bild av att
data saknas.

Logga ett correlation ID server-side och visa ett kontrollerat felstatus-UI.

### SEC-018: Saknade Storage-policies

Ingen Storage-bucket fanns vid granskningen. Innan projekt-PDF implementeras ska
en privat bucket och path-baserade RLS-policyer skapas.

Rekommenderad sökväg:

```text
<organization_id>/<project_id>/<document_id>/<safe-file-name>
```

## 7. Befintliga positiva skydd

Följande kan återanvändas:

- Access- och refresh-cookie är HttpOnly.
- Cookies använder SameSite=Lax.
- Secure-cookie aktiveras i production.
- `projects` har RLS aktiverat och owner-baserade policies.
- Övriga bastabeller har RLS aktiverat, vilket ger deny-by-default vid direkt
  klientåtkomst när inga policies finns.
- Service-role-nyckeln läses endast i server-only-modul.
- `.env` och `.env.local` är ignorerade.
- PDF-filstorleken begränsas till 30 MB.
- Reviewfunktionen låser vald produktrad och validerar viss obligatorisk data.

Dessa skydd kompenserar inte för P0-riskerna.

## 8. Rekommenderad AuthZ-modell

### Identitet

```text
auth.users
profiles
```

### Organisation

```text
organizations
organization_members
organization_member_roles
teams
team_members
```

### RBAC

```text
roles
permissions
role_permissions
```

Exempelpermissions:

```text
organization.manage
member.invite
project.create
project.read
project.update
project.delete
document.upload
analysis.run
material_list.approve
product.import
product.review
product.approve
audit.read
```

### Projektåtkomst

```text
projects.organization_id
projects.visibility
project_members
project_teams
```

RLS ska använda stabila hjälpfunktioner:

```text
is_organization_member(organization_id)
has_permission(organization_id, permission_key)
can_access_project(project_id)
```

Hjälpfunktionerna måste vara små, testade, ha säkert `search_path` och inte
kunna ge högre behörighet än avsett.

## 9. Rekommenderade säkerhetsmigrationer

Skapa nya migrationer i denna ordning:

```text
baseline_existing_pkms_schema.sql
harden_existing_grants_views_and_functions.sql
create_profiles_and_auth_sync.sql
create_organizations_and_memberships.sql
create_roles_permissions_and_role_assignments.sql
create_teams_and_team_members.sql
migrate_projects_to_organization_ownership.sql
create_project_access.sql
create_project_documents_and_storage_policies.sql
create_analyses_and_material_lists.sql
add_soft_delete.sql
create_audit_events.sql
replace_rls_policies_and_restrict_grants.sql
```

Ändra inte gamla migrationer som redan har tillämpats.

## 10. Säkerhetsverifiering före produktion

### Auth

- [ ] Oinloggad nekas alla skyddade sidor och API-rutter.
- [ ] Utgången access-token kan säkert uppdateras.
- [ ] Logout återkallar sessionen.
- [ ] Rollbeslut använder inte user_metadata.

### RLS

- [ ] Organisation A kan inte läsa organisation B.
- [ ] Teambegränsning fungerar.
- [ ] Restricted project kräver explicit access.
- [ ] Soft-deleted data är dold.
- [ ] Service role används inte i normala användartester.

### Produktreview

- [ ] Anon kan inte läsa review queue.
- [ ] Anon/authenticated kan inte direkt exekvera approve-RPC.
- [ ] Reviewer kan redigera men inte publicera utan approvepermission.
- [ ] Varje publicering ger audit event.

### PDF

- [ ] Endast PDF med korrekt signatur accepteras.
- [ ] Storlek, sidantal, timeout och rate limit testas.
- [ ] Storage-objekt är privata.
- [ ] Signed URLs är kortlivade.
- [ ] Sökvägen innehåller korrekt organization/project.

### Drift

- [ ] En tom lokal Supabase kan byggas från migrationerna.
- [ ] Backup och restore är provade.
- [ ] Secrets finns endast i säker miljöhantering.
- [ ] Loggar innehåller inte tokens, lösenord eller dokumentinnehåll.
- [ ] Säkerhetshändelser har correlation ID.

## 11. Första säkra kodleveransen

Den första säkerhetscommiten bör vara liten och endast:

1. göra adminlayouten fail-closed,
2. lägga en central temporär admin/reviewer-guard,
3. använda den på alla PKMS-rutter,
4. lägga tester för `401` och `403`.

Den första säkerhetsmigrationen bör separat:

1. återkalla execute på `approve_product_review` från `PUBLIC`, `anon` och
   `authenticated`,
2. återkalla anonym review-vyåtkomst,
3. sätta `security_invoker` eller ersätta vyerna,
4. verifiera grants efter migrationen.

Kör inte migrationen i produktion innan den har granskats och testats mot en
schema-kopia.

## Uppdaterad status

Projektfiler i `project-files` är nu bundna till både organisation och projekt
genom `20260805110000_harden_storage_project_scope.sql`. In-process rate
limiting och PDF-signaturkontroll är defense-in-depth; produktionsmiljön bör
fortfarande ha distribuerad edge rate limiting och övervakning.
