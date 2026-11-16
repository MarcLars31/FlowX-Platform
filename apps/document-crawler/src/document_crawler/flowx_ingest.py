from __future__ import annotations

import asyncio
import json
import logging
from pathlib import Path
from typing import Any

import httpx

from document_crawler.config import FlowxIngestSettings
from document_crawler.database import CrawlerDatabase, utc_now

LOGGER = logging.getLogger(__name__)


class FlowxIngestAdapter:
    """Optional hand-off to FlowX; all failures remain isolated in SQLite."""

    def __init__(
        self,
        settings: FlowxIngestSettings,
        database: CrawlerDatabase,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self.settings = settings
        self.database = database
        self._client = client or httpx.AsyncClient(timeout=settings.timeout_seconds)
        self._owns_client = client is None

    async def close(self) -> None:
        if self._owns_client:
            await self._client.aclose()

    async def process(
        self,
        document_id: int,
        path: Path,
        supplier_name: str | None = None,
    ) -> str | None:
        if not self.settings.active:
            return None
        document = self.database.document(document_id)
        if document is None:
            LOGGER.warning("Cannot ingest missing document row %s", document_id)
            return "failed"
        self.database.ensure_flowx_ingest_job(document_id)
        existing = self.database.flowx_ingest_job(document_id)
        if existing and existing["status"] == "success":
            return "success"
        start_attempt = int(existing["attempt_count"] if existing else 0) + 1
        if start_attempt > self.settings.max_attempts:
            return "failed"

        self.database.set_flowx_ingest_status(document_id, "processing")
        final_status = "failed"
        for attempt in range(start_attempt, self.settings.max_attempts + 1):
            started_at = utc_now()
            status_code: int | None = None
            response_payload: Any | None = None
            error_text: str | None = None
            try:
                fields = {
                    "supplier": supplier_name or str(document["supplier_id"]),
                    "title": str(document["title"]),
                    "documentType": str(document["document_type"]),
                    "finalPdfUrl": str(document["final_pdf_url"]),
                    "originalUrl": str(document["original_url"]),
                    "sourcePageUrl": str(document["source_page"] or ""),
                    "sha256": str(document["sha256"]),
                    "language": str(document["language"] or ""),
                    "downloadedAt": str(document["fetched_at"]),
                }
                with path.open("rb") as handle:
                    response = await self._client.post(
                        self.settings.service_url,
                        headers={"X-Scipx-Crawler-Token": self.settings.token},
                        files={"file": (path.name, handle, "application/pdf")},
                        data=fields,
                    )
                status_code = response.status_code
                try:
                    response_payload = response.json()
                except (json.JSONDecodeError, ValueError):
                    response_payload = {"message": response.text[:2000]}
                if 200 <= response.status_code < 300:
                    final_status = "success"
                else:
                    error_text = f"FlowX ingest returned HTTP {response.status_code}"
            except (httpx.HTTPError, OSError) as error:
                error_text = str(error)[:2000]

            self.database.complete_flowx_ingest_attempt(
                document_id,
                attempt,
                started_at,
                http_status=status_code,
                status=final_status,
                response=response_payload,
                error=error_text,
            )
            if final_status == "success":
                return final_status
            if status_code is not None and status_code < 500 and status_code != 429:
                break
            if attempt < self.settings.max_attempts:
                await asyncio.sleep(min(2 ** (attempt - 1), 8))

        LOGGER.warning("FlowX ingest failed for document %s", document_id)
        return final_status
