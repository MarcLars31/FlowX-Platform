# FlowX – nulägesanalys (FAS 0)

> Datum: 2026-08-06
> Omfattning: lokal FlowX-kod, fristående PDF-extractor, lokala SQL-migrationer,
> skrivskyddade kontroller mot live-Supabase och publika HTTP-kontroller mot
> `www.scipx.ai`.
> Ändringar i denna fas: endast detta analysdokument. Ingen applikationskod,
> databas, migration, användare eller produktdata har ändrats.

## 1. Sammanfattning

FlowX har en användbar teknisk grund men är inte en färdig plattform för hela
arbetsflödet ännu.

Det som redan är starkt är autentisering, organisationer, roller, team,
projektåtkomst, soft delete, audit-grund, privat projektlagring, beständiga
projekt, PDF/OCR för tekniska beskrivningar, manuell kravgranskning,
Sprsok-sökning och en omfattande föreslagen datamodell för senare steg.

De viktigaste slutsatserna är:

1. **Lokal kod, Git-repository, live-Supabase och publicerad Scipx-app är inte
   synkroniserade.** Ett stort antal funktioner finns bara som lokala ändringar.
   Produktdatabladsflödet och den nya Sprsok-synken är exempelvis inte
   driftsatta.
2. **Produktmatchning, teknisk efterlevnad, kompatibilitetskontroll,
   kommersiell ranking, riktig materiallista och projekt-export är huvudsakligen
   schema eller UI-skal.** Någon komplett körbar motor finns inte.
3. **Det finns ännu ingen säker, realistisk demodatabas.** Befintlig demo är
   hårdkodad i frontend/localStorage och saknar den obligatoriska märkningen
   `Demo data – ej verifierad för projektering, installation eller inköp.`
4. **Den önskade separationen mellan teknik och ekonomi finns i den föreslagna
   databasen, men är inte genomförd som ett komplett serverflöde.** Den måste
   göras till en hård backend-/databasregel, inte bara en UI-princip.
5. **Kodkvaliteten är lovande men verifieringen är ofullständig.** Webbappens
   build, lint, typkontroll och 99 lokala tester passerar. Riktiga HTTP-E2E-test
   och 209 SQL/RLS-test kördes inte eftersom testmiljö, Supabase CLI och Docker
   saknas.

### Övergripande status

| Område | Status | Bedömning |
|---|---|---|
| Supabase Auth och session | Implementerat | HttpOnly-cookies och token-refresh finns. |
| Organisationer, medlemmar och roller | Implementerat | Databas-RBAC och backendkontroller kan återanvändas. |
| Team och projektåtkomst | Implementerat, behöver E2E-verifieras | RLS och API finns. |
| Projektlagring | Implementerat | Projekt sparas i Supabase, inte bara lokalt. |
| Projekt-PDF och teknisk beskrivning | Delvis implementerat | Uppladdning, OCR, metadata och kandidatkrav finns; körs synkront och utan transaktion. |
| Kravgranskning | Delvis implementerat | Manuell bekräftelse/avvisning finns; full versions- och godkännandeyta saknas. |
| Produktdatabas | Delvis implementerat | Sprsok-sökning fungerar mot legacytabell; canonical catalog är inte sammanhållen. |
| Produktdatablad från crawler | Lokalt men ej driftsatt | Live-API och nödvändiga databastabeller/bucket saknas. |
| Teknisk matchning/efterlevnad | Ej implementerat som motor | Tabeller och gates finns, men ingen körbar utvärderare. |
| Kompatibilitet | Ej implementerat som motor | Schema finns, ingen regelmotor eller komplett UI. |
| Kommersiell ranking | Ej implementerat | Schema finns; inga färdiga pris-/lager-/leveranstidsflöden. |
| Materiallista | Demo/schema | Indikativ estimator finns, men ingen verifierad projekt-BOM från matchning. |
| Export | Schema/UI-skal | Produktdokument-CSV finns; komplett projektexport saknas. |
| Spårbarhet | Delvis implementerat | Audit/provenance finns i delar; hela kedjan är inte driftsatt. |
| Demodatabas | Saknas | Frontendmockar finns, men ingen märkt, beständig demo-seed. |

## 2. Bedömningsmodell

För att undvika att lokala filer förväxlas med produktionsfunktionalitet används
följande statusar i dokumentet:

- **Driftsatt:** verifierat i publicerad app och/eller live-Supabase.
- **Implementerat lokalt:** kod finns och kan testas lokalt men är inte säkert
  committad, migrerad eller publicerad.
- **Schema/UI-skal:** tabeller, typer eller sida finns, men inget komplett
  användarflöde.
- **Demo/mock:** hårdkodad eller browserlokal data utan beständig
  produktionsmodell.
- **Saknas:** ingen fungerande implementation hittades.

Analysen bygger på faktisk kod och skrivskyddade kontroller. Äldre dokument har
använts som bakgrund men inte som bevis när de motsäger nuvarande kod eller live-
miljö.

## 3. Nuvarande arkitektur

```text
Webbläsare
   |
   v
Next.js 16 / React 19 (apps/web)
   |-- server-renderade sidor och klientkomponenter
   |-- route handlers under /api
   |-- Supabase Auth-session i HttpOnly-cookies
   |
   +--> användar-JWT --> Supabase REST/Storage --> RLS
   |
   +--> service/secret key --> globala admin- och katalogflöden
   |
   +--> fristående Product PDF Extractor (ej driftsatt/verifierad URL)
   |
   +<-- fristående Python-crawler (lokal och ännu ej committad)

Supabase
   |-- Auth
   |-- PostgreSQL: organisation, RBAC, projekt, krav, katalog, audit
   |-- private Storage: project-files
   `-- planerad private Storage: product-documents (saknas live)
