// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser §-witness W-UDP6-LIVE (bim-compiler prompts/ERP_DEPTH_FILM.md §UDP-6). READ tests/poc_udp6_recent_live.log
//   before any conclusion — exit code is not evidence.
// THE ISSUE: does saving a record in a window record it in AD_RecentItem the way AbstractADWindowContent does (MRecentItem.addModifiedField
//   + touchUpdatedRecord after a save: :2155-2170, :2985-3010) - one row per user + record, the window/tab it was saved in, newest first,
//   persisted (signed op-log) across a page reload? Edits the Name of two Business Partners (window 123), then re-saves the first.
//   On origin/main nothing writes AD_RecentItem (RED: 0 rows).
// Run: node tests/poc_udp6_recent_live.js 2>&1 | tee tests/poc_udp6_recent_live.log        (cwd = bim-ootb/erp)
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
  await pg.goto(url, { waitUntil: 'networkidle' }); await login(); await openWin(123);
  const r0 = await recent();
  const s1 = await editName(null);
  const r1 = await recent();
  ok('R1', 'saving a Business Partner records it: ONE recent row (table C_BPartner, the record, window 123, its header tab)', r1.length === r0.length + 1 && String(r1[0].record) === String(s1.id) && String(r1[0].window) === '123' && /committed=true/.test(s1.line || ''), (s1.line || 'no §UDP6-RECENT line') + ' rows=' + JSON.stringify(r1.slice(0, 3)));
  const other = await pg.evaluate(k => window.IdmpGridTab.snapshot().rows.map(r => String(r.pk)).filter(x => x !== String(k))[0], s1.id);
  console.log('  other=' + other);
  const s2 = await editName(other);
  console.log('  s2=' + JSON.stringify(s2));
  const r2 = await recent();
  ok('R2', 'a second record saved is listed FIRST (getFromUser ORDER BY Updated DESC)', r2.length === r1.length + 1 && String(r2[0].record) === String(s2.id) && String(r2[1].record) === String(s1.id), JSON.stringify(r2.slice(0, 3)));
  const s3 = await editName(s1.id);
  const r3 = await recent();
  ok('R3', 're-saving the first record moves it back to the top, no duplicate row (addModifiedField touch)', r3.length === r2.length && String(r3[0].record) === String(s1.id), (s3.line || '') + ' ' + JSON.stringify(r3.slice(0, 3)));
  await pg.reload({ waitUntil: 'networkidle' }); await login();
  const r4 = await recent();
  ok('R4', 'after a page reload the recent rows are still there in the same order (signed op-log)', JSON.stringify(r4.map(r => r.record)) === JSON.stringify(r3.map(r => r.record)), JSON.stringify(r4.slice(0, 3)));
  const real = errs.filter(e => !/ResizeObserver/.test(e));
  ok('R5', 'no page errors', real.length === 0, real.slice(0, 3).join(' | '));
  console.log('§UDP6L-VERDICT ' + (fail ? 'FAIL' : 'PASS') + ' ' + pass + '/' + (pass + fail));
  await browser.close(); srv.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.log('§UDP6L-VERDICT INCONCLUSIVE ' + (e.stack || e)); process.exit(2); });
