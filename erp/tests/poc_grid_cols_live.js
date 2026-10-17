// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser §-witness W-GRID-COLS-LIVE (bim-compiler prompts/ERP_DEPTH_FILM.md §GRID-COLS). READ tests/poc_grid_cols_live.log
//   before any conclusion — exit code is not evidence.
// THE ISSUE: does the grid show the columns legacy's grid shows (GridView.setupFields: every IsDisplayedGrid field, not toolbar-only
//   buttons, sorted by SeqNoGrid) instead of the first 7 form fields? Judged on screen (the data-ad-col of the grid's first row) for
//   Change Audit (window 270, 19 legacy columns incl. Old Value / New Value) and the Sales Order header (window 143), against the rule
//   evaluated on the PILOT dictionary; and no twin-only extra Status / Posted column. RED on origin/main (7 columns).
// Run: node tests/poc_grid_cols_live.js 2>&1 | tee tests/poc_grid_cols_live.log        (cwd = bim-ootb/erp; pilot postgres up)
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path'), cp = require('child_process');
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
    const from = logs.length; await hc('#idmp-toolbar [data-tb="save"]');
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
  const legacyCols = (win) => JSON.parse(cp.execFileSync('docker', ['exec', '-i', 'postgres', 'psql', '-U', 'postgres', '-d', 'idempiere_pilot', '-tAq'], { input: "SET search_path=adempiere;\nSELECT coalesce(json_agg(col),'[]') FROM (SELECT lower(c.columnname) col FROM ad_field f JOIN ad_column c ON c.ad_column_id=f.ad_column_id JOIN ad_tab t ON t.ad_tab_id=f.ad_tab_id WHERE t.ad_window_id=" + win + " AND t.tablevel=0 AND t.seqno=(SELECT min(seqno) FROM ad_tab x WHERE x.ad_window_id=" + win + " AND x.isactive='Y') AND f.isactive='Y' AND c.isactive='Y' AND f.isdisplayedgrid='Y' AND NOT (coalesce(f.ad_reference_id,c.ad_reference_id)=28 AND c.istoolbarbutton='Y') ORDER BY coalesce(f.seqnogrid,0), f.seqno, f.isdisplayed DESC, f.ad_field_id) q", encoding: 'utf8' }).trim());
  const screenCols = () => pg.evaluate(() => { const t = document.querySelector('#idmp-content .idmp-grid'); if (!t) return null; const r = t.querySelector('tbody tr[data-ad-record]');
    return { head: [...t.querySelectorAll('thead th')].length - 1, cols: r ? [...r.querySelectorAll('td[data-ad-col]')].map(td => td.getAttribute('data-ad-col').toLowerCase()) : null }; });
  await pg.goto(url, { waitUntil: 'networkidle' }); await login(); await openWin(123);
  const s1 = await editName(null); await pg.waitForTimeout(1200);   // one change -> Change Audit has a row
  const mChange = (await seed("SELECT AD_Menu_ID FROM AD_Menu WHERE AD_Window_ID=270"))[0][0];
  await openLeaf(mChange); await pg.waitForTimeout(500);
  if (await pg.locator('#idmp-inline-mount [data-col]').count()) await hc('#idmp-toolbar [data-tb="toggle"]');
  const c270 = await screenCols(), l270 = legacyCols(270);
  console.log('  270 screen=' + JSON.stringify(c270) + ' legacy=' + JSON.stringify(l270));
  ok('G1', 'Change Audit grid = the legacy columns in legacy order (' + l270.length + ', incl. Old Value / New Value)', c270 && c270.cols && JSON.stringify(c270.cols) === JSON.stringify(l270) && c270.head === l270.length && l270.indexOf('oldvalue') >= 0, JSON.stringify(c270));
  await openWin(143);
  if (await pg.locator('#idmp-inline-mount [data-col]').count()) await hc('#idmp-toolbar [data-tb="toggle"]');
  const c143 = await screenCols(), l143 = legacyCols(143);
  console.log('  143 screen=' + JSON.stringify(c143) + ' legacy=' + JSON.stringify(l143));
  ok('G2', 'Sales Order header grid = the legacy columns in legacy order; no extra Status / Posted column (header count = columns)', c143 && c143.cols && JSON.stringify(c143.cols) === JSON.stringify(l143) && c143.head === l143.length, JSON.stringify({ head: c143 && c143.head, n: l143.length }));
  const gl = logs.filter(l => /^§GRID-COLS /.test(l)).slice(-2); console.log('  ' + gl.join('\n  '));
  const real = errs.filter(e => !/ResizeObserver/.test(e));
  ok('G3', 'no page errors', real.length === 0, real.slice(0, 3).join(' | '));
  console.log('§GRIDC-VERDICT ' + (fail ? 'FAIL' : 'PASS') + ' ' + pass + '/' + (pass + fail));
  await browser.close(); srv.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.log('§GRIDC-VERDICT INCONCLUSIVE ' + (e.stack || e)); process.exit(2); });
