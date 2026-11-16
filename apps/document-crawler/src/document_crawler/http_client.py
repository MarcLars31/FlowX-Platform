from __future__ import annotations

import asyncio
import hashlib
import os
import tempfile
import time
from collections.abc import Awaitable, Callable, Mapping
from pathlib import Path
from urllib.parse import urljoin, urlsplit

import httpx

from document_crawler.models import FetchResult
from document_crawler.network_security import NetworkGuard


class FetchError(RuntimeError):
    pass


class RobotsDenied(FetchError):
    pass


class DisallowedRedirect(FetchError):
    pass


class ResourceTooLarge(FetchError):
    pass


class HttpFetcher:
    def __init__(
        self,
        *,
        user_agent: str,
        timeout_seconds: float,
        delay_seconds: float,
        retries: int,
        backoff_seconds: float,
        max_redirects: int,
        temp_dir: Path,
        client: httpx.AsyncClient | None = None,
        network_guard: NetworkGuard | None = None,
    ) -> None:
        self.user_agent = user_agent
        self.delay_seconds = max(0.0, delay_seconds)
        self.retries = max(1, retries)
        self.backoff_seconds = max(0.0, backoff_seconds)
        self.max_redirects = max_redirects
        self.temp_dir = temp_dir
        self.temp_dir.mkdir(parents=True, exist_ok=True)
        self._client = client or httpx.AsyncClient(
            timeout=httpx.Timeout(timeout_seconds), follow_redirects=False
        )
        self._owns_client = client is None
        self.network_guard = network_guard or NetworkGuard()
        self._last_request: dict[str, float] = {}
        self._host_delays: dict[str, float] = {}
        self._rate_lock = asyncio.Lock()

    async def close(self) -> None:
        if self._owns_client:
            await self._client.aclose()

    async def _rate_limit(self, url: str) -> None:
        host = (urlsplit(url).hostname or "").casefold()
        async with self._rate_lock:
            now = time.monotonic()
            delay = max(self.delay_seconds, self._host_delays.get(host, 0.0))
            wait = delay - (now - self._last_request.get(host, 0.0))
            if wait > 0:
                await asyncio.sleep(wait)
            self._last_request[host] = time.monotonic()

    def set_host_minimum_delay(self, url: str, seconds: float | None) -> None:
        if seconds is None:
            return
        host = (urlsplit(url).hostname or "").casefold()
        self._host_delays[host] = max(self._host_delays.get(host, 0.0), seconds)

    @staticmethod
    def _retry_delay(response: httpx.Response | None, fallback: float) -> float:
        if response is not None:
            value = response.headers.get("retry-after", "").strip()
            if value.isdigit():
                return min(float(value), 60.0)
        return fallback

    async def fetch(
        self,
        url: str,
        *,
        allowed_url: Callable[[str], bool],
        can_fetch: Callable[[str], Awaitable[bool]],
        conditional_headers: Mapping[str, str] | None,
        max_html_bytes: int,
        max_document_bytes: int,
        preview_bytes: int | None = None,
    ) -> FetchResult:
        last_error: Exception | None = None
        for attempt in range(self.retries):
            current = url
            try:
                for redirect_number in range(self.max_redirects + 1):
                    if not allowed_url(current):
                        raise DisallowedRedirect(
                            f"URL is outside the supplier allowlist: {current}"
                        )
                    await self.network_guard.validate(current)
                    if not await can_fetch(current):
                        raise RobotsDenied(f"robots.txt disallows: {current}")
                    await self._rate_limit(current)
                    headers = {"User-Agent": self.user_agent, "Accept": "*/*"}
                    if conditional_headers:
                        headers.update(conditional_headers)

                    async with self._client.stream("GET", current, headers=headers) as response:
                        if response.status_code in {301, 302, 303, 307, 308}:
                            location = response.headers.get("location")
                            if not location:
                                raise FetchError(f"Redirect without Location from {current}")
                            if redirect_number >= self.max_redirects:
                                raise FetchError(f"Too many redirects from {url}")
                            target = urljoin(str(response.url), location)
                            if urlsplit(current).scheme.casefold() == "https" and (
                                urlsplit(target).scheme.casefold() != "https"
                            ):
                                raise DisallowedRedirect(
                                    f"Redirect attempts an HTTPS downgrade: {target}"
                                )
                            if not allowed_url(target):
                                raise DisallowedRedirect(
                                    f"Redirect leaves the supplier allowlist: {target}"
                                )
                            current = target
                            continue

                        if response.status_code == 304:
                            return FetchResult(
                                requested_url=url,
                                final_url=str(response.url),
                                status_code=304,
                                headers={
                                    key.casefold(): value for key, value in response.headers.items()
                                },
                                temp_path=None,
                            )
                        if 300 <= response.status_code < 400:
                            raise FetchError(
                                f"Unhandled HTTP redirect {response.status_code} for {current}"
                            )
                        if response.status_code in {408, 425, 429, 500, 502, 503, 504}:
                            raise httpx.HTTPStatusError(
                                f"Retryable HTTP {response.status_code}",
                                request=response.request,
                                response=response,
                            )
                        if response.status_code >= 400:
                            raise FetchError(f"HTTP {response.status_code} for {current}")

                        response_headers = {
                            key.casefold(): value for key, value in response.headers.items()
                        }
                        content_type = response_headers.get("content-type", "").casefold()
                        is_markup = any(
                            value in content_type
                            for value in (
                                "text/html",
                                "application/xhtml",
                                "application/xml",
                                "text/xml",
                            )
                        )
                        full_resource_limit = max_html_bytes if is_markup else max_document_bytes
                        resource_limit = full_resource_limit
                        previewing = (
                            preview_bytes is not None
                            and not is_markup
                            and preview_bytes < full_resource_limit
                        )
                        if previewing:
                            assert preview_bytes is not None
                            resource_limit = min(resource_limit, preview_bytes)
                        content_length = response_headers.get("content-length", "")
                        if (
                            content_length.isdigit()
                            and int(content_length) > full_resource_limit
                        ):
                            raise ResourceTooLarge(
                                "Content-Length "
                                f"{content_length} exceeds {full_resource_limit} bytes"
                            )

                        descriptor, temp_name = tempfile.mkstemp(
                            prefix="crawl-", suffix=".part", dir=self.temp_dir
                        )
                        os.close(descriptor)
                        temp_path = Path(temp_name)
                        digest = hashlib.sha256()
                        prefix = bytearray()
                        size = 0
                        truncated = False
                        try:
                            with temp_path.open("wb") as output:
                                stream_chunk_size = min(64 * 1024, max(1, resource_limit + 1))
                                async for chunk in response.aiter_bytes(stream_chunk_size):
                                    if not chunk:
                                        continue
                                    remaining = resource_limit - size
                                    if len(chunk) > remaining:
                                        if not previewing:
                                            raise ResourceTooLarge(
                                                "Response exceeds "
                                                f"{resource_limit} bytes: {current}"
                                            )
                                        chunk = chunk[:remaining]
                                        truncated = True
                                    if not chunk:
                                        truncated = True
                                        break
                                    output.write(chunk)
                                    digest.update(chunk)
                                    if len(prefix) < 32:
                                        prefix.extend(chunk[: 32 - len(prefix)])
                                    size += len(chunk)
                            return FetchResult(
                                requested_url=url,
                                final_url=str(response.url),
                                status_code=response.status_code,
                                headers=response_headers,
                                temp_path=temp_path,
                                size=size,
                                sha256=None if truncated else digest.hexdigest(),
                                prefix=bytes(prefix),
                                truncated=truncated,
                            )
                        except Exception:
                            temp_path.unlink(missing_ok=True)
                            raise
                raise FetchError(f"Redirect limit exceeded for {url}")
            except RobotsDenied:
                raise
            except DisallowedRedirect:
                raise
            except ResourceTooLarge:
                raise
            except FetchError:
                # Malformed redirects and final 4xx responses are deterministic;
                # retrying them only multiplies load on the supplier.
                raise
            except (httpx.RequestError, httpx.HTTPStatusError) as error:
                last_error = error
                if attempt + 1 >= self.retries:
                    break
                retry_response = (
                    error.response if isinstance(error, httpx.HTTPStatusError) else None
                )
                delay = self._retry_delay(retry_response, self.backoff_seconds * (2**attempt))
                if delay:
                    await asyncio.sleep(delay)
        raise FetchError(f"Failed after {self.retries} attempt(s): {last_error}") from last_error
