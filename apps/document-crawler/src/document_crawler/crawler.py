from __future__ import annotations

import hashlib
import logging
import os
import sqlite3
from pathlib import Path

from document_crawler.config import AppConfig, Supplier
from document_crawler.database import CrawlerDatabase
from document_crawler.extractor import ExtractorAdapter
from document_crawler.flowx_ingest import FlowxIngestAdapter
from document_crawler.html_parser import parse_html
from document_crawler.http_client import HttpFetcher
from document_crawler.models import CrawlOptions, CrawlOutcome, FetchResult, LinkContext
from document_crawler.pdf import (
    has_pdf_signature,
    infer_document_type,
    infer_language,
    infer_product_family,
    infer_title,
    is_pdf_resource,
    stable_filename,
)
from document_crawler.relevance import RelevanceClassifier, product_datasheet_affinity
from document_crawler.renderers import PlaywrightRenderer
from document_crawler.robots import RobotsManager
from document_crawler.sitemap import parse_sitemap
from document_crawler.urls import looks_like_pdf, normalize_url

LOGGER = logging.getLogger(__name__)


def _looks_like_markup(content_type: str, prefix: bytes) -> bool:
    if any(value in content_type for value in ("html", "xml")):
        return True
    stripped = prefix.lstrip().lower()
    return stripped.startswith(
        (b"<!doctype html", b"<html", b"<?xml", b"<urlset", b"<sitemapindex")
    )


def _hash_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _safe_data_path(data_dir: Path, local_path: str) -> Path:
    root = data_dir.resolve()
    candidate = (root / local_path).resolve()
    try:
        candidate.relative_to(root)
    except ValueError as error:
        raise RuntimeError(
            f"Stored path is outside crawler data directory: {local_path}"
        ) from error
    return candidate


def _pdf_file_matches(path: Path, expected_sha256: str) -> bool:
    try:
        if not path.is_file():
            return False
        with path.open("rb") as handle:
            if not has_pdf_signature(handle.read(8)):
                return False
        return _hash_file(path) == expected_sha256
    except OSError:
        return False


def _counts(outcome: CrawlOutcome) -> dict[str, int]:
    return {
        "requests": outcome.requests,
        "pages": outcome.pages,
        "files": outcome.files,
        "reviews": outcome.reviews,
        "errors": outcome.errors,
    }


