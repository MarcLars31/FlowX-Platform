# Villkorade produktkrav utan AI

Scipx tolkar dessa samband med fasta, testade regler. Ingen språkmodell,
modellanslutning eller överföring av PDF-filer till en AI-tjänst ingår.
PDF-text/OCR och originalets attribut behålls. Tolkningen beräknas från
produktpostens uppgifter vid produktval, även för redan uppladdade projekt.

## Regler för sprinklermontage och tillbehör

| Regel | Underlag | Tolkning |
| --- | --- | --- |
| M01 | Uttryckligt innfelt/infällt/recessed eller skjult/concealed montage | Angivet montagesätt används; en negation eller ett villkor är inte ett montagebesked. |
| M02 | Täckbricka: Ja, med villkoret vid infällning | Ja anger ett villkorat tillbehörskrav och fastställer inte montagesättet. |
| M03 | M02 samt lokalisering utan eller ovanför undertak | Villkoret tillämpas inte. Fältet skapar inget täckbrickskrav eller krav på infällt montage. |
| M04 | M02 samt uttryckligt infällt/dolt montage | Det villkorade tillbehörskravet gäller och kompatibiliteten måste kontrolleras. |
| M05 | M02 med oklart montage | Granskning krävs; inget specifikt montage antas. |
| M06 | Infällt/dolt montage tillsammans med lokalisering utan/ovanför undertak | Motsägelsen visas för granskning; inget av beskeden väljs automatiskt. |
| T01 | Tillbehör eller skydd: Valgfritt/Valfritt/Optional | Ingen obligatorisk tillbehörsvarning eller obligatoriskt förslag skapas av fältet. |
| T02 | Ovillkorligt täckbrickskrav eller ett separat skyddskrav | Kravet behålls även om ett annat tillbehör är valfritt eller dess villkor inte gäller. |

Reglerna används gemensamt för sökkriterier, kandidatrankning, direkta
katalogkandidater och tillbehörsförslag. Produktkortets ”Så tolkas PDF-kraven”
förklarar villkoren intill originalfält och källsida. Övriga kontroller av
exempelvis riktning, dimension, temperatur, arbetstryck och produktutförande
fortsätter att gälla. SSP/SSU eller upp/ned är inte i sig ett produktgodkännande.

Detta är en avgränsad tolkning av kända uttryck, inte generell förståelse av
godtyckliga beskrivningar. Utöka reglerna med verifierade exempel och tester.

## Verifiering

`sprinkler-context-matching.test.ts` går från PDF-text till extraherad post,
sökning, kandidatrankning och tillbehör. Det innehåller ett exempel från
kundens annoterade bild, ett verkligt infällningskrav och ett separat skyddskrav.
`sprinkler-technical-rules.test.ts` kontrollerar även negationer, okända villkor,
motstridiga uppgifter, språkvarianter och att originalvärdena inte ändras.
