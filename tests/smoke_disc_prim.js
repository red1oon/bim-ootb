#!/usr/bin/env node
/*
 * smoke_disc_prim.js — browser WIRING smoke for the §PRIM per-ifc_class measured-box render in
 * _renderDiscWalk (§-log-first; secondary Playwright wiring check — the render MATH is proven in
 * bim-compiler witness_disc_prim.js W-DW-PRIM 10/10). Proves: (S1) modeller.html parses with the
 * rewritten _renderDiscWalk (no SyntaxError = the edit didn't break the app), (S2) THREE/DiscWalker/
 * BoxGeometry are ready globals, (S3) the served module groups placements by ifc_class into per-class
 * BoxGeometry(bx,by,bz) with the 0.18 fallback + logs §DW-PRIM. Self-contained static server.
 *
 * Run: node tests/smoke_disc_prim.js   (from the bim-ootb repo root)
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
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(`http://localhost:${PORT}/modeller/modeller.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    const syntaxErrs = errors.filter(e => /SyntaxError|Unexpected token|Unexpected identifier/.test(e));
    ok(syntaxErrs.length === 0, 'S1 PARSE modeller.html module loaded, no SyntaxError from the §PRIM edit (' + syntaxErrs.slice(0, 2).join(' | ') + ')');

    const env = await page.evaluate(() => ({
      three: typeof window.THREE, dw: !!(window.DiscWalker && window.DiscWalker.dwWalk),
      box: typeof (window.THREE && window.THREE.BoxGeometry), inst: typeof (window.THREE && window.THREE.InstancedMesh) }));
    ok(env.three === 'object' && env.dw && env.box === 'function' && env.inst === 'function',
      'S2 READY THREE=' + env.three + ' DiscWalker=' + env.dw + ' BoxGeometry=' + env.box + ' InstancedMesh=' + env.inst);

    // S3 — the served module groups by ifc_class → per-class BoxGeometry(bx,by,bz) + 0.18 fallback + §DW-PRIM log.
    const src = await (await fetch(`http://localhost:${PORT}/modeller/modeller.html`)).text().catch(() => '');
    const hasPrim = /byCls\[p\.ifc_class\]/.test(src) && /new THREE\.BoxGeometry\(bx, by, bz\)/.test(src) &&
      /measured \? s\.bx : 0\.18/.test(src) && /§DW-PRIM/.test(src);
    ok(hasPrim, 'S3 SOURCE served modeller.html has the §PRIM per-class measured box render (group-by-ifc_class, BoxGeometry(bx,by,bz), 0.18 fallback, §DW-PRIM)');

    console.log('\n=== RESULT: ' + PASS + ' PASS / ' + FAIL + ' FAIL ===');
    await browser.close(); server.close();
    process.exit(FAIL ? 1 : 0);
  } catch (e) { console.error('FATAL ' + (e && e.stack || e)); await browser.close(); server.close(); process.exit(1); }
})();
