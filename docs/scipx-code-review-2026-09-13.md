# Scipx: granskning av PDF-läsning och produktmatchning

Granskning 13–14 september 2026. Motorversion: technical-rules-2026-09-13.1.

Granskningen omfattar den aktiva vägen från teknisk PDF och webbläsar-OCR till materialrader, kravdata, Ahlsell-sökning, MLDL/Victaulic, kandidatpoäng, tillbehör, historik och användargodkännande. Äldre PDF-extraktion och den separata SQL-modellen för teknisk spärr har också inventerats. Den senare är inte samma väg som dagens distributörsval.

## Rättat

- En explicit materialpost med saknat antal kunde försvinna när den strukturerade parsern valdes. Alternativt lästa poster bevaras nu med granskningsflaggor; huvudposter och härledda dubbletter utesluts.
- Sidor med partial/failed ger en dokumentvarning med sidnummer.
- Flera DN i ett dimensionsfält bevaras. En kandidat måste bekräfta samtliga angivna DN; tumalias räknas inte som extra anslutningar.
- Böjvinkel och explicit arbetstryck i bar kontrolleras. Saknad information eller avvikelse blockerar exakt match. Dokumenterat högre arbetstryck accepteras.
- Blandad monteringsriktning kan inte längre kollapsa till stående. Responskonflikter använder gemensam tolkning i sökguide och rankning.
- Kandidaternas tidigare varningar bevaras vid rankning och sammanslagning. Källans status får inte placera en avvikande produkt före en exakt match.
- Exakt sprinklerklassificering kräver centrala variantvärden. Direktkandidater kontrolleras också för tillbehör och hydrauliska krav.
- MLDL-sökningen behåller huvudproduktfamiljen när en sprinklerspecifikation nämner tillbehör.
- Skydd och täckbricka kan föreslås samtidigt. V27-familjlikhet och DN markeras inte längre som bevis för exakt tillbehörskompatibilitet.
- Negativa tillbehörsvärden, inklusive None, Nej och OCR-varianter av I.R., behandlas konsekvent. Direkt negation i fritext ignoreras.

## Verifiering

- test:technical-description: 59/59.
- test:distributor-mapping: 189/189.
- test:extractor: 10/10.
- sprinkler-matching-baseline.test.ts: 3/3.
- TypeScript, ESLint för ändrade TypeScript-filer och Next.js produktionsbygge.
- Den exporterade Excel-listan innehåller regelbeskrivningar, exakta koduttryck, mönster, konstanter och källfilernas SHA-256.

Testerna avser lokala funktioner, katalogfixtures och bygget. Ingen uppladdning till eller ändring i liveproduktion har gjorts.

## Kvarvarande begränsningar

- OCR-valet bygger fortfarande på textlängd. En skannad sida med en lång maskinläsbar sidhuvudstext kan behöva bättre detektion. Skarpa skannade dokument behöver testas i webbläsaren.
- PDF-persistensen består av flera databasanrop. Atomisk lagring, återupptagning och belastningsprovning ingår inte i denna rättning.
- Flera DN verifieras som en uppsättning. Placering av varje anslutning, kopplingsstandard, installationsmått, fullständiga materialgrader och hela produktlistningar bedöms inte generellt.
- Arbetstryckskontrollen tolkar uttryckliga strukturerade fält i bar och dokumenterad produktkapacitet. Den ersätter inte en hydraulisk beräkning eller en fullständig PN-/temperaturbedömning.
- Det finns fortfarande familjeantaganden och enhetsalias i katalogen, bl.a. V2762/V2726 och K-värden. De behöver underhållas mot tillverkarnas underlag.
- Genererade varningar visas i dagens UI som avvikelse, även när innebörden är saknat underlag snarare än bevisat fel.
- Historiska val används som företagsbunden hjälp. Ett tidigare val är inte ett oberoende bevis för att alla tekniska egenskaper är kontrollerade.

Excel-listan dokumenterar arbetskopian. Den är inte en konfigurationsfil som ändrar motorns beteende, och standardreferenser i PDF:n innebär inte att hela standarden körs som kod.
