// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser §-witness for P2 of the iDempiere-FAITHFUL IN-PLACE CRUD lane
//   (prompts/CRUD_INPLACE_EDIT_SESSION.md §P2; FRONTEND_LANE_MASTER §OUTSTANDING top item). W-INPLACE-EDIT-LIVE.
//   THE ISSUE this test proves/disproves: does the iDempiere FORM VIEW render directly-editable inputs in place
//     (iDempiere-faithful — the form IS the editable surface), with NO #crudForm modal and NO ✎ Edit button, and
//     does an in-place edit Save commit the SAME signed CRUD_UPDATE (survives reload) while Ignore reverts the
//     unsaved delta? Source of truth = the iDempiere ZK ADWindowToolbar (Save/Ignore dirty-gated, no Edit button).
//
//   ACT (GardenWorld Business Partner, window 123 — the editable tenant, the user's named c_bpartner case):
//     open a record into FORM view → assert the inline editor mounted (§INPLACE-EDIT, #idmp-inline-mount) and
//     NO modal / NO ✎ Edit button; Save+Ignore start DISABLED (not dirty); type into a field → Save+Ignore ENABLE
//     (dataStatusChanged parity); click Ignore → the field reverts + Save disables (§INPLACE-IGNORE = dataIgnore);
//     type again → Save → assert a signed CRUD_UPDATE persisted (§CRUD-PERSIST / §CRUD-COMMIT-LIVE) with NO ring
//     fan (§CRUD ring view=on NEVER); reload → the edit SURVIVES (the op-log tip folds onto the bundle). 0 pageerrors.
//   §-log first — READ tests/poc_inplace_edit_live.log before any conclusion (exit code is NOT evidence).
// Run:  node tests/poc_inplace_edit_live.js   (cwd = bim-ootb/erp)
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

