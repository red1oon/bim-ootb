// ⚠ DO NOT REMOVE — Scope guard (W-OPEN-MODE-LIVE)
// Scope: real-browser §-witness W-GRID-CUSTOM-LIVE (bim-compiler prompts/ERP_DEPTH_FILM.md §GRID-CUSTOM). READ tests/poc_grid_custom_live.log
//   before any conclusion — exit code is not evidence.
// THE ISSUE: does a tab OPEN in the presentation legacy opens it in (ADTabpanel.init :1017 + GridTab.isSingleRow :1617-1622)? AD_Tab.IsSingleRow='Y'
//   (753 of 776 tabs) -> FORM; 'N' -> GRID; the user's AD_Tab_Customization.IsDisplayedGrid wins; a tab already shown keeps the view it was left in.
//   Windows: Business Partner 123 (header form, child tabs), Menu user favourites 200111 (grid header). RED on origin/main (every tab opened as a grid).
// Run: node tests/poc_open_mode_live.js 2>&1 | tee tests/poc_open_mode_live.log        (cwd = bim-ootb/erp)
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.css': 'text/css', '.png': 'image/png', '.sql': 'text/plain' };
const srv = http.createServer((q, r) => { const p = decodeURIComponent(q.url.split('?')[0]); const f = path.join(ROOT, p);
  fs.stat(f, (e, s) => { if (e || s.isDirectory()) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Content-Length': s.size }); fs.createReadStream(f).pipe(r); }); });
let pass = 0, fail = 0;
const ok = (id, name, cond, detail) => { console.log((cond ? '  ✅ ' : '  ❌ ') + id + ' ' + name + (detail ? ' — ' + detail : '')); cond ? pass++ : fail++; };
(async () => {
  await new Promise(r => srv.listen(0, r));
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const pg = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const logs = [], errs = []; pg.on('console', m => logs.push(m.text())); pg.on('pageerror', e => errs.push(e.message));
  const hc = async (sel) => { const l = pg.locator(sel).first(); await l.scrollIntoViewIfNeeded().catch(() => {}); await l.click(); await pg.waitForTimeout(350); };
  const seed = (sql) => pg.evaluate(s => { const r = window.__idmpDb.exec(s); return r.length ? r[0].values : []; }, sql);
  const url = 'http://localhost:' + srv.address().port + '/erp/idempiere.html?lang=en_US';
  const login = async () => {
    await pg.waitForFunction(() => !!window.__idmpDb, null, { timeout: 30000 });
    await pg.waitForFunction(() => document.querySelector('#idmp-login-clients') && document.querySelector('#idmp-login-clients').children.length > 0);
    await pg.click("#idmp-login-clients .idmp-login-user:has(.nm:text-is('GardenWorld'))"); await pg.waitForSelector('#idmp-login-step1:visible');
    await pg.click("#idmp-login-users .idmp-login-user:has(.nm:text-is('GardenAdmin'))"); await pg.waitForSelector('#idmp-login-step2:visible'); await pg.click('#idmp-login-ok');
    await pg.waitForFunction(() => document.querySelector('#idmp-tree') && document.querySelector('#idmp-tree').children.length > 0);
  };
  const openWin = async (wid) => {
    const mid = (await seed("SELECT AD_Menu_ID FROM AD_Menu WHERE Action='W' AND AD_Window_ID=" + wid + " AND IsActive='Y'"))[0][0];
    const chain = await pg.evaluate(id => { const leaf = document.querySelector('#idmp-tree .idmp-row.leaf[data-menu-id="' + id + '"]'); const out = []; let n = leaf.parentElement.parentElement;
      while (n && n.id !== 'idmp-tree') { if (n.classList.contains('idmp-node')) out.unshift(n.querySelector(':scope > .idmp-row').getAttribute('data-menu-id')); n = n.parentElement; } return out; }, mid);
    for (const id of chain) { const open = await pg.evaluate(i => { const r = document.querySelector('#idmp-tree .idmp-row[data-menu-id="' + i + '"]'); return r && r.parentElement.classList.contains('open'); }, id);
      if (!open) await hc('#idmp-tree .idmp-row[data-menu-id="' + id + '"]'); }
    await hc('#idmp-tree .idmp-row.leaf[data-menu-id="' + mid + '"]'); await pg.waitForTimeout(1200);
    await require('./legacy_open.js').showAllRows(pg, { history: false });   // Business Partner is high volume: Find first -> OK
  };
  const head = () => pg.evaluate(() => [...document.querySelectorAll('#idmp-content .idmp-grid thead th[data-ad-col]')].filter(th => th.style.display !== 'none').map(th => th.getAttribute('data-ad-col')));
  const toGrid = async () => { if (await pg.locator('#idmp-inline-mount [data-col]').count()) { await hc('#idmp-toolbar [data-tb="toggle"]'); await pg.waitForTimeout(700); } };
  const dlg = async () => { await hc('#idmp-toolbar [data-tb="showmore"]'); await hc('#idmp-tb-more [data-tb-more="customize"]'); await pg.waitForSelector('#idmp-gcust-ov'); return pg.evaluate(() => ({ yes: [...document.querySelectorAll('#idmp-gcust-yes option')].map(o => o.textContent), no: [...document.querySelectorAll('#idmp-gcust-no option')].length })); };
  const pick = (selId, idxs) => pg.evaluate(([s, ix]) => { const o = [...document.querySelectorAll('#' + s + ' option')]; o.forEach((x, i) => { x.selected = ix.indexOf(i) >= 0; }); }, [selId, idxs]);
  const okDlg = async () => { const n = logs.length; await hc('#idmp-gcust-ov [data-gcust="ok"]'); for (let i = 0; i < 40 && !logs.slice(n).some(l => /§GRID-CUSTOM save/.test(l)); i++) await pg.waitForTimeout(150); await pg.waitForTimeout(900); return logs.slice(n).filter(l => /§GRID-CUSTOM save/.test(l)).pop() || ''; };
  const isForm = () => pg.evaluate(() => !!document.querySelector('#idmp-content #idmp-form, #idmp-content .idmp-form'));
  const isGrid = () => pg.evaluate(() => !!document.querySelector('#idmp-content .idmp-grid'));
  const mode = async () => { await pg.waitForTimeout(600); const f = await isForm(), g = await isGrid(); return f && !g ? 'form' : g && !f ? 'grid' : 'f' + f + '/g' + g; };
  await pg.goto(url, { waitUntil: 'networkidle' }); await login();
  // A) header tab by dictionary: BP (IsSingleRow=Y) -> form; Tax Provider (N) -> grid. Opening goes through the legacy user's path to the rows.
  const openRaw = async (wid) => { const n = logs.length; const mid = (await seed("SELECT AD_Menu_ID FROM AD_Menu WHERE Action='W' AND AD_Window_ID=" + wid + " AND IsActive='Y'"))[0][0];
    const chain = await pg.evaluate(id => { const leaf = document.querySelector('#idmp-tree .idmp-row.leaf[data-menu-id="' + id + '"]'); const out = []; let n = leaf.parentElement.parentElement;
      while (n && n.id !== 'idmp-tree') { if (n.classList.contains('idmp-node')) out.unshift(n.querySelector(':scope > .idmp-row').getAttribute('data-menu-id')); n = n.parentElement; } return out; }, mid);
    for (const id of chain) { const open = await pg.evaluate(i => { const r = document.querySelector('#idmp-tree .idmp-row[data-menu-id="' + i + '"]'); return r && r.parentElement.classList.contains('open'); }, id);
      if (!open) await hc('#idmp-tree .idmp-row[data-menu-id="' + id + '"]'); }
    await hc('#idmp-tree .idmp-row.leaf[data-menu-id="' + mid + '"]'); await pg.waitForTimeout(1200);
    await require('./legacy_open.js').showAllRows(pg, { history: false }); return logs.slice(n); };
  let l1 = await openRaw(123); const m1 = await mode();
  console.log('  §OPEN-MODE logs: ' + l1.filter(x => /§OPEN-MODE/.test(x)).join(' | '));
  ok('A1', 'Business Partner header tab (IsSingleRow=Y) opens as a FORM', m1 === 'form', 'mode=' + m1);
  let l2 = await openRaw(200111); const m2 = await mode(); console.log('  l2: ' + l2.filter(x => /§(IDEMPIERE|OPEN-MODE|UDP4)/.test(x)).join(' | ').slice(0, 900));
  ok('A2', 'Menu user favourites header tab (IsSingleRow=N) opens as a GRID', m2 === 'grid', 'mode=' + m2);
  // B) a child tab of Business Partner (Location, IsSingleRow=Y) switched to -> form; back to the header -> still the view it was left in
  await openRaw(123);
  const tabs = await pg.evaluate(() => [...document.querySelectorAll('#idmp-tabstrip .idmp-adtab')].map(t => t.textContent.trim()).slice(0, 12));
  console.log('  tabs=' + JSON.stringify(tabs));
  const t2 = pg.locator('#idmp-tabstrip .idmp-adtab').nth(1); await t2.click(); const m3 = await mode();
  const want = (await seed("SELECT t.IsSingleRow FROM AD_Tab t WHERE t.AD_Window_ID=123 AND t.IsActive='Y' ORDER BY t.SeqNo LIMIT 2"))[1][0] === 'Y' ? 'form' : 'grid';
  ok('B1', 'second tab opens in its dictionary mode (' + want + ')', m3 === want, 'mode=' + m3);
  await hc('#idmp-toolbar [data-tb="toggle"]'); const m4 = await mode();
  ok('B2', 'the toggle switches the presentation', m4 !== m3 && (m4 === 'form' || m4 === 'grid'), m3 + ' -> ' + m4);
  await pg.locator('#idmp-tabstrip .idmp-adtab').nth(0).click(); await mode();
  await t2.click(); const m5 = await mode();
  ok('B3', 'returning to the tab keeps the view it was left in', m5 === m4, 'left=' + m4 + ' back=' + m5);
  ok('Z', 'no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  console.log('§OPEN-MODE-LIVE ' + (fail ? 'FAIL' : 'PASS') + ' ' + pass + '/' + (pass + fail));
  await browser.close(); srv.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.log('§OPEN-MODE-LIVE ERROR ' + e.stack); process.exit(2); });
