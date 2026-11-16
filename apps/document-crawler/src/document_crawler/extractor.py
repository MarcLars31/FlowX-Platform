from __future__ import annotations

import asyncio
import json
import logging
from pathlib import Path
from typing import Any

import httpx

from document_crawler.config import ExtractorSettings
from document_crawler.database import CrawlerDatabase, utc_now
from document_crawler.models import ExtractionStatus

LOGGER = logging.getLogger(__name__)
FINAL_STATUSES = {"success", "partial", "no_products_found", "unreadable"}


def classify_result(payload: Any) -> ExtractionStatus:
    if isinstance(payload, dict):
        raw_status = str(payload.get("status", "")).casefold().replace("-", "_").replace(" ", "_")
        if raw_status in {
            "success",
            "partial",
            "no_products_found",
            "unreadable",
            "failed",
        }:
            return raw_status  # type: ignore[return-value]
        if payload.get("partial") is True:
            return "partial"
        products = payload.get("products")
        if isinstance(products, list):
            return "success" if products else "no_products_found"
        message = str(payload.get("error") or payload.get("message") or "").casefold()
        if "no product" in message or "inga produkter" in message:
            return "no_products_found"
        if any(word in message for word in ("unreadable", "ocr", "cannot read", "kunde inte läsa")):
            return "unreadable"
    return "failed"


class ExtractorAdapter:
    def __init__(
        self,
        settings: ExtractorSettings,
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

    async def process(self, document_id: int, path: Path) -> ExtractionStatus | None:
        if not self.settings.active:
            return None
        self.database.ensure_extraction_job(document_id)
        existing = self.database.extraction_job(document_id)
        if existing and existing["status"] in FINAL_STATUSES:
            return existing["status"]  # type: ignore[no-any-return]

        start_attempt = int(existing["attempt_count"] if existing else 0) + 1
        if start_attempt > self.settings.max_attempts:
            return "failed"

        self.database.set_extraction_status(document_id, "processing")
        final_status: ExtractionStatus = "failed"
        for attempt in range(start_attempt, self.settings.max_attempts + 1):
            started_at = utc_now()
            status_code: int | None = None
            payload: Any | None = None
            error_text: str | None = None
            try:
                with path.open("rb") as handle:
                    response = await self._client.post(
                        self.settings.endpoint,
                        files={
                            self.settings.file_field: (
                                path.name,
                                handle,
                                "application/pdf",
                            )
                        },
                    )
                status_code = response.status_code
                if response.status_code >= 400:
                    error_text = f"Extractor returned HTTP {response.status_code}"
                    final_status = "failed"
                else:
                    try:
                        payload = response.json()
                    except (json.JSONDecodeError, ValueError):
                        payload = {"message": response.text[:2000]}
                    final_status = classify_result(payload)
                    if final_status == "failed" and not error_text:
                        error_text = "Extractor response did not contain a recognized result"
            except (httpx.HTTPError, OSError) as error:
                error_text = str(error)[:2000]
                final_status = "failed"

            self.database.complete_extraction_attempt(
                document_id,
                attempt,
                started_at,
                http_status=status_code,
                status=final_status,
                result=payload,
                error=error_text,
            )
            if final_status != "failed":
                return final_status
            if status_code is not None and status_code < 500 and status_code != 429:
                break
            if attempt < self.settings.max_attempts:
                await asyncio.sleep(min(2 ** (attempt - 1), 8))

        LOGGER.warning("Product extraction failed for document %s", document_id)
        return final_status
