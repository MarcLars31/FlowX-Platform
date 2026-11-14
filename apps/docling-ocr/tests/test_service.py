import http.client
from http.server import ThreadingHTTPServer
import threading
import unittest
from unittest.mock import Mock

from service import handler_for, MAX_BYTES, VERSION, OcrWorker


class ServiceTests(unittest.TestCase):
    def setUp(self):
        self.worker = Mock()
        self.worker.convert.return_value = (200, {"version": VERSION, "status": "success", "cells": []})
        self.token = "test-secret-" * 4
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), handler_for(self.worker, self.token))
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()

    def request(self, body=b"%PDF-test", headers=None, path="/v1/ocr/page"):
        conn = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=3)
        values = {"Authorization": f"Bearer {self.token}", "Content-Type": "application/pdf"}
        values.update(headers or {})
        conn.request("POST", path, body=body, headers=values)
        response = conn.getresponse()
        status, payload = response.status, response.read()
        conn.close()
        return status, payload

    def test_authentication_before_processing(self):
        self.assertEqual(self.request(headers={"Authorization": "wrong"})[0], 401)
        self.worker.convert.assert_not_called()

    def test_bounds_and_type_checked_before_processing(self):
        for body, headers, status in [(b"%PDF-", {"Content-Length": str(MAX_BYTES + 1)}, 413),
            (b"not a pdf", {}, 415), (b"%PDF-", {"Content-Type": "text/plain"}, 415),
            (b"", {"Content-Length": "bad"}, 413)]:
            self.assertEqual(self.request(body, headers)[0], status)
        self.worker.convert.assert_not_called()

    def test_exact_pdf_bytes_forwarded_and_busy_response_preserved(self):
        body = b"%PDF-1.7\nmock bytes"
        self.assertEqual(self.request(body)[0], 200)
        self.worker.convert.assert_called_once_with(body)
        self.worker.convert.return_value = (503, {"error": "busy"})
        self.assertEqual(self.request(body)[0], 503)

    def test_missing_path_does_not_run_models(self):
        self.assertEqual(self.request(path="/other")[0], 404)
        self.worker.convert.assert_not_called()


class WorkerTests(unittest.TestCase):
    def test_hard_deadline_terminates_native_worker(self):
        worker = OcrWorker()
        process = Mock()
        worker.process = process
        worker.connection = Mock()
        worker.connection.poll.return_value = False
        status, result = worker.convert(b"%PDF-test")
        self.assertEqual(status, 504)
        self.assertEqual(result["error"], "ocr_timeout")
        process.terminate.assert_called_once()
        self.assertIsNone(worker.process)
        self.assertFalse(worker.lock.locked())

    def test_busy_worker_does_not_queue_unbounded_requests(self):
        worker = OcrWorker()
        worker.lock.acquire()
        self.assertEqual(worker.convert(b"%PDF-test")[0], 503)
        worker.lock.release()


if __name__ == "__main__":
    unittest.main()
