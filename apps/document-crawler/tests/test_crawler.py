from __future__ import annotations

import httpx
import pytest

from document_crawler.crawler import DocumentCrawler
from document_crawler.database import CrawlerDatabase
from document_crawler.http_client import HttpFetcher
from document_crawler.models import CrawlOptions
from document_crawler.robots import RobotsManager


class CountingStream(httpx.AsyncByteStream):
    def __init__(self, chunks: tuple[bytes, ...]) -> None:
        self.chunks = chunks
        self.yielded = 0

    async def __aiter__(self):
        for chunk in self.chunks:
            self.yielded += 1
            yield chunk


@pytest.mark.asyncio
async def test_crawler_downloads_relevant_pdf_and_isolates_failure(
    app_config, public_network_guard
) -> None:
    requests: dict[str, int] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        requests[path] = requests.get(path, 0) + 1
        if path == "/robots.txt":
            return httpx.Response(200, text="User-agent: *\nAllow: /\n")
        if path == "/start":
            return httpx.Response(
                200,
                headers={"Content-Type": "text/html"},
                text=(
                    "<html><title>Sprinkler library</title><body>"
                    '<a href="/download?id=1">Technical data sprinkler VK100</a>'
                    '<a href="/broken">Technical data sprinkler broken</a>'
                    "</body></html>"
                ),
            )
        if path == "/download":
            return httpx.Response(
                200,
                headers={"Content-Type": "application/octet-stream", "ETag": '"v1"'},
                content=b"%PDF-1.7\nvalid body",
            )
        if path == "/broken":
            return httpx.Response(500)
        return httpx.Response(404)

    transport = httpx.MockTransport(handler)
    fetch_client = httpx.AsyncClient(transport=transport)
    robots_client = httpx.AsyncClient(transport=transport)
    fetcher = HttpFetcher(
        user_agent=app_config.settings.user_agent,
        timeout_seconds=2,
        delay_seconds=0,
        retries=2,
        backoff_seconds=0,
        max_redirects=2,
        temp_dir=app_config.settings.data_dir / "tmp",
        client=fetch_client,
        network_guard=public_network_guard,
    )
    robots = RobotsManager(
        user_agent=app_config.settings.user_agent,
        timeout_seconds=2,
        fail_open=False,
        client=robots_client,
        network_guard=public_network_guard,
    )
    database = CrawlerDatabase(app_config.settings.database_path)
    crawler = DocumentCrawler(app_config, database, fetcher=fetcher, robots=robots)
    outcome = await crawler.crawl(app_config.suppliers[0], CrawlOptions())

    assert outcome.status == "completed"
    assert outcome.files == 1
    assert outcome.errors == 1
    rows = database.documents_for_export()
    assert len(rows) == 1
    downloaded = app_config.settings.data_dir / rows[0]["local_path"]
    assert downloaded.read_bytes().startswith(b"%PDF-")
    assert rows[0]["product_family"] == "VK100"
    assert requests["/broken"] == 2

    await crawler.close()
    await fetch_client.aclose()
    await robots_client.aclose()
    database.close()


@pytest.mark.asyncio
async def test_dry_run_does_not_store_pdf(app_config, public_network_guard) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/robots.txt":
            return httpx.Response(404)
        if request.url.path == "/start":
            return httpx.Response(
                200,
                headers={"Content-Type": "text/html"},
                text='<a href="/sprinkler.pdf">Technical data sprinkler</a>',
            )
        return httpx.Response(
            200, headers={"Content-Type": "application/pdf"}, content=b"%PDF-1.7\n"
        )

    transport = httpx.MockTransport(handler)
    fetch_client = httpx.AsyncClient(transport=transport)
    robots_client = httpx.AsyncClient(transport=transport)
    database = CrawlerDatabase(app_config.settings.database_path)
    crawler = DocumentCrawler(
        app_config,
        database,
        fetcher=HttpFetcher(
            user_agent="Test/1",
            timeout_seconds=2,
            delay_seconds=0,
            retries=1,
            backoff_seconds=0,
            max_redirects=2,
            temp_dir=app_config.settings.data_dir / "tmp",
            client=fetch_client,
            network_guard=public_network_guard,
        ),
        robots=RobotsManager(
            user_agent="Test/1",
            timeout_seconds=2,
            fail_open=False,
            client=robots_client,
            network_guard=public_network_guard,
        ),
    )
    outcome = await crawler.crawl(app_config.suppliers[0], CrawlOptions(dry_run=True))
    assert outcome.files == 1
    assert outcome.reviews == 1
    assert database.documents_for_export() == []
    assert not (app_config.settings.data_dir / "downloads").exists()
    await crawler.close()
    await fetch_client.aclose()
    await robots_client.aclose()
    database.close()


