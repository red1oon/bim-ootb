// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser §-witness for the DESCRIPTOR SEAM (IDEMPIERE_2.md §pivot, renderer #2 increment 1).
//   PROVES the behavior-preserving refactor: idempiere.html's chrome now reads its dictionary/data/session
//   from ErpDescriptor.active instead of window.ADParser/ADData/IdmpSession directly, with AD as the FIRST
//   descriptor (facets === the AD parsers, verbatim). Behavior must be IDENTICAL to before the seam.
//     1. §ERP-DESCRIPTOR registered=ad active=ad fires at boot (module loaded + AD registered).
//     2. ErpDescriptor.active.id==='ad' AND its facets ARE the AD globals (structure===ADParser,
//        data===ADData, session===IdmpSession) — non-invent identity, zero behavior change.
//     3. The chrome still works END-TO-END through the seam: login → menu renders (getMenuTree via
//        active.structure) → open a window → records render (getWindow + readRecords via the seam).
//     4. 0 pageerrors.
//   §-log first — READ tests/poc_descriptor_seam.log before any conclusion (exit code is NOT evidence).
// Run:  node tests/poc_descriptor_seam.js   (cwd = bim-ootb/erp)
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

  await page.goto(`http://localhost:${port}/idempiere.html?client=garden`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  let pass = 0, fail = 0;
  const ok = (label, cond, extra) => { console.log('   ' + (cond ? '🟢' : '🔴') + ' ' + label + (extra ? ' — ' + extra : '')); cond ? pass++ : fail++; };

  // (1) registration log
  const regLog = [...logs].find(l => l.startsWith('§ERP-DESCRIPTOR registered=ad')) || '(none)';
  console.log('§SEAM-LOG ' + regLog);
  ok('§ERP-DESCRIPTOR registered=ad active=ad fired at boot', /registered=ad active=ad/.test(regLog));

  // (2) active descriptor identity — facets ARE the AD globals (behavior-preserving, non-invent)
  const ident = await page.evaluate(() => {
    const D = window.ErpDescriptor;
    if (!D || !D.active) return { ok: false, reason: 'no active descriptor' };
    const a = D.active;
    return {
      id: a.id, name: D.activeName(), list: D.list(),
      structIsAD: a.structure === window.ADParser,
      dataIsAD:   a.data === window.ADData,
      sessIsAD:   a.session === window.IdmpSession,
      hasGetMenuTree: typeof a.structure.getMenuTree === 'function',
      hasReadRecords: typeof a.data.readRecords === 'function',
      hasBuildContext: typeof a.session.buildContext === 'function'
    };
  });
  console.log('§SEAM-IDENT ' + JSON.stringify(ident));
  ok('active.id===ad, list includes ad', ident.id === 'ad' && (ident.list || []).indexOf('ad') >= 0);
  ok('facets ARE the AD globals (structure/data/session identity)', ident.structIsAD && ident.dataIsAD && ident.sessIsAD);
  ok('facets expose the seam methods (getMenuTree/readRecords/buildContext)', ident.hasGetMenuTree && ident.hasReadRecords && ident.hasBuildContext);

  // (3) end-to-end through the seam: login → menu → open a window → records render
  await page.evaluate(() => {
    var rows = Array.prototype.slice.call(document.querySelectorAll('#idmp-login-users .idmp-login-user'));
    var r = rows.find(x => !x.classList.contains('disabled')); if (r) r.click();
  });
  await page.waitForTimeout(400);
  await page.click('#idmp-login-ok');
  await page.waitForTimeout(1200);

  const menuLeaves = await page.$$eval('#idmp-menu .idmp-row.leaf', els => els.length).catch(() => 0);
  const loginLog = [...logs].reverse().find(l => l.startsWith('§IDEMPIERE-LOGIN')) || '(none)';
  console.log('§SEAM-MENU ' + loginLog + ' menuLeavesInDom=' + menuLeaves);
  ok('chrome renders the role-scoped menu through the seam (getMenuTree)', /menu-visible=\d+\/\d+/.test(loginLog) && menuLeaves > 0);

  // open windows by clicking leaves (hidden-safe via evaluate) until one yields a §IDEMPIERE tab= log
  // (a tab loading rows/records proves getWindow + readRecords flowed through active.structure/active.data).
  let tabLog = '(none)';
  for (let i = 0; i < 25; i++) {
    const clicked = await page.evaluate((idx) => {
      var leaves = document.querySelectorAll('#idmp-menu .idmp-row.leaf');
      if (idx >= leaves.length) return false;
      leaves[idx].click(); return true;
    }, i);
    if (!clicked) break;
    await page.waitForTimeout(250);
    tabLog = [...logs].reverse().find(l => /^§IDEMPIERE tab=/.test(l)) || tabLog;
    if (/^§IDEMPIERE tab=.*rows=/.test(tabLog)) break;
  }
  console.log('§SEAM-WINDOW ' + tabLog);
  ok('a window opens + a tab loads records through the seam (getWindow/readRecords)', /rows=\d+|rows=n\/a/.test(tabLog));

  // (4) no page errors
  ok('0 pageerrors', errs.length === 0, errs.length ? errs.slice(0,3).join(' | ') : '');

  console.log('\n' + (fail === 0 ? '✅' : '❌') + ' W-DESCRIPTOR-SEAM: ' + pass + '/' + (pass + fail) + ' PASS (' + fail + ' FAIL)');
  await browser.close(); server.close();
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
