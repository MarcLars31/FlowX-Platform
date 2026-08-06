from __future__ import annotations

from dataclasses import dataclass

from defusedxml import ElementTree as ET

from document_crawler.urls import normalize_url


@dataclass(frozen=True, slots=True)
class SitemapContent:
    urls: tuple[str, ...]
    child_sitemaps: tuple[str, ...]


def parse_sitemap(body: bytes, base_url: str) -> SitemapContent:
    root = ET.fromstring(body)
    root_name = root.tag.rsplit("}", 1)[-1].casefold()
    locations: list[str] = []
    for node in root.iter():
        if node.tag.rsplit("}", 1)[-1].casefold() == "loc" and node.text:
            normalized = normalize_url(node.text.strip(), base_url)
            if normalized:
                locations.append(normalized)
    unique = tuple(dict.fromkeys(locations))
    if root_name == "sitemapindex":
        return SitemapContent((), unique)
    return SitemapContent(unique, ())
