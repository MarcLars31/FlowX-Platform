from __future__ import annotations

import hashlib
from collections.abc import Callable

import httpx
import pytest

from document_crawler.crawler import DocumentCrawler
from document_crawler.database import CrawlerDatabase
from document_crawler.http_client import HttpFetcher
from document_crawler.models import CrawlOptions
from document_crawler.robots import RobotsManager


def _crawler(
    app_config,
    handler: Callable[[httpx.Request], httpx.Response],
    network_guard,
):
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
            network_guard=network_guard,
        ),
        robots=RobotsManager(
            user_agent="Test/1",
            timeout_seconds=2,
            fail_open=False,
            client=robots_client,
            network_guard=network_guard,
        ),
    )
    return crawler, database, fetch_client, robots_client


async def _close(crawler, database, fetch_client, robots_client) -> None:
    await crawler.close()
    await fetch_client.aclose()
    await robots_client.aclose()
    database.close()


@pytest.mark.asyncio
async def test_resume_with_dry_run_never_downloads_queued_pdf(
    app_config, public_network_guard
) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/robots.txt":
            return httpx.Response(200, text="User-agent: *\nAllow: /\n")
        if request.url.path == "/start":
            return httpx.Response(
                200,
                headers={"Content-Type": "text/html"},
                text='<a href="/sprinkler.pdf">Technical data sprinkler</a>',
            )
        return httpx.Response(
            200,
            headers={"Content-Type": "application/pdf"},
            content=b"%PDF-1.7\nqueued document",
        )

    crawler, database, fetch_client, robots_client = _crawler(
        app_config, handler, public_network_guard
    )
    first = await crawler.crawl(
        app_config.suppliers[0],
        CrawlOptions(max_requests=1, max_pages=10, max_files=10),
    )
    assert first.status == "paused"
    assert first.requests == 1
    persisted = database.connection.execute(
        "SELECT * FROM runs WHERE id = ?", (first.run_id,)
    ).fetchone()
    assert persisted["requests_processed"] == 1

    resumed = await crawler.crawl(
        app_config.suppliers[0],
        CrawlOptions(resume=True, dry_run=True, max_requests=10),
    )
    assert resumed.status == "completed"
    assert resumed.requests == 2
    assert database.documents_for_export() == []
    persisted = database.connection.execute(
        "SELECT * FROM runs WHERE id = ?", (first.run_id,)
    ).fetchone()
    assert persisted["dry_run"] == 1
    assert not (app_config.settings.data_dir / "downloads").exists()
    await _close(crawler, database, fetch_client, robots_client)


@pytest.mark.asyncio
@pytest.mark.parametrize("damage", ["missing", "corrupt"])
async def test_known_pdf_is_refetched_when_local_copy_is_invalid(
    app_config, public_network_guard, damage: str
) -> None:
    pdf_body = b"%PDF-1.7\nvalid local document"
    full_pdf_requests = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal full_pdf_requests
        if request.url.path == "/robots.txt":
            return httpx.Response(200, text="User-agent: *\nAllow: /\n")
        if request.url.path == "/start":
            return httpx.Response(
                200,
                headers={"Content-Type": "text/html"},
                text='<a href="/sprinkler.pdf">Technical data sprinkler</a>',
            )
        if request.headers.get("If-None-Match") == '"v1"':
            return httpx.Response(304, headers={"ETag": '"v1"'})
        full_pdf_requests += 1
        return httpx.Response(
            200,
            headers={"Content-Type": "application/pdf", "ETag": '"v1"'},
            content=pdf_body,
        )

    crawler, database, fetch_client, robots_client = _crawler(
        app_config, handler, public_network_guard
    )
    await crawler.crawl(app_config.suppliers[0], CrawlOptions())
    row = database.documents_for_export()[0]
    local_pdf = app_config.settings.data_dir / str(row["local_path"])
    if damage == "missing":
        local_pdf.unlink()
    else:
        local_pdf.write_bytes(b"not a PDF")

    second = await crawler.crawl(app_config.suppliers[0], CrawlOptions())
    assert second.status == "completed"
    assert local_pdf.read_bytes() == pdf_body
    assert hashlib.sha256(local_pdf.read_bytes()).hexdigest() == row["sha256"]
    assert full_pdf_requests == 2
    await _close(crawler, database, fetch_client, robots_client)


@pytest.mark.asyncio
async def test_request_budget_persists_and_exact_final_limit_completes(
    app_config, public_network_guard
) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/robots.txt":
            return httpx.Response(200, text="User-agent: *\nAllow: /\n")
        if request.url.path == "/start":
            return httpx.Response(
                200,
                headers={"Content-Type": "text/html"},
                text="".join(f'<a href="/asset-{number}">Asset</a>' for number in range(3)),
            )
        return httpx.Response(
            200, headers={"Content-Type": "application/octet-stream"}, content=b"x"
        )

    crawler, database, fetch_client, robots_client = _crawler(
        app_config, handler, public_network_guard
    )
    first = await crawler.crawl(
        app_config.suppliers[0],
        CrawlOptions(max_requests=2, max_pages=10, max_files=10),
    )
    assert first.status == "paused"
    assert first.requests == 2
    row = database.connection.execute("SELECT * FROM runs WHERE id = ?", (first.run_id,)).fetchone()
    assert row["requests_processed"] == 2

    resumed = await crawler.crawl(
        app_config.suppliers[0],
        CrawlOptions(resume=True, max_requests=2),
    )
    assert resumed.status == "completed"
    assert resumed.requests == 4
    assert database.pending_count(first.run_id) == 0
    await _close(crawler, database, fetch_client, robots_client)


@pytest.mark.asyncio
async def test_changed_source_hash_removes_unreferenced_document_and_file(
    app_config, public_network_guard
) -> None:
    state = {"body": b"%PDF-1.7\nversion one", "etag": '"v1"'}

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/robots.txt":
            return httpx.Response(200, text="User-agent: *\nAllow: /\n")
        if request.url.path == "/start":
            return httpx.Response(
                200,
                headers={"Content-Type": "text/html"},
                text='<a href="/sprinkler.pdf">Technical data sprinkler</a>',
            )
        if request.headers.get("If-None-Match") == state["etag"]:
            return httpx.Response(304, headers={"ETag": state["etag"]})
        return httpx.Response(
            200,
            headers={"Content-Type": "application/pdf", "ETag": state["etag"]},
            content=state["body"],
        )

    crawler, database, fetch_client, robots_client = _crawler(
        app_config, handler, public_network_guard
    )
    await crawler.crawl(app_config.suppliers[0], CrawlOptions())
    first = database.documents_for_export()[0]
    first_path = app_config.settings.data_dir / str(first["local_path"])
    assert first_path.is_file()

    state.update(body=b"%PDF-1.7\nversion two", etag='"v2"')
    await crawler.crawl(app_config.suppliers[0], CrawlOptions())
    rows = database.documents_for_export()
    assert len(rows) == 1
    assert rows[0]["sha256"] != first["sha256"]
    assert database.stats()["documents"] == 1
    assert not first_path.exists()
    assert (app_config.settings.data_dir / str(rows[0]["local_path"])).is_file()
    await _close(crawler, database, fetch_client, robots_client)
