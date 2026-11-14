# Produktdatabasen

Teknisk produktidentitet ligger i `products` och `product_variants`. Kategorier,
tillverkare och standarder är globala katalogdata. `attribute_definitions` och
`product_attribute_values` ger typade, sökbara tekniska attribut med JSONB som
komplement för originaldata. Kritiska attribut ska ha `source_document_id`,
`source_reference` och verifieringsstatus.

Leverantörens artikelnummer ligger i `supplier_products`; pris, lager och
giltighet ligger i organisationsisolerade `supplier_offers`. Därmed kan samma
globala produkt ha olika avtalspris utan att data läcker mellan kunder.

`catalog_imports` och `catalog_import_errors` sparar importens status, radantal
och fel för dry-run, idempotens och återkörning. Global katalog kan läsas av
autentiserade användare endast när produkten är godkänd/aktiv; skrivningar går
via betrodd backend/service role och får aldrig exponeras i klienten.

Matchning ska alltid göra teknisk efterlevnad först. Ranking och kommersiella
vikter får bara ordna tekniskt godkända kandidater.
