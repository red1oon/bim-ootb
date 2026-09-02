// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser §-witness for GRAND_LANE S6 / ERP_CRITIC_UX_LANE.md J7-S6 LENS-SWAP — "Kanban drag ==
//   a signed verb; the SAME owned model under a different skin". W-CRITIC-LENS-SWAP.
//   THE CLAIM (the S6 gap, now closed): a Kanban drag no longer signs to its OWN op-log (the old KanbanHost
//   _kanbanProj). It rides the SHARED _fsmCtx → __crud.process → commitProcess → completeFanout → signed
//   commitGroup → persist — the EXACT lane the grid DocAction bar + gear-batch use (J5). So the Kanban board
//   and the grid are ONE owned model over ONE store: a board drag SHOWS on the grid, a grid status SHOWS on
//   the board, and it SURVIVES RELOAD. The visual ring NEVER opens (doctrine §0).
//   PROVES (and HONESTLY logs any gap — a dead-end is logged, never papered):
//     ACT A — KANBAN DRAG IS THE SHARED SIGNED VERB: open the Sales Order window (143) on GardenWorld → open
//        the Kanban → drag a card along a legal edge → §KANBAN-WRITE ok … via=__crud.process store=shared(__crud)
//        (NOT the old window.ERP/_kanbanProj seam) and __crud.readTip(c_order,id) === the dragged-to status (the
//        SHARED kernel sidecar — not _kanbanProj — carries it); the SHARED chain verifies (chainOk=Y).
//     ACT B — THE GRID SEES THE DRAG: leave the Kanban → the grid row for that order reads the new DocStatus
//        (the SAME __crud read-the-tip overlay the form/grid use). Kanban-drag → grid, one store.
//     ACT C — SURVIVES RELOAD + GRID→KANBAN: reload the page → reopen window 143 → the grid row STILL reads the
//        new status (persisted to the shared sidecar) → reopen the Kanban → the card sits in the new-status
//        column (the board folds its tip from __crud.readTip). The board reflects the persisted shared store.
//     0 pageerrors. The ring never opens (no §CRUD ring view=on during the drag).
//   §-log first — READ tests/poc_critic_lensswap_live.log before any conclusion (exit code is NOT evidence).
// Run:  node tests/poc_critic_lensswap_live.js 2>&1 | tee tests/poc_critic_lensswap_live.log   (cwd = bim-ootb/erp)
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const MIME = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json',
  '.db':'application/octet-stream', '.png':'image/png', '.css':'text/css', '.wasm':'application/wasm' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/idempiere.html';
  fs.readFile(path.join(ROOT, p), (e, buf) => {
    if (e) { res.writeHead(404); res.end('404 ' + p); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(buf);
  });
});