class DocumentCrawler:
    def __init__(
        self,
        config: AppConfig,
        database: CrawlerDatabase,
        *,
        fetcher: HttpFetcher | None = None,
        robots: RobotsManager | None = None,
        extractor: ExtractorAdapter | None = None,
        flowx_ingest: FlowxIngestAdapter | None = None,
    ) -> None:
        self.config = config
        self.database = database
        settings = config.settings
        temp_dir = settings.data_dir / "tmp"
        self.fetcher = fetcher or HttpFetcher(
            user_agent=settings.user_agent,
            timeout_seconds=settings.request_timeout_seconds,
            delay_seconds=settings.rate_delay_seconds,
            retries=settings.retry_attempts,
            backoff_seconds=settings.retry_backoff_seconds,
            max_redirects=settings.max_redirects,
            temp_dir=temp_dir,
        )
        self.robots = robots or RobotsManager(
            user_agent=settings.user_agent,
            timeout_seconds=settings.request_timeout_seconds,
            fail_open=settings.robots_fail_open,
            network_guard=self.fetcher.network_guard,
            max_redirects=settings.max_redirects,
        )
        self.extractor = extractor or ExtractorAdapter(config.extractor, database)
        self.flowx_ingest = flowx_ingest or FlowxIngestAdapter(config.flowx_ingest, database)
        self._owns_fetcher = fetcher is None
        self._owns_robots = robots is None
        self._owns_extractor = extractor is None
        self._owns_flowx_ingest = flowx_ingest is None
        self.classifier = RelevanceClassifier(
            config.relevance,
            settings.relevance_threshold,
            settings.review_threshold,
        )

    async def close(self) -> None:
        if self._owns_fetcher:
            await self.fetcher.close()
        if self._owns_robots:
            await self.robots.close()
        if self._owns_extractor:
            await self.extractor.close()
        if self._owns_flowx_ingest:
            await self.flowx_ingest.close()

    async def crawl(self, supplier: Supplier, options: CrawlOptions) -> CrawlOutcome:
        if not supplier.enabled:
            raise ValueError(f"Supplier '{supplier.id}' is disabled: {supplier.notes}")
        settings = self.config.settings
        resumed = self.database.resume_run(supplier.id) if options.resume else None
        if resumed:
            run_id = int(resumed["id"])
            # Resuming a download run with --dry-run must never keep writing
            # files. Conversely, an earlier dry-run cannot silently become a
            # download run merely because the flag was omitted later.
            dry_run = bool(resumed["dry_run"]) or options.dry_run
            max_requests = (
                options.max_requests
                if options.max_requests is not None
                else int(resumed["max_requests"])
            )
            max_pages = (
                options.max_pages if options.max_pages is not None else int(resumed["max_pages"])
            )
            max_files = (
                options.max_files if options.max_files is not None else int(resumed["max_files"])
            )
            max_depth = (
                options.max_depth if options.max_depth is not None else int(resumed["max_depth"])
            )
            self.database.configure_resumed_run(
                run_id,
                dry_run=dry_run,
                max_requests=max_requests,
                max_pages=max_pages,
                max_files=max_files,
                max_depth=max_depth,
            )
            self.database.recover_processing_jobs(supplier.id)
            outcome = CrawlOutcome(
                supplier.id,
                run_id,
                "running",
                requests=int(resumed["requests_processed"]),
                pages=int(resumed["pages_processed"]),
                files=int(resumed["files_processed"]),
                reviews=int(resumed["review_count"]),
                errors=int(resumed["error_count"]),
            )
        else:
            dry_run = options.dry_run
            max_requests = options.max_requests or settings.max_requests
            max_pages = options.max_pages or settings.max_pages
            max_files = options.max_files or settings.max_files
            max_depth = options.max_depth if options.max_depth is not None else settings.max_depth
            run_id = self.database.create_run(
                supplier.id,
                dry_run=dry_run,
                max_requests=max_requests,
                max_pages=max_pages,
                max_files=max_files,
                max_depth=max_depth,
            )
            outcome = CrawlOutcome(supplier.id, run_id, "running")
            await self._seed(supplier, run_id)

        session_start_requests = outcome.requests
        session_start_pages = outcome.pages
        session_start_files = outcome.files

        try:
            while True:
                # Check the queue first: reaching a limit on the final item is a
                # completed run, not a paused run with nothing left to resume.
                item = self.database.next_queue_item(run_id)
                if item is None:
                    outcome.status = "completed"
                    break
                if (
                    outcome.requests - session_start_requests >= max_requests
                    or outcome.pages - session_start_pages >= max_pages
                    or outcome.files - session_start_files >= max_files
                ):
                    outcome.status = "paused"
                    break
                await self._process_queue_item(
                    supplier,
                    run_id,
                    item,
                    dry_run=dry_run,
                    max_depth=max_depth,
                    outcome=outcome,
                )
                self.database.checkpoint_run(run_id, _counts(outcome))

            if self.database.pending_count(run_id) and outcome.status == "completed":
                outcome.status = "paused"
            if self.config.extractor.active and not dry_run:
                await self._drain_extractions(supplier.id)
            if self.config.flowx_ingest.active and not dry_run:
                await self._drain_flowx_ingests(supplier.id)
        except BaseException:
            outcome.status = "interrupted"
            self.database.finish_run(run_id, outcome.status, _counts(outcome))
            raise

        self.database.finish_run(run_id, outcome.status, _counts(outcome))
        return outcome

    async def _process_queue_item(
        self,
        supplier: Supplier,
        run_id: int,
        item: sqlite3.Row,
        *,
        dry_run: bool,
        max_depth: int,
        outcome: CrawlOutcome,
    ) -> None:
        settings = self.config.settings
        temp_path: Path | None = None
        try:
            url = str(item["url"])
            if int(item["depth"]) > max_depth:
                self.database.mark_queue(int(item["id"]), "depth_limit")
                return
            if not supplier.allows(url):
                self.database.mark_queue(int(item["id"]), "outside_allowlist")
                return
            outcome.requests += 1
            # Persist before I/O so an abrupt stop cannot reset the request
            # budget and cause an unbounded resume loop.
            self.database.checkpoint_run(run_id, _counts(outcome))
            self.fetcher.set_host_minimum_delay(url, await self.robots.crawl_delay_for(url))

            conditional: dict[str, str] = {}
            cached = self.database.cache_for(supplier.id, str(item["canonical_url"]))
            # Conditional 304 is safe only while the local bytes still match.
            # HTML/sitemaps are reparsed on each run so their links are rebuilt.
            known_document = self.database.source_for(supplier.id, str(item["canonical_url"]))
            if cached and known_document and self._stored_document_is_valid(known_document):
                if cached["etag"]:
                    conditional["If-None-Match"] = str(cached["etag"])
                if cached["last_modified"]:
                    conditional["If-Modified-Since"] = str(cached["last_modified"])

            result = await self.fetcher.fetch(
                url,
                allowed_url=supplier.allows,
                can_fetch=self.robots.can_fetch,
                conditional_headers=conditional,
                max_html_bytes=settings.max_html_bytes,
                max_document_bytes=settings.max_document_bytes,
                # In dry-run mode every non-markup response is capped. This
                # includes extensionless PDF endpoints and redirects.
                preview_bytes=8192 if dry_run else None,
            )
            temp_path = result.temp_path
            if result.status_code == 304:
                self.database.mark_queue(int(item["id"]), "unchanged")
                return
            if not supplier.allows(result.final_url):
                raise RuntimeError(f"Final URL is outside allowlist: {result.final_url}")

            if is_pdf_resource(result.content_type, result.prefix):
                if not has_pdf_signature(result.prefix):
                    raise RuntimeError("Response claims to be PDF but lacks the %PDF- signature")
                await self._handle_pdf(
                    supplier,
                    run_id,
                    item,
                    result,
                    dry_run=dry_run,
                    outcome=outcome,
                )
            elif str(item["kind"]) == "sitemap" or "xml" in result.content_type:
                if result.temp_path is None:
                    raise RuntimeError("Sitemap response had no body")
                await self._handle_sitemap(
                    supplier,
                    run_id,
                    result.temp_path.read_bytes(),
                    result.final_url,
                )
                self.database.mark_queue(int(item["id"]), "processed")
                outcome.pages += 1
            elif _looks_like_markup(result.content_type, result.prefix):
                if looks_like_pdf(url):
                    raise RuntimeError("PDF URL returned an HTML/XML response")
                if result.temp_path is None:
                    raise RuntimeError("Page response had no body")
                body = result.temp_path.read_bytes()
                parsed = parse_html(body, result.final_url)
                if supplier.javascript and not parsed.links:
                    renderer = PlaywrightRenderer(
                        settings.user_agent,
                        settings.request_timeout_seconds,
                        network_guard=self.fetcher.network_guard,
                        max_html_bytes=settings.max_html_bytes,
                    )
                    rendered = await renderer.render(result.final_url, supplier.allows)
                    parsed = parse_html(rendered, result.final_url)
                if int(item["depth"]) < max_depth:
                    for link in parsed.links:
                        if not supplier.allows(link.url):
                            continue
                        classification = self.classifier.classify(link)
                        priority = (
                            classification.score
                            + product_datasheet_affinity(link)
                            + (25.0 if looks_like_pdf(link.url) else 0)
                        )
                        self.database.enqueue(
                            run_id,
                            supplier.id,
                            link.url,
                            source_page=result.final_url,
                            link_text=link.text,
                            context_text=link.context,
                            page_title=link.page_title,
                            depth=int(item["depth"]) + 1,
                            priority=priority,
                        )
                self.database.mark_queue(int(item["id"]), "processed")
                outcome.pages += 1
            else:
                self.database.mark_queue(int(item["id"]), "unsupported_content")

            if not result.truncated:
                self.database.update_cache(
                    supplier.id,
                    str(item["canonical_url"]),
                    final_url=result.final_url,
                    http_status=result.status_code,
                    content_type=result.content_type,
                    headers=result.headers,
                    sha256=result.sha256,
                )
        except Exception as error:
            LOGGER.warning("%s: %s", item["url"], error)
            self.database.mark_queue(int(item["id"]), "error", str(error)[:2000])
            self.database.add_error(run_id, supplier.id, str(item["url"]), "crawl", error)
            outcome.errors += 1
        finally:
            if temp_path is not None:
                temp_path.unlink(missing_ok=True)

    def _stored_document_is_valid(self, document: sqlite3.Row) -> bool:
        try:
            path = _safe_data_path(
                self.config.settings.data_dir,
                str(document["local_path"]),
            )
            return _pdf_file_matches(path, str(document["sha256"]))
        except RuntimeError:
            return False

    async def _seed(self, supplier: Supplier, run_id: int) -> None:
        for start in supplier.start_urls:
            normalized = normalize_url(start)
            if normalized:
                self.database.enqueue(
                    run_id,
                    supplier.id,
                    normalized,
                    source_page=None,
                    depth=0,
                    priority=100,
                )
        sitemap_urls = list(supplier.sitemaps)
        if supplier.start_urls:
            for sitemap in await self.robots.sitemaps_for(supplier.start_urls[0]):
                if supplier.allows(sitemap):
                    sitemap_urls.append(sitemap)
        for sitemap in dict.fromkeys(sitemap_urls):
            normalized = normalize_url(sitemap)
            if normalized and supplier.allows(normalized):
                self.database.enqueue(
                    run_id,
                    supplier.id,
                    normalized,
                    source_page=None,
                    depth=0,
                    kind="sitemap",
                    priority=110,
                )

    async def _handle_sitemap(
        self, supplier: Supplier, run_id: int, body: bytes, sitemap_url: str
    ) -> None:
        parsed = parse_sitemap(body, sitemap_url)
        for url in parsed.child_sitemaps:
            if supplier.allows(url):
                self.database.enqueue(
                    run_id,
                    supplier.id,
                    url,
                    source_page=sitemap_url,
                    depth=0,
                    kind="sitemap",
                    priority=105,
                )
        for url in parsed.urls:
            if supplier.allows(url):
                priority = 25.0 if looks_like_pdf(url) else 1.0
                self.database.enqueue(
                    run_id,
                    supplier.id,
                    url,
                    source_page=sitemap_url,
                    depth=0,
                    priority=priority,
                )

    async def _handle_pdf(
        self,
        supplier: Supplier,
        run_id: int,
        item: sqlite3.Row,
        result: FetchResult,
        *,
        dry_run: bool,
        outcome: CrawlOutcome,
    ) -> None:
        link = LinkContext(
            url=result.final_url,
            text=str(item["link_text"]),
            context=str(item["context_text"]),
            page_title=str(item["page_title"]),
        )
        # The file limit counts every validated PDF candidate, including review
        # and dry-run hits, so uncertain libraries cannot bypass the safety cap.
        outcome.files += 1
        classification = self.classifier.classify(link)
        if classification.decision != "relevant" or dry_run:
            reason = (
                "dry_run_relevant"
                if dry_run and classification.decision == "relevant"
                else classification.decision
            )
            self.database.add_review(
                run_id=run_id,
                supplier_id=supplier.id,
                url=result.final_url,
                source_page=item["source_page"],
                link_text=link.text,
                context_text=link.context,
                score=classification.score,
                matched=classification.matched,
                excluded=classification.excluded,
                reason=reason,
            )
            self.database.mark_queue(int(item["id"]), reason)
            outcome.reviews += 1
            return

        temp_path = result.temp_path
        sha256 = result.sha256
        if temp_path is None or not sha256:
            raise RuntimeError("Complete PDF body/hash is unavailable")
        title = infer_title(link.text, result.final_url)
        data_dir = self.config.settings.data_dir.resolve()
        supplier_dir = _safe_data_path(data_dir, str(Path("downloads") / supplier.id))
        supplier_dir.mkdir(parents=True, exist_ok=True)
        safe_destination = supplier_dir / stable_filename(title, result.final_url, sha256)
        existing = self.database.document_by_hash(sha256)
        if existing:
            try:
                destination = _safe_data_path(data_dir, str(existing["local_path"]))
            except RuntimeError:
                destination = safe_destination
        else:
            destination = safe_destination
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination_preexisted = destination.exists()
        if not _pdf_file_matches(destination, sha256):
            os.replace(temp_path, destination)
        local_path = str(destination.relative_to(data_dir))
        combined_text = " ".join((title, link.context, link.page_title))
        values = {
            "supplier_id": supplier.id,
            "title": title,
            "document_type": infer_document_type(combined_text),
            "product_family": infer_product_family(combined_text),
            "local_path": local_path,
            "file_size": result.size,
            "mime_type": "application/pdf",
            "sha256": sha256,
            "language": infer_language(combined_text),
            "crawl_status": "downloaded",
        }
        try:
            document_id, orphan_path = self.database.record_document_download(
                values,
                queue_id=int(item["id"]),
                source_page=item["source_page"],
                original_url=result.requested_url,
                final_pdf_url=result.final_url,
                canonical_url=str(item["canonical_url"]),
            )
        except Exception:
            if not destination_preexisted:
                destination.unlink(missing_ok=True)
            raise

        if orphan_path and orphan_path != local_path:
            try:
                _safe_data_path(data_dir, orphan_path).unlink(missing_ok=True)
            except (OSError, RuntimeError) as error:
                LOGGER.warning("Could not remove superseded PDF %s: %s", orphan_path, error)
                self.database.add_error(
                    run_id,
                    supplier.id,
                    result.requested_url,
                    "orphan_cleanup",
                    error,
                )
                outcome.errors += 1
        if self.config.extractor.active:
            self.database.ensure_extraction_job(document_id)
            await self.extractor.process(document_id, destination)
        if self.config.flowx_ingest.active:
            self.database.ensure_flowx_ingest_job(document_id)
            await self.flowx_ingest.process(
                document_id,
                destination,
                supplier_name=supplier.name,
            )

    async def _drain_extractions(self, supplier_id: str) -> None:
        for job in self.database.pending_extractions(supplier_id):
            path = self.config.settings.data_dir / str(job["local_path"])
            if not path.is_file():
                self.database.set_extraction_status(
                    int(job["document_id"]), "failed", error=f"PDF is missing: {path}"
                )
                continue
            await self.extractor.process(int(job["document_id"]), path)

    async def _drain_flowx_ingests(self, supplier_id: str) -> None:
        for job in self.database.pending_flowx_ingests(supplier_id):
            path = self.config.settings.data_dir / str(job["local_path"])
            if not path.is_file():
                self.database.set_flowx_ingest_status(
                    int(job["document_id"]), "failed", error=f"PDF is missing: {path}"
                )
                continue
            supplier_name = self.config.supplier(str(job["supplier_id"])).name
            await self.flowx_ingest.process(
                int(job["document_id"]),
                path,
                supplier_name=supplier_name,
            )
