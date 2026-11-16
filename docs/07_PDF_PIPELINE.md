# PDF- och kravpipeline

1. En PDF registreras som metadata i `project_documents` och lagras privat i
   Storage-bucket `project-files` under
   `organization_id/project_id/...`.
2. Sidor och text sparas i `document_pages`.
3. Varje körning sparas i `extraction_runs` med provider, version, status,
   råresultat och tidsstämplar. Senaste resultatet ersätter inte historiken.
4. Den separata tekniska beskrivningsimporten använder
   `/api/technical-descriptions`. Den sparar dessutom befintliga
   `technical_description_documents`/materialrader och kopplar nya kandidater
   till körningen.
5. AI- eller parserförslag skrivs till `requirement_candidates` med råtext,
   normaliserat värde, sida, konfidens och granskningsstatus.
6. Användaren accepterar, ändrar eller avvisar kandidater. Bekräftade krav
   ligger i versionshanterade `requirement_sets` och `project_requirements`.
   Källor sparas i `requirement_evidence`.

Fysiska Storage-filer är privata och kräver både autentisering, aktivt
organisationsmedlemskap och projektåtkomst. Utan `projectId` sparas en teknisk
beskrivning fortfarande i den befintliga importtabellen men kan inte kopplas
till en projektkörning.

## Reservläsning efter misslyckad OCR

Browser-OCR sparar även tomma/felaktiga försök som sidresultat. Importjobbet
använder Docling-reserven endast för försök som fortfarande har för lite text,
låg säkerhet eller en oläst bildkropp. Lyckad digital läsning och lyckad OCR
fortsätter som tidigare.

`DOCLING_OCR_URL` och `DOCLING_OCR_TOKEN` aktiverar den separata tjänsten i
`apps/docling-ocr`. Endast den berörda sidan skickas dit. Källhash, storlek,
koordinater och resultatversion kontrolleras; kända postnummer och NS-koder får
inte försvinna. Ursprunglig text och båda OCR-läsningarna bevaras. Resultatet
behåller befintliga OCR-granskningsmarkeringar.

Reservresultat använder den befintliga checkpoint-tabellen med separat
`docling-rapidocr-v1`-version och dokumentets SHA-256. Varje färdig sida sparas
innan nästa börjar. När tidsbudgeten tar slut återupptas jobbet utan att använda
ett felåterförsök. Reservtjänstens fel lämnar befintlig läsning och varningar kvar.
Inga databasmigreringar eller designändringar behövs. Driftinstruktioner finns
i `apps/docling-ocr/README.md`.
