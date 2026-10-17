// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser §-witness W-UDP6G-LIVE (bim-compiler prompts/ERP_DEPTH_FILM.md §UDP-6G). READ tests/poc_udp6g_recent_gadget_live.log
//   before any conclusion — exit code is not evidence.
// THE ISSUE: does the Home show the user's recent records the way legacy's DPRecentItems does (refresh :262-306: newest first, label =
//   MRecentItem.getLabel on the CURRENT record), and does a click open that window ON that record (doOnClick :222-260 = AEnv.zoom, MQuery
//   equal), and does dropping an item on the trash delete it for good (riDBremove :183-190)? Saves a Business Partner (window 123) and a
//   Product (window 140), reloads to the Home. H7: the ?record= deep link goes through the same zoom. On origin/main the side gadget is only logged §DASH-UNPORTED (RED: no list).
// Run: node tests/poc_udp6g_recent_gadget_live.js 2>&1 | tee tests/poc_udp6g_recent_gadget_live.log        (cwd = bim-ootb/erp)
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
    const from = logs.length; await hc('#idmp-toolbar [data-tb="save"]');
    for (let i = 0; i < 40; i++) { if (logs.slice(from).some(l => /§UDP6-RECENT/.test(l))) break; await pg.waitForTimeout(250); }
    await pg.waitForTimeout(600);
    const id = await pg.evaluate(() => window.IdmpGridTab.snapshot().currentKey);
    return { id, line: logs.slice(from).filter(l => /§UDP6-RECENT/.test(l)).pop() || null };
  };
  const home = async () => { await pg.waitForSelector('#idmp-home', { timeout: 15000 }).catch(() => {}); await pg.waitForTimeout(1500);
    return pg.evaluate(() => [...document.querySelectorAll('#idmp-home-side .ri-item')].map(a => ({ id: a.getAttribute('data-ri-id'), win: a.getAttribute('data-ri-window'), label: a.textContent }))); };
  const nameOf = () => pg.$eval(F('name'), e => e.value).catch(() => null);
  await pg.goto(url, { waitUntil: 'networkidle' }); await login(); await openWin(123);
  const bp = await editName(null); const bpName = await nameOf();
  await openWin(140);
  const pr = await editName(null); const prName = await nameOf();
  console.log('  saved bp=' + bp.id + ' "' + bpName + '" product=' + pr.id + ' "' + prName + '"');
  await pg.reload({ waitUntil: 'networkidle' }); await login();
  const L1 = await home();
  console.log('  home list=' + JSON.stringify(L1));
  ok('H1', 'Home side panel lists the Product first, then the Business Partner (getFromUser Updated DESC)', L1.length >= 2 && L1[0].win === '140' && L1[1].win === '123', JSON.stringify(L1.slice(0, 3)));
  ok('H2', "labels = window name + ': ' + the record as it is NOW (the edited Name from the op-log, not the seed's)",
    L1.length >= 2 && /^Product: /.test(L1[0].label) && L1[0].label.indexOf(prName) >= 0 && /^Business Partner: /.test(L1[1].label) && L1[1].label.indexOf(bpName) >= 0, JSON.stringify(L1.slice(0, 2).map(x => x.label)));
  const from = logs.length;
  if (L1.length) await hc('#idmp-home-side .ri-item >> nth=0'); await pg.waitForTimeout(1500);
  const z = logs.slice(from).filter(l => /^§ZOOM /.test(l)).pop() || '';
  const snap = await pg.evaluate(() => { try { const s = window.IdmpGridTab.snapshot(); return { key: s.currentKey, rows: s.rows.length }; } catch (e) { return null; } });
  ok('H3', 'clicking it opens the Product window with exactly that record (AEnv.zoom, equal query)', /window=140 /.test(z) && /landed=true/.test(z) && snap && snap.rows === 1 && String(snap.key) === String(pr.id), z + ' ' + JSON.stringify(snap));
  await pg.reload({ waitUntil: 'networkidle' }); await login();
  const L2 = await home();
  if (L2.length >= 2) { await pg.locator('#idmp-home-side .ri-item').nth(1).dragTo(pg.locator('#idmp-home-side .ri-trash')); await pg.waitForTimeout(1500); }
  const rm = logs.filter(l => /§UDP6G-REMOVE/.test(l)).pop() || '';
  const L3 = await pg.evaluate(() => [...document.querySelectorAll('#idmp-home-side .ri-item')].map(a => ({ id: a.getAttribute('data-ri-id'), win: a.getAttribute('data-ri-window') })));
  ok('H4', 'dropping the Business Partner on the trash removes it from the list (riDBremove, signed)', L2.length >= 2 && /committed=true/.test(rm) && !L3.some(x => x.id === L2[1].id) && L3.some(x => x.id === L2[0].id), rm + ' after=' + JSON.stringify(L3));
  await pg.reload({ waitUntil: 'networkidle' }); await login();
  const L4 = await home();
  ok('H5', 'after a reload it stays deleted', L2.length >= 2 && !L4.some(x => x.id === L2[1].id) && L4.some(x => x.id === L2[0].id), JSON.stringify(L4));
  // the ?record= deep link now runs through the SAME zoom (one implementation): it must still land on the record
  const fromD = logs.length;
  await pg.goto(url + '&window=123&record=' + bp.id, { waitUntil: 'networkidle' }); await login(); await pg.waitForTimeout(1500);
  const zd = logs.slice(fromD).filter(l => /^§ZOOM /.test(l)).pop() || '', dl = logs.slice(fromD).filter(l => /§IDEMPIERE-DEEPLINK/.test(l)).pop() || '';
  ok('H7', '?window=123&record=<id> deep link lands on that record through the same zoom', /from=deeplink/.test(zd) && /landed=true/.test(zd) && /landed idx=0 of 1/.test(dl), zd + ' | ' + dl);
  const real = errs.filter(e => !/ResizeObserver/.test(e));
  ok('H6', 'no page errors', real.length === 0, real.slice(0, 3).join(' | '));
  console.log('§UDP6GL-VERDICT ' + (fail ? 'FAIL' : 'PASS') + ' ' + pass + '/' + (pass + fail));
  await browser.close(); srv.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.log('§UDP6GL-VERDICT INCONCLUSIVE ' + (e.stack || e)); process.exit(2); });
