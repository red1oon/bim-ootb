// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-module §-witness for prompts/HISTORY_KNOB_DIAL.md — the REWORKED viewer bottom bar (the
//   amp-knob is SCRAPPED). PROVES:
//     1. The bar mounts as `‹ dots ›`: #hist-back (‹) + #hist-fwd (›) present; the knob is GONE
//        (#hist-knob AND #hist-knob-viewer absent).
//     2. Two real GRID_MOVE ops land in kernel_ops (2 rows, 0 undone) → 2 dots. Baseline captured.
//     3. Clicking a history DOT = READ-ONLY: §HIST_VIEWNAV opLogMutated=NO fires, op-log UNCHANGED.
//     4. The ‹ arrow = same read-only view step (§HIST_VIEWNAV), op-log still unchanged.
//     5. FOCUS model: focusing the bar adds .hist-focused; an ArrowLeft keydown ON the bar steps it
//        (another §HIST_VIEWNAV) — proving arrows act only via the focused bar.
//     6. MODEL undo (UH.undo — the kept Ctrl+Z/Backspace path) STILL flips a signed op (undone 0→1).
//     7. DE-DUP: a 2nd BUILDING_OPEN of the same building at the tip is skipped (§HIST_DEDUP) — no pile-up.
//   §-log first — READ tests/poc_histbar_viewer.log before any conclusion (exit code is NOT evidence).
// Run:  node viewer/tests/poc_histbar_viewer.js 2>&1 | tee viewer/tests/poc_histbar_viewer.log   (cwd = bim-ootb)
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

  await page.goto(`http://localhost:${port}/viewer/tests/histbar_viewer_harness.html`, { waitUntil: 'networkidle' });
  await page.evaluate(() => window.__ready);
  await page.waitForTimeout(300);

  // two real model ops + open the bar
  await page.evaluate(async () => {
    const UH = window.UniversalHistory, KO = window.KernelOps, db = window.A.db;
    UH.setEnabled(true); UH.setDepth('max');
    KO.commitOp(db, 'GRID_MOVE', { axis: 'X', label: '1', from: 0, to: 1000, cascade: [] });
    KO.commitOp(db, 'GRID_MOVE', { axis: 'X', label: '3', from: 1000, to: 3000, cascade: [] });
    UH.open();
  });
  await page.waitForTimeout(150);

  const dom = await page.evaluate(() => ({
    hasBack: !!document.getElementById('hist-back'),
    hasFwd: !!document.getElementById('hist-fwd'),
    hasKnob: !!(document.getElementById('hist-knob') || document.getElementById('hist-knob-viewer')),
    barFocusable: (function () { var b = document.getElementById('universal-hist-btns'); return !!b && b.tabIndex === 0; }),
    dots: document.querySelectorAll('#hist-marks > button').length
  }));
  check('Bar mounts as ‹ dots › — #hist-back present', dom.hasBack);
  check('Bar mounts as ‹ dots › — #hist-fwd present', dom.hasFwd);
  check('Knob SCRAPPED — #hist-knob / #hist-knob-viewer absent', !dom.hasKnob);
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

  // 4. ‹ arrow → read-only step
  const nViewNavBefore = logs.filter(l => /§HIST_VIEWNAV/.test(l)).length;
  await page.evaluate(() => { document.getElementById('hist-back').dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); });
  await page.waitForTimeout(80);
  const afterArrow = await opState();
  check('‹ arrow → another §HIST_VIEWNAV (read-only step)', logs.filter(l => /§HIST_VIEWNAV/.test(l)).length > nViewNavBefore);
  check('‹ arrow → op-log still UNCHANGED', afterArrow.rows === base.rows && afterArrow.undone === base.undone);

  // 5. FOCUS model: focus the bar → .hist-focused; ArrowLeft keydown ON the bar steps it.
  const focusRes = await page.evaluate(() => {
    var b = document.getElementById('universal-hist-btns');
    b.focus(); b.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    var lit = b.classList.contains('hist-focused');
    b.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    return { lit: lit, focusable: b.tabIndex === 0 };
  });
  await page.waitForTimeout(60);
  check('Focus → blue highlight class .hist-focused', focusRes.lit);
  check('Bar is focusable (tabindex=0)', focusRes.focusable);
  check('ArrowRight on focused bar → §HIST_VIEWNAV', logs.filter(l => /§HIST_VIEWNAV/.test(l)).length > nViewNavBefore + 1);

  // 6. MODEL undo still flips a real op (the kept Ctrl+Z/Backspace path)
  await page.evaluate(() => window.UniversalHistory.undo());
  await page.waitForTimeout(120);
  const afterUndo = await opState();
  check('MODEL undo() still flips a signed op (undone 0→1)', afterUndo.undone === 1);

  // 7. DE-DUP: a 2nd BUILDING_OPEN of the same building at the tip is skipped.
  await page.evaluate(() => {
    const KO = window.KernelOps, db = window.A.db;
    KO.commitOp(db, 'BUILDING_OPEN', { name: 'Hospital' });
    KO.commitOp(db, 'BUILDING_OPEN', { name: 'Hospital' });   // duplicate — must be skipped
  });
  await page.waitForTimeout(100);
  check('Duplicate BUILDING_OPEN de-duped (§HIST_DEDUP)', logs.some(l => /§HIST_DEDUP BUILDING_OPEN .*Hospital.* skipped/.test(l)));

  check('No page errors', errs.length === 0);

  await browser.close(); server.close();
  console.log('\n— key §-lines —');
  logs.filter(l => /§HIST_VIEWNAV|§HIST_UNDO|§HIST_BAR|§HIST_DEDUP/.test(l)).forEach(l => console.log('   ' + l));
  if (errs.length) console.log('ERRORS: ' + errs.join(' | '));
  console.log(`\nRESULT ${PASS.length} pass / ${FAIL.length} fail`);
  if (FAIL.length) { console.log('FAILED: ' + FAIL.join(' | ')); process.exit(1); }
  process.exit(0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
