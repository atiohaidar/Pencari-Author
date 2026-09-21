"""
Local Proxy & Static File Server for SINTA Author Finder
Zero external dependencies - uses standard Python library only!
"""
import sys
import os
import urllib.request
import urllib.parse
import ssl
from http.server import HTTPServer, SimpleHTTPRequestHandler
import json
import webbrowser

PORT = 8000
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class SintaProxyHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        # Enable CORS for all responses
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, User-Agent')
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        # Check if this is an API proxy call
        parsed_url = urllib.parse.urlparse(self.path)
        
        if parsed_url.path == '/api/health':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'status': 'ok', 'message': 'SINTA Proxy Server is running'}).encode('utf-8'))
            return

        if parsed_url.path == '/api/search':
            query_params = urllib.parse.parse_qs(parsed_url.query)
            q = query_params.get('q', [''])[0].strip()
            page = query_params.get('page', ['1'])[0].strip()
            
            if not q:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': 'Parameter "q" (query nama) diperlukan'}).encode('utf-8'))
                return
            
            target_url = f"https://sinta.kemdiktisaintek.go.id/authors/?q={urllib.parse.quote(q)}&page={urllib.parse.quote(page)}"
            
            try:
                # SSL context without verification to prevent certificate path issues on local Windows
                ctx = ssl._create_unverified_context()
                
                # SINTA requires standard browser headers to bypass AWS ELB 403 block
                headers = {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                    'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
                    'Referer': 'https://sinta.kemdiktisaintek.go.id/authors',
                }
                
                req = urllib.request.Request(target_url, headers=headers)
                with urllib.request.urlopen(req, context=ctx, timeout=20) as response:
                    content = response.read()
                    
                    self.send_response(200)
                    self.send_header('Content-Type', 'text/html; charset=utf-8')
                    self.end_headers()
                    self.wfile.write(content)
                    
            except urllib.error.HTTPError as e:
                self.send_response(e.code)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': f'SINTA HTTP Error: {e.code}', 'reason': str(e.reason)}).encode('utf-8'))
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': 'Server Error', 'details': str(e)}).encode('utf-8'))
            return

        # Default static file handler (index.html, style.css, app.js, etc.)
        super().do_GET()

def run():
    server_address = ('', PORT)
    httpd = HTTPServer(server_address, SintaProxyHandler)
    print("=" * 60)
    print(f" SINTA Author Matcher Server Aktif!")
    print(f" URL: http://localhost:{PORT}")
    print(" Tekan Ctrl+C untuk menghentikan server.")
    print("=" * 60)
    
    # Try opening browser automatically if flagged or launched directly
    if "--no-browser" not in sys.argv:
        try:
            webbrowser.open(f'http://localhost:{PORT}')
        except Exception:
            pass

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServer dihentikan.")
        httpd.server_close()

if __name__ == '__main__':
    run()
