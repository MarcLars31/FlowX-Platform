from __future__ import annotations

import pytest

from document_crawler.network_security import NetworkGuard, UnsafeNetworkTarget


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "url",
    (
        "http://127.0.0.1/",
        "http://10.0.0.1/",
        "http://169.254.169.254/latest/meta-data/",
        "http://[::1]/",
        "http://[fe80::1]/",
        "https://example.test:444/file.pdf",
        "http://user:password@example.test/file.pdf",
    ),
)
async def test_guard_rejects_local_addresses_unsafe_ports_and_credentials(url: str) -> None:
    async def should_not_resolve(_: str, __: int) -> tuple[str, ...]:
        raise AssertionError("IP literals and structurally unsafe URLs must fail before DNS")

    guard = NetworkGuard(resolver=should_not_resolve)
    with pytest.raises(UnsafeNetworkTarget):
        await guard.validate(url)


@pytest.mark.asyncio
async def test_guard_rejects_hostname_when_any_resolved_address_is_private() -> None:
    async def resolve(_: str, __: int) -> tuple[str, ...]:
        return ("93.184.216.34", "127.0.0.1")

    with pytest.raises(UnsafeNetworkTarget, match="Non-public address"):
        await NetworkGuard(resolver=resolve).validate("https://example.test/file.pdf")


@pytest.mark.asyncio
async def test_guard_accepts_only_public_resolution_and_default_port() -> None:
    calls: list[tuple[str, int]] = []

    async def resolve(host: str, port: int) -> tuple[str, ...]:
        calls.append((host, port))
        return ("93.184.216.34", "2606:2800:220:1:248:1893:25c8:1946")

    await NetworkGuard(resolver=resolve).validate("https://example.test/file.pdf")
    assert calls == [("example.test", 443)]


@pytest.mark.asyncio
async def test_guard_fails_closed_when_dns_returns_no_addresses() -> None:
    async def resolve(_: str, __: int) -> tuple[str, ...]:
        return ()

    with pytest.raises(UnsafeNetworkTarget, match="no addresses"):
        await NetworkGuard(resolver=resolve).validate("https://example.test/")
