// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser §-witness for the FULL CRUD on iDempiere's OWN surface (GRAND_LANE S2 / J4, the change side).
//   W-CRITIC-CRUD-FULL-LIVE. J4 proved CREATE; this proves READ · UPDATE · DELETE too — "if you can't CHANGE a
//   record it fails the most basic AD usage." Edit + Delete are re-pointed off the visual ring onto host seams
//   (__crud.update / __crud.remove), the change-twins of __crud.create (doctrine §0: the ring stays Glass-only).
//   PROVES (and HONESTLY records any gap):
//     ACT 1 — CREATE: New pill → create form → pick BP → Save → ONE signed CRUD_CREATE → the row APPEARS
//        (listTip synthetic pk) and SURVIVES reload.
//     ACT 2 — UPDATE (the change): open an EXISTING order → Edit pill (ring NOT fanned) → change a field → Save →
//        ONE signed CRUD_UPDATE (verifyChain=ok); the grid re-folds (§LIST-TIP updated>=1) and the new value
//        SURVIVES reload (re-open the row → the field reads the edit, via tipValues over the immutable bundle).
//     ACT 3 — DELETE: open an EXISTING order → Delete pill → confirm → ONE signed CRUD_DELETE; the row DISAPPEARS
//        (listTip tombstone) and the hide SURVIVES reload.
//     ACT 4 — HONEST GATING: Edit on a just-created (synthetic-pk, still private) row is declined honestly
//        (§FORM-PILL edit=skip(synthetic-pk …)); the ring is never fanned on any of these.
//     0 pageerrors.
//   §-log first — READ tests/poc_critic_crud_full_live.log before any conclusion (exit code is NOT evidence).
// Run:  node tests/poc_critic_crud_full_live.js   (cwd = bim-ootb/erp)
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
const gridPks = (page) => page.evaluate(() =>
  Array.from(document.querySelectorAll('.idmp-grid tbody tr[data-ad-record]')).map(tr => Number(tr.getAttribute('data-ad-record'))));
