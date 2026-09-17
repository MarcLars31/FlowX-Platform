# Kommentarer till produktposter

Produktkortet har separata kommentarsfält för PDF-posten och huvudprodukten.
Knappen **Kommentera** öppnar kommentarsdelen och fokuserar produktfältet om
en produkt är vald. Posten kan kommenteras även före produktvalet.

Kommentarer sparas med datum och författare i `product_post_comments`. En
produktkommentar hör till både projektets post och produktens normaliserade
NRF-nummer. Ett påbörjat utkast behåller sin produktkoppling vid byte av
huvudprodukt; gränssnittet förklarar när utkastet gäller det tidigare valet.
Sparade kommentarer på tidigare produktval finns kvar och visar sitt NRF.
Inga kommentarer kopieras till generella produktminnen eller andra projekt.

Kommentarerna sparas separat med **Spara postkommentar** respektive **Spara
produktkommentar**. De ändrar inte krav, mängder eller godkännande. Utkast
omfattas av produktkortets befintliga varning för osparade ändringar. Ett
misslyckat anrop lämnar texten kvar, och samma kommentar-id används vid
omförsök för att undvika dubbletter.

Historiken hämtas vid öppning och via **Uppdatera kommentarer**. Äldre
kommentarer kan hämtas 50 åt gången. Detta är sparade projektkommentarer,
inte en automatisk realtidssynk mellan öppna webbläsare.

## Driftsättning och verifiering

Kör `20260917120000_add_product_post_comments.sql` före frontendpublicering.
Tabellen använder användarens Supabase-session och RLS: rätt projekt,
organisation, kravpost och behörighet krävs både vid läsning och skrivning.
Anonyma användare kan inte läsa eller skriva. Författar-id och tid sätts av
databasen; klienten får inte skriva dessa fält. Tekniska krav och produktminnen
förblir oförändrade.

Verifierat med valideringstester, typkontroll, ESLint, hela migrationskedjan i
en tom databas samt webbläsartester för separata mål, sparfel/omförsök,
produktbyte, omladdning och mobilvy. Databastesterna kontrollerar även att
fel projekt/organisation/användare nekas och att kravposten inte ändras.
