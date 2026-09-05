from __future__ import annotations

import asyncio
import ipaddress
import socket
from collections.abc import Awaitable, Callable, Sequence
from urllib.parse import urlsplit


class UnsafeNetworkTarget(RuntimeError):
    """Raised before a request can reach a local or otherwise unsafe address."""


Resolver = Callable[[str, int], Awaitable[Sequence[str]]]


async def resolve_public_addresses(host: str, port: int) -> Sequence[str]:
    """Resolve without blocking the event loop. Results are deliberately not cached."""

    def resolve() -> Sequence[str]:
        records = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
        return tuple(dict.fromkeys(str(record[4][0]) for record in records))

    return await asyncio.to_thread(resolve)


def _effective_port(scheme: str, explicit_port: int | None) -> int:
    expected = 80 if scheme == "http" else 443
    if explicit_port is not None and explicit_port != expected:
        raise UnsafeNetworkTarget(
            f"Only the default {scheme.upper()} port ({expected}) is permitted"
        )
    return expected


def has_safe_http_shape(url: str) -> bool:
    """Cheap structural validation; DNS validation is performed asynchronously."""

    try:
        parts = urlsplit(url)
        scheme = parts.scheme.casefold()
        if scheme not in {"http", "https"} or not parts.hostname:
            return False
        if parts.username is not None or parts.password is not None:
            return False
        _effective_port(scheme, parts.port)
        return True
    except (ValueError, UnsafeNetworkTarget):
        return False


class NetworkGuard:
    """Fail-closed outbound HTTP target validation for crawler-controlled URLs."""

    def __init__(self, resolver: Resolver = resolve_public_addresses) -> None:
        self._resolver = resolver

    @staticmethod
    def _validate_address(value: str, host: str) -> None:
        # Scoped IPv6 addresses are interface-local and must never be accepted.
        if "%" in value:
            raise UnsafeNetworkTarget(f"Scoped address is not permitted for {host}")
        try:
            address = ipaddress.ip_address(value)
        except ValueError as error:
            raise UnsafeNetworkTarget(f"Resolver returned an invalid address for {host}") from error
        if not address.is_global:
            raise UnsafeNetworkTarget(f"Non-public address {address} is not permitted for {host}")

    async def validate(self, url: str) -> None:
        try:
            parts = urlsplit(url)
            scheme = parts.scheme.casefold()
            if scheme not in {"http", "https"} or not parts.hostname:
                raise UnsafeNetworkTarget("Only absolute HTTP(S) URLs are permitted")
            if parts.username is not None or parts.password is not None:
                raise UnsafeNetworkTarget("URL credentials are not permitted")
            port = _effective_port(scheme, parts.port)
        except ValueError as error:
            raise UnsafeNetworkTarget("URL contains an invalid port") from error

        host = parts.hostname.casefold().rstrip(".")
        if not host or "%" in host:
            raise UnsafeNetworkTarget("Invalid or scoped hostname")

        try:
            literal = ipaddress.ip_address(host)
        except ValueError:
            try:
                addresses = tuple(await self._resolver(host, port))
            except (OSError, socket.gaierror) as error:
                raise UnsafeNetworkTarget(f"Could not safely resolve {host}") from error
            if not addresses:
                raise UnsafeNetworkTarget(
                    f"Resolver returned no addresses for {host}"
                ) from None
            for address in addresses:
                self._validate_address(address, host)
        else:
            self._validate_address(str(literal), host)
