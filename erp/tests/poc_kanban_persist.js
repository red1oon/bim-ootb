// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser §-witness that a kanban drag SURVIVES RELOAD (gap #2 — durability).
//   THE CLAIM (write-path spine: persist the op-LOG, replay on boot, read-the-tip): a drag commits a signed
//   op AND persists the projection to IDB; a fresh page load restores it and the board shows the edit — not the
//   stale bundle status. Proves writes are durable, not in-memory-only.
//     1. §KANBAN-WRITE — drag commits (as poc_kanban_write proves) + §KANBAN-PERSIST saves the blob to IDB.
//     2. §KANBAN-RESTORE — RELOAD (same origin/context → IDB persists) restores the op-log; foldDocStatus
//        overlays the tip (tipOverlaid>=1) and the dragged card appears in its NEW column with NO re-drag.
//   NON-INVENT: same real doc, real wfmc edge; the post-reload status comes from the persisted op-log, nowhere else.
//   §-log first — READ poc_kanban_persist.log before any conclusion.
// Run:  node tests/poc_kanban_persist.js 2>&1 | tee tests/poc_kanban_persist.log   (cwd = bim-ootb/erp)
'use strict';
const { chromium } = require(__dirname + '/../../tests/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const MIME = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json', '.db':'application/octet-stream', '.wasm':'application/wasm', '.css':'text/css' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/kanban_lens.html';
  fs.readFile(path.join(ROOT, p), (e, buf) => {
    if (e) { res.writeHead(404); res.end('404 ' + p); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(buf);
  });
});
const ready = (page) => page.waitForFunction(() => window.__kanban && window.ERP && window.ERP.dispatch, { timeout: 20000 });

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const url = `http://localhost:${port}/kanban_lens.html`;
  const logs = [], errs = [];
  const browser = await chromium.launch();
  const context = await browser.newContext();   // ONE context → IDB persists across the reload
  const page = await context.newPage();
  page.on('console', m => logs.push(m.text()));
  page.on('pageerror', e => errs.push(e.message));

  // ── session 1: drag a real card to a legal stage, persist ──
  await page.goto(url, { waitUntil: 'networkidle' }); await ready(page).catch(() => {});
  const pick = await page.evaluate(() => {
    const b = window.__kanban.board;
    for (const c of b.cards) { const z = b.dropZones[c.status] || []; if (z.length) return { key: c.key, table: c.table, id: c.id, from: c.status, to: z[0].toStatus }; }
    return null;
  });
  console.log('§KANBAN-PICK ' + JSON.stringify(pick));
  if (pick) await page.evaluate((pk) => window.__kanban._onDrop(pk.key, pk.to), pick);
  // wait for the persist to land in IDB
  await page.waitForFunction(() => window.__persistDone === true || true, { timeout: 1000 }).catch(() => {});
  await page.waitForTimeout(800);
  const persistLog = logs.find(l => l.includes('§KANBAN-PERSIST saved')) || '(no persist)';
  console.log('§KANBAN-PERSIST ' + persistLog);

  // ── session 2: RELOAD (same context → IDB survives) — the edit must come back with NO drag ──
  logs.length = 0;
  await page.reload({ waitUntil: 'networkidle' }); await ready(page).catch(() => {});
  await page.waitForTimeout(500);
  const restoreLog = logs.find(l => l.includes('§KANBAN-RESTORE')) || '(no restore)';
  const foldLog = logs.find(l => l.includes('foldDocStatus')) || '(no fold)';
  const afterReload = await page.evaluate((pk) => {
    const card = window.__kanban.board.cards.find(c => c.key === pk.key);
    const col = document.querySelector('.kanban-col[data-status="' + pk.to + '"]');
    const inTargetCol = !!(col && Array.from(col.querySelectorAll('.kanban-card')).some(el => el.dataset.key === pk.key));
    return { status: card ? card.status : null, inTargetCol: inTargetCol };
  }, pick);
  console.log('§KANBAN-RESTORE ' + restoreLog);
  console.log('  ' + foldLog);
  console.log('§KANBAN-PERSIST-CHECK card=' + pick.key + ' expected=' + pick.to + ' afterReloadStatus=' + afterReload.status + ' inTargetCol=' + afterReload.inTargetCol);

  await page.screenshot({ path: path.join(__dirname, 'kanban_persist.png') });

  const pass = !!pick && /saved bytes=/.test(persistLog) && /§KANBAN-RESTORE ops from IDB/.test(restoreLog) &&
    /tipOverlaid=[1-9]/.test(foldLog) && afterReload.status === pick.to && afterReload.inTargetCol === true && errs.length === 0;
  console.log('§KANBAN-PERSIST-RESULT ' + (pass ? 'PASS' : 'FAIL') + ' pageErrors=' + (errs.length ? errs.join('|') : 0));

  await browser.close(); server.close(); process.exit(pass ? 0 : 1);
})().catch(e => { console.error('PROBE-ERR', e); server.close(); process.exit(2); });
