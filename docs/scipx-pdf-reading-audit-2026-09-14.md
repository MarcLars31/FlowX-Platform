# PDF-läsning: fyra verkliga underlag, 2026-09-14

Granskningen omfattar PDF-filerna som användaren angav, sammanlagt 85 sidor. Originalfilerna har inte ändrats eller skickats till en extern OCR-tjänst.

| Fil | Sidor | Textlager | Läsmetod |
| --- | ---: | --- | --- |
| 1403 AB - 33 Rev03.pdf | 55 | Text på samtliga sidor | Direkt textutvinning med befintlig koordinatbaserad tabelltolkning |
| Sprinkler.pdf | 3 | Saknas | Rendering och OCR |
| Sprinkler_Vågå svømmehall.pdf | 11 | Saknas | Rendering och OCR |
| Sprinkler2.pdf | 16 | Saknas | Rendering och OCR |

De tre filerna utan textlager är inte vanliga inskannade sidbilder: bokstäverna består av ritade vektorkonturer. Kontroll med pypdf och Scipx egen unpdf-läsare gav ingen text på någon av deras 30 sidor. Sidinnehållet använder ritoperationer, och representativa sidor har kontrollerats visuellt efter rendering med Poppler. De små inbäddade bilderna är bland annat logotyper; vissa sidor innehåller även fotografier. En annan vanlig textparser kan inte återskapa teckenkodningen ur dessa ritoperationer. Export från originalprogrammet med bevarad text eller en tillgänglig strukturerad export är vägen till läsning utan teckenigenkänning.

## Genomförda ändringar

- Läsaren hämtar PDF-kommentarer som tidigare saknades i resultatet. 1403 AB innehåller 67 sådana kommentarer på 24 sidor, bland annat föreslagna artikelnummer och hänvisningar till bilagor. Kommentarerna lagras med sida och position och visas som separat granskningsunderlag. De blandas inte in i kravtexten eller används som automatiskt godkända produktval. Popup-dubbletter och länkar/formuläråtgärder filtreras bort.
- Kommentarerna bevaras även när en sida ersätts med OCR-text och sparas i dokumentets sidmetadata. Fel vid kommentarläsning ger en granskningsvarning och förstör inte sidans läsbara text.
- OCR-varianterna `Utlgsningstemperatur`, `Utlosningstemperatur` och `Utlesningstemperatur` normaliseras till samma fältnamn som `Utløsningstemperatur`. Värdena ändras inte.
- En explicit materialpost med `Antall`/`Lengde` men saknad kvantitet behålls även i den strukturerade parsern. Därmed kopplas krav på nästa sida till posten, samtidigt som kvantiteten förblir okänd och markerad för granskning. En ensam siffra i en bild tillåts inte bli en sådan post.
- Webbläsarens OCR får välja mellan tre lokala LSTM-kärnor: vanlig, SIMD och relaxed SIMD. Tidigare var den vanliga kärnan fast vald. Tillgången följer med byggsteget. Enhetens stöd avgör valet; någon procentuell prestandavinst utlovas inte.
- PDF-dokumentet stängs även om OCR-initieringen misslyckas. Canvas och en initierad OCR-arbetare städas också vid renderings- och igenkänningsfel; fel vid arbetarens avslutning hindrar inte att dokumentet stängs.

## Verifiering

- Alla 55 digitala sidor lästes med Scipx egen kod. Samtliga 138 tidigare extraherade materialrader är oförändrade; kommentarerna tillkommer separat.
- Alla 30 sidor utan textlager renderades lokalt vid 144 dpi och kördes med Tesseract.js 7, `nor+eng`, LSTM. Textval och materialparser använder Scipx kod. Detta är ett lokalt integrationstest av läsningen, inte ett test av hela uppladdningen, inloggningen eller den driftsatta webbplatsen.
- Sprinkler.pdf: 6 materialrader, varav 5 sprinklerposter. Korrekt normaliserade temperaturfält ökade från 0 till 5.
- Vågå: 27 materialrader, varav 6 sprinklerposter. Korrekt normaliserade temperaturfält ökade från 4 till 6.
- Sprinkler2: 22 materialrader, varav 11 sprinklerposter. Första sprinklerposten, 30.332.14, behåller nu K80, 68 °C, skydd Nej och rosett I.R. även om antalet missas. Befintlig omläsning vid 180 dpi gav 39 stycken på sida 10. Temperaturfälten ökade från 10 till 11 när fortsättningen följde med.
- Samtliga tidigare postnummer behålls i de tre OCR-resultaten. Detta är en kontroll mot föregående extraktion, inte ett intyg att samtliga krav i varje dokument är korrekt tolkade.
- 65 tester för tekniska beskrivningar och 189 tester för produktmatchning passerade. TypeScript-kontroll, ESLint och produktionsbygget passerade. Tesseracts webbläsarlogik för kärnval kördes i ett isolerat Node-test och valde den lokala relaxed-SIMD-filen, vars existens kontrollerades. Detta ersätter inte ett prestandatest i den driftsatta webbläsaren.

`K-faktor: 1145` i Sprinkler.pdf, post 33.500.5, står även i originalet. Värdet har därför inte gissats om till 114,5 eller 115; den befintliga granskningsvarningen behålls.

Reproducerbara lokala granskningsskript finns i `apps/web/scripts/audit-technical-pdfs.ts`, `audit-technical-ocr.ts` och `verify-technical-pdf-audit.ts`. Mellanresultat ligger i den git-ignorerade katalogen `tmp/pdfs/reader-audit-2026-09-14/`. OCR-skriptet förutsätter lokalt renderade PNG-filer med de prefix som anges i skriptet. Verifieringen jämför sparad baslinje med ändrad kod och använder en separat rendering av Sprinkler2 sida 10 vid 180 dpi.

Rapporten avser lokal verifiering. Driftsättning och hela uppladdningsflödet i produktion har inte verifierats här.
