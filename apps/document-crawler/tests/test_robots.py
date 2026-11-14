import httpx
import pytest

from document_crawler.robots import RobotsManager


class CountingRobotsStream(httpx.AsyncByteStream):
    def __init__(self, chunks: tuple[bytes, ...]) -> None:
        self.chunks = chunks
        self.yielded = 0

    async def __aiter__(self):
        for chunk in self.chunks:
            self.yielded += 1
            yield chunk


@pytest.mark.asyncio
async def test_robots_disallow_and_sitemap(public_network_guard) -> None:
    body = (
        "User-agent: *\nDisallow: /private\nCrawl-delay: 7\n"
        "Sitemap: https://example.test/map.xml\n"
    )
    client = httpx.AsyncClient(
        transport=httpx.MockTransport(lambda request: httpx.Response(200, text=body))
    )
    robots = RobotsManager(
        user_agent="Test/1",
        timeout_seconds=2,
        fail_open=False,
        client=client,
        network_guard=public_network_guard,
    )
    assert await robots.can_fetch("https://example.test/public")
    assert not await robots.can_fetch("https://example.test/private/file.pdf")
    assert await robots.sitemaps_for("https://example.test/") == ("https://example.test/map.xml",)
    assert await robots.crawl_delay_for("https://example.test/") == 7
    await client.aclose()


@pytest.mark.asyncio
async def test_robots_failure_is_closed_by_default(public_network_guard) -> None:
    client = httpx.AsyncClient(transport=httpx.MockTransport(lambda request: httpx.Response(503)))
    robots = RobotsManager(
        user_agent="Test/1",
        timeout_seconds=2,
        fail_open=False,
        client=client,
        network_guard=public_network_guard,
    )
    assert not await robots.can_fetch("https://example.test/a")
    await client.aclose()


@pytest.mark.asyncio
async def test_robots_follows_bounded_same_host_redirect_chain(public_network_guard) -> None:
    calls: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request.url.path)
        if request.url.path == "/robots.txt":
            return httpx.Response(301, headers={"Location": "/robots-one"})
        if request.url.path == "/robots-one":
            return httpx.Response(302, headers={"Location": "/robots-two"})
        return httpx.Response(200, text="User-agent: *\nDisallow: /private\n")

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    robots = RobotsManager(
        user_agent="Test/1",
        timeout_seconds=2,
        fail_open=False,
        client=client,
        network_guard=public_network_guard,
        max_redirects=2,
    )
    assert not await robots.can_fetch("https://example.test/private/file.pdf")
    assert calls == ["/robots.txt", "/robots-one", "/robots-two"]
    await client.aclose()


@pytest.mark.asyncio
async def test_robots_rejects_redirect_chain_beyond_limit(public_network_guard) -> None:
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(302, headers={"Location": f"/redirect-{calls}"})

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    robots = RobotsManager(
        user_agent="Test/1",
        timeout_seconds=2,
        fail_open=True,
        client=client,
        network_guard=public_network_guard,
        max_redirects=2,
    )
    assert not await robots.can_fetch("https://example.test/file.pdf")
    assert calls == 3
    await client.aclose()


@pytest.mark.asyncio
async def test_robots_rejects_https_downgrade_even_when_fail_open(public_network_guard) -> None:
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(302, headers={"Location": "http://example.test/robots.txt"})

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    robots = RobotsManager(
        user_agent="Test/1",
        timeout_seconds=2,
        fail_open=True,
        client=client,
        network_guard=public_network_guard,
    )
    assert not await robots.can_fetch("https://example.test/file.pdf")
    assert calls == 1
    await client.aclose()


@pytest.mark.asyncio
async def test_robots_stream_is_bounded_before_entire_body_is_buffered(
    public_network_guard,
) -> None:
    stream = CountingRobotsStream((b"x" * (64 * 1024),) * 20)
    client = httpx.AsyncClient(
        transport=httpx.MockTransport(lambda request: httpx.Response(200, stream=stream))
    )
    robots = RobotsManager(
        user_agent="Test/1",
        timeout_seconds=2,
        fail_open=True,
        client=client,
        network_guard=public_network_guard,
    )
    assert not await robots.can_fetch("https://example.test/file.pdf")
    assert stream.yielded == 17
    await client.aclose()


@pytest.mark.asyncio
async def test_robots_ssrf_failure_never_fails_open() -> None:
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(404)

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    robots = RobotsManager(user_agent="Test/1", timeout_seconds=2, fail_open=True, client=client)
    assert not await robots.can_fetch("http://127.0.0.1/document.pdf")
    assert calls == 0
    await client.aclose()
