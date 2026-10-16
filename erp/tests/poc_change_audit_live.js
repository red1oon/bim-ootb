// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser §-witness W-CHANGE-AUDIT-LIVE (bim-compiler prompts/ERP_DEPTH_FILM.md §ADMIN-3). READ tests/poc_change_audit_live.log
//   before any conclusion — exit code is not evidence.
// THE ISSUE: legacy's admin windows over AD_ChangeLog - Change Audit (window 270) and Session Audit (264, child tab Change Audit) - open on
//   nothing in the twin (no ad_changelog table in the seed). With the change log DERIVED from the signed op-log (temp.ad_changelog, legacy
//   write rule, rebuilt after each save, never exported), do both windows list the admin's edits: two Name edits of a Business Partner ->
//   two rows (table C_BPartner, the record, Name, old -> new, the user), and under the CURRENT session in Session Audit? Also: the temp
//   table is outside db.export(). RED on origin/main (no rows).
// Run: node tests/poc_change_audit_live.js 2>&1 | tee tests/poc_change_audit_live.log        (cwd = bim-ootb/erp)
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
  // the recent rows as the twin holds them: seed + signed op-log tip (the same read the save path uses)
  const recent = () => pg.evaluate(() => new Promise(res => {
    const base = (() => { try { const r = window.__idmpDb.exec('SELECT * FROM ad_recentitem WHERE ad_user_id=' + Number(window.APP.actor)); return r.length ? r[0].values.map(v => { const o = {}; r[0].columns.forEach((c, i) => o[c.toLowerCase()] = v[i]); return o; }) : []; } catch (e) { return []; } })();
    const c = window.__crud; if (!c || !c.withSidecar) { res(base); return; }
    c.withSidecar(sdb => { const rows = sdb ? c.core.listTip(sdb, 'ad_recentitem', 'ad_recentitem_id', base, null).rows : base;
      res((window.AdRecent ? window.AdRecent.listFor(rows, window.APP.actor, window.APP.clientId) : rows).map(r => ({ table: r.ad_table_id, record: r.record_id, window: r.ad_window_id, tab: r.ad_tab_id, updated: r.updated }))); });
  }));
  const F = c => '#idmp-inline-mount input[data-col="' + c + '"]';
  const toForm = async () => { if (!(await pg.locator('#idmp-inline-mount [data-col]').count())) { await hc('#idmp-toolbar [data-tb="toggle"]'); await pg.waitForTimeout(800); } };
  const editName = async (pk) => {   // reach record `pk` with the toolbar's record navigation (First / Next), then edit its Name in the form
    if (!(await pg.locator('#idmp-inline-mount [data-col]').count())) { await hc('#idmp-toolbar [data-tb="toggle"]'); await pg.waitForTimeout(800); }
    if (pk != null) {
      await hc('#idmp-toolbar button[title^="First record"]'); await pg.waitForTimeout(400);
      for (let i = 0; i < 60; i++) { const cur = await pg.evaluate(() => window.IdmpGridTab.snapshot().currentKey); if (String(cur) === String(pk)) break; await hc('#idmp-toolbar button[title^="Next record"]'); await pg.waitForTimeout(300); }
    }
    const v = await pg.$eval(F('name'), e => e.value); await pg.fill(F('name'), v + ' .'); await pg.locator(F('name')).blur().catch(() => {});
    const from = logs.length; await hc('#idmp-toolbar button[title^="Save"]');
    for (let i = 0; i < 40; i++) { if (logs.slice(from).some(l => /§UDP6-RECENT/.test(l))) break; await pg.waitForTimeout(250); }
    await pg.waitForTimeout(600);
    const id = await pg.evaluate(() => window.IdmpGridTab.snapshot().currentKey);
    return { id, line: logs.slice(from).filter(l => /§UDP6-RECENT/.test(l)).pop() || null };
  };
  const openLeaf = async (mid) => {
    const chain = await pg.evaluate(id => { const leaf = document.querySelector('#idmp-tree .idmp-row.leaf[data-menu-id="' + id + '"]'); if (!leaf) return null; const out = []; let n = leaf.parentElement.parentElement;
      while (n && n.id !== 'idmp-tree') { if (n.classList.contains('idmp-node')) out.unshift(n.querySelector(':scope > .idmp-row').getAttribute('data-menu-id')); n = n.parentElement; } return out; }, mid);
    if (!chain) return false;
    for (const id of chain) { const open = await pg.evaluate(i => { const r = document.querySelector('#idmp-tree .idmp-row[data-menu-id="' + i + '"]'); return r && r.parentElement.classList.contains('open'); }, id); if (!open) await hc('#idmp-tree .idmp-row[data-menu-id="' + id + '"]'); }
    await hc('#idmp-tree .idmp-row.leaf[data-menu-id="' + mid + '"]'); await pg.waitForTimeout(1200);
    await require('./legacy_open.js').showAllRows(pg); return true;
  };
  const gridText = () => pg.evaluate(() => { const c = document.getElementById('idmp-content'); return c ? c.innerText : ''; });
  // every record of the active tab, read in FORM view (the twin's grid shows only 7 columns - finding §ADMIN-3; Old/New Value are later fields)
  const formTexts = async () => { await toForm(); const out = []; const n = await pg.evaluate(() => window.IdmpGridTab.snapshot().rows.length);
    await hc('#idmp-toolbar button[title^="First record"]');
    for (let i = 0; i < n; i++) { out.push(await pg.evaluate(() => { const m = document.getElementById('idmp-inline-mount') || document.getElementById('idmp-content'); return [...m.querySelectorAll('input,select,textarea')].map(x => x.value).join(' | ') + ' || ' + m.innerText; })); if (i < n - 1) await hc('#idmp-toolbar button[title^="Next record"]'); }
    return out; };
  await pg.goto(url, { waitUntil: 'networkidle' }); await login(); await openWin(123);
  const before = await pg.$eval(F('name'), e => e.value).catch(async () => { await toForm(); return pg.$eval(F('name'), e => e.value); });
  const s1 = await editName(null); const n1 = await pg.$eval(F('name'), e => e.value);
  const s2 = await editName(s1.id); const n2 = await pg.$eval(F('name'), e => e.value);
  await pg.waitForTimeout(1200);
  console.log('  record=' + s1.id + ' "' + before + '" -> "' + n1 + '" -> "' + n2 + '"');
  const temp = await pg.evaluate(id => { const r = window.__idmpDb.exec("SELECT oldvalue, newvalue, eventchangelog, createdby, ad_session_id, ad_table_id, record_id FROM temp.ad_changelog WHERE record_id=" + id + " ORDER BY ad_changelog_id"); return r.length ? r[0].values : []; }, s1.id);
  const mainHas = await pg.evaluate(() => { const r = window.__idmpDb.exec("SELECT count(*) FROM main.sqlite_master WHERE name='ad_changelog'"); return r[0].values[0][0]; });
  console.log('  temp rows=' + JSON.stringify(temp) + ' mainSchemaHasTable=' + mainHas);
  ok('C1', 'temp.ad_changelog holds the 2 Name edits: old -> new chained, event U, by GardenAdmin, with the login session', temp.length === 2 && temp[0][0] === before && temp[0][1] === n1 && temp[1][0] === n1 && temp[1][1] === n2 && temp.every(r => r[2] === 'U' && r[4] != null), JSON.stringify(temp));
  ok('C2', 'nothing stored: no ad_changelog in the main schema (so not in db.export())', mainHas === 0, 'main=' + mainHas);
  const mChange = (await seed("SELECT AD_Menu_ID FROM AD_Menu WHERE AD_Window_ID=270"))[0][0], mSess = (await seed("SELECT AD_Menu_ID FROM AD_Menu WHERE AD_Window_ID=264"))[0][0];
  const okOpen = await openLeaf(mChange); const g1 = await gridText(); const snap1 = await pg.evaluate(() => window.IdmpGridTab.snapshot());
  const f1 = okOpen && snap1 && snap1.window === 270 ? await formTexts() : [];
  const has = (arr, o, n) => arr.some(t => t.indexOf(n) >= 0 && t.indexOf(o) >= 0);
  ok('C3', 'Change Audit window (270) is active with 2 rows; the records show Name old -> new for both edits (form view)',
    snap1 && snap1.window === 270 && snap1.rows.length === 2 && has(f1, n1, n2) && has(f1, before, n1), 'window=' + (snap1 && snap1.window) + ' rows=' + (snap1 && snap1.rows.length) + ' forms=' + JSON.stringify(f1.map(t => t.slice(0, 300))));
  const okS = await openLeaf(mSess);
  const sessSnap = await pg.evaluate(() => window.IdmpGridTab.snapshot());
  const cur = temp.length ? temp[0][4] : null;
  for (let i = 0; i < 80 && sessSnap && String(await pg.evaluate(() => window.IdmpGridTab.snapshot().currentKey)) !== String(cur); i++) { await hc('#idmp-toolbar button[title^="Next record"]'); }
  await pg.evaluate(() => window.IdmpHost.openTab(null, 'Change Audit')); await pg.waitForTimeout(1200);
  const child = await pg.evaluate(() => window.IdmpGridTab.snapshot());
  const f2 = child && child.tab === 'Change Audit' ? await formTexts() : [];
  ok('C4', 'Session Audit (264): the current session -> Change Audit tab lists exactly the 2 edits', okS && child && child.tab === 'Change Audit' && child.rows.length === 2 && String(child.linkValue) === String(cur) && has(f2, n1, n2), JSON.stringify({ session: cur, tab: child && child.tab, link: child && child.linkValue, rows: child && child.rows.length }));
  const real = errs.filter(e => !/ResizeObserver/.test(e));
  ok('C5', 'no page errors', real.length === 0, real.slice(0, 3).join(' | '));
  const rb = logs.filter(l => /§ADMIN3-CHANGEAUDIT/.test(l)).pop() || '';
  console.log('  ' + rb);
  console.log('§CHAUD-VERDICT ' + (fail ? 'FAIL' : 'PASS') + ' ' + pass + '/' + (pass + fail));
  await browser.close(); srv.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.log('§CHAUD-VERDICT INCONCLUSIVE ' + (e.stack || e)); process.exit(2); });
