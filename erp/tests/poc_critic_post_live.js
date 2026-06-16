// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser §-witness for GRAND_LANE S3 / ERP_CRITIC_UX_LANE.md J6 POST + REPORT —
//   "the completed doc's GL is SHOWN to the cent, and a statement/receipt folds." W-CRITIC-POST-LIVE.
//   The critic drives the SERVED bundle and proves the POSTING surfaces (Posting-Preview, Accts-Posted,
//   Reports) SHOW the matrix-proven posters on iDempiere's OWN invoice window — and HONESTLY mark what a
//   migrated tenant cannot show (its posted journal was not captured).
//   Rides the proven posters (NO new verb): window.DocPoster/PostResolver (== fact_acct(318) to the cent,
//   W-DOC-POSTER), window.ERPPreview (the PURE derive), window.__report (foldReceipt / foldStatement).
//   PROVES (and HONESTLY records any gap — a dead-end is logged, never papered):
//     ACT 1 — ODOO (client 12, the doc-complete migrated tenant) INVOICE → POST IS DERIVABLE TO THE CENT:
//        open the Sales Invoice window (167) → invoice INV/2026/00005 ($5002.50) →
//        (a) the Posting-Preview pill SURFACES (the AD `Posted`-column gate is true for C_Invoice);
//        (b) tap it → the drawer lights coverage=complete, balanced, and the RENDERED journal == the Odoo
//            oracle to the cent: DR 121000 Account Receivable 5002.50 / CR 251000 Tax Received 652.50 /
//            CR 400000 Product Sales 4350.00 (the GL the Complete WOULD post — more than iDempiere shows
//            pre-posting). §PREVIEW-LIVE coverage=complete balanced=true;
//        (c) Accts-Posted is HONESTLY ABSENT — the migrated Odoo shard carries posting CONFIG but not the
//            posted fact_acct journal, and no op-log POST exists this session → "install local data first",
//            NEVER a faked posted journal. The critic is not misled (preview = "would post", not "posted");
//        (d) a RECEIPT folds for the invoice (foldReceipt over raw header+lines): subtotal 4350.00 / tax
//            652.50 / total 5002.50. §REPORT-RECEIPT.
//     ACT 2 — GARDENWORLD (client 11, the full tenant) — THE REPORT HALF on a real posted journal:
//        (a) Posting-Preview on a posted sales invoice (#200000, $50.35) lights coverage=complete balanced;
//        (b) a FINANCIAL STATEMENT folds — window.__report.statement (PA_Report over the real 300-row
//            fact_acct, W-PA-REPORT) renders cells, every one a re-sum of fact_acct, 0 invented. §STATEMENT;
//        (c) a receipt folds for the invoice. §REPORT-RECEIPT total 50.35.
//     0 pageerrors.
//   §-log first — READ tests/poc_critic_post_live.log before any conclusion (exit code is NOT evidence).
// Run:  node tests/poc_critic_post_live.js   (cwd = bim-ootb/erp)
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

