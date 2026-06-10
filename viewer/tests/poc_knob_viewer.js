// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-module §-witness for prompts/HISTORY_KNOB_DIAL.md — the dial wired into the VIEWER bar.
//   PROVES (issue: "the old bar wired its dots/back-fwd to undo/redo → FLIPPED kernel ops → looked corrupted"):
//     1. The DIAL mounts on the live bar (#hist-knob-viewer present) and the legacy ↶/↷ buttons are GONE
//        (#hist-back absent) — the dial REPLACED them.
//     2. Two real GRID_MOVE ops land in kernel_ops (2 rows, 0 undone). Baseline captured.
//     3. Clicking a history DOT = READ-ONLY: §HIST_VIEWNAV opLogMutated=NO fires, restoreView runs, and the
//        op-log is UNCHANGED (rows=2, undone=0). The scrubber moved a VIEW cursor, not the model.
//     4. The dial's NAV back tick = same read-only step (§HIST_VIEWNAV), op-log still unchanged.
//     5. MODEL undo (UH.undo, the Ctrl+Z/Backspace path) STILL flips a signed op (undone goes 0→1) — we
//        killed the scrubber's mutation WITHOUT breaking real model undo.
//   §-log first — READ tests/poc_knob_viewer.log before any conclusion (exit code is NOT evidence).
// Run:  node viewer/tests/poc_knob_viewer.js 2>&1 | tee viewer/tests/poc_knob_viewer.log   (cwd = bim-ootb)
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  fs.readFile(path.join(ROOT, p), (e, buf) => {
    if (e) { res.writeHead(404); res.end('404 ' + p); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
    res.end(buf);
  });
});

const PASS = [], FAIL = [];
function check(n, c) { (c ? PASS : FAIL).push(n); console.log((c ? '✅ ' : '❌ ') + n); }

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const logs = [], errs = [];
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('console', m => logs.push(m.text()));
  page.on('pageerror', e => errs.push(e.message));

  await page.goto(`http://localhost:${port}/viewer/tests/knob_viewer_harness.html`, { waitUntil: 'networkidle' });
  await page.evaluate(() => window.__ready);
  await page.waitForTimeout(300);

  // populate two real model ops + open the bar
  await page.evaluate(async () => {
    const UH = window.UniversalHistory, KO = window.KernelOps, db = window.A.db;
    UH.setEnabled(true); UH.setDepth('max');
    KO.commitOp(db, 'GRID_MOVE', { axis: 'X', label: '1', from: 0, to: 1000, cascade: [] });
    KO.commitOp(db, 'GRID_MOVE', { axis: 'X', label: '3', from: 1000, to: 3000, cascade: [] });
    UH.open();
  });
  await page.waitForTimeout(150);

  const dom = await page.evaluate(() => ({
    hasDial: !!document.getElementById('hist-knob-viewer'),
    hasLegacyBack: !!document.getElementById('hist-back'),
    dots: document.querySelectorAll('#hist-marks > button').length
  }));
  check('Dial mounted on the viewer bar (#hist-knob-viewer)', dom.hasDial);
  check('Legacy ↶/↷ buttons removed (#hist-back absent)', !dom.hasLegacyBack);
  check('History dots rendered (2 ops)', dom.dots >= 2);

  const opState = () => page.evaluate(() => {
    const db = window.A.db;
    const r = db.exec("SELECT undone FROM kernel_ops ORDER BY id");
    const vals = r.length ? r[0].values.map(v => v[0]) : [];
    return { rows: vals.length, undone: vals.filter(u => String(u) === '1').length };
  });

  const base = await opState();
  check('Baseline: 2 op rows, 0 undone', base.rows === 2 && base.undone === 0);

  // 3. click a history DOT → read-only view jump (op-log MUST be unchanged)
  await page.evaluate(() => { document.querySelector('#hist-marks > button').dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); });
  await page.waitForTimeout(80);
  const afterDot = await opState();
  check('Dot click → §HIST_VIEWNAV opLogMutated=NO', logs.some(l => /§HIST_VIEWNAV .*opLogMutated=NO/.test(l)));
  check('Dot click → op-log UNCHANGED (read-only)', afterDot.rows === base.rows && afterDot.undone === base.undone);

  // 4. dial nav back tick → read-only step (open the knob first)
  await page.evaluate(() => {
    var d = document.querySelector('#hist-knob-viewer .hk-dot'); if (d) d.click();
    var t = document.querySelector('#hist-knob-viewer [data-tick="back"]');
    if (t) t.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await page.waitForTimeout(80);
  const afterNav = await opState();
  check('Dial nav back → op-log still UNCHANGED', afterNav.rows === base.rows && afterNav.undone === base.undone);

  // 5. MODEL undo still flips a real op (the kept Ctrl+Z/Backspace path)
  await page.evaluate(() => window.UniversalHistory.undo());
  await page.waitForTimeout(120);
  const afterUndo = await opState();
  check('MODEL undo() still flips a signed op (undone 0→1)', afterUndo.undone === 1);

  check('No page errors', errs.length === 0);

  await browser.close(); server.close();
  console.log('\n— key §-lines —');
  logs.filter(l => /§HIST_VIEWNAV|§HIST_UNDO|§HIST_BAR|§KNOB_RENDER/.test(l)).forEach(l => console.log('   ' + l));
  if (errs.length) console.log('ERRORS: ' + errs.join(' | '));
  console.log(`\nRESULT ${PASS.length} pass / ${FAIL.length} fail`);
  if (FAIL.length) { console.log('FAILED: ' + FAIL.join(' | ')); process.exit(1); }
  process.exit(0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
