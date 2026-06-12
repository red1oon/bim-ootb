// ⚠ DO NOT REMOVE — Scope guard
// Scope: §-witness for INSTALL → WORLD-HISTORY DOT (CONSISTENCY_FINISH.md §K-3, W-INSTALL-DOT).
//   PROVES the issue: "the W timeline records BUILDING_OPEN and every committed doc moment, but the
//   LARGEST state change a user can make — a tenant becoming resident via Install — left NO history
//   trace." After the fix, installShard()'s persisted success-path mirrors ONE entry into the
//   cross-page log (WholeHistory.record → bim.docHistory):
//     §A INSTALL-DOT — dialog-drive the Odoo install (the W-INSTALL-PERSIST skeleton) → persisted=Y
//                      AND §WHOLE-REC page=idempiere label="Installed 12-odoo.db (…)" fired.
//     §B IN-LOG      — localStorage bim.docHistory carries the entry (page=idempiere, kind=op).
//     §C NOT-SIGNED  — deliberate asymmetry: the dot is a MIRROR, not a signed op (install =
//                      infrastructure, outside the Z fold lane) — kernel op-log untouched by install.
//   §-log first — READ tests/poc_install_histdot.log before any conclusion.
// Run:  node tests/poc_install_histdot.js 2>&1 | tee tests/poc_install_histdot.log   (cwd = bim-ootb/erp)
'use strict';
let chromium;
try { ({ chromium } = require(__dirname + '/../../tests/node_modules/playwright')); }
catch (e) { ({ chromium } = require(process.env.HOME + '/bim-ootb/tests/node_modules/playwright')); }
const http = require('http'), fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.db': 'application/octet-stream', '.png': 'image/png', '.css': 'text/css', '.wasm': 'application/wasm' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/idempiere.html';
  // ../common/* from idempiere.html normalizes to /common/* — serve it from the sibling dir
  // (the real deployment serves common/ next to erp/; without this the W log never loads).
  const fsPath = p.indexOf('/common/') === 0 ? path.join(ROOT, '..', p) : path.join(ROOT, p);
  fs.readFile(fsPath, (e, buf) => {
    if (e) { res.writeHead(404); res.end('404 ' + p); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
    res.end(buf);
  });
});

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('  ✗ FAIL: ' + m); } else { console.log('  ✓ ' + m); } };

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port, base = `http://localhost:${port}/idempiere.html`;
  const logs = [], errs = [];
  const browser = await chromium.launch();
  const page = await (await browser.newContext()).newPage();   // fresh IDB + localStorage
  page.on('console', m => logs.push(m.text()));
  page.on('pageerror', e => errs.push(e.message));
  const since = (tag) => logs.filter(l => l.indexOf(tag) >= 0).slice(-1)[0] || '(no ' + tag + ')';

  console.log('\n══ W-INSTALL-DOT — installing a tenant leaves a World-history dot ══\n');

  await page.goto(base, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__idmpDb, null, { timeout: 15000 });
  await page.waitForTimeout(600);

  // ── §A: dialog-drive the install (same skeleton as W-INSTALL-PERSIST) ──
  await page.evaluate(() => window.ErpPicker.open({ mode: 'install' }));
  await page.waitForSelector('#ep-c-odoo', { timeout: 5000 });
  await page.click('#ep-c-odoo');
  await page.waitForSelector('#ep-go:not([disabled])', { timeout: 5000 });
  await page.click('#ep-go');
  await page.waitForSelector('#ep-chain', { state: 'attached', timeout: 5000 });
  await page.setInputFiles('#ep-chain', path.join(ROOT, 'odoo_chain.json'));
  await page.waitForSelector('#ep-install-go', { timeout: 8000 });
  await page.click('#ep-install-go');
  await page.waitForFunction(() => !!document.getElementById('ep-reload'), null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(400);

  const aInstall = since('§ERP-INSTALL'), aRec = since('§WHOLE-REC');
  console.log('§HISTDOT-A ' + aInstall);
  console.log('§HISTDOT-A ' + aRec);
  ok(/persisted=Y/.test(aInstall), 'install persisted=Y (precondition — the dot only fires on the persisted path)');
  ok(/page=idempiere/.test(aRec) && /Installed 12-odoo\.db/.test(aRec),
    '§WHOLE-REC fired for the install (page=idempiere, label names the shard)');

  // ── §B: the entry is IN the cross-page log ──
  const entry = await page.evaluate(() => {
    try {
      const arr = JSON.parse(localStorage.getItem('bim.docHistory') || '[]');
      return arr.filter(e => /^Installed /.test(e.label || '')).slice(-1)[0] || null;
    } catch (e) { return null; }
  });
  console.log('§HISTDOT-B entry=' + JSON.stringify(entry));
  ok(!!entry, 'bim.docHistory carries the Installed entry');
  ok(entry && entry.page === 'idempiere' && (entry.kind === 'op' || entry.type === 'op'),
    'entry shape: page=idempiere kind=op');
  ok(entry && /rows/.test(entry.label) && /clients/.test(entry.label),
    'label carries the real merge facts (rows + clients), nothing invented');

  // ── §C: deliberate asymmetry — install wrote NO signed kernel op (mirror only) ──
  const kernelTouched = logs.some(l => l.indexOf('§KRN_COMMIT') >= 0 || l.indexOf('§KRN_PERSIST') >= 0);
  console.log('§HISTDOT-C kernel-op-lines=' + (kernelTouched ? 'PRESENT' : 'none'));
  ok(!kernelTouched, 'install stays OUTSIDE the signed op-log (infrastructure, not a Z-fold-able doc op)');

  console.log('\n' + (fails === 0 && errs.length === 0 ? '🟢 W-INSTALL-DOT PASS' : '🔴 W-INSTALL-DOT FAIL (' + fails + ' asserts, ' + errs.length + ' pageErrors)')
    + ' — a resident-tenant install now leaves exactly one honest World-history dot. pageErrors=' + (errs.length ? errs.join('|') : 0));
  await browser.close();
  server.close();
  process.exit(fails === 0 && errs.length === 0 ? 0 : 1);
})().catch(e => { console.error('PROBE-ERR', e); server.close(); process.exit(2); });
