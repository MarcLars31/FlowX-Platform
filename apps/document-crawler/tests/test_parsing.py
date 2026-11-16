from document_crawler.html_parser import parse_html
from document_crawler.sitemap import parse_sitemap


def test_html_relative_links_and_context() -> None:
    page = parse_html(
        """
        <html><head><title>Sprinkler products</title></head><body>
          <section><h2>VK100</h2><p>Technical data</p>
            <a href="../docs/vk100.pdf">Download PDF</a></section>
          <iframe src="/viewer?id=2"></iframe>
        </body></html>
        """,
        "https://example.test/products/vk100",
    )
    assert page.title == "Sprinkler products"
    assert [link.url for link in page.links] == [
        "https://example.test/docs/vk100.pdf",
        "https://example.test/viewer?id=2",
    ]
    assert "Technical data" in page.links[0].context


def test_sitemap_index_and_urlset() -> None:
    index = parse_sitemap(
        b'<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
        b"<sitemap><loc>/child.xml</loc></sitemap></sitemapindex>",
        "https://example.test/sitemap.xml",
    )
    assert index.child_sitemaps == ("https://example.test/child.xml",)
    content = parse_sitemap(
        b"<urlset><url><loc>https://example.test/file.pdf</loc></url></urlset>",
        "https://example.test/sitemap.xml",
    )
    assert content.urls == ("https://example.test/file.pdf",)
