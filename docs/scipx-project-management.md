# Prosjektstyring i Scipx

Prosjektstyring fordeler PDF-kapitler og poster fra prosjektleder til arbeidsleder og videre til medarbeidere i avdelingen. Arbeidsvyer og oppfølging er på norsk og tilpasset datamaskin. Funksjonen aktiveres per prosjekt og bruker organisasjonens eksisterende team som avdelinger.

Åpne **Prosjektstyring** i sidemenyen for prosjektoversikt og varsler. Inne i et prosjekt ligger arbeidsvyn under fordeling og ansvar, og på `/projects/<id>/management`.

## Roller og arbeid

| Rolle | Innsyn | Handlinger |
| --- | --- | --- |
| Prosjektleder | Hele prosjektet | Velge avdelinger og arbeidsledere, tildele kapitler og poster til arbeidsleder, sette alle frister, følge opp og endre alle poster |
| Arbeidsleder | Egne avdelinger | Fordele arbeid til aktive medarbeidere i avdelingen, svare på hjelpebehov, løse dem og endre avdelingens poster |
| Medarbeider | Egne avdelingers kapitler og poster | Arbeide med, klarmarkere og gjenåpne egne poster; stille spørsmål og be om hjelp |

Eksisterende prosjektansvarlige og organisasjonsadministratorer beholder prosjektledertilgangen fra Scipx sin tilgangsmodell. En avdeling kan bare velges med en aktiv arbeidsleder som er medlem av avdelingen. Aktive avdelingsmedlemmer legges til som prosjektmedlemmer ved oppsett; eksisterende inaktive medlemskap og leserroller oppgraderes ikke automatisk. Ved nye avdelingsmedlemmer lagrer prosjektlederen avdelingsoppsettet på nytt.

En kapitteltildeling er standard for kapitlets poster. Egne posttildelinger beholdes når kapittelet omfordeles. Flere valgte poster lagres samlet: en konflikt eller ugyldig tildeling avbryter hele lagringen. Samtidige endringer kontrolleres med revisjonsnummer.

## Frister og ferdigmarkering

Ved første tildeling lagres postens gjeldende kapittelfrist, eller prosjektfrist dersom kapittelet mangler frist. Senere endring av kapittel- eller prosjektfristen flytter ikke allerede tildelte datoer. Også en opprinnelig tom frist beholdes. Prosjektlederen kan sette en egen postfrist uten å endre ansvarlig. Fjerning av egen frist gjenoppretter datoen fra første tildeling.

Flere hjelpebehov kan være åpne på samme post. Hvert hjelpebehov krever en beskrivelse og har sin egen svarstråd. Medarbeideren som nå er ansvarlig, arbeidslederen og prosjektlederen kan løse hjelpebehov innenfor sine rettigheter. Alle åpne hjelpebehov må være løst før klarmarkering. Vanlige spørsmål og kommentarer blokkerer ikke klarmarkering. En ferdig post må gjenåpnes før et nytt hjelpebehov kan opprettes.

Medarbeiderens klarmarkering er tilstrekkelig. Det finnes ikke et obligatorisk godkjenningstrinn hos leder. Arbeidsstatus er separat fra produktvalg og tekniske kontroller; disse kontrollene beholdes.

## Tilgang til underlaget

Avdelingsgrensene håndheves i databasen og gjelder også eksisterende API-er for poster, kommentarer, produktforslag og sammendrag. Hele PDF-er og rå ekstraksjonsresultater kan inneholde andre avdelingers materiale og er derfor begrenset til prosjektleder i aktiverte prosjekter. Avdelinger arbeider med sine synlige poster. Eksisterende prosjekter beholder tidligere tilgangsregler til prosjektstyringen aktiveres.

Automatisk videreføring av arbeid til en ny PDF-revisjon inngår ikke i denne funksjonen.

## Varsler og e-post

Varsler lagres sammen med endringen i samme databasetransaksjon. Tildeling av ett kapittel eller flere poster gir ett samlet varsel og én e-post per mottaker og lagring. Hjelpebehov, svar og løsning får egne varsler. Egen aktivitet varsles ikke tilbake til samme bruker. Varsler viser en lenke til posten når hendelsen gjelder en bestemt post.

E-post ligger i en varig utboks. Utsending starter etter vellykket API-svar og får nye forsøk gjennom den eksisterende bakgrunnsarbeideren. Inaktive prosjektmedlemmer hentes ikke til utsending. Tilkoblingen er implementert for [Resends e-post-API](https://resend.com/docs/api-reference/emails/send-email); kontooppsett og avsenderdomene må konfigureres separat. Ingen konto eller abonnement opprettes av funksjonen.

Sett bare i et godkjent miljø:

```dotenv
SCIPX_WORK_EMAIL_ENABLED=true
SCIPX_WORK_EMAIL_API_KEY=<server-side Resend key>
SCIPX_WORK_EMAIL_FROM=Scipx <verified-sender@example.com>
SCIPX_WORK_EMAIL_APP_URL=https://approved-environment.example.com
```

Uten full konfigurasjon forblir e-post i køen, og prosjektlederen ser at e-post ikke er aktivert. Varsler i Scipx fungerer fortsatt. Ingen hemmeligheter sendes til nettleseren. E-post inneholder en generell hendelse og prosjektlenke, ikke PDF-tekst eller innholdet i spørsmålene.

Utboksen bruker tidsbegrensede låser, maksimalt åtte forsøk og eksponentiell ventetid. Samme e-post beholder mottaker og idempotensnøkkel ved nye forsøk. [Resend beholder idempotensnøkler i 24 timer](https://resend.com/docs/dashboard/emails/idempotency-keys); automatisk gjentakelse stoppes derfor 23 timer etter første forsøk. Rader med åtte forsøk eller utløpt tidsvindu må kontrolleres av drift før ny utsending. `sent_at` betyr at leverandøren aksepterte meldingen, ikke bekreftet levering til innboksen.

## Lokal kontroll og innføring

Migrasjonen `20261025120000_department_project_management.sql` og resten av repositoryets migrasjoner må brukes i en isolert database før funksjonen prøves. Produksjonsfrysen i `AGENTS.md` gjelder fortsatt. Ingen produksjonsmigrasjon eller publisering inngår i denne endringen.

Fra `apps/web`:

```powershell
node --no-wasm-code-gc --import tsx --test --test-concurrency=1 scripts/project-management-database.test.ts scripts/project-management-integration.test.ts
node --import tsx --test src/lib/project-work-email.test.ts src/lib/project-assignment-tree.test.ts
node scripts/release-check.mjs
```

De isolerte testene dekker roller, avdelingsgrenser, rå PDF-tilgang, revisjonskonflikter, atomisk tildeling, bevaring av postfrister, flere hjelpebehov, klarmarkering, gjenåpning, varsler, tilbakekalte medlemskap og e-postkøens låser. Integrasjonstesten kjører hele migrasjonskjeden og faktiske organisasjonsroller. E-posttransporten testes med lokale svar; ingen ekte meldinger sendes. Flagget `--no-wasm-code-gc` unngår en observert Windows-krasj i PGlites WebAssembly-testmotor.
