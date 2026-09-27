import sqlite3
from pathlib import Path

import pytest

from document_crawler.database import CrawlerDatabase


def _document(sha256: str, local_path: str = "downloads/test/a.pdf") -> dict[str, object]:
    return {
        "supplier_id": "test",
        "title": "Technical sprinkler data",
        "document_type": "data_sheet",
        "product_family": "VK100",
        "source_page": "https://example.test/start",
        "original_url": "https://example.test/a.pdf",
        "final_pdf_url": "https://example.test/a.pdf",
        "local_path": local_path,
        "file_size": 12,
        "mime_type": "application/pdf",
        "sha256": sha256,
        "language": "en",
        "crawl_status": "downloaded",
    }


def test_queue_resume_cache_and_hash_lookup(tmp_path: Path) -> None:
    database = CrawlerDatabase(tmp_path / "crawler.sqlite3")
    run_id = database.create_run(
        "test",
        dry_run=False,
        max_requests=20,
        max_pages=10,
        max_files=10,
        max_depth=2,
    )
    assert database.enqueue(run_id, "test", "https://example.test/", source_page=None, depth=0)
    assert not database.enqueue(run_id, "test", "https://example.test/", source_page=None, depth=0)
    database.finish_run(run_id, "paused", {"pages": 1})
    resumed = database.resume_run("test")
    assert resumed is not None and resumed["id"] == run_id

    document_id = database.create_document(_document("a" * 64))
    database.add_document_source(
        document_id,
        "test",
        source_page="https://example.test/start",
        original_url="https://example.test/a.pdf",
        final_pdf_url="https://example.test/a.pdf",
        canonical_url="https://example.test/a.pdf",
    )
    assert database.document_by_hash("a" * 64)["id"] == document_id
    assert database.source_for("test", "https://example.test/a.pdf")["id"]
    database.close()


def test_opening_database_does_not_interrupt_live_work(tmp_path: Path) -> None:
    path = tmp_path / "crawler.sqlite3"
    database = CrawlerDatabase(path)
    run_id = database.create_run(
        "test",
        dry_run=False,
        max_requests=20,
        max_pages=10,
        max_files=10,
        max_depth=2,
    )
    document_id = database.create_document(_document("b" * 64))
    database.ensure_extraction_job(document_id)
    database.set_extraction_status(document_id, "processing")
    database.ensure_flowx_ingest_job(document_id)
    database.set_flowx_ingest_status(document_id, "processing")

    observer = CrawlerDatabase(path)
    observer.close()

    run = database.connection.execute("SELECT status FROM runs WHERE id = ?", (run_id,)).fetchone()
    assert run["status"] == "running"
    assert database.extraction_job(document_id)["status"] == "processing"
    assert database.flowx_ingest_job(document_id)["status"] == "processing"
    database.close()


def test_enqueue_preserves_fetch_url_and_deduplicates_by_canonical_url(tmp_path: Path) -> None:
    database = CrawlerDatabase(tmp_path / "crawler.sqlite3")
    run_id = database.create_run(
        "test",
        dry_run=False,
        max_requests=20,
        max_pages=10,
        max_files=10,
        max_depth=2,
    )
    fetch_url = "https://EXAMPLE.test/file.pdf?utm_source=newsletter&id=1"
    assert database.enqueue(run_id, "test", fetch_url, source_page=None, depth=0)
    assert not database.enqueue(
        run_id,
        "test",
        "https://example.test/file.pdf?id=1&utm_source=other",
        source_page="https://example.test/product/vk1001",
        link_text="VK1001 Technical Data Sheet K5.6",
        context_text="SIN VK1001, nominal K-factor 5.6",
        page_title="VK1001 Upright Sprinkler (K5.6)",
        depth=1,
        priority=150,
    )
    row = database.next_queue_item(run_id)
    assert row["url"] == fetch_url
    assert row["canonical_url"] == "https://example.test/file.pdf?id=1"
    assert row["priority"] == 150
    assert row["source_page"] == "https://example.test/product/vk1001"
    assert row["link_text"] == "VK1001 Technical Data Sheet K5.6"
    database.close()


def test_extraction_state_and_attempt_are_atomic(tmp_path: Path) -> None:
    database = CrawlerDatabase(tmp_path / "crawler.sqlite3")
    document_id = database.create_document(_document("c" * 64))
    database.ensure_extraction_job(document_id)
    database.set_extraction_status(document_id, "processing")
    database.connection.execute(
        """
        CREATE TRIGGER reject_extraction_attempt BEFORE INSERT ON extraction_attempts
        BEGIN SELECT RAISE(ABORT, 'attempt rejected'); END
        """
    )
    database.connection.commit()

    with pytest.raises(sqlite3.IntegrityError, match="attempt rejected"):
        database.complete_extraction_attempt(
            document_id,
            1,
            "2026-08-05T00:00:00+00:00",
            http_status=200,
            status="success",
            result={"products": [{}]},
            error=None,
        )

    job = database.extraction_job(document_id)
    assert job["status"] == "processing"
    assert job["attempt_count"] == 0
    attempts = database.connection.execute("SELECT COUNT(*) FROM extraction_attempts").fetchone()
    assert attempts[0] == 0
    database.close()
