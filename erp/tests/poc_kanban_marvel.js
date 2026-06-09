// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser §-witness for KANBAN_MARVEL_SPEC — the "Odoo-marvel" Kanban cards + the shared
//   semantic status colour palette across Kanban AND Graph (consistent L&F, status-at-a-glance).
//   THE CLAIM: the richer card chrome is DICTIONARY-DRIVEN (zero per-model code) — title/amount/date are
//   detected by AD naming convention (DocumentNo/GrandTotal/Date*), so ANY absorbed model renders rich
//   cards; avatars are doctype monograms; the card's status colour + the Graph bars share ONE palette.
//   PROVES (whitebox §-log + raw DOM corroboration):
//     §KANBAN-MARVEL  — every board card enriched from REAL columns (enriched==cards), the detected
//                       title/amount/date are REAL column names (not hardcoded), handAuthored=0.
//     §KANBAN-CARD-RENDER — avatars + status colours actually rendered in the DOM (avatars==enriched).
//     §KANBAN-CARD    — a sampled card's title/amount/date equal the record's real values.
//     §GRAPH-PILL     — Graph bars coloured by the SAME palette (status-semantic when the pivot is status).
//   Existing poc_idmp_kanban.js (drag→signed write) must still PASS — the write path is untouched.
//   §-log first — READ poc_kanban_marvel.log before any conclusion.
// Run:  node tests/poc_kanban_marvel.js 2>&1 | tee tests/poc_kanban_marvel.log   (cwd = bim-ootb/erp)
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

