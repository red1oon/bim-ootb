// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser §-witness for ERP_CRITIC_UX_LANE.md P1 — J2 ORIENT + J3 READ on the Odoo tenant
//   (client 12, the doc-complete tenant). W-CRITIC-ORIENT + W-CRITIC-READ. The CRITIC drives the SERVED bundle.
//   PROVES, entering Odoo via the proven ?shard=12-odoo.db&login=Odoo&window=143 (Sales Order) path:
//     J2 ORIENT / GATING (W-CRITIC-ORIENT) — the role-scoped menu is real (window leaves present); the Sales
//        Order grid renders ODOO's own orders (every rendered row's C_Order_ID is AD_Client_ID 12), the
//        DocumentNos are Odoo's S000xx series, and ZERO GardenWorld(11) orders bleed through — even though the
//        db physically holds BOTH tenants (installShard merged Odoo into the GardenWorld seed). The gate is
//        load-bearing: GardenWorld HAS 8 numeric-DocNo orders and NONE appear.
//     J3 READ (W-CRITIC-READ) — open an order → the form header renders from Odoo data: DocumentNo matches the
//        db row, and the Business Partner renders as a HUMAN NAME (not a raw FK id — rides #324 refresolve),
//        matching the BP's own Name. Record-info (the ⓘ affordance) answers from the op-log (recordInfo fold).
//     0 pageerrors.
//   The critic's bar: "Could I orient + read a tenant's own sales order this fast and this clearly in
//   iDempiere/Odoo? And is the data unmistakably THIS tenant's, never bleeding another client's rows?"
//   §-log first — READ tests/poc_critic_odoo_orient_read_live.log before any conclusion (exit code is NOT evidence).
// Run:  node tests/poc_critic_odoo_orient_read_live.js   (cwd = bim-ootb/erp)
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
  const logs = [], errs = [];
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('console', m => logs.push(m.text()));
  page.on('pageerror', e => errs.push(e.message));

  const url = `http://localhost:${port}/idempiere.html?seed=ad_seed.db&shard=12-odoo.db&login=Odoo&window=143`;
  await page.goto(url, { waitUntil: 'networkidle' });
  // login=Odoo auto-logs-in; the window=143 deep link opens the Sales Order grid. Fall back to a manual pick.
  await page.waitForSelector('[data-ad-table]', { timeout: 20000 }).catch(async () => {
    const u = await page.$('#idmp-login-users .idmp-login-user:not(.disabled)');
    if (u) { await u.click(); const ok = await page.$('#idmp-login-ok'); if (ok) await ok.click(); }
    await page.waitForSelector('[data-ad-table]', { timeout: 15000 }).catch(() => {});
  });
  await page.waitForTimeout(1200);

  let pass = 0, fail = 0;
  const ok = (label, cond, extra) => { console.log('   ' + (cond ? '🟢' : '🔴') + ' ' + label + (extra ? ' — ' + extra : '')); cond ? pass++ : fail++; };

  // ── J2 ORIENT / GATING (W-CRITIC-ORIENT) ──────────────────────────────────────────────────────────
  const orient = await page.evaluate(() => {
    const ad = window.__idmpDb;
    // role-scoped menu: window leaves present in the tree
    const menuWins = document.querySelectorAll('#idmp-tree .idmp-row.leaf').length;
    // the Sales Order grid rows (host-contract tags)
    const rows = Array.from(document.querySelectorAll('.idmp-grid tr[data-ad-record], .idmp-cards [data-ad-record]'));
    const recIds = rows.map(r => Number(r.getAttribute('data-ad-record'))).filter(n => !isNaN(n));
    // what client does each rendered row actually belong to? (truth from the loaded db)
    const clientOf = id => { try { const r = ad.exec('SELECT AD_Client_ID FROM C_Order WHERE C_Order_ID=' + id); return r.length ? r[0].values[0][0] : null; } catch (e) { return null; } };
    const docNoOf = id => { try { const r = ad.exec("SELECT DocumentNo FROM C_Order WHERE C_Order_ID=" + id); return r.length ? r[0].values[0][0] : null; } catch (e) { return null; } };
    const clients = recIds.map(clientOf);
    const docNos = recIds.map(docNoOf);
    // gating falsifier: does the db hold GardenWorld(11) orders that did NOT appear?
    let gwTotal = 0, gwShown = 0;
    try { gwTotal = ad.exec('SELECT COUNT(*) FROM C_Order WHERE AD_Client_ID=11')[0].values[0][0]; } catch (e) {}
    gwShown = clients.filter(c => c === 11).length;
    return { menuWins, n: recIds.length, allOdoo: recIds.length > 0 && clients.every(c => c === 12 || c === 0),
      sampleDocNos: docNos.slice(0, 5), gwTotal, gwShown,
      docNoShape: docNos.length > 0 && docNos.every(d => /^S\d+$/.test(String(d || ''))) };
  });
  console.log('§CRITIC-ORIENT menuWins=' + orient.menuWins + ' gridRows=' + orient.n + ' allOdoo=' + orient.allOdoo
    + ' gwOrdersInDb=' + orient.gwTotal + ' gwShown=' + orient.gwShown + ' docNos=[' + orient.sampleDocNos.join(',') + ']');
  ok('role-scoped menu is real (window leaves present)', orient.menuWins > 0, 'leaves=' + orient.menuWins);
  ok('Sales Order grid renders Odoo orders (rows>0, every row AD_Client_ID=12)', orient.n > 0 && orient.allOdoo, 'rows=' + orient.n);
  ok('DocumentNos are Odoo\'s own S000xx series', orient.docNoShape, orient.sampleDocNos.join(','));
  ok('GATING: GardenWorld holds orders but ZERO bleed into the Odoo grid', orient.gwTotal > 0 && orient.gwShown === 0, 'gwInDb=' + orient.gwTotal + ' gwShown=' + orient.gwShown);

  // ── J3 READ (W-CRITIC-READ) ───────────────────────────────────────────────────────────────────────
  // open the first order row → the record form
  await page.evaluate(() => {
    const r = document.querySelector('.idmp-grid tr[data-ad-record]') || document.querySelector('.idmp-cards [data-ad-record]');
    if (r) r.click();
  });
  await page.waitForSelector('[data-ad-column]', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(700);

  const read = await page.evaluate(() => {
    const ad = window.__idmpDb;
    const form = document.querySelector('form[data-ad-record], [data-ad-record] [data-ad-column]') ? document : document;
    const recEl = document.querySelector('[data-ad-column]');
    const recId = recEl ? Number((recEl.closest('[data-ad-record]') || {}).getAttribute && recEl.closest('[data-ad-record]').getAttribute('data-ad-record')) : null;
    function fieldText(col) {
      const f = document.querySelector('[data-ad-column="' + col + '"]');
      if (!f) return null;
      const inp = f.querySelector('input,select,textarea');
      return (inp ? (inp.value != null ? inp.value : inp.textContent) : f.textContent).trim();
    }
    const docNoUi = fieldText('DocumentNo');
    const bpUi = fieldText('C_BPartner_ID');
    let docNoDb = null, bpName = null;
    if (recId) {
      try { const r = ad.exec('SELECT DocumentNo, C_BPartner_ID FROM C_Order WHERE C_Order_ID=' + recId); if (r.length) { docNoDb = r[0].values[0][0]; const bpId = r[0].values[0][1];
        const b = ad.exec('SELECT Name FROM C_BPartner WHERE C_BPartner_ID=' + bpId); bpName = b.length ? b[0].values[0][0] : null; } } catch (e) {}
    }
    // strip the field LABEL prefix so we compare the rendered VALUE (fields render as label+value)
    const docVal = docNoDb && String(docNoUi || '').indexOf(String(docNoDb)) >= 0 ? docNoDb : docNoUi;
    return { recId, docNoUi, bpUi, docNoDb, bpName, docVal,
      docMatches: !!docNoDb && String(docNoUi || '').indexOf(String(docNoDb)) >= 0,
      bpMatches: !!bpName && String(bpUi || '').indexOf(String(bpName)) >= 0 };
  });
  console.log('§CRITIC-READ recId=' + read.recId + ' docNoUi="' + read.docNoUi + '" docNoDb=' + read.docNoDb
    + ' bpUi="' + read.bpUi + '" bpName="' + read.bpName + '"');
  ok('order form opened on a real Odoo record', !!read.recId);
  ok('header DocumentNo renders from the db row (UI shows the db DocumentNo)', read.docMatches, read.docNoUi + ' ⊇ ' + read.docNoDb);
  ok('Business Partner renders as a HUMAN NAME, not a raw FK id (refresolve)', read.bpMatches, 'ui="' + read.bpUi + '" name="' + read.bpName + '"');

  // record-info: drive the actual ⓘ affordance → the popup opens and ANSWERS (even "no changes yet" is an
  // honest op-log answer for a pristine seed record). The fold is in window.__crud.recordInfo (proven by recinfo_live).
  const riClicked = await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('#idmp-toolbar button, .idmp-pill, [title]'))
      .find(x => (x.title || '').indexOf('Record info') === 0);
    if (b) { b.click(); return true; }
    return false;
  });
  await page.waitForTimeout(400);
  const riPopup = await page.evaluate(() => {
    const ov = document.getElementById('idmp-recinfo-ov');
    return { present: !!ov, text: ov ? ov.textContent.replace(/\s+/g, ' ').slice(0, 100) : '',
      foldCallable: !!(window.__crud && typeof window.__crud.recordInfo === 'function') };
  });
  console.log('§CRITIC-READ recinfo clicked=' + riClicked + ' popup=' + riPopup.present + ' "' + riPopup.text + '"');
  ok('record-info ⓘ affordance opens + answers from the op-log fold', riClicked && riPopup.present && riPopup.foldCallable, riPopup.text);

  ok('0 pageerrors', errs.length === 0, errs.length ? errs.slice(0, 3).join(' | ') : '');

  // critic verdict line (honest, no hype)
  const verdict = (fail === 0)
    ? 'CRITIC ✔ I oriented into Odoo and read its own sales order in one deep-link; the grid is unmistakably Odoo (S000xx, 0 GardenWorld bleed) and the BP reads as a name, not a code. I would pick this over a stock iDempiere window for orient+read.'
    : 'CRITIC ✘ a leg dead-ended — see the 🔴 above; NOT pickable over the incumbent until fixed.';
  console.log('\n§CRITIC-VERDICT(J2-J3) ' + verdict);
  console.log((fail === 0 ? '✅' : '❌') + ' W-CRITIC-ORIENT+READ-LIVE: ' + pass + '/' + (pass + fail) + ' PASS (' + fail + ' FAIL)');
  await browser.close(); server.close();
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('FATAL', e); try { server.close(); } catch (x) {} process.exit(1); });
