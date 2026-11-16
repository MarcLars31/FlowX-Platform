from __future__ import annotations

from pathlib import Path

import httpx
import pytest

from document_crawler.config import FlowxIngestSettings
from document_crawler.database import CrawlerDatabase
from document_crawler.flowx_ingest import FlowxIngestAdapter


@pytest.mark.asyncio
async def test_flowx_ingest_sends_token_metadata_and_persists_status(
    tmp_path: Path,
) -> None:
    pdf = tmp_path / "a.pdf"
    pdf.write_bytes(b"%PDF-1.7\nbody")
    database = CrawlerDatabase(tmp_path / "crawler.sqlite3")
    document_id = database.create_document(
        {
            "supplier_id": "viking",
            "title": "VK100 technical data",
            "document_type": "data_sheet",
            "product_family": "VK100",
            "source_page": "https://example.test/start",
            "original_url": "https://example.test/original.pdf",
            "final_pdf_url": "https://example.test/final.pdf",
            "local_path": str(pdf),
            "file_size": pdf.stat().st_size,
            "mime_type": "application/pdf",
            "sha256": "c" * 64,
            "language": "en",
            "crawl_status": "downloaded",
        }
    )

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/api/pkms/document-processing/ingest"
        assert request.headers["X-Scipx-Crawler-Token"] == "secret-token"
        assert b'name="supplier"' in request.content
        assert b"Viking Group Inc." in request.content
        assert b'name="sha256"' in request.content
        assert b"%PDF-1.7" in request.content
        return httpx.Response(202, json={"accepted": True})

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    adapter = FlowxIngestAdapter(
        FlowxIngestSettings(
            True,
            "https://flowx.test/api/pkms/document-processing/ingest",
            "secret-token",
            2,
            2,
        ),
        database,
        client,
    )
    assert await adapter.process(document_id, pdf, supplier_name="Viking Group Inc.") == "success"
    job = database.flowx_ingest_job(document_id)
    assert job["status"] == "success"
    assert job["attempt_count"] == 1
    await client.aclose()
    database.close()