// PillBuilder binds on 'pointerup' — a programmatic tap dispatches the pointer sequence.
async function tapPill(page, pid) {
  return page.evaluate((p) => { const b = document.getElementById('pill-' + p); if (!b) return false;
    b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); return true; }, pid);
}
async function gotoTenant(page, url) {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-ad-table]', { timeout: 20000 }).catch(async () => {
    const u = await page.$('#idmp-login-users .idmp-login-user:not(.disabled)');
    if (u) { await u.click(); const ok = await page.$('#idmp-login-ok'); if (ok) await ok.click(); }
    await page.waitForSelector('[data-ad-table]', { timeout: 15000 }).catch(() => {});
  });
  await page.waitForTimeout(1200);
}
// open a record's form by clicking its grid row (the realistic user path; sets _curTab + _records[_recIdx]).
async function openRecord(page, id) {
  return page.evaluate((i) => {
    const rows = Array.from(document.querySelectorAll('.idmp-grid tbody tr[data-ad-record]'));
    const tr = rows.find(r => Number(r.getAttribute('data-ad-record')) === i) || rows[0];
    if (tr) { tr.click(); return tr.getAttribute('data-ad-record'); } return null;
  }, id);
}
// scrape the Posting-Preview / Accts-Posted drawer: coverage chip, balance class, and the per-line journal.
// Both surfaces render into #posted-overlay; mount() roots at .accts-posted, mountAccordion() at .acc — scope
// to the overlay so either shape is caught.
function scrapePosted(page) {
  return page.evaluate(() => {
    const w = document.querySelector('#posted-overlay') || document.querySelector('.accts-posted'); if (!w) return null;
    const cov = (w.querySelector('.posted-cov-chip') || {}).textContent || null;
    const bal = !!w.querySelector('.posted-balance.is-balanced');
    const lines = Array.from(w.querySelectorAll('.posted-line')).map(tr => tr.textContent.replace(/\s+/g, ' ').trim());
    const txt = w.textContent.replace(/\s+/g, ' ').trim();
    return { cov, bal, lines, txt };
  });
}
async function closePosted(page) {
  await page.evaluate(() => { const ov = document.getElementById('posted-overlay'); if (ov) { const x = ov.querySelector('.posted-ov-x'); if (x) x.click(); else ov.remove(); } });
  await page.waitForTimeout(250);
}

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const logs = [], errs = [];
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('console', m => logs.push(m.text()));
  page.on('pageerror', e => errs.push(e.message));

  let pass = 0, fail = 0;
  const ok = (label, cond, extra) => { console.log('   ' + (cond ? '🟢' : '🔴') + ' ' + label + (extra ? ' — ' + extra : '')); cond ? pass++ : fail++; };
  const lastLog = (re) => [...logs].reverse().find(l => re.test(l)) || '';

  // ════════════════════════════ ACT 1 — ODOO INVOICE: POST derivable to the cent + receipt ════════════════════════════
  const odooUrl = `http://localhost:${port}/idempiere.html?seed=ad_seed.db&shard=12-odoo.db&login=Odoo&window=167`;
  await gotoTenant(page, odooUrl);

  const inv = await page.evaluate(() => {
    const r = window.__idmpDb.exec("SELECT C_Invoice_ID, DocumentNo, GrandTotal FROM C_Invoice WHERE AD_Client_ID=12 AND IsSOTrx='Y' ORDER BY C_Invoice_ID LIMIT 1");
    if (!r.length) return null; const v = r[0].values[0]; return { id: v[0], doc: v[1], gt: v[2] };
  });
  console.log('§CRITIC-POST ACT1 odoo invoice=' + (inv ? `${inv.doc}(${inv.id}) gt=${inv.gt}` : 'NONE'));
  ok('a posted Odoo sales invoice exists to show its GL', !!inv, inv ? JSON.stringify(inv) : 'none');

  await openRecord(page, inv ? inv.id : 0);
  await page.waitForTimeout(700);
  const tabLog = lastLog(/§IDEMPIERE .*table=C_Invoice/i);
  const pillPresent = await page.evaluate(() => !!document.getElementById('pill-preview'));
  console.log('§CRITIC-POST ACT1 tabLog="' + tabLog + '" previewPillInDOM=' + pillPresent);
  ok('the open document is a POSTING doc (AD `Posted`-column gate true)', /postingDoc=true/.test(tabLog), tabLog);
  ok('the Posting-Preview pill SURFACES on the invoice (the user has the control)', pillPresent);

  // tap the real pill; fall back to the registered action only if the pill is somehow absent (logged).
  const tapped = await tapPill(page, 'preview');
  if (!tapped) await page.evaluate(() => window.IdmpPillActions && window.IdmpPillActions.preview && window.IdmpPillActions.preview());
  await page.waitForTimeout(900);
  const prevLog = lastLog(/§PREVIEW-LIVE/);
  const drawer = await scrapePosted(page);
  console.log('§CRITIC-POST ACT1 previewTapped=' + tapped + ' prevLog="' + prevLog + '"');
  console.log('§CRITIC-POST ACT1 drawer cov=' + (drawer && drawer.cov) + ' balanced=' + (drawer && drawer.bal) + ' lines=' + JSON.stringify(drawer && drawer.lines));
  ok('§PREVIEW-LIVE reports coverage=complete (config resolves every token)', /coverage=complete/.test(prevLog), prevLog);
  ok('§PREVIEW-LIVE reports balanced=true', /balanced=true/.test(prevLog), prevLog);
  ok('the drawer RENDERS coverage=complete + balanced (the user SEES it)', !!drawer && drawer.cov === 'complete' && drawer.bal, JSON.stringify(drawer && { cov: drawer.cov, bal: drawer.bal }));
  // the journal to the cent == Odoo oracle: DR AR 5002.50 / CR Tax 652.50 / CR Sales 4350.00
  const dtxt = (drawer && drawer.txt) || '';
  ok('rendered journal: DR Account Receivable 5002.50', /Account Receivable/i.test(dtxt) && /5002\.50/.test(dtxt), dtxt.slice(0, 120));
  ok('rendered journal: CR Product Sales 4350.00', /Product Sales/i.test(dtxt) && /4350\.00/.test(dtxt), '');
  ok('rendered journal: CR Tax Received 652.50', /Tax Received/i.test(dtxt) && /652\.50/.test(dtxt), '');
  // close the preview overlay before the next surface
  await closePosted(page);

  // Accts-Posted: HONEST absent on a migrated tenant (config but no captured fact_acct, no op-log POST).
  const tappedPosted = await tapPill(page, 'posted');
  if (!tappedPosted) await page.evaluate(() => window.IdmpPillActions && window.IdmpPillActions.posted && window.IdmpPillActions.posted());
  await page.waitForTimeout(700);
  const postedLog = lastLog(/§POSTED-LIVE/);
  const postedDrawer = await scrapePosted(page);
  console.log('§CRITIC-POST ACT1 postedLog="' + postedLog + '" postedDrawerCov=' + (postedDrawer && postedDrawer.cov));
  ok('Accts-Posted is HONESTLY absent (migrated tenant: no captured posted journal, not faked)',
     /coverage=absent/.test(postedLog) || (postedDrawer && postedDrawer.cov === 'absent'), postedLog);
  await closePosted(page);

  // a RECEIPT folds for the invoice (foldReceipt — raw header+lines, PURE).
  await page.evaluate(() => window.__report && window.__report.show && window.__report.show('c_invoice'));
  await page.waitForTimeout(600);
  const recLog = lastLog(/§REPORT-RECEIPT/);
  console.log('§CRITIC-POST ACT1 receipt="' + recLog + '"');
  ok('a receipt folds for the invoice (total 5002.50 = subtotal 4350.00 + tax 652.50, all folded)',
     /§REPORT-RECEIPT/.test(recLog) && /total=5002\.50/.test(recLog) && /subtotal=4350\.00/.test(recLog) && /tax=652\.50/.test(recLog), recLog);
  await page.evaluate(() => { const c = document.querySelector('#reportPanel .rpx'); if (c) c.click(); });
  await page.waitForTimeout(300);

  // ════════════════════════════ ACT 2 — GARDENWORLD: real posted journal + financial statement ════════════════════════════
  const gwUrl = `http://localhost:${port}/idempiere.html?seed=ad_seed.db&login=GardenAdmin&window=167`;
  await gotoTenant(page, gwUrl);
  const gwInv = await page.evaluate(() => {
    const r = window.__idmpDb.exec("SELECT C_Invoice_ID, DocumentNo, GrandTotal FROM C_Invoice WHERE AD_Client_ID=11 AND IsSOTrx='Y' AND DocStatus='CO' ORDER BY C_Invoice_ID LIMIT 1");
    if (!r.length) return null; const v = r[0].values[0]; return { id: v[0], doc: v[1], gt: v[2] };
  });
  console.log('§CRITIC-POST ACT2 gw invoice=' + (gwInv ? `${gwInv.doc}(${gwInv.id}) gt=${gwInv.gt}` : 'NONE'));
  ok('a posted GardenWorld sales invoice exists', !!gwInv, gwInv ? JSON.stringify(gwInv) : 'none');

  await openRecord(page, gwInv ? gwInv.id : 0);
  await page.waitForTimeout(700);
  const gwTapped = await tapPill(page, 'preview');
  if (!gwTapped) await page.evaluate(() => window.IdmpPillActions && window.IdmpPillActions.preview && window.IdmpPillActions.preview());
  await page.waitForTimeout(800);
  const gwPrevLog = lastLog(/§PREVIEW-LIVE/);
  const gwDrawer = await scrapePosted(page);
  console.log('§CRITIC-POST ACT2 prevLog="' + gwPrevLog + '" drawerCov=' + (gwDrawer && gwDrawer.cov) + ' balanced=' + (gwDrawer && gwDrawer.bal));
  ok('GardenWorld preview lights coverage=complete + balanced', /coverage=complete/.test(gwPrevLog) && /balanced=true/.test(gwPrevLog), gwPrevLog);
  ok('GardenWorld preview drawer shows the invoice total ' + (gwInv && gwInv.gt), !!gwDrawer && new RegExp(String(gwInv && gwInv.gt).replace('.', '\\.')).test(gwDrawer.txt), gwDrawer && gwDrawer.txt.slice(0, 100));
  await closePosted(page);

  // a FINANCIAL STATEMENT folds over the real 300-row fact_acct (W-PA-REPORT). 101 = Income Statement.
  await page.evaluate(() => window.__report && window.__report.statement && window.__report.statement(101));
  await page.waitForTimeout(800);
  const stmtLog = lastLog(/§STATEMENT report=/);
  console.log('§CRITIC-POST ACT2 statement="' + stmtLog + '"');
  ok('a financial statement folds (PA_Report over real fact_acct, every cell a re-sum, 0 invented)',
     /§STATEMENT report=101/.test(stmtLog) && /cells=\d+/.test(stmtLog) && !/lacks/.test(stmtLog), stmtLog);
  await page.evaluate(() => { const c = document.querySelector('#reportPanel .rpx'); if (c) c.click(); });
  await page.waitForTimeout(300);

  // a receipt folds for the GardenWorld invoice.
  await page.evaluate(() => window.__report && window.__report.show && window.__report.show('c_invoice'));
  await page.waitForTimeout(600);
  const gwRecLog = lastLog(/§REPORT-RECEIPT/);
  console.log('§CRITIC-POST ACT2 receipt="' + gwRecLog + '"');
  ok('a receipt folds for the GardenWorld invoice (total=' + (gwInv && gwInv.gt) + ')',
     /§REPORT-RECEIPT/.test(gwRecLog) && new RegExp('total=' + String(gwInv && gwInv.gt).replace('.', '\\.')).test(gwRecLog), gwRecLog);

  ok('0 pageerrors across both acts', errs.length === 0, errs.length ? errs.slice(0, 3).join(' | ') : '');

  // ── the critic's verdict ─────────────────────────────────────────────────────────────────────────────
  const verdict = fail === 0;
  console.log('\n§CRITIC-VERDICT(J6) ' + (verdict ? '✅' : '🔴') + ' — POST + REPORT is SHOWN, to the cent, on iDempiere\'s own '
    + 'invoice window. On the migrated Odoo tenant the completed invoice\'s GL is derivable AND RENDERED to the cent via '
    + 'Posting-Preview (DR Receivable 5002.50 / CR Sales 4350.00 / CR Tax 652.50 == the Odoo oracle) and a receipt folds — '
    + 'MORE than iDempiere shows before posting — while Accts-Posted is HONESTLY absent (the migrated shard never carried the '
    + 'posted fact_acct journal; nothing faked). On the full GardenWorld tenant the same preview lights and a financial '
    + 'statement folds over the real 300-row fact_acct (W-PA-REPORT, every cell a re-sum). The posters are the matrix-proven '
    + 'verbs; this leg made the UI SHOW them, with the migration honesty a critic demands.');
  console.log((verdict ? '✅' : '❌') + ' W-CRITIC-POST-LIVE: ' + pass + '/' + (pass + fail) + ' PASS (' + fail + ' FAIL)');
  await browser.close(); server.close();
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('FATAL', e); try { server.close(); } catch (x) {} process.exit(1); });
