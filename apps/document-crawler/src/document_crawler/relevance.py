from __future__ import annotations

import re
from typing import Literal
from urllib.parse import unquote

from document_crawler.config import RelevanceSettings
from document_crawler.models import Classification, LinkContext

PRODUCT_IDENTIFIER_PATTERN = re.compile(r"\bVK\s?\d{3,5}\b", re.IGNORECASE)
K_FACTOR_PATTERN = re.compile(
    r"\bK(?:[-\s]?factor)?\s*[:=\-]?\s*\d{1,2}(?:[.,]\d+)?\b",
    re.IGNORECASE,
)


def product_datasheet_affinity(link: LinkContext) -> float:
    """Rank product-specific pages ahead of generic document libraries.

    Relevance answers whether a document belongs in the fire-protection archive.
    This separate score answers whether it is likely to contain structured product
    values such as SIN, K-factor, connection and pressure.
    """

    url = unquote(link.url).casefold()
    combined = " ".join((url, link.text, link.page_title, link.context)).casefold()
    score = 0.0

    if PRODUCT_IDENTIFIER_PATTERN.search(combined):
        score += 75.0
    if K_FACTOR_PATTERN.search(combined):
        score += 35.0
    if any(
        marker in combined
        for marker in ("technical data sheet", "data sheet", "datasheet", "product data")
    ):
        score += 20.0
    elif "technical data" in combined:
        score += 10.0
    if "/products/" in url:
        score += 15.0

    if any(
        marker in combined
        for marker in ("sprinkler overview", "product overview", "special bulletin")
    ):
        score -= 60.0
    return score


class RelevanceClassifier:
    def __init__(
        self,
        settings: RelevanceSettings,
        relevant_threshold: float,
        review_threshold: float,
    ) -> None:
        self.settings = settings
        self.relevant_threshold = relevant_threshold
        self.review_threshold = review_threshold

    def classify(self, link: LinkContext) -> Classification:
        fields = (
            (link.url.casefold(), 2.0),
            (link.text.casefold(), 3.0),
            (link.page_title.casefold(), 1.5),
            (link.context.casefold(), 1.0),
        )
        matched: set[str] = set()
        excluded: set[str] = set()
        score = 0.0
        for keyword in self.settings.include_keywords:
            field_weight = max((weight for text, weight in fields if keyword in text), default=0.0)
            if field_weight:
                matched.add(keyword)
                score += field_weight
        for keyword in self.settings.exclude_keywords:
            field_weight = max((weight for text, weight in fields if keyword in text), default=0.0)
            if field_weight:
                excluded.add(keyword)
                score -= field_weight * 2.0

        decision: Literal["relevant", "review", "excluded"]
        if excluded and not matched:
            decision = "excluded"
        elif score >= self.relevant_threshold:
            decision = "relevant"
        else:
            # A PDF with weak context is uncertain, not irrelevant. Keeping it in
            # review prevents opaque sitemap/document-library URLs from being lost.
            decision = "review"
        return Classification(score, decision, tuple(sorted(matched)), tuple(sorted(excluded)))
