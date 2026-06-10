// ⚠ DO NOT REMOVE — Scope guard
// Scope: §-witness for the CONCEPT-UI follow-up —
//   W-SUFFIX  — the Glassbowl + Gravity LAUNCHER pills on erp.html carry a "<Name> — CONCEPT" hover title
//               (pills.json title= → erp_pills.js → pill_builder.js btn.title=act.title||act.id).
//   W-WM-TILE — #conceptWM on glassbowl.html is a repeating diagonal SVG tile (background-image set,
//               background-repeat:repeat), still pointer-events:none + click-through (a center click hits
//               the content behind it, not the watermark) — no perf/interaction cost.
//   §-log first — READ tests/poc_concept_suffix.log before any conclusion.
// Run:  node tests/poc_concept_suffix.js 2>&1 | tee tests/poc_concept_suffix.log   (cwd = bim-ootb/erp)
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const MIME = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json',
  '.db':'application/octet-stream', '.png':'image/png', '.css':'text/css', '.wasm':'application/wasm' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/erp.html';
  fs.readFile(path.join(ROOT, p), (e, buf) => {
    if (e) { res.writeHead(404); res.end('404 ' + p); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
    res.end(buf);
  });
});

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const browser = await chromium.launch();

  // ── erp.html — launcher pill tooltips ──
  let page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(`http://localhost:${port}/erp.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);                                   // DB + pills settle
  const titles = await page.evaluate(() => {
    function t(id){ var b=document.getElementById('pill-'+id); return b?b.getAttribute('title'):'(missing)'; }
    return { glassbowl: t('glassbowl'), gravity: t('gravity'), home: t('home') };  // home = control: still its id
  });
  console.log('§SUFFIX-WITNESS titles=' + JSON.stringify(titles) + ' pageErrors=' + (errs.length?errs.join('|'):0));
  await page.screenshot({ path: path.join(__dirname, 'concept_suffix_erp_1280.png') });
  await page.close();

  // ── glassbowl.html — tiled watermark ──
  page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(`http://localhost:${port}/glassbowl.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  const wm = await page.evaluate(() => {
    var w = document.getElementById('conceptWM'); if (!w) return null;
    var cs = getComputedStyle(w);
    var cx = Math.round(innerWidth/2), cy = Math.round(innerHeight/2);
    var hit = document.elementFromPoint(cx, cy);
    return {
      hasBg: /url\(/.test(cs.backgroundImage) && /svg/.test(cs.backgroundImage),
      repeat: cs.backgroundRepeat, pointerEvents: cs.pointerEvents,
      isTiledText: /CONCEPT/i.test(decodeURIComponent(cs.backgroundImage)),
      clickThrough: (hit !== w), centerHit: hit ? (hit.id || hit.tagName) : null
    };
  });
  console.log('§WM-TILE-WITNESS ' + JSON.stringify(wm));
  await page.screenshot({ path: path.join(__dirname, 'concept_tiled_glassbowl_1280.png') });
  await browser.close();
  server.close();

  const suffixOk = titles.glassbowl === 'Glassbowl — CONCEPT' && titles.gravity === 'Gravity — CONCEPT' && errs.length === 0;
  const wmOk = wm && wm.hasBg && wm.repeat === 'repeat' && wm.pointerEvents === 'none' && wm.isTiledText && wm.clickThrough;
  console.log('§CONCEPT-RESULT ' + ((suffixOk && wmOk) ? 'PASS' : 'FAIL') + ' suffixOk=' + suffixOk + ' wmTileOk=' + !!wmOk);
  process.exit((suffixOk && wmOk) ? 0 : 1);
})();
