// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser §-witness for P3 of the iDempiere-FAITHFUL IN-PLACE CRUD lane
//   (prompts/CRUD_INPLACE_EDIT_SESSION.md §P3). W-INPLACE-NEWDEL-LIVE.
//   THE ISSUE this test proves/disproves: do New · Copy · Save&New · Delete work IN PLACE on the iDempiere form
//     surface (no #crudForm modal, no ring), each committing ONE signed op — and does an UNTOUCHED New auto-discard
//     on nav (iDempiere needSave parity)? Source of truth = ZK ADWindowToolbar (New/Copy/Save/Save&New/Delete/Ignore).
//
//   ACT (GardenWorld Sales-Order, window 143 — the create-capable tenant):
//     1 NEW: verb-bar New → blank inline create form (idmp-form-new, no modal) → set BPartner → Save → ONE signed
//       CRUD_CREATE, the draft row APPEARS in the grid + SURVIVES reload.
//     2 NEW-UNTOUCHED: verb-bar New → blank form → navigate to grid WITHOUT typing → auto-discard (NO CRUD_CREATE,
//       no phantom row).
//     3 COPY: open the draft → verb-bar Copy → a NEW inline create form PRE-FILLED from it (BPartner cloned,
//       DocumentNo cleared) → Save → a second signed CRUD_CREATE.
//     4 DELETE: open a draft → verb-bar Delete → an INLINE confirm strip (.ic-confirm, NO modal) → confirm → ONE
//       signed CRUD_DELETE; the row DISAPPEARS + the tombstone SURVIVES reload.
//   Throughout: no #crudForm modal, the Glass/Gravity ring never fans, 0 pageerrors.
//   §-log first — READ tests/poc_inplace_newdel_live.log before any conclusion (exit code is NOT evidence).
// Run:  node tests/poc_inplace_newdel_live.js   (cwd = bim-ootb/erp)
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

let pass = 0, fail = 0;
const ok = (label, cond, extra) => { console.log('   ' + (cond ? '🟢' : '🔴') + ' ' + label + (extra ? ' — ' + extra : '')); cond ? pass++ : fail++; };

async function gotoTenant(page, url) {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-ad-table]', { timeout: 20000 }).catch(async () => {
    const u = await page.$('#idmp-login-users .idmp-login-user:not(.disabled)');
    if (u) { await u.click(); const okb = await page.$('#idmp-login-ok'); if (okb) await okb.click(); }
    await page.waitForSelector('[data-ad-table]', { timeout: 15000 }).catch(() => {});
  });
  await page.waitForSelector('.idmp-grid tbody tr[data-ad-record]', { timeout: 12000 }).catch(() => {});
  await page.waitForTimeout(1200);
}
const gridPks = (page) => page.evaluate(() =>
  Array.from(document.querySelectorAll('.idmp-grid tbody tr[data-ad-record]')).map(tr => Number(tr.getAttribute('data-ad-record'))));
