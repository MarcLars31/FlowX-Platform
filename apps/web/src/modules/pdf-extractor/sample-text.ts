import type { ExtractedPageText } from "./types";

export const samplePdfFileName = "1403 AB - 33 Rev03(1).pdf";

export const samplePdfPages: ExtractedPageText[] = [
  {
    pageNumber: 1,
    text: `
1403 AB - 33 Rev03
Sprinkleranlegg A10
T\u00f8rropplegg for brannvesen / fire department connection
V\u00e5tanlegg sprinkleranlegg
Delugeanlegg fasade
NFPA 13
NFPA 14
Systemtrykk 12 bar
`
  },
  {
    pageNumber: 2,
    text: `
1403.33.332.1.1 Rillede r\u00f8r for sprinkleranl. Pulverlakkert DN100 m 29,16
1403.33.332.1.2 Rillede r\u00f8r for sprinkleranl. Pulverlakkert DN80 m 72,78
1403.33.332.1.3 Rillede r\u00f8r for sprinkleranl. Pulverlakkert DN65 m 57,32
1403.33.332.1.4 Rillede r\u00f8r for sprinkleranl. Pulverlakkert DN50 m 496,46
1403.33.332.1.5 Rillede r\u00f8r for sprinkleranl. Pulverlakkert DN40 m 223,83
1403.33.332.1.6 Rillede r\u00f8r for sprinkleranl. Pulverlakkert DN32 m 910,05
1403.33.332.1.7 Rillede r\u00f8r for sprinkleranl. Pulverlakkert DN25 m 54,75
1403.33.332.2.1 Riller\u00f8r Bend DN32 stk 188
1403.33.332.2.2 Riller\u00f8r Bend DN25 stk 127
1403.33.332.3.1 Fleksibelslange Sprinkleranlegg DN25 stk 386
`
  },
  {
    pageNumber: 3,
    text: `
1403.33.333.1.1 Standard Spray, Nedadrettet, QR K=80, 68\u00b0C stk 306
1403.33.333.1.2 Standard Spray, Oppadrettet, QR K=80, 68\u00b0C stk 220
1403.33.333.1.3 Standard Spray, Nedadrettet, QR K=80, 68\u00b0C stk 118
1403.33.334.1.1 Kuleventil, Drenering v\u00e5t DN32 stk 9
1403.33.334.1.2 Stengeventil med gir, overv\u00e5ket DN65 stk 5
1403.33.334.1.3 Tilbakeslagsventil DN65 stk 5
1403.33.335.1.1 Str\u00f8mningsvakt stk 6
1403.33.335.1.2 I/O Enhet Str\u00f8mningsvakt stk 6
`
  }
];
