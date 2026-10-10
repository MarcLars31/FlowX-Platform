from __future__ import annotations

import csv
import json
from pathlib import Path
from typing import Any

from document_crawler.database import CrawlerDatabase

CSV_FORMULA_PREFIXES = ("=", "+", "-", "@")


def _csv_safe(value: Any) -> Any:
    """Prevent spreadsheet software from executing exported metadata as formulas."""
    if not isinstance(value, str):
        return value
    candidate = value.lstrip(" \t\r\n")
    if candidate.startswith(CSV_FORMULA_PREFIXES):
        return f"'{value}"
    return value


def export_metadata(database: CrawlerDatabase, output_format: str, output: Path) -> int:
    rows = [dict(row) for row in database.documents_for_export()]
    output.parent.mkdir(parents=True, exist_ok=True)
    if output_format == "json":
        output.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    elif output_format == "csv":
        fieldnames: list[str] = (
            list(rows[0])
            if rows
            else [
                "supplier_id",
                "title",
                "document_type",
                "product_family",
                "source_url",
                "resolved_pdf_url",
                "local_path",
                "file_size",
                "mime_type",
                "sha256",
                "language",
                "fetched_at",
                "crawl_status",
                "extraction_status",
            ]
        )
        with output.open("w", newline="", encoding="utf-8-sig") as handle:
            writer = csv.DictWriter(handle, fieldnames=fieldnames, extrasaction="ignore")
            writer.writeheader()
            writer.writerows({key: _csv_safe(value) for key, value in row.items()} for row in rows)
    else:
        raise ValueError(f"Unsupported export format: {output_format}")
    return len(rows)


def json_ready(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: json_ready(item) for key, item in value.items()}
    if isinstance(value, list):
        return [json_ready(item) for item in value]
    return value
