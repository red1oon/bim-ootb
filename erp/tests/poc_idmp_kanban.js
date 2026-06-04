// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser §-witness that idempiere.html's Kanban pill mounts the REAL draggable board and a
//   drag commits a signed SET_STATUS (gap c — the main renderer, not the standalone lens).
//   THE CLAIM: openKanbanFor now publishes window.ERP (KanbanHost, ctx from the login _session) and mounts
//   KanbanLens over the OPEN window's records (per-row docstatus fold), instead of the old display-only board.
//     1. §SEAM-LIVE — window.ERP published after the Kanban pill opens (engine boot via _session).
//     2. §KANBAN-PILL live — KanbanLens board mounts with real cards from the open Invoice window (8 CO docs).
//     3. §KANBAN-WRITE — a legal drag commits a signed op (chainOk=Y); card moves.
//   NON-INVENT: real ad_seed.db invoices (8×CO), real wfmc edge, the same seam the lens witnesses prove.
//   §-log first — READ poc_idmp_kanban.log before any conclusion.
// Run:  node tests/poc_idmp_kanban.js 2>&1 | tee tests/poc_idmp_kanban.log   (cwd = bim-ootb/erp)
'use strict';
const { chromium } = require(__dirname + '/../../tests/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const MIME = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json', '.db':'application/octet-stream', '.wasm':'application/wasm', '.css':'text/css', '.png':'image/png' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/idempiere.html';
  fs.readFile(path.join(ROOT, p), (e, buf) => {
    if (e) { res.writeHead(404); res.end('404 ' + p); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(buf);
  });
});

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const logs = [], errs = [];
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('console', m => logs.push(m.text()));
  page.on('pageerror', e => errs.push(e.message));

  // Invoice window (8 CO docs in ad_seed.db); ?window opens AFTER login.
  await page.goto(`http://localhost:${port}/idempiere.html?window=167`, { waitUntil: 'networkidle' });

  // ── login: pick the first enabled user → submit (defaults) ──
  await page.waitForSelector('#idmp-login-users .idmp-login-user:not(.disabled)', { timeout: 15000 });
  await page.click('#idmp-login-users .idmp-login-user:not(.disabled)');
  await page.waitForSelector('#idmp-login-ok', { timeout: 5000 });
  await page.click('#idmp-login-ok');

  // ── wait for the deep-linked window to open + records to render ──
  await page.waitForSelector('[data-ad-table]', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1200);

  // ── click the Kanban pill ──
  await page.waitForSelector('.idmp-pill[title="Kanban"]', { timeout: 8000 });
  await page.click('.idmp-pill[title="Kanban"]');
  await page.waitForFunction(() => window.__idmpKanban && window.ERP && window.ERP.dispatch, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(600);

  const seam = logs.find(l => l.includes('§SEAM-LIVE')) || '(no §SEAM-LIVE)';
  const pillLog = logs.find(l => l.includes('§KANBAN-PILL')) || '(no pill log)';
  const mounted = await page.evaluate(() => {
    const b = window.__idmpKanban && window.__idmpKanban.board;
    return b ? { cols: b.columns.length, cards: b.cards.length } : null;
  });
  console.log('§SEAM-LIVE ' + seam);
  console.log('§KANBAN-PILL ' + pillLog + ' :: board=' + JSON.stringify(mounted));

  // ── drive a legal drag (real doc + real wfmc edge) ──
  let drag = { moved: false };
  if (mounted && mounted.cards) {
    drag = await page.evaluate(() => {
      const b = window.__idmpKanban.board;
      for (const c of b.cards) { const z = b.dropZones[c.status] || []; if (z.length) {
        const before = window.ERP.verify().len;
        window.__idmpKanban._onDrop(c.key, z[0].toStatus);
        return { key: c.key, to: z[0].toStatus, status: (b.cards.find(x => x.key === c.key) || {}).status,
                 before: before, after: window.ERP.verify().len, chainOk: window.ERP.verify().chainOk }; } }
      return { moved: false, note: 'no legal edge among cards' };
    });
  }
  const writeLog = logs.find(l => l.includes('§KANBAN-WRITE ok')) || '(none)';
  console.log('§KANBAN-WRITE ' + JSON.stringify(drag));
  console.log('  ' + writeLog);

  await page.screenshot({ path: path.join(__dirname, 'idmp_kanban.png') });

  const pass = !!mounted && mounted.cards > 0 && /window.ERP published/.test(seam) &&
    drag && drag.status === drag.to && drag.chainOk === true && drag.after === drag.before + 1 && errs.length === 0;
  console.log('§IDMP-KANBAN-RESULT ' + (pass ? 'PASS' : 'FAIL') + ' pageErrors=' + (errs.length ? errs.slice(0,2).join('|') : 0));

  await browser.close(); server.close(); process.exit(pass ? 0 : 1);
})().catch(e => { console.error('PROBE-ERR', e); server.close(); process.exit(2); });
