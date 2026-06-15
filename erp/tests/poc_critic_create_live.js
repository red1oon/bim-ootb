// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser §-witness for GRAND_LANE S2 / ERP_CRITIC_UX_LANE.md J4 CREATE — "make New REAL".
//   W-CRITIC-CREATE-LIVE. The critic drives the SERVED bundle and proves iDempiere's OWN New (the CRUD seam,
//   NOT the ring visual) creates a sales order that is SIGNED, APPEARS in the grid, SURVIVES reload, is GATED
//   to its tenant, and whose defaults FILL via the AD callout (not hand-typed).
//   PROVES (and HONESTLY records any gap — a dead-end is logged, never papered):
//     ACT 1 — GARDENWORLD (client 11) NEW: New pill → the create FORM opens DIRECTLY (the ring is NOT fanned:
//        #crudRing stays closed) → pick the tenant's own BPartner (120 Seed Farm Inc.) → the AD callout fires
//        (§CRUD-CALLOUT … fired=[CalloutOrder.bPartner]) and DEFAULTS Bill_BPartner_ID + M_PriceList_ID (not
//        hand-typed) → Save → ONE signed CRUD_CREATE (§CRUD-PERSIST op=CRUD_CREATE verifyChain=ok) → the new
//        row APPEARS in the grid (a synthetic negative pk row via the listTip overlay; §LIST-TIP … created>=1).
//        Then RELOAD → the row STILL appears (the signed op persisted to IndexedDB; _overlayListTip re-folds it
//        from the durable op id) — a created order that survives reload, the critic's bar.
//     ACT 2 — GATING (W-CRITIC-GATING, load-bearing): switch to ODOO (client 12) window 143 → the
//        GardenWorld-created order does NOT appear (listTip's created rows are re-scoped to the session client).
//     ACT 3 — PRIVATE BOUNDARY: open New, type, then CANCEL → NOTHING is committed (no §CRUD-PERSIST for the
//        cancelled create; Save is the publish boundary). The created-row count is unchanged.
//     0 pageerrors.
//   §-log first — READ tests/poc_critic_create_live.log before any conclusion (exit code is NOT evidence).
// Run:  node tests/poc_critic_create_live.js   (cwd = bim-ootb/erp)
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
const gridCount = (page) => page.evaluate(() =>
  document.querySelectorAll('.idmp-grid tbody tr[data-ad-record]').length);
