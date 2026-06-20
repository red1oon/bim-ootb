// W-WALK-REVEAL-LIVE — step E progressive walk reveal, IN the real modeller.
// CLAIM: driving ?routewalk=walk, dropping SH auto-routes 23 MEP fixtures and the reveal AUTO-PLAYS — the fixtures
// pop in one-by-one over ~1.5s (commit/room order), all hidden at the start, all visible at the end. Pure
// render-time animation over the committed signed ops (hash chain untouched → verify stays true). Confirms the
// deterministic schedule + the before/after scene state + a GL pixel-lit draw.
const http = require('http'), fs = require('fs'), path = require('path');
const VIEWER = path.resolve(__dirname, '..');   // this file lives in <viewer>/tests/ → serve its parent
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.map': 'application/json',
  '.db': 'application/octet-stream' };
const server = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/modeller.html';
  fs.readFile(path.join(VIEWER, p), (e, b) => {
    if (e) { r.writeHead(404); r.end('404 ' + p); return; }
    r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); r.end(b);
  });
});
(async () => {
  await new Promise(r => server.listen(0, r)); const port = server.address().port;
  const br = await puppeteer.launch({ headless: 'new',
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader',
           '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const pg = await br.newPage();
  pg.on('console', m => { const t = m.text(); if (/^§(RW|MODELLER)/.test(t)) console.log('  ' + t); });
  pg.on('pageerror', e => console.log('  ERR ' + String(e).slice(0, 300)));
  await pg.goto(`http://localhost:${port}/modeller.html?routewalk=walk`, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction('window.__walkDone === true', { timeout: 180000 })
    .catch(() => console.log('  ✗ timeout waiting for __walkDone'));

  const probe = await pg.evaluate(() => {
    const res = window.__walkResult || {};
    let litPct = 0;
    try { const r = window.A.renderer; r.render(window.A.scene, window.A.camera); const gl = r.getContext();
      const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight; const px = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px); let lit = 0;
      for (let i = 0; i < px.length; i += 4) { if (px[i] > 40 || px[i + 1] > 44 || px[i + 2] > 52) lit++; }
      litPct = +(100 * lit / (w * h)).toFixed(1); } catch (e) {}
    return { res, litPct };
  }).catch(e => ({ err: String(e) }));

  const x = probe.res || {};
  console.log('  §WALK planned=' + x.planned + ' hiddenAtStart=' + x.hiddenAtStart + ' revealed=' + x.revealed +
    ' firstT=' + x.firstT + ' lastT=' + x.lastT + ' monotonic=' + x.monotonic + ' durationMs=' + x.durationMs +
    ' fixturesVisible=' + x.fixturesVisible + '/' + x.fixturesTotal + ' verify=' + x.verify +
    ' litPixels=' + probe.litPct + '%' + (x.error ? ' ERROR=' + x.error : ''));

  await br.close(); server.close();

  const planned = x.planned === 23 && x.firstT === 0 && x.lastT === 1500 && x.monotonic === true;   // staged over ~1.5s
  const before = x.hiddenAtStart === 23;                                                            // all hidden at t0
  const after = x.revealed === 23 && x.fixturesVisible === 23 && x.fixturesTotal === 23;            // all visible at end
  const played = x.durationMs >= 800;                                                               // actually animated over time
  const chainOK = x.verify === true;
  const drew = probe.litPct > 0.5;
  const pass = planned && before && after && played && chainOK && drew && x.pass === true;
  console.log('  §WALK VERDICT ' + (pass ? 'PASS' : 'FAIL') + ' — stagedSchedule=' + planned + ' allHiddenAtStart=' + before +
    ' allVisibleAtEnd=' + after + ' playedOverTime=' + played + ' chainVerifies=' + chainOK + ' drew=' + drew + ' pageSelfTest=' + x.pass);
  console.log('── W-WALK-REVEAL-LIVE ' + (pass ? 'PASS' : 'FAIL') + ' ──');
  process.exit(pass ? 0 : 1);
})();