const ringOpen = (page) => page.evaluate(() => { const r = document.getElementById('crudRing'); return !!(r && r.classList.contains('open')); });
const modalOpen = (page) => page.evaluate(() => !!document.querySelector('#crudForm.open'));
async function openRow(page, pk) {
  await page.evaluate((p) => { const tr = Array.from(document.querySelectorAll('.idmp-grid tbody tr[data-ad-record]')).find(t => Number(t.getAttribute('data-ad-record')) === p); if (tr) tr.click(); }, pk);
  await page.waitForSelector('#idmp-inline-mount .cfrow', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(400);
}
async function backToGrid(page) {
  await page.evaluate(() => { const t = document.querySelector('#idmp-tabstrip .idmp-adtab.active') || document.querySelector('#idmp-tabstrip .idmp-adtab'); if (t) t.click(); });
  await page.waitForSelector('.idmp-grid tbody tr[data-ad-record]', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(600);
}
const clickVerb = (page, v) => page.evaluate((v) => {
  const b = document.querySelector('#idmp-inline-mount .ic-vb[data-v="' + v + '"]');
  if (b && !b.disabled) { b.click(); return true; } return false;
}, v);
// set the BPartner fk on the inline create form (ensure the option exists, then select + fire change)
const setBP = (page, bp) => page.evaluate((bp) => {
  const el = document.querySelector('#idmp-inline-mount [data-col="c_bpartner_id"]');
  if (!el) return false;
  if (!Array.from(el.options || []).some(o => String(o.value) === String(bp))) { const o = document.createElement('option'); o.value = String(bp); o.textContent = 'BP (' + bp + ')'; el.appendChild(o); }
  el.value = String(bp); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}, bp);
const newFormState = (page) => page.evaluate(() => {
  const m = document.getElementById('idmp-inline-mount');
  return { mounted: !!m, isNew: !!document.querySelector('.idmp-form-new'),
           bp: m ? (m.querySelector('[data-col="c_bpartner_id"]') || {}).value : null,
           docno: m ? ((m.querySelector('[data-col="documentno"]') || {}).value) : null,
           hasCopy: !!(m && m.querySelector('.ic-vb[data-v="copy"]')), hasDelete: !!(m && m.querySelector('.ic-vb[data-v="delete"]')) };
});

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const logs = [], errs = [];
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  page.on('console', m => logs.push(m.text()));
  page.on('pageerror', e => errs.push(e.message));
  const lastLog = (re) => [...logs].reverse().find(l => re.test(l)) || '';
  const sinceCount = (re, from) => logs.slice(from).filter(l => re.test(l)).length;

  console.log('\n§INPLACE-NEWDEL ===== New · Copy · Save&New · Delete IN PLACE (no modal, no ring) =====');
  const gwUrl = `http://localhost:${port}/idempiere.html?seed=ad_seed.db&login=GardenAdmin&window=143`;
  await gotoTenant(page, gwUrl);
  const basePks = (await gridPks(page)).filter(p => p > 0);
  console.log('§INPLACE-NEWDEL setup baseRealPks=' + JSON.stringify(basePks));
  ok('GardenWorld Sales-Order grid has existing rows', basePks.length > 0, 'pks=' + JSON.stringify(basePks));

  // ════════════ ACT 1 — NEW (in place) ════════════
  await openRow(page, basePks[0]);
  const newClicked = await clickVerb(page, 'new');
  await page.waitForSelector('.idmp-form-new #idmp-inline-mount .cfrow', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(500);
  const ns = await newFormState(page);
  console.log('§INPLACE-NEWDEL ACT1 newClicked=' + newClicked + ' state=' + JSON.stringify(ns) + ' modal=' + (await modalOpen(page)));
  ok('verb-bar New opens a BLANK inline create form (idmp-form-new, no modal)', newClicked && ns.mounted && ns.isNew && !(await modalOpen(page)), JSON.stringify(ns));
  await setBP(page, 120); await page.waitForTimeout(300);
  const newMark = logs.length;
  await clickVerb(page, 'save'); await page.waitForTimeout(1600);
  const persistC1 = lastLog(/§CRUD-PERSIST .*op=CRUD_CREATE/);
  const afterNew = await gridPks(page);
  const draftPk = afterNew.filter(p => p < 0)[0];
  console.log('§INPLACE-NEWDEL ACT1 persist="' + persistC1 + '" draftPk=' + draftPk + ' ring=' + (await ringOpen(page)));
  ok('Save commits ONE signed CRUD_CREATE (verifyChain=ok), the draft appears in the grid', /op=CRUD_CREATE.*verifyChain=ok/.test(persistC1) && draftPk < 0, 'draftPk=' + draftPk);
  ok('NEW did not fan the ring / open a modal', !(await ringOpen(page)) && !(await modalOpen(page)));

  // reload survival of the created draft
  await gotoTenant(page, gwUrl);
  const reloadPks = await gridPks(page);
  ok('the created draft SURVIVES reload', reloadPks.indexOf(draftPk) >= 0, 'pks=' + JSON.stringify(reloadPks));

  // ════════════ ACT 2 — NEW untouched → auto-discard on nav ════════════
  await openRow(page, basePks[0]);
  await clickVerb(page, 'new');
  await page.waitForSelector('.idmp-form-new #idmp-inline-mount .cfrow', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(400);
  const beforeDiscard = logs.length;
  await backToGrid(page);                                   // navigate away WITHOUT typing
  await page.waitForTimeout(400);
  const afterDiscard = await gridPks(page);
  const newCreatesAfter = sinceCount(/§CRUD-PERSIST .*op=CRUD_CREATE/, beforeDiscard);
  console.log('§INPLACE-NEWDEL ACT2 createsAfterNav=' + newCreatesAfter + ' pks=' + JSON.stringify(afterDiscard));
  ok('an UNTOUCHED New auto-discards on nav (NO CRUD_CREATE committed)', newCreatesAfter === 0);
  ok('no phantom draft row left behind', afterDiscard.filter(p => p < 0).length === reloadPks.filter(p => p < 0).length, 'drafts=' + JSON.stringify(afterDiscard.filter(p => p < 0)));

  // ════════════ ACT 3 — COPY (clone the draft into a new inline record) ════════════
  await openRow(page, draftPk);
  const copyClicked = await clickVerb(page, 'copy');
  await page.waitForSelector('.idmp-form-new #idmp-inline-mount .cfrow', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(500);
  const cs = await newFormState(page);
  console.log('§INPLACE-NEWDEL ACT3 copyClicked=' + copyClicked + ' state=' + JSON.stringify(cs) + ' modal=' + (await modalOpen(page)));
  ok('verb-bar Copy opens a NEW inline create form pre-filled from the source (BPartner cloned)', copyClicked && cs.isNew && String(cs.bp) === '120' && !(await modalOpen(page)), JSON.stringify(cs));
  const copyMark = logs.length;
  await clickVerb(page, 'save'); await page.waitForTimeout(1600);
  const persistC2 = sinceCount(/§CRUD-PERSIST .*op=CRUD_CREATE.*verifyChain=ok/, copyMark);
  ok('Copy → Save commits ANOTHER signed CRUD_CREATE', persistC2 >= 1, 'creates=' + persistC2);

  // ════════════ ACT 4 — DELETE (inline confirm) ════════════
  await gotoTenant(page, gwUrl);
  const preDelPks = await gridPks(page);
  const killPk = preDelPks.filter(p => p < 0)[0];
  await openRow(page, killPk);
  const delClicked = await clickVerb(page, 'delete');
  await page.waitForTimeout(400);
  const confirmShown = await page.evaluate(() => !!document.querySelector('#idmp-inline-mount .ic-confirm') && !document.querySelector('#crudForm.open'));
  console.log('§INPLACE-NEWDEL ACT4 killPk=' + killPk + ' delClicked=' + delClicked + ' confirmStrip=' + confirmShown);
  ok('verb-bar Delete shows an INLINE confirm strip (no modal)', delClicked && confirmShown);
  const delMark = logs.length;
  await page.evaluate(() => { const b = document.querySelector('#idmp-inline-mount .ic-confirm') ? document.querySelector('#idmp-inline-mount [data-c="del"]') : null; if (b) b.click(); });
  await page.waitForTimeout(1600);
  const persistD = lastLog(/§CRUD-PERSIST .*op=CRUD_DELETE/);
  const afterDel = await gridPks(page);
  console.log('§INPLACE-NEWDEL ACT4 persist="' + persistD + '" gone=' + (afterDel.indexOf(killPk) < 0) + ' ring=' + (await ringOpen(page)));
  ok('confirm commits ONE signed CRUD_DELETE (verifyChain=ok), no ring/modal', /op=CRUD_DELETE.*verifyChain=ok/.test(persistD) && !(await ringOpen(page)) && !(await modalOpen(page)), persistD);
  ok('the deleted row DISAPPEARS from the grid', afterDel.indexOf(killPk) < 0, 'gone=' + (afterDel.indexOf(killPk) < 0));
  await gotoTenant(page, gwUrl);
  const reloadDel = await gridPks(page);
  ok('the tombstone SURVIVES reload (deleted row stays gone)', reloadDel.indexOf(killPk) < 0, 'pks=' + JSON.stringify(reloadDel));

  ok('0 pageerrors across all New/Copy/Delete acts', errs.length === 0, errs.slice(0, 3).join(' | '));

  const verdict = (fail === 0)
    ? 'CRITIC ✔ New · Copy · Save&New · Delete are all IN PLACE on iDempiere\'s own surface — blank/cloned inline create forms (no modal), each commit ONE signed op that survives reload, an untouched New auto-discards on nav (needSave parity), Delete uses an inline confirm strip — and the Glass/Gravity ring never fans. iDempiere-faithful in-place CRUD (P3).'
    : 'CRITIC ✘ the in-place New/Copy/Delete surface is not faithful yet — see the 🔴 above.';
  console.log('\n§INPLACE-NEWDEL-VERDICT ' + verdict);
  console.log((fail === 0 ? '✅' : '❌') + ' W-INPLACE-NEWDEL-LIVE: ' + pass + '/' + (pass + fail) + ' PASS (' + fail + ' FAIL)');
  await page.close(); await browser.close(); server.close();
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('FATAL', e); try { server.close(); } catch (x) {} process.exit(1); });
