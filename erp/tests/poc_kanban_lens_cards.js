// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser §-witness for the STANDALONE Kanban Lens page (erp/kanban_lens.html) rich cards.
//   THE CLAIM: the standalone lens no longer renders bare "Table #id" cards — it folds per-record meta
//   (title=DocumentNo / amount / date) from each doc table's REAL columns (DICTIONARY-DRIVEN, zero
//   per-table code) and feeds it to the SAME KanbanLens renderer the in-page board uses, so every card
//   carries the real DocumentNo + a formatted amount + a status colour rail.
//   PROVES (whitebox §-log + raw DOM + DB corroboration):
//     §KANBAN-LENS-META       — meta folded for >0 cards, handAuthored=0 (no per-table code).
//     §KANBAN-CARD-RENDER     — avatars + status colours actually rendered (avatars==enriched, all cards enriched).
//     DOM .kanban-card        — every card has a .kanban-avatar (no bare fallback card remains).
//     DB corroboration        — a sampled card's title equals the REAL DocumentNo in glassbowl_data.db,
//                               and its rendered amount equals KanbanLens.fmtMoney(real GrandTotal).
//   Pure formatters fmtMoney/fmtDate are unit-checked (node-require) up front (NON-INVENT presentation).
//   §-log first — READ poc_kanban_lens_cards.log before any conclusion.
// Run:  node tests/poc_kanban_lens_cards.js 2>&1 | tee tests/poc_kanban_lens_cards.log   (cwd = bim-ootb/erp)
'use strict';
const path = require('path'), http = require('http'), fs = require('fs');
// playwright lives in the real checkout's tests/node_modules (worktrees don't copy node_modules).
function loadPlaywright() {
  const cands = [path.join(__dirname, '../../tests/node_modules/playwright'),
                 '/home/red1/bim-ootb/tests/node_modules/playwright'];
  for (const c of cands) { try { return require(c); } catch (e) { /* next */ } }
  throw new Error('playwright not found in ' + cands.join(' | '));
}
const ROOT = path.join(__dirname, '..');

