import os, sys, functools
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

PORT = int(os.environ.get("PORT", "8765"))
DIR = os.path.dirname(os.path.abspath(__file__))

Handler = functools.partial(SimpleHTTPRequestHandler, directory=DIR)
with ThreadingHTTPServer(("127.0.0.1", PORT), Handler) as httpd:
    print(f"Serving {DIR} on http://127.0.0.1:{PORT}", flush=True)
    httpd.serve_forever()
