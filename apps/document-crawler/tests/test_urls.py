from document_crawler.urls import looks_like_pdf, normalize_url


def test_normalize_relative_url_and_remove_tracking() -> None:
    result = normalize_url(
        "../docs/My Data.pdf?utm_source=x&lang=en&v=2#page=3",
        "https://EXAMPLE.test/products/family/item",
    )
    assert result == "https://example.test/products/docs/My%20Data.pdf?lang=en&v=2"


def test_normalize_preserves_meaningful_query_and_sorts_it() -> None:
    assert normalize_url("https://example.test/download?z=2&id=10&id=2") == (
        "https://example.test/download?id=10&id=2&z=2"
    )


def test_rejects_non_http_and_detects_query_pdf() -> None:
    assert normalize_url("javascript:alert(1)") is None
    assert normalize_url("https://example.test:not-a-port/file.pdf") is None
    assert normalize_url("https://[invalid/file.pdf") is None
    assert looks_like_pdf("https://example.test/download?id=1&format=pdf")
