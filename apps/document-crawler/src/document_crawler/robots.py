from __future__ import annotations

import logging
import urllib.robotparser
from dataclasses import dataclass
from urllib.parse import urljoin, urlsplit, urlunsplit

import httpx

from document_crawler.network_security import NetworkGuard, UnsafeNetworkTarget
from document_crawler.urls import normalize_url

LOGGER = logging.getLogger(__name__)
MAX_ROBOTS_BYTES = 1024 * 1024
REDIRECT_STATUSES = {301, 302, 303, 307, 308}


class RobotsFetchError(RuntimeError):
    pass


@dataclass(slots=True)
class RobotsRules:
    parser: urllib.robotparser.RobotFileParser | None
    allow_all: bool
    deny_all: bool
    sitemaps: tuple[str, ...] = ()
    crawl_delay: float | None = None


class RobotsManager:
    def __init__(
        self,
        *,
        user_agent: str,
        timeout_seconds: float,
        fail_open: bool,
        client: httpx.AsyncClient | None = None,
        network_guard: NetworkGuard | None = None,
        max_redirects: int = 5,
    ) -> None:
        self.user_agent = user_agent
        self.fail_open = fail_open
        self._client = client or httpx.AsyncClient(timeout=timeout_seconds, follow_redirects=False)
        self._owns_client = client is None
        self.network_guard = network_guard or NetworkGuard()
        self.max_redirects = max(0, max_redirects)
        self._cache: dict[str, RobotsRules] = {}

    async def close(self) -> None:
        if self._owns_client:
            await self._client.aclose()

    @staticmethod
    def _origin_and_robots(url: str) -> tuple[str, str]:
        parts = urlsplit(url)
        origin = urlunsplit((parts.scheme, parts.netloc, "", "", ""))
        return origin, f"{origin}/robots.txt"

    async def _fetch_robots(self, robots_url: str) -> tuple[int, bytes, str]:
        current = robots_url
        original_host = (urlsplit(robots_url).hostname or "").casefold().rstrip(".")
        headers = {
            "User-Agent": self.user_agent,
            "Accept": "text/plain,*/*;q=0.1",
        }
        for redirect_number in range(self.max_redirects + 1):
            await self.network_guard.validate(current)
            async with self._client.stream("GET", current, headers=headers) as response:
                if response.status_code in REDIRECT_STATUSES:
                    location = response.headers.get("location", "")
                    if not location:
                        raise RobotsFetchError(f"Redirect without Location from {current}")
                    if redirect_number >= self.max_redirects:
                        raise RobotsFetchError(f"Too many robots.txt redirects from {robots_url}")
                    target = urljoin(str(response.url), location)
                    target_parts = urlsplit(target)
                    target_host = (target_parts.hostname or "").casefold().rstrip(".")
                    if target_host != original_host:
                        raise RobotsFetchError(
                            f"robots.txt redirect leaves the original host: {target}"
                        )
                    if urlsplit(current).scheme.casefold() == "https" and (
                        target_parts.scheme.casefold() != "https"
                    ):
                        raise RobotsFetchError(
                            f"robots.txt redirect attempts an HTTPS downgrade: {target}"
                        )
                    await self.network_guard.validate(target)
                    current = target
                    continue

                if not 200 <= response.status_code < 300:
                    return response.status_code, b"", str(response.url)

                content_length = response.headers.get("content-length", "")
                if content_length.isdigit() and int(content_length) > MAX_ROBOTS_BYTES:
                    raise RobotsFetchError(
                        f"robots.txt Content-Length exceeds {MAX_ROBOTS_BYTES} bytes"
                    )

                body = bytearray()
                async for chunk in response.aiter_bytes(64 * 1024):
                    if len(body) + len(chunk) > MAX_ROBOTS_BYTES:
                        raise RobotsFetchError(
                            f"robots.txt response exceeds {MAX_ROBOTS_BYTES} bytes"
                        )
                    body.extend(chunk)
                return response.status_code, bytes(body), str(response.url)
        raise RobotsFetchError(f"Redirect limit exceeded for {robots_url}")

    async def _load(self, url: str) -> RobotsRules:
        origin, robots_url = self._origin_and_robots(url)
        if origin in self._cache:
            return self._cache[origin]
        try:
            status_code, body, final_url = await self._fetch_robots(robots_url)
            if status_code == 404:
                rules = RobotsRules(None, allow_all=True, deny_all=False)
            elif status_code in {401, 403}:
                rules = RobotsRules(None, allow_all=False, deny_all=True)
            elif status_code >= 300:
                rules = RobotsRules(None, allow_all=self.fail_open, deny_all=not self.fail_open)
            else:
                text = body.decode("utf-8", errors="replace")
                parser = urllib.robotparser.RobotFileParser(robots_url)
                parser.parse(text.splitlines())
                sitemaps: list[str] = []
                for line in text.splitlines():
                    key, separator, value = line.partition(":")
                    if separator and key.strip().casefold() == "sitemap":
                        normalized = normalize_url(value.strip(), final_url)
                        if normalized:
                            sitemaps.append(normalized)
                delay = parser.crawl_delay(self.user_agent)
                if delay is None:
                    delay = parser.crawl_delay("*")
                rules = RobotsRules(
                    parser,
                    False,
                    False,
                    tuple(dict.fromkeys(sitemaps)),
                    float(delay) if delay is not None else None,
                )
        except UnsafeNetworkTarget as error:
            # An SSRF guard failure is never eligible for fail-open behavior.
            LOGGER.warning("Blocked unsafe robots.txt target %s: %s", robots_url, error)
            rules = RobotsRules(None, allow_all=False, deny_all=True)
        except RobotsFetchError as error:
            LOGGER.warning("Rejected %s: %s", robots_url, error)
            rules = RobotsRules(None, allow_all=False, deny_all=True)
        except httpx.HTTPError as error:
            LOGGER.warning("Could not load %s: %s", robots_url, error)
            rules = RobotsRules(None, allow_all=self.fail_open, deny_all=not self.fail_open)
        self._cache[origin] = rules
        return rules

    async def can_fetch(self, url: str) -> bool:
        rules = await self._load(url)
        if rules.allow_all:
            return True
        if rules.deny_all or rules.parser is None:
            return False
        return rules.parser.can_fetch(self.user_agent, url)

    async def sitemaps_for(self, url: str) -> tuple[str, ...]:
        return (await self._load(url)).sitemaps

    async def crawl_delay_for(self, url: str) -> float | None:
        return (await self._load(url)).crawl_delay
