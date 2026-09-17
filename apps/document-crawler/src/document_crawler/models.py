from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal

ExtractionStatus = Literal[
    "pending",
    "processing",
    "success",
    "partial",
    "no_products_found",
    "unreadable",
    "failed",
]


@dataclass(frozen=True, slots=True)
class LinkContext:
    url: str
    text: str = ""
    context: str = ""
    page_title: str = ""


@dataclass(frozen=True, slots=True)
class Classification:
    score: float
    decision: Literal["relevant", "review", "excluded"]
    matched: tuple[str, ...] = ()
    excluded: tuple[str, ...] = ()


@dataclass(slots=True)
class FetchResult:
    requested_url: str
    final_url: str
    status_code: int
    headers: dict[str, str]
    temp_path: Path | None
    size: int = 0
    sha256: str | None = None
    prefix: bytes = b""
    truncated: bool = False

    @property
    def content_type(self) -> str:
        return self.headers.get("content-type", "").split(";", 1)[0].strip().lower()


@dataclass(frozen=True, slots=True)
class CrawlOptions:
    dry_run: bool = False
    resume: bool = False
    max_requests: int | None = None
    max_pages: int | None = None
    max_files: int | None = None
    max_depth: int | None = None


@dataclass(slots=True)
class CrawlOutcome:
    supplier_id: str
    run_id: int
    status: str
    requests: int = 0
    pages: int = 0
    files: int = 0
    reviews: int = 0
    errors: int = 0
    messages: list[str] = field(default_factory=list)