```

### Teknikstack

- `apps/web`: Next.js 16.2.12, React 19.2.8, TypeScript 5.7, Tailwind CSS.
- Backend: Next.js route handlers. Inga server actions hittades.
- Databas/Auth/Storage: Supabase/PostgreSQL med PostgREST och RLS.
- PDF/OCR i FlowX: `pdf-parse`, `@napi-rs/canvas` och `tesseract.js`.
- Crawler: separat Python 3.11-applikation med `httpx`, BeautifulSoup,
  `defusedxml` och SQLite.
- Product PDF Extractor: separat Node/FastAPI/Python-applikation utanför
  FlowX-repositoryt.
- CI: en GitHub Actions-workflow bygger ett OpenNext/Cloudflare/Sites-artefakt.
  Den faktiska domänen har tidigare kopplats via Vercel. En entydig
  produktionspipeline saknas därför i repositoryt.

## 4. Repository- och driftsstatus

### 4.1 Arbetskopia

Vid analysen låg arbetskopian på grenen `Frontend-` och innehöll:

- 51 ändrade spårade filer;
- 66 ospårade poster;
- hela `apps/document-crawler/` som ospårad kod;
- nya admin-, dokumentbearbetnings-, Sprsok- och säkerhetsfiler som ospårade;
- fem ospårade migrationer från `20260805100000` till `20260805140000`;
- fem ospårade SQL-testfiler för dessa migrationer.

Detta är en releaseblockerare. En fungerande lokal build bevisar inte att samma
kod finns i GitHub eller produktion.

### 4.2 Live-Supabase, skrivskyddad kontroll

Följande viktiga objekt svarade live:

- organisationer, medlemskap, roller och permissions;
- `projects`, `project_modules`, `project_settings`, `project_requirements`;
- `project_documents`, `technical_description_documents`;
- `requirement_sets`, `match_runs`, `compatibility_evaluations`,
  `commercial_scenarios`, `material_lists`, `material_list_versions`, `exports`;
- `products`, `product_variants`, `documents`;
- legacytabellen `sprsok_products`;
- privat Storage-bucket `project-files`.

Följande objekt saknades live:

- `product_document_processing_attempts`;
- `product_document_pages`;
- `product_change_proposals`;
- `product_document_review_items`;
- `product_field_provenance`;
- `sprsok_sync_runs`;
- `sprsok_product_search_index`;
- Storage-bucket `product-documents`.

Det visar att produktdatablads-migrationen
`20260805120000_create_product_document_ingestion.sql` och hela nya
Sprsok-synkpipelinen `20260805140000_create_sprsok_sync_pipeline.sql` inte är
driftsatta i sin avsedda form.

Observerade radantal var 5 organisationer, 1 projekt, 0 projektkrav, 0
projektdokument, 2 tekniska beskrivningar, 140 canonical products, 0
produktvarianter, 1 globalt dokument och 414 Sprsok-rader. Radantalet är endast en
nulägesbild, inte en kvalitetsverifiering.

### 4.3 Publicerad Scipx-app

Skrivskyddade HTTP-kontroller gav:

- `/` → 200;
- `/api/products/search` utan session → 401, vilket är korrekt;
- `/projects/new` utan session → redirect, vilket är korrekt;
- `/api/pkms/document-processing/ingest` → 404;
- `/admin/sprsok` → 404.

Produktion saknar alltså de lokala ingest- och Sprsok-adminfunktionerna.
Produktionssvaret hade HSTS, men inte de övriga säkerhetsheaders som den lokala
`next.config.ts` nu definierar. Det är ytterligare ett tecken på deploy-drift.

### 4.4 Fristående Product PDF Extractor

Extractorn finns i `C:\Users\marcu\Documents\GitHub\PDF-Extractor`, alltså
utanför FlowX. Hela repositoryt är ospårat, saknar commit-historik och saknar
Git-remote. Den kan lokalt extrahera Victaulic- och Viking-datablad, men FlowX
har ingen konfigurerad `PRODUCT_PDF_EXTRACTOR_URL` i lokal miljö och någon
driftsatt tjänst har inte verifierats.

Det betyder att denna centrala komponent kan förloras och inte kan byggas
reproducerbart från FlowX-repositoryt.

## 5. Frontend

### 5.1 Sidor som använder riktig Supabase-data

- `/dashboard`: organisationskontext, men nyhetsinnehållet är hårdkodat.
- `/organization`, `/organization/settings`, `/organization/activity`,
  `/organization/trash`: organisations- och auditdata.
- `/projects`, `/projects/new`, `/projects/[id]`: beständiga projekt och
  projektartefakter.
- `/products`: Sprsok-sökning, filter, pagination och enkla liknande produkter.
- `/technical-descriptions`: beständig PDF/OCR och materialestimat.
- `/admin`, `/admin/review`: JSON-import och produktgranskning.

### 5.2 Sidor som bara är skal

Alla dynamiska projektdelar under `/projects/[id]/[section]` visar i dag samma
generiska informationskort. Det gäller bland annat:

- analys;
- produktmatchning;
- materiallista;
- export;
- aktivitet;
- projektinställningar och projektteam.

Den riktiga projektöversikten har flikar för dokument, krav, produktförslag och
beslut, men produktförslag är endast en läsvy över redan existerande rader. Det
finns ingen knapp eller backend-route som kör en matchningsmotor.

### 5.3 Hårdkodad och lokal demo

`apps/web/src/lib/mock-data.ts` innehåller en stor parallell demo för projekt,
analys, produktval och materiallista. Sidorna under `/projects/demo/*` använder
den tillsammans med `localStorage` i `upload-session.ts`.

Problem:

- data är inte knuten till användare, organisation eller riktigt projekt;
- data kan ligga kvar för nästa användare i samma browserprofil;
- resultat saknar audit, versioner och beständighet;
- demoflödet duplicerar det riktiga projektflödet;
- den obligatoriska demovarningen visas inte med exakt formulering;
- vissa äldre komponentlänkar pekar alltid på `/projects/demo`.

Demoflödet ska ersättas med en idempotent Supabase-seed och samma riktiga API-
och RLS-vägar som övriga projekt. Det ska inte utvecklas vidare som parallell
lösning.

### 5.4 Menyer och länkar

- Kundnavigationen är permissionstyrd och kan återanvändas.
- Kontomenyn fungerar, men “Profil” och “Inställningar” leder till samma sida.
- Startsidan visar “Läs mer” utan fungerande länk och saknar riktiga sidor för
  företag/leverantörer och branschnyheter.
- `ProjectListControls` använder vanlig `<a>` i stället för Next `Link`, vilket
  ger full sidladdning.
- `ProjectCard` är oanvänd och pekar hårdkodat på demo.
- Lokala adminmenyer pekar på sidor som inte finns i publicerad app.

### 5.5 Laddnings-, fel- och tomlägen

De nyare klientflödena har generellt laddnings-, fel- och tomlägen. De
server-renderade sidorna saknar däremot gemensamma `loading.tsx` och `error.tsx`.
Flera serverfel blir `null`, redirect eller 404 utan ett spårbart fel-ID.

## 6. Backend och API

### 6.1 Autentisering och auktorisering

Inloggning sker mot Supabase Auth. Access- och refresh-token sparas i HttpOnly,
SameSite=Lax-cookies; secure-cookie används i produktion. Middleware roterar
sessionen när access-token saknas, är ogiltig eller närmar sig utgång.

Plattformsrollen läses från skyddad `app_metadata`. Organisationsroller och
permissions läses ur databasen. Vanliga tenantoperationer skickas till
Supabase med användarens JWT så att RLS är aktiv.

Detta är en bra och återanvändbar modell:

```text
Auth user
  -> aktiv organization_members-rad
  -> role
  -> role_permissions
  -> backend guard
  -> användar-JWT
  -> RLS
```

Service/secret key används fortfarande för globala produkt- och adminflöden.
De aktuella route-handlerna har backendguard, men den generella
`supabase-rest.ts` kan fortfarande kringgå RLS och ska hållas strikt avgränsad.

### 6.2 Projekt-API

Projekt skapas atomiskt via databasanropet `create_project_with_defaults`.
RPC:n verifierar medlemskap, permission, teamets organisation och skapar
projekt, inställningar, sprinklermodul, projektmedlem och audit-event.

En funktionell brist är att formuläret samlar in fler fält än RPC:n sparar.
`endCustomer`, `address`, `procurementStrategy`, `warehouseLocation`,
förväntade datum, interna kommentarer och tekniska parametrar valideras lokalt
men skickas inte vidare till RPC:n. Användaren kan därför tro att data sparats
när den har ignorerats.

Projektstatus är också inkonsekvent mellan TypeScript-hjälpare, PATCH-route,
UI och SQL-constraints. Exempelvis förekommer `on_hold`, `completed` och
`deleted` i delar av modellen men inte i samma uppsättning överallt.

### 6.3 Teknisk beskrivning och krav

Uppladdningen:

1. verifierar användare, permission, projekt och aktiv sprinklermodul;
2. begränsar filstorlek och kontrollerar `%PDF`-signatur;
3. extraherar text eller OCR;
4. skapar tekniskt dokument, projektfil och extraktionskörning;
5. sparar sidor, materialrader, regelhints, kandidatkrav och väntande krav;
6. låter användaren bekräfta, markera oklart eller avvisa krav.

Flödet är beständigt men inte transaktionellt. Många rader skrivs en i taget
efter att CPU-tung OCR körts i samma HTTP-anrop. Ett fel mitt i flödet kan lämna
ett tekniskt dokument, en misslyckad projektfil eller en delmängd av sidor och
krav. Dubblettkontrollen gäller projektfilens checksumma men det första
`technical_description_documents`-inlägget skapas före denna kontroll.

### 6.4 Produktdata och sökning

Kundsökningen använder främst `sprsok_product_search` och faller tillbaka till
legacytabellen `sprsok_products`. Den canonical tekniska katalogen
`products`/`product_variants` används inte som primär sökmodell.

“Liknande produkter” är en enkel poängsättning av lika leverantör, typ,
utförande, RTI och K-värde. Det är inte en teknisk efterlevnads- eller
kompatibilitetskontroll.

Det finns därmed tre delvis separata produktvärldar:

1. legacy Sprsok-rader som kunder söker i;
2. canonical `products`/`product_variants` för den planerade tekniska motorn;
3. äldre PKMS JSON-import/review.

De måste sammanföras genom en tydlig canonical mapping, inte behållas som tre
parallella sanningar.

### 6.5 Produktdatablad och crawler

Den lokala ingestpipelinen har en genomtänkt struktur: privat PDF, checksumma,
idempotens, behandlingsförsök, sidresultat, felkoder, kandidater, provenance,
fältlås, ändringsförslag, manuell review och audit.

Den fungerar inte end-to-end i nuvarande miljö eftersom:

- API-routen inte finns i publicerad app;
- de centrala databastabellerna saknas live;
- Storage-bucket `product-documents` saknas live;
- den fristående Product PDF Extractor saknar verifierad tjänsteadress;
- hela crawlern och flera integrationsfiler är ospårade.

### 6.6 AI-flöde

Någon LLM/AI-tjänst används inte i dag. Extraktionerna är deterministiska
regex-/tabellregler kombinerat med PDF-text och Tesseract OCR. Komponenter som
heter AI-assistent visar hårdkodad demotext.

Det är positivt ur spårbarhetssynpunkt, men UI och dokumentation får inte antyda
att en AI-baserad teknisk bedömning har körts när så inte är fallet.

## 7. Databas och RLS

### 7.1 Befintlig domänmodell

Databasen innehåller eller föreslår redan rätt huvuddomäner:

- identitet: `auth.users`, `profiles`;
- organisation/RBAC: `organizations`, `organization_members`, `roles`,
  `permissions`, `role_permissions`, abonnemang och inbjudningar;
- team/projekt: `teams`, `team_members`, `projects`, `project_members`,
  `project_settings`, `project_modules`;
- dokument/krav: `project_documents`, `document_pages`, `extraction_runs`,
  `requirement_sets`, `requirement_candidates`, `project_requirements`, evidence
  och konflikter;
- teknisk katalog: produkter, varianter, tillverkare, kategorier, attribut,
  standarder, certifieringar, approvals och produktdokument;
- teknisk utvärdering: `match_runs`, `match_candidates`,
  `requirement_evaluations`, kompatibilitetsregler/-utvärderingar;
- kommersiellt: suppliers, supplier products, `supplier_offers` och
  `commercial_scenarios`;
- resultat: materiallistor, versioner, alternativ, exports och beslut;
- spårbarhet: `audit_logs`, provenance och historiktabeller.

Denna modell bör byggas vidare på. En ny parallell projekt-, användar- eller
produktmodell behövs inte.

### 7.2 Teknisk och kommersiell separation

`supplier_offers` och `commercial_scenarios` är separerade från tekniska
produkter och kravresultat i schemat. Det är rätt riktning. Det saknas däremot en
färdig tjänst som genomdriver ordningen.

Följande regel måste kodas i backend och databas:

```text
mandatory technical requirements
  -> approval/scope check
  -> compatibility check
  -> eligibility decision
  -> ranking of eligible candidates
  -> price/stock/lead-time comparison
```

En kandidat med `FAIL` på ett obligatoriskt krav får aldrig få
`commercial_rank`, väljas i materiallista eller publiceras som godkänt
alternativ. `UNKNOWN` ska kräva manuell teknisk granskning och får inte
automatiskt behandlas som `PASS`.

### 7.3 RLS och databasfunktioner

Lokala migrationer innehåller ett omfattande RLS-upplägg med:

- `is_organization_member`;
- `has_permission`;
- `can_access_project` och deleted-project-kontroll;
- projekt-/team-/restricted-access;
- tenantvaliderande triggers;
- privata Storage-policyer;
- append-only audit;
- SECURITY DEFINER-funktioner med låst `search_path` och begränsad execute.

Det är en stark återanvändbar grund. SQL-testerna täcker avsedd isolering, men
de har inte körts i denna fas.

### 7.4 Schema- och migrationsrisker

- Repositoryt saknar en fullständig baseline för ursprungliga PKMS-tabeller som
  `products`, `product_variants`, `extraction_jobs`, kategorier, tillverkare och
  produktdokument. Tidiga migrationer antar att de redan finns.
- `supabase/config.toml` saknas, så en tom lokal Supabase kan inte startas och
  migreras med ett dokumenterat standardkommando.
- Flera migrationer är ospårade samtidigt som delar av deras schema redan finns
  live. Det är schema drift och migrationshistoriken är inte reproducerbar.
- `approvals` och `product_approvals` skapas utan att repositoryt uttryckligen
  aktiverar RLS eller låser grants för dem. Eftersom de är global katalogdata
  kan det vara avsiktligt, men live-ACL måste verifieras och skrivningar ska
  endast tillåtas via kontrollerat adminflöde.

## 8. Materiallista, pris, lager och export

Det finns två olika materialkoncept:

1. `material_estimates` beräknar en indikativ mängd från m², kvot och
   regelrader. Det är en uppskattning, inte en projekterad BOM.
2. `material_lists` och dess versioner är avsedda för matchade produkter,
   godkännanden och export, men saknar komplett backend/UI.

Pris, lager och leveranstid har schema i `supplier_offers` men inget färdigt
import-, tidsstämplings-, stale-data- eller rankingflöde. En gammal eller okänd
offert får inte visas som aktuell utan `observed_at`, giltighetstid, valuta,
kvantitetsenhet och källa.

Produktdokument-admin kan exportera CSV, men komplett projektexport – inklusive
krav, evidens, PASS/FAIL/UNKNOWN, valda produkter, alternativ, priser,
materiallista, beslutslogg och versions-ID – är inte implementerad.

## 9. Säkerhetsrisker

### P0 – blockerar säker demo/produktion

#### SEC-P0-01: Lokal kod och produktion har stor drift

Ospårade routes och migrationer kan inte granskas, återskapas eller publiceras
pålitligt. Produktion returnerar 404 för funktioner som finns lokalt.

**Åtgärd:** skapa en ren, granskad releasegren; committa i logiska delar;
bygg staging från Git; applicera och verifiera migrationer där innan
produktion.

#### SEC-P0-02: Databasen kan inte reproduceras från repositoryt

Grundschema saknas som baseline, flera lokala migrationsfiler är ospårade och
ingen lokal Supabase-konfiguration finns.

**Åtgärd:** skapa en granskad baseline från ett schema-only dump, stäm av mot
live migration ledger och verifiera tom installation samt restore. Kör inte en
baseline blint mot produktion.

#### SEC-P0-03: Demodata saknar teknisk säkerhetsklassning

Befintlig mockdata saknar en genomdriven `demo`-provenance och exakt varning.
Det finns risk att fiktiva värden ser ut som verifierade produktdata.

**Åtgärd:** inför dataset/provenance i databasen och visa på varje berörd sida,
produkt, materiallista och export:

> Demo data – ej verifierad för projektering, installation eller inköp.

#### SEC-P0-04: Teknisk eligibility är inte en hård regel ännu

Schema uttrycker separation, men det finns ingen komplett motor eller constraint
som bevisar att en tekniskt underkänd produkt aldrig kan rankas eller väljas.

**Åtgärd:** implementera en serverägd eligibility-pipeline och negativa
regressionstester innan kommersiell ranking aktiveras.

### P1 – hög prioritet

#### SEC-P1-01: Generisk service-key-klient kringgår RLS

Admin- och globala katalogrutter är nu guardade, vilket reducerar risken, men en
framtida route kan importera den generiska klienten och glömma tenantfilter.

**Åtgärd:** ersätt generiska adminoperationer med domänspecifika repositories,
minimera service-key-ytan och lägg import-/route-guardstest i CI.

#### SEC-P1-02: Ingen central Origin/CSRF-policy

Skrivande routes använder cookie-session. SameSite=Lax hjälper men ersätter inte
central validering av Origin/Host för alla state-changing browseranrop.

**Åtgärd:** central request-guard och regressionstest för främmande Origin.

#### SEC-P1-03: OCR och databasskrivningar körs synkront och icke-transaktionellt

Stora dokument kan överskrida serverlessgränser. Delvisa skrivningar kan bli
kvar efter fel.

**Åtgärd:** direkt upload till privat Storage, atomisk jobbskapning,
bakgrundsworker, idempotenta steg, retry/dead-letter och transaktionell
slutförande-RPC.

#### SEC-P1-04: Product PDF Extractor är oförvaltad

Tjänsten är helt ospårad och saknar deployment. FlowX litar på dess JSON för
tekniska kandidatfält.

**Åtgärd:** lägg den i versionskontroll, CI, container registry och staging;
versionera schema, parser och checksumma i provenance.

#### SEC-P1-05: Privata projektfiler är inte bundna till dokument-ID i policyn

Storage verifierar organisation och projekt men inte att tredje sökvägssegmentet
motsvarar en faktisk `project_documents`-rad. Metadata och objektlivscykel kan
driva isär.

**Åtgärd:** använd
`<organization>/<project>/<document-id>/<safe-name>` och verifiera raden i RLS.

#### SEC-P1-06: Legacy localStorage-flöde är inte tenant-isolerat

Demoanalys och materialdata kan ligga kvar mellan användare i samma browser.

**Åtgärd:** ta bort projektdata från localStorage när Supabase-demoseed är klar.

### P2 – bör åtgärdas före bred lansering

- Logout rensar cookies men återkallar inte Supabase refresh-sessionen.
- Rate limit ligger i minnet per varm worker och fungerar inte globalt över
  serverlessinstanser.
- Lokal headerkonfiguration saknar Content-Security-Policy; publicerad app saknar
  dessutom flera lokalt definierade headers.
- Sju lokala produktdokumentfiler innehåller faktisk mojibake och kan visa fel
  text eller försämra språkklassificering.
- Full dependency audit rapporterar fyra sårbarheter i dev/build-kedjan
  (en high och tre moderate via `wrangler`/`undici`/OpenNext). Produktions-
  dependencies rapporterar 0 kända sårbarheter.
- Felhantering saknar gemensamt correlation ID och central strukturerad loggning.
- Det finns ingen verifierad backup-/restore-övning, incidentrutin eller
  retentionpolicy för dokument.

## 10. Prestanda och driftsäkerhet

### Identifierade flaskhalsar

- `getOrganizationContext` gör flera sekventiella Supabase-anrop för nästan
  varje skyddad sida.
- Projektdetaljsidan gör därefter många ytterligare tabellanrop sekventiellt.
- Projektlistan filtreras helt i klienten och saknar serverpagination.
- Produktsökningen använder `no-store` och gör extra dokumentuppslag; den nya
  sökindexmigrationen är inte live.
- Tekniska PDF:er OCR-tolkas och sparas i samma request.
- Material- och kravrader insertas en i taget.
- Vanliga `<a>`-länkar ger full sidomladdning på vissa projektsidor.

### Rekommenderade åtgärder

1. En server-RPC/view för komplett organisationskontext.
2. En projektöversikts-RPC som returnerar sammansatt read model i ett anrop.
3. Parallellisera oberoende queries och lägg serverpagination på projekt.
4. Bakgrundskö för OCR, crawler-ingest, produktparser och matchningskörningar.
5. Batch-/RPC-skrivningar för sidor, kandidater och materialrader.
6. Distribuerad rate limiting i edge/gateway.
7. Mät p50/p95 för login, dashboard, projekt, sökning, upload och matchning.

## 11. Tester och verifieringsresultat

### Utfört och passerat

- `npm run lint`;
- `npm run typecheck`;
- Next production build: 47 routes/sidor genererade;
- 99 Node/TypeScript-tester för auth, route guards, RBAC, PDF-säkerhet,
  teknisk beskrivning, demoextractor, normalisering, produkt-PDF staging,
  testkontosäkerhet och Sprsok;
- crawler: 56 pytest-test;
- crawler: Ruff;
- crawler: direkt mypy-kontroll av 19 källfiler;
- fristående Product PDF Extractor: 17 Python-test passerade, 7 valfria
  referens-PDF-test hoppades över, build-verifiering passerade;
- produktionsdependencies: 0 rapporterade npm-sårbarheter.

### Ej verifierat eller avvikande

- HTTP-E2E-sviten hoppades över eftersom `.env.test.local` och explicit opt-in
  saknas.
- SQL/RLS-sviterna har totalt 209 assertions men kunde inte köras eftersom
  Supabase CLI och Docker saknas.
- Crawlerns standardkommando `mypy` misslyckas eftersom paketet saknar
  `py.typed`; `mypy src/document_crawler` passerar.
- PDF Extractors Node self-test hoppades över eftersom `REFERENCE_PDF` inte var
  satt.
- Next build varnar att `middleware.ts`-konventionen är deprecated och bör
  migreras till `proxy`.
- Full npm-audit innehåller fyra dev/build-sårbarheter.
- Inget riktigt browser-E2E-verktyg som Playwright eller Cypress finns i
  webbprojektet.
- GitHub-workflowen kör build men inte lint, typkontroll, tester, SQL-test eller
  säkerhetskontroller.

## 12. Befintliga delar som ska återanvändas

Följande bör behållas och förbättras, inte byggas parallellt:

- Supabase Auth-session och refresh-middleware;
- `app_metadata` för den lilla plattformsrollen;
- organisationer, medlemskap, roller, permissions och role-permission mapping;
- central backendguard för plattforms- och organisationsoperationer;
- användar-JWT-baserad Supabase-klient och RLS;
- team-, projektmedlems- och access-level-modell;
- atomisk `create_project_with_defaults`;
- soft delete, retention och auditgrund;
- projektstyrningens server-side workflow gates;
- privata `project-files` och checksumma;
- teknisk beskrivnings-OCR, sidspårning och manuell kravgranskning;
- canonical produkt-/variant-/attributmodell;
- separata tekniska och kommersiella tabeller;
- produktdatabladsförslagets attempts, pages, provenance, locks, proposals och
  reviewmodell;
- crawlerns robots-, domän-, SSRF-, dedup-, retry- och resume-arkitektur;
- fristående Product PDF Extractors domänspecifika parsers efter att den har
  versionshanterats.

## 13. Delar som behöver byggas om eller slås ihop

### Bygg om

- synkron OCR/upload till jobb-baserad pipeline;
- generisk service-key dataåtkomst till domänspecifika adminrepositories;
- projektstatus till en enda gemensam enum/kontrakt;
- projektsidans många queries till sammansatt read model;
- demo/localStorage till riktig Supabase-seed;
- statisk AI-förklaring till spårbar regel-/evidensförklaring;
- deployprocess till en enda Git-baserad staging- och produktionsväg.

### Slå ihop

- Sprsok, canonical products och PKMS review till en canonical produktidentitet;
- teknisk beskrivningsmaterialrader, kandidatkrav och bekräftade krav till ett
  tydligt versionsflöde;
- `/projects/demo/*` med det riktiga projektflödet;
- separata placeholderprojektsidor med verkliga projektmoduler;
- dokumentstatus och produktprovenance till en enda granskningskedja.

### Ta bort när ersättning finns

- `mock-data.ts` i användarflöden;
- globala `flowx.*`-nycklar i localStorage;
- oanvänd `ProjectCard` och hårdkodade demolänkar;
- hårdkodade nyheter som ser publicerade ut;
- dubbla eller missvisande “AI”-presentationer.

## 14. Rekommenderad datamodell för demodatabas och komplett flöde

Den befintliga modellen ska utökas, inte ersättas.

### 14.1 Dataset och provenance

Inför ett litet gemensamt lager:

```text
data_sets
  id
  code                 -- exempel: scipx-demo-v1
  data_mode            -- demo | verified | external_unverified
  name
  version
  disclaimer
  source_description
  active_from / active_to
  created_at / created_by

data_set_membership eller data_set_id på seedade globala rader
```

Alla demo-produkter, dokument, offers, referensprojekt och materiallistor måste
ha ett spårbart `data_set_id`. API:t ska returnera `dataMode` och `disclaimer`.
UI och export ska visa varningen centralt och på relevant rad-/dokumentnivå.

`is_demo` kan finnas som indexerad bekvämlighetskolumn, men får inte vara den
enda provenancen.

### 14.2 Teknisk katalog

```text
manufacturer
  -> product family
  -> product
  -> product variant / orderable item
  -> typed attribute values
  -> approvals/certifications/scope
  -> product documents + field provenance
```

Sprsok ska mappas till orderbara varianter via stabil extern identitet och
källsnapshot. Pris och lager ska aldrig lagras som tekniska produktattribut.

### 14.3 Projektkrav och tekniskt beslut

```text
project document
  -> extraction run
  -> requirement candidate + evidence
  -> human review
  -> immutable confirmed requirement set version
  -> match run
  -> candidate technical evaluations
  -> compatibility evaluations
  -> eligibility decision
```

Varje obligatoriskt krav ska ha typ, operator, normaliserat värde, enhet,
källsida, excerpt, confidence och granskningsstatus.

### 14.4 Kommersiell jämförelse

Endast `eligible = true` får gå vidare:

```text
eligible product variant
  -> supplier product mapping
  -> timestamped supplier offer
  -> price/stock/lead-time normalization
  -> commercial scenario
  -> rank
```

Ranking ska spara viktning, inputversion och förklaring. En teknisk status får
inte skrivas om av rankingsteget.

### 14.5 Materiallista och export

Materiallistan ska peka på exakt match run, requirement set, offer snapshot och
produktversion. Godkänd version blir immutable; ändrad indata skapar ny version
och markerar senare resultat stale. Exporten ska peka på godkänd
materiallisteversion och bära samma demo-/verifieringsmärkning.

## 15. Rekommenderade migrationer

### Först: inventering och driftåterställning

1. **Schema-only baseline för pre-migration PKMS** – genereras från granskad
   källa och används endast för nya miljöer.
2. **Migration-ledger reconciliation** – dokumenterad avstämning av vilka
   befintliga migrationer som redan är applicerade live.
3. Applicera och testa de redan skrivna migrationerna för storage hardening,
   produktdatablads-ingest och Sprsok-pipeline i staging.

### Därefter: nya migrationer

1. `add_demo_data_sets_and_provenance.sql`
   - `data_sets`, datasetreferenser, constraints och read policies.
2. `harden_legacy_catalog_acl.sql`
   - verifierad RLS/grants för approvals, mappings, views och RPC:er.
3. `bind_project_storage_objects_to_documents.sql`
   - dokument-ID i path och metadata-/objektpolicy.
4. `create_background_job_lifecycle.sql`
   - idempotenta jobb, leases, retries och dead-letter-status för OCR/matchning.
5. `enforce_technical_eligibility.sql`
   - immutable evaluations och constraint/RPC som blockerar ranking av FAIL och
     automatisk ranking av UNKNOWN.
6. `complete_compatibility_rules.sql`
   - versionsstyrda regler, scope och evidence.
7. `complete_commercial_offer_snapshots.sql`
   - valuta, enhet, observerad tid, giltighet, lager och leveranstid.
8. `complete_material_list_approval_and_export.sql`
   - immutable approval, stale-regler och exportmanifest.
9. `add_operational_observability.sql`
   - correlation/run IDs, säkra felkoder och retentionmetadata.

Demorader ska läggas i ett separat, idempotent seedverktyg – inte blandas med
produktionsmigrationer. Seedningen ska kunna köras i staging/produktion endast
med explicit flagga, använda stabila UUID:n, aldrig skriva över externa data och
kunna tas bort enbart via `data_set_id`.

## 16. Filer som behöver ändras i kommande faser

### Gemensam grund och release

- `.github/workflows/build-sites-opennext.yml` eller ersättande entydig deploy-
  workflow;
- root-README och `apps/web/README.md`;
- `apps/web/package.json` med ett samlat `check`-kommando;
- ny `supabase/config.toml` och dokumenterade lokala kommandon;
- samtliga nu ospårade migrationer, SQL-test och crawlerfiler ska granskas och
  versionshanteras.

### Auth, säkerhet och requestlager

- `apps/web/src/middleware.ts` till stödd Next `proxy`-konvention;
- `apps/web/src/lib/supabase-rest.ts` och domänspecifika ersättare;
- `apps/web/src/lib/organization-context.ts`;
- ny central Origin/CSRF-guard;
- `apps/web/src/app/api/auth/logout/route.ts`;
- `apps/web/next.config.ts` för CSP och full headerpolicy.

### Projekt och dokument

- `apps/web/src/app/api/projects/route.ts` och create-RPC-signaturen;
- `apps/web/src/app/api/projects/[id]/route.ts`;
- `apps/web/src/lib/project-governance.ts`;
- `apps/web/src/types/organization.ts` och genererade Supabase-typer;
- `apps/web/src/components/ProjectWorkspace.tsx`;
- `apps/web/src/app/projects/[id]/[section]/page.tsx` ska delas i riktiga
  modulsidor;
- `apps/web/src/app/api/technical-descriptions/route.ts` ska bli jobbskapare;
- ny worker för OCR och kravpersistens.

### Produkter, crawler och extractor

- `apps/web/src/app/api/products/search/route.ts`;
- `apps/web/src/lib/sprsok-*` och `apps/web/src/cli/product-sync.ts`;
- `apps/web/src/app/api/pkms/document-processing/*`;
- `apps/web/src/lib/product-document-*` och `product-pdf-*`;
- `apps/web/src/components/ProductDocumentReview.tsx`;
- hela `apps/document-crawler/`;
- fristående `PDF-Extractor` ska få eget versionshanterat repository eller
  införas som tydligt separat workspace/service.

### Matchning, kompatibilitet och ekonomi

Nya domänmoduler behövs, exempelvis:

```text
apps/web/src/modules/requirements/
apps/web/src/modules/compliance/
apps/web/src/modules/compatibility/
apps/web/src/modules/matching/
apps/web/src/modules/commercial-ranking/
apps/web/src/modules/material-lists/
apps/web/src/modules/exports/
```

Varje modul ska ha tydliga TypeScript-kontrakt, serverrepository, tjänst,
route/API och tester. UI får inte implementera domänbeslutet.

### Demo och presentation

- ersätt `apps/web/src/lib/mock-data.ts` och `upload-session.ts`;
- ersätt `/projects/demo/*` med seedade riktiga projekt;
- lägg gemensam `DemoDataNotice` i layout, produktkort, matchning,
  materiallista och export;
- ersätt dashboardens hårdkodade nyheter med en modererad datamodell eller
  tydligt märkt redaktionellt innehåll.

## 17. Prioriterad implementationsordning

1. **Stabilisera repository och staging.** Inga fler domänfunktioner innan
   Git, deploy och migrationshistorik är reproducerbara.
2. **Täta P0-säkerhets- och demomärkningsrisker.** Skapa dataset/provenance och
   hård technical-eligibility-regel.
3. **Driftsätt dokumentkedjan.** Crawler, privat Storage, extractor, review och
   provenance ska fungera end-to-end i staging.
4. **Slå ihop produktkatalogerna.** Sprsok och importer ska mappas till
   canonical product/variant.
5. **Färdigställ kravversionering och approval.** Ingen matchning på obekräftade
   eller stale krav.
6. **Bygg teknisk compliance och compatibility.** Deterministiskt, versionerat
   och spårbart.
7. **Bygg kommersiell ranking endast för eligible produkter.** Lägg därefter
   pris, lager och leveranstid.
8. **Bygg materiallista, approval och export.** Bevara alla versioner och
   evidens.
9. **Prestanda, browser-E2E, observability, backup/restore och UAT.** Först
   därefter kan plattformen bedömas som produktionsredo.

## 18. Kontrollista för resterande faser

### FAS 1 – Reproducerbar grund och staging

- [ ] Granska och committa alla avsedda lokala ändringar i logiska commits.
- [ ] Flytta/versionshantera Product PDF Extractor.
- [ ] Skapa fullständig schema-baseline och `supabase/config.toml`.
- [ ] Stäm av migration ledger mot live utan att återköra DDL blint.
- [ ] Välj en entydig Git-baserad deploymentväg.
- [ ] Skapa isolerad staging med separat Supabase.
- [ ] Kör alla 209 SQL/RLS-test i staging/local.
- [ ] Lägg lint, typecheck, unit, SQL och E2E i CI.
- [ ] Dokumentera rollback, backup och restore.

### FAS 2 – Säker demodatabas

- [x] Skapa dataset/provenance-migration.
- [x] Skapa realistiska fiktiva tillverkare, produkter, varianter och approvals.
- [x] Skapa fiktiva suppliers och tidsstämplade offers.
- [x] Skapa demoorganisation, produktionsspärrat demokonto, projekt, PDF-metadata och krav.
- [x] Använd stabila ID:n och idempotent seed/remove.
- [x] Visa exakt demovarning i alla demo-UI:n och demoexporter.
- [x] Säkerställ att demo aldrig får status manufacturer-verified.
- [x] Begränsa mock/localStorage till uttryckliga `/projects/demo`-sidor; riktiga användarflöden är databasbaserade.

### FAS 3 – Dokument och krav end-to-end

- [ ] Direkt privat upload och bakgrundsjobb.
- [ ] Crawler-ingest till Storage och processing attempts.
- [ ] Versionerad Product PDF Extractor-tjänst.
- [ ] Sidvis text/OCR/table-resultat och page-level errors.
- [ ] Kandidatkrav med evidens och confidence.
- [ ] Komplett review, redigering, approval och versionslåsning.
- [ ] Retry, dead-letter, idempotens och återupptagning.
- [ ] E2E-test med text-, scan-, mixed- och oläsbara PDF:er.

### FAS 4 – Canonical produktkatalog

- [ ] En canonical identitet för produktfamilj, produkt, variant och artikel.
- [ ] Sprsok mapping/snapshot och reconciliation.
- [ ] Produktdokument och fältprovenance.
- [ ] Attributtyper, enheter och normalisering.
- [ ] Approval/certification med giltighet och användningsområde.
- [ ] Temperatur, K-värde, tryck, anslutning och övriga tekniska data.
- [ ] Search index från canonical read model.

### FAS 5 – Teknisk compliance och kompatibilitet

- [ ] Versionerad regelmotor.
- [ ] PASS/FAIL/UNKNOWN/NOT_APPLICABLE per krav.
- [ ] Obligatoriska krav blockerar kandidat vid FAIL.
- [ ] UNKNOWN går till manuell review.
- [ ] Approval och scope kontrolleras före kompatibilitet.
- [ ] Produkt-till-produkt-kompatibilitet körs efter individuell compliance.
- [ ] Evidence och regelversion sparas för varje beslut.
- [ ] Negativa tester bevisar att pris/lager aldrig kan överstyra FAIL.

### FAS 6 – Kommersiell ranking

- [ ] Endast tekniskt eligible kandidater kan rankas.
- [ ] Supplier offer snapshots med valuta, lager, ledtid och giltighet.
- [ ] Konfigurerbara vikter utan påverkan på teknisk status.
- [ ] Föredragen tillverkare/distributör är ranking, inte compliance.
- [ ] Alternativ visar teknisk likvärdighet och kommersiell skillnad separat.
- [ ] Stale offer-data markeras och exkluderas enligt policy.

### FAS 7 – Materiallista, godkännande och export

- [ ] BOM genereras från godkända matchresultat.
- [ ] Mängder, spill/reserv, paketstorlek och enheter är spårbara.
- [ ] Alternativ behåller teknisk status.
- [ ] Materiallistversion blir immutable efter approval.
- [ ] Ändrade krav eller produkter markerar resultat stale.
- [ ] PDF/Excel/CSV-export med komplett manifest och demovarning.
- [ ] Export innehåller krav, evidens, beslut, produkter, offers och versions-ID.

### FAS 8 – Produktionsberedskap

- [ ] Browser-E2E för varje roll och kritiskt arbetsflöde.
- [ ] RLS-negativtest för korsorganisation och manipulerade ID:n.
- [ ] Lasttest av sökning, upload, OCR, matchning och export.
- [ ] Distribuerad rate limit, CSP och central CSRF/Origin-policy.
- [ ] Strukturerade loggar, correlation ID, metrics och alerting.
- [ ] Backup/restore och disaster-recovery-test.
- [ ] Dokumentretention, privacy och incidentrutiner.
- [ ] Staging-UAT och dokumenterad release/rollback.
- [ ] Ingen känd blockerande säkerhets-, data- eller domänrisk.

## 19. FAS 0 – avslutskriterier

- [x] Frontend, backend, Auth, Supabase, migrationer, API, komponenter,
  projektsidor, användarhantering, produktdata, PDF/OCR, materiallista,
  matchning, export, tester, miljövariabler, säkerhet och prestanda analyserade.
- [x] Fungerande, ofärdiga, duplicerade, hårdkodade och ej driftsatta delar
  separerade.
- [x] Live-status kontrollerad skrivskyddat.
- [x] Lokala build- och testresultat dokumenterade.
- [x] Säkerhets- och domänrisker prioriterade.
- [x] Befintliga återanvändbara delar identifierade.
- [x] Rekommenderad datamodell och migrationsordning dokumenterad.
- [x] Kommande filer/moduler och faschecklista dokumenterade.
- [x] Ingen kod, databas eller migration ändrad i FAS 0.

FAS 1 ska inte påbörjas förrän detta dokument har granskats och den avsedda
release-/stagingstrategin har bekräftats.
