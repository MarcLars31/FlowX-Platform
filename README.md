# FlowX Platform

FlowX är en teknisk arbetsplattform för entreprenörer, ingenjörer,
produktansvariga och leverantörer inom VVS, sprinkler och närliggande
installationsteknik.

Målet är ett spårbart arbetsflöde från teknisk PDF till verifierade krav,
produktmatchning och versionshanterad materiallista.

## Projektstatus

**Version:** 0.1

**Status:** fas 1 för organisation/RBAC färdig i koden, ännu inte driftsatt

**Ägare:** Marcus Larsson

Nuvarande prototyp innehåller:

- Supabase Auth med e-post/lösenord.
- Kund- och adminvyer.
- Permanent lagring av projektmetadata i Supabase.
- Produktdatabas med JSON- och PDF-import.
- Granskningskö innan en produkt publiceras.
- PDF-textutvinning och teknisk normalisering.
- Lokalt analys- och materiallisteflöde.
- Organisations-, medlems-, roll- och behörighetsgrund.
- Team- och projektspecifik åtkomst skyddad av RLS.
- Soft delete och audit-logg för projektlivscykeln.

Projekt-PDF, analysresultat och materiallista är ännu inte permanent kopplade
till projektets nya organisationsstruktur. E-postleverans för inbjudningar
och fullständiga administrationsflöden fortsätter i nästa fas.

> **Säkerhetsstatus:** prototypen är inte produktionsredo. Läs
> [säkerhetsgranskningen](docs/15-security-risks.md) före driftsättning eller
> vidare backendutveckling.

## Teknik

- Next.js 15
- React 19
- TypeScript
- Tailwind CSS
- Supabase Auth och PostgreSQL
- Next.js Route Handlers
- `pdf-parse`/`pdfjs-dist`

## Starta lokalt

Krav:

- Node.js 20+
- npm
- `apps/web/.env.local` med Supabase-konfiguration

```powershell
cd apps/web
npm.cmd install
npm.cmd run dev
```

Öppna `http://localhost:3000`.

På Windows används `npm.cmd` i exemplen eftersom PowerShell kan blockera
`npm.ps1` genom sin execution policy.

### Miljövariabler

Applikationen använder följande variabelnamn:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
```

Lägg aldrig miljövariabelvärden, tokens eller Supabase-nycklar i Git.

### Kvalitetskontroller

```powershell
cd apps/web
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test:authz
npm.cmd run test:rbac
npm.cmd run test:extractor
npm.cmd run test:normalizer
npm.cmd run build
```

## Repositorystruktur

```text
apps/web/              Next.js-applikation
docs/                  Arkitektur och utvecklaröverlämning
supabase/migrations/   SQL-migrationer
packages/              Reserverat för delade paket
```

Genererade mappar som `.next`, `.flowx-next`, `node_modules`, `dist` och `build`
ska inte versionshanteras.

## Viktig dokumentation

### Operativ överlämning

- [Developer handover](docs/13-developer-handover.md)
- [Startprompt för ett nytt Codex-konto](docs/14-new-codex-start-prompt.md)
- [Verifierade säkerhetsrisker](docs/15-security-risks.md)
- [Organisation/RBAC-baseline](docs/16-organization-rbac-foundation.md)
- [Organisation/RBAC-drift och manuella steg](docs/17-organization-rbac-operations.md)
- [Fas 1 – slutförd leverans och handover](docs/18-phase-1-completion-handover.md)
- [Startprompt för nästa Codex-agent](docs/19-next-codex-phase-2-prompt.md)

### Strategisk arkitektur

- [Project Charter](docs/Architecture/000-project-charter/000-project-charter.md)
- [Constitution](docs/Architecture/001.Constitution/Consittution.md)
- [Engineering Standards](docs/Architecture/002.Engineering%20Standards/Engineering%20Standards.md)
- [Software Architecture](docs/Architecture/003.architecture/Software%20Architecture.md)
- [Domain Model](docs/Architecture/004.moduels/Domain%20model.md)
- [Module Architecture](docs/Architecture/005.module-architecture.md/Module%20Architecture.md)
- [FlowX Core Architecture](docs/Architecture/006.FlowX%20Core%20Architecture/FlowX%20Core%20Architecture.md)
- [Engineering Knowledge Model](docs/Architecture/007.Engineering%20Knowledge%20Model/Engineering%20Knowledge%20Model.md)
- [Rule Execution Engine](docs/Architecture/008.Rule%20Execution%20Engine/Rule%20Execution%20engine.md)
- [Calculation Engine](docs/Architecture/009.Calculation%20Engine/Calculation%20Engine.md)
- [Product Intelligence Engine](docs/Architecture/010.Product%20Intelligence%20Engine/Product%20Intelligence%20Engine.md)
- [Engineering Pipeline](docs/Architecture/011.Engineering%20Pipeline/Engineering%20Pipeline.md)
- [Data Architecture](docs/Architecture/012.Data%20Architecture/Data%20Architecture.md)
- [Platform Contract](docs/Architecture/013.Platform%20Contract/Platform%20Contract.md)
- [Trust & Security Architecture](docs/Architecture/014.Trust%20%26%20Security%20Architecture/Trust%20%26%20Security%20Architecture.md)
- [AI Architecture](docs/Architecture/015.AI%20Architecture/AI%20Architecture.md)
- [Canonical Data Model](docs/Architecture/016.Canonical%20Data%20Model/Canonical%20Data%20Model.md)
- [PostgreSQL Schema Specification](docs/Architecture/017.PostgreSQL%20Schema%20Specification/PostgreSQL%20Schema%20Specification.md)
- [Excel Migration Specification](docs/Architecture/018.excel%20migration%20specification/excel%20migration%20specification.md)

## Utvecklingsprioritet

1. Bevara och dela upp befintliga ocommittade kodändringar.
2. Åtgärda P0-riskerna i admin- och produktreviewflödet.
3. Synkronisera live-schema och migrationshistorik.
4. Driftsätt och verifiera organisation/RBAC-migrationerna i staging.
5. Slutför inbjudnings-, medlems- och teamadministration.
6. Spara projekt-PDF, analyser och materiallistor permanent.
7. Inför versionshanterade tekniska resultat och retention-jobb.
