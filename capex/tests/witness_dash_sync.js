#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-DASH-SYNC (spec prompts/CAPEX_DASHBOARD.md §5.26, G6b). LOCAL PILOT ONLY. Headless CPU Chromium on the REAL erp/idempiere.html. READ THE LOG: verdict = §DASH_SYNC_VERDICT; the exit code is not evidence.
// THE ISSUE it proves/disproves: "the twin's Home cannot equal a legacy site's own Home: nothing brings that site's rows into the twin". The small job (capex/tools/legacy_snapshot.js, stock WS reads) writes a file; the capex plugin mirrors it at boot;
//   every CAPEX goal's Home title and goal_engine value must then == the pilot's stored PA_Goal for its WHOLE client, none excepted. A value 0 on both sides judges nothing (INCONCLUSIVE).
// G legacy's own engine recomputes every goal first (target save, §5.16) · J the job's file holds no password · N applied twice the second changes 0; an unavailable or empty mirror table is left alone · H the page: row counts == the pilot, Home == PA_Goal · E a real pilot edit (SHED Substructure IsComplete=Y through the
//   existing stock type BridgeUpdateCProjectPhase) arrives by the next job + boot, Home == legacy's SQL, Health Green moved on legacy; RESTORED to N in finally and read back; the phase row's Updated stamp and the goals' DateLastRun are all that is left behind.
// Break (MUST FAIL): DASH_SYNC_BREAK=1 adds 1 to every expected value. Usage: NODE_PATH=<bim-ootb>/node_modules node capex/tests/witness_dash_sync.js   (needs the pilot at http://localhost:8088)
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http'), { spawnSync } = require('child_process'), { pathToFileURL } = require('url');
const initSqlJs = require('sql.js'), { chromium } = require('/home/red1/bim-ootb/tests/node_modules/playwright');
const ROOT = path.join(__dirname, '..', '..'), BD = require(path.join(ROOT, 'erp/bigdecimal.js')), Push = require(path.join(ROOT, 'viewer/erp_rest_push.js')), NB = require(path.join(ROOT, 'erp/ninja_bundle.js'));
const { psqlRaw, pilotGoals, selects, parse } = require('../tools/legacy_goal_sql.js');
const BREAK = process.env.DASH_SYNC_BREAK === '1', log = console.log, TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'dashsync-')), COPY = path.join(TMP, 'site_copy.json'), PASSWORD = 'GardenAdmin', PHASE = 1000018;
const login = { user: 'GardenAdmin', pass: PASSWORD, lang: 'en_US', clientId: 11, roleId: 102, orgId: 11, warehouseId: 103, stage: 0 };
let judged = 0, fails = 0, inconc = 0;
const ck = (n, ok, info) => { judged++; if (!ok) fails++; log('  §DASH_SYNC_W ' + n + ' ' + (ok ? 'PASS' : 'FAIL') + (info !== undefined ? ' ' + (typeof info === 'string' ? info : JSON.stringify(info)) : '')); };
const inc = (n, why) => { inconc++; log('  §DASH_SYNC_W ' + n + ' INCONCLUSIVE ' + why); };
const bd = v => { let x = String(v == null ? 0 : v); if (/e/i.test(x)) x = Number(v).toFixed(12); return BD.fromString(x); };
const job = () => { const r = spawnSync(process.execPath, [path.join(ROOT, 'capex/tools/legacy_snapshot.js'), COPY], { encoding: 'utf8', env: Object.assign({}, process.env, { BRIDGE_BASE: 'http://localhost:8088' }) }); const t = (r.stdout || '') + (r.stderr || ''); log('    ' + t.trim().slice(0, 220)); return r.status === 0; };
const setComplete = async v => { const r = await fetch('http://localhost:8088/ADInterface/services/rest/model_adservice/update_data', { method: 'POST', headers: { 'Content-Type': 'application/xml', Accept: 'application/xml' }, body: Push.buildCrudXml(login, { serviceType: 'BridgeUpdateCProjectPhase', tableName: 'C_ProjectPhase', action: 'Update', recordId: PHASE, fields: [{ column: 'IsComplete', val: v }] }) }); return Push.parseStandardResponse(await r.text()); };
const phaseFlag = () => psqlRaw('SELECT iscomplete FROM c_projectphase WHERE c_projectphase_id=' + PHASE + ';');
const finish = () => { const v = judged === 0 ? 'INCONCLUSIVE' : fails ? 'FAIL' : 'PASS'; log('§DASH_SYNC_VERDICT ' + v + ' judged=' + judged + ' fail=' + fails + ' inconclusive=' + inconc + (BREAK ? ' (DASH_SYNC_BREAK=1: FAIL expected)' : '')); fs.rmSync(TMP, { recursive: true, force: true }); process.exit(v === 'PASS' ? 0 : v === 'FAIL' ? 1 : 2); };

