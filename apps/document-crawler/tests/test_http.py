from __future__ import annotations

from pathlib import Path

import httpx
import pytest

from document_crawler.http_client import (
    DisallowedRedirect,
    FetchError,
    HttpFetcher,
    ResourceTooLarge,
)
from document_crawler.network_security import NetworkGuard, UnsafeNetworkTarget


async def _allow(_: str) -> bool:
    return True


def _inside(url: str) -> bool:
    return url.startswith("https://example.test/")


class ChunkedStream(httpx.AsyncByteStream):
    def __init__(self, *chunks: bytes) -> None:
        self.chunks = chunks

    async def __aiter__(self):
        for chunk in self.chunks:
            yield chunk


@pytest.mark.asyncio
async def test_redirect_and_signature_stream(tmp_path: Path, public_network_guard) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/old":
            return httpx.Response(302, headers={"Location": "/download?id=1"})
        return httpx.Response(
            200,
            headers={"Content-Type": "application/octet-stream"},
            content=b"%PDF-1.7\nbody",
        )

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    fetcher = HttpFetcher(
        user_agent="Test/1",
        timeout_seconds=2,
        delay_seconds=0,
        retries=1,
        backoff_seconds=0,
        max_redirects=2,
        temp_dir=tmp_path,
        client=client,
        network_guard=public_network_guard,
    )
    result = await fetcher.fetch(
        "https://example.test/old",
        allowed_url=_inside,
        can_fetch=_allow,
        conditional_headers=None,
        max_html_bytes=1024,
        max_document_bytes=1024,
    )
    assert result.final_url == "https://example.test/download?id=1"
    assert result.prefix.startswith(b"%PDF-")
    assert result.sha256
    assert result.temp_path and result.temp_path.read_bytes() == b"%PDF-1.7\nbody"
    result.temp_path.unlink()
    await client.aclose()


@pytest.mark.asyncio
async def test_external_redirect_is_blocked_before_follow(
    tmp_path: Path, public_network_guard
) -> None:
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(302, headers={"Location": "https://evil.test/file.pdf"})

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    fetcher = HttpFetcher(
        user_agent="Test/1",
        timeout_seconds=2,
        delay_seconds=0,
        retries=1,
        backoff_seconds=0,
        max_redirects=2,
        temp_dir=tmp_path,
        client=client,
        network_guard=public_network_guard,
    )
    with pytest.raises(DisallowedRedirect):
        await fetcher.fetch(
            "https://example.test/start",
            allowed_url=_inside,
            can_fetch=_allow,
            conditional_headers=None,
            max_html_bytes=1024,
            max_document_bytes=1024,
        )
    assert calls == 1
    await client.aclose()


@pytest.mark.asyncio
async def test_https_redirect_downgrade_is_blocked_before_follow(
    tmp_path: Path, public_network_guard
) -> None:
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(302, headers={"Location": "http://example.test/insecure.pdf"})

    def allowed(url: str) -> bool:
        return httpx.URL(url).host == "example.test"

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    fetcher = HttpFetcher(
        user_agent="Test/1",
        timeout_seconds=2,
        delay_seconds=0,
        retries=1,
        backoff_seconds=0,
        max_redirects=2,
        temp_dir=tmp_path,
        client=client,
        network_guard=public_network_guard,
    )
    with pytest.raises(DisallowedRedirect, match="downgrade"):
        await fetcher.fetch(
            "https://example.test/start",
            allowed_url=allowed,
            can_fetch=_allow,
            conditional_headers=None,
            max_html_bytes=1024,
            max_document_bytes=1024,
        )
    assert calls == 1
    await client.aclose()


@pytest.mark.asyncio
async def test_size_limit_is_enforced(tmp_path: Path, public_network_guard) -> None:
    client = httpx.AsyncClient(
        transport=httpx.MockTransport(
            lambda request: httpx.Response(
                200, headers={"Content-Length": "9999"}, content=b"x" * 10
            )
        )
    )
    fetcher = HttpFetcher(
        user_agent="Test/1",
        timeout_seconds=2,
        delay_seconds=0,
        retries=1,
        backoff_seconds=0,
        max_redirects=1,
        temp_dir=tmp_path,
        client=client,
        network_guard=public_network_guard,
    )
    with pytest.raises(ResourceTooLarge):
        await fetcher.fetch(
            "https://example.test/file",
            allowed_url=_inside,
            can_fetch=_allow,
            conditional_headers=None,
            max_html_bytes=10,
            max_document_bytes=10,
        )
    await client.aclose()


@pytest.mark.asyncio
async def test_stream_with_extra_chunk_after_exact_limit_is_rejected_and_cleaned(
    tmp_path: Path, public_network_guard
) -> None:
    client = httpx.AsyncClient(
        transport=httpx.MockTransport(
            lambda request: httpx.Response(200, stream=ChunkedStream(b"1234", b"x"))
        )
    )
    fetcher = HttpFetcher(
        user_agent="Test/1",
        timeout_seconds=2,
        delay_seconds=0,
        retries=3,
        backoff_seconds=0,
        max_redirects=1,
        temp_dir=tmp_path,
        client=client,
        network_guard=public_network_guard,
    )
    with pytest.raises(ResourceTooLarge):
        await fetcher.fetch(
            "https://example.test/file",
            allowed_url=_inside,
            can_fetch=_allow,
            conditional_headers=None,
            max_html_bytes=4,
            max_document_bytes=4,
        )
    assert list(tmp_path.glob("crawl-*.part")) == []
    await client.aclose()


