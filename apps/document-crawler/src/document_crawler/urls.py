from __future__ import annotations

import html
import posixpath
from urllib.parse import parse_qsl, quote, urlencode, urljoin, urlsplit, urlunsplit

TRACKING_PARAMETERS = {
    "fbclid",
    "gclid",
    "mc_cid",
    "mc_eid",
    "ref",
    "source",
}


def normalize_url(raw_url: str, base_url: str | None = None) -> str | None:
    """Resolve and canonicalize an HTTP URL without destroying meaningful queries."""
    raw = html.unescape(raw_url).strip()
    if not raw:
        return None
    try:
        absolute = urljoin(base_url, raw) if base_url else raw
        parts = urlsplit(absolute)
        raw_host = parts.hostname
        port = parts.port
    except ValueError:
        return None
    if parts.scheme.casefold() not in {"http", "https"} or not raw_host:
        return None

    scheme = parts.scheme.casefold()
    try:
        host = raw_host.encode("idna").decode("ascii").casefold().rstrip(".")
    except UnicodeError:
        return None
    netloc = host
    if port and not ((scheme == "http" and port == 80) or (scheme == "https" and port == 443)):
        netloc = f"{host}:{port}"

    path = parts.path or "/"
    path = quote(path, safe="/%:@!$&'()*+,;=-._~")
    # Normalize dot segments while retaining the leading and optional trailing slash.
    trailing_slash = path.endswith("/")
    path = posixpath.normpath(path)
    if not path.startswith("/"):
        path = f"/{path}"
    if trailing_slash and not path.endswith("/"):
        path += "/"

    query_items = []
    for key, value in parse_qsl(parts.query, keep_blank_values=True):
        lowered = key.casefold()
        if lowered.startswith("utm_") or lowered in TRACKING_PARAMETERS:
            continue
        query_items.append((key, value))
    query_items.sort(key=lambda item: (item[0].casefold(), item[1]))
    query = urlencode(query_items, doseq=True, quote_via=quote)
    return urlunsplit((scheme, netloc, path, query, ""))


def looks_like_pdf(url: str) -> bool:
    path = urlsplit(url).path.casefold()
    query = urlsplit(url).query.casefold()
    return path.endswith(".pdf") or ".pdf/" in path or "format=pdf" in query or "type=pdf" in query
