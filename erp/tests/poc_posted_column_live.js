// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser §-witness for Leg 3 of the iDempiere L&F FIDELITY lane (RESUME_IDMP_FIDELITY.md §SPEC Leg 3):
//   the per-record accounting (Accts-Posted / Posting-Preview) surfaced as iDempiere's NATIVE `Posted`
//   COLUMN/button, ROLE-GATED to accounting roles (MRole.isShowAcct) — NOT the old ⋯ pills. W-POSTED-COLUMN PROVES:
//     A — on GardenWorld **Admin** (role 102, ad_role.isshowacct=Y) a posting doc (C_Invoice, window 167) shows a
//         "Posted" grid COLUMN, every row carrying a Posted button labelled from the _Posted Status ref-list (234).
//     B — opening a record → the FORM carries the Posted button field (iDempiere WButtonEditor parity).
//     C — clicking the Posted button opens the accounting fold (the GardenWorld invoices are draft → posted=N → the
//         dry-run PREVIEW branch: §PREVIEW-LIVE fires; §POSTED-COLUMN routes posted=false→preview — non-invent).
//     D — the ⋯ pill rail NO LONGER carries `posted`/`preview` (the column/button owns them now): #pill-posted /
//         #pill-preview are absent.
//     E — on GardenWorld **User** (role 103, isshowacct=N) the SAME window shows NO Posted column and NO form
//         button (§IDMP-SESSION acctGate isShowAcct=false) — a non-accounting role sees no accounting, per iDempiere.
//     F — on a NON-posting window (Business Partner, window 123, C_BPartner has no AD Posted column) the Admin
//         sees NO Posted column either — the gate is the real AD posting-doc test, not a per-window hardcode.
//   All assertions are DOM/console only. 0 pageerrors.
//   §-log first — READ tests/poc_posted_column_live.log before any conclusion.
// Run:  node tests/poc_posted_column_live.js 2>&1 | tee tests/poc_posted_column_live.log   (cwd = bim-ootb/erp)
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

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const errs = [], logs = [];
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { const t = m.text(); if (/^§(POSTED|PREVIEW|IDMP-SESSION acctGate|IDEMPIERE tab)/.test(t)) logs.push(t); });

  async function login(loginName, windowId) {
    await page.goto(`http://localhost:${port}/idempiere.html?login=${loginName}&window=${windowId}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('#idmp-content table.idmp-grid, #idmp-placeholder', { timeout: 20000 });
    await page.waitForTimeout(800);
  }

  // ── PART 1 — Admin (isShowAcct=Y) on a posting doc (Sales Invoice, window 167 → C_Invoice). ──
  await login('GardenAdmin', 167);

  // A — Posted column in the grid + a Posted button per row.
  const A = await page.evaluate(() => {
    const ths = Array.from(document.querySelectorAll('#idmp-content table.idmp-grid thead th')).map(t => (t.textContent || '').trim());
    const btns = document.querySelectorAll('#idmp-content table.idmp-grid td.idmp-posted-cell .idmp-posted-btn');
    return { headerHasPosted: ths.includes('Posted'), rowButtons: btns.length,
             firstLabel: btns.length ? (btns[0].textContent || '').trim() : '' };
  });
  console.log('§POSTED-A headerHasPosted=' + A.headerHasPosted + ' rowButtons=' + A.rowButtons + ' firstLabel=' + JSON.stringify(A.firstLabel));
  const actA = A.headerHasPosted && A.rowButtons > 0 && A.firstLabel.length > 0;

  // B — open a record (form view) → the form carries the Posted button field.
  await page.evaluate(() => { const tr = document.querySelector('#idmp-content table.idmp-grid tbody tr[data-i]'); if (tr) tr.click(); });
  await page.waitForTimeout(700);
  const B = await page.evaluate(() => {
    const f = document.querySelector('#idmp-content .idmp-posted-fld .idmp-posted-btn');
    return { formButton: !!f, label: f ? (f.textContent || '').trim() : '' };
  });
  console.log('§POSTED-B formButton=' + B.formButton + ' label=' + JSON.stringify(B.label));
  const actB = B.formButton && B.label.length > 0;

  // C — click the form Posted button → the accounting fold opens (draft data → PREVIEW branch).
  await page.evaluate(() => { const f = document.querySelector('#idmp-content .idmp-posted-fld .idmp-posted-btn'); if (f) f.click(); });
  await page.waitForTimeout(900);
  const routeLog = logs.slice().reverse().find(t => /^§POSTED-COLUMN open /.test(t)) || '';
  const foldLog = logs.slice().reverse().find(t => /^§(PREVIEW|POSTED)-LIVE /.test(t)) || '';
  const overlayOpen = await page.evaluate(() => !!(document.getElementById('posted-overlay') ||
    Array.from(document.querySelectorAll('.idmp-overlay, [id*="overlay"]')).some(o => /Posting Preview|Accts Posted/i.test(o.textContent || ''))));
  console.log('§POSTED-C route=' + JSON.stringify(routeLog) + ' fold=' + JSON.stringify(foldLog) + ' overlayOpen=' + overlayOpen);
  const actC = /posted=false → preview/.test(routeLog) && /^§PREVIEW-LIVE /.test(foldLog) && overlayOpen;
  // close the overlay before the screenshot/next nav
  await page.evaluate(() => { const x = document.querySelector('#posted-overlay .posted-ov-x, .idmp-ov-x, [class*="-x"]'); if (x) x.click(); });
  await page.waitForTimeout(300);

  // D — the ⋯ rail no longer carries posted/preview pills.
  const D = await page.evaluate(() => ({ posted: !!document.getElementById('pill-posted'), preview: !!document.getElementById('pill-preview') }));
  console.log('§POSTED-D pill-posted=' + D.posted + ' pill-preview=' + D.preview);
  const actD = !D.posted && !D.preview;

  await page.screenshot({ path: path.join(__dirname, 'posted_column.png'), fullPage: false });

  // ── PART 2 — User (isShowAcct=N) on the SAME posting doc → no column, no form button. ──
  await login('GardenUser', 167);
  const gate = logs.slice().reverse().find(t => /^§IDMP-SESSION acctGate /.test(t)) || '';
  const E = await page.evaluate(() => {
    const ths = Array.from(document.querySelectorAll('#idmp-content table.idmp-grid thead th')).map(t => (t.textContent || '').trim());
    const cells = document.querySelectorAll('#idmp-content .idmp-posted-btn').length;
    return { headerHasPosted: ths.includes('Posted'), anyButton: cells };
  });
  console.log('§POSTED-E acctGate=' + JSON.stringify(gate) + ' headerHasPosted=' + E.headerHasPosted + ' anyButton=' + E.anyButton);
  const actE = /isShowAcct=false/.test(gate) && !E.headerHasPosted && E.anyButton === 0;

  // ── PART 3 — Admin on a NON-posting window (Business Partner 123 → C_BPartner, no AD Posted col). ──
  await login('GardenAdmin', 123);
  const F = await page.evaluate(() => {
    const ths = Array.from(document.querySelectorAll('#idmp-content table.idmp-grid thead th')).map(t => (t.textContent || '').trim());
    return { headerHasPosted: ths.includes('Posted'), anyButton: document.querySelectorAll('#idmp-content .idmp-posted-btn').length };
  });
  const postingDocLog = logs.slice().reverse().find(t => /^§IDEMPIERE tab=.*table=C_BPartner /.test(t)) || '';
  console.log('§POSTED-F headerHasPosted=' + F.headerHasPosted + ' anyButton=' + F.anyButton + ' tabLog=' + JSON.stringify(postingDocLog.replace(/^.*postingDoc=/, 'postingDoc=')));
  const actF = !F.headerHasPosted && F.anyButton === 0;

  const pass = actA && actB && actC && actD && actE && actF && errs.length === 0;
  console.log('§W-POSTED-COLUMN ACT_A=' + actA + ' ACT_B=' + actB + ' ACT_C=' + actC + ' ACT_D=' + actD +
    ' ACT_E=' + actE + ' ACT_F=' + actF + ' pageErrors=' + (errs.length ? errs.slice(0, 2).join('|') : 0));
  console.log('§W-POSTED-COLUMN-RESULT ' + (pass ? 'PASS' : 'FAIL'));
  await browser.close(); server.close(); process.exit(pass ? 0 : 1);
})().catch(e => { console.error('§W-POSTED-COLUMN-RESULT FAIL ' + e.message); process.exit(1); });
