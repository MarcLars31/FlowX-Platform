from __future__ import annotations

import json
import sqlite3
from collections.abc import Iterator, Mapping, Sequence
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, cast

from document_crawler.urls import normalize_url


def utc_now() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


class CrawlerDatabase:
    def __init__(self, path: Path) -> None:
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.connection = sqlite3.connect(path)
        self.connection.row_factory = sqlite3.Row
        self.connection.execute("PRAGMA foreign_keys = ON")
        self.connection.execute("PRAGMA journal_mode = WAL")
        self._initialize()

    def close(self) -> None:
        self.connection.close()

    @contextmanager
    def transaction(self) -> Iterator[sqlite3.Connection]:
        try:
            yield self.connection
            self.connection.commit()
        except Exception:
            self.connection.rollback()
            raise

    def _initialize(self) -> None:
        self.connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS runs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                supplier_id TEXT NOT NULL,
                started_at TEXT NOT NULL,
                finished_at TEXT,
                status TEXT NOT NULL,
                dry_run INTEGER NOT NULL DEFAULT 0,
                max_pages INTEGER NOT NULL,
                max_files INTEGER NOT NULL,
                max_requests INTEGER NOT NULL,
                max_depth INTEGER NOT NULL,
                requests_processed INTEGER NOT NULL DEFAULT 0,
                pages_processed INTEGER NOT NULL DEFAULT 0,
                files_processed INTEGER NOT NULL DEFAULT 0,
                review_count INTEGER NOT NULL DEFAULT 0,
                error_count INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS crawl_queue (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                run_id INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
                supplier_id TEXT NOT NULL,
                url TEXT NOT NULL,
                canonical_url TEXT NOT NULL,
                source_page TEXT,
                link_text TEXT NOT NULL DEFAULT '',
                context_text TEXT NOT NULL DEFAULT '',
                page_title TEXT NOT NULL DEFAULT '',
                depth INTEGER NOT NULL,
                kind TEXT NOT NULL DEFAULT 'auto',
                priority REAL NOT NULL DEFAULT 0,
                status TEXT NOT NULL DEFAULT 'pending',
                attempts INTEGER NOT NULL DEFAULT 0,
                last_error TEXT,
                created_at TEXT NOT NULL,
                checked_at TEXT,
                UNIQUE(run_id, canonical_url)
            );
            CREATE INDEX IF NOT EXISTS crawl_queue_next
                ON crawl_queue(run_id, status, priority DESC, id);

            CREATE TABLE IF NOT EXISTS crawl_cache (
                supplier_id TEXT NOT NULL,
                canonical_url TEXT NOT NULL,
                final_url TEXT,
                http_status INTEGER,
                content_type TEXT,
                etag TEXT,
                last_modified TEXT,
                sha256 TEXT,
                checked_at TEXT NOT NULL,
                PRIMARY KEY (supplier_id, canonical_url)
            );

            CREATE TABLE IF NOT EXISTS documents (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                supplier_id TEXT NOT NULL,
                title TEXT NOT NULL,
                document_type TEXT NOT NULL,
                product_family TEXT,
                source_page TEXT,
                original_url TEXT NOT NULL,
                final_pdf_url TEXT NOT NULL,
                local_path TEXT NOT NULL,
                file_size INTEGER NOT NULL,
                mime_type TEXT NOT NULL,
                sha256 TEXT NOT NULL UNIQUE,
                language TEXT,
                fetched_at TEXT NOT NULL,
                crawl_status TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS document_sources (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
                supplier_id TEXT NOT NULL,
                source_page TEXT,
                original_url TEXT NOT NULL,
                final_pdf_url TEXT NOT NULL,
                canonical_url TEXT NOT NULL,
                first_seen_at TEXT NOT NULL,
                last_seen_at TEXT NOT NULL,
                UNIQUE(supplier_id, canonical_url)
            );

            CREATE TABLE IF NOT EXISTS review_hits (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                run_id INTEGER REFERENCES runs(id) ON DELETE SET NULL,
                supplier_id TEXT NOT NULL,
                url TEXT NOT NULL,
                source_page TEXT,
                link_text TEXT,
                context_text TEXT,
                score REAL NOT NULL,
                matched_keywords TEXT NOT NULL,
                excluded_keywords TEXT NOT NULL,
                reason TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                created_at TEXT NOT NULL,
                UNIQUE(supplier_id, url)
            );

            CREATE TABLE IF NOT EXISTS crawl_errors (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                run_id INTEGER REFERENCES runs(id) ON DELETE SET NULL,
                supplier_id TEXT NOT NULL,
                url TEXT,
                stage TEXT NOT NULL,
                error_type TEXT NOT NULL,
                message TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS extraction_jobs (
                document_id INTEGER PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
                status TEXT NOT NULL,
                attempt_count INTEGER NOT NULL DEFAULT 0,
                result_json TEXT,
                last_error TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS extraction_attempts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
                attempt_number INTEGER NOT NULL,
                started_at TEXT NOT NULL,
                finished_at TEXT NOT NULL,
                http_status INTEGER,
                status TEXT NOT NULL,
                result_json TEXT,
                error TEXT
            );

            CREATE TABLE IF NOT EXISTS flowx_ingest_jobs (
                document_id INTEGER PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
                status TEXT NOT NULL,
                attempt_count INTEGER NOT NULL DEFAULT 0,
                response_json TEXT,
                last_error TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS flowx_ingest_attempts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
                attempt_number INTEGER NOT NULL,
                started_at TEXT NOT NULL,
                finished_at TEXT NOT NULL,
                http_status INTEGER,
                status TEXT NOT NULL,
                response_json TEXT,
                error TEXT
            );
            """
        )
        # Existing databases predate the request budget. Schema upgrades are safe
        # on open; operational rows are deliberately not changed here because a
        # stats/export process may open the same WAL database during a live crawl.
        self._ensure_column("runs", "max_requests", "INTEGER NOT NULL DEFAULT 1000")
        self._ensure_column("runs", "requests_processed", "INTEGER NOT NULL DEFAULT 0")
        self.connection.commit()

    def _ensure_column(self, table: str, column: str, declaration: str) -> None:
        existing = {
            str(row["name"])
            for row in self.connection.execute(f"PRAGMA table_info({table})").fetchall()
        }
        if column not in existing:
            self.connection.execute(f"ALTER TABLE {table} ADD COLUMN {column} {declaration}")

    def create_run(
        self,
        supplier_id: str,
        *,
        dry_run: bool,
        max_requests: int,
        max_pages: int,
        max_files: int,
        max_depth: int,
    ) -> int:
        cursor = self.connection.execute(
            """
            INSERT INTO runs (
                supplier_id, started_at, status, dry_run, max_requests,
                max_pages, max_files, max_depth
            ) VALUES (?, ?, 'running', ?, ?, ?, ?, ?)
            """,
            (
                supplier_id,
                utc_now(),
                int(dry_run),
                max_requests,
                max_pages,
                max_files,
                max_depth,
            ),
        )
        self.connection.commit()
        if cursor.lastrowid is None:
            raise RuntimeError("SQLite did not return a run id")
        return cursor.lastrowid

    def resume_run(self, supplier_id: str) -> sqlite3.Row | None:
        row = self.connection.execute(
            """
            SELECT * FROM runs
            WHERE supplier_id = ? AND status IN ('paused', 'interrupted', 'running')
            ORDER BY id DESC LIMIT 1
            """,
            (supplier_id,),
        ).fetchone()
        if row:
            self.connection.execute(
                "UPDATE runs SET status = 'running', finished_at = NULL WHERE id = ?",
                (row["id"],),
            )
            self.connection.commit()
        return cast(sqlite3.Row | None, row)

    def configure_resumed_run(
        self,
        run_id: int,
        *,
        dry_run: bool,
        max_requests: int,
        max_pages: int,
        max_files: int,
        max_depth: int,
    ) -> None:
        """Persist safe resume overrides so a second resume cannot lose them."""
        self.connection.execute(
            """
            UPDATE runs SET dry_run = ?, max_requests = ?, max_pages = ?,
                max_files = ?, max_depth = ? WHERE id = ?
            """,
            (int(dry_run), max_requests, max_pages, max_files, max_depth, run_id),
        )
        self.connection.commit()

    def recover_processing_jobs(self, supplier_id: str) -> None:
        """Recover jobs only after an explicit resume, never merely on DB open."""
        with self.transaction() as connection:
            connection.execute(
                """
                UPDATE extraction_jobs SET status = 'pending', updated_at = ?
                WHERE status = 'processing' AND document_id IN (
                    SELECT id FROM documents WHERE supplier_id = ?
                )
                """,
                (utc_now(), supplier_id),
            )
            connection.execute(
                """
                UPDATE flowx_ingest_jobs SET status = 'pending', updated_at = ?
                WHERE status = 'processing' AND document_id IN (
                    SELECT id FROM documents WHERE supplier_id = ?
                )
                """,
                (utc_now(), supplier_id),
            )

    def checkpoint_run(self, run_id: int, counts: Mapping[str, int]) -> None:
        self.connection.execute(
            """
            UPDATE runs SET requests_processed = ?, pages_processed = ?,
                files_processed = ?, review_count = ?, error_count = ? WHERE id = ?
            """,
            (
                counts.get("requests", 0),
                counts.get("pages", 0),
                counts.get("files", 0),
                counts.get("reviews", 0),
                counts.get("errors", 0),
                run_id,
            ),
        )
        self.connection.commit()

    def finish_run(self, run_id: int, status: str, counts: Mapping[str, int]) -> None:
        self.connection.execute(
            """
            UPDATE runs SET status = ?, finished_at = ?, requests_processed = ?,
                pages_processed = ?, files_processed = ?, review_count = ?,
                error_count = ? WHERE id = ?
            """,
            (
                status,
                utc_now(),
                counts.get("requests", 0),
                counts.get("pages", 0),
                counts.get("files", 0),
                counts.get("reviews", 0),
                counts.get("errors", 0),
                run_id,
            ),
        )
        self.connection.commit()

    def enqueue(
        self,
        run_id: int,
        supplier_id: str,
        url: str,
        *,
        source_page: str | None,
        link_text: str = "",
        context_text: str = "",
        page_title: str = "",
        depth: int,
        kind: str = "auto",
        priority: float = 0,
    ) -> bool:
        canonical_url = normalize_url(url)
        if canonical_url is None:
            return False
        cursor = self.connection.execute(
            """
            INSERT OR IGNORE INTO crawl_queue (
                run_id, supplier_id, url, canonical_url, source_page, link_text,
                context_text, page_title, depth, kind, priority, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                run_id,
                supplier_id,
                url,
                canonical_url,
                source_page,
                link_text,
                context_text,
                page_title,
                depth,
                kind,
                priority,
                utc_now(),
            ),
        )
        inserted = cursor.rowcount > 0
        if not inserted:
            # A sitemap often discovers a URL before a product page does. Keep
            # the stable first fetch URL, but let richer page context promote a
            # still-pending item instead of leaving it buried at sitemap priority.
            self.connection.execute(
                """
                UPDATE crawl_queue
                SET priority = MAX(priority, ?),
                    depth = MIN(depth, ?),
                    source_page = CASE
                        WHEN ? <> '' THEN ?
                        ELSE source_page
                    END,
                    link_text = CASE
                        WHEN LENGTH(?) > LENGTH(link_text) THEN ?
                        ELSE link_text
                    END,
                    context_text = CASE
                        WHEN LENGTH(?) > LENGTH(context_text) THEN ?
                        ELSE context_text
                    END,
                    page_title = CASE
                        WHEN LENGTH(?) > LENGTH(page_title) THEN ?
                        ELSE page_title
                    END
                WHERE run_id = ? AND canonical_url = ? AND status = 'pending'
                """,
                (
                    priority,
                    depth,
                    link_text,
                    source_page,
                    link_text,
                    link_text,
                    context_text,
                    context_text,
                    page_title,
                    page_title,
                    run_id,
                    canonical_url,
                ),
            )
        self.connection.commit()
        return inserted

    def next_queue_item(self, run_id: int) -> sqlite3.Row | None:
        return cast(
            sqlite3.Row | None,
            self.connection.execute(
                """
            SELECT * FROM crawl_queue WHERE run_id = ? AND status = 'pending'
            ORDER BY priority DESC, id ASC LIMIT 1
            """,
                (run_id,),
            ).fetchone(),
        )

    def pending_count(self, run_id: int) -> int:
        row = self.connection.execute(
            "SELECT COUNT(*) AS count FROM crawl_queue WHERE run_id = ? AND status = 'pending'",
            (run_id,),
        ).fetchone()
        return int(row["count"])

    def mark_queue(self, queue_id: int, status: str, error: str | None = None) -> None:
        self.connection.execute(
            """
            UPDATE crawl_queue SET status = ?, last_error = ?, attempts = attempts + 1,
                checked_at = ? WHERE id = ?
            """,
            (status, error, utc_now(), queue_id),
        )
        self.connection.commit()

    def cache_for(self, supplier_id: str, canonical_url: str) -> sqlite3.Row | None:
        return cast(
            sqlite3.Row | None,
            self.connection.execute(
                "SELECT * FROM crawl_cache WHERE supplier_id = ? AND canonical_url = ?",
                (supplier_id, canonical_url),
            ).fetchone(),
        )

    def update_cache(
        self,
        supplier_id: str,
        canonical_url: str,
        *,
        final_url: str,
        http_status: int,
        content_type: str,
        headers: Mapping[str, str],
        sha256: str | None,
    ) -> None:
        self.connection.execute(
            """
            INSERT INTO crawl_cache (
                supplier_id, canonical_url, final_url, http_status, content_type,
                etag, last_modified, sha256, checked_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(supplier_id, canonical_url) DO UPDATE SET
                final_url = excluded.final_url, http_status = excluded.http_status,
                content_type = excluded.content_type, etag = excluded.etag,
                last_modified = excluded.last_modified, sha256 = excluded.sha256,
                checked_at = excluded.checked_at
            """,
            (
                supplier_id,
                canonical_url,
                final_url,
                http_status,
                content_type,
                headers.get("etag"),
                headers.get("last-modified"),
                sha256,
                utc_now(),
            ),
        )
        self.connection.commit()

    def document_by_hash(self, sha256: str) -> sqlite3.Row | None:
        return cast(
            sqlite3.Row | None,
            self.connection.execute(
                "SELECT * FROM documents WHERE sha256 = ?", (sha256,)
            ).fetchone(),
        )

    def source_for(self, supplier_id: str, canonical_url: str) -> sqlite3.Row | None:
        return cast(
            sqlite3.Row | None,
            self.connection.execute(
                """
            SELECT document_sources.*, documents.local_path, documents.sha256
            FROM document_sources JOIN documents ON documents.id = document_sources.document_id
            WHERE document_sources.supplier_id = ? AND document_sources.canonical_url = ?
            """,
                (supplier_id, canonical_url),
            ).fetchone(),
        )

    def document(self, document_id: int) -> sqlite3.Row | None:
        return cast(
            sqlite3.Row | None,
            self.connection.execute(
                "SELECT * FROM documents WHERE id = ?", (document_id,)
            ).fetchone(),
        )

    def create_document(self, values: Mapping[str, Any]) -> int:
        cursor = self.connection.execute(
            """
            INSERT INTO documents (
                supplier_id, title, document_type, product_family, source_page,
                original_url, final_pdf_url, local_path, file_size, mime_type,
                sha256, language, fetched_at, crawl_status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                values["supplier_id"],
                values["title"],
                values["document_type"],
                values.get("product_family"),
                values.get("source_page"),
                values["original_url"],
                values["final_pdf_url"],
                values["local_path"],
                values["file_size"],
                values["mime_type"],
                values["sha256"],
                values.get("language"),
                utc_now(),
                values.get("crawl_status", "downloaded"),
            ),
        )
        self.connection.commit()
        if cursor.lastrowid is None:
            raise RuntimeError("SQLite did not return a document id")
        return cursor.lastrowid

    def add_document_source(
        self,
        document_id: int,
        supplier_id: str,
        *,
        source_page: str | None,
        original_url: str,
        final_pdf_url: str,
        canonical_url: str,
    ) -> None:
        now = utc_now()
        self.connection.execute(
            """
            INSERT INTO document_sources (
                document_id, supplier_id, source_page, original_url, final_pdf_url,
                canonical_url, first_seen_at, last_seen_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(supplier_id, canonical_url) DO UPDATE SET
                document_id = excluded.document_id, source_page = excluded.source_page,
                original_url = excluded.original_url, final_pdf_url = excluded.final_pdf_url,
                last_seen_at = excluded.last_seen_at
            """,
            (
                document_id,
                supplier_id,
                source_page,
                original_url,
                final_pdf_url,
                canonical_url,
                now,
                now,
            ),
        )
        self.connection.commit()

    def record_document_download(
        self,
        values: Mapping[str, Any],
        *,
        queue_id: int,
        source_page: str | None,
        original_url: str,
        final_pdf_url: str,
        canonical_url: str,
    ) -> tuple[int, str | None]:
        """Atomically attach a validated file to its source and queue item.

        When a canonical URL starts returning different bytes, the source moves
        to the new hash. A former document row is deleted only when no other URL
        still references it; its local path is returned for post-commit cleanup.
        """
        now = utc_now()
        orphan_path: str | None = None
        with self.transaction() as connection:
            existing = connection.execute(
                "SELECT id FROM documents WHERE sha256 = ?", (values["sha256"],)
            ).fetchone()
            if existing is None:
                cursor = connection.execute(
                    """
                    INSERT INTO documents (
                        supplier_id, title, document_type, product_family, source_page,
                        original_url, final_pdf_url, local_path, file_size, mime_type,
                        sha256, language, fetched_at, crawl_status
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        values["supplier_id"],
                        values["title"],
                        values["document_type"],
                        values.get("product_family"),
                        source_page,
                        original_url,
                        final_pdf_url,
                        values["local_path"],
                        values["file_size"],
                        values["mime_type"],
                        values["sha256"],
                        values.get("language"),
                        now,
                        values.get("crawl_status", "downloaded"),
                    ),
                )
                if cursor.lastrowid is None:
                    raise RuntimeError("SQLite did not return a document id")
                document_id = int(cursor.lastrowid)
            else:
                document_id = int(existing["id"])
                connection.execute(
                    """
                    UPDATE documents SET local_path = ?, file_size = ?, mime_type = ?,
                        fetched_at = ?, crawl_status = ? WHERE id = ?
                    """,
                    (
                        values["local_path"],
                        values["file_size"],
                        values["mime_type"],
                        now,
                        values.get("crawl_status", "downloaded"),
                        document_id,
                    ),
                )

            prior_source = connection.execute(
                """
                SELECT document_id FROM document_sources
                WHERE supplier_id = ? AND canonical_url = ?
                """,
                (values["supplier_id"], canonical_url),
            ).fetchone()
            connection.execute(
                """
                INSERT INTO document_sources (
                    document_id, supplier_id, source_page, original_url, final_pdf_url,
                    canonical_url, first_seen_at, last_seen_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(supplier_id, canonical_url) DO UPDATE SET
                    document_id = excluded.document_id, source_page = excluded.source_page,
                    original_url = excluded.original_url,
                    final_pdf_url = excluded.final_pdf_url,
                    last_seen_at = excluded.last_seen_at
                """,
                (
                    document_id,
                    values["supplier_id"],
                    source_page,
                    original_url,
                    final_pdf_url,
                    canonical_url,
                    now,
                    now,
                ),
            )
            connection.execute(
                """
                UPDATE crawl_queue SET status = 'downloaded', last_error = NULL,
                    attempts = attempts + 1, checked_at = ? WHERE id = ?
                """,
                (now, queue_id),
            )

            prior_document_id = int(prior_source["document_id"]) if prior_source else None
            if prior_document_id is not None and prior_document_id != document_id:
                remaining = connection.execute(
                    "SELECT 1 FROM document_sources WHERE document_id = ? LIMIT 1",
                    (prior_document_id,),
                ).fetchone()
                if remaining is None:
                    orphan = connection.execute(
                        "SELECT local_path FROM documents WHERE id = ?", (prior_document_id,)
                    ).fetchone()
                    if orphan is not None:
                        orphan_path = str(orphan["local_path"])
                    connection.execute("DELETE FROM documents WHERE id = ?", (prior_document_id,))
        return document_id, orphan_path

    def add_review(
        self,
        *,
        run_id: int,
        supplier_id: str,
        url: str,
        source_page: str | None,
        link_text: str,
        context_text: str,
        score: float,
        matched: Sequence[str],
        excluded: Sequence[str],
        reason: str,
    ) -> None:
        self.connection.execute(
            """
            INSERT INTO review_hits (
                run_id, supplier_id, url, source_page, link_text, context_text,
                score, matched_keywords, excluded_keywords, reason, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(supplier_id, url) DO UPDATE SET
                run_id = excluded.run_id, source_page = excluded.source_page,
                link_text = excluded.link_text, context_text = excluded.context_text,
                score = excluded.score, matched_keywords = excluded.matched_keywords,
                excluded_keywords = excluded.excluded_keywords, reason = excluded.reason,
                created_at = excluded.created_at
            """,
            (
                run_id,
                supplier_id,
                url,
                source_page,
                link_text,
                context_text,
                score,
                json.dumps(list(matched), ensure_ascii=False),
                json.dumps(list(excluded), ensure_ascii=False),
                reason,
                utc_now(),
            ),
        )
        self.connection.commit()

    def add_error(
        self,
        run_id: int | None,
        supplier_id: str,
        url: str | None,
        stage: str,
        error: Exception | str,
    ) -> None:
        error_type = type(error).__name__ if isinstance(error, Exception) else "Error"
        message = str(error)[:2000]
        self.connection.execute(
            """
            INSERT INTO crawl_errors (
                run_id, supplier_id, url, stage, error_type, message, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (run_id, supplier_id, url, stage, error_type, message, utc_now()),
        )
        self.connection.commit()

    def ensure_extraction_job(self, document_id: int) -> None:
        now = utc_now()
        self.connection.execute(
            """
            INSERT OR IGNORE INTO extraction_jobs (
                document_id, status, created_at, updated_at
            ) VALUES (?, 'pending', ?, ?)
            """,
            (document_id, now, now),
        )
        self.connection.commit()

    def extraction_job(self, document_id: int) -> sqlite3.Row | None:
        return cast(
            sqlite3.Row | None,
            self.connection.execute(
                "SELECT * FROM extraction_jobs WHERE document_id = ?", (document_id,)
            ).fetchone(),
        )

    def set_extraction_status(
        self,
        document_id: int,
        status: str,
        *,
        result: Any | None = None,
        error: str | None = None,
        increment: bool = False,
    ) -> None:
        result_json = json.dumps(result, ensure_ascii=False) if result is not None else None
        self.connection.execute(
            """
            UPDATE extraction_jobs SET status = ?, result_json = COALESCE(?, result_json),
                last_error = ?, updated_at = ?,
                attempt_count = attempt_count + ? WHERE document_id = ?
            """,
            (status, result_json, error, utc_now(), int(increment), document_id),
        )
        self.connection.commit()

    def add_extraction_attempt(
        self,
        document_id: int,
        attempt_number: int,
        started_at: str,
        *,
        http_status: int | None,
        status: str,
        result: Any | None,
        error: str | None,
    ) -> None:
        self.connection.execute(
            """
            INSERT INTO extraction_attempts (
                document_id, attempt_number, started_at, finished_at, http_status,
                status, result_json, error
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                document_id,
                attempt_number,
                started_at,
                utc_now(),
                http_status,
                status,
                json.dumps(result, ensure_ascii=False) if result is not None else None,
                error,
            ),
        )
        self.connection.commit()

    def complete_extraction_attempt(
        self,
        document_id: int,
        attempt_number: int,
        started_at: str,
        *,
        http_status: int | None,
        status: str,
        result: Any | None,
        error: str | None,
    ) -> None:
        """Persist the job state and immutable attempt as one transaction."""
        result_json = json.dumps(result, ensure_ascii=False) if result is not None else None
        with self.transaction() as connection:
            connection.execute(
                """
                UPDATE extraction_jobs SET status = ?,
                    result_json = COALESCE(?, result_json), last_error = ?, updated_at = ?,
                    attempt_count = attempt_count + 1 WHERE document_id = ?
                """,
                (status, result_json, error, utc_now(), document_id),
            )
            connection.execute(
                """
                INSERT INTO extraction_attempts (
                    document_id, attempt_number, started_at, finished_at, http_status,
                    status, result_json, error
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    document_id,
                    attempt_number,
                    started_at,
                    utc_now(),
                    http_status,
                    status,
                    result_json,
                    error,
                ),
            )

    def ensure_flowx_ingest_job(self, document_id: int) -> None:
        now = utc_now()
        self.connection.execute(
            """
            INSERT OR IGNORE INTO flowx_ingest_jobs (
                document_id, status, created_at, updated_at
            ) VALUES (?, 'pending', ?, ?)
            """,
            (document_id, now, now),
        )
        self.connection.commit()

    def flowx_ingest_job(self, document_id: int) -> sqlite3.Row | None:
        return cast(
            sqlite3.Row | None,
            self.connection.execute(
                "SELECT * FROM flowx_ingest_jobs WHERE document_id = ?", (document_id,)
            ).fetchone(),
        )

    def set_flowx_ingest_status(
        self,
        document_id: int,
        status: str,
        *,
        response: Any | None = None,
        error: str | None = None,
        increment: bool = False,
    ) -> None:
        response_json = json.dumps(response, ensure_ascii=False) if response is not None else None
        self.connection.execute(
            """
            UPDATE flowx_ingest_jobs SET status = ?,
                response_json = COALESCE(?, response_json), last_error = ?, updated_at = ?,
                attempt_count = attempt_count + ? WHERE document_id = ?
            """,
            (status, response_json, error, utc_now(), int(increment), document_id),
        )
        self.connection.commit()

    def add_flowx_ingest_attempt(
        self,
        document_id: int,
        attempt_number: int,
        started_at: str,
        *,
        http_status: int | None,
        status: str,
        response: Any | None,
        error: str | None,
    ) -> None:
        self.connection.execute(
            """
            INSERT INTO flowx_ingest_attempts (
                document_id, attempt_number, started_at, finished_at, http_status,
                status, response_json, error
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                document_id,
                attempt_number,
                started_at,
                utc_now(),
                http_status,
                status,
                (json.dumps(response, ensure_ascii=False) if response is not None else None),
                error,
            ),
        )
        self.connection.commit()

    def complete_flowx_ingest_attempt(
        self,
        document_id: int,
        attempt_number: int,
        started_at: str,
        *,
        http_status: int | None,
        status: str,
        response: Any | None,
        error: str | None,
    ) -> None:
        """Persist the hand-off state and immutable attempt as one transaction."""
        response_json = json.dumps(response, ensure_ascii=False) if response is not None else None
        with self.transaction() as connection:
            connection.execute(
                """
                UPDATE flowx_ingest_jobs SET status = ?,
                    response_json = COALESCE(?, response_json), last_error = ?, updated_at = ?,
                    attempt_count = attempt_count + 1 WHERE document_id = ?
                """,
                (status, response_json, error, utc_now(), document_id),
            )
            connection.execute(
                """
                INSERT INTO flowx_ingest_attempts (
                    document_id, attempt_number, started_at, finished_at, http_status,
                    status, response_json, error
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    document_id,
                    attempt_number,
                    started_at,
                    utc_now(),
                    http_status,
                    status,
                    response_json,
                    error,
                ),
            )

    def pending_flowx_ingests(
        self, supplier_id: str | None = None, limit: int = 100
    ) -> list[sqlite3.Row]:
        supplier_clause = "AND documents.supplier_id = ?" if supplier_id else ""
        parameters: tuple[Any, ...] = (supplier_id, limit) if supplier_id else (limit,)
        return list(
            self.connection.execute(
                f"""
                SELECT flowx_ingest_jobs.*, documents.local_path, documents.supplier_id
                FROM flowx_ingest_jobs
                JOIN documents ON documents.id = flowx_ingest_jobs.document_id
                WHERE flowx_ingest_jobs.status IN ('pending', 'failed')
                    {supplier_clause}
                ORDER BY flowx_ingest_jobs.updated_at LIMIT ?
                """,
                parameters,
            )
        )

    def pending_extractions(
        self, supplier_id: str | None = None, limit: int = 100
    ) -> list[sqlite3.Row]:
        supplier_clause = "AND documents.supplier_id = ?" if supplier_id else ""
        parameters: tuple[Any, ...] = (supplier_id, limit) if supplier_id else (limit,)
        return list(
            self.connection.execute(
                f"""
                SELECT extraction_jobs.*, documents.local_path, documents.title,
                    documents.supplier_id
                FROM extraction_jobs JOIN documents ON documents.id = extraction_jobs.document_id
                WHERE extraction_jobs.status IN ('pending', 'failed')
                    {supplier_clause}
                ORDER BY extraction_jobs.updated_at LIMIT ?
                """,
                parameters,
            )
        )

    def documents_for_export(self) -> list[sqlite3.Row]:
        return list(
            self.connection.execute(
                """
                SELECT d.*, s.source_page AS discovered_on, s.original_url AS source_url,
                    s.final_pdf_url AS resolved_pdf_url, s.canonical_url,
                    e.status AS extraction_status, e.result_json AS extraction_result,
                    f.status AS flowx_ingest_status, f.response_json AS flowx_ingest_response
                FROM documents d
                JOIN document_sources s ON s.document_id = d.id
                LEFT JOIN extraction_jobs e ON e.document_id = d.id
                LEFT JOIN flowx_ingest_jobs f ON f.document_id = d.id
                ORDER BY d.supplier_id, d.title, s.id
                """
            )
        )

    def stats(self) -> dict[str, Any]:
        totals: dict[str, Any] = {}
        for table in (
            "runs",
            "documents",
            "document_sources",
            "review_hits",
            "crawl_errors",
        ):
            row = self.connection.execute(f"SELECT COUNT(*) AS count FROM {table}").fetchone()
            totals[table] = int(row["count"])
        totals["by_supplier"] = [
            dict(row)
            for row in self.connection.execute(
                """
                SELECT supplier_id, COUNT(*) AS documents, SUM(file_size) AS bytes
                FROM documents GROUP BY supplier_id ORDER BY supplier_id
                """
            )
        ]
        totals["extractions"] = [
            dict(row)
            for row in self.connection.execute(
                """
                SELECT status, COUNT(*) AS count
                FROM extraction_jobs GROUP BY status ORDER BY status
                """
            )
        ]
        totals["flowx_ingests"] = [
            dict(row)
            for row in self.connection.execute(
                """
                SELECT status, COUNT(*) AS count
                FROM flowx_ingest_jobs GROUP BY status ORDER BY status
                """
            )
        ]
        return totals

    def errors(self, limit: int = 50) -> list[sqlite3.Row]:
        return list(
            self.connection.execute("SELECT * FROM crawl_errors ORDER BY id DESC LIMIT ?", (limit,))
        )

    def reviews(self, limit: int = 50) -> list[sqlite3.Row]:
        return list(
            self.connection.execute("SELECT * FROM review_hits ORDER BY id DESC LIMIT ?", (limit,))
        )
