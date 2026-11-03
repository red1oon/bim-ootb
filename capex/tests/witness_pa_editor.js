#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-PA-EDITOR (spec prompts/CAPEX_DASHBOARD.md §5.22, G5). LOCAL PILOT + headless CPU Chromium on the REAL erp/idempiere.html. READ THE LOG: verdict = §PA_EDITOR_VERDICT.
// THE ISSUE it proves/disproves: "the CAPEX dashboard cannot be edited without code: the five stock PA windows do not open its rows, or an edit made in them does not do in the twin what it does in
//   legacy — the saved goal row (MeasureActual / GoalPerformance / DateLastRun, MGoal.afterSave against the PREVIOUS target) and the Home indicator (the STORED percent, MGoal.getUserGoals)".
// Read from the page and the pilot, never from a screenshot. Break (MUST FAIL): PA_EDITOR_BREAK=1 expects the LIVE percent (actual ÷ the new target) on the Home.
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const { chromium } = require('/home/red1/bim-ootb/tests/node_modules/playwright');
const ROOT = path.join(__dirname, '..', '..'), Push = require(path.join(ROOT, 'viewer/erp_rest_push.js'));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.db': 'application/octet-stream', '.sql': 'text/plain', '.zip': 'application/zip' };
const BREAK = process.env.PA_EDITOR_BREAK === '1', log = console.log, WINDOWS = [212, 213, 215, 364, 50007], GOAL = 'CAPEX Approved Budget (USD)', TARGET = '1000';
let judged = 0, fails = 0, inconc = 0;
const ck = (n, ok, info) => { judged++; if (!ok) fails++; log('  §PA_EDITOR ' + n + ' ' + (ok ? 'PASS' : 'FAIL') + (info !== undefined ? ' ' + JSON.stringify(info) : '')); };
const inc = (n, why) => { inconc++; log('  §PA_EDITOR ' + n + ' INCONCLUSIVE ' + why); };
const psql = (sql) => execFileSync('docker', ['exec', '-i', 'postgres', 'psql', '-U', 'adempiere', '-d', 'idempiere_pilot', '-v', 'ON_ERROR_STOP=1', '-qtA'], { input: 'SET search_path=adempiere;\n' + sql }).toString().trim();
const server = http.createServer((req, res) => { const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0])); fs.readFile(f, (e, buf) => { if (e) { res.writeHead(404); return res.end('404'); } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(buf); }); });
(async () => {
  // ── L: legacy oracle (pilot) — the same edit through stock update_data (a model save, like the window's Save) ──
  const base = process.env.BRIDGE_BASE || 'http://localhost:8088', login = { user: 'GardenAdmin', pass: 'GardenAdmin', lang: 'en_US', clientId: 11, roleId: 102, orgId: 11, warehouseId: 103, stage: 0 };
  const ws = async (m, b) => Push.parseStandardResponse(await (await fetch(base + '/ADInterface/services/rest/model_adservice/' + m, { method: 'POST', headers: { 'Content-Type': 'application/xml', Accept: 'application/xml' }, body: b })).text());
  const saveTarget = (id, v) => ws('update_data', Push.buildCrudXml(login, { serviceType: 'BridgeUpdatePAGoal', tableName: 'PA_Goal', action: 'Update', recordId: id, fields: [{ column: 'MeasureTarget', val: v }] }));
  const read = (id) => Push.queryRows(base, login, 'QueryPAGoal', 'PA_Goal', [{ column: 'PA_Goal_ID', val: +id }]).then(r => r[0]);
  let L = null;
  try {
    const g0 = (await Push.queryRows(base, login, 'QueryPAGoal', 'PA_Goal', [{ column: 'Name', val: GOAL }]))[0];
    if (!g0) inc('L', 'pilot has no goal ' + GOAL); else if (Number(g0.MeasureTarget) !== 0) inc('L', 'pilot goal target is ' + g0.MeasureTarget + ', expected the shipped 0');
    else {
      const r = await saveTarget(g0.PA_Goal_ID, TARGET), g1 = await read(g0.PA_Goal_ID);
      L = { before: g0, after: g1, err: r.isError ? r.error : null };
      log('§PA_EDITOR legacy edit target 0→' + TARGET + ' before=' + JSON.stringify({ a: g0.MeasureActual, p: g0.GoalPerformance, d: g0.DateLastRun }) + ' after=' + JSON.stringify({ t: g1.MeasureTarget, a: g1.MeasureActual, p: g1.GoalPerformance, d: g1.DateLastRun }));
      ck('L1 legacy: the save recomputes the goal (DateLastRun moves, MeasureActual = its measure)', !r.isError && g1.DateLastRun !== g0.DateLastRun && Number(g1.MeasureActual) > 0, { err: L.err, before: g0.DateLastRun, after: g1.DateLastRun, actual: g1.MeasureActual });
      ck('L2 legacy: performance scored against the PREVIOUS target (0) → 0, so its Home shows 0%', Number(g1.GoalPerformance) === 0, { perf: g1.GoalPerformance, target: g1.MeasureTarget });
      await saveTarget(g0.PA_Goal_ID, '0');   // put the shipped target back; that save scores against 1000 (§5.4 b) — repaired to legacy's own target-0 rule, as pa_probe does
      psql('UPDATE PA_Goal SET GoalPerformance=0 WHERE PA_Goal_ID=' + Number(g0.PA_Goal_ID) + ';');
    }
  } catch (e) { inc('L', 'pilot not readable: ' + e.message); }

  // ── the twin ──
  await new Promise(r => server.listen(0, r));
  const url = 'http://localhost:' + server.address().port, browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'] }), ctx = await browser.newContext();
  let pg, logs = [], errs = [];
  const open = async () => { pg = await ctx.newPage(); logs = []; errs = []; pg.on('console', m => { const t = m.text(); if (t.indexOf('§') === 0) logs.push(t); }); pg.on('pageerror', e => errs.push(String(e)));
    await pg.goto(url + '/erp/idempiere.html', { waitUntil: 'networkidle' }); await pg.waitForFunction(() => !!window.__idmpDb, null, { timeout: 30000 }); };
  const signIn = async (c, u) => { await pg.waitForFunction(() => document.querySelector('#idmp-login-clients') && document.querySelector('#idmp-login-clients').children.length > 0, null, { timeout: 20000 });
    await pg.click("#idmp-login-clients .idmp-login-user:has(.nm:text-is('" + c + "'))"); await pg.waitForSelector('#idmp-login-step1:visible');
    await pg.click("#idmp-login-users .idmp-login-user:has(.nm:text-is('" + u + "'))"); await pg.waitForSelector('#idmp-login-step2:visible'); await pg.click('#idmp-login-ok'); };
  const hc = async (sel) => { const l = pg.locator(sel).first(); await l.scrollIntoViewIfNeeded().catch(() => {}); await l.click(); await pg.waitForTimeout(350); };
  const q = (sql) => pg.evaluate(s => { const r = window.__idmpDb.exec(s); return r.length ? r[0].values : []; }, sql);
  const openWin = async (wid) => {
    const m = await q("SELECT AD_Menu_ID FROM AD_Menu WHERE Action='W' AND AD_Window_ID=" + wid + " AND IsActive='Y'"); if (!m.length) return false; const mid = m[0][0];
    const chain = await pg.evaluate(id => { const leaf = document.querySelector('#idmp-tree .idmp-row.leaf[data-menu-id="' + id + '"]'); if (!leaf) return null; const out = []; let n = leaf.parentElement.parentElement;
      while (n && n.id !== 'idmp-tree') { if (n.classList.contains('idmp-node')) out.unshift(n.querySelector(':scope > .idmp-row').getAttribute('data-menu-id')); n = n.parentElement; } return out; }, mid);
    if (!chain) return false;
    for (const id of chain) { const isOpen = await pg.evaluate(i => { const r = document.querySelector('#idmp-tree .idmp-row[data-menu-id="' + i + '"]'); return r && r.parentElement.classList.contains('open'); }, id); if (!isOpen) await hc('#idmp-tree .idmp-row[data-menu-id="' + id + '"]'); }
    await hc('#idmp-tree .idmp-row.leaf[data-menu-id="' + mid + '"]'); await pg.waitForTimeout(1200);
    await require(path.join(ROOT, 'erp/tests/legacy_open.js')).showAllRows(pg); return true;
  };
  try {
    await open(); await pg.evaluate(() => indexedDB.databases().then(ds => Promise.all(ds.map(d => new Promise(r => { const x = indexedDB.deleteDatabase(d.name); x.onsuccess = x.onerror = x.onblocked = () => r(); }))))); await pg.close();
    await open(); await signIn('System', 'System');
    const inst = await pg.evaluate(async (u) => { const reg = window.PluginEngine._reg(); try { const b = await reg.installBundle(new URL(u, location.href).href); await reg.startBundle(b.id || b.manifest.id); await window.PluginEngine.persist(); return reg.list().filter(x => x.id === 'org.bimootb.capex').map(x => x.state); } catch (e) { return { error: e.message }; } }, '/capex/plugin/capex_dashboard.mjs');
    log('§PA_EDITOR bundle ' + JSON.stringify(inst)); await pg.close();
    await open(); await signIn('GardenWorld', 'GardenAdmin');
    await pg.waitForFunction(() => document.querySelector('#idmp-tree') && document.querySelector('#idmp-tree').children.length > 0, null, { timeout: 20000 });
    // ── E1: X of 5 windows open the role-visible rows ──
    const orgs = (await q("SELECT AD_Org_ID FROM AD_Role_OrgAccess WHERE AD_Role_ID=102 AND IsActive='Y'")).map(r => r[0]).concat([0]).join(',');
    let okN = 0;
    for (const w of WINDOWS) {
      const t = (await q('SELECT tb.TableName FROM AD_Tab t JOIN AD_Table tb ON tb.AD_Table_ID=t.AD_Table_ID WHERE t.AD_Window_ID=' + w + ' AND t.TabLevel=0 ORDER BY t.SeqNo LIMIT 1'))[0][0];
      const opened = await openWin(w), snap = opened ? await pg.evaluate(() => window.IdmpGridTab.snapshot()) : null;
      const want = Number((await q('SELECT COUNT(*) FROM ' + t + ' WHERE AD_Client_ID IN (0,11) AND AD_Org_ID IN (' + orgs + ')'))[0][0]);
      const capex = Number((await q("SELECT COUNT(*) FROM " + t + " WHERE " + (t === 'PA_DashboardContent' || t === 'PA_ColorSchema' ? '1=0' : "Name LIKE 'CAPEX %'")))[0][0]);
      const pks = snap ? snap.rows.map(r => String(r.pk)) : [], capexShown = capex ? Number((await q("SELECT COUNT(*) FROM " + t + " WHERE Name LIKE 'CAPEX %' AND " + t + "_ID IN (" + (pks.join(',') || '0') + ")"))[0][0]) : 0;
      const ok = !!snap && snap.table.toLowerCase() === t.toLowerCase() && snap.rows.length === want && capexShown === capex;
      if (ok) okN++;
      log('  §PA_EDITOR window=' + w + ' table=' + t + ' opened=' + opened + ' rows=' + (snap ? snap.rows.length : null) + ' roleVisible=' + want + ' capexRows=' + capexShown + '/' + capex);
    }
    ck('E1 the stock PA windows open their role-visible rows, CAPEX rows among them: ' + okN + ' of ' + WINDOWS.length, okN === WINDOWS.length, okN);
    // ── E2/E3: edit the goal's target in Performance Goal (form + Save), read the row back ──
    const gid = (await q("SELECT PA_Goal_ID FROM PA_Goal WHERE Name='" + GOAL + "' AND AD_Client_ID=11"))[0][0];
    await openWin(212);
    if (!(await pg.locator('#idmp-inline-mount [data-col]').count())) { await hc('#idmp-toolbar [data-tb="toggle"]'); await pg.waitForTimeout(800); }
    await hc('#idmp-toolbar button[title^="First record"]');
    for (let i = 0; i < 80; i++) { const cur = await pg.evaluate(() => window.IdmpGridTab.snapshot().currentKey); if (String(cur) === String(gid)) break; await hc('#idmp-toolbar button[title^="Next record"]'); }
    const at = await pg.evaluate(() => window.IdmpGridTab.snapshot().currentKey);
    const F = (c) => '#idmp-inline-mount [data-col="' + c + '"]';
    const before = await pg.evaluate(() => { const o = {}; ['measuretarget', 'measureactual', 'goalperformance', 'datelastrun'].forEach(c => { const e = document.querySelector('#idmp-inline-mount [data-col="' + c + '"]'); o[c] = e ? (e.value !== undefined ? e.value : e.textContent) : null; }); return o; });
    await pg.fill(F('measuretarget'), TARGET); await pg.locator(F('measuretarget')).blur().catch(() => {});
    const from = logs.length; await hc('#idmp-toolbar [data-tb="save"]'); await pg.waitForTimeout(1500);
    const saveLines = logs.slice(from).filter(l => /§(CRUD|MODEL|SAVE|PA_|GE)/.test(l)).slice(0, 8);
    const row = await pg.evaluate((id) => new Promise(res => { const c = window.__crud, base = (() => { const r = window.__idmpDb.exec('SELECT * FROM pa_goal WHERE pa_goal_id=' + id); return r.length ? r[0].values.map(v => { const o = {}; r[0].columns.forEach((k, i) => o[k.toLowerCase()] = v[i]); return o; }) : []; })();
      if (!c || !c.withSidecar) return res({ base: base[0], tip: null }); c.withSidecar(sdb => { const t = sdb ? c.core.listTip(sdb, 'pa_goal', 'pa_goal_id', base, null).rows : base; res({ base: base[0], tip: t[0] || null }); }); }), gid);
    const after = await pg.evaluate(() => { const o = {}; ['measuretarget', 'measureactual', 'goalperformance', 'datelastrun'].forEach(c => { const e = document.querySelector('#idmp-inline-mount [data-col="' + c + '"]'); o[c] = e ? (e.value !== undefined ? e.value : e.textContent) : null; }); return o; });
    log('§PA_EDITOR twin edit goal=' + gid + ' at=' + at + ' form before=' + JSON.stringify(before) + ' after=' + JSON.stringify(after)); saveLines.forEach(l => log('    ' + l.slice(0, 220)));
    log('§PA_EDITOR twin row base=' + JSON.stringify(row.base && { t: row.base.measuretarget, a: row.base.measureactual, p: row.base.goalperformance, d: row.base.datelastrun }) + ' tip=' + JSON.stringify(row.tip && { t: row.tip.measuretarget, a: row.tip.measureactual, p: row.tip.goalperformance, d: row.tip.datelastrun }));
    const cur = row.tip || row.base;
    ck('E2 the edit is saved through the stock window (target ' + TARGET + ')', String(at) === String(gid) && cur && Number(cur.measuretarget) === Number(TARGET), { at: at, target: cur && cur.measuretarget });
    const sqlActual = await pg.evaluate((id) => { const r = window.GoalEngine.evaluate(function (s, p) { const st = window.__idmpDb.prepare(s), out = []; try { if (p) st.bind(p); while (st.step()) { const o = st.getAsObject(), k = {}; Object.keys(o).forEach(x => k[x.toLowerCase()] = o[x]); out.push(k); } } finally { st.free(); } return out; }, id, { today: (function () { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); })(), access: window.GoalEngine.accessOf(function (s, p) { const st = window.__idmpDb.prepare(s), out = []; try { if (p) st.bind(p); while (st.step()) { const o = st.getAsObject(), k = {}; Object.keys(o).forEach(x => k[x.toLowerCase()] = o[x]); out.push(k); } } finally { st.free(); } return out; }, window.APP.roleId, window.APP.clientId) }); return r.ok ? r.actual : null; }, gid);
    ck('E3 the saved row carries legacy\'s recompute (MeasureActual = the measure, GoalPerformance 0 = against the PREVIOUS target, DateLastRun set)', cur && Number(cur.measureactual) === sqlActual && Number(cur.goalperformance) === 0 && !!cur.datelastrun, { actual: cur && cur.measureactual, sql: sqlActual, perf: cur && cur.goalperformance, dateLastRun: cur && cur.datelastrun });
    // ── E4: the Home after the edit (a fresh boot, the user signs in again — the Home renders on login) ──
    await pg.close(); await open(); await signIn('GardenWorld', 'GardenAdmin');
    await pg.waitForSelector('#idmp-home .pi', { timeout: 20000 }).catch(() => {});
    for (let i = 0; i < 40 && !logs.some(l => /§DASH-GADGET performance redrawn over base \+ tip/.test(l)); i++) await pg.waitForTimeout(250);   // the tip redraw (§5.24) — read after it
    log('§PA_EDITOR home redraw over the tip: ' + logs.some(l => /§DASH-GADGET performance redrawn over base \+ tip/.test(l)));
    const drawn = await pg.evaluate((id) => { const p = document.querySelector('#idmp-home .pi[data-goal-id="' + id + '"]'); return p ? p.querySelector('.pt').textContent : null; }, gid);
    if (process.env.PA_EDITOR_DEBUG) { const re = new RegExp('§DASH-GOAL id=' + gid + ' |§DASH-GADGET|§CRUD-TIP|§DASH-HOME|withTip'); logs.filter(l => re.test(l)).slice(0, 12).forEach(l => log('  dbg ' + l.slice(0, 240))); }
    const pct = BREAK ? Math.trunc((sqlActual / Number(TARGET)) * 100) : 0;
    const want = GOAL + ': ' + pct + '%';
    ck('E4 the Home indicator == legacy\'s rule on the stored row ("' + want + '")', drawn === want, { drawn: drawn, legacyRule: want });
    ck('P no page errors', errs.length === 0, errs.slice(0, 3));
  } catch (e) { ck('flow', false, String(e && e.message || e)); }
  finally { await browser.close(); server.close(); }
  const verdict = judged === 0 ? 'INCONCLUSIVE' : fails ? 'FAIL' : 'PASS';
  log('§PA_EDITOR_VERDICT ' + verdict + ' judged=' + judged + ' fail=' + fails + ' inconclusive=' + inconc + (BREAK ? ' (PA_EDITOR_BREAK=1: FAIL expected)' : ''));
  process.exit(verdict === 'PASS' ? 0 : 1);
})();
