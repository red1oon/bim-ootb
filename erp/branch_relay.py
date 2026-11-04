#!/usr/bin/env python3
# Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
# SPDX-License-Identifier: MIT
# DO NOT REMOVE - the BRANCH RELAY (bim-compiler prompts/POS_PLUGIN_LOCAL_FIRST.md section 38.2.1). Read the log; the exit code is not evidence.
# A DUMB mailbox for one shop LAN box. Same protocol as comm_pipe.js httpPipe and the folder server of witness_team_so.js:
#   PUT /pipe/f/<name>  (?absent=1 -> 201 created / 412 exists)    GET /pipe/f/<name>    GET /pipe/list?prefix=<p>  -> JSON array of names
# It stores and lists. It parses nothing, orders nothing, decides nothing. The same process serves the till app as static files
# for localhost (--app <dir>), so a till PC runs ONE command.  python3 standard library only (the DIY path of common/about_diy.js).
# Only extras: CORS + Private-Network-Access headers (a till page at http://localhost:<p> calls this box at another origin),
# and one log line per request on stderr:  "§RELAY <method> <path> <status> <bytes>".
#   python3 erp/branch_relay.py --port 8787 --dir ./branch_box --app .        (the till PC at localhost opens the same port)
import argparse, os, sys, json, mimetypes, threading
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs, unquote

class H(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'
    def log_message(self, *a): pass
    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')
        self.send_header('Access-Control-Allow-Private-Network', 'true')
    def _end(self, code, body=b'', ctype='text/plain'):
        self.send_response(code); self._cors()
        self.send_header('Content-Type', ctype); self.send_header('Content-Length', str(len(body))); self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        if self.command != 'HEAD': self.wfile.write(body)
        sys.stderr.write('§RELAY %s %s %d %d\n' % (self.command, self.path.split('&')[0][:120], code, len(body))); sys.stderr.flush()
    def _path(self, name):
        p = os.path.realpath(os.path.join(self.server.box, name))
        return p if p.startswith(os.path.realpath(self.server.box) + os.sep) else None
    def _walk(self):
        out, base = [], os.path.realpath(self.server.box)
        for d, _, fs in os.walk(base):
            for f in fs: out.append(os.path.relpath(os.path.join(d, f), base).replace(os.sep, '/'))
        return sorted(out)
    def do_OPTIONS(self): self._end(204)
    def do_PUT(self):
        u = urlparse(self.path); p = unquote(u.path)
        if not p.startswith('/pipe/f/'): return self._end(404)
        fp = self._path(p[8:])
        if not fp: return self._end(400)
        body = self.rfile.read(int(self.headers.get('Content-Length') or 0))
        with self.server.lock:
            if 'absent' in parse_qs(u.query) and os.path.exists(fp): return self._end(412)
            os.makedirs(os.path.dirname(fp), exist_ok=True)
            tmp = fp + '.part'; open(tmp, 'wb').write(body); os.replace(tmp, fp)   # whole file or nothing
        self._end(201 if 'absent' in parse_qs(u.query) else 200, b'ok')
    def do_GET(self):
        u = urlparse(self.path); p = unquote(u.path)
        if p == '/pipe/list':
            pre = (parse_qs(u.query).get('prefix') or [''])[0]
            return self._end(200, json.dumps([n for n in self._walk() if n.startswith(pre) and not n.endswith('.part')]).encode(), 'application/json')
        if p.startswith('/pipe/f/'):
            fp = self._path(p[8:])
            if not fp or not os.path.isfile(fp): return self._end(404)
            return self._end(200, open(fp, 'rb').read(), 'application/octet-stream')
        if self.server.app:                                   # the till app as static files (localhost)
            rel = 'erp/till.html' if p == '/' else p.lstrip('/')
            fp = os.path.realpath(os.path.join(self.server.app, rel))
            if fp.startswith(os.path.realpath(self.server.app) + os.sep) and os.path.isfile(fp):
                t = mimetypes.guess_type(fp)[0] or 'application/octet-stream'
                if fp.endswith('.js') or fp.endswith('.mjs'): t = 'text/javascript'
                if fp.endswith('.wasm'): t = 'application/wasm'
                return self._end(200, open(fp, 'rb').read(), t)
        self._end(404, b'nf')

def main():
    a = argparse.ArgumentParser(description='Branch relay: a dumb mailbox on the shop LAN (+ the till app for localhost).')
    a.add_argument('--port', type=int, default=8787); a.add_argument('--bind', default='0.0.0.0')
    a.add_argument('--dir', default='./branch_box'); a.add_argument('--app', default='')
    o = a.parse_args()
    s = ThreadingHTTPServer((o.bind, o.port), H); s.box = os.path.abspath(o.dir); s.app = os.path.abspath(o.app) if o.app else ''; s.lock = threading.Lock()
    os.makedirs(s.box, exist_ok=True)
    sys.stderr.write('§RELAY_UP port=%d box=%s app=%s\n' % (s.server_address[1], s.box, s.app or '-')); sys.stderr.flush()
    try: s.serve_forever()
    except KeyboardInterrupt: pass
if __name__ == '__main__': main()
