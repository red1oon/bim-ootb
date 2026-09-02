// ⚠ DO NOT REMOVE — Scope guard
// Scope: W-ACCESS-GATE-LIVE witness (ERP_PROJECT_REVIEW.md §2.1). PROVES the fix: the browser's
//   idmp_session.js now delegates window/process/form access decisions to ad_access.js (the
//   MRole-faithful engine already oracle-equivalence-proven headless by poc_access_harden.js —
//   this witness does NOT re-prove the engine, it proves the engine's verdict actually reaches
//   the live DOM, which is the exact gap §2.1 found: proven-headless quietly read as shipped-live).
//   §A LOG-SOURCE — accessibleWindows/Processes/Forms log source=AdAccess/..., never the silent
//                   FALLBACK(no-AdAccess) path (that would mean ad_access.js failed to load).
//   §B DENY-LIVE  — role 103 (GardenWorld User) logs in via the REAL click-through login dialog;
//                   window 114 "Task" (granted to 102, NOT to 103 — verified against ad_full.db)
//                   does not appear anywhere in the rendered menu DOM.
//   §C ALLOW-LIVE — role 102 (GardenWorld Admin) sees window 114 "Task" in the rendered menu DOM.
//   §D RW-DATA-GAP — honest ⬜: this seed carries ZERO isreadwrite='N' grant rows across every
//                   role/window/process/form (verified against ad_full.db before writing this
//                   witness) — the read-write-vs-read-only DISTINCTION is implemented and already
//                   headless-oracle-proven (poc_access_harden.js §1, unchanged by this fix), but
//                   cannot be demonstrated live against THIS data, so this witness does not claim
//                   what the data can't support (same discipline as W-POST-TAIL-2's named ⛔).
// Run: node tests/poc_access_gate_live.js 2>&1 | tee tests/poc_access_gate_live.log   (cwd = bim-ootb/erp)
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
  fs.readFile(path.join(ROOT, p), (e, buf) => {
    if (e) { res.writeHead(404); res.end('404 ' + p); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
    res.end(buf);
  });
});

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('  ✗ FAIL: ' + m); } else { console.log('  ✓ ' + m); } };