// land in FORM view on the first real record
async function openFormView(page) {
  await page.waitForSelector('[data-ad-table]', { timeout: 20000 }).catch(async () => {
    const u = await page.$('#idmp-login-users .idmp-login-user:not(.disabled)');
    if (u) { await u.click(); const okb = await page.$('#idmp-login-ok'); if (okb) await okb.click(); }
    await page.waitForSelector('[data-ad-table]', { timeout: 15000 }).catch(() => {});
  });
  await page.waitForSelector('.idmp-grid tbody tr[data-ad-record]', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(800);
  await page.evaluate(() => { const tr = document.querySelector('.idmp-grid tbody tr[data-ad-record]'); if (tr) tr.click(); });
  await page.waitForSelector('#idmp-inline-mount .cfrow', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(500);
}

// state of the inline editor + first editable text field
const probe = (page) => page.evaluate(() => {
  const mount = document.getElementById('idmp-inline-mount');
  const save = mount && mount.querySelector('.ic-vb[data-v="save"]');
  const ign = mount && mount.querySelector('.ic-vb[data-v="ignore"]');
  // prefer a real text field (name/value/description) — robust against fk/number columns
  const pref = ['name', 'value', 'description', 'taxid', 'duns'];
  let inp = null;
  if (mount) {
    for (const c of pref) { const e = mount.querySelector('input.cfi[type="text"][data-col="' + c + '"]:not([disabled])'); if (e) { inp = e; break; } }
    if (!inp) inp = mount.querySelector('input.cfi[type="text"]:not([disabled])') || mount.querySelector('input.cfi:not([disabled])');
  }
  return {
    mounted: !!mount, hasModal: !!document.querySelector('#crudForm.open'),
    editBtn: Array.from(document.querySelectorAll('#idmp-toolbar button')).some(b => /✎\s*Edit/.test(b.textContent || '')),
    saveDisabled: save ? save.disabled : null, ignDisabled: ign ? ign.disabled : null,
    col: inp ? inp.getAttribute('data-col') : null, val: inp ? inp.value : null
  };
});

// type `v` into the inline field for column `col` and fire input/change
const typeField = (page, col, v) => page.evaluate(({ col, v }) => {
  const el = document.querySelector('#idmp-inline-mount input.cfi[data-col="' + col + '"]');
  if (!el) return false;
  el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}, { col, v });

const clickVerb = (page, v) => page.evaluate((v) => {
  const b = document.querySelector('#idmp-inline-mount .ic-vb[data-v="' + v + '"]');
  if (b && !b.disabled) { b.click(); return true; } return false;
}, v);

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const browser = await chromium.launch();
  console.log('\n§INPLACE-EDIT ===== the iDempiere form view is editable IN PLACE (no modal, no ✎ Edit) =====');

  const logs = [], errs = [];
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  page.on('console', m => logs.push(m.text()));
  page.on('pageerror', e => errs.push(e.message));
  const anyLog = re => logs.some(l => re.test(l));

  const boot = 'seed=ad_seed.db&login=GardenAdmin&window=123';
  await page.goto(`http://localhost:${port}/idempiere.html?${boot}`, { waitUntil: 'networkidle' });
  await openFormView(page);

  // ── T1/T2: the form mounts editable in place; no modal, no ✎ Edit; Save/Ignore start disabled (clean) ──
  let s = await probe(page);
  console.log('§INPLACE-EDIT[mount] mounted=' + s.mounted + ' modal=' + s.hasModal + ' editBtn=' + s.editBtn
    + ' saveDisabled=' + s.saveDisabled + ' ignDisabled=' + s.ignDisabled + ' field=' + s.col + ' val="' + s.val + '"');
  ok('the form view renders the inline editor in place (§INPLACE-EDIT, #idmp-inline-mount)', s.mounted && anyLog(/§INPLACE-EDIT table=c_bpartner/), 'mounted=' + s.mounted);
  ok('NO #crudForm modal opens for the form edit', !s.hasModal);
  ok('NO ✎ Edit button on the toolbar (it is retired — the form is directly editable)', !s.editBtn);
  ok('Save + Ignore start DISABLED (not dirty — dataStatusChanged parity)', s.saveDisabled === true && s.ignDisabled === true);
  ok('found an editable text field to drive', !!s.col, 'col=' + s.col);

  const col = s.col, orig = s.val == null ? '' : s.val, edited = (orig + ' [edit]').slice(0, 38);

  // ── T3: type → dirty enables Save/Ignore; Ignore reverts to the saved tip ──
  await typeField(page, col, edited); await page.waitForTimeout(250);
  let d = await probe(page);
  ok('typing a field ENABLES Save + Ignore (the record is now dirty)', d.saveDisabled === false && d.ignDisabled === false, 'save=' + d.saveDisabled + ' ign=' + d.ignDisabled);
  await clickVerb(page, 'ignore'); await page.waitForTimeout(300);
  let r = await probe(page);
  ok('Ignore reverts the field to the saved tip + re-disables Save (§INPLACE-IGNORE = dataIgnore)', r.val === orig && r.saveDisabled === true && anyLog(/§INPLACE-IGNORE table=c_bpartner/), 'val="' + r.val + '" expect="' + orig + '"');

  // ── T4: type again → Save → signed CRUD_UPDATE, no ring fan ──
  await typeField(page, col, edited); await page.waitForTimeout(250);
  await clickVerb(page, 'save'); await page.waitForTimeout(1400);
  const persisted = anyLog(/§CRUD-PERSIST/) || anyLog(/§CRUD-COMMIT-LIVE/);
  const ringFan = anyLog(/§CRUD ring .*view=on/) || anyLog(/§CRUD-IDMP-OPEN/);
  ok('Save commits the SAME signed write path (§CRUD-PERSIST / §CRUD-COMMIT-LIVE)', persisted);
  ok('the Glass/Gravity ring NEVER fans on this surface (signed seam, no ring)', !ringFan);
  const afterSave = await probe(page);
  ok('after Save the editor re-mounts clean (Save disabled, value = the edit)', afterSave.saveDisabled === true && afterSave.val === edited, 'val="' + afterSave.val + '"');

  // ── T4 (persist): reload → the edit SURVIVES (op-log tip folds onto the immutable bundle) ──
  await page.goto(`http://localhost:${port}/idempiere.html?${boot}`, { waitUntil: 'networkidle' });
  await openFormView(page);
  const reloaded = await probe(page);
  console.log('§INPLACE-EDIT[reload] col=' + col + ' val="' + reloaded.val + '" expect="' + edited + '"');
  ok('the edit SURVIVES a reload (the signed CRUD_UPDATE persisted)', reloaded.val === edited, 'val="' + reloaded.val + '"');

  ok('0 pageerrors across the run', errs.length === 0, errs.slice(0, 3).join(' | '));
  await page.close();

  const verdict = (fail === 0)
    ? 'CRITIC ✔ The iDempiere form view is editable IN PLACE — directly-editable inputs, NO modal, NO ✎ Edit button; Save+Ignore are dirty-gated (dataStatusChanged), Ignore reverts the unsaved delta (dataIgnore), and Save commits the SAME signed CRUD_UPDATE that survives a reload — with the Glass/Gravity ring never fanning. iDempiere-faithful in-place CRUD (P2).'
    : 'CRITIC ✘ the in-place edit surface is not faithful yet — see the 🔴 above.';
  console.log('\n§INPLACE-EDIT-VERDICT ' + verdict);
  console.log((fail === 0 ? '✅' : '❌') + ' W-INPLACE-EDIT-LIVE: ' + pass + '/' + (pass + fail) + ' PASS (' + fail + ' FAIL)');
  await browser.close(); server.close();
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('FATAL', e); try { server.close(); } catch (x) {} process.exit(1); });
