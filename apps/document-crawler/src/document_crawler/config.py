from __future__ import annotations

import os
import re
import tomllib
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlsplit

from document_crawler.network_security import has_safe_http_shape


@dataclass(frozen=True, slots=True)
class Settings:
    data_dir: Path
    database_path: Path
    user_agent: str
    request_timeout_seconds: float
    rate_delay_seconds: float
    retry_attempts: int
    retry_backoff_seconds: float
    max_redirects: int
    max_depth: int
    max_requests: int
    max_pages: int
    max_files: int
    max_html_bytes: int
    max_document_bytes: int
    robots_fail_open: bool
    relevance_threshold: float
    review_threshold: float


@dataclass(frozen=True, slots=True)
class ExtractorSettings:
    enabled: bool
    service_url: str
    timeout_seconds: float
    max_attempts: int
    file_field: str

    @property
    def active(self) -> bool:
        return self.enabled and bool(self.service_url)

    @property
    def endpoint(self) -> str:
        base = self.service_url.rstrip("/")
        return base if base.endswith("/extract") else f"{base}/extract"


@dataclass(frozen=True, slots=True)
class FlowxIngestSettings:
    enabled: bool
    service_url: str
    token: str
    timeout_seconds: float
    max_attempts: int

    @property
    def active(self) -> bool:
        return self.enabled and bool(self.service_url) and bool(self.token)


@dataclass(frozen=True, slots=True)
class RelevanceSettings:
    include_keywords: tuple[str, ...]
    exclude_keywords: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class Supplier:
    id: str
    name: str
    enabled: bool
    allowed_domains: tuple[str, ...]
    start_urls: tuple[str, ...]
    sitemaps: tuple[str, ...]
    javascript: bool
    notes: str
    terms_url: str

    def allows(self, url: str) -> bool:
        if not has_safe_http_shape(url):
            return False
        host = (urlsplit(url).hostname or "").lower().rstrip(".")
        return host in self.allowed_domains


@dataclass(frozen=True, slots=True)
class AppConfig:
    settings: Settings
    extractor: ExtractorSettings
    flowx_ingest: FlowxIngestSettings
    relevance: RelevanceSettings
    suppliers: tuple[Supplier, ...]
    path: Path

    def supplier(self, supplier_id: str) -> Supplier:
        normalized = supplier_id.casefold()
        for supplier in self.suppliers:
            if supplier.id.casefold() == normalized:
                return supplier
        known = ", ".join(s.id for s in self.suppliers)
        raise ValueError(f"Unknown supplier '{supplier_id}'. Configured suppliers: {known}")


SUPPLIER_ID_PATTERN = re.compile(r"[a-z0-9](?:[a-z0-9_-]{0,62}[a-z0-9])?\Z")


