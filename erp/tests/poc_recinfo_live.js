// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser WIRING §-witness for FRONTEND_LANE_MASTER.md §OUTSTANDING item 3a (RECORD-INFO POPUP).
//   VALUE correctness is headless (bim-compiler scripts/poc_recinfo.js W-RECINFO 9/9). This proves only that the
//   LIVE idempiere.html page wires the parts:
//   (1) crud v10 loaded → window.__crud.recordInfo + __crud.core.recordInfo present (engine on the page);
//   (2) LIVE recordInfo round-trips on the page's sql.js sidecar (seed CREATE+UPDATE → created=liveAlice,
//       updated=liveBob, count=2 — the W-RECINFO fold over real committed ops);
//   (3) the toolbar exposes the "ⓘ" record-info button (the iDempiere (i) affordance at the rec/total slot);
//   (4) clicking it on a real opened record fires §RECINFO-LIVE and reveals the #idmp-recinfo-ov popup.
//   §-log first — READ tests/poc_recinfo_live.log before any conclusion (exit code is NOT evidence).
// Run:  node tests/poc_recinfo_live.js   (cwd = bim-ootb/erp)
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..');
const MIME = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json',
  '.db':'application/octet-stream', '.png':'image/png', '.css':'text/css', '.wasm':'application/wasm' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/idempiere.html';
  fs.readFile(path.join(ROOT, p), (e, buf) => {
    if (e) { res.writeHead(404); res.end('404 ' + p); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
    res.end(buf);
  });
});

async function login(page) {
  await page.evaluate(() => {
    var rows = Array.prototype.slice.call(document.querySelectorAll('#idmp-login-users .idmp-login-user'));
    var r = rows.find(x => !x.classList.contains('disabled')); if (r) r.click();
  });
  await page.waitForTimeout(400);
  await page.click('#idmp-login-ok');
  await page.waitForTimeout(1200);
}

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const base = `http://localhost:${port}/idempiere.html`;
  let logs = [], errs = [];
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('console', m => logs.push(m.text()));
  page.on('pageerror', e => errs.push(e.message));

  await page.goto(base, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2200);
  await login(page);

  let pass = 0, fail = 0;
  const ok = (label, cond, extra) => { console.log('   ' + (cond ? '🟢' : '🔴') + ' ' + label + (extra ? ' — ' + extra : '')); cond ? pass++ : fail++; };

  // (1) crud v10 — recordInfo exposed
  const c = await page.evaluate(() => ({
    crud: !!(window.__crud && typeof window.__crud.recordInfo === 'function'),
    core: !!(window.__crud && window.__crud.core && typeof window.__crud.core.recordInfo === 'function')
  }));
  ok('crud v10: __crud.recordInfo + core.recordInfo present', c.crud && c.core, JSON.stringify(c));

  // (2) LIVE recordInfo round-trip on the page sidecar (CREATE liveAlice + UPDATE liveBob → created/updated/count)
  const round = await page.evaluate(async () => {
    function withSide() { return new Promise(res => window.__crud.withSidecar(function (db) { res(db); })); }
    const SIDE = await withSide(); if (!SIDE) return { err: 'no sidecar' };
    const K = window.KernelOps;
    await K.commitGroup(SIDE, [{ op_type: 'CRUD_CREATE', params: { table: 'c_order', key: 'c_order',
      fields: { C_Order_ID: 7777, GrandTotal: 500 }, stdDefaults: { actor: 'liveAlice' } } }], { gid: 'ri-c', baseTs: 1700000000000 });
    await K.commitGroup(SIDE, [{ op_type: 'CRUD_UPDATE', params: { table: 'c_order', id: 7777,
      changes: { GrandTotal: { old: 500, 'new': 650 } }, actor: 'liveBob' } }], { gid: 'ri-u', baseTs: 1700000001000 });
    const info = window.__crud.recordInfo('c_order', 7777);
    return info ? { created: info.created && info.created.actor, updated: info.updated && info.updated.actor, count: info.count } : { info: null };
  });
  ok('LIVE recordInfo round-trip: created=liveAlice, updated=liveBob, count=2',
     round && round.created === 'liveAlice' && round.updated === 'liveBob' && round.count === 2, JSON.stringify(round));

  // (3)+(4) drive the real menu: expand folders, open the first window that loads records, click the ⓘ button.
  logs = [];
  await page.evaluate(() => {
    document.querySelectorAll('#idmp-tree .idmp-row:not(.leaf)').forEach(function (r) {
      if (r.parentElement && !r.parentElement.classList.contains('open')) r.click();
    });
  });
  await page.waitForTimeout(500);
  const opened = await page.evaluate(async () => {
    function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
    var leaves = Array.prototype.slice.call(document.querySelectorAll('#idmp-tree .idmp-row.leaf'))
      .filter(function (r) { var ic = r.querySelector('.ic'); return ic && ic.textContent === '▤'; });   // ▤ = window
    for (var i = 0; i < leaves.length && i < 15; i++) {
      leaves[i].click(); await sleep(550);
      var nav = document.getElementById('idmp-recnav');
      if (nav && /of [1-9]/.test(nav.textContent)) return { name: leaves[i].dataset.name, nav: nav.textContent };
    }
    return null;
  });
  console.log('§RECINFO-LIVE opened window=' + (opened ? opened.name + ' (' + opened.nav + ')' : 'NONE'));
  ok('opened a real window with records via the menu', !!opened, opened ? JSON.stringify(opened) : 'none loaded');

  const hasBtn = await page.evaluate(() => {
    var b = Array.prototype.slice.call(document.querySelectorAll('#idmp-toolbar button'))
      .find(function (x) { return (x.title || '').indexOf('Record info') === 0; });
    if (b) { b.click(); return true; }
    return false;
  });
  ok('toolbar exposes the ⓘ Record-info button (clicked)', hasBtn);
  await page.waitForTimeout(400);

  const popup = await page.evaluate(() => {
    var ov = document.getElementById('idmp-recinfo-ov');
    return { present: !!ov, text: ov ? ov.textContent.replace(/\s+/g, ' ').slice(0, 140) : '' };
  });
  const riLog = [...logs].reverse().find(l => l.startsWith('§RECINFO-LIVE table=')) || '(none)';
  console.log('§RECINFO-LIVE-CLICK ' + riLog);
  ok('clicking ⓘ reveals the record-info popup (#idmp-recinfo-ov)', popup.present, popup.text);
  ok('§RECINFO-LIVE fired on click', /§RECINFO-LIVE table=/.test(riLog), riLog);

  // (5) no page errors
  ok('0 pageerrors', errs.length === 0, errs.length ? errs.slice(0, 3).join(' | ') : '');

  console.log('\n' + (fail === 0 ? '✅' : '❌') + ' W-RECINFO-LIVE: ' + pass + '/' + (pass + fail) + ' PASS (' + fail + ' FAIL)');
  await browser.close(); server.close();
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('FATAL', e); server.close(); process.exit(1); });
