"""
Start the Georgian Verbs app.
Double-click this file, or run: python serve.py

Then open http://localhost:8000 in your browser.
On mobile: open http://<your-computer-IP>:8000
"""

import http.server
import socketserver
import webbrowser
import os
import socket

PORT = 8000
DIR = os.path.dirname(os.path.abspath(__file__))

def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "localhost"

os.chdir(DIR)

handler = http.server.SimpleHTTPRequestHandler
handler.extensions_map = {
    '': 'application/octet-stream',
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.webmanifest': 'application/manifest+json',
}

with socketserver.TCPServer(("", PORT), handler) as httpd:
    local_ip = get_local_ip()
    print(f"\n  Georgian Verbs is running!\n")
    print(f"  Desktop:  http://localhost:{PORT}")
    print(f"  Mobile:   http://{local_ip}:{PORT}\n")
    print(f"  Press Ctrl+C to stop.\n")
    webbrowser.open(f"http://localhost:{PORT}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n  Stopped.")
