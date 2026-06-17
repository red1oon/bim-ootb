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
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
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
  await page.goto(`http://localhost:${port}/idempiere.html?client=garden&window=167`, { waitUntil: 'networkidle' });

  // ── login: pick the first enabled user → submit (defaults) ──
  await page.waitForSelector('#idmp-login-users .idmp-login-user:not(.disabled)', { timeout: 15000 });
  await page.click('#idmp-login-users .idmp-login-user:not(.disabled)');
  await page.waitForSelector('#idmp-login-ok', { timeout: 5000 });
  await page.click('#idmp-login-ok');

  // ── wait for the deep-linked window to open + records to render ──
  await page.waitForSelector('[data-ad-table]', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1200);

  // ── open the Kanban pill (it lives in the ⋯ overflow = hidden; PillBuilder binds on 'pointerup', so
  //    dispatch the pointer sequence directly — a programmatic tap works regardless of visibility) ──
  await page.waitForSelector('#pill-kanban', { timeout: 8000, state: 'attached' });
  await page.evaluate(() => { const b = document.getElementById('pill-kanban'); if (!b) return;
    b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); });
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
  // S6 LENS-SWAP (GRAND_LANE): the drag no longer signs to the kanban's OWN op-log (window.ERP/_kanbanProj).
  //   It rides the SHARED _fsmCtx → __crud.process → commitProcess (the SAME signed lane the grid DocAction
  //   bar uses, J5). So the assertion moved off window.ERP.verify() onto __crud.readTip (the shared sidecar).
  let drag = { moved: false };
  if (mounted && mounted.cards) {
    drag = await page.evaluate(() => new Promise((resolve) => {
      const b = window.__idmpKanban.board;
      const edges = [];
      for (const c of b.cards) { const z = b.dropZones[c.status] || []; for (const e of z) edges.push({ key: c.key, to: e.toStatus }); }
      let i = 0;
      const tryNext = () => {
        if (i >= edges.length) return resolve({ moved: false, note: 'no AdDocFsm-legal edge among cards' });
        const e = edges[i++], card = b.cards.find(x => x.key === e.key);
        window.__idmpKanban._onDrop(e.key, e.to);
        setTimeout(() => {
          const status = (b.cards.find(x => x.key === e.key) || {}).status;
          if (status === e.to) return resolve({ key: e.key, id: card && card.id, table: card && card.table, to: e.to, status: status });
          tryNext();
        }, 120);
      };
      tryNext();
    }));
  }
  await page.waitForTimeout(700);   // let the async __crud.process commitGroup settle + persist to the shared sidecar
  // the SHARED sidecar tip (hydrate the lazy kernel sidecar first) — the drag's truth now lives HERE, not _kanbanProj.
  const sharedTip = drag.id != null ? await page.evaluate((arg) => new Promise((res) => {
    const c = window.__crud; if (!c || !c.readTip) return res('no-crud');
    const t = String(arg.t).toLowerCase();
    if (typeof c.withSidecar === 'function') c.withSidecar(() => res(c.readTip(t, arg.i)));
    else res(c.readTip(t, arg.i));
  }), { t: drag.table, i: drag.id }) : null;
  const writeLog = logs.find(l => l.includes('§KANBAN-WRITE ok') && l.includes('via=__crud.process')) || '(none)';
  const committed = logs.find(l => l.includes('§CRUD process committed') && l.includes('verifyChain=ok')) || '(none)';
  console.log('§KANBAN-WRITE ' + JSON.stringify(drag) + ' sharedTip=' + sharedTip);
  console.log('  ' + writeLog);
  console.log('  ' + committed);

  await page.screenshot({ path: path.join(__dirname, 'idmp_kanban.png') });

  const pass = !!mounted && mounted.cards > 0 && /window.ERP published/.test(seam) &&
    drag && drag.status === drag.to && String(sharedTip) === String(drag.to) &&
    /via=__crud\.process/.test(writeLog) && /verifyChain=ok/.test(committed) && errs.length === 0;
  console.log('§IDMP-KANBAN-RESULT ' + (pass ? 'PASS' : 'FAIL') + ' pageErrors=' + (errs.length ? errs.slice(0,2).join('|') : 0));

  await browser.close(); server.close(); process.exit(pass ? 0 : 1);
})().catch(e => { console.error('PROBE-ERR', e); server.close(); process.exit(2); });
