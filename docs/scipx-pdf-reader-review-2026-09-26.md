# PDF reader verification — 2026-09-26

The review covers all nine supplied files (4,160 pages). Digital text was read with the application PDF.js/unpdf path. The 30 scanned pages were rendered locally with PDFium and processed using the application Tesseract languages, layout selection and recovery modes. Representative continuation, comment and quantity pages were also inspected visually. This is a parser/corpus check, not a manual certification of every quantity in every page or a full browser upload of all files.

## Resulting behaviour

- RS takes precedence over operation and is shown under Rund Sum, including RS demolition scopes.
- Posts with no readable quantity and no RS are shown under Demontering; quantities remain missing and are not invented.
- Measured posts remain under Produktposter. The three tables partition visible records; rejected and superseded records stay hidden. Source operation is preserved independently of the display group.
- Consecutive page continuations preserve prose, captions, attribute sentences, annotations and source page provenance, including more than two pages and repeated post labels.
- Parent PDF comments accompany their child posts. Stored source annotations survive reopening projects.
- The full available specification can be opened with Hela PDF-posten.
- OCR layout selection ignores calendar dates as post numbers and retains the geometric reading order of table columns. Recovery may not discard another post or most of the specification to gain one quantity.
- A numbered post at a page bottom is retained until its quantity on the following page. New NS rows are not appended to the preceding post.

## Corpus output

These are reader output counts, not an independently measured bill of quantities. Existing fire-protection section selection is retained.

| File | Pages | Product posts | Demontering | Rund Sum | Total |
|---|---:|---:|---:|---:|---:|
| 1403 AB - 33 Rev03.pdf | 55 | 137 | 4 | 18 | 159 |
| 836225a83bfee26cbbe19d0dcf5758b4d4531135525090d6bc620a720b89.pdf | 2236 | 114 | 12 | 0 | 126 |
| Bilag 9 Beskrivelse NS3420 K2 Tettbygg- og innredningsentreprise.pdf | 1739 | 941 | 399 | 27 | 1367 |
| Sprinkler.pdf | 3 | 6 | 0 | 0 | 6 |
| Sprinkler_Vågå svømmehall.pdf | 11 | 29 | 0 | 2 | 31 |
| Sprinkler2.pdf | 16 | 14 | 8 | 9 | 31 |
| ANBUDSBESKRIVELSE.pdf | 32 | 51 | 1 | 13 | 65 |
| Anbudsunderlag sprinkelprosjekt - Innspurten 15.pdf | 38 | 0 | 0 | 0 | 0 |
| Lunde 2 - Sprinkleranlegg og sanitæranlegg.pdf | 30 | 30 | 2 | 36 | 68 |

## Specific checks and limits

- All 110 extracted annotation texts in 1403 AB and ANBUDSBESKRIVELSE are present on material posts or their children. Original PDF annotations remain source evidence, distinct from a user's approval.
- Sprinkler2 30.332.11 owns its valve continuation, 30.332.12 owns the removal photo caption, 30.332.13 owns its next-page RS quantity, and 30.332.27 owns its next-page sign description and RS quantity.
- Some small quantities next to scan borders are still not reliably recognized. They remain missing and require original-PDF review. A recognized quantity with an unreadable unit is retained with unit `?` and a review flag rather than an invented unit.
- Innspurten 15 is predominantly tender prose, a system description and drawings; it does not supply a conventional quantified NS post table. Approximate sprinkler totals in narrative/drawings are not synthesized into procurement rows.
- Existing projects receive the new tab grouping immediately. Re-extraction from stored page text can recover continuations/comments that are already stored. Text or digits absent from an older OCR result require a new read of the original PDF; this change does not overwrite approved product selections or bulk rewrite production requirements.

## Validation

Regression tests cover multi-page prose, split attributes, inherited and continuation comments, repeated post numbers, delayed quantities, dated headings, detached OCR columns, unread units, safe chapter boundaries, exact-sequence recovery, tab precedence, persistence and export. Production build and ESLint are required before publication. Source PDFs and scratch OCR data are not committed.
