from __future__ import annotations

from pathlib import Path

import httpx
import pytest

from document_crawler.config import ExtractorSettings
from document_crawler.database import CrawlerDatabase
from document_crawler.extractor import ExtractorAdapter, classify_result


def _create_document(database: CrawlerDatabase, path: Path) -> int:
    return database.create_document(
        {
            "supplier_id": "test",
            "title": "VK100 technical data",
            "document_type": "data_sheet",
            "product_family": "VK100",
            "source_page": "https://example.test/",
            "original_url": "https://example.test/a.pdf",
            "final_pdf_url": "https://example.test/a.pdf",
            "local_path": str(path),
            "file_size": path.stat().st_size,
            "mime_type": "application/pdf",
            "sha256": "b" * 64,
            "language": "en",
            "crawl_status": "downloaded",
        }
    )


def test_extractor_status_mapping() -> None:
    assert classify_result({"products": [{"sin": "VK100"}]}) == "success"
    assert classify_result({"products": []}) == "no_products_found"
    assert classify_result({"error": "OCR could not read document"}) == "unreadable"
    assert classify_result({"partial": True}) == "partial"


@pytest.mark.asyncio
async def test_extractor_persists_result_and_attempt(tmp_path: Path) -> None:
    pdf = tmp_path / "a.pdf"
    pdf.write_bytes(b"%PDF-1.7\nbody")
    database = CrawlerDatabase(tmp_path / "crawler.sqlite3")
    document_id = _create_document(database, pdf)

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/extract"
        assert b"%PDF-1.7" in request.content
        return httpx.Response(200, json={"products": [{"sin": "VK100"}]})

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    adapter = ExtractorAdapter(
        ExtractorSettings(True, "https://extractor.test", 2, 2, "file"),
        database,
        client,
    )
    assert await adapter.process(document_id, pdf) == "success"
    job = database.extraction_job(document_id)
    assert job["status"] == "success"
    assert job["attempt_count"] == 1
    assert database.stats()["extractions"] == [{"status": "success", "count": 1}]
    await client.aclose()
    database.close()
