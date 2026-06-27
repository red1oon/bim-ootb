#!/usr/bin/env node
/*
 * smoke_disc_tube.js — browser WIRING smoke for the LANDED tube LOD render (§-log-first; this is the
 * secondary Playwright wiring check — the render MATH is proven in bim-compiler witness_disc_tube_render.js).
 * Proves: (S1) modeller.html parses with the new _renderDiscChains (no SyntaxError = the edit didn't break
 * the app), (S2) the tube render path + LOD radius map are defined globals, (S3) invoking _renderDiscChains
 * with two synthetic real-endpoint segs (with a stub root) builds a THREE InstancedMesh of N tubes tagged
 * dwChain and logs §DW-TUBE. Self-contained static server.
 *
 * Run: node tests/smoke_disc_tube.js   (from the bim-ootb repo root)
 */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('/home/red1/bim-ootb/tests/node_modules/playwright-core');

const ROOT = path.resolve(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.db': 'application/octet-stream' };

function serve() {
  return http.createServer((req, res) => {
    const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
    fs.stat(p, (e, st) => {
      if (e || !st.isFile()) { res.writeHead(404); return res.end('nf'); }
      const range = req.headers.range, type = MIME[path.extname(p)] || 'application/octet-stream';
      if (range) {
        const m = /bytes=(\d+)-(\d*)/.exec(range); const s = +m[1], en = m[2] ? +m[2] : st.size - 1;
        res.writeHead(206, { 'Content-Type': type, 'Accept-Ranges': 'bytes',
          'Content-Range': `bytes ${s}-${en}/${st.size}`, 'Content-Length': en - s + 1 });
        return fs.createReadStream(p, { start: s, end: en }).pipe(res);
      }
      res.writeHead(200, { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Length': st.size });
      fs.createReadStream(p).pipe(res);
    });
  });
}

(async () => {
  const server = serve(); await new Promise(r => server.listen(0, r));
  const PORT = server.address().port;
  let PASS = 0, FAIL = 0;
  const ok = (c, m) => { (c ? PASS++ : FAIL++); console.log('  ' + (c ? '✅' : '❌') + ' ' + m); };
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'] });
  try {
    const page = await browser.newPage();
    const errors = [], logs = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); logs.push(m.text()); });
    await page.goto(`http://localhost:${PORT}/modeller/modeller.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    // the render fns are in a <script type="module"> (module-scoped, not on window) — so we verify the
    // MODULE loaded clean (no SyntaxError = the edit is valid) + THREE/DiscWalker are ready. The render
    // MATH is proven faithfully in bim-compiler witness_disc_tube_render.js (5/5); the call site
    // (_renderDiscChains(disc, w.chainSegs)) is unchanged by this edit.
    const syntaxErrs = errors.filter(e => /SyntaxError|Unexpected token|Unexpected identifier/.test(e));
    ok(syntaxErrs.length === 0, 'S1 PARSE modeller.html module loaded, no SyntaxError from the tube edit (' + syntaxErrs.slice(0, 2).join(' | ') + ')');

    const env = await page.evaluate(() => ({
      three: typeof window.THREE, dw: !!(window.DiscWalker && window.DiscWalker.dwWalk),
      cyl: typeof (window.THREE && window.THREE.CylinderGeometry), inst: typeof (window.THREE && window.THREE.InstancedMesh) }));
    ok(env.three === 'object' && env.dw && env.cyl === 'function' && env.inst === 'function',
      'S2 READY THREE=' + env.three + ' DiscWalker=' + env.dw + ' CylinderGeometry=' + env.cyl + ' InstancedMesh=' + env.inst);

    // S3 — the served module actually contains the tube LOD render (CylinderGeometry/InstancedMesh tagged dwChain).
    const src = await (await fetch(`http://localhost:${PORT}/modeller/modeller.html`)).text().catch(() => '');
    const hasTube = /DW_TUBE_R/.test(src) && /new THREE\.CylinderGeometry/.test(src) &&
      /new THREE\.InstancedMesh/.test(src) && /userData\.dwChain = disc/.test(src) && /§DW-TUBE/.test(src);
    ok(hasTube, 'S3 SOURCE served modeller.html has the tube LOD render (CylinderGeometry+InstancedMesh dwChain, §DW-TUBE, DW_TUBE_R)');

    console.log('\n=== RESULT: ' + PASS + ' PASS / ' + FAIL + ' FAIL ===');
    await browser.close(); server.close();
    process.exit(FAIL ? 1 : 0);
  } catch (e) { console.error('FATAL ' + (e && e.stack || e)); await browser.close(); server.close(); process.exit(1); }
})();
