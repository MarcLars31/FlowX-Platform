# Startprompt för ett nytt Codex-konto

Kopiera prompten nedan till en ny Codex-task efter att repositoryt har öppnats.

---

## Prompt

Du fortsätter utvecklingen av **FlowX Platform** i repositoryt
`MarcLars31/FlowX-Platform`.

Kommunicera med mig på svenska. Kod, databasnamn och tekniska identifierare får
vara på engelska.

### Läs först

Läs dessa filer i angiven ordning innan du ändrar något:

1. `README.md`
2. `docs/13-developer-handover.md`
3. `docs/15-security-risks.md`
4. `docs/Architecture/000-project-charter/000-project-charter.md`
5. `docs/Architecture/003.architecture/Software Architecture.md`
6. `docs/Architecture/012.Data Architecture/Data Architecture.md`
7. `docs/Architecture/014.Trust & Security Architecture/Trust & Security Architecture.md`
8. `docs/Architecture/015.AI Architecture/AI Architecture.md`
9. `docs/Architecture/016.Canonical Data Model/Canonical Data Model.md`

Målarkitekturen i `docs/Architecture` är strategisk och delvis aspirerande.
Verifiera alltid mot den faktiska koden och databasen innan du beskriver en
funktion som implementerad.

### Bevara den lokala arbetskatalogen

Repositoryt kan innehålla många ocommittade ändringar från föregående
Codex-konto.

Gör därför först:

```powershell
git status -sb
git branch --show-current
git log --oneline --decorate -10
```

Använd inte:

```text
git reset --hard
git checkout -- .
git clean
```

Radera, återställ, flytta eller committa inte orelaterade ändringar. Stagea
alltid explicita filer. Genererade `.next`, `.flowx-next`, `dist`, `build`,
`node_modules`, loggar och temporära extraktormappar ska inte committas.

### Nuvarande tekniska verklighet

- Webbappen är Next.js 15/React 19/TypeScript under `apps/web`.
- Supabase används för Auth, projekt och produktkatalog.
- Projektets grunduppgifter sparas i `public.projects` med `owner_id`.
- PDF, analys och materiallista är ännu inte permanent projektdata.
- Analysdata ligger huvudsakligen i `localStorage`.
- `/projects/demo` innehåller fortfarande prototyp- och demoflöden.
- Produktimport och review använder service role i backend.
- Organisationer, medlemskap, team, RBAC, projektmedlemmar, soft delete och
  audit-logg saknas.
- Live-schema och lokala migrationer är inte helt synkroniserade.
- En separat PDF Product Extractor har utvecklats utanför FlowX; en otrackad
  arbetskopia kan finnas under `.codex-tmp-pdf-extractor`.

### Kritiska säkerhetsbrister

Behandla följande som P0:

1. Adminlayouten är inte fail-closed för oinloggade.
2. PKMS-rutter saknar autentiserings-/rollkontroll och använder service role.
3. `approve_product_review(uuid)` hade live execute-grants för `anon` och
   `authenticated`.
4. `pkms_review_queue` var en postgres-ägd vy utan `security_invoker` och hade
   anonym SELECT-rättighet.
5. Den generella Supabase REST-klienten kringgår RLS.

Läs `docs/15-security-risks.md` för verifierade detaljer.

### Första uppdrag

Gör ingen stor refaktorering direkt.

Arbeta i denna ordning:

1. Bekräfta git-status och vilka ocommittade ändringar som finns.
2. Kontrollera att dokumentationscommiten finns på remote.
3. Hjälp mig dela upp och pusha befintlig kod i tematiska commits utan att ta
   med generated artifacts.
4. Åtgärda därefter endast de kritiska säkerhetsbristerna i små commits.
5. Verifiera Supabase live med skrivskyddade frågor innan migrationer skapas.
6. Skapa en schema-baseline och migrationsplan innan organisationsmodellen
   implementeras.

### Säkerhetsregler

- Använd aldrig `user_metadata` som auktoritativ rollkälla.
- Plattform-admin får ligga i kontrollerad `app_metadata`.
- Organisationsroller och permissions ska ligga i databasen.
- Normal användartrafik ska använda användarens JWT och RLS.
- Service role ska begränsas till små, autentiserade serveroperationer.
- Alla adminoperationer ska vara fail-closed.
- Exponera aldrig hemligheter eller miljövariabelvärden i svar, loggar eller
  commits.
- Kör inte DDL/DML i live-Supabase utan att jag uttryckligen har godkänt
  migrationen.

### Produktprinciper

- Organisationen ska långsiktigt äga projektet.
- Projekt-PDF, analys och materiallista ska kopplas till
  `organization_id`, `project_id` och ansvarig användare.
- Produktdatabasen är en global katalog tills annat uttryckligen beslutas.
- Importerade produkter ska alltid gå via mänsklig granskning före publicering.
- Teknisk källdata, dokument, sida, råtext, normaliserat värde och confidence
  ska bevaras.
- AI får assistera och förklara men inte ersätta deterministisk teknisk logik.

### Verifiering

På Windows, använd `npm.cmd` om PowerShell blockerar `npm.ps1`:

```powershell
cd apps/web
npm.cmd run lint
npm.cmd run test:extractor
npm.cmd run test:normalizer
npm.cmd run build
```

Om Supabase behöver kontrolleras och du saknar en autentiserad anslutning, be
mig öppna eller logga in i Supabase. Gissa inte live-schema.

### Svar jag vill ha först

Efter att du har läst dokumentationen och inspekterat arbetskatalogen, svara
med:

1. aktuell branch och git-status,
2. skillnaden mellan pushad kod och lokala ändringar,
3. vilka filer som bör ingå i nästa tematiska commit,
4. om någon P0-risk redan är åtgärdad lokalt,
5. den minsta säkra nästa åtgärden.

Gör inga kodändringar innan denna första statusrapport är klar.

---
