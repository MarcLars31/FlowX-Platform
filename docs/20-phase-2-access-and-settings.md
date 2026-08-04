# Fas 2 – projektåtkomst och organisationsinställningar

## Levererat

Den här delen av fas 2 lägger till ett sammanhållet arbetsflöde för projektåtkomst
och organisationens grundinställningar.

- Projektägare och behöriga administratörer kan ändra projektets åtkomstnivå:
  `own`, `team`, `organization` eller `restricted`.
- Team väljs från samma organisation och sparas på projektet.
- Projektmedlemmar kan läggas till som `editor` eller `viewer`.
- Projektroller kan ändras och icke-ägare kan tas bort.
- Ägarrollen kan inte tas bort genom medlemsgränssnittet.
- Medlemsändringar skrivs till audit-loggen, inklusive rolländringar.
- En sida för organisationsinställningar kan uppdatera organisationsnamn,
  organisationsnummer och retention-dagar när användaren har rätt behörighet.
- Papperskorgen visar nu retentionperiod och om ett projekt har passerat sin
  konfigurerade retentionperiod.

## Migration och live-databas

Migrationen
`supabase/migrations/20260804110000_enable_project_access_and_retention_settings.sql`
är applicerad i den aktiva Supabase-databasen.

Migrationen:

- ger endast kolumnuppdatering av `project_members.project_role` till
  `authenticated`;
- begränsar borttagning av projektmedlemmar så att ägare inte kan tas bort;
- loggar `project.member_role_changed` vid rolländring;
- lägger till `subscription.manage`-policy för uppdatering av
  `organization_subscriptions`;
- ger uppdateringsrätt till `retention_days` och `metadata`.

Efter applicering verifierades både policyerna och kolumnbehörigheterna i
Supabase SQL Editor.

## Kodens huvuddelar

- `apps/web/src/components/ProjectAccessEditor.tsx`
- `apps/web/src/app/api/projects/[id]/access/route.ts`
- `apps/web/src/app/api/projects/[id]/members/route.ts`
- `apps/web/src/app/api/projects/[id]/members/[memberId]/route.ts`
- `apps/web/src/components/OrganizationSettingsForm.tsx`
- `apps/web/src/app/organization/settings/page.tsx`
- `apps/web/src/app/api/organizations/settings/route.ts`

## Kvarvarande arbete i fas 2

Följande delar är medvetet inte markerade som färdiga ännu:

1. E-postleverans och säker acceptans av organisationsinbjudningar.
2. Privat Supabase Storage för projektens PDF-filer och åtkomstkontrollerade
   signed URLs.
3. Persistenta extraction jobs, analyser och versionshanterade materiallistor
   i projektarbetsytan.
4. Automatiserat retention-jobb som arkiverar eller raderar förfallna poster.
5. Granskat, tidsbegränsat supportläge för plattformsadministratörer.
6. Full organisationsväxlare för användare som tillhör flera organisationer.

Retentionvisningen är därför informativ tills jobb- och lagringsdelen är
implementerad. Automatisk radering sker inte genom den här leveransen.

## Kontroller

Följande lokala kontroller är gröna:

- `npm.cmd run typecheck`
- `npm.cmd run lint`
- `npm.cmd run test:rbac`

Kör även `npm.cmd run build` före nästa produktionspublicering.