@pytest.mark.asyncio
async def test_dry_run_probes_extensionless_pdf_and_cleans_temp_file(
    app_config, public_network_guard
) -> None:
    pdf_stream = CountingStream((b"%PDF-1.7\n" + b"x" * (4096 - 9),) + (b"x" * 4096,) * 9)

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/robots.txt":
            return httpx.Response(404)
        if request.url.path == "/start":
            return httpx.Response(
                200,
                headers={"Content-Type": "text/html"},
                text='<a href="/download?id=42">Technical data sprinkler</a>',
            )
        return httpx.Response(
            200,
            headers={"Content-Type": "application/octet-stream"},
            stream=pdf_stream,
        )

    transport = httpx.MockTransport(handler)
    fetch_client = httpx.AsyncClient(transport=transport)
    robots_client = httpx.AsyncClient(transport=transport)
    database = CrawlerDatabase(app_config.settings.database_path)
    temp_dir = app_config.settings.data_dir / "tmp"
    crawler = DocumentCrawler(
        app_config,
        database,
        fetcher=HttpFetcher(
            user_agent="Test/1",
            timeout_seconds=2,
            delay_seconds=0,
            retries=1,
            backoff_seconds=0,
            max_redirects=2,
            temp_dir=temp_dir,
            client=fetch_client,
            network_guard=public_network_guard,
        ),
        robots=RobotsManager(
            user_agent="Test/1",
            timeout_seconds=2,
            fail_open=False,
            client=robots_client,
            network_guard=public_network_guard,
        ),
    )
    outcome = await crawler.crawl(app_config.suppliers[0], CrawlOptions(dry_run=True))
    assert outcome.files == 1
    assert outcome.reviews == 1
    # httpx may pre-buffer a few source chunks, but must stop well before the
    # complete extensionless document has been consumed.
    assert pdf_stream.yielded < len(pdf_stream.chunks)
    assert list(temp_dir.glob("crawl-*.part")) == []
    assert database.documents_for_export() == []
    await crawler.close()
    await fetch_client.aclose()
    await robots_client.aclose()
    database.close()


@pytest.mark.asyncio
async def test_identical_pdf_hash_creates_one_file_and_two_sources(
    app_config, public_network_guard
) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/robots.txt":
            return httpx.Response(404)
        if request.url.path == "/start":
            return httpx.Response(
                200,
                headers={"Content-Type": "text/html"},
                text=(
                    '<a href="/a.pdf">Technical data sprinkler A</a>'
                    '<a href="/b.pdf">Technical data sprinkler B</a>'
                ),
            )
        return httpx.Response(
            200,
            headers={"Content-Type": "application/pdf"},
            content=b"%PDF-1.7\nsame document",
        )

    transport = httpx.MockTransport(handler)
    fetch_client = httpx.AsyncClient(transport=transport)
    robots_client = httpx.AsyncClient(transport=transport)
    database = CrawlerDatabase(app_config.settings.database_path)
    crawler = DocumentCrawler(
        app_config,
        database,
        fetcher=HttpFetcher(
            user_agent="Test/1",
            timeout_seconds=2,
            delay_seconds=0,
            retries=1,
            backoff_seconds=0,
            max_redirects=2,
            temp_dir=app_config.settings.data_dir / "tmp",
            client=fetch_client,
            network_guard=public_network_guard,
        ),
        robots=RobotsManager(
            user_agent="Test/1",
            timeout_seconds=2,
            fail_open=False,
            client=robots_client,
            network_guard=public_network_guard,
        ),
    )
    outcome = await crawler.crawl(app_config.suppliers[0], CrawlOptions())
    stats = database.stats()
    assert outcome.files == 2
    assert stats["documents"] == 1
    assert stats["document_sources"] == 2
    assert len(list((app_config.settings.data_dir / "downloads" / "test").glob("*.pdf"))) == 1
    await crawler.close()
    await fetch_client.aclose()
    await robots_client.aclose()
    database.close()
