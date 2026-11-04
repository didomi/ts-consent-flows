"""Serve the sandbox locally, allowing concurrent browser module requests."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class FreshFileHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        # Local review must not combine fresh HTML with cached JS modules.
        if "If-Modified-Since" in self.headers:
            del self.headers["If-Modified-Since"]
        super().do_GET()

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


class SandboxServer(ThreadingHTTPServer):
    request_queue_size = 128


if __name__ == "__main__":
    with SandboxServer(("127.0.0.1", 4173), FreshFileHandler) as server:
        server.serve_forever()
