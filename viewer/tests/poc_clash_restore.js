// ⚠ DO NOT REMOVE — browser §-witness for the CLASH restore field (HISTORY_KNOB_SIGNAL_TAP §LOCKED-FIELD).
// ISSUE (user, live): "Clash shows the zoom-to but WITHOUT the clash pair and Clash panel." The clash dot
//   restored only camera+ambient (keys=…cam,section,palette) — no pair highlight, no list panel.
// FIX: field('clash', read, write) in universal_history.js — read() stamps the inspected pair into every
//   moment's view; write(pair) re-opens the list panel (from persisted _currentClashes, no re-detection) and
//   _flyToClash → pair highlight + fly. recordEvent self-suppresses because applyView holds isApplying()=true.
// PROVES (against the REAL field registered by _wireTap on the harness, with A clash-API stubbed):
//   1. clash field registered (currentView carries clash:{a,b} when a pair is inspected).
//   2. applyView({clash}) → _flyToClash called with the GUID-matched idx (pair restored) + isApplying()=true
//      during it (so the inner recordEvent would NOT mint a new dot — no scrub pollution).
//   3. panel re-shown: when the list was dismissed (_clashRevealActive=false), write re-calls _revealClashes
//      BEFORE _flyToClash (Clash panel comes back).
//   4. write(null) on a non-clash moment dismisses the viz (keepMatrix=true).
//   §-log first — READ tests/poc_clash_restore.log before any conclusion (exit code is NOT evidence).
// Run:  node viewer/tests/poc_clash_restore.js 2>&1 | tee viewer/tests/poc_clash_restore.log   (cwd = bim-ootb)
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  fs.readFile(path.join(ROOT, p), (e, buf) => { if (e) { res.writeHead(404); res.end('404 ' + p); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(buf); });
});
const PASS = [], FAIL = [];
function check(n, c, d) { (c ? PASS : FAIL).push(n); console.log((c ? '✅ ' : '❌ ') + n + (d ? ' — ' + d : '')); }

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const errs = [];
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(`http://localhost:${port}/viewer/tests/histbar_viewer_harness.html`, { waitUntil: 'networkidle' });
  await page.evaluate(() => window.__ready);
  await page.waitForTimeout(200);

  // Stub the clash API on the REAL window.A the harness exposes; record calls.
  const r = await page.evaluate(() => {
    var A = window.A;
    var calls = { fly: [], reveal: 0, dismiss: 0, applyingDuringFly: null };
    A._currentClashRules = { display: {} };
    A._currentClashes = [ ['GUID_A', 'GUID_B', 0,0,0,0,0,0, 0.058], ['GUID_C', 'GUID_D', 0,0,0,0,0,0, 0.064] ];
    A._clashRevealActive = true;
    A._currentClashViewIdx = 1;                              // user inspected the 2nd clash (GUID_C/GUID_D)
    A._flyToClash = function (idx) { calls.fly.push(idx); calls.applyingDuringFly = !!(window.HistoryTap.isApplying && window.HistoryTap.isApplying()); };
    A._revealClashes = function () { calls.reveal++; };
    A._dismissClashes = function () { calls.dismiss++; };

    // (1) the inspected pair is stamped into the live view
    var view = window.HistoryTap.currentView();

    // (2) restore that pair → _flyToClash(idx=1), isApplying must be true during it
    window.HistoryTap.applyView({ clash: { a: 'GUID_C', b: 'GUID_D' } }, 'Clash 0.064m');

    // (3) panel dismissed → restore must re-show it (reveal) BEFORE fly
    A._clashRevealActive = false;
    window.HistoryTap.applyView({ clash: { a: 'GUID_A', b: 'GUID_B' } }, 'Clash 0.058m');
    var revealedBeforeFly = calls.reveal === 1 && calls.fly.length === 2 && calls.fly[1] === 0;

    // (4) a non-clash moment clears the viz
    A._clashRevealActive = true;
    window.HistoryTap.applyView({ clash: null }, 'plain');

    return { stampedPair: view.clash, calls: calls, revealedBeforeFly: revealedBeforeFly };
  });

  check('clash field registered (pair stamped into view)', r.stampedPair && r.stampedPair.a === 'GUID_C' && r.stampedPair.b === 'GUID_D', JSON.stringify(r.stampedPair));
  check('restore → _flyToClash GUID-matched idx (pair restored)', r.calls.fly[0] === 1, 'flyIdx=' + r.calls.fly[0]);
  check('recordEvent suppressed (isApplying true during fly)', r.calls.applyingDuringFly === true);
  check('dismissed panel re-shown before fly (Clash panel back)', r.revealedBeforeFly, 'reveal=' + r.calls.reveal + ' fly=[' + r.calls.fly + ']');
  check('non-clash moment dismisses viz', r.calls.dismiss === 1, 'dismiss=' + r.calls.dismiss);
  check('no page errors', errs.length === 0, errs.join(' | '));

  console.log('§W-CLASH SUMMARY pass=' + PASS.length + ' fail=' + FAIL.length);
  await browser.close(); server.close();
  process.exit(FAIL.length ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
