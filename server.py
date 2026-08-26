#!/usr/bin/env python3
"""Simple HTTP server for Pilsen Bike Share PWA."""
import http.server
import os
import socket

PORT = 8080
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

# MIME types for proper PWA serving
MIME_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
}

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def guess_type(self, path):
        ext = os.path.splitext(path)[1]
        # super().guess_type() returns a string (or None), not a tuple
        return MIME_TYPES.get(ext) or super().guess_type(path)

    # Disable logging to reduce noise (optional: remove this line for debug)
    def log_message(self, format, *args):
        pass

# ThreadingHTTPServer handles concurrent requests and allows port reuse
httpd = http.server.ThreadingHTTPServer(("", PORT), Handler)

try:
    local_ip = socket.gethostbyname(socket.gethostname())
except OSError:
    local_ip = None

print(f"🚲 Pilsen Bike Share running at:")
print(f"  http://localhost:{PORT}")
if local_ip and not local_ip.startswith('127.'):
    print(f"  Open on your phone: http://{local_ip}:{PORT}")
else:
    print(f"  Open on your phone: http://<your-machine-ip>:{PORT}")
print(f"\nPress Ctrl+C to stop.")
httpd.serve_forever()