async function gotoOrderWindow(page, port) {
  await page.goto(`http://localhost:${port}/idempiere.html?client=garden&window=143`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#idmp-login-users .idmp-login-user:not(.disabled)', { timeout: 15000 });
  await page.click('#idmp-login-users .idmp-login-user:not(.disabled)');
  await page.waitForSelector('#idmp-login-ok', { timeout: 5000 });
  await page.click('#idmp-login-ok');
  await page.waitForSelector('[data-ad-table]', { timeout: 20000 });
  await page.waitForTimeout(1200);
}
async function openKanban(page) {
  await page.waitForSelector('#pill-kanban', { timeout: 8000, state: 'attached' });
  // the kanban pill lives in the ⋯ overflow (hidden) — PillBuilder binds on 'pointerup', so dispatch the
  //   pointer sequence directly (a programmatic tap, works regardless of visibility).
  await page.evaluate(() => { const b = document.getElementById('pill-kanban'); if (!b) return;
    b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); });
  await page.waitForFunction(() => window.__idmpKanban && window.__idmpKanban.board, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(500);
}
// the SHARED sidecar tip for an order id (lower-case table — the case the host write uses). Hydrate the lazy
// kernel sidecar from IndexedDB first so the probe reflects the persisted truth.
const tipOf = (page, id) => page.evaluate((i) => new Promise((res) => {
  const c = window.__crud;
  if (!c || !c.readTip) return res('no-crud');
  if (typeof c.withSidecar === 'function') c.withSidecar(() => res(c.readTip('c_order', i)));
  else res(c.readTip('c_order', i));
}), id);
// the grid row's rendered DocStatus chip for an order id (reads the __crud read-the-tip overlay → the chip
//   title carries the raw code "DocStatus · CL"). Reflects the overlay:committed → _overlayDocTip refold.
const gridStatusOf = (page, id) => page.evaluate((i) => {
  const tr = Array.from(document.querySelectorAll('tr[data-ad-record]')).find(r => Number(r.getAttribute('data-ad-record')) === i);
  if (!tr) return null;
  const cell = tr.querySelector('[data-ad-col="DocStatus"]') || tr;
  const chip = cell.querySelector('.idmp-stchip');
  return chip ? ((chip.title || '') + ' ' + chip.textContent).trim() : cell.textContent.trim();
}, id);
const closeOverlay = (page) => page.evaluate(() => {
  const x = document.querySelector('#posted-overlay .posted-ov-x'); if (x) { x.click(); return 'x'; }
  const o = document.getElementById('posted-overlay'); if (o && o.parentNode) { o.parentNode.removeChild(o); return 'rm'; }
  return 'none';
});

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const logs = [], errs = [];
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('console', m => logs.push(m.text()));
  page.on('pageerror', e => errs.push(e.message));

  // ── ACT A — the kanban drag is the SHARED signed verb ───────────────────────────────────────────
  await gotoOrderWindow(page, port);
  await openKanban(page);
  const board = await page.evaluate(() => {
    const b = window.__idmpKanban && window.__idmpKanban.board;
    return b ? { cols: b.columns.length, cards: b.cards.length } : null;
  });
  console.log('§S6 board=' + JSON.stringify(board));

  // drive legal wfmc edges until AdDocFsm ACCEPTS one (the board mirror is looser than the write authority).
  let drag = { ok: false };
  if (board && board.cards) {
    drag = await page.evaluate(() => new Promise((resolve) => {
      const b = window.__idmpKanban.board;
      const edges = [];
      for (const c of b.cards) { const z = b.dropZones[c.status] || []; for (const e of z) edges.push({ key: c.key, from: c.status, to: e.toStatus }); }
      let i = 0;
      const tryNext = () => {
        if (i >= edges.length) return resolve({ ok: false, tried: edges.length });
        const e = edges[i++];
        const card = b.cards.find(x => x.key === e.key);
        const id = card && card.id;
        window.__idmpKanban._onDrop(e.key, e.to);
        // _onDrop dispatch is synchronous {ok}; the card.status only advances on ok.
        setTimeout(() => {
          const now = (b.cards.find(x => x.key === e.key) || {}).status;
          if (now === e.to) return resolve({ ok: true, key: e.key, id: id, from: e.from, to: e.to });
          tryNext();
        }, 120);
      };
      tryNext();
    }));
  }
  console.log('§S6-DRAG ' + JSON.stringify(drag));
  await page.waitForTimeout(700);   // let the async __crud.process commitGroup settle + persist

  const writeOk = logs.find(l => l.includes('§KANBAN-WRITE ok') && l.includes('via=__crud.process') && l.includes('store=shared')) || '(none)';
  // the AUTHORITATIVE signed-commit line the engine emits from commitProcess (the SAME line J5 proves) — the
  //   kanban drag now rides it (it did NOT before: the old path sealed _kanbanProj, never logged §CRUD process).
  const committed = logs.find(l => l.includes('§CRUD process committed') && l.includes('verifyChain=ok')) || '(none)';
  const ringOpened = logs.some(l => l.includes('§CRUD ring view=on') || l.includes('§CRUD-IDMP-OPEN'));
  const tipA = drag.ok ? await tipOf(page, drag.id) : null;
  console.log('§S6-ACTA writeOk=' + writeOk);
  console.log('§S6-ACTA committed=' + committed);
  console.log('§S6-ACTA shared-tip(' + drag.id + ')=' + tipA + ' expect=' + drag.to + ' ringOpened=' + ringOpened);
  const actA = drag.ok && /via=__crud\.process/.test(writeOk) && /verifyChain=ok/.test(committed) &&
    String(tipA) === String(drag.to) && !ringOpened;

  // ── ACT B — the GRID sees the drag (close the overlay → the grid row reads the new status) ───────
  const closedVia = await closeOverlay(page);
  await page.waitForTimeout(500);   // overlay:committed → _overlayDocTip refold has the grid show the new status
  const gridB = drag.ok ? await gridStatusOf(page, drag.id) : null;
  console.log('§S6-ACTB overlay-closed=' + closedVia);
  console.log('§S6-ACTB grid-status(' + drag.id + ')=' + JSON.stringify(gridB) + ' expect~=' + drag.to);
  const actB = drag.ok && gridB != null && new RegExp(drag.to).test(String(gridB));

  // ── ACT C — survives reload + the board folds its tip from the SHARED store ──────────────────────
  await gotoOrderWindow(page, port);
  const tipC = drag.ok ? await tipOf(page, drag.id) : null;
  await page.waitForTimeout(300);
  await openKanban(page);
  const cardStatusC = drag.ok ? await page.evaluate((id) => {
    const b = window.__idmpKanban && window.__idmpKanban.board;
    if (!b) return null; const c = b.cards.find(x => String(x.id) === String(id)); return c ? c.status : 'not-on-board';
  }, drag.id) : null;
  console.log('§S6-ACTC reload shared-tip(' + drag.id + ')=' + tipC + ' board-card-status=' + cardStatusC + ' expect=' + drag.to);
  const actC = drag.ok && String(tipC) === String(drag.to) && String(cardStatusC) === String(drag.to);

  await page.screenshot({ path: path.join(__dirname, 'critic_lensswap.png') });

  const pass = actA && actB && actC && errs.length === 0;
  console.log('§W-CRITIC-LENS-SWAP ACT_A=' + actA + ' ACT_B=' + actB + ' ACT_C=' + actC +
    ' pageErrors=' + (errs.length ? errs.slice(0, 2).join('|') : 0));
  console.log('§W-CRITIC-LENS-SWAP-RESULT ' + (pass ? 'PASS' : 'FAIL'));
  await browser.close(); server.close(); process.exit(pass ? 0 : 1);
})().catch(e => { console.error('§W-CRITIC-LENS-SWAP-RESULT FAIL ' + e.message); process.exit(1); });
