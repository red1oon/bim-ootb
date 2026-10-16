// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser §-witness for RENDERER #2 — the ODOO DESCRIPTOR (RENDERER2_ODOO.md increment 2,
//   IDEMPIERE_2.md §pivot "one renderer, N dictionaries"). PROVES ?erp=odoo drives the UNCHANGED iDempiere
//   chrome over an Odoo model, with ZERO per-model chrome code, every value traced to a live Odoo pull.
//     1. ErpDescriptor.activeName()==='odoo', active.id==='odoo', list() includes BOTH 'ad' and 'odoo'.
//     2. The Odoo menu renders through the seam (getMenuTree → ≥1 real Odoo menu node from ir.ui.menu).
//     3. Opening an Odoo window loads REAL records through the seam (getWindow+readRecords → rows>0;
//        the Sales Orders window carries the folded S00023 SO).
//     4. 0 pageerrors.
//   §-log first — READ tests/poc_odoo_descriptor.log before any conclusion (exit code is NOT evidence).
//   The "zero-chrome-change" claim (item 4 of the card) is proven by the DIFF grep, not this runtime test.
// Run:  node tests/poc_odoo_descriptor.js   (cwd = bim-ootb/erp)
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

  await page.goto(`http://localhost:${port}/idempiere.html?client=garden&erp=odoo`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  let pass = 0, fail = 0;
  const ok = (label, cond, extra) => { console.log('   ' + (cond ? '🟢' : '🔴') + ' ' + label + (extra ? ' — ' + extra : '')); cond ? pass++ : fail++; };

  // boot log from the odoo descriptor (registration + artifact load)
  const regLog = [...logs].find(l => l.startsWith('§ODOO-DESCRIPTOR registered=odoo')) || '(none)';
  const loadLog = [...logs].find(l => l.startsWith('§ODOO-DESCRIPTOR loaded')) || '(none)';
  console.log('§ODOO-LOG ' + regLog);
  console.log('§ODOO-LOG ' + loadLog);

  // (1) active descriptor = odoo; registry holds both
  const ident = await page.evaluate(() => {
    const D = window.ErpDescriptor; if (!D) return { ok: false };
    const a = D.active || {};
    return { active: D.activeName(), id: a.id, label: a.label, list: D.list(),
      hasStruct: !!(a.structure && a.structure.getMenuTree), hasData: !!(a.data && a.data.readRecords),
      hasSess: !!(a.session && a.session.buildContext) };
  });
  console.log('§ODOO-IDENT ' + JSON.stringify(ident));
  ok('activeName===odoo, active.id===odoo', ident.active === 'odoo' && ident.id === 'odoo');
  ok('list() includes BOTH ad and odoo', (ident.list || []).indexOf('ad') >= 0 && (ident.list || []).indexOf('odoo') >= 0, JSON.stringify(ident.list));
  ok('odoo facets expose the contract methods (getMenuTree/readRecords/buildContext)', ident.hasStruct && ident.hasData && ident.hasSess);

  // (2) login through the Odoo session facet → menu renders through getMenuTree
  // STALE-INSTRUMENT FIX 2026-09-04 (prompts/AGENT_QUEUE.md §STALE-WITNESSES): this clicked a row in
  // #idmp-login-users and then #idmp-login-ok. The login card now OPENS AT STEP 0, the tenant switcher
  // (NEW_CLIENT_MGMT.md P3) — the page logs `§IDEMPIERE login-step0 tenants=1 demos=5` — so step 1 was
  // still display:none, its user list was EMPTY, and the click hit nothing. #idmp-login-ok then sat
  // inside a hidden step 2 and the run died on a click timeout that named the button, not the cause.
  // Walk whatever step is actually visible, in order. Step 0's rows share the .idmp-login-user class
  // with step 1's, so the RESIDENT tenant is the one WITHOUT .idmp-login-demo (a demo row would switch
  // the whole dictionary and is not what ?erp=odoo already selected).
  async function loginWalk() {
    const vis = id => page.evaluate(i => { const e = document.getElementById(i); return !!e && e.style.display !== 'none'; }, id);
    if (await vis('idmp-login-step0')) {
      const picked = await page.evaluate(() => {
        const rows = Array.prototype.slice.call(document.querySelectorAll('#idmp-login-clients .idmp-login-user'));
        const r = rows.find(x => !x.classList.contains('idmp-login-demo') && !x.classList.contains('disabled'));
        if (!r) return null; r.click(); return (r.textContent || '').trim().slice(0, 40);
      });
      console.log('§ODOO-LOGINWALK step0 tenant=' + JSON.stringify(picked));
      if (picked == null) throw new Error('login step 0 is visible but offers no resident tenant row');
      await page.waitForTimeout(500);
    }
    if (await vis('idmp-login-step1')) {
      const picked = await page.evaluate(() => {
        const rows = Array.prototype.slice.call(document.querySelectorAll('#idmp-login-users .idmp-login-user'));
        const r = rows.find(x => !x.classList.contains('disabled'));
        if (!r) return null; r.click(); return (r.textContent || '').trim().slice(0, 40);
      });
      console.log('§ODOO-LOGINWALK step1 user=' + JSON.stringify(picked));
      if (picked == null) throw new Error('login step 1 is visible but offers no enabled user row');
      await page.waitForTimeout(500);
    }
    await page.waitForSelector('#idmp-login-ok', { state: 'visible', timeout: 10000 });
    await page.click('#idmp-login-ok');
    console.log('§ODOO-LOGINWALK step2 ok-clicked');
  }
  await loginWalk();
  await page.waitForTimeout(1200);

  const menuLeaves = await page.$$eval('#idmp-menu .idmp-row.leaf', els => els.length).catch(() => 0);
  const menuLog = [...logs].reverse().find(l => l.startsWith('§ODOO-DESCRIPTOR getMenuTree')) || '(none)';
  const loginLog = [...logs].reverse().find(l => l.startsWith('§IDEMPIERE-LOGIN')) || '(none)';
  console.log('§ODOO-MENU ' + menuLog + ' menuLeavesInDom=' + menuLeaves);
  console.log('§ODOO-LOGIN ' + loginLog);
  ok('Odoo menu renders through the seam (getMenuTree → leaves)', /getMenuTree roots=\d+ source=ir\.ui\.menu/.test(menuLog) && menuLeaves > 0);

  // (3) open each Odoo window in turn; LAND on the Sales Orders window (the folded S00023 SO lives there).
  // Click leaves one at a time and stop on the one whose content carries S00023 — so the SO window is the
  // one left rendered when we assert (clicking all at once would leave the LAST window showing, not the SO).
  let opened = 0, landedSO = false;
  const leafCount = await page.$$eval('#idmp-menu .idmp-row.leaf', els => els.length).catch(() => 0);
  for (let i = 0; i < leafCount; i++) {
    await page.evaluate((idx) => { var ls = document.querySelectorAll('#idmp-menu .idmp-row.leaf'); if (ls[idx]) ls[idx].click(); }, i);
    await page.waitForTimeout(350); opened++;
    landedSO = await page.evaluate(() => /S00023/.test((document.querySelector('#idmp-content') || {}).textContent || ''));
    if (landedSO) break;
  }
  await page.waitForTimeout(300);
  // pick the readRecords log for sale_order (the SO window), else any odoo readRecords with rows>0
  const soLog = [...logs].reverse().find(l => /§ODOO-DESCRIPTOR readRecords table=sale_order .*count=\d+/.test(l)) || '(none)';
  const anyRows = [...logs].reverse().find(l => /§ODOO-DESCRIPTOR readRecords .*count=[1-9]/.test(l)) || '(none)';
  const winLog = [...logs].reverse().find(l => /§ODOO-DESCRIPTOR getWindow id=1003/.test(l)) || '(none)';
  // confirm the S00023 SO actually rendered into the grid/cards DOM
  const hasS00023 = await page.evaluate(() => /S00023/.test(document.querySelector('#idmp-content') ? document.querySelector('#idmp-content').textContent : ''));
  console.log('§ODOO-WINDOW ' + winLog);
  console.log('§ODOO-RECORDS ' + soLog + ' | anyRows=' + anyRows + ' | S00023inDOM=' + hasS00023 + ' leavesOpened=' + opened);
  const soCount = (soLog.match(/count=(\d+)/) || [0, 0])[1];
  ok('opening the Sales Orders window loads rows>0 through getWindow+readRecords', Number(soCount) > 0, 'sale_order rows=' + soCount);
  ok('the folded S00023 SO renders in the chrome (traced to odoo_chain.json / Odoo S00023)', hasS00023);

  // (4) no page errors
  ok('0 pageerrors', errs.length === 0, errs.length ? errs.slice(0, 3).join(' | ') : '');

  console.log('\n' + (fail === 0 ? '✅' : '❌') + ' W-ODOO-DESCRIPTOR: ' + pass + '/' + (pass + fail) + ' PASS (' + fail + ' FAIL)');
  await browser.close(); server.close();
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
