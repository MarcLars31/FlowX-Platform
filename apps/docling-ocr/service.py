"""Private, single-page Docling OCR service. No document URLs or persistent PDFs."""
import hashlib
import hmac
import io
import json
import logging
import math
import multiprocessing
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import threading
import time

VERSION = "docling-rapidocr-v1"
MAX_BYTES = 30 * 1024 * 1024
LOG = logging.getLogger("scipx.docling")


def runtime_metrics(initialized_seconds, converted_seconds):
    """Opt-in performance data; never includes document content or credentials."""
    metrics = {"initializationSeconds": round(initialized_seconds, 3),
        "conversionSeconds": round(converted_seconds, 3)}
    try:
        import resource
        metrics["workerPeakRssMiB"] = round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024, 1)
    except ImportError:
        pass  # resource is unavailable on Windows; Linux/Vercel reports it.
    for key, path in [("containerMemoryMiB", "/sys/fs/cgroup/memory.current"),
        ("containerPeakMemoryMiB", "/sys/fs/cgroup/memory.peak")]:
        try:
            metrics[key] = round(int(Path(path).read_text().strip()) / 1024 ** 2, 1)
        except (OSError, ValueError):
            pass
    return metrics


def make_converter():
    from docling.datamodel.accelerator_options import AcceleratorDevice, AcceleratorOptions
    from docling.datamodel.base_models import InputFormat
    from docling.datamodel.pipeline_options import OcrMode, PdfPipelineOptions, RapidOcrOptions
    from docling.document_converter import DocumentConverter, PdfFormatOption

    artifacts = os.environ.get("DOCLING_ARTIFACTS_PATH")
    options = PdfPipelineOptions(
        artifacts_path=Path(artifacts) if artifacts else None,
        do_ocr=True, do_table_structure=False, generate_parsed_pages=True,
        ocr_options=RapidOcrOptions(lang=["latin"], mode=OcrMode.FULL_PAGE),
        accelerator_options=AcceleratorOptions(num_threads=max(1, min(4, int(os.environ.get("DOCLING_NUM_THREADS", "4")))), device=AcceleratorDevice.CPU),
        enable_remote_services=False, document_timeout=65,
    )
    converter = DocumentConverter(allowed_formats=[InputFormat.PDF],
        format_options={InputFormat.PDF: PdfFormatOption(pipeline_options=options)})
    converter.initialize_pipeline(InputFormat.PDF)
    return converter


def convert_page(converter, data):
    from docling.datamodel.base_models import ConversionStatus, DocumentStream

    result = converter.convert(DocumentStream(name="page.pdf", stream=io.BytesIO(data)),
        max_num_pages=1, max_file_size=MAX_BYTES, raises_on_error=False)
    if result.status != ConversionStatus.SUCCESS or len(result.pages) != 1:
        raise ValueError("page_conversion_failed")
    page = result.pages[0]
    if page.size is None:
        raise ValueError("missing_page_size")
    cells = []
    for cell in page.cells:
        # Never substitute PDF text for the independent OCR reading.
        if not cell.from_ocr or not cell.text.strip():
            continue
        score = float(cell.confidence)
        box = cell.to_bounding_box().to_top_left_origin(page_height=page.size.height)
        if not math.isfinite(score) or not all(math.isfinite(v) for v in (box.l, box.t, box.r, box.b)):
            continue
        cells.append({"text": cell.text, "confidence": max(0, min(1, score)),
            "bbox": {"x0": max(0, box.l), "y0": max(0, box.t), "x1": max(0, box.r), "y1": max(0, box.b)}})
    if len(cells) > 10_000 or sum(len(cell["text"]) for cell in cells) > 300_000:
        raise ValueError("page_result_too_large")
    return {"version": VERSION, "status": "success", "sourceSha256": hashlib.sha256(data).hexdigest(), "cells": cells}


def worker_main(connection):
    try:
        started = time.monotonic()
        converter = make_converter()
        initialized_seconds = time.monotonic() - started
        connection.send({"ready": True})
        while True:
            data = connection.recv()
            if data is None:
                return
            try:
                started = time.monotonic()
                result = convert_page(converter, data)
                if os.environ.get("DOCLING_OCR_METRICS") == "1":
                    result["metrics"] = runtime_metrics(initialized_seconds, time.monotonic() - started)
                connection.send({"result": result})
            except Exception:
                # Do not log extracted text, credentials, filenames or PDF bytes.
                LOG.warning("page_conversion_failed")
                connection.send({"error": "conversion_failed"})
    except (EOFError, BrokenPipeError):
        pass
    finally:
        connection.close()


