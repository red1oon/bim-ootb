// ⚠ DO NOT REMOVE — Scope guard
// Scope: prompts/WORLD_HISTORY_BROKEN_RECALL.md Part 2, user report 2026-07-06 "the timeline is not
//   intuitive spawning more dots on undo". Root cause (found this session): common/history_bar.js's
//   FORK-DON'T-WIPE coalesce gate only fires at a TRUE tip (_cursorNode.kids.length===0). After undo()
//   moves the cursor to a parent that already owns a kid, the very next push — even a passive,
//   read-only tap-drained crumb (NAVIGATE/XRAY/FOCUS/PICK, never a model mutation) — hits
//   `forked = kids.length > 0` and mints a brand-new sibling dot. That's the "spawns more dots on
//   undo" report: undo, then merely look around, and the timeline grows.
// Fix under test: common/history_bar.js push() now refuses to fork for `entry.readonly` pushes when
//   the cursor already has a kid (§HIST_DROP reason=readonly-post-undo) — a real edit (readonly:false)
//   still legitimately forks a new git-like universe, unchanged.
// This drives the REAL production stack (kernel_ops → universal_history's commitOp wrapper →
// history_bar's push/undo) and the REAL sniffer path (console.log('§NAVIGATE ...') → history_tap's
// sniff() → feedCrumb → onFeed → _drainTap → HB.push), not a reimplementation of the bug.
// §-log first — READ tests/witness_undo_dot_spawn.log before any conclusion (exit code is NOT evidence).
// Run:  node viewer/tests/witness_undo_dot_spawn.js 2>&1 | tee viewer/tests/witness_undo_dot_spawn.log
'use strict';
const puppeteer = require(require('os').homedir() + '/bim-compiler/node_modules/puppeteer');
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
const sleep = ms => new Promise(r => setTimeout(r, ms));

const PASS = [], FAIL = [];
function check(n, c) { (c ? PASS : FAIL).push(n); console.log((c ? '✅ ' : '❌ ') + n); }

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const logs = [], errs = [];
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  page.on('console', m => logs.push(m.text()));
  page.on('pageerror', e => errs.push(e.message));

  try {
    await page.goto(`http://localhost:${port}/viewer/tests/histbar_viewer_harness.html`, { waitUntil: 'networkidle0' });
    await page.evaluate(() => window.__ready);
    await sleep(200);

    // Two real edits (GRID_MOVE): node1 (root child, no fork) → node2 (child of node1, no fork).
    await page.evaluate(() => {
      const UH = window.UniversalHistory, KO = window.KernelOps, db = window.A.db;
      UH.setEnabled(true);
      KO.commitOp(db, 'GRID_MOVE', { axis: 'X', label: '1', from: 0, to: 1000, cascade: [] });
      KO.commitOp(db, 'GRID_MOVE', { axis: 'X', label: '3', from: 1000, to: 3000, cascade: [] });
      UH.open();
    });
    await sleep(150);

    const countDots = () => page.evaluate(() => document.querySelectorAll('#hist-marks > button').length);
    const base = await countDots();
    check('Baseline: 2 real edits → 2 dots, no fork yet', base === 2);

    // Real user path: Ctrl+Z-equivalent (UniversalHistory.undo() — the same call scene.js's
    // Backspace handler makes) moves the cursor back to node1, which already owns node2 as a kid.
    logs.length = 0;
    await page.evaluate(() => window.UniversalHistory.undo());
    await sleep(100);
    check('§HIST_UNDO fired (real undo, model cursor moved)', logs.some(l => /§HIST_UNDO/.test(l)));

    // The reported bug trigger: NOT an edit — just looking around. A real feature elsewhere would
    // console.log('...§NAVIGATE ...') / '...§XRAY ...'; the sniffer (history_tap.js sniff()) picks it
    // up with zero extra wiring and drains it into a read-only dot via the exact production path.
    logs.length = 0;
    await page.evaluate(() => {
      console.log('[TEST] §NAVIGATE panned to storey 2');
      console.log('[TEST] §XRAY toggled on');
    });
    await sleep(150);
    const afterLookAround = await countDots();
    check('Passive look-around after undo → NO §HIST_FORK', !logs.some(l => /§HIST_FORK/.test(l)));
    check('Passive look-around after undo → §HIST_DROP reason=readonly-post-undo', logs.some(l => /§HIST_DROP.*reason=readonly-post-undo/.test(l)));
    check('Passive look-around after undo → dot count UNCHANGED (2, not 3+)', afterLookAround === base);

    // Control: a REAL edit after the same undo must STILL fork (git-like semantics for genuine
    // divergence are intentional and must survive this fix — only read-only crumbs are silenced).
    logs.length = 0;
    await page.evaluate(() => {
      const KO = window.KernelOps, db = window.A.db;
      KO.commitOp(db, 'GRID_MOVE', { axis: 'X', label: '5', from: 3000, to: 5000, cascade: [] });
    });
    await sleep(150);
    const afterRealEdit = await countDots();
    check('A REAL edit after undo still forks (§HIST_FORK)', logs.some(l => /§HIST_FORK/.test(l)));
    check('A REAL edit after undo still adds a dot (3, sibling universe)', afterRealEdit === base + 1);

    check('No page errors', errs.length === 0);
  } finally {
    await browser.close(); server.close();
  }

  console.log('\n— key §-lines —');
  logs.filter(l => /§HIST_/.test(l)).forEach(l => console.log('   ' + l));
  if (errs.length) console.log('ERRORS: ' + errs.join(' | '));
  console.log(`\nRESULT ${PASS.length} pass / ${FAIL.length} fail`);
  if (FAIL.length) { console.log('FAILED: ' + FAIL.join(' | ')); process.exit(1); }
  process.exit(0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
