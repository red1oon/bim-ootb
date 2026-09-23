// LIVE SERVER for testing the bounce still in a real browser (red1-84, 2026-09-23).
// Serves the worktree, with two substitutions made IN MEMORY — nothing on disk is changed:
//   1. /viewer/lib/three.webgpu.min.js + three.core.min.js  ->  the r186 build (bounce needs r186)
//   2. viewer.html gets one <script> tag appended: gi_still.js, which takes over Alt+S
// Usage: node serve_gi_live.js [--port 8600]
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const MAIN_BUILDINGS = '/home/red1/bim-ootb/buildings';
const R186 = path.join(__dirname, 'vendor', 'r186');
const PORT = +(process.argv.includes('--port') ? process.argv[process.argv.indexOf('--port') + 1] : 8600);
const OVERRIDE = {
  '/viewer/lib/three.core.min.js': fs.readFileSync(path.join(R186, 'three.core.js'), 'utf8'),
  '/viewer/lib/three.webgpu.min.js': fs.readFileSync(path.join(R186, 'three.webgpu.js'), 'utf8')
    .split("from './three.core.js'").join("from './three.core.min.js'"),
};
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.mjs': 'application/javascript',
  '.wasm': 'application/wasm', '.db': 'application/octet-stream', '.json': 'application/json',
  '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.glb': 'model/gltf-binary' };
http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  if (OVERRIDE[u]) {
    const b = OVERRIDE[u];
    res.writeHead(200, { 'Content-Type': 'application/javascript', 'Content-Length': Buffer.byteLength(b), 'Cache-Control': 'no-store' });
    return res.end(b);
  }
  if (u === '/viewer/viewer.html' || u === '/viewer/' || u === '/') {
    const f = path.join(ROOT, 'viewer', 'viewer.html');
    let html = fs.readFileSync(f, 'utf8');
    html = html.replace('</body>', '<script src="/sandbox/spike_ssgi_webgpu/gi_still.js"></script>\n</body>');
    res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
    return res.end(html);
  }
  let p2 = path.join(ROOT, u);
  if (u.startsWith('/buildings/') && !fs.existsSync(p2)) p2 = path.join(MAIN_BUILDINGS, u.slice('/buildings/'.length));
  fs.stat(p2, (e, st) => {
    if (e || !st.isFile()) { res.writeHead(404); return res.end('not found: ' + u); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p2)] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': 'no-store' });
    fs.createReadStream(p2).pipe(res);
  });
}).listen(PORT, '127.0.0.1', () => {
  console.log('§GI_LIVE serving ' + ROOT + ' on http://127.0.0.1:' + PORT);
  console.log('§GI_LIVE open: http://127.0.0.1:' + PORT + '/viewer/viewer.html?db=/buildings/HHS_Office_Federated_silent.db');
  console.log('§GI_LIVE three.js r186 substituted in memory; Alt+S -> bounce still. Nothing on disk changed.');
});
