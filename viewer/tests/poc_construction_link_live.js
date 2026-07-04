// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser §-witness for the §2026-07-04 thread A "zoom to iDempiere" link — Room/storey tap in
//   the Find panel surfaces #find-construction-open, deep-linking into the newly-minted "Construction"
//   AD_Window (7800000, over the same M_Warehouse row window 139 covers) with the real compiled warehouse id.
//   PROVES, on the real viewer + HHS_Office_Federated model (the only building with a seeded warehouse row):
//     - switching the Find axis to Room and tapping a room/storey group shows the "iDempiere ↗" link
//     - its href is ../erp/idempiere.html?client=garden&window=7800000&record=<real m_warehouse_id>
//     - §CONSTRUCTION_LINK is logged with a real warehouse id (not fabricated)
//     - 0 pageerrors
//   §-log first — READ tests/poc_construction_link_live.log before any conclusion (exit code is NOT evidence).
// Run:  node viewer/tests/poc_construction_link_live.js
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.db': 'application/octet-stream', '.png': 'image/png', '.css': 'text/css', '.wasm': 'application/wasm' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/viewer/viewer.html';
  fs.readFile(path.join(ROOT, p), (e, buf) => {
    if (e) { res.writeHead(404); res.end('404 ' + p); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(buf);
  });
});

const log = [], errs = [];
let fails = 0;
function S(m) { log.push(m); console.log(m); }
function verdict(ok, label, detail) { if (!ok) fails++; S('   ' + (ok ? '🟢' : '🔴') + ' ' + label + (detail ? ' — ' + detail : '')); }
const seen = re => log.some(l => re.test(l));

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('console', m => log.push('  [console] ' + m.text()));
  page.on('pageerror', e => { errs.push(String(e)); log.push('  [pageerror] ' + e); });

  S('§W-CONSTRUCTION-LINK — Find Room/storey tap → "zoom to iDempiere" (HHS_Office_Federated)');

  await page.goto('http://127.0.0.1:' + port + '/viewer/viewer.html?db=buildings/HHS_Office_Federated_extracted.db&bld=HHS_Office_Federated',
    { waitUntil: 'networkidle' });

  let ready = false;
  for (let i = 0; i < 60 && !ready; i++) {
    await page.waitForTimeout(1000);
    try { ready = await page.evaluate(() => !!(window.APP && window.APP.db && window.APP.dbQuery
      && window.APP._hbaTenancySpec && window.APP._hbaTenancySpec.warehouse)); } catch (e) {}
  }
  verdict(ready, 'viewer model + HBA compiled warehouse ready (A._hbaTenancySpec.warehouse)');
  const whId = await page.evaluate(() => window.APP._hbaTenancySpec.warehouse.m_warehouse_id);
  S('   warehouse m_warehouse_id=' + whId);

  await page.evaluate(() => window.APP.openFindPanel());
  await page.waitForTimeout(1500);

  // cycle the single axis-toggle button until it reaches 'room' (storey→disc→[room]→…) — REAL clicks
  // (the row's own tap listener lives on the inner text/badge spans, not the row div — hit-test, don't dispatch)
  let axis = null;
  for (let i = 0; i < 5; i++) {
    axis = await page.evaluate(() => { const b = document.getElementById('find-axis-toggle'); return b ? b.getAttribute('data-axis') : null; });
    if (axis === 'room') break;
    const has = await page.evaluate(() => !!document.getElementById('find-axis-toggle'));
    if (!has) break;
    await page.click('#find-axis-toggle');
    await page.waitForTimeout(600);
  }
  verdict(axis === 'room', 'Find axis reached "room"', 'axis=' + axis);

  await page.waitForTimeout(800);
  const rowCount = await page.evaluate(() => document.querySelectorAll('.find-tree-row').length);
  let tapped = false;
  if (rowCount > 0) { await page.click('.find-tree-row'); tapped = true; }
  verdict(tapped, 'a Room/storey tree row was tappable', 'rows=' + rowCount);
  await page.waitForTimeout(1500);

  verdict(seen(/§CONSTRUCTION_LINK guid=.*warehouse=\d+/), '§CONSTRUCTION_LINK logged with a real (numeric) warehouse id');

  const link = await page.evaluate(() => {
    const a = document.getElementById('find-construction-open');
    return a ? { vis: getComputedStyle(a).display !== 'none', href: a.getAttribute('href') || '' } : null;
  });
  verdict(!!link && link.vis, '"iDempiere ↗" link (#find-construction-open) is VISIBLE after the tap');
  verdict(!!link && new RegExp('idempiere\\.html\\?client=garden&window=7800000&record=' + whId + '$').test(link.href),
    'link deep-links window=7800000 (Construction) record=' + whId + ' (the real compiled warehouse id)', link ? link.href : '-');

  verdict(errs.length === 0, '0 pageerrors', errs.length ? errs.slice(0, 3).join(' | ') : 'clean');

  const pass = fails === 0;
  S('\n§W-CONSTRUCTION-LINK ' + (pass ? 'PASS' : 'FAIL') + ' (fails=' + fails + ')');
  fs.writeFileSync(path.join(__dirname, 'poc_construction_link_live.log'), log.join('\n'));
  await browser.close(); server.close();
  process.exit(pass ? 0 : 1);
})();
