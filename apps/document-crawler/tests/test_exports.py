import csv
from pathlib import Path

from document_crawler.database import CrawlerDatabase
from document_crawler.exports import export_metadata


def test_csv_export_neutralizes_spreadsheet_formulas(tmp_path: Path) -> None:
    database = CrawlerDatabase(tmp_path / "crawler.sqlite3")
    document_id = database.create_document(
        {
            "supplier_id": "test",
            "title": '=HYPERLINK("https://attacker.invalid")',
            "document_type": "data_sheet",
            "source_page": "https://example.test/",
            "original_url": "https://example.test/a.pdf",
            "final_pdf_url": "https://example.test/a.pdf",
            "local_path": "downloads/test/a.pdf",
            "file_size": 12,
            "mime_type": "application/pdf",
            "sha256": "d" * 64,
            "language": "en",
            "crawl_status": "downloaded",
        }
    )
    database.add_document_source(
        document_id,
        "test",
        source_page="https://example.test/",
        original_url="https://example.test/a.pdf",
        final_pdf_url="https://example.test/a.pdf",
        canonical_url="https://example.test/a.pdf",
    )
    output = tmp_path / "documents.csv"
    assert export_metadata(database, "csv", output) == 1

    with output.open(encoding="utf-8-sig", newline="") as handle:
        row = next(csv.DictReader(handle))
    assert row["title"].startswith("'=HYPERLINK")
    database.close()