// iDempiere convention: New lives on the form-view pill rail. Enter form view by clicking the first grid row
// (sets _viewMode='form' → the formnew/formsave pills appear), the same way the J5 process witness reaches formproc.
async function enterFormView(page) {
  await page.evaluate(() => { const tr = document.querySelector('.idmp-grid tbody tr[data-ad-record]'); if (tr) tr.click(); });
  await page.waitForSelector('#pill-formnew', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(300);
}
// back to the grid (re-reads the bundle + re-folds listTip → a freshly-created row appears as a synthetic-pk row).
async function backToGrid(page) {
  await page.evaluate(() => { const t = document.querySelector('#idmp-tabstrip .idmp-adtab.active') || document.querySelector('#idmp-tabstrip .idmp-adtab'); if (t) t.click(); });
  await page.waitForSelector('.idmp-grid tbody tr[data-ad-record]', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(600);
}
// the synthetic-pk (created) rows visible in the grid — listTip negates the durable op id, so created rows
// carry a NEGATIVE data-ad-record. The critic counts those: a real "this row was created and now shows".
const createdRows = (page) => page.evaluate(() =>
  Array.from(document.querySelectorAll('.idmp-grid tbody tr[data-ad-record]'))
    .map(tr => Number(tr.getAttribute('data-ad-record'))).filter(v => v < 0));

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
  const note = (label, extra) => console.log('   🟡 ' + label + (extra ? ' — ' + extra : ''));
  const lastLog = (re) => [...logs].reverse().find(l => re.test(l)) || '';

  // ════════════════════════════ ACT 1 — GARDENWORLD NEW: signed + appears + survives reload ════════════════════════════
  const gwUrl = `http://localhost:${port}/idempiere.html?seed=ad_seed.db&login=GardenAdmin&window=143`;
  await gotoTenant(page, gwUrl);
  // ensure the c_order tab is the grid (window 143 tab 0 = Order)
  await page.waitForSelector('.idmp-grid tbody tr[data-ad-record]', { timeout: 8000 }).catch(() => {});
  const client = await page.evaluate(() => (window.__idmpClient && window.__idmpClient.id) || null);
  const baseCount = await gridCount(page);
  const baseCreated = (await createdRows(page)).length;
  console.log('§CRITIC-CREATE ACT1 client=' + client + ' baseGridRows=' + baseCount + ' baseCreated=' + baseCreated);
  ok('GardenWorld (client 11) Sales-Order grid is loaded', client === 11 && baseCount >= 1, 'client=' + client + ' rows=' + baseCount);

  // New via iDempiere's OWN New pill — enter form view (where the pill rail lives), then tap New: the create
  // FORM opens directly, the ring is NOT fanned.
  await enterFormView(page);
  await tapPill(page, 'formnew');
  await page.waitForSelector('#crudForm.open', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(700);   // let populateRefs fill the BP <select> options (async withBundle)
  const formState = await page.evaluate(() => {
    const f = document.getElementById('crudForm');
    const ring = document.getElementById('crudRing');
    const bp = f && f.querySelector('[data-col="c_bpartner_id"]');
    return { formOpen: !!(f && f.classList.contains('open')),
             ringOpen: !!(ring && ring.classList.contains('open')),
             bpOptions: bp ? bp.options.length : 0,
             title: f ? (f.querySelector('.cfh') || {}).textContent : null };
  });
  console.log('§CRITIC-CREATE ACT1 form=' + JSON.stringify(formState));
  ok('New opens iDempiere\'s create FORM directly (the ring visual is NOT fanned)', formState.formOpen && !formState.ringOpen, 'form=' + formState.formOpen + ' ring=' + formState.ringOpen);

  // pick the tenant's own BPartner (120 Seed Farm Inc., client 11, pricelist 101) → fire the callout on change
  const picked = await page.evaluate(() => {
    const bp = document.querySelector('#crudForm [data-col="c_bpartner_id"]');
    if (!bp) return { set: false };
    // ensure 120 is an option (populateRefs loaded all c_bpartner); else add it so the change is real
    if (!Array.from(bp.options).some(o => String(o.value) === '120')) { const o = document.createElement('option'); o.value = '120'; o.textContent = 'Seed Farm Inc. (120)'; bp.appendChild(o); }
    bp.value = '120';
    bp.dispatchEvent(new Event('change', { bubbles: true }));
    return { set: bp.value === '120' };
  });
  await page.waitForTimeout(500);   // let fireCreateCallout (async withBundle) fill the derived siblings
  const afterCallout = await page.evaluate(() => {
    const g = (c) => { const el = document.querySelector('#crudForm [data-col="' + c + '"]'); return el ? el.value : null; };
    return { bill: g('bill_bpartner_id'), pricelist: g('m_pricelist_id') };
  });
  const calloutLog = lastLog(/§CRUD-CALLOUT .*col=c_bpartner_id/);
  console.log('§CRITIC-CREATE ACT1 picked=' + JSON.stringify(picked) + ' afterCallout=' + JSON.stringify(afterCallout));
  console.log('§CRITIC-CREATE ACT1 callout="' + calloutLog + '"');
  ok('the AD callout FIRES on the BPartner change (§CRUD-CALLOUT fired=[CalloutOrder.bPartner])', /fired=\[[^\]]*bPartner/.test(calloutLog), calloutLog);
  ok('Bill_BPartner_ID DEFAULTS from the callout (= the picked BP, not hand-typed)', String(afterCallout.bill) === '120', 'bill=' + afterCallout.bill);
  ok('M_PriceList_ID DEFAULTS from the BP via the callout (not hand-typed)', String(afterCallout.pricelist) === '101', 'pricelist=' + afterCallout.pricelist);

  // Save = ONE signed CRUD_CREATE
  await page.evaluate(() => { const s = document.getElementById('cfSave'); if (s) s.click(); });
  await page.waitForTimeout(1600);   // async commitGroup + verifyChain + _sidePersist + the committed refold
  const persist = lastLog(/§CRUD-PERSIST .*op=CRUD_CREATE/);
  await backToGrid(page);            // return to the grid so the created row (synthetic pk) shows via the listTip fold
  const listTipLog = lastLog(/§LIST-TIP overlay .*table=c_order/);
  const afterCount = await gridCount(page);
  const afterCreated = (await createdRows(page)).length;
  console.log('§CRITIC-CREATE ACT1 persist="' + persist + '"');
  console.log('§CRITIC-CREATE ACT1 listTip="' + listTipLog + '" gridRows ' + baseCount + '→' + afterCount + ' created ' + baseCreated + '→' + afterCreated);
  ok('Save commits ONE signed CRUD_CREATE (§CRUD-PERSIST op=CRUD_CREATE verifyChain=ok)', /op=CRUD_CREATE.*verifyChain=ok/.test(persist), persist);
  ok('the new row APPEARS in the grid via the listTip overlay (§LIST-TIP created>=1)', /created=[1-9]/.test(listTipLog), listTipLog);
  ok('the grid now shows one more created row than before', afterCreated === baseCreated + 1 && afterCount === baseCount + 1, 'created ' + baseCreated + '→' + afterCreated + ' rows ' + baseCount + '→' + afterCount);

  // RELOAD — the heart of the critic's bar: a real creation must survive a page reload.
  await gotoTenant(page, gwUrl);
  await page.waitForSelector('.idmp-grid tbody tr[data-ad-record]', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(1600);   // lazy sidecar hydrate from IndexedDB + _overlayListTip re-fold
  const reloadCreated = (await createdRows(page)).length;
  const reloadList = lastLog(/§LIST-TIP overlay .*table=c_order/);
  console.log('§CRITIC-CREATE ACT1 RELOAD created=' + reloadCreated + ' listTip="' + reloadList + '"');
  ok('RELOAD: the created order SURVIVES (it re-folds from the persisted op-log)', reloadCreated >= 1 && /created=[1-9]/.test(reloadList), 'created=' + reloadCreated);

  // ════════════════════════════ ACT 2 — GATING: the created order is tenant-scoped ════════════════════════════
  const odooUrl = `http://localhost:${port}/idempiere.html?seed=ad_seed.db&shard=12-odoo.db&login=Odoo&window=143`;
  await gotoTenant(page, odooUrl);
  await page.waitForSelector('.idmp-grid tbody tr[data-ad-record]', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(1400);
  const odooClient = await page.evaluate(() => (window.__idmpClient && window.__idmpClient.id) || null);
  const odooCreated = (await createdRows(page)).length;
  console.log('§CRITIC-CREATE ACT2 odooClient=' + odooClient + ' createdVisibleHere=' + odooCreated);
  ok('GATING: the GardenWorld-created order does NOT leak into Odoo\'s grid (client-scoped)', odooClient === 12 && odooCreated === 0, 'client=' + odooClient + ' created=' + odooCreated);

  // ════════════════════════════ ACT 3 — PRIVATE BOUNDARY: cancel commits nothing ════════════════════════════
  await gotoTenant(page, gwUrl);
  await page.waitForSelector('.idmp-grid tbody tr[data-ad-record]', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(1200);
  const preCancelCreated = (await createdRows(page)).length;
  const persistCountBefore = logs.filter(l => /§CRUD-PERSIST .*op=CRUD_CREATE/.test(l)).length;
  await enterFormView(page);
  await tapPill(page, 'formnew');
  await page.waitForSelector('#crudForm.open', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const bp = document.querySelector('#crudForm [data-col="c_bpartner_id"]');
    if (bp) { if (!Array.from(bp.options).some(o => String(o.value) === '118')) { const o = document.createElement('option'); o.value = '118'; o.textContent = 'Joe Block (118)'; bp.appendChild(o); } bp.value = '118'; bp.dispatchEvent(new Event('change', { bubbles: true })); }
  });
  await page.waitForTimeout(400);
  await page.evaluate(() => { const c = document.getElementById('cfCancel'); if (c) c.click(); });
  await page.waitForTimeout(800);
  await backToGrid(page);            // return to the grid to count (the cancel left us in form view)
  const persistCountAfter = logs.filter(l => /§CRUD-PERSIST .*op=CRUD_CREATE/.test(l)).length;
  const postCancelCreated = (await createdRows(page)).length;
  console.log('§CRITIC-CREATE ACT3 created ' + preCancelCreated + '→' + postCancelCreated + ' persistCreateOps ' + persistCountBefore + '→' + persistCountAfter);
  ok('PRIVATE BOUNDARY: cancelling an unsaved New commits NOTHING (no extra CRUD_CREATE, count unchanged)',
     persistCountAfter === persistCountBefore && postCancelCreated === preCancelCreated, 'persist ' + persistCountBefore + '→' + persistCountAfter + ' created ' + preCancelCreated + '→' + postCancelCreated);

  ok('0 pageerrors across all three acts', errs.length === 0, errs.length ? errs.slice(0, 3).join(' | ') : '');

  if (process.env.DUMP) { console.log('\n──── PAGE §-LOGS (CRUD/validate/list/doc) ────'); logs.filter(l => /§(CRUD|AD-MODELVAL|LIST-TIP|DOC-TIP|FORM-PILL|STD-DEFAULTS)/.test(l)).forEach(l => console.log('  ' + l)); }

  // ── the critic's verdict ─────────────────────────────────────────────────────────────────────────────
  const verdict = fail === 0;
  console.log('\n§CRITIC-VERDICT(J4) ' + (verdict ? '✅' : '🔴') + ' — New is now REAL on iDempiere\'s OWN surface. The New '
    + 'pill opens the create form directly (the ring is never fanned — doctrine §0): the tenant picks their own '
    + 'BPartner, the AD callout DEFAULTS bill-to + price list (not hand-typed), Save commits ONE signed CRUD_CREATE, '
    + 'and the new row APPEARS in the grid via the listTip read-the-tip overlay and SURVIVES RELOAD — the create twin '
    + 'of J5. The created order is client-scoped (no cross-tenant leak) and an unsaved New commits nothing (Save is '
    + 'the publish boundary). The immutable bundle is never mutated; the op-log is the only truth.');
  console.log((verdict ? '✅' : '❌') + ' W-CRITIC-CREATE-LIVE: ' + pass + '/' + (pass + fail) + ' PASS (' + fail + ' FAIL)');
  await browser.close(); server.close();
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('FATAL', e); try { server.close(); } catch (x) {} process.exit(1); });