def _bool_env(name: str, fallback: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return fallback
    return value.strip().casefold() in {"1", "true", "yes", "on"}


def _resolve(base: Path, value: str) -> Path:
    candidate = Path(value).expanduser()
    return candidate if candidate.is_absolute() else (base / candidate).resolve()


def _validate_url(url: str, domains: tuple[str, ...], label: str) -> None:
    parts = urlsplit(url)
    if not has_safe_http_shape(url):
        raise ValueError(f"{label} must be an absolute HTTP(S) URL: {url}")
    host = parts.hostname
    if host is None or host.lower().rstrip(".") not in domains:
        raise ValueError(f"{label} is outside allowed_domains: {url}")


def _validate_settings(settings: Settings) -> None:
    positive = {
        "request_timeout_seconds": settings.request_timeout_seconds,
        "retry_attempts": settings.retry_attempts,
        "max_requests": settings.max_requests,
        "max_pages": settings.max_pages,
        "max_files": settings.max_files,
        "max_html_bytes": settings.max_html_bytes,
        "max_document_bytes": settings.max_document_bytes,
    }
    for name, value in positive.items():
        if value <= 0:
            raise ValueError(f"settings.{name} must be greater than zero")
    for name, value in {
        "max_requests": settings.max_requests,
        "max_pages": settings.max_pages,
        "max_files": settings.max_files,
    }.items():
        if value > 1_000_000:
            raise ValueError(f"settings.{name} must not exceed 1000000")
    non_negative = {
        "rate_delay_seconds": settings.rate_delay_seconds,
        "retry_backoff_seconds": settings.retry_backoff_seconds,
        "max_redirects": settings.max_redirects,
        "max_depth": settings.max_depth,
    }
    for name, value in non_negative.items():
        if value < 0:
            raise ValueError(f"settings.{name} cannot be negative")


def load_config(path: str | Path) -> AppConfig:
    config_path = Path(path).expanduser().resolve()
    with config_path.open("rb") as handle:
        raw = tomllib.load(handle)

    base = config_path.parent.parent if config_path.parent.name == "config" else config_path.parent
    values = raw["settings"]
    settings = Settings(
        data_dir=_resolve(base, str(values["data_dir"])),
        database_path=_resolve(base, str(values["database_path"])),
        user_agent=os.getenv("SCIPX_CRAWLER_USER_AGENT", str(values["user_agent"])),
        request_timeout_seconds=float(values["request_timeout_seconds"]),
        rate_delay_seconds=float(values["rate_delay_seconds"]),
        retry_attempts=int(values["retry_attempts"]),
        retry_backoff_seconds=float(values["retry_backoff_seconds"]),
        max_redirects=int(values["max_redirects"]),
        max_depth=int(values["max_depth"]),
        max_requests=int(values.get("max_requests", values["max_pages"])),
        max_pages=int(values["max_pages"]),
        max_files=int(values["max_files"]),
        max_html_bytes=int(values["max_html_bytes"]),
        max_document_bytes=int(values["max_document_bytes"]),
        robots_fail_open=bool(values["robots_fail_open"]),
        relevance_threshold=float(values["relevance_threshold"]),
        review_threshold=float(values["review_threshold"]),
    )
    _validate_settings(settings)

    extractor_raw = raw.get("extractor", {})
    extractor = ExtractorSettings(
        enabled=_bool_env("SCIPX_EXTRACTOR_ENABLED", bool(extractor_raw.get("enabled", False))),
        service_url=os.getenv(
            "SCIPX_EXTRACTOR_URL", str(extractor_raw.get("service_url", ""))
        ).strip(),
        timeout_seconds=float(extractor_raw.get("timeout_seconds", 120.0)),
        max_attempts=max(1, int(extractor_raw.get("max_attempts", 3))),
        file_field=str(extractor_raw.get("file_field", "file")),
    )
    flowx_raw = raw.get("flowx_ingest", {})
    flowx_ingest = FlowxIngestSettings(
        enabled=_bool_env("SCIPX_FLOWX_INGEST_ENABLED", bool(flowx_raw.get("enabled", False))),
        service_url=os.getenv(
            "SCIPX_FLOWX_INGEST_URL", str(flowx_raw.get("service_url", ""))
        ).strip(),
        token=os.getenv("SCIPX_FLOWX_INGEST_TOKEN", "").strip(),
        timeout_seconds=float(flowx_raw.get("timeout_seconds", 120.0)),
        max_attempts=max(1, int(flowx_raw.get("max_attempts", 3))),
    )
    relevance_raw = raw["relevance"]
    relevance = RelevanceSettings(
        include_keywords=tuple(str(item).casefold() for item in relevance_raw["include_keywords"]),
        exclude_keywords=tuple(str(item).casefold() for item in relevance_raw["exclude_keywords"]),
    )

    suppliers: list[Supplier] = []
    ids: set[str] = set()
    for item in raw.get("suppliers", []):
        supplier_id = str(item["id"]).strip().casefold()
        if not SUPPLIER_ID_PATTERN.fullmatch(supplier_id):
            raise ValueError(
                "Supplier id may contain only lowercase letters, numbers, underscores and "
                f"hyphens, must be 1-64 characters, and cannot start/end with punctuation: "
                f"{supplier_id!r}"
            )
        if supplier_id in ids:
            raise ValueError(f"Supplier id must be unique: {supplier_id!r}")
        ids.add(supplier_id)
        domains = tuple(str(d).lower().rstrip(".") for d in item["allowed_domains"])
        starts = tuple(str(url) for url in item.get("start_urls", []))
        sitemaps = tuple(str(url) for url in item.get("sitemaps", []))
        for url in starts:
            _validate_url(url, domains, "start_url")
        for url in sitemaps:
            _validate_url(url, domains, "sitemap")
        suppliers.append(
            Supplier(
                id=supplier_id,
                name=str(item["name"]),
                enabled=bool(item.get("enabled", False)),
                allowed_domains=domains,
                start_urls=starts,
                sitemaps=sitemaps,
                javascript=bool(item.get("javascript", False)),
                notes=str(item.get("notes", "")),
                terms_url=str(item.get("terms_url", "")),
            )
        )

    settings.data_dir.mkdir(parents=True, exist_ok=True)
    settings.database_path.parent.mkdir(parents=True, exist_ok=True)
    return AppConfig(settings, extractor, flowx_ingest, relevance, tuple(suppliers), config_path)