class OcrWorker:
    """One warm model process. A hard deadline terminates native OCR as well."""
    def __init__(self):
        self.lock = threading.Lock()
        self.process = None
        self.connection = None

    def start(self):
        context = multiprocessing.get_context("spawn")
        self.connection, child = context.Pipe()
        self.process = context.Process(target=worker_main, args=(child,), daemon=True)
        self.process.start()
        child.close()
        if not self.connection.poll(300) or self.connection.recv() != {"ready": True}:
            self.stop()
            raise RuntimeError("model_initialization_failed")

    def stop(self):
        if self.process:
            if self.process.is_alive():
                self.process.terminate()
            self.process.join(timeout=5)
            if self.process.is_alive():
                self.process.kill()
                self.process.join(timeout=5)
        if self.connection:
            self.connection.close()
        self.process = None
        self.connection = None

    def convert(self, data):
        if not self.lock.acquire(blocking=False):
            return 503, {"error": "busy"}
        try:
            if not self.process or not self.process.is_alive():
                self.start()
            self.connection.send(data)
            if not self.connection.poll(70):
                self.stop()
                return 504, {"error": "ocr_timeout"}
            result = self.connection.recv()
            return (200, result["result"]) if "result" in result else (422, result)
        except (EOFError, BrokenPipeError, OSError, RuntimeError):
            self.stop()
            return 503, {"error": "worker_unavailable"}
        finally:
            self.lock.release()


def handler_for(worker, token):
    class Handler(BaseHTTPRequestHandler):
        def setup(self):
            super().setup()
            self.connection.settimeout(15)

        def log_message(self, _format, *_args):
            pass

        def reply(self, status, payload):
            body = json.dumps(payload, ensure_ascii=False, allow_nan=False).encode("utf-8")
            if len(body) > 2_000_000:
                status, body = 422, b'{"error":"page_result_too_large"}'
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            if status == 503 and payload.get("error") == "busy":
                self.send_header("X-Docling-Status", "busy")
                self.send_header("Retry-After", "15")
            self.send_header("Connection", "close")
            self.end_headers()
            try:
                self.wfile.write(body)
            except (BrokenPipeError, ConnectionResetError):
                pass

        def authorized(self):
            supplied = self.headers.get("Authorization", "").encode("utf-8")
            return hmac.compare_digest(supplied, f"Bearer {token}".encode("utf-8"))

        def do_GET(self):
            if not self.authorized():
                self.reply(401, {"error": "unauthorized"})
            elif self.path == "/healthz":
                self.reply(200, {"version": VERSION})
            else:
                self.reply(404, {"error": "not_found"})

        def do_POST(self):
            if not self.authorized():
                self.reply(401, {"error": "unauthorized"})
                return
            if self.path != "/v1/ocr/page":
                self.reply(404, {"error": "not_found"})
                return
            try:
                length = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                length = 0
            if length <= 0 or length > MAX_BYTES or self.headers.get("Transfer-Encoding"):
                self.reply(413, {"error": "invalid_size"})
                return
            if self.headers.get_content_type() != "application/pdf":
                self.reply(415, {"error": "pdf_required"})
                return
            try:
                data = self.rfile.read(length)
            except (TimeoutError, OSError):
                self.reply(408, {"error": "read_timeout"})
                return
            if len(data) != length or not data.startswith(b"%PDF-"):
                self.reply(415, {"error": "pdf_required"})
                return
            self.reply(*worker.convert(data))
    return Handler


def main():
    import sys
    logging.basicConfig(level=logging.WARNING)
    if "--warmup" in sys.argv:
        artifacts = os.environ.get("DOCLING_ARTIFACTS_PATH")
        if artifacts:
            from docling.utils.model_downloader import download_models
            download_models(Path(artifacts), with_tableformer=False, with_code_formula=False,
                with_picture_classifier=False, rapidocr_models=["onnxruntime:latin"])
        make_converter()
        return
    token = os.environ.get("DOCLING_OCR_TOKEN", "")
    if len(token) < 32:
        raise SystemExit("DOCLING_OCR_TOKEN must contain at least 32 characters")
    worker = OcrWorker()
    worker.start()
    server = ThreadingHTTPServer((os.environ.get("HOST", "127.0.0.1"), int(os.environ.get("PORT", "8090"))), handler_for(worker, token))
    try:
        server.serve_forever()
    finally:
        server.server_close()
        worker.stop()


if __name__ == "__main__":
    main()
