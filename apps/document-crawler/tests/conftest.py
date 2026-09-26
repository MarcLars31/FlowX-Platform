from __future__ import annotations

from pathlib import Path

import pytest

from document_crawler.config import (
    AppConfig,
    ExtractorSettings,
    FlowxIngestSettings,
    RelevanceSettings,
    Settings,
    Supplier,
)
from document_crawler.network_security import NetworkGuard


@pytest.fixture
def public_network_guard() -> NetworkGuard:
    async def resolve(_: str, __: int) -> tuple[str, ...]:
        return ("93.184.216.34",)

    return NetworkGuard(resolver=resolve)


@pytest.fixture
def app_config(tmp_path: Path) -> AppConfig:
    data = tmp_path / "data"
    settings = Settings(
        data_dir=data,
        database_path=data / "crawler.sqlite3",
        user_agent="TestCrawler/1.0 (+https://example.test/crawler)",
        request_timeout_seconds=2,
        rate_delay_seconds=0,
        retry_attempts=2,
        retry_backoff_seconds=0,
        max_redirects=4,
        max_depth=3,
        max_requests=20,
        max_pages=10,
        max_files=10,
        max_html_bytes=1024 * 1024,
        max_document_bytes=2 * 1024 * 1024,
        robots_fail_open=False,
        relevance_threshold=4,
        review_threshold=1,
    )
    supplier = Supplier(
        id="test",
        name="Test Supplier",
        enabled=True,
        allowed_domains=("example.test",),
        start_urls=("https://example.test/start",),
        sitemaps=(),
        javascript=False,
        notes="",
        terms_url="https://example.test/terms",
    )
    return AppConfig(
        settings=settings,
        extractor=ExtractorSettings(False, "", 2, 2, "file"),
        flowx_ingest=FlowxIngestSettings(False, "", "", 2, 2),
        relevance=RelevanceSettings(
            ("sprinkler", "technical data", "installation", "certificate"),
            ("career", "price list"),
        ),
        suppliers=(supplier,),
        path=tmp_path / "suppliers.toml",
    )
