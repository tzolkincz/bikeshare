#!/usr/bin/env python3
"""Simple HTTP server for Pilsen Bike Share PWA."""
import http.server
import socketserver
import os

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
        return MIME_TYPES.get(ext, super().guess_type(path)[0])

    # Disable logging to reduce noise (optional: remove this line for debug)
    def log_message(self, format, *args):
        pass

with socketserver.TCPServer(("", PORT), Handler) as httpd:
    print(f"🚲 Pilsen Bike Share running at:")
    print(f"  http://localhost:{PORT}")
    print(f"  Open on your phone: http://{http.server.socketserver.getfqdn().split('.')[0] if '.' in http.server.socketserver.getfqdn() else 'YOUR_IP'}:{PORT}")
    print(f"\nPress Ctrl+C to stop.")
    httpd.serve_forever()