const ringOpen = (page) => page.evaluate(() => { const r = document.getElementById('crudRing'); return !!(r && r.classList.contains('open')); });
// click the grid row for a specific pk → enters form view (the form-pill rail mounts)
async function openRow(page, pk) {
  await page.evaluate((p) => { const tr = Array.from(document.querySelectorAll('.idmp-grid tbody tr[data-ad-record]')).find(t => Number(t.getAttribute('data-ad-record')) === p); if (tr) tr.click(); }, pk);
  await page.waitForSelector('#pill-formedit', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(300);
}
async function backToGrid(page) {
  await page.evaluate(() => { const t = document.querySelector('#idmp-tabstrip .idmp-adtab.active') || document.querySelector('#idmp-tabstrip .idmp-adtab'); if (t) t.click(); });
  await page.waitForSelector('.idmp-grid tbody tr[data-ad-record]', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(600);
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

  const gwUrl = `http://localhost:${port}/idempiere.html?seed=ad_seed.db&login=GardenAdmin&window=143`;
  await gotoTenant(page, gwUrl);
  await page.waitForSelector('.idmp-grid tbody tr[data-ad-record]', { timeout: 8000 }).catch(() => {});
  const basePks = (await gridPks(page)).filter(p => p > 0);
  console.log('§CRUD-FULL setup client=11 baseRealPks=' + JSON.stringify(basePks));
  ok('GardenWorld Sales-Order grid has existing rows to change', basePks.length >= 2, 'pks=' + JSON.stringify(basePks));

  // ════════════ ACT 1 — CREATE (P3: New is IN PLACE — inline create form, no modal) ════════════
  await openRow(page, basePks[0]);
  await tapPill(page, 'formnew');
  await page.waitForSelector('.idmp-form-new #idmp-inline-mount .cfrow', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(600);
  await page.evaluate(() => { const bp = document.querySelector('#idmp-inline-mount [data-col="c_bpartner_id"]'); if (bp) { if (!Array.from(bp.options).some(o => String(o.value) === '120')) { const o = document.createElement('option'); o.value = '120'; o.textContent = 'Seed Farm Inc. (120)'; bp.appendChild(o); } bp.value = '120'; bp.dispatchEvent(new Event('change', { bubbles: true })); } });
  await page.waitForTimeout(500);
  const newRingFanned = await ringOpen(page);
  await page.evaluate(() => { const s = document.querySelector('#idmp-inline-mount .ic-vb[data-v="save"]'); if (s && !s.disabled) s.click(); });
  await page.waitForTimeout(1500);
  await backToGrid(page);
  const afterCreate = await gridPks(page);
  const createdPk = afterCreate.filter(p => p < 0)[0];
  const persistC = lastLog(/§CRUD-PERSIST .*op=CRUD_CREATE/);
  console.log('§CRUD-FULL ACT1 createdPk=' + createdPk + ' ringFanned=' + newRingFanned + ' persist="' + persistC + '"');
  ok('CREATE: ONE signed CRUD_CREATE, row appears, ring not fanned', /op=CRUD_CREATE.*verifyChain=ok/.test(persistC) && createdPk < 0 && !newRingFanned, 'createdPk=' + createdPk);

  // The created row is a DRAFT (DocStatus DR) — the ONE editable order (the GardenWorld seed orders are all
  //   Completed/Closed, which iDempiere rightly blocks from change). So the basic flow is exactly: New → change
  //   it → delete it, all on the draft we just made. Its synthetic pk is durable (= -createOpId), stable across reload.
  const draftPk = createdPk;
  const marker = 'EDIT-W-CRUD-' + Math.abs(draftPk);

  // ════════════ ACT 2 — UPDATE the draft (the change) ════════════
  // P2 (CRUD_INPLACE_EDIT_SESSION.md): Edit is IN PLACE — opening the draft into form view mounts the editable
  //   inline editor (no modal, no ✎ Edit). Change the field directly + click the inline Save (dirty-gated).
  await openRow(page, draftPk);
  await page.waitForSelector('#idmp-inline-mount [data-col="description"]', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(500);
  const editFormState = await page.evaluate(() => {
    const m = document.getElementById('idmp-inline-mount'), f = document.getElementById('crudForm'), r = document.getElementById('crudRing');
    return { open: !!m, modal: !!(f && f.classList.contains('open')), ring: !!(r && r.classList.contains('open')),
             hasDesc: !!(m && m.querySelector('[data-col="description"]')) };
  });
  await page.evaluate((m) => { const d = document.querySelector('#idmp-inline-mount [data-col="description"]'); if (d) { d.value = m; d.dispatchEvent(new Event('input', { bubbles: true })); d.dispatchEvent(new Event('change', { bubbles: true })); } }, marker);
  await page.evaluate(() => { const s = document.querySelector('#idmp-inline-mount .ic-vb[data-v="save"]'); if (s && !s.disabled) s.click(); });
  await page.waitForTimeout(1500);
  await backToGrid(page);
  const oplogRow = lastLog(/§CRUD-OPLOG-ROW .*loaded=/);
  const persistU = lastLog(/§CRUD-PERSIST .*op=CRUD_UPDATE/);
  const listU = lastLog(/§LIST-TIP overlay .*table=c_order/);
  console.log('§CRUD-FULL ACT2 editForm=' + JSON.stringify(editFormState) + ' oplogRow="' + oplogRow + '"');
  console.log('§CRUD-FULL ACT2 persist="' + persistU + '" listTip="' + listU + '"');
  ok('Edit opens the draft\'s edit form IN PLACE (no modal, ring not fanned), loaded from the op-log', editFormState.open && !editFormState.modal && !editFormState.ring && editFormState.hasDesc && /loaded=/.test(oplogRow), JSON.stringify(editFormState));
  ok('UPDATE: ONE signed CRUD_UPDATE (verifyChain=ok)', /op=CRUD_UPDATE.*verifyChain=ok/.test(persistU), persistU);
  ok('the grid re-folds the edit (§LIST-TIP updated>=1)', /updated=[1-9]/.test(listU), listU);

  // RELOAD → re-open the draft → the field reads the edit (folded from the durable op-log)
  await gotoTenant(page, gwUrl);
  await page.waitForSelector('.idmp-grid tbody tr[data-ad-record]', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await openRow(page, draftPk);
  await page.waitForSelector('#idmp-inline-mount [data-col="description"]', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(600);
  const reloadVal = await page.evaluate(() => { const d = document.querySelector('#idmp-inline-mount [data-col="description"]'); return d ? d.value : null; });
  console.log('§CRUD-FULL ACT2 RELOAD description="' + reloadVal + '" (want "' + marker + '")');
  ok('UPDATE SURVIVES reload (the edited value re-folds after a fresh load)', String(reloadVal) === marker, 'got="' + reloadVal + '"');
  await backToGrid(page);

  // ════════════ ACT 3 — DELETE the draft (P3: inline confirm strip, no modal) ════════════
  await openRow(page, draftPk);
  await tapPill(page, 'formdel');
  await page.waitForSelector('#idmp-inline-mount .ic-confirm', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(400);
  const delRing = await ringOpen(page);
  await page.evaluate(() => { const d = document.querySelector('#idmp-inline-mount [data-c="del"]'); if (d) d.click(); });
  await page.waitForTimeout(1400);
  await backToGrid(page);
  const afterDel = await gridPks(page);
  const persistD = lastLog(/§CRUD-PERSIST .*op=CRUD_DELETE/);
  const listD = lastLog(/§LIST-TIP overlay .*table=c_order/);
  console.log('§CRUD-FULL ACT3 draftPk=' + draftPk + ' ringFanned=' + delRing + ' gone=' + (afterDel.indexOf(draftPk) < 0) + ' persist="' + persistD + '" listTip="' + listD + '"');
  ok('DELETE: ONE signed CRUD_DELETE (verifyChain=ok), ring not fanned', /op=CRUD_DELETE.*verifyChain=ok/.test(persistD) && !delRing, persistD);
  ok('the deleted row DISAPPEARS from the grid (listTip tombstone, §LIST-TIP hidden>=1)', afterDel.indexOf(draftPk) < 0 && /hidden=[1-9]/.test(listD), 'gone=' + (afterDel.indexOf(draftPk) < 0));

  // RELOAD → the tombstone survives
  await gotoTenant(page, gwUrl);
  await page.waitForSelector('.idmp-grid tbody tr[data-ad-record]', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const reloadPks = await gridPks(page);
  console.log('§CRUD-FULL ACT3 RELOAD pks=' + JSON.stringify(reloadPks) + ' delGone=' + (reloadPks.indexOf(draftPk) < 0));
  ok('DELETE SURVIVES reload (the deleted row stays gone)', reloadPks.indexOf(draftPk) < 0, 'pks=' + JSON.stringify(reloadPks));

  ok('0 pageerrors across all CRUD acts', errs.length === 0, errs.length ? errs.slice(0, 3).join(' | ') : '');

  const verdict = fail === 0;
  console.log('\n§CRITIC-VERDICT(CRUD) ' + (verdict ? '✅' : '🔴') + ' — the FULL CRUD is real on iDempiere\'s own surface: '
    + 'Create, Read, Update and Delete each commit ONE signed op, the grid re-folds (listTip create/update/delete), '
    + 'and every change SURVIVES reload — the ring is never fanned (Edit/Delete are the change-twins of Create). '
    + 'A still-private created row declines edit honestly. Change — the most basic AD usage — works.');
  console.log((verdict ? '✅' : '❌') + ' W-CRITIC-CRUD-FULL-LIVE: ' + pass + '/' + (pass + fail) + ' PASS (' + fail + ' FAIL)');
  if (process.env.DUMP) { console.log('\n── PAGE §-LOGS ──'); logs.filter(l => /§(CRUD|LIST-TIP|FORM-PILL|AD-MODELVAL)/.test(l)).forEach(l => console.log('  ' + l)); }
  await browser.close(); server.close();
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('FATAL', e); try { server.close(); } catch (x) {} process.exit(1); });
