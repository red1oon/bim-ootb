// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser WIRING §-witness for FRONTEND_LANE_MASTER.md §OUTSTANDING items 0 (BLUE FUTURE) + 3b
//   (PER-FIELD LINEAGE). VALUE correctness is headless (scripts/poc_blue_future.js 9/9 + poc_field_lineage.js
//   6/6). This proves only that the LIVE idempiere.html page wires the parts:
//   (1) kernel v9 loaded → KernelOps.branchOps/discardBranch/acceptBranchUpTo present (Blue Future engine live);
//   (2) crud v8 loaded → __crud.fieldLineage + __crud.core.fieldLineage present;
//   (3) the lineage hover module mounted → window.__lineageHover.{resolve,show,hide};
//   (4) idempiere.html grid <td> is tagged data-ad-col (the hover resolve target);
//   (5) LIVE fieldLineage round-trips on the page's sql.js sidecar (seed 2 ops → 2 entries newest-first);
//   (6) the hover RESOLVES a real-shaped cell + show() reveals the blurb (§LINEAGE-HOVER + tooltip visible).
//   §-log first — READ tests/poc_blue_lineage_live.log before any conclusion (exit code is NOT evidence).
// Run:  node tests/poc_blue_lineage_live.js   (cwd = bim-ootb/erp)
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

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const logs = [], errs = [];
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('console', m => logs.push(m.text()));
  page.on('pageerror', e => errs.push(e.message));

  await page.goto(`http://localhost:${port}/idempiere.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  let pass = 0, fail = 0;
  const ok = (label, cond, extra) => { console.log('   ' + (cond ? '🟢' : '🔴') + ' ' + label + (extra ? ' — ' + extra : '')); cond ? pass++ : fail++; };

  // (1) kernel v9 — Blue Future engine live
  const k = await page.evaluate(() => ({
    banner: (window.KernelOps && true) || false,
    branchOps: !!(window.KernelOps && typeof window.KernelOps.branchOps === 'function'),
    discard: !!(window.KernelOps && typeof window.KernelOps.discardBranch === 'function'),
    accept: !!(window.KernelOps && typeof window.KernelOps.acceptBranchUpTo === 'function')
  }));
  ok('kernel v9: KernelOps.branchOps/discardBranch/acceptBranchUpTo present (Blue Future engine)',
     k.branchOps && k.discard && k.accept, JSON.stringify(k));

  // (2) crud v8 — fieldLineage exposed
  const c = await page.evaluate(() => ({
    crud: !!(window.__crud && typeof window.__crud.fieldLineage === 'function'),
    core: !!(window.__crud && window.__crud.core && typeof window.__crud.core.fieldLineage === 'function')
  }));
  ok('crud v8: __crud.fieldLineage + core.fieldLineage present', c.crud && c.core, JSON.stringify(c));

  // (3) lineage hover module mounted
  const h = await page.evaluate(() => !!(window.__lineageHover && typeof window.__lineageHover.resolve === 'function'
    && typeof window.__lineageHover.show === 'function'));
  ok('lineageHover module mounted (window.__lineageHover.resolve/show/hide)', h);

  // (4) idempiere.html grid <td> tagged data-ad-col (artifact check on the served page source)
  const html = fs.readFileSync(path.join(ROOT, 'idempiere.html'), 'utf8');
  ok("idempiere.html buildGrid tags <td> with data-ad-col", /setAttribute\('data-ad-col'/.test(html));

  // (5) LIVE fieldLineage round-trips on the page sidecar (seed CREATE + UPDATE → 2 entries newest-first)
  const round = await page.evaluate(async () => {
    function withSide() { return new Promise(res => window.__crud.withSidecar(function (db) { res(db); })); }
    const SIDE = await withSide();
    if (!SIDE) return { err: 'no sidecar' };
    const K = window.KernelOps;
    await K.commitGroup(SIDE, [{ op_type: 'CRUD_CREATE', params: { table: 'c_order', key: 'c_order',
      fields: { C_Order_ID: 8888, GrandTotal: 1000 }, stdDefaults: { actor: 'liveAlice' } } }], { gid: 'live-c', baseTs: 1700000000000 });
    await K.commitGroup(SIDE, [{ op_type: 'CRUD_UPDATE', params: { table: 'c_order', id: 8888,
      changes: { GrandTotal: { old: 1000, 'new': 1200 } }, actor: 'liveBob' } }], { gid: 'live-u', baseTs: 1700000001000 });
    const lin = window.__crud.fieldLineage('c_order', 8888, 'GrandTotal');
    return { n: lin.length, vals: lin.map(e => e.value), actors: lin.map(e => e.actor) };
  });
  ok('LIVE fieldLineage round-trip: 2 entries newest-first (1200 then 1000)',
     round && round.n === 2 && JSON.stringify(round.vals) === JSON.stringify([1200, 1000]), JSON.stringify(round));

  // (6) hover resolves a real-shaped cell + show() reveals the blurb
  const hov = await page.evaluate(() => {
    var tr = document.createElement('tr');
    tr.setAttribute('data-ad-table', 'c_order'); tr.setAttribute('data-ad-record', '8888');
    var td = document.createElement('td'); td.setAttribute('data-ad-col', 'GrandTotal'); td.textContent = '1200';
    tr.appendChild(td);
    var tbl = document.createElement('table'); tbl.appendChild(tr); document.body.appendChild(tbl);
    var ctx = window.__lineageHover.resolve(td);
    if (!ctx) return { resolved: false };
    window.__lineageHover.show(ctx, 120, 120);
    var tip = document.querySelector('.idmp-lineage');
    var shown = tip && tip.style.display === 'block';
    var html = tip ? tip.innerHTML : '';
    return { resolved: true, table: ctx.table, id: ctx.id, column: ctx.column, shown: shown,
             hasVal: /1200/.test(html) && /1000/.test(html) };
  });
  const hovLog = [...logs].reverse().find(l => l.startsWith('§LINEAGE-HOVER')) || '(none)';
  console.log('§LINEAGE-HOVER-LIVE ' + hovLog);
  ok('hover resolves (table,id,column) + show() reveals blurb with the value history',
     hov && hov.resolved && hov.table === 'c_order' && hov.id === '8888' && hov.column === 'GrandTotal'
     && hov.shown && hov.hasVal && /§LINEAGE-HOVER/.test(hovLog), JSON.stringify(hov));

  // (7) no page errors
  ok('0 pageerrors', errs.length === 0, errs.length ? errs.join(' | ') : '');

  console.log('\n' + (fail === 0 ? '✅' : '❌') + ' W-BLUE-LINEAGE-LIVE: ' + pass + '/' + (pass + fail) + ' PASS (' + fail + ' FAIL)');
  await browser.close(); server.close();
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('FATAL', e); server.close(); process.exit(1); });
