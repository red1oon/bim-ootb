// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-HBA-CLICKTHRU: the real click-through half of §P11's "open ↗" deep-links, which
//   witness_erp_deeplink.js / witness_bom_pane.js only ever checked as a STRING (erpLink() output / a mocked
//   `<a href>`, never a real page load — see feedback_test_real_user_path_not_seams.md, user 2026-07-04).
//   This witness navigates a REAL browser directly to each HBA pane's "open ↗" target
//   (idempiere.html?client=garden&window=<id>&record=<pk>, the exact URL shape erpLink() builds) using REAL
//   PKs independently queried from erp/ad_seed.db (never guessed), then asserts the CORRECT record's own
//   distinguishing text actually renders on the landed page — proving the click-through works end-to-end,
//   not just that the href string looks right.
//   Ground truth (sqlite3 erp/ad_seed.db, 2026-07-04) — RESULT: 3/5 genuinely click through, 2/5 are BROKEN:
//     RESOURCE (236)           s_resource_id=990109  → S_Resource.name = 'EMP001'                        🟢 WORKS
//     BOM (53006)              pp_product_bom_id=145 → PP_Product_BOM.name = 'Patio Furniture Set'       🟢 WORKS
//     ORDER (143)              c_order_id=1300108    → C_Order.documentno = '60000'                      🟢 WORKS
//     PAYROLL_MOVEMENT (53042) hr_movement_id=1      → "Window 53042 not found"                          🔴 BROKEN
//     PAYROLL_CONCEPT (53036) hr_concept_id=5        → "Window 53036 not found"                          🔴 BROKEN
//     SUBSCRIPTION (316)       — window 316 ALSO absent, AND no C_Subscription table exists at all        ⚠ N/A
//
//   §REAL BUG (found by this witness, invisible to witness_erp_deeplink.js's string-only check): the node
//   witness verified 53042/53036/316 against `ad_full.db` — a separate GROUND-TRUTH REFERENCE catalog used
//   only to confirm the IDs aren't guessed. It never checked that those `AD_Window` rows are ALSO seeded into
//   `ad_seed.db` — the db idempiere.html actually loads at runtime. They are NOT: `sqlite3 ad_seed.db "SELECT
//   ad_window_id,name FROM AD_Window WHERE ad_window_id IN (53042,53036,316)"` returns zero rows. So Payslip's
//   and Leave's "open ↗" links, and Tenancy's (doubly, no C_Subscription table either), 404 with "Window NNNNN
//   not found" for a real user today — even though the href string, the window ID, and the target PK are all
//   individually correct. Fix = mint the missing `AD_Window`/`AD_Tab`/`AD_Field` seed rows into `ad_seed.db`
//   (copy the definitions from `ad_full.db`, same pattern `scripts/seed_hba_erp.js` already uses) — not done
//   here, this witness's job was to FIND it, not fix it speculatively (same discipline as §T7-RACE/§PCLOSE-RACE).
//   Run: node hr_bim_asset/tests/live/witness_hba_clickthru.js 2>&1 | tee hr_bim_asset/tests/live/witness_hba_clickthru.log
'use strict';
const { chromium } = require('/home/red1/bim-ootb/tests/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..', 'erp');   // idempiere.html lives in erp/
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.db': 'application/octet-stream', '.wasm': 'application/wasm', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/idempiere.html';
  fs.readFile(path.join(ROOT, p), (e, buf) => {
    if (e) { res.writeHead(404); res.end('404 ' + p); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(buf);
  });
});
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = []; const W = (ok, m) => { log.push((ok ? '🟢' : '🔴') + ' ' + m); console.log((ok ? '🟢' : '🔴') + ' ' + m); };

const CASES = [
  { name: 'RESOURCE',          window: 236,   record: 990109,  expect: 'EMP001' },
  { name: 'PAYROLL_MOVEMENT',  window: 53042, record: 1,       expect: '5000' },
  { name: 'PAYROLL_CONCEPT',   window: 53036, record: 5,       expect: 'Leave without pay' },
  { name: 'BOM',                window: 53006, record: 145,     expect: 'Patio Furniture Set' },
  { name: 'ORDER',              window: 143,   record: 1300108, expect: '60000' },
];

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const browser = await chromium.launch();
  let passCount = 0;

  for (const c of CASES) {
    const page = await browser.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    const url = `http://localhost:${port}/idempiere.html?login=GardenAdmin&client=garden&window=${c.window}&record=${c.record}`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
    // AD dictionary parse (589 menu / 371 windows / 20928 fields) + record resolve genuinely takes a few
    // seconds — confirmed via §AD_PARSER/§IDEMPIERE-DEEPLINK console timing, not an arbitrary guess.
    await sleep(5000);
    const bodyText = await page.evaluate(() => document.body ? document.body.innerText : '').catch(() => '');
    const found = bodyText.indexOf(c.expect) >= 0;
    W(found, '§CLICKTHRU-' + c.name + ' window=' + c.window + ' record=' + c.record +
      ' expect="' + c.expect + '" found=' + found + (found ? '' : ' pageErrors=' + errs.length));
    if (found) passCount++;
    await page.close();
  }

  // SUBSCRIPTION (316) — separately, expected to be honestly empty (no C_Subscription table in ad_seed.db).
  {
    const page = await browser.newPage();
    const url = `http://localhost:${port}/idempiere.html?login=GardenAdmin&client=garden&window=316&record=1`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
    await sleep(5000);
    const state = await page.evaluate(() => ({
      hasForm: !!document.querySelector('[data-ad-table]'),
      bodyLen: (document.body && document.body.innerText || '').length,
    })).catch(() => ({ hasForm: false, bodyLen: 0 }));
    W(true, '§CLICKTHRU-SUBSCRIPTION window=316 record=1 hasForm=' + state.hasForm + ' bodyLen=' + state.bodyLen +
      ' — informational only: C_Subscription has no physical table in ad_seed.db, so Tenancy\'s "open ↗" ' +
      'link is UNVERIFIABLE end-to-end today (separate finding, not part of the pass/fail count)');
    await page.close();
  }

  console.log('\nW-HBA-CLICKTHRU ' + passCount + '/' + CASES.length + ' real click-throughs land on the correct record');
  fs.mkdirSync(path.dirname(path.join(__dirname, 'witness_hba_clickthru.log')), { recursive: true });
  fs.writeFileSync(path.join(__dirname, 'witness_hba_clickthru.log'), log.join('\n') + '\n');
  await browser.close(); server.close();
  process.exit(passCount === CASES.length ? 0 : 1);
})().catch(e => { console.error('PROBE-ERR', e); server.close(); process.exit(2); });
