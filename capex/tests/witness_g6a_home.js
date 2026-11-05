#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-G6A-HOME (spec prompts/CAPEX_DASHBOARD.md §5.25, G6a). LOCAL PILOT, READ-ONLY. Headless CPU Chromium on the REAL erp/idempiere.html. READ THE LOG: verdict = §G6A_VERDICT; the exit code is not evidence.
// THE ISSUE it proves/disproves: "through the APP (fold → the viewer's store → §BIM_OVERLAY → the Home) the twin does not hold the rows the pilot holds for the same HHS + SHED folds, or its Home draws values different from
//   what legacy computes over those rows". Earlier legacy == twin checks copied the pilot's rows down inside the witness; here the rows arrive only through the store.
// F fold both through the real store opener (viewer/proj_order_state.js; F4 = its browser branch) · R every column of the 4 tables == the pilot · O legacy's own measure SQL (MMeasureCalc.getSqlPI) on the pilot's Postgres, ROLLED BACK, with TEMP tables shadowing
//   c_project / c_projectphase = the pilot's rows of the 2 folds + the twin's seed rows; instrument check: unshadowed == the stored PA_Goal.MeasureActual · H the Home's DOM == the oracle through the stock title rule, goal_engine exact ==
//   the oracle at legacy's scale · T a saved edit on a fold project (the tip shadows c_project) changes no value · B a reboot does not double anything.
// A value 0 on both sides judges nothing (INCONCLUSIVE). CAPEX Approval Pending reads AD_WF_Activity, not a fold: INCONCLUSIVE, named (G6b). Every goal prints the pilot's whole-client value beside it (§G6A_GAP): that distance is G6b's.
// Break (MUST FAIL): G6A_BREAK=1 adds 1 to every oracle value; G6A_BREAK=2 writes no store to OPFS (the overlay has nothing to land: a Home that still matched would be scope-blind). Usage: NODE_PATH=<bim-ootb>/node_modules node capex/tests/witness_g6a_home.js   (env SHED_DB = the §5.7 SHED building db)
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http'), { spawnSync } = require('child_process');
const initSqlJs = require('sql.js'), { chromium } = require('/home/red1/bim-ootb/tests/node_modules/playwright');
const ROOT = path.join(__dirname, '..', '..'), BD = require(path.join(ROOT, 'erp/bigdecimal.js')), BREAK = process.env.G6A_BREAK === '1', NO_STORE = process.env.G6A_BREAK === '2';
const SHED_DB = process.env.SHED_DB || '/tmp/claude-shed-scratch/cli2db/SHED_extracted.db', HHS_DB = path.join(ROOT, 'buildings/HHS_Office_Federated_extracted.db'), START = '2026-11-01';
const FOLDS = [{ v: 'HHS_Office_Federated', pilot: 1000010, db: HHS_DB, pack: 'rsmeans2024_us.json', iso: 'USD', env: {} }, { v: 'SHED', pilot: 1000007, db: SHED_DB, pack: 'pwd2024_bd.json', iso: 'BDT', env: { BLD_DIR: path.dirname(SHED_DB) } }];
const log = console.log, TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'g6a-')), STORE = path.join(TMP, 'store.db');
let judged = 0, fails = 0, inconc = 0;
const ck = (n, ok, info) => { judged++; if (!ok) fails++; log('  §G6A ' + n + ' ' + (ok ? 'PASS' : 'FAIL') + (info !== undefined ? ' ' + (typeof info === 'string' ? info : JSON.stringify(info)) : '')); };
const inc = (n, why) => { inconc++; log('  §G6A ' + n + ' INCONCLUSIVE ' + why); };
const { psqlRaw, pj, pilotGoals, selects, parse, titleOf } = require('../tools/legacy_goal_sql.js');
const lit = v => v == null ? 'NULL' : "'" + String(v).replace(/'/g, "''") + "'";
const finish = () => { const verdict = judged === 0 ? 'INCONCLUSIVE' : fails ? 'FAIL' : 'PASS'; log('§G6A_VERDICT ' + verdict + ' judged=' + judged + ' fail=' + fails + ' inconclusive=' + inconc + (BREAK || NO_STORE ? ' (G6A_BREAK=' + process.env.G6A_BREAK + ': FAIL expected)' : '')); fs.rmSync(TMP, { recursive: true, force: true }); process.exit(verdict === 'PASS' ? 0 : verdict === 'FAIL' ? 1 : 2); };
const bd = v => { let x = String(v == null ? 0 : v); if (/e/i.test(x)) x = Number(v).toFixed(12); return BD.fromString(x); };

(async () => {
  // ── F: both folds through the real store, as the viewer's OPFS file accumulates them ──
  if (!FOLDS.every(f => fs.existsSync(f.db))) { log('§G6A input missing: ' + FOLDS.filter(f => !fs.existsSync(f.db)).map(f => f.db).join(', ') + ' — rebuild per §5.7'); finish(); }
  const foldOnce = (f, into) => { const r = spawnSync(process.execPath, [path.join(ROOT, 'capex/tools/fold_demo.js'), f.db, STORE, f.pack, f.iso], { env: Object.assign({}, process.env, f.env, { START, INTO: into ? '1' : '0' }), encoding: 'utf8', maxBuffer: 64 << 20 }); return (r.stdout || '') + (r.stderr || ''); };
  const created = out => { const m = out.match(/§FOLD_DEMO created (\{.*?\})/); return m ? JSON.parse(m[1]) : null; };
  const o1 = foldOnce(FOLDS[0], false), o2 = foldOnce(FOLDS[1], true), oAll = o1 + o2;
  oAll.split('\n').filter(l => /§S9-STORE patch|§FOLD_INPUT_4D|§FOLD_DEMO created|§FOLD_DEMO_NOTE NO_/.test(l)).forEach(l => log('    ' + l.slice(0, 200)));
  if (!/tasks=16/.test(o1) || !/tasks=5/.test(o2)) { log('§G6A no 4D run on this code key: node scripts/cache_4d_run.js HHS_Office_Federated; BLD_DIR=' + path.dirname(SHED_DB) + ' node scripts/cache_4d_run.js SHED'); finish(); }
  ck('F1 the store opens with the seed patch: no fold note NO_DDL_DEFAULTS (D1)', /§S9-STORE patch applied/.test(o1) && !/NO_DDL_DEFAULTS/.test(oAll));
  ck('F2 both folds created their trees', (created(o1) || {}).phases === 6 && (created(o1) || {}).lines === 45 && (created(o2) || {}).phases === 5 && (created(o2) || {}).lines === 12, { hhs: created(o1), shed: created(o2) });
  const o3 = foldOnce(FOLDS[0], true), c3 = created(o3) || {};
  ck('F3 a re-fold into the store creates nothing', ['projects', 'phases', 'tasks', 'lines', 'products', 'categories'].every(k => c3[k] === 0), c3);

  // ── R: every column of the 4 tables, store vs pilot ──
  const SQL = await initSqlJs(), sdb = new SQL.Database(fs.readFileSync(STORE));
  const rows = (s, p) => { const st = sdb.prepare(s), o = []; try { if (p) st.bind(p); while (st.step()) { const a = st.getAsObject(), k = {}; for (const x in a) k[x.toLowerCase()] = a[x]; o.push(k); } } finally { st.free(); } return o; };
  const SKIP = /^(created|updated|createdby|updatedby|.*_uu|c_project_id|c_projectphase_id|c_projecttask_id|c_projectline_id|m_product_id|m_product_category_id)$/;
  const norm = v => { if (v == null || v === '') return null; const s = String(v); if (/^\d{4}-\d\d-\d\d[T ]/.test(s)) return s.slice(0, 10); return /^-?\d+(\.\d+)?$/.test(s) ? String(Number(s)) : s; };
  const foldedIds = [];
  for (const f of FOLDS) {
    const tp = rows('SELECT * FROM c_project WHERE value=?', [f.v])[0]; foldedIds.push(tp.c_project_id);
    const pPh = pj('c_projectphase', 'c_project_id=' + f.pilot), tPh = rows('SELECT * FROM c_projectphase WHERE c_project_id=?', [tp.c_project_id]);
    const pTk = pj('c_projecttask', 'c_projectphase_id IN (SELECT c_projectphase_id FROM c_projectphase WHERE c_project_id=' + f.pilot + ')'), tTk = rows('SELECT t.* FROM c_projecttask t JOIN c_projectphase p ON p.c_projectphase_id=t.c_projectphase_id WHERE p.c_project_id=?', [tp.c_project_id]);
    const pLn = pj('c_projectline', 'c_project_id=' + f.pilot), tLn = rows('SELECT * FROM c_projectline WHERE c_project_id=?', [tp.c_project_id]);
    const phOf = a => { const t = tPh.find(x => x.c_projectphase_id === a.c_projectphase_id); return t && pPh.find(x => x.name === t.name); };
    const pairs = [[tp, pj('c_project', 'c_project_id=' + f.pilot)[0]]].concat(tPh.map(a => [a, pPh.find(b => b.name === a.name)]), tTk.map(a => { const b = phOf(a); return [a, b && pTk.find(x => x.name === a.name && x.c_projectphase_id === b.c_projectphase_id)]; }),
      tLn.map(a => { const b = phOf(a), tt = tTk.find(x => x.c_projecttask_id === a.c_projecttask_id), pt = tt && b && pTk.find(x => x.name === tt.name && x.c_projectphase_id === b.c_projectphase_id); return [a, b && pt && pLn.find(x => x.c_projectphase_id === b.c_projectphase_id && x.c_projecttask_id === pt.c_projecttask_id && x.description === a.description && Number(x.plannedqty) === Number(a.plannedqty))]; }));
    const diff = {}; let paired = 0, unpaired = 0;
    pairs.forEach(([a, b]) => { if (!b) { unpaired++; return; } paired++; new Set(Object.keys(a).concat(Object.keys(b))).forEach(k => { if (SKIP.test(k)) return; if (!(k in a) || !(k in b)) { const t = (k in a ? 'pilot lacks ' : 'twin lacks ') + k; (diff[t] = diff[t] || []).push(1); return; } if (norm(a[k]) !== norm(b[k])) (diff[k] = diff[k] || []).push('twin=' + a[k] + ' pilot=' + b[k]); }); });
    Object.keys(diff).forEach(k => log('    §G6A_ROWDIFF ' + f.v + ' ' + k + ' n=' + diff[k].length + ' e.g. ' + diff[k][0]));
    ck('R ' + f.v + ' store == pilot #' + f.pilot + ': same row counts, every column', tPh.length === pPh.length && tTk.length === pTk.length && tLn.length === pLn.length && unpaired === 0 && paired > 0 && !Object.keys(diff).length, { phases: [tPh.length, pPh.length], tasks: [tTk.length, pTk.length], lines: [tLn.length, pLn.length], paired, unpaired, diffCols: Object.keys(diff) });
  }

  // ── O: the oracle = legacy's own measure SQL over the same rows (nothing written on the pilot) ──
  const goals = pilotGoals();
  const seedP = rows('SELECT * FROM c_project WHERE ad_client_id=11 AND c_project_id NOT IN (' + foldedIds.join(',') + ')'), seedPh = rows('SELECT * FROM c_projectphase WHERE c_project_id IN (' + (seedP.map(r => r.c_project_id).join(',') || '0') + ')');
  log('§G6A_POP the twin\'s seed rows beside the 2 folds: ' + seedP.map(r => r.c_project_id + ' ' + r.value + ' balance=' + r.projectbalanceamt + ' cur=' + r.c_currency_id).join(' · ') + ' · their phases=' + seedPh.length);
  pj('c_project', "ad_client_id=11 AND c_project_id NOT IN (" + FOLDS.map(f => f.pilot).join(',') + ')').forEach(r => log('    §G6A_POP on the pilot only (or differing): ' + r.c_project_id + ' ' + r.value + ' active=' + r.isactive + ' planned=' + r.plannedamt + ' balance=' + r.projectbalanceamt));
  const insOf = (t, r, cols) => 'INSERT INTO ' + t + ' (' + cols.join(',') + ') VALUES (' + cols.map(c => lit(r[c])).join(',') + ');';
  const PC = ['c_project_id', 'ad_client_id', 'ad_org_id', 'isactive', 'processed', 'c_currency_id', 'plannedamt', 'committedamt', 'invoicedamt', 'projectbalanceamt', 'value', 'name', 'datefinish'], PHC = ['c_projectphase_id', 'c_project_id', 'ad_client_id', 'ad_org_id', 'isactive', 'plannedamt', 'committedamt', 'iscomplete', 'name', 'startdate', 'enddate', 'seqno'];
  const out = psqlRaw(selects(goals, 'U') + '\nBEGIN;\nCREATE TEMP TABLE c_project ON COMMIT DROP AS SELECT * FROM adempiere.c_project WHERE c_project_id IN (' + FOLDS.map(f => f.pilot).join(',') + ');\nCREATE TEMP TABLE c_projectphase ON COMMIT DROP AS SELECT * FROM adempiere.c_projectphase WHERE c_project_id IN (' + FOLDS.map(f => f.pilot).join(',') + ');\n' +
    seedP.map(r => insOf('c_project', r, PC)).join('\n') + '\n' + seedPh.map(r => insOf('c_projectphase', r, PHC)).join('\n') + '\n' + selects(goals, 'S') + '\nROLLBACK;');
  const P = parse(out), U = P.U || {}, S = P.S || {};
  let checked = 0;
  goals.forEach(g => { const tag = 'O ' + g.name + ' legacy SQL unshadowed == the stored PA_Goal.MeasureActual'; if (!g.fresh) { inc(tag, 'the stored goal was not computed today'); return; } const sc = (String(g.stored).split('.')[1] || '').length; const ok = U[g.id] != null && bd(U[g.id]).setScale(sc, BD.RoundingMode.HALF_UP).eq(bd(g.stored).setScale(sc, BD.RoundingMode.HALF_UP)); checked++; ck(tag, ok, 'sql=' + U[g.id] + ' stored=' + g.stored); });
  if (!checked) log('§G6A instrument check judged nothing: run capex/tests/witness_pa_tiles.js today first');

  // ── H: the real page: store in OPFS, the capex bundle installed, GardenAdmin's Home ──
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.db': 'application/octet-stream', '.sql': 'text/plain' };
  const server = http.createServer((req, res) => { const u = decodeURIComponent(req.url.split('?')[0]), f = u === '/__g6a_store.db' ? STORE : path.join(ROOT, u); if (u === '/viewer/__g6a_blank.html') { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end('<!DOCTYPE html><meta charset="utf-8"><title>g6a</title>'); } fs.readFile(f, (e, buf) => { if (e) { res.writeHead(404); return res.end('404'); } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(buf); }); });
  await new Promise(r => server.listen(0, r));
  const url = 'http://localhost:' + server.address().port, browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'] }), ctx = await browser.newContext();
  let pg, logs = [], errs = [];
  const open = async () => { pg = await ctx.newPage(); logs = []; errs = []; pg.on('console', m => { const t = m.text(); if (t.indexOf('§') === 0) logs.push(t); }); pg.on('pageerror', e => errs.push(String(e))); await pg.goto(url + '/erp/idempiere.html', { waitUntil: 'networkidle' }); await pg.waitForFunction(() => !!window.__idmpDb, null, { timeout: 30000 }); };
  const signIn = async (c, u) => { await pg.waitForFunction(() => document.querySelector('#idmp-login-clients') && document.querySelector('#idmp-login-clients').children.length > 0, null, { timeout: 20000 });
    await pg.click("#idmp-login-clients .idmp-login-user:has(.nm:text-is('" + c + "'))"); await pg.waitForSelector('#idmp-login-step1:visible'); await pg.click("#idmp-login-users .idmp-login-user:has(.nm:text-is('" + u + "'))"); await pg.waitForSelector('#idmp-login-step2:visible'); await pg.click('#idmp-login-ok'); };
  const hc = async sel => { const l = pg.locator(sel).first(); await l.scrollIntoViewIfNeeded().catch(() => {}); await l.click(); await pg.waitForTimeout(350); };
  const readHome = async () => { await pg.waitForSelector('#idmp-home .pi', { timeout: 20000 }).catch(() => {}); await pg.waitForTimeout(800);
    return pg.evaluate(() => { const db = window.__idmpDb, q = (sql, p) => { const st = db.prepare(sql), o = []; try { if (p) st.bind(p); while (st.step()) { const a = st.getAsObject(), k = {}; Object.keys(a).forEach(x => { k[x.toLowerCase()] = a[x]; }); o.push(k); } } finally { st.free(); } return o; };
      const A = window.APP || {}, access = window.GoalEngine.accessOf(q, A.roleId, A.clientId), d = new Date(), p2 = n => ('0' + n).slice(-2), today = d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()), out = {};
      [].forEach.call(document.querySelectorAll('#idmp-home .pi'), p => { const id = p.getAttribute('data-goal-id'), g = q('SELECT name FROM pa_goal WHERE pa_goal_id=?', [Number(id)])[0]; if (g && /^CAPEX /.test(g.name)) { const r = window.GoalEngine.evaluate(q, Number(id), { today, access }); out[g.name] = { title: p.querySelector('.pt').textContent, engine: r.ok ? r.actual : null, err: r.ok ? null : r.reason }; } });
      return { goals: out, fmt: Object.keys(out).length ? null : 'none', projects: q('SELECT value, plannedamt FROM c_project WHERE ad_client_id=11 ORDER BY c_project_id') }; }); };
  const fmtInt = (v) => pg.evaluate(x => window.DashboardGadgets.fmtInt(Number(x)), v);
  try {
    // F4: the same open in a BROWSER (the fetch branch of _seedPatch, relative to /viewer/ as viewer.html is); nothing in OPFS yet, so src=seed
    const vp = await ctx.newPage(), vl = []; vp.on('console', m => vl.push(m.text()));
    await vp.goto(url + '/viewer/__g6a_blank.html');
    for (const js of ['/common/lib/sql-wasm.js', '/erp/ad_docvalue_wf.js', '/erp/ad_docvalue_overlay.js', '/erp/ad_taxcat_overlay.js', '/viewer/proj_order_state.js']) await vp.addScriptTag({ url: js });
    const vr = await vp.evaluate(async () => { const SQL = await initSqlJs({ locateFile: f => '/common/lib/' + f }), st = await window.ProjOrderState.openStore(SQL, () => fetch('/erp/ad_seed.db').then(r => r.arrayBuffer())); return { src: st.src, ddl: st.db.exec("SELECT COUNT(*) FROM ad_ddl_default")[0].values[0][0] }; });
    log('    ' + (vl.find(t => /§S9-STORE patch/.test(t)) || 'no §S9-STORE patch line').slice(0, 160));
    ck('F4 the browser path opens the store with the seed patch (../erp/patches from /viewer/)', vr.src === 'seed' && vr.ddl > 0 && vl.some(t => /§S9-STORE patch applied/.test(t)), vr); await vp.close();
    await open();
    await pg.evaluate(() => indexedDB.databases().then(ds => Promise.all(ds.map(d => new Promise(r => { const x = indexedDB.deleteDatabase(d.name); x.onsuccess = x.onerror = x.onblocked = () => r(); })))));
    const bytes = NO_STORE ? 0 : await pg.evaluate(async () => { const b = await (await fetch('/__g6a_store.db')).arrayBuffer(), root = await navigator.storage.getDirectory(), d = await root.getDirectoryHandle('bim_analysis', { create: true }), f = await d.getFileHandle('bim_project_orders.db', { create: true }), w = await f.createWritable(); await w.write(b); await w.close(); return b.byteLength; });
    log('§G6A store written to OPFS bytes=' + bytes); await pg.close();
    await open(); await signIn('System', 'System');
    const inst = await pg.evaluate(async u => { const reg = window.PluginEngine._reg(); try { const b = await reg.installBundle(new URL(u, location.href).href); await reg.startBundle(b.id || b.manifest.id); await window.PluginEngine.persist(); return reg.list().filter(x => x.id === 'org.bimootb.capex').map(x => x.state); } catch (e) { return { error: e.message }; } }, '/capex/plugin/capex_dashboard.mjs');
    ck('H0 the System Administrator installed + started the capex bundle', Array.isArray(inst) && inst[0] === 'ACTIVE', inst); await pg.close();
    await open();
    for (let bw = 0; bw < 60 && !logs.some(l => /^§BIM_OVERLAY /.test(l)); bw++) await new Promise(r => setTimeout(r, 250));   // the overlay logs asynchronously: reading at once failed H1 most runs, on a clean main too
    const bootLogs = logs.slice(); await signIn('GardenWorld', 'GardenAdmin');
    const band = {}; ['C_Project', 'C_ProjectPhase', 'C_ProjectTask', 'C_ProjectLine', 'M_Product', 'M_Product_Category'].forEach(t => { const pk = t === 'C_ProjectLine' ? 'c_projectline_id' : t + '_ID'; band[t] = rows('SELECT COUNT(*) AS n FROM ' + t + ' WHERE ' + pk + '>=990000')[0].n; });
    const ov = bootLogs.find(l => /^§BIM_OVERLAY rows=/.test(l)) || '', ovC = (ov.match(/(\{.*\})/) || [])[1], ovJ = ovC ? JSON.parse(ovC) : {};
    log('    ' + ov.slice(0, 240));
    ck('H1 §BIM_OVERLAY carried the store\'s whole band into the page', Object.keys(band).every(k => ovJ[k] === band[k]) && band.C_Project >= 3, { band, overlay: ovJ });
    const H = await readHome();
    log('§G6A_POP page projects ' + JSON.stringify(H.projects));
    ck('H2 the twin\'s Home sees the two folds', FOLDS.every(f => H.projects.some(p => p.value === f.v)), H.projects.map(p => p.value));
    const judgeHome = async (tag, home) => { for (const g of goals) {
      const d = home.goals[g.name], whole = g.stored;
      if (!d) { ck(tag + ' ' + g.name + ' drawn', false, 'absent from the Home'); continue; }
      if (g.name === 'CAPEX Approval Pending') { inc(tag + ' ' + g.name, 'AD_WF_Activity is not a fold: twin ' + d.title + ', pilot whole client ' + whole + ' (G6b)'); continue; }
      if (S[g.id] == null) { inc(tag + ' ' + g.name, 'no oracle (measure type ' + g.mt + ')'); continue; }
      const oracle = BREAK ? bd(S[g.id]).add(BD.of(1)).toString() : S[g.id], want = await titleOf(g, oracle, fmtInt), sc = Math.min((String(oracle).split('.')[1] || '').length, 6), eng = bd(d.engine);
      if (tag === 'H') log('    §G6A_GAP ' + g.name + ' twinHome=' + JSON.stringify(d.title) + ' legacySameRows=' + oracle + ' pilotWholeClient=' + whole);
      if (bd(oracle).isZero() && eng.isZero()) { inc(tag + ' ' + g.name, 'not exercised — 0 on both sides'); continue; }
      ck(tag + ' ' + g.name + ' Home title == legacy over the same rows', d.title === want, 'drawn=' + JSON.stringify(d.title) + ' want=' + JSON.stringify(want));
      ck(tag + ' ' + g.name + ' goal_engine == legacy at scale ' + sc, !d.err && eng.setScale(sc, BD.RoundingMode.HALF_UP).eq(bd(oracle).setScale(sc, BD.RoundingMode.HALF_UP)), 'engine=' + d.engine + ' legacy=' + oracle + (d.err ? ' err=' + d.err : ''));
    } };
    await judgeHome('H', H);

    // ── T: a saved edit on a fold project: the tip now shadows c_project; nothing the Home draws may move ──
    const hhsId = foldedIds[0], MARK = 'G6A tip edit ' + Date.now();
    await pg.waitForFunction(() => document.querySelector('#idmp-tree') && document.querySelector('#idmp-tree').children.length > 0, null, { timeout: 20000 });
    const mid = await pg.evaluate(() => { const r = window.__idmpDb.exec("SELECT AD_Menu_ID FROM AD_Menu WHERE Action='W' AND AD_Window_ID=130 AND IsActive='Y'"); return r.length ? r[0].values[0][0] : null; });
    const chain = await pg.evaluate(id => { const leaf = document.querySelector('#idmp-tree .idmp-row.leaf[data-menu-id="' + id + '"]'); if (!leaf) return null; const o = []; let n = leaf.parentElement.parentElement; while (n && n.id !== 'idmp-tree') { if (n.classList.contains('idmp-node')) o.unshift(n.querySelector(':scope > .idmp-row').getAttribute('data-menu-id')); n = n.parentElement; } return o; }, mid);
    for (const id of chain || []) { const on = await pg.evaluate(i => { const r = document.querySelector('#idmp-tree .idmp-row[data-menu-id="' + i + '"]'); return r && r.parentElement.classList.contains('open'); }, id); if (!on) await hc('#idmp-tree .idmp-row[data-menu-id="' + id + '"]'); }
    await hc('#idmp-tree .idmp-row.leaf[data-menu-id="' + mid + '"]'); await pg.waitForTimeout(1200); await require(path.join(ROOT, 'erp/tests/legacy_open.js')).showAllRows(pg);
    const rowsShown = await pg.evaluate(() => window.IdmpGridTab.snapshot().rows.map(r => String(r.pk)));
    ck('T1 the stock Project window lists the fold projects', foldedIds.every(i => rowsShown.includes(String(i))), { rows: rowsShown });
    if (!(await pg.locator('#idmp-inline-mount [data-col]').count())) { await hc('#idmp-toolbar [data-tb="toggle"]'); await pg.waitForTimeout(800); }
    await hc('#idmp-toolbar button[title^="First record"]');
    for (let i = 0; i < 40; i++) { const cur = await pg.evaluate(() => window.IdmpGridTab.snapshot().currentKey); if (String(cur) === String(hhsId)) break; await hc('#idmp-toolbar button[title^="Next record"]'); }
    await pg.fill('#idmp-inline-mount [data-col="description"]', MARK); await pg.locator('#idmp-inline-mount [data-col="description"]').blur().catch(() => {});
    await hc('#idmp-toolbar [data-tb="save"]'); await pg.waitForTimeout(1500);
    await pg.close(); await open(); await signIn('GardenWorld', 'GardenAdmin');
    await pg.waitForSelector('#idmp-home .pi', { timeout: 20000 }).catch(() => {});
    for (let i = 0; i < 40 && !logs.some(l => /§DASH-GADGET performance redrawn over base \+ tip/.test(l)); i++) await pg.waitForTimeout(250);
    const shadow = logs.filter(l => /^§MV-TIP-SHADOW table=c_project /.test(l))[0] || '';
    log('    ' + shadow.slice(0, 200));
    const tipRow = await pg.evaluate(id => new Promise(res => { const c = window.__crud, r = window.__idmpDb.exec('SELECT * FROM c_project'), base = r[0].values.map(v => { const o = {}; r[0].columns.forEach((k, i) => { o[k.toLowerCase()] = v[i]; }); return o; }); c.withSidecar(sdb => { const t = sdb ? c.core.listTip(sdb, 'c_project', 'c_project_id', base, null).rows : base, x = t.find(y => Number(y.c_project_id) === id); res(x ? { description: x.description, plannedamt: x.plannedamt } : null); }); }), hhsId);
    ck('T2 the edit is in the signed tip and the Home redrew over base + tip with c_project shadowed', !!tipRow && tipRow.description === MARK && logs.some(l => /§DASH-GADGET performance redrawn over base \+ tip/.test(l)) && !!shadow, { tipRow, shadow: shadow.slice(0, 120) });
    const T = await readHome();
    await judgeHome('T', T);

    // ── B: another reboot: per-PK replace, nothing doubles ──
    await pg.close(); await open(); await signIn('GardenWorld', 'GardenAdmin');
    await pg.waitForSelector('#idmp-home .pi', { timeout: 20000 }).catch(() => {});
    for (let i = 0; i < 40 && !logs.some(l => /§DASH-GADGET performance redrawn over base \+ tip/.test(l)); i++) await pg.waitForTimeout(250);
    const B = await readHome();
    ck('B1 a reboot draws the same titles (the overlay replaces by PK, nothing doubles)', JSON.stringify(Object.keys(B.goals).sort().map(k => B.goals[k].title)) === JSON.stringify(Object.keys(T.goals).sort().map(k => T.goals[k].title)) && B.projects.length === T.projects.length, { projects: B.projects.length });
    ck('P no page errors', errs.length === 0, errs.slice(0, 3));
  } catch (e) { ck('flow', false, String(e && e.message || e)); }
  finally { await browser.close(); server.close(); }
  finish();
})().catch(e => { log('§G6A harness ' + (e && e.stack || e)); judged++; fails++; finish(); });
