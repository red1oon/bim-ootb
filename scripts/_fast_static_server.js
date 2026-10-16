#!/usr/bin/env node
// Minimal concurrent static file server — python3 -m http.server is single-threaded/sequential and
// was measured (§S78) to make a Hospital/Clinic/even-Duplex page load take 180s+ / never complete,
// purely from per-request overhead across viewer.html's many <script> tags, unrelated to any product
// code. Node's http module handles concurrent connections natively; this is the same pattern already
// used by viewer/tests/witness_real_placement_resolver.js in this repo.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const PORT = Number(process.argv[2] || process.env.PORT || 8148);
const ROOT = process.argv[3] || process.env.SERVE_ROOT || process.cwd();
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.db': 'application/octet-stream',
  '.bin': 'application/octet-stream', '.json': 'application/json', '.css': 'text/css', '.wasm': 'application/wasm' };
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  const full = path.join(ROOT, p);
  fs.stat(full, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); res.end('404'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(full)] || 'application/octet-stream',
      'Content-Length': st.size, 'Cache-Control': 'no-store' });
    fs.createReadStream(full).pipe(res);
  });
}).listen(PORT, () => console.log('fast_static_server on :' + PORT + ' root=' + ROOT));
