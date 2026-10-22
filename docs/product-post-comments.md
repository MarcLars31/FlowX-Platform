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

Sparade kommentarer visas före skrivfältet som läsbara kort med författare,
datum och antal visade kommentarer. Produktkommentarer visar NRF och om de
gäller det aktuella eller ett tidigare produktval. **Skriv kommentar**
fokuserar skrivfältet. Historiken har ingen separat, liten rullningsruta.

Författaren kan ta bort sina egna kommentarer via **Ta bort** och en
bekräftelse direkt på kommentaren. Samma skrivbehörighet och projekttillgång
som vid skapandet krävs. API och databas kontrollerar ägarskapet; gränssnittet
visar endast borttagningsknappen när servern anger `can_delete`. Andras
kommentarer kan läsas men inte tas bort. Ett misslyckat anrop behåller
kommentaren och alla påbörjade utkast. Borttagningen ändrar inte produktval
eller godkännande, och kommentaren utelämnas ur kommande Excel-exporter.
Redan nedladdade Excel-filer ändras inte.

Historiken hämtas vid öppning och via **Uppdatera kommentarer**. Äldre
kommentarer kan hämtas 50 åt gången. Detta är sparade projektkommentarer,
inte en automatisk realtidssynk mellan öppna webbläsare.

## Excel-export

Materiallistan innehåller separata kolumner för post- och produktkommentarer.
Postkommentarer följer även poster utan godkänd produkt och demonteringsposter.
Produktkommentarer exporteras bara för huvudproduktens aktuella, godkända NRF
på samma kravpost. De kopieras inte till tillbehör eller till en annan post
med samma artikel. Kommentarer till tidigare eller ej godkända produktval
finns kvar i appen men ingår inte som kommentarer till den exporterade produkten.

När relevanta kommentarer finns läggs fliken **Kommentarer** till med full
text, PDF-postnummer, produkt, NRF, författare och datum i UTC. Mycket lång
historik sammanfattas i materiallistans celler med hänvisning till denna
flik för att inte överskrida Excels cellgräns. Alla sparade kommentarer hämtas
sidvis vid export; sparfel eller läsfel ger ett exportfel i stället för en
fil med tyst utelämnade kommentarer. Osparade utkast ingår inte.

## Driftsättning och verifiering

Kör `20260917120000_add_product_post_comments.sql` före frontendpublicering.
För borttagning krävs även `20260920140000_allow_own_product_comment_deletion.sql`.
Tabellen använder användarens Supabase-session och RLS: rätt projekt,
organisation, kravpost och behörighet krävs både vid läsning och skrivning.
Anonyma användare kan inte läsa eller skriva. Författar-id och tid sätts av
databasen; klienten får inte skriva dessa fält. Tekniska krav och produktminnen
förblir oförändrade.

Verifierat med valideringstester, typkontroll, ESLint, hela migrationskedjan i
en tom databas samt webbläsartester för separata mål, sparfel/omförsök,
produktbyte, omladdning och mobilvy. Databastesterna kontrollerar även att
fel projekt/organisation/användare nekas och att kravposten inte ändras.