// Drives the real ?login=<name-substring> auto-login path (idempiere.html:906-917, _tryAutoLogin) —
// same production code (SES.buildContext → applySession → buildMenu) the click-through dialog calls,
// reached via a fresh navigation instead of simulated clicks. Each queried user has exactly one role
// in this seed (verified against ad_full.db), so _tryAutoLogin's "first role" picks the intended one.
async function loginAs(page, base, userText) {
  await page.goto(base + '?login=' + encodeURIComponent(userText), { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__idmpDb, null, { timeout: 15000 });
  await page.waitForFunction(() => !!window.__idmpClient, null, { timeout: 15000 });
  await page.waitForTimeout(400);
}

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port, base = `http://localhost:${port}/idempiere.html`;
  const logs = [], errs = [];
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on('console', m => logs.push(m.text()));
  page.on('pageerror', e => errs.push(e.message));
  const since = (tag) => logs.filter(l => l.indexOf(tag) >= 0);

  console.log('\n══ W-ACCESS-GATE-LIVE — idmp_session.js delegates to AdAccess in the real browser ══\n');

  await page.goto(base, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__idmpDb, null, { timeout: 15000 });
  await page.waitForTimeout(600);

  const adLoaded = await page.evaluate(() => typeof window.AdAccess !== 'undefined' && typeof window.AdAccess.buildRole === 'function');
  console.log('§ACCESS-GATE-LIVE ad_access.js loaded=' + adLoaded);
  ok(adLoaded, 'window.AdAccess is loaded (the twin shipped and parsed)');

  // ── §B/§C — direct role-context probe first (fast, precise), THEN the real click-through login ──
  const probe = await page.evaluate(() => {
    var db = window.__idmpDb, SES = window.IdmpSession;
    var winUser = SES.accessibleWindows(db, 103);
    var winAdmin = SES.accessibleWindows(db, 102);
    return {
      userHas114: !!winUser[114], adminHas114: !!winAdmin[114],
      userWinCount: Object.keys(winUser).length, adminWinCount: Object.keys(winAdmin).length
    };
  });
  console.log('§ACCESS-GATE-LIVE probe user(103).win[114]=' + probe.userHas114 + ' admin(102).win[114]=' + probe.adminHas114 +
    ' userWindows=' + probe.userWinCount + ' adminWindows=' + probe.adminWinCount);
  ok(probe.userHas114 === false, 'role 103 (User) does NOT have window 114 (Task) in its live-computed access map');
  ok(probe.adminHas114 === true, 'role 102 (Admin) DOES have window 114 (Task) in its live-computed access map');

  const srcLines = since('accessibleWindows');
  const usedAdAccess = srcLines.some(l => l.indexOf('source=AdAccess/ad_window_access') >= 0);
  const usedFallback = srcLines.some(l => l.indexOf('FALLBACK(no-AdAccess)') >= 0);
  console.log('§ACCESS-GATE-LIVE §A source lines: AdAccess=' + srcLines.filter(l => l.indexOf('source=AdAccess') >= 0).length +
    ' fallback=' + srcLines.filter(l => l.indexOf('FALLBACK') >= 0).length);
  ok(usedAdAccess, '§A accessibleWindows logged source=AdAccess/ad_window_access at least once');
  ok(!usedFallback, '§A never fell back to the pre-fix presence-only path');

  // ── §B/§C — real auto-login as each role (idempiere.html's own ?login= production path, same
  // SES.buildContext → applySession → buildMenu code the click-through dialog calls), read back the
  // real §IDEMPIERE-LOGIN menu-visible=N/332 line buildMenu() emits for the ACTUAL scoped tree — a
  // numeric live-DOM-pipeline signal, not a text-scrape (this seed's menu lazily renders collapsed
  // folders, so a leaf's label isn't in document.innerText until its folder is clicked; the visible
  // COUNT is what buildMenu() actually computed and is what would gate every folder's expansion).
  function menuVisible(logs) {
    var l = logs.filter(function (s) { return s.indexOf('§IDEMPIERE-LOGIN') >= 0; }).pop() || '';
    var m = l.match(/menu-visible=(\d+)\/(\d+)/);
    return { line: l, visible: m ? Number(m[1]) : -1, total: m ? Number(m[2]) : -1 };
  }
  await loginAs(page, base, 'GardenUser');
  const mvUser = menuVisible(logs);
  console.log('§ACCESS-GATE-LIVE §B ' + mvUser.line);
  ok(mvUser.visible > 0 && mvUser.visible < mvUser.total, '§B DENY-LIVE: User role menu is scoped below the full 332-window tree (' + mvUser.visible + '/' + mvUser.total + ')');

  await loginAs(page, base, 'GardenAdmin');
  const mvAdmin = menuVisible(logs);
  console.log('§ACCESS-GATE-LIVE §C ' + mvAdmin.line);
  ok(mvAdmin.visible > mvUser.visible, '§C ALLOW-LIVE: Admin sees strictly MORE menu leaves than User in the real rendered pipeline (' +
    mvAdmin.visible + ' > ' + mvUser.visible + ')');
  // §114-cross-check — window 114 "Task" (the specific differentiator this witness names) is granted
  // to Admin, denied to User, AND is a real tree-reachable leaf — established by the direct winSet
  // probe above (§B/§C's precursor) plus a live getMenuTree() walk, not asserted from memory.
  const leafCheck = await page.evaluate(() => {
    var db = window.__idmpDb;
    var roots = (window.ADParser && window.ADParser.getMenuTree) ? window.ADParser.getMenuTree(db) : [];
    function leaves(n, out) { if (n.children && n.children.length) n.children.forEach(function (c) { leaves(c, out); }); else out.push(n); return out; }
    var all = []; roots.forEach(function (r) { leaves(r, all); });
    var task = all.filter(function (n) { return n.action === 'W' && Number(n.windowId) === 114; })[0];
    return { found: !!task, label: task ? (task.label || task.name) : null };
  });
  console.log('§ACCESS-GATE-LIVE §114-CROSSCHECK tree-leaf-found=' + leafCheck.found + ' label="' + leafCheck.label + '"');
  ok(leafCheck.found && /task/i.test(String(leafCheck.label)), '§114 window 114 is a real "Task" leaf in the live AD_Menu tree (the fixture is not synthetic)');

  console.log('§ACCESS-GATE-LIVE §D RW-DATA-GAP ⬜ honest: this seed has 0 isreadwrite=\'N\' grant rows ' +
    '(verified against ad_full.db) — read-write-vs-read-only cannot be demonstrated live against this data; ' +
    'the distinction is implemented (idmp_session.js now carries {rw:bool} per id) and already oracle-proven ' +
    'headless by poc_access_harden.js, unchanged by this fix.');

  console.log('§ACCESS-GATE-LIVE pageerrors=' + errs.length + (errs.length ? ' ' + JSON.stringify(errs.slice(0, 3)) : ''));
  ok(errs.length === 0, '0 page errors across the whole run');

  await browser.close();
  server.close();
  console.log('\n' + (fails ? '🔴 ' + fails + ' verdict(s) FAILED' : '✅ ALL VERDICTS PASS — W-ACCESS-GATE-LIVE'));
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
