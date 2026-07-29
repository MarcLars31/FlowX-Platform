# Startprompt för nästa Codex-agent

Kopiera texten mellan avskiljarna till nästa Codex-task efter att repositoryt
har öppnats.

---

Du fortsätter utvecklingen av **FlowX Platform** i repositoryt
`MarcLars31/FlowX-Platform`, branch `Frontend-`.

Kommunicera med mig på svenska. Kod, SQL och tekniska identifierare får vara på
engelska.

## Läs innan du ändrar något

Läs filerna fullständigt i denna ordning:

1. `README.md`
2. `docs/18-phase-1-completion-handover.md`
3. `docs/16-organization-rbac-foundation.md`
4. `docs/17-organization-rbac-operations.md`
5. `docs/15-security-risks.md`
6. `supabase/preflight/20260730_organization_rbac_preflight.sql`
7. De fem migrationerna `20260730100000`–`20260730140000`
8. `supabase/tests/organization_rbac_rls.sql`

`docs/13-developer-handover.md` och `docs/14-new-codex-start-prompt.md` är
historiska dokument från före organisation/RBAC-implementationen.

## Börja med repositorykontroll

Kör:

```powershell
git status -sb
git branch --show-current
git log --oneline --decorate -10
```

Använd aldrig `git reset --hard`, `git checkout -- .` eller `git clean`.
Bevara användarens ändringar och committa inte genererade `.next`,
`.flowx-next`, `node_modules`, `dist`, `build`, loggar, hemligheter eller
temporära PDF-filer.

## Aktuell status

Fas 1 för organisationer, medlemskap, roller, permissions, team,
projektåtkomst, tenant-RLS, soft delete, audit-logg och seat limits är färdig i
koden. TypeScript-kontroller och webbtester var godkända vid överlämningen.

Fas 1 är inte applicerad i FlowX produktionsdatabas. Supabase-projektet är på
Free-planen utan backup. Preview branch kräver betald uppgradering, och
användaren har valt att göra betalningen senare.

Gör därför ingen Supabase-uppgradering, branchskapning, migrationskörning,
migrationsreparation eller annan produktionsskrivning utan ett nytt,
uttryckligt godkännande från användaren. Att användaren ber dig fortsätta koda
lokalt är inte ett godkännande att ändra produktion.

Den liveverifierade migrationshistoriken innehåller fyra registrerade
migrationer genom `20260718110000`. Säkerhetshärdningen
`20260729210000_harden_product_review_security.sql` har applicerats manuellt men
är inte registrerad. Verifiera objekten innan historiken senare repareras.

## Nästa rekommenderade uppgift

Om en isolerad databas ännu inte är tillgänglig:

1. Fortsätt lokalt med en avgränsad fas 2-funktion.
2. Börja helst med medlemsroll/status eller teamadministration, eftersom säkra
   RPC:er för medlemsändringar redan finns.
3. Implementera databas-/serverkontroll och tester före UI.
4. Gör ingen funktion beroende av att frontend ensam upprätthåller behörighet.
5. Dokumentera tydligt vad som inte kunnat integrationstestas mot Supabase.

När användaren senare godkänner preview branch:

1. Kör den read-only preflight som finns i repositoryt.
2. Skapa en isolerad preview branch/klon.
3. Stäm av och reparera migrationshistoriken kontrollerat.
4. Applicera hela kedjan i filordning.
5. Kör `supabase/tests/organization_rbac_rls.sql`.
6. Verifiera att användaren och projektet backfillats till legacy-organisationen.
7. Bekräfta att ingen tenant kan läsa eller ändra en annan tenants data.
8. Driftsätt webbappen först därefter.

## Säkerhetsinvarianter

- Organisationen äger kunddata.
- Alla tenanttabeller skyddas med RLS.
- Kundtrafik använder användarens JWT, inte service role.
- `platform_admin` ligger separat i betrodd `app_metadata`.
- En kundadmin får aldrig skapa eller tilldela `platform_admin`.
- En användare får inte uppgradera sig själv.
- Sista aktiva organisationsägaren får inte tas bort eller nedgraderas.
- Team- och projektmedlemmar måste tillhöra projektets organisation.
- `organization_id`, skapare och ägare får inte manipuleras via klienten.
- Audit-loggar är append-only.
- Tokens och inbjudningshemligheter får inte returneras eller loggas.

## Kontroller före leverans

Kör från `apps/web`:

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test:authz
npm.cmd run test:rbac
npm.cmd run test:extractor
npm.cmd run test:normalizer
npm.cmd run build
```

Rapportera separat:

- vad som ändrades
- vilka säkerhetskontroller som lagts till
- vilka tester som kördes
- vad som fortfarande kräver Supabase preview branch
- om något inte kunde verifieras

---
