from __future__ import annotations

from dataclasses import dataclass

from bs4 import BeautifulSoup, Tag

from document_crawler.models import LinkContext
from document_crawler.urls import normalize_url


@dataclass(frozen=True, slots=True)
class ParsedPage:
    title: str
    links: tuple[LinkContext, ...]


def _nearby_text(tag: Tag) -> str:
    parent = tag.parent if isinstance(tag.parent, Tag) else tag
    return " ".join(parent.get_text(" ", strip=True).split())[:600]


def parse_html(body: bytes | str, base_url: str) -> ParsedPage:
    soup = BeautifulSoup(body, "html.parser")
    title = " ".join(soup.title.get_text(" ", strip=True).split()) if soup.title else ""
    found: dict[str, LinkContext] = {}
    selectors = (
        ("a[href]", "href"),
        ("area[href]", "href"),
        ("iframe[src]", "src"),
        ("embed[src]", "src"),
        ("object[data]", "data"),
    )
    for selector, attribute in selectors:
        for element in soup.select(selector):
            if not isinstance(element, Tag):
                continue
            value = element.get(attribute)
            if not isinstance(value, str):
                continue
            url = normalize_url(value, base_url)
            if not url:
                continue
            text = " ".join(element.get_text(" ", strip=True).split())
            if not text:
                text = str(element.get("title") or element.get("aria-label") or "").strip()
            candidate = LinkContext(
                url=url,
                text=text[:300],
                context=_nearby_text(element),
                page_title=title,
            )
            previous = found.get(url)
            if previous is None or len(candidate.context) > len(previous.context):
                found[url] = candidate
    return ParsedPage(title=title, links=tuple(found.values()))
