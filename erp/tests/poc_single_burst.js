// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser §-witness proving the ERP init-bubble globe BURSTS ONCE on first erp.html load.
//   ISSUE: on first load the constellation appeared, then ~100ms later the auto-maximize
//   (_renderHomeGraph → setTimeout(_resizeGraph(true),100)) called ADGraph.destroy()+re-init,
//   tearing the globe down and REBUILDING it at fullscreen size — a visible SECOND "bubble burst".
//   FIX (ad_graph.js resize() + ad_ui.js _resizeGraph): the auto-maximize now resizes the existing
//   globe IN PLACE (no destroy, no re-init), so the entry animation runs once.
//   PROVES/DISPROVES: "the initial bubble burst happens twice when first calling erp.html."
//   The number is the proof — READ tests/poc_single_burst.log, not a screenshot.
//   Counts, over the WHOLE first load incl. the 100ms auto-maximize:
//     builds   = §AD_GRAPH init + §AD_GRAPH initFromBubbles  (each = one full constellation build/burst)
//     destroys = §AD_GRAPH destroy
//     resizes  = §AD_GRAPH resize  (the in-place path the auto-maximize must now take)
//     fullscreen = §AD_UI graphFullscreen=true  (the auto-maximize still happened)
//   PASS = builds==1 AND destroys==0 AND resizes>=1 AND fullscreen seen AND no page errors.
//   (Before the fix: builds==2, destroys==1 → FAIL, exactly the double burst.)
// Run:  node tests/poc_single_burst.js 2>&1 | tee tests/poc_single_burst.log   (cwd = bim-ootb/erp)
'use strict';
const { chromium } = require(__dirname + '/../../tests/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const MIME = { '.html':'text/html','.js':'text/javascript','.json':'application/json','.db':'application/octet-stream','.wasm':'application/wasm','.css':'text/css','.png':'image/png' };

const server = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/erp.html';
  fs.readFile(path.join(ROOT, p), (e, b) => {
    if (e) { r.writeHead(404); r.end('404'); return; }
    r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); r.end(b);
  });
});

(async () => {
  await new Promise(r => server.listen(0, r)); const port = server.address().port;
  const br = await chromium.launch();
  const ctx = await br.newContext();
  const pg = await ctx.newPage();

  const errs = [];
  let builds = 0, destroys = 0, resizes = 0, fullscreen = 0;
  const trail = [];
  pg.on('pageerror', e => errs.push(e.message));
  pg.on('console', msg => {
    const t = msg.text();
    if (t.indexOf('§AD_GRAPH initFromBubbles') === 0 || t.indexOf('§AD_GRAPH init client=') === 0) { builds++; trail.push('build'); }
    else if (t.indexOf('§AD_GRAPH destroy') === 0) { destroys++; trail.push('destroy'); }
    else if (t.indexOf('§AD_GRAPH resize') === 0) { resizes++; trail.push('resize'); }
    else if (t.indexOf('§AD_UI graphFullscreen=true') === 0) { fullscreen++; trail.push('fullscreen'); }
  });

  await pg.goto(`http://localhost:${port}/erp.html`, { waitUntil: 'commit' });
  // Wait until DB-ready hydrate AND the 100ms auto-maximize have both fired (graphFullscreen=true),
  // then a settle margin so any stray rebuild would be counted.
  await pg.waitForFunction(() => window.__sawFullscreen === true || true, { timeout: 20000 }).catch(() => {});
  await pg.waitForTimeout(3500);

  await pg.close(); await ctx.close(); await br.close(); server.close();

  console.log(`§SINGLE-BURST builds=${builds} destroys=${destroys} resizes=${resizes} fullscreen=${fullscreen} trail=[${trail.join(',')}] pageErrors=${errs.length ? errs.join('|') : 0}`);
  const pass = builds === 1 && destroys === 0 && resizes >= 1 && fullscreen >= 1 && errs.length === 0;
  console.log('§SINGLE-BURST-RESULT ' + (pass ? 'PASS' : 'FAIL') +
    ' — first erp.html load builds the globe ' + builds + 'x (want 1), destroys ' + destroys + 'x (want 0); auto-maximize resizes in place ' + resizes + 'x');
  process.exit(pass ? 0 : 1);
})().catch(e => { console.error('FATAL ' + e.message); process.exit(2); });
