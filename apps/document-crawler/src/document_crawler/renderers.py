from __future__ import annotations

from collections.abc import Callable
from typing import Any, cast

from document_crawler.network_security import NetworkGuard, UnsafeNetworkTarget


class PlaywrightRenderer:
    """Optional, isolated JavaScript renderer. It is never enabled by default."""

    def __init__(
        self,
        user_agent: str,
        timeout_seconds: float,
        *,
        network_guard: NetworkGuard | None = None,
        max_html_bytes: int,
    ) -> None:
        self.user_agent = user_agent
        self.timeout_ms = int(timeout_seconds * 1000)
        self.network_guard = network_guard or NetworkGuard()
        self.max_html_bytes = max_html_bytes

    async def request_is_allowed(self, url: str, allowed_url: Callable[[str], bool]) -> bool:
        if url.startswith(("data:", "blob:")):
            return True
        if not allowed_url(url):
            return False
        try:
            await self.network_guard.validate(url)
        except UnsafeNetworkTarget:
            return False
        return True

    async def render(self, url: str, allowed_url: Callable[[str], bool]) -> bytes:
        try:
            from playwright.async_api import async_playwright  # type: ignore[import-not-found]
        except ImportError as error:
            raise RuntimeError(
                "JavaScript rendering requires: pip install -e '.[browser]' "
                "&& playwright install chromium"
            ) from error

        if not await self.request_is_allowed(url, allowed_url):
            raise UnsafeNetworkTarget(f"JavaScript renderer blocked unsafe URL: {url}")

        async with async_playwright() as playwright:
            browser = await playwright.chromium.launch(headless=True)
            # Service workers can make requests outside page.route(), so they
            # are disabled for this read-only crawler adapter.
            context = await browser.new_context(
                user_agent=self.user_agent,
                service_workers="block",
                accept_downloads=False,
            )
            page = await context.new_page()

            async def filter_request(route: Any) -> None:
                request_url = route.request.url
                if await self.request_is_allowed(request_url, allowed_url):
                    await route.continue_()
                else:
                    await route.abort()

            await page.route("**/*", filter_request)

            async def block_websocket(route: Any) -> None:
                # WebSockets are unnecessary for static document discovery and
                # are not covered by the normal HTTP request route.
                await route.close()

            await page.route_web_socket("**/*", block_websocket)
            try:
                await page.goto(url, wait_until="domcontentloaded", timeout=self.timeout_ms)
                if not await self.request_is_allowed(page.url, allowed_url):
                    raise UnsafeNetworkTarget(
                        f"JavaScript navigation ended at an unsafe URL: {page.url}"
                    )
                await page.wait_for_timeout(750)
                content = cast(str, await page.content()).encode("utf-8")
                if len(content) > self.max_html_bytes:
                    raise RuntimeError(f"Rendered HTML exceeds {self.max_html_bytes} bytes: {url}")
                return content
            finally:
                await context.close()
                await browser.close()
