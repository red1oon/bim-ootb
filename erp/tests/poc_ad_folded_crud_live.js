// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser §-witness for S2B AD-FOLDED CRUD GENERALITY (W-AD-FOLDED-CRUD-LIVE). The ISSUE: today only
//   the curated 5 document tables (crud_ops.json) are editable; the user's principle is "rules general not custom"
//   (Janke/Compiere AD vision) — EVERY window editable per its OWN dictionary. This proves a NON-curated table,
//   Business Partner (C_BPartner, window 123), is now New/Edit/Delete-capable purely from the AD fold, with the
//   SIGNED write path unchanged. crud_ops becomes an OPTIONAL override, not the gate.
//   PROVES (and HONESTLY records any gap):
//     SETUP — open Business Partner (c_bpartner: not in crud_ops, not a view) → §S2B-FOLD verbs=[create,update,delete].
//     ACT 1 — CREATE: New pill → folded create form (ring NOT fanned) → fill mandatory fields → Save → ONE signed
//        CRUD_CREATE (verifyChain=ok); the row APPEARS (synthetic pk) and SURVIVES reload.
//     ACT 2 — EDIT: open the created BP → Edit pill (ring NOT fanned) → an IsUpdateable='N' field (AD_Org_ID) is
//        DISPLAY-ONLY (disabled); change Name → Save → ONE signed CRUD_UPDATE; the new Name SURVIVES reload.
//     ACT 3 — DELETE: Delete pill → confirm → ONE signed CRUD_DELETE; the row DISAPPEARS and the hide SURVIVES reload.
//     ACT 4 — VIEW read-only: the SAME engine folds a view (AD_Table.IsView='Y') to NO verbs (read-only).
//     0 pageerrors.
//   §-log first — READ tests/poc_ad_folded_crud_live.log before any conclusion (exit code is NOT evidence).
// Run:  node tests/poc_ad_folded_crud_live.js   (cwd = bim-ootb/erp)
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
// fill every mandatory editable field on the open folded create form (iDempiere asks for these on a New BP)
async function fillBpForm(page, marker) {
  await page.evaluate((m) => {
    const form = document.getElementById('crudForm'); if (!form) return;
    const set = (col, val) => { const el = form.querySelector('[data-col="' + col + '"]'); if (!el || el.disabled) return;
      if (el.tagName === 'SELECT' && !Array.from(el.options).some(o => String(o.value) === String(val))) { const o = document.createElement('option'); o.value = val; o.textContent = val; el.appendChild(o); }
      el.value = val; el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('input', { bubbles: true })); };
    set('value', m); set('name', m); set('c_bp_group_id', '103');
    ['iscustomer', 'isvendor', 'isemployee', 'issalesrep', 'issummary', 'isprospect', 'ispotaxexempt', 'is1099vendor'].forEach(c => set(c, c === 'iscustomer' ? 'Y' : 'N'));
    set('so_creditlimit', '0');
    // generic sweep — any still-empty, enabled, REQUIRED field (the * marker is shown) gets a sane value by type
    form.querySelectorAll('.cfrow').forEach(row => {
      const req = row.querySelector('.req'); const el = row.querySelector('[data-col]');
      if (!el || el.disabled) return;
      const required = req && req.style.display !== 'none';
      if (required && (el.value == null || el.value === '')) {
        if (el.tagName === 'SELECT') { const opt = Array.from(el.options).find(o => o.value); if (opt) el.value = opt.value; }
        else { el.value = el.type === 'number' ? '0' : 'N'; }
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
  }, marker);
  await page.waitForTimeout(300);
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
  const anyLog = (re) => logs.some(l => re.test(l));

  const bpUrl = `http://localhost:${port}/idempiere.html?seed=ad_seed.db&login=GardenAdmin&window=123`;
  await gotoTenant(page, bpUrl);
  await page.waitForSelector('.idmp-grid tbody tr[data-ad-record]', { timeout: 8000 }).catch(() => {});
  const basePks = (await gridPks(page)).filter(p => p > 0);
  console.log('§FOLD-CRUD setup window=123 table=c_bpartner baseRealPks=' + JSON.stringify(basePks));
  ok('Business Partner window opens with existing C_BPartner rows (a NON-curated table)', basePks.length >= 1, 'pks=' + JSON.stringify(basePks));
  // c_bpartner is NOT in the curated crud_ops store
  const curated = await page.evaluate(() => { try { const st = window.__crud.store && window.__crud.store(); return !!(st && Object.prototype.hasOwnProperty.call(st, 'c_bpartner')); } catch (e) { return null; } });
  ok('c_bpartner is NOT in the curated crud_ops allow-list (proves generality, not a hand-list)', curated === false, 'curatedHas=' + curated);

  // ════════════ ACT 1 — FOLD + CREATE ════════════
  await openRow(page, basePks[0]);
  await tapPill(page, 'formnew');
  await page.waitForSelector('#crudForm.open', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(700);
  const foldLog = lastLog(/§S2B-FOLD table=c_bpartner/);
  console.log('§FOLD-CRUD ACT1 fold="' + foldLog + '"');
  ok('§S2B-FOLD derived create/update/delete verbs for c_bpartner FROM the AD', /verbs=\[create,update,delete\]/.test(foldLog) && /isView=false/.test(foldLog), foldLog);
  ok('New opened a create form (NOT the "not in crud_ops" skip)', anyLog(/§CRUD-HOSTCREATE table=c_bpartner open=create-form/) && !anyLog(/§CRUD-HOSTCREATE table=c_bpartner skipped/), '');
  const marker = 'S2B-BP-' + Math.floor(port);
  await fillBpForm(page, marker);
  const newRingFanned = await ringOpen(page);
  await page.evaluate(() => { const s = document.getElementById('cfSave'); if (s) s.click(); });
  await page.waitForTimeout(1500);
  const rejected = lastLog(/§CRUD validate key=c_bpartner verb=create REJECT/);
  await backToGrid(page);
  const afterCreate = await gridPks(page);
  const createdPk = afterCreate.filter(p => p < 0)[0];
  const persistC = lastLog(/§CRUD-PERSIST .*op=CRUD_CREATE/);
  console.log('§FOLD-CRUD ACT1 createdPk=' + createdPk + ' ringFanned=' + newRingFanned + ' reject="' + rejected + '" persist="' + persistC + '"');
  ok('CREATE: ONE signed CRUD_CREATE (verifyChain=ok), row appears, ring not fanned, no validate-reject',
    /op=CRUD_CREATE.*verifyChain=ok/.test(persistC) && createdPk < 0 && !newRingFanned && !rejected, 'createdPk=' + createdPk);

  // RELOAD → the created BP survives
  await gotoTenant(page, bpUrl);
  await page.waitForSelector('.idmp-grid tbody tr[data-ad-record]', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const reloadPks1 = await gridPks(page);
  ok('CREATE SURVIVES reload (the new BP re-folds after a fresh load)', reloadPks1.indexOf(createdPk) >= 0, 'pks=' + JSON.stringify(reloadPks1));
  const draftPk = createdPk;

  // ════════════ ACT 2 — EDIT (IsUpdateable=N display-only) ════════════
  await openRow(page, draftPk);
  await tapPill(page, 'formedit');
  await page.waitForSelector('#crudForm.open', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(600);
  const editState = await page.evaluate(() => {
    const f = document.getElementById('crudForm'), r = document.getElementById('crudRing');
    const org = f && f.querySelector('[data-col="ad_org_id"]'), nm = f && f.querySelector('[data-col="name"]');
    return { open: !!(f && f.classList.contains('open')), ring: !!(r && r.classList.contains('open')),
             title: f ? (f.querySelector('.cfh') || {}).textContent : null,
             orgDisabled: !!(org && org.disabled), nameDisabled: !!(nm && nm.disabled) };
  });
  console.log('§FOLD-CRUD ACT2 editState=' + JSON.stringify(editState));
  ok('Edit opens the edit form DIRECTLY (ring not fanned)', editState.open && !editState.ring && /Edit/.test(String(editState.title || '')), JSON.stringify(editState));
  ok('IsUpdateable=N field (AD_Org_ID) is DISPLAY-ONLY on edit; an updateable field (Name) is editable', editState.orgDisabled === true && editState.nameDisabled === false, 'orgDisabled=' + editState.orgDisabled + ' nameDisabled=' + editState.nameDisabled);
  const marker2 = marker + '-EDIT';
  await page.evaluate((m) => { const d = document.querySelector('#crudForm [data-col="name"]'); if (d) { d.value = m; d.dispatchEvent(new Event('input', { bubbles: true })); d.dispatchEvent(new Event('change', { bubbles: true })); } }, marker2);
  await page.evaluate(() => { const s = document.getElementById('cfSave'); if (s) s.click(); });
  await page.waitForTimeout(1500);
  await backToGrid(page);
  const persistU = lastLog(/§CRUD-PERSIST .*op=CRUD_UPDATE/);
  console.log('§FOLD-CRUD ACT2 persist="' + persistU + '"');
  ok('UPDATE: ONE signed CRUD_UPDATE (verifyChain=ok)', /op=CRUD_UPDATE.*verifyChain=ok/.test(persistU), persistU);
  // RELOAD → the edited Name survives
  await gotoTenant(page, bpUrl);
  await page.waitForSelector('.idmp-grid tbody tr[data-ad-record]', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await openRow(page, draftPk);
  await tapPill(page, 'formedit');
  await page.waitForSelector('#crudForm.open', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(600);
  const reloadName = await page.evaluate(() => { const d = document.querySelector('#crudForm [data-col="name"]'); return d ? d.value : null; });
  console.log('§FOLD-CRUD ACT2 RELOAD name="' + reloadName + '" (want "' + marker2 + '")');
  ok('UPDATE SURVIVES reload (the edited Name re-folds)', String(reloadName) === marker2, 'got="' + reloadName + '"');
  await page.evaluate(() => { const c = document.getElementById('cfCancel'); if (c) c.click(); });
  await page.waitForTimeout(300); await backToGrid(page);

  // ════════════ ACT 3 — DELETE ════════════
  await openRow(page, draftPk);
  await tapPill(page, 'formdel');
  await page.waitForSelector('#crudForm.open', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(400);
  const delRing = await ringOpen(page);
  await page.evaluate(() => { const d = document.getElementById('cfDel'); if (d) d.click(); });
  await page.waitForTimeout(1400);
  await backToGrid(page);
  const afterDel = await gridPks(page);
  const persistD = lastLog(/§CRUD-PERSIST .*op=CRUD_DELETE/);
  console.log('§FOLD-CRUD ACT3 gone=' + (afterDel.indexOf(draftPk) < 0) + ' ringFanned=' + delRing + ' persist="' + persistD + '"');
  ok('DELETE: ONE signed CRUD_DELETE (verifyChain=ok), ring not fanned, row disappears', /op=CRUD_DELETE.*verifyChain=ok/.test(persistD) && !delRing && afterDel.indexOf(draftPk) < 0, persistD);
  await gotoTenant(page, bpUrl);
  await page.waitForSelector('.idmp-grid tbody tr[data-ad-record]', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const reloadPks2 = await gridPks(page);
  ok('DELETE SURVIVES reload (the deleted BP stays gone)', reloadPks2.indexOf(draftPk) < 0, 'pks=' + JSON.stringify(reloadPks2));

  // ════════════ ACT 4 — VIEW read-only (the SAME engine the host folds with) ════════════
  const viewVerbs = await page.evaluate(() => {
    try { return window.__crud.core.foldCrudSpec([{ columnName: 'X', name: 'X', isDisplayed: true, referenceType: 'string' }], { key: 'rv_unposted', isView: true }).verbs; } catch (e) { return null; }
  });
  ok('a VIEW (AD_Table.IsView=Y) folds to NO verbs — correctly read-only', Array.isArray(viewVerbs) && viewVerbs.length === 0, JSON.stringify(viewVerbs));

  ok('0 pageerrors across all folded-CRUD acts', errs.length === 0, errs.length ? errs.slice(0, 3).join(' | ') : '');

  const verdict = fail === 0;
  console.log('\n§CRITIC-VERDICT(AD-FOLDED-CRUD) ' + (verdict ? '✅' : '🔴') + ' — CRUD is now GENERAL, not curated: a '
    + 'window whose table is NOT in crud_ops (Business Partner) is New/Edit/Delete-capable purely from its OWN AD '
    + '(foldCrudSpec), each op ONE signed write that survives reload; an IsUpdateable=N field is display-only on '
    + 'Edit; a VIEW table is read-only. The signed write path is unchanged — only the spec SOURCE moved to the dict.');
  console.log((verdict ? '✅' : '❌') + ' W-AD-FOLDED-CRUD-LIVE: ' + pass + '/' + (pass + fail) + ' PASS (' + fail + ' FAIL)');
  if (process.env.DUMP) { console.log('\n── PAGE §-LOGS ──'); logs.filter(l => /§(S2B|CRUD|LIST-TIP|FORM-PILL|AD-MODELVAL|DOCNO)/.test(l)).forEach(l => console.log('  ' + l)); }
  await browser.close(); server.close();
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('FATAL', e); try { server.close(); } catch (x) {} process.exit(1); });
