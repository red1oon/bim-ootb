// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser §-witness for Leg 4 of the iDempiere L&F FIDELITY lane (RESUME_IDMP_FIDELITY.md §SPEC Leg 4):
//   the DIRTY-EXIT GATE (iDempiere AbstractADWindowContent.onExit → Dialog.ask "CloseUnSave?"). The form view is
//   directly editable in place, so opening a record mounts an inline edit form. W-DIRTY-GATE PROVES:
//     U — navigating off a CLEAN record (untouched edit form) does NOT prompt (formNeedsSave=false → proceed).
//     A — after a real field edit, navigating (Next record) is BLOCKED by the iDempiere-style confirm
//         (#idmp-dirty-ov) and §DIRTY-GATE prompt is logged.
//     B — "Cancel" KEEPS the form and it stays dirty (§DIRTY-GATE choice=cancel).
//     C — "Close without saving" proceeds: the gate clears, nav lands on a fresh (clean) record
//         (§DIRTY-GATE choice=discard).
//   DOM/console only. 0 pageerrors. §-log first — READ tests/poc_dirty_gate_live.log first.
// Run:  node tests/poc_dirty_gate_live.js 2>&1 | tee tests/poc_dirty_gate_live.log   (cwd = bim-ootb/erp)
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const MIME = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json',
  '.db':'application/octet-stream', '.png':'image/png', '.jpg':'image/jpeg', '.css':'text/css', '.wasm':'application/wasm' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/idempiere.html';
  fs.readFile(path.join(ROOT, p), (e, buf) => {
    if (e) { res.writeHead(404); res.end('404 ' + p); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(buf);
  });
});
const clickToolbar = (page, re) => page.evaluate((rs) => {
  const tb = document.getElementById('idmp-toolbar');
  const b = tb && Array.from(tb.querySelectorAll('button')).find(x => new RegExp(rs, 'i').test((x.textContent || '') + ' ' + x.title));
  if (b && !b.disabled) { b.click(); return true; } return false;
}, re.source);

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const errs = [], logs = [];
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { const t = m.text(); if (/^§DIRTY-GATE/.test(t)) logs.push(t); });
  page.on('dialog', d => d.accept().catch(() => {}));   // a dirty beforeunload would hang — auto-dismiss

  await page.goto(`http://localhost:${port}/idempiere.html?client=garden&window=123`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#idmp-login-users .idmp-login-user:not(.disabled)', { timeout: 15000 });
  await page.click('#idmp-login-users .idmp-login-user:not(.disabled)');
  await page.waitForSelector('#idmp-login-ok', { timeout: 5000 });
  await page.click('#idmp-login-ok');
  await page.waitForSelector('[data-ad-table]', { timeout: 20000 });
  await page.waitForTimeout(800);

  const inlineOpen = () => page.evaluate(() => !!document.getElementById('idmp-inline-mount'));
  const dialogOpen = () => page.evaluate(() => !!document.getElementById('idmp-dirty-ov'));
  const needsSave = () => page.evaluate(() => !!(window.__crud && window.__crud.formNeedsSave && window.__crud.formNeedsSave()));
  const editField = () => page.evaluate(() => {
    const m = document.getElementById('idmp-inline-mount'); if (!m) return null;
    const inp = Array.from(m.querySelectorAll('input')).find(i => {
      const t = (i.getAttribute('type') || 'text').toLowerCase();
      return !i.disabled && !i.readOnly && (t === 'text' || t === 'search' || t === '');
    });
    if (!inp) return null;
    inp.focus(); inp.value = (inp.value || '') + ' Zz';
    inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('change', { bubbles: true }));
    return inp.getAttribute('data-col') || inp.name || 'field';
  });

  // open a record in form view (auto-mounts the inline edit form)
  await page.evaluate(() => {
    const row = document.querySelector('#idmp-content table tbody tr') || document.querySelector('#idmp-content .idmp-card');
    if (row) row.click();
  });
  await page.waitForTimeout(600);
  const mounted = await inlineOpen();

  // ── ACT U — navigate off a CLEAN form: no prompt ──
  const cleanBefore = await needsSave();
  await clickToolbar(page, /Next record/);
  await page.waitForTimeout(400);
  const U = { mounted: mounted, clean: !cleanBefore, dialog: await dialogOpen(), promptLogged: logs.some(t => /^§DIRTY-GATE prompt/.test(t)) };
  console.log('§DGW-U inlineMounted=' + U.mounted + ' cleanForm=' + U.clean + ' promptShown=' + U.dialog + ' promptLogged=' + U.promptLogged);
  const actU = U.mounted && U.clean && !U.dialog && !U.promptLogged;

  // ── ACT A — edit a field, then navigate: blocked ──
  const edited = await editField();
  await page.waitForTimeout(200);
  const dirty = await needsSave();
  await clickToolbar(page, /Next record/);
  await page.waitForTimeout(400);
  const A = { edited: edited, dirty: dirty, dialog: await dialogOpen(), promptLogged: logs.some(t => /^§DIRTY-GATE prompt/.test(t)) };
  console.log('§DGW-A editedCol=' + A.edited + ' dirty=' + A.dirty + ' promptShown=' + A.dialog + ' promptLogged=' + A.promptLogged);
  const actA = !!A.edited && A.dirty && A.dialog && A.promptLogged;

  // ── ACT B — Cancel keeps the form, still dirty ──
  await page.evaluate(() => { const ov = document.getElementById('idmp-dirty-ov'); const b = ov && Array.from(ov.querySelectorAll('button')).find(x => /^Cancel$/i.test((x.textContent || '').trim())); if (b) b.click(); });
  await page.waitForTimeout(300);
  const B = { dialogGone: !(await dialogOpen()), stillInline: await inlineOpen(), stillDirty: await needsSave(), cancelLogged: logs.some(t => /^§DIRTY-GATE choice=cancel/.test(t)) };
  console.log('§DGW-B afterCancel inlineKept=' + B.stillInline + ' stillDirty=' + B.stillDirty + ' cancelLogged=' + B.cancelLogged);
  const actB = B.dialogGone && B.stillInline && B.stillDirty && B.cancelLogged;

  // ── ACT C — Discard proceeds: nav lands on a fresh clean record ──
  await clickToolbar(page, /Next record/);
  await page.waitForTimeout(300);
  await page.evaluate(() => { const ov = document.getElementById('idmp-dirty-ov'); const b = ov && Array.from(ov.querySelectorAll('button')).find(x => /Close without saving/i.test(x.textContent || '')); if (b) b.click(); });
  await page.waitForTimeout(600);
  const C = { dialogGone: !(await dialogOpen()), nowClean: !(await needsSave()), discardLogged: logs.some(t => /^§DIRTY-GATE choice=discard/.test(t)) };
  console.log('§DGW-C afterDiscard dialogGone=' + C.dialogGone + ' landedClean=' + C.nowClean + ' discardLogged=' + C.discardLogged);
  const actC = C.dialogGone && C.nowClean && C.discardLogged;

  const pass = actU && actA && actB && actC && errs.length === 0;
  console.log('§W-DIRTY-GATE ACT_U=' + actU + ' ACT_A=' + actA + ' ACT_B=' + actB + ' ACT_C=' + actC + ' pageErrors=' + (errs.length ? errs.slice(0, 2).join('|') : 0));
  console.log('§W-DIRTY-GATE-RESULT ' + (pass ? 'PASS' : 'FAIL'));
  await browser.close(); server.close(); process.exit(pass ? 0 : 1);
})().catch(e => { console.error('§W-DIRTY-GATE-RESULT FAIL ' + e.message); process.exit(1); });
