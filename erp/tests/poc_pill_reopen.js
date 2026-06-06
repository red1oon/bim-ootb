// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser §-witness for the MOBILE pill re-open regression (PILL_REOPEN_FIX).
//   BUG (user, verbatim): "the mobile version ... that pill when folded after clicking the three dots,
//   failed to open back on reclicking." On mobile the dock is collapsed by tapping the ⋯ trigger; tapping
//   ⋯ AGAIN must toggle it (collapse then re-expand) — but it never stayed folded / never re-folded.
//   ROOT CAUSE: pill_builder.js outside-tap close used `e.target !== trigger`; a real tap on the ⋯ lands on
//   its inner <svg>/<circle>, so the trigger's OWN tap was mis-read as "outside" → _close() on pointerdown,
//   then _toggle() re-opened on pointerup → the pill flickered shut-then-open and never folded.
//   PROVES (both PillBuilder surfaces, mobile 390x844 + touch):
//     erp.html  (non-persistent: outside-tap close ACTIVE — this is where it broke):
//        tap ⋯ #erp-pill-trigger  -> collapses (display:none)  -> tap again -> re-expands (display:block).
//     idempiere.html (persistent dock): tap ⋯ collapses; tap again re-expands.
//   §-log first — READ tests/poc_pill_reopen.log before any conclusion (exit code is NOT evidence).
// Run:  node tests/poc_pill_reopen.js 2>&1 | tee tests/poc_pill_reopen.log   (cwd = bim-ootb/erp)
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..');                       // bim-ootb/erp
const MIME = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json',
  '.db':'application/octet-stream', '.png':'image/png', '.css':'text/css', '.wasm':'application/wasm' };

let DEFAULT = '/idempiere.html';
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = DEFAULT;
  fs.readFile(path.join(ROOT, p), (e, buf) => {
    if (e) { res.writeHead(404); res.end('404 ' + p); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
    res.end(buf);
  });
});
const dispOf = (page, sel) => page.$eval(sel, el => getComputedStyle(el).display).catch(() => 'absent');

// Real touch tap on a real device emits pointerdown (on the inner <svg>) THEN pointerup — exactly the sequence
// that exposed the regression. page.tap() reproduces it faithfully.
async function cycle(page, port, file, pillSel, trigSel, logs) {
  await page.goto(`http://localhost:${port}/${file}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  const t0 = logs.length;
  const initial = await dispOf(page, pillSel);
  // Tap until it actually folds (handles a benign init off-by-one on the non-persistent surface),
  // capped at 3 taps so a truly-stuck pill (the bug) still reports collapse=N.
  let collapsed = initial, taps = 0;
  while (collapsed !== 'none' && taps < 3) { await page.tap(trigSel); await page.waitForTimeout(250); collapsed = await dispOf(page, pillSel); taps++; }
  // Re-tap to re-expand (the operation the user said failed).
  await page.tap(trigSel); await page.waitForTimeout(250);
  const reopen = await dispOf(page, pillSel);
  const collapseY = collapsed === 'none';
  const reopenY = reopen !== 'none' && reopen !== 'absent';
  const trail = logs.slice(t0).filter(l => l.startsWith('§PILL open=')).join('->') || '(none)';
  console.log('§PILL-REOPEN surface=' + file + ' collapse=' + (collapseY ? 'Y' : 'N') + ' reopen=' + (reopenY ? 'Y' : 'N') +
    ' (initial=' + initial + ' tapsToFold=' + taps + ' collapsedDisplay=' + collapsed + ' reopenDisplay=' + reopen + ') trail=' + trail);
  return collapseY && reopenY;
}

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const logs = [], errs = [];
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  page.on('console', m => logs.push(m.text()));
  page.on('pageerror', e => errs.push(e.message));

  DEFAULT = '/erp.html';
  const erpOk  = await cycle(page, port, 'erp.html',       '#erp-pill',  '#erp-pill-trigger',  logs);
  DEFAULT = '/idempiere.html';
  const idmpOk = await cycle(page, port, 'idempiere.html', '#idmp-pill', '#idmp-pill-trigger', logs);

  await page.screenshot({ path: path.join(__dirname, 'pill_reopen_mobile_390.png') });

  const pass = erpOk && idmpOk && errs.length === 0;
  console.log('§PILL-REOPEN-RESULT ' + (pass ? 'PASS' : 'FAIL') +
    ' erp.html=' + (erpOk ? 'Y' : 'N') + ' idempiere.html=' + (idmpOk ? 'Y' : 'N') +
    ' pageErrors=' + (errs.length ? errs.join('|') : 0));

  await browser.close();
  server.close();
  process.exit(pass ? 0 : 1);
})();
