// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser §-witness for ZOOM ACROSS v2 CONSUME side (ZOOM_ACROSS_SCOPE_SESSION §SPEC, witness leg 4).
//   PROVES, on the real viewer + the bundled GardenWorld warehouse model:
//     A — cold-open viewer.html?...&find=<IFC class> auto-runs the INCUMBENT Find on that class (no taps):
//         §ZOOM-SCOPE kind=class matches=N (N>0, the real elements_meta count for that class).
//     B — the SAME run lights the matches with the Find highlighter (A.focusElement → §FOCUS_ELEM lit>0),
//         i.e. Find associates + selects — NOT a parallel highlighter.
//     C — the guid-set form (applyFindScope('g1,g2')) focuses those exact elements directly.
//   All assertions DOM/console only. 0 pageerrors. §-log first — READ poc_zoom_scope_live.log before concluding.
// Run:  cd <repo>/viewer && node tests/poc_zoom_scope_live.js   (exit 0 = PASS)
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const MIME = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json',
  '.db':'application/octet-stream', '.png':'image/png', '.css':'text/css', '.wasm':'application/wasm' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/viewer/viewer.html';
  fs.readFile(path.join(ROOT, p), (e, buf) => {
    if (e) { res.writeHead(404); res.end('404 ' + p); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(buf);
  });
});
const log = [], errs = []; let fails = 0;
function S(m) { log.push(m); console.log(m); }
function verdict(ok, label, detail) { if (!ok) fails++; S('   ' + (ok ? '🟢' : '🔴') + ' ' + label + (detail ? ' — ' + detail : '')); }
const seen = re => log.some(l => re.test(l));
const grab = re => { for (const l of log) { const m = re.exec(l); if (m) return m; } return null; };

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('console', m => log.push('  [console] ' + m.text()));
  page.on('pageerror', e => { errs.push(String(e)); log.push('  [pageerror] ' + e); });

  S('§W-ZOOM-ACROSS-SCOPE (viewer consume) — ?find=<IFC class> auto-runs Find + highlights (GardenWorld warehouse)');
  const SCOPE = 'IfcBuildingElementProxy'; // a real class in warehouse_gardenworld.db AND a Hospital project line
  await page.goto('http://127.0.0.1:' + port +
    '/viewer/viewer.html?db=/buildings/warehouse_gardenworld.db&bld=GardenWorld&find=' + SCOPE,
    { waitUntil: 'networkidle' });

  // wait for the model db + the lazily-loaded Find consume seam (applyFindScope is added by NavigateFind.init,
  // which the boot ?find handler triggers via loadNavigate). runSearch only needs db; geometry is best-effort.
  let ready = false;
  for (let i = 0; i < 45 && !ready; i++) {
    await page.waitForTimeout(1000);
    try { ready = await page.evaluate(() => !!(window.APP && window.APP.db && typeof window.APP.applyFindScope === 'function')); } catch (e) {}
  }
  verdict(ready, 'viewer model db + A.applyFindScope ready (Navigate lazy-loaded by ?find)');

  // A/B — the boot ?find handler should have auto-applied the scope. Give it a beat, then assert.
  await page.waitForTimeout(3000);
  // §BUGFIX 2026-07-13: the log line grew a "route=find|tm " prefix (§ARCH-OWNERSHIP, TM-if-open else
  // Find) after this regex was written — it never matched since, so A/A2/C below were silently absent
  // (not failing loudly; `grab` just returns null and cls[2]>0 skipped). Widened to tolerate the prefix.
  const cls = grab(/§ZOOM-SCOPE route=\w+ kind=class scope="([^"]+)" matches=(\d+)/);
  verdict(!!cls && cls[1] === SCOPE && Number(cls[2]) > 0, 'A — ?find auto-ran Find on the class, matches>0', cls ? (cls[1] + ' matches=' + cls[2]) : 'absent');
  verdict(seen(/§FOCUS_ELEM guids=\d+ lit=[1-9]/), 'B — matches lit via the Find highlighter (focusElement), not a parallel one');
  // §BUGFIX 2026-07-13 (user report: "the ERP drawer at the bottom does not appear" after Zoom Across) —
  // A.focusElement only does the 3D highlight; #find-selected (cost + › ERP push + iDempiere ↗ links) was
  // never revealed by this boot path (every OTHER selection path — item click, storey/disc group tap —
  // already did). See navigate_find.js _revealSelectedBar, wired into both applyFindScope branches.
  const barVisible = await page.evaluate(() => { var e = document.getElementById('find-selected'); return !!e && getComputedStyle(e).display !== 'none'; });
  const barText = await page.evaluate(() => { var e = document.getElementById('find-selected-text'); return e ? e.textContent : ''; });
  verdict(barVisible && barText.length > 0, 'D — #find-selected (the ERP drawer) is REVEALED with a label after a class scope lands', 'visible=' + barVisible + ' text="' + barText + '"');

  // expected count cross-check against the raw DB (non-invent: the fold must equal the data)
  const dbCount = await page.evaluate((c) => {
    try { const r = window.APP.db.exec("SELECT COUNT(*) FROM elements_meta WHERE ifc_class=?", [c]); return r.length ? Number(r[0].values[0][0]) : -1; } catch (e) { return -2; }
  }, SCOPE);
  verdict(!!cls && Number(cls[2]) === dbCount, 'A2 — matches == raw elements_meta count for the class (fold==data)', 'find=' + (cls ? cls[2] : '?') + ' db=' + dbCount);

  // C — guid-set form: pull two real guids of the class, focus them directly.
  const guids = await page.evaluate((c) => {
    try { const r = window.APP.db.exec("SELECT guid FROM elements_meta WHERE ifc_class=? LIMIT 2", [c]); return r.length ? r[0].values.map(v => v[0]) : []; } catch (e) { return []; }
  }, SCOPE);
  if (guids.length >= 1) {
    await page.evaluate((g) => window.APP.applyFindScope(g.join(',')), guids);
    await page.waitForTimeout(800);
  }
  const gv = grab(/§ZOOM-SCOPE route=\w+ kind=guids n=(\d+) lit=(\d+)/);
  verdict(!!gv && Number(gv[1]) === guids.length && Number(gv[2]) > 0, 'C — guid-set scope focuses those exact elements', gv ? ('n=' + gv[1] + ' lit=' + gv[2]) : 'absent');
  const barVisible2 = await page.evaluate(() => { var e = document.getElementById('find-selected'); return !!e && getComputedStyle(e).display !== 'none'; });
  const barText2 = await page.evaluate(() => { var e = document.getElementById('find-selected-text'); return e ? e.textContent : ''; });
  verdict(guids.length === 0 || (barVisible2 && barText2.length > 0), 'E — #find-selected also revealed after a guid-set scope lands', 'visible=' + barVisible2 + ' text="' + barText2 + '"');

  verdict(errs.length === 0, '0 pageerrors', errs.length ? errs.slice(0, 3).join(' | ') : 'clean');

  const pass = fails === 0;
  S('\n§W-ZOOM-ACROSS-SCOPE (viewer) ' + (pass ? 'PASS' : 'FAIL') + ' (fails=' + fails + ')');
  fs.writeFileSync(path.join(__dirname, 'poc_zoom_scope_live.log'), log.join('\n'));
  await browser.close(); server.close();
  process.exit(pass ? 0 : 1);
})();