@pytest.mark.asyncio
async def test_preview_setting_cannot_bypass_smaller_document_limit(
    tmp_path: Path, public_network_guard
) -> None:
    client = httpx.AsyncClient(
        transport=httpx.MockTransport(
            lambda request: httpx.Response(200, stream=ChunkedStream(b"1234", b"x"))
        )
    )
    fetcher = HttpFetcher(
        user_agent="Test/1",
        timeout_seconds=2,
        delay_seconds=0,
        retries=1,
        backoff_seconds=0,
        max_redirects=1,
        temp_dir=tmp_path,
        client=client,
        network_guard=public_network_guard,
    )
    with pytest.raises(ResourceTooLarge):
        await fetcher.fetch(
            "https://example.test/file",
            allowed_url=_inside,
            can_fetch=_allow,
            conditional_headers=None,
            max_html_bytes=4,
            max_document_bytes=4,
            preview_bytes=8192,
        )
    assert list(tmp_path.glob("crawl-*.part")) == []
    await client.aclose()


@pytest.mark.asyncio
async def test_non_transient_http_status_is_not_retried(
    tmp_path: Path, public_network_guard
) -> None:
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(404)

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    fetcher = HttpFetcher(
        user_agent="Test/1",
        timeout_seconds=2,
        delay_seconds=0,
        retries=3,
        backoff_seconds=0,
        max_redirects=1,
        temp_dir=tmp_path,
        client=client,
        network_guard=public_network_guard,
    )
    with pytest.raises(FetchError, match="HTTP 404"):
        await fetcher.fetch(
            "https://example.test/missing",
            allowed_url=_inside,
            can_fetch=_allow,
            conditional_headers=None,
            max_html_bytes=1024,
            max_document_bytes=1024,
        )
    assert calls == 1
    await client.aclose()


@pytest.mark.asyncio
async def test_transient_http_status_is_retried(tmp_path: Path, public_network_guard) -> None:
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(503)

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    fetcher = HttpFetcher(
        user_agent="Test/1",
        timeout_seconds=2,
        delay_seconds=0,
        retries=3,
        backoff_seconds=0,
        max_redirects=1,
        temp_dir=tmp_path,
        client=client,
        network_guard=public_network_guard,
    )
    with pytest.raises(FetchError, match="3 attempt"):
        await fetcher.fetch(
            "https://example.test/unavailable",
            allowed_url=_inside,
            can_fetch=_allow,
            conditional_headers=None,
            max_html_bytes=1024,
            max_document_bytes=1024,
        )
    assert calls == 3
    await client.aclose()


@pytest.mark.asyncio
async def test_redirect_is_dns_revalidated_before_second_request(tmp_path: Path) -> None:
    resolutions = 0
    requests = 0

    async def resolve(_: str, __: int) -> tuple[str, ...]:
        nonlocal resolutions
        resolutions += 1
        return ("93.184.216.34",) if resolutions == 1 else ("127.0.0.1",)

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal requests
        requests += 1
        return httpx.Response(302, headers={"Location": "/internal"})

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    fetcher = HttpFetcher(
        user_agent="Test/1",
        timeout_seconds=2,
        delay_seconds=0,
        retries=3,
        backoff_seconds=0,
        max_redirects=2,
        temp_dir=tmp_path,
        client=client,
        network_guard=NetworkGuard(resolver=resolve),
    )
    with pytest.raises(UnsafeNetworkTarget):
        await fetcher.fetch(
            "https://example.test/start",
            allowed_url=_inside,
            can_fetch=_allow,
            conditional_headers=None,
            max_html_bytes=1024,
            max_document_bytes=1024,
        )
    assert resolutions == 2
    assert requests == 1
    await client.aclose()


@pytest.mark.asyncio
async def test_conditional_request_returns_without_body(
    tmp_path: Path, public_network_guard
) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["If-None-Match"] == '"v1"'
        return httpx.Response(304, headers={"ETag": '"v1"'})

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    fetcher = HttpFetcher(
        user_agent="Test/1",
        timeout_seconds=2,
        delay_seconds=0,
        retries=1,
        backoff_seconds=0,
        max_redirects=1,
        temp_dir=tmp_path,
        client=client,
        network_guard=public_network_guard,
    )
    result = await fetcher.fetch(
        "https://example.test/file.pdf",
        allowed_url=_inside,
        can_fetch=_allow,
        conditional_headers={"If-None-Match": '"v1"'},
        max_html_bytes=1024,
        max_document_bytes=1024,
    )
    assert result.status_code == 304
    assert result.temp_path is None
    await client.aclose()
