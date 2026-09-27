from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
import sys
from dataclasses import asdict
from datetime import UTC, datetime
from pathlib import Path

from document_crawler.config import AppConfig, load_config
from document_crawler.crawler import DocumentCrawler
from document_crawler.database import CrawlerDatabase
from document_crawler.exports import export_metadata
from document_crawler.models import CrawlOptions


def default_config_path() -> Path:
    env_path = os.getenv("SCIPX_CRAWLER_CONFIG")
    if env_path:
        return Path(env_path)
    local = Path.cwd() / "config" / "suppliers.toml"
    if local.is_file():
        return local
    return Path(__file__).resolve().parents[2] / "config" / "suppliers.toml"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="crawler",
        description="Crawl public sprinkler/fire-protection PDF documents.",
    )
    parser.add_argument("--config", type=Path, default=default_config_path())
    parser.add_argument("--verbose", action="store_true")
    commands = parser.add_subparsers(dest="command", required=True)

    crawl = commands.add_parser("crawl", help="Crawl one supplier or every enabled supplier")
    target = crawl.add_mutually_exclusive_group(required=True)
    target.add_argument("--supplier")
    target.add_argument("--all", action="store_true")
    crawl.add_argument("--dry-run", action="store_true", help="Discover/probe, but store no PDFs")
    crawl.add_argument(
        "--resume",
        action="store_true",
        help="Continue the latest paused or incomplete run",
    )
    crawl.add_argument("--max-requests", type=_positive_int)
    crawl.add_argument("--max-pages", type=_positive_int)
    crawl.add_argument("--max-files", type=_positive_int)
    crawl.add_argument("--max-depth", type=_non_negative_int)

    export = commands.add_parser("export", help="Export document metadata")
    export.add_argument("--format", choices=("csv", "json"), required=True)
    export.add_argument("--output", type=Path)

    commands.add_parser("stats", help="Show crawl/document/extractor statistics")
    errors = commands.add_parser("errors", help="Show recent isolated crawl errors")
    errors.add_argument("--limit", type=_positive_int, default=50)
    reviews = commands.add_parser("reviews", help="Show uncertain PDF review hits")
    reviews.add_argument("--limit", type=_positive_int, default=50)
    commands.add_parser("suppliers", help="Show configured suppliers and activation state")
    return parser


def _positive_int(value: str) -> int:
    parsed = int(value)
    if parsed < 1:
        raise argparse.ArgumentTypeError("must be at least 1")
    if parsed > 1_000_000:
        raise argparse.ArgumentTypeError("must not exceed 1000000")
    return parsed


def _non_negative_int(value: str) -> int:
    parsed = int(value)
    if parsed < 0:
        raise argparse.ArgumentTypeError("must be 0 or greater")
    return parsed


async def _crawl(config: AppConfig, args: argparse.Namespace) -> int:
    database = CrawlerDatabase(config.settings.database_path)
    crawler = DocumentCrawler(config, database)
    failures = 0
    try:
        suppliers = (
            [supplier for supplier in config.suppliers if supplier.enabled]
            if args.all
            else [config.supplier(args.supplier)]
        )
        for supplier in suppliers:
            try:
                outcome = await crawler.crawl(
                    supplier,
                    CrawlOptions(
                        dry_run=args.dry_run,
                        resume=args.resume,
                        max_requests=args.max_requests,
                        max_pages=args.max_pages,
                        max_files=args.max_files,
                        max_depth=args.max_depth,
                    ),
                )
                print(json.dumps(asdict(outcome), ensure_ascii=False, indent=2))
            except Exception as error:
                failures += 1
                database.add_error(None, supplier.id, None, "supplier", error)
                print(f"{supplier.name}: {error}", file=sys.stderr)
    finally:
        await crawler.close()
        database.close()
    return 1 if failures else 0


def _default_export_path(config: AppConfig, output_format: str) -> Path:
    stamp = datetime.now(UTC).strftime("%Y%m%d-%H%M%S")
    return config.settings.data_dir / "exports" / f"documents-{stamp}.{output_format}"


def _run_sync(config: AppConfig, args: argparse.Namespace) -> int:
    database = CrawlerDatabase(config.settings.database_path)
    try:
        if args.command == "export":
            output = args.output or _default_export_path(config, args.format)
            count = export_metadata(database, args.format, output)
            print(f"Exported {count} row(s) to {output}")
            return 0
        if args.command == "stats":
            print(json.dumps(database.stats(), ensure_ascii=False, indent=2))
            return 0
        if args.command == "errors":
            print(
                json.dumps(
                    [dict(row) for row in database.errors(args.limit)],
                    ensure_ascii=False,
                    indent=2,
                )
            )
            return 0
        if args.command == "reviews":
            print(
                json.dumps(
                    [dict(row) for row in database.reviews(args.limit)],
                    ensure_ascii=False,
                    indent=2,
                )
            )
            return 0
        if args.command == "suppliers":
            print(
                json.dumps(
                    [
                        {
                            "id": supplier.id,
                            "name": supplier.name,
                            "enabled": supplier.enabled,
                            "notes": supplier.notes,
                            "terms_url": supplier.terms_url,
                        }
                        for supplier in config.suppliers
                    ],
                    ensure_ascii=False,
                    indent=2,
                )
            )
            return 0
        raise ValueError(f"Unsupported command: {args.command}")
    finally:
        database.close()


def main(argv: list[str] | None = None) -> None:
    parser = build_parser()
    args = parser.parse_args(argv)
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    try:
        config = load_config(args.config)
        result = (
            asyncio.run(_crawl(config, args))
            if args.command == "crawl"
            else _run_sync(config, args)
        )
    except (OSError, ValueError) as error:
        parser.error(str(error))
        return
    raise SystemExit(result)
