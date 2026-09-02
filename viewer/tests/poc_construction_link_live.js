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

  // §HBA_LAZY (hba_lens.js, user directive 2026-07-28, PR #1071): HBA no longer compiles at page load —
  // A._hbaTenancySpec only exists after the Human-Asset pill (or the public wake seam exposed FOR
  // witnesses, HBALens.ensureHbaData) wakes it. This witness predates that change and was polling for
  // a spec that can never appear unbidden. Wake it once via the seam, then poll as before — every
  // assertion below is unchanged (governed warehouse id, §CONSTRUCTION_LINK, link href, 0 pageerrors).
  let ready = false, woke = false;
  for (let i = 0; i < 60 && !ready; i++) {
    await page.waitForTimeout(1000);
    try {
      if (!woke) woke = await page.evaluate(() => {
        if (window.APP && window.APP.db && window.HBALens && window.HBALens.ensureHbaData) {
          window.HBALens.ensureHbaData(window.APP); return true;
        } return false;
      });
      // _governed too, not just .warehouse: _ensureErpGovern's ad_seed.db fetch is async, and before it
      // resolves the spec carries the throwaway session mint (always literal 1) that §GOVERNANCE-GATE
      // exists to reject — _surfaceConstructionLink itself refuses to link off it. Asserting on the
      // ungoverned mint was a race, not a pass.
      ready = await page.evaluate(() => !!(window.APP && window.APP.db && window.APP.dbQuery
        && window.APP._hbaTenancySpec && window.APP._hbaTenancySpec.warehouse
        && window.APP._hbaTenancySpec._governed));
    } catch (e) {}
  }
  verdict(ready, 'viewer model + HBA GOVERNED warehouse ready (A._hbaTenancySpec.warehouse + _governed)');
  const whId = await page.evaluate(() => window.APP._hbaTenancySpec.warehouse.m_warehouse_id);
  S('   warehouse m_warehouse_id=' + whId);

  await page.evaluate(() => window.APP.openFindPanel());
  // openFindPanel lazy-loads the whole navigate module chain (main.js A.loadNavigate — 9 scripts,
  // §NAVIGATE_LAZY_LOADED) before the panel exists; a fixed 1500ms loses that race on a loaded
  // machine (observed: §LENS_AXES rendered AFTER this witness had already polled and given up).
  // Poll for the axis toggle itself instead — same budget style as the readiness loop above.
  let panelUp = false;
  for (let i = 0; i < 30 && !panelUp; i++) {
    await page.waitForTimeout(1000);
    try { panelUp = await page.evaluate(() => !!document.getElementById('find-axis-toggle')); } catch (e) {}
  }
  verdict(panelUp, 'Find panel + axis toggle rendered (navigate modules lazy-loaded)');

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
  // §LENS_GROUPS (post-2026-07-04 tree): the Room axis now renders STOREY GROUP headers first, with the
  // room leaves lazy-expanded via each group row's arrow span (a group-header tap = §CATEGORY_REVEAL, NOT
  // a room select — observed live: tapping the first row fired §CATEGORY_REVEAL and no §CONSTRUCTION_LINK,
  // because _surfaceConstructionLink is only called from _roomSelect, a LEAF tap). Expand the first group
  // (arrow = first span, the only expand affordance), then tap a leaf row's text span — leaf rows carry
  // no data-find-parent attribute. Assertions below are unchanged.
  const rowCount = await page.evaluate(() => document.querySelectorAll('.find-tree-row').length);
  await page.click('.find-tree-row > span:first-child');   // expand group 1 (arrow pointerup)
  await page.waitForTimeout(800);
  let tapped = false;
  const leafCount = await page.evaluate(() => document.querySelectorAll('.find-tree-row:not([data-find-parent])').length);
  if (leafCount > 0) { await page.click('.find-tree-row:not([data-find-parent]) > span:nth-child(2)'); tapped = true; }
  verdict(tapped, 'a Room LEAF row was tappable (group expanded first)', 'groups+rows=' + rowCount + ' leaves=' + leafCount);
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