// ── (1) pure formatter unit-checks (no browser; NON-INVENT presentation) ──
const KL = require(path.join(ROOT, 'kanban_lens.js'));
const fmtCases = [
  ['fmtMoney 3657.5', KL.fmtMoney(3657.5), '3,657.50'],
  ['fmtMoney 228.85', KL.fmtMoney(228.85), '228.85'],
  ['fmtMoney 87400000', KL.fmtMoney(87400000), '87,400,000'],   // whole (rupiah) → 0dp, no fake cents
  ['fmtMoney empty', KL.fmtMoney(''), ''],
  ['fmtMoney non-numeric', KL.fmtMoney('Tr 2002 - 20'), 'Tr 2002 - 20'],
  ['fmtDate sql', KL.fmtDate('2003-11-01 00:00:00'), '2003-11-01'],
  ['fmtDate empty', KL.fmtDate(''), ''],
];
let fmtOk = true;
fmtCases.forEach(([name, got, want]) => { const ok = got === want; if (!ok) fmtOk = false;
  console.log('§KANBAN-FMT ' + name + ' got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want) + ' ' + (ok ? 'OK' : 'FAIL')); });

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.db': 'application/octet-stream', '.wasm': 'application/wasm', '.css': 'text/css', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/kanban_lens.html';
  fs.readFile(path.join(ROOT, p), (e, buf) => {
    if (e) { res.writeHead(404); res.end('404 ' + p); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(buf);
  });
});

(async () => {
  const { chromium } = loadPlaywright();
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const logs = [], errs = [];
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('console', m => logs.push(m.text()));
  page.on('pageerror', e => errs.push(e.message));

  await page.goto(`http://localhost:${port}/kanban_lens.html`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__kanban && window.__kanbanDb, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(400);

  const dom = await page.evaluate(() => {
    const cards = document.querySelectorAll('.kanban-card');
    const avatars = document.querySelectorAll('.kanban-avatar');
    let bare = 0, railed = 0;
    cards.forEach(c => {
      if (!c.querySelector('.kanban-avatar')) bare++;                       // a bare fallback card has no avatar
      if ((c.style.borderLeft || '').includes('solid')) railed++;
    });
    // sample the first enriched card: its title span + meta sub-line text
    const first = document.querySelector('.kanban-card .kanban-avatar') ? document.querySelector('.kanban-card') : null;
    let sample = null;
    if (first) {
      const ttl = first.querySelector('div > div > span') || first.querySelector('span');
      const subs = first.querySelectorAll('div > div > div');
      sample = { title: ttl ? ttl.textContent : '', text: first.textContent || '' };
    }
    return { cards: cards.length, avatars: avatars.length, bare, railed, sample };
  });

  const meta = logs.find(l => l.startsWith('§KANBAN-LENS-META ')) || '(no §KANBAN-LENS-META)';
  const render = logs.find(l => l.startsWith('§KANBAN-CARD-RENDER ')) || '(no §KANBAN-CARD-RENDER)';
  [meta, render].forEach(l => console.log(l));
  console.log('§KANBAN-LENS-DOM ' + JSON.stringify(dom));

  const num = (s, re) => { const m = s.match(re); return m ? Number(m[1]) : NaN; };
  const metaCards = num(meta, /cards=(\d+)/), handAuthored = num(meta, /handAuthored=(\d+)/);
  const enrRendered = num(render, /enriched=(\d+)/), avRendered = num(render, /avatars=(\d+)/);

  // DB corroboration — the sampled card's title is a REAL DocumentNo, and a real GrandTotal renders via fmtMoney.
  let titleReal = false, amtReal = false;
  if (dom.sample && dom.sample.title) {
    const dbProbe = await page.evaluate((title) => {
      const out = {};
      const tabs = [['C_Invoice', 'c_invoice', 'grandtotal'], ['C_Order', 'c_order', 'grandtotal'], ['C_Payment', 'c_payment', 'payamt']];
      for (const [T, tb, amt] of tabs) {
        try {
          const r = window.__kanbanDb.exec("SELECT documentno, " + amt + " FROM " + tb + " WHERE CAST(documentno AS TEXT)='" + title.replace(/'/g, "''") + "'");
          if (r.length && r[0].values.length) { out.table = T; out.documentno = String(r[0].values[0][0]); out.amount = r[0].values[0][1]; break; }
        } catch (e) { out.err = (out.err || '') + e.message; }
      }
      return out;
    }, dom.sample.title);
    titleReal = dbProbe.documentno != null && String(dbProbe.documentno) === String(dom.sample.title);
    if (dbProbe.amount != null) {
      const wantAmt = KL.fmtMoney(dbProbe.amount);
      amtReal = dom.sample.text.indexOf(wantAmt) >= 0;
      console.log('§KANBAN-LENS-CARD title=' + dom.sample.title + ' table=' + (dbProbe.table || '?') +
        ' realDocNo=' + (dbProbe.documentno) + ' wantAmt=' + wantAmt + ' inCard=' + amtReal);
    }
  }

  await page.screenshot({ path: path.join(__dirname, 'kanban_lens_cards.png') });

  const pass = fmtOk && errs.length === 0 &&
    metaCards > 0 && handAuthored === 0 &&
    dom.cards > 0 && dom.bare === 0 && dom.avatars === dom.cards && dom.railed === dom.cards &&
    enrRendered === dom.cards && avRendered === dom.cards &&
    titleReal && amtReal;
  console.log('§KANBAN-LENS-RESULT ' + (pass ? 'PASS' : 'FAIL') +
    ' fmtOk=' + fmtOk + ' metaCards=' + metaCards + ' handAuthored=' + handAuthored +
    ' cards=' + dom.cards + ' bare=' + dom.bare + ' avatars=' + dom.avatars + ' railed=' + dom.railed +
    ' enrRendered=' + enrRendered + ' titleReal=' + titleReal + ' amtReal=' + amtReal +
    ' pageErrors=' + (errs.length ? errs.slice(0, 2).join('|') : 0));

  await browser.close(); server.close(); process.exit(pass ? 0 : 1);
})().catch(e => { console.error('PROBE-ERR', e); server.close(); process.exit(2); });