(async () => {
  if (phaseFlag() !== 'N') { log('§DASH_SYNC_W pilot phase ' + PHASE + ' is not N: a previous run was interrupted; restore it first'); finish(); }
  // ── G: legacy's own engine computes every goal NOW (a target save 1→0, MGoal.afterSave, as W-PA-TILES §5.16; GoalPerformance reset to its rule for target 0). A stored goal is up to 30 min old by design and the pilot moves under other sessions
  //      (measured: Standard's balance 318.68 → 334.62 while this was built): compared to a stale PA_Goal, a correct copy reads as a defect. Only the goals' own computed columns change. ──
  const ws = async (method, body) => { const r = await fetch('http://localhost:8088/ADInterface/services/rest/model_adservice/' + method, { method: 'POST', headers: { 'Content-Type': 'application/xml', Accept: 'application/xml' }, body }); return Push.parseStandardResponse(await r.text()); };
  const saveTarget = (id, v) => ws('update_data', Push.buildCrudXml(login, { serviceType: 'BridgeUpdatePAGoal', tableName: 'PA_Goal', action: 'Update', recordId: id, fields: [{ column: 'MeasureTarget', val: v }] }));
  for (const g of pilotGoals()) { const a = await saveTarget(g.id, '1'), b = await saveTarget(g.id, '0'); if (a.isError || b.isError) log('§DASH_SYNC_W goal ' + g.name + ' recompute refused: ' + (a.error || b.error)); }
  psqlRaw("UPDATE PA_Goal SET GoalPerformance=0 WHERE AD_Client_ID=11 AND Name LIKE 'CAPEX %' AND GoalPerformance<>0;");
  // ── J: the small job ──
  ck('J1 the job read the pilot and wrote the file', job() && fs.existsSync(COPY));
  const txt = fs.readFileSync(COPY, 'utf8'), snap = JSON.parse(txt);
  ck('J2 the file carries no password and no login', txt.indexOf(PASSWORD + '"') < 0 && !/"pass"/.test(txt) && !snap.meta.login, { meta: Object.keys(snap.meta) });
  ck('J3 the file keeps every whitelisted column (the PK + UU + client the mirror needs)', snap.projects[0].C_Project_UU != null && snap.projects[0].AD_Client_ID != null && snap.meta.client === 11 && !snap.unavailable.length, { unavailable: snap.unavailable });

  // ── N: the mirror, in node, on the seed + patch ──
  const { applyCopy } = await import(pathToFileURL(path.join(ROOT, 'capex/plugin/legacy_copy.mjs')).href), SQL = await initSqlJs();
  const seedDb = () => { const d = new SQL.Database(fs.readFileSync(path.join(ROOT, 'erp/ad_seed.db'))); fs.readFileSync(path.join(ROOT, 'erp/patches/ad_seed.db.sql'), 'utf8').split(/;\s*\n/).forEach(st => { st = st.replace(/^\s*--[^\n]*\n?/gm, '').trim(); if (st) try { d.run(st); } catch (e) {} }); return NB.makeWritableDbHost(d); };
  const d1 = seedDb(), first = applyCopy(d1, snap, log), second = applyCopy(d1, snap, () => {}), T = Object.keys(first.tables);
  ck('N1 the first apply has no failed row', T.length === 8 && T.every(t => first.tables[t].failed === 0), T.map(t => t + ':' + first.tables[t].failed).join(' '));
  ck('N2 the second apply changes 0 rows', T.every(t => { const n = second.tables[t]; return n.inserted === 0 && n.updated === 0 && n.deleted === 0 && n.failed === 0 && n.unchanged === n.read; }), T.map(t => t + ':' + JSON.stringify(second.tables[t])).join(' ').slice(0, 400));
  const count = (d, t) => d.query('SELECT COUNT(*) AS n FROM ' + t + ' WHERE ad_client_id=11')[0].n;
  const d2 = seedDb(), b4 = count(d2, 'C_Project'), r2 = applyCopy(d2, Object.assign({}, snap, { projects: [] }), () => {}), d3 = seedDb(), r3 = applyCopy(d3, Object.assign({}, snap, { unavailable: ['projects'] }), () => {});
  ck('N3 an empty or unavailable mirror table is left alone, never emptied', r2.tables.C_Project.skip === 'empty' && count(d2, 'C_Project') === b4 && r3.tables.C_Project.skip === 'unavailable' && count(d3, 'C_Project') === b4, { before: b4, empty: count(d2, 'C_Project'), unavailable: count(d3, 'C_Project') });
  ck('N4 the mirror removed the row only the twin had (Hospital #990000)', d1.query('SELECT 1 AS x FROM C_Project WHERE C_Project_ID=990000').length === 0);

  // ── H: the real page ──
  const goals = pilotGoals();
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.db': 'application/octet-stream', '.sql': 'text/plain' };
  let serveCopy = false;
  const server = http.createServer((req, res) => { const u = decodeURIComponent(req.url.split('?')[0]), isCopy = u === '/capex/site_copy.json'; if (isCopy && !serveCopy) { res.writeHead(404); return res.end('404'); } const f = isCopy ? COPY : path.join(ROOT, u); fs.readFile(f, (e, buf) => { if (e) { res.writeHead(404); return res.end('404'); } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(buf); }); });
  await new Promise(r => server.listen(0, r));
  const url = 'http://localhost:' + server.address().port, browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'] }), ctx = await browser.newContext();
  let pg, logs = [], errs = [];
  const open = async () => { pg = await ctx.newPage(); logs = []; errs = []; pg.on('console', m => { const t = m.text(); if (t.indexOf('§') === 0) logs.push(t); }); pg.on('pageerror', e => errs.push(String(e))); await pg.goto(url + '/erp/idempiere.html', { waitUntil: 'networkidle' }); await pg.waitForFunction(() => !!window.__idmpDb, null, { timeout: 30000 }); };
  const signIn = async (c, u) => { await pg.waitForFunction(() => document.querySelector('#idmp-login-clients') && document.querySelector('#idmp-login-clients').children.length > 0, null, { timeout: 20000 });
    await pg.click("#idmp-login-clients .idmp-login-user:has(.nm:text-is('" + c + "'))"); await pg.waitForSelector('#idmp-login-step1:visible'); await pg.click("#idmp-login-users .idmp-login-user:has(.nm:text-is('" + u + "'))"); await pg.waitForSelector('#idmp-login-step2:visible'); await pg.click('#idmp-login-ok'); };
  const readHome = async () => { await pg.waitForSelector('#idmp-home .pi', { timeout: 20000 }).catch(() => {}); await pg.waitForTimeout(800);
    return pg.evaluate(() => { const db = window.__idmpDb, q = (sql, p) => { const st = db.prepare(sql), o = []; try { if (p) st.bind(p); while (st.step()) { const a = st.getAsObject(), k = {}; Object.keys(a).forEach(x => { k[x.toLowerCase()] = a[x]; }); o.push(k); } } finally { st.free(); } return o; };
      const A = window.APP || {}, access = window.GoalEngine.accessOf(q, A.roleId, A.clientId), d = new Date(), p2 = n => ('0' + n).slice(-2), today = d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()), out = {}, cnt = {};
      [].forEach.call(document.querySelectorAll('#idmp-home .pi'), p => { const id = p.getAttribute('data-goal-id'), g = q('SELECT name FROM pa_goal WHERE pa_goal_id=?', [Number(id)])[0]; if (g && /^CAPEX /.test(g.name)) { const r = window.GoalEngine.evaluate(q, Number(id), { today, access }); out[g.name] = { title: p.querySelector('.pt').textContent, engine: r.ok ? r.actual : null, err: r.ok ? null : r.reason }; } });
      ['C_Project', 'C_ProjectPhase', 'C_ProjectTask', 'C_ProjectLine', 'AD_WF_Activity'].forEach(t => { cnt[t] = q('SELECT COUNT(*) AS n FROM ' + t + ' WHERE ad_client_id=11')[0].n; });
      return { goals: out, counts: cnt }; }); };
  const judge = async (tag, home, want) => { let exercised = 0; for (const g of goals) {
      const d = home.goals[g.name], v = want(g);
      if (!d) { ck(tag + ' ' + g.name + ' drawn', false, 'absent from the Home'); continue; }
      if (v == null) { inc(tag + ' ' + g.name, 'no legacy value'); continue; }
      const exp = BREAK ? bd(v).add(BD.of(1)).toString() : String(v), wantT = g.name + ': ' + await pg.evaluate(x => window.DashboardGadgets.fmtInt(Number(x)), exp), sc = Math.min((exp.split('.')[1] || '').length, 6), eng = bd(d.engine);
      if (bd(exp).isZero() && eng.isZero()) { inc(tag + ' ' + g.name, 'not exercised: 0 on both sides'); continue; }
      exercised++;
      ck(tag + ' ' + g.name + ' Home title == legacy', d.title === wantT, 'drawn=' + JSON.stringify(d.title) + ' legacy=' + exp);
      ck(tag + ' ' + g.name + ' goal_engine == legacy at scale ' + sc, !d.err && eng.setScale(sc, BD.RoundingMode.HALF_UP).eq(bd(exp).setScale(sc, BD.RoundingMode.HALF_UP)), 'engine=' + d.engine + ' legacy=' + exp + (d.err ? ' err=' + d.err : ''));
    } log('§DASH_SYNC_W ' + tag + ' goals judged=' + exercised + ' of ' + goals.length); return exercised; };
  let edited = false;
  try {
    await open(); await pg.evaluate(() => indexedDB.databases().then(ds => Promise.all(ds.map(d => new Promise(r => { const x = indexedDB.deleteDatabase(d.name); x.onsuccess = x.onerror = x.onblocked = () => r(); }))))); await pg.close();
    await open(); await signIn('System', 'System');
    const inst = await pg.evaluate(async u => { const reg = window.PluginEngine._reg(); try { const b = await reg.installBundle(new URL(u, location.href).href); await reg.startBundle(b.id || b.manifest.id); await window.PluginEngine.persist(); return reg.list().filter(x => x.id === 'org.bimootb.capex').map(x => x.state + ':' + x.version); } catch (e) { return { error: e.message }; } }, '/capex/plugin/capex_dashboard.mjs');
    ck('H0 the capex bundle started; no file on the site = no change', Array.isArray(inst) && /^ACTIVE/.test(inst[0]) && logs.some(l => /^§DASH_SYNC none/.test(l)), { inst, none: logs.filter(l => /^§DASH_SYNC none/.test(l))[0] }); await pg.close();

    serveCopy = true;
    await open(); const boot = logs.slice(); await signIn('GardenWorld', 'GardenAdmin');
    boot.filter(l => /^§DASH_SYNC /.test(l)).forEach(l => log('    ' + l.slice(0, 200)));
    ck('H1 §DASH_SYNC: 8 tables applied, no failed row', boot.filter(l => /^§DASH_SYNC table=.* failed=0/.test(l)).length === 8 && boot.some(l => /^§DASH_SYNC done client=11/.test(l)));
    const H = await readHome(), pc = {}; Object.keys(H.counts).forEach(t => { pc[t] = Number(psqlRaw('SELECT COUNT(*) FROM ' + t + ' WHERE ad_client_id=11;')); });
    ck('H2 the rows of client 11 == the pilot, table by table', Object.keys(pc).every(t => pc[t] === H.counts[t] && pc[t] > 0), { twin: H.counts, pilot: pc });
    const stale = goals.filter(g => !g.fresh).map(g => g.name);
    if (stale.length) log('§DASH_SYNC_W stored PA_Goal not computed today for: ' + stale.join(', ') + ' — run capex/tests/witness_pa_tiles.js first');
    const nH = await judge('H', H, g => g.fresh ? g.stored : null);
    if (!nH) ck('H3 at least one goal judged', false);

    if (BREAK) { log('§DASH_SYNC_W break run: the pilot edit is skipped (it proves nothing more here, and the pilot is shared)'); await browser.close(); server.close(); finish(); }
    // ── E: a real edit on the pilot arrives by the next job + boot ──
    const before = parse(psqlRaw(selects(goals, 'A'))).A, green = goals.find(g => g.name === 'CAPEX Health Green');
    const res = await setComplete('Y'); edited = true; log('§DASH_SYNC_W pilot edit SHED Substructure IsComplete=Y → ' + JSON.stringify(res).slice(0, 160));
    ck('E1 the stock web service took the edit', !res.isError && phaseFlag() === 'Y', phaseFlag());
    const after = parse(psqlRaw(selects(goals, 'A'))).A;
    ck('E2 legacy moved: Health Green rose, a real green project on the pilot', Number(after[green.id]) > Number(before[green.id]), 'legacy ' + before[green.id] + ' -> ' + after[green.id]);
    goals.filter(g => after[g.id] !== before[g.id]).forEach(g => log('    §DASH_SYNC_W legacy moved ' + g.name + ' ' + before[g.id] + ' -> ' + after[g.id]));
    const snapEdit = (job(), JSON.parse(fs.readFileSync(COPY, 'utf8'))), d4 = NB.makeWritableDbHost(new SQL.Database(d1.export())), edit = applyCopy(d4, snapEdit, () => {});
    ck('E3 the mirror changes exactly the edited row', edit.tables.C_ProjectPhase.updated === 1 && Object.keys(edit.tables).filter(t => t !== 'C_ProjectPhase').every(t => edit.tables[t].updated === 0 && edit.tables[t].inserted === 0 && edit.tables[t].deleted === 0), { phase: edit.tables.C_ProjectPhase });
    await pg.close(); await open(); await signIn('GardenWorld', 'GardenAdmin');
    await judge('E', await readHome(), g => after[g.id] != null ? after[g.id] : null);

    // ── restore, then the Home follows back ──
    const back = await setComplete('N'); edited = phaseFlag() !== 'N';
    ck('R1 the pilot edit is restored', !back.isError && !edited, phaseFlag());
    const restored = parse(psqlRaw(selects(goals, 'A'))).A;
    ck('R2 legacy back to its values', goals.every(g => restored[g.id] === before[g.id]), goals.filter(g => restored[g.id] !== before[g.id]).map(g => g.name));
    job(); await pg.close(); await open(); await signIn('GardenWorld', 'GardenAdmin');
    await judge('R', await readHome(), g => restored[g.id] != null ? restored[g.id] : null);
    ck('P no page errors', errs.length === 0, errs.slice(0, 3));
  } catch (e) { ck('flow', false, String(e && e.message || e)); }
  finally {
    if (edited || phaseFlag() !== 'N') { const r = await setComplete('N').catch(e => ({ isError: true, error: e.message })); log('§DASH_SYNC_W finally restored IsComplete → ' + phaseFlag() + ' ' + JSON.stringify(r).slice(0, 120)); }
    await browser.close(); server.close();
  }
  finish();
})().catch(e => { log('§DASH_SYNC_W harness ' + (e && e.stack || e)); judged++; fails++; finish(); });