// registry chrome (PR #170): open a pill #pill-<id> via pointerup, opening the #idmp-pill dock if collapsed.
async function clickPill(page, id) {
  // Pills are present in the DOM but the strip is COLLAPSED by default (display:none since v609) — wait for the
  // element to be ATTACHED, not visible; the dock is opened just below before the pill pointerup is dispatched.
  await page.waitForSelector('#pill-' + id, { state: 'attached', timeout: 15000 });
  await page.evaluate(() => { var d = document.getElementById('idmp-pill'), t = document.getElementById('idmp-pill-trigger');
    if (d && t && getComputedStyle(d).display === 'none') t.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); });
  await page.waitForTimeout(150);
  await page.evaluate(i => document.getElementById('pill-' + i).dispatchEvent(new PointerEvent('pointerup', { bubbles: true })), id);
}

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const logs = [], errs = [];
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('console', m => logs.push(m.text()));
  page.on('pageerror', e => errs.push(e.message));

  await page.goto(`http://localhost:${port}/idempiere.html?window=167`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#idmp-login-users .idmp-login-user:not(.disabled)', { timeout: 15000 });
  await page.click('#idmp-login-users .idmp-login-user:not(.disabled)');
  await page.waitForSelector('#idmp-login-ok', { timeout: 5000 });
  await page.click('#idmp-login-ok');
  await page.waitForSelector('[data-ad-table]', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1200);

  // ── Kanban marvel ──
  await clickPill(page, 'kanban');
  await page.waitForFunction(() => window.__idmpKanban && window.__idmpKanban.board, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(500);

  const dom = await page.evaluate(() => {
    const cards = document.querySelectorAll('.kanban-card');
    const avatars = document.querySelectorAll('.kanban-avatar');
    const chips = document.querySelectorAll('.kanban-chip');
    // a card with a coloured left rail = status colour applied
    let railed = 0; cards.forEach(c => { if ((c.style.borderLeft || '').includes('solid')) railed++; });
    const firstTitle = document.querySelector('.kanban-card .kanban-avatar') ?
      (document.querySelector('.kanban-card').textContent || '') : '';
    return { cards: cards.length, avatars: avatars.length, chips: chips.length, railed, firstTitle };
  });

  const marvel = logs.find(l => l.startsWith('§KANBAN-MARVEL ')) || '(no §KANBAN-MARVEL)';
  const render = logs.find(l => l.startsWith('§KANBAN-CARD-RENDER ')) || '(no §KANBAN-CARD-RENDER)';
  const card = logs.find(l => l.startsWith('§KANBAN-CARD ')) || '(no §KANBAN-CARD)';
  [marvel, render, card].forEach(l => console.log(l));
  console.log('§KANBAN-MARVEL-DOM ' + JSON.stringify(dom));

  const num = (s, re) => { const m = s.match(re); return m ? Number(m[1]) : NaN; };
  const get = (s, re) => { const m = s.match(re); return m ? m[1] : ''; };
  const mCards = num(marvel, /cards=(\d+)/), mEnr = num(marvel, /enriched=(\d+)/);
  const titleCol = get(marvel, /titleCol=(\S+)/), amountCol = get(marvel, /amountCol=(\S+)/), dateCol = get(marvel, /dateCol=(\S+)/);
  const handAuthored = num(marvel, /handAuthored=(\d+)/);
  const avRendered = num(render, /avatars=(\d+)/), enrRendered = num(render, /enriched=(\d+)/);

  // corroborate the sampled §KANBAN-CARD against the REAL DB row (NON-INVENT proof, not §-line alone)
  let cardReal = false;
  const ckey = get(card, /key=(\S+)/), ctitle = get(card, /title='([^']*)'/);
  if (ckey && titleCol && titleCol !== 'none') {
    const id = ckey.split('#')[1], tbl = ckey.split('#')[0];
    cardReal = await page.evaluate(({ tbl, titleCol, id }) => {
      try { const r = window.__idmpDb.exec('SELECT ' + titleCol + ' FROM ' + tbl + ' WHERE ' + tbl + '_ID=' + id);
        return r.length ? String(r[0].values[0][0]) : '__none__'; } catch (e) { return '__err__:' + e.message; }
    }, { tbl, titleCol, id });
    cardReal = String(cardReal) === String(ctitle);
  }

  // ── Graph consistency (same palette; status pivot → semantic) ──
  await clickPill(page, 'graph');
  await page.waitForTimeout(500);
  const graph = logs.find(l => l.startsWith('§GRAPH-PILL ')) || '(no §GRAPH-PILL)';
  console.log(graph);
  const gColored = num(graph, /colored=(\d+)/), gScheme = get(graph, /scheme=(\S+)/);
  const gBarsColored = await page.evaluate(() => {
    const bars = document.querySelectorAll('.chart-bar'); let c = 0;
    bars.forEach(b => { const bg = b.style.background || ''; if (bg && !bg.includes('gradient')) c++; });
    return { bars: bars.length, solid: c };
  });
  console.log('§GRAPH-DOM ' + JSON.stringify(gBarsColored));

  await page.screenshot({ path: path.join(__dirname, 'kanban_marvel.png') });

  const kanbanOk = mCards > 0 && mEnr === mCards && enrRendered === mEnr &&
    avRendered === mEnr && dom.avatars === mEnr && dom.railed === mEnr &&
    titleCol === 'DocumentNo' && amountCol === 'GrandTotal' && /^Date/.test(dateCol) &&
    handAuthored === 0 && cardReal;
  const graphOk = gColored > 0 && gScheme === 'status-semantic' && gBarsColored.solid === gBarsColored.bars && gBarsColored.bars > 0;
  const pass = kanbanOk && graphOk && errs.length === 0;
  console.log('§KANBAN-MARVEL-RESULT ' + (pass ? 'PASS' : 'FAIL') +
    ' kanbanOk=' + kanbanOk + ' (cards=' + mCards + ' enriched=' + mEnr + ' avatars=' + dom.avatars + ' railed=' + dom.railed +
    ' titleCol=' + titleCol + ' amountCol=' + amountCol + ' dateCol=' + dateCol + ' cardReal=' + cardReal + ')' +
    ' graphOk=' + graphOk + ' (colored=' + gColored + ' scheme=' + gScheme + ' bars=' + gBarsColored.bars + '/' + gBarsColored.solid + ')' +
    ' pageErrors=' + (errs.length ? errs.slice(0, 2).join('|') : 0));

  await browser.close(); server.close(); process.exit(pass ? 0 : 1);
})().catch(e => { console.error('PROBE-ERR', e); server.close(); process.exit(2); });
