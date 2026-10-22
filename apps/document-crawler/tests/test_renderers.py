from __future__ import annotations

import pytest

from document_crawler.network_security import NetworkGuard
from document_crawler.renderers import PlaywrightRenderer


@pytest.mark.asyncio
async def test_javascript_adapter_blocks_private_and_non_default_port_requests() -> None:
    async def public_dns(_: str, __: int) -> tuple[str, ...]:
        return ("93.184.216.34",)

    renderer = PlaywrightRenderer(
        "Test/1", 2, network_guard=NetworkGuard(public_dns), max_html_bytes=1024
    )

    def allow_host(_: str) -> bool:
        return True

    assert not await renderer.request_is_allowed("http://127.0.0.1/secret", allow_host)
    assert not await renderer.request_is_allowed("https://example.test:444/secret", allow_host)


@pytest.mark.asyncio
async def test_javascript_adapter_applies_allowlist_and_dns_guard(public_network_guard) -> None:
    renderer = PlaywrightRenderer(
        "Test/1", 2, network_guard=public_network_guard, max_html_bytes=1024
    )

    def only_supplier(url: str) -> bool:
        return url.startswith("https://example.test/")

    assert await renderer.request_is_allowed("https://example.test/app.js", only_supplier)
    assert not await renderer.request_is_allowed("https://evil.test/app.js", only_supplier)
    assert await renderer.request_is_allowed("data:text/plain,ok", only_supplier)
