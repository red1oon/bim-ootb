#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-EXPORTSAFE (bim-compiler prompts/FINANCIALS_GROUNDING.md §EXPORTSAFE-SPEC, census risk #5). READ THE LOG: §EXPORTSAFE lines; the exit code is not the evidence.
// THE ISSUE it proves/disproves: sql.js db.export() drops every create_function registration and every TEMP view while the JS handle stays, so a per-site "already registered" flag
//   goes stale-true after the first persist (found: bomPriceStd missing -> every line save refused). Each registrar's FEATURE must return the SAME rows after an export() as before,
//   as numbers: goal engine (UDFs + TEMP views), info window UDF path, plugin pack functions, callout TEMP views (ensureView), dashboard rv_unprocessed TEMP view.
//   Judges: premise (a bare db really loses a UDF + TEMP view on export, else INCONCLUSIVE), one row per registrar (non-vacuous: rows>0), a static census of create_function sites
//   and of surviving flag guards. Mutant EXPORTSAFE_MUTANT=udf_once: the registry does not re-run after export -> every registrar must go RED.
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const ERP = path.join(__dirname, '..'); global.window = global; global.document = {};
const log = console.log; let judged = 0, failed = 0, inconcl = 0;
const chk = (n, ok, info) => { judged++; if (!ok) failed++; log('  §EXPORTSAFE-CHECK ' + n + ' ' + (ok ? 'OK' : 'FAIL') + (info !== undefined ? ' ' + JSON.stringify(info) : '')); };
(async function () {
  const SQL = await require(path.join(ERP, 'sqljs', 'sql-wasm.js'))({ wasmBinary: fs.readFileSync(path.join(ERP, 'sqljs', 'sql-wasm.wasm')) });
  const ES = require(path.join(ERP, 'db_export_safe.js'));
  global.ErpExportSafe = ES;
  const MUT = process.env.EXPORTSAFE_MUTANT === 'udf_once';
  if (MUT) { const real = ES.register; ES.register = function (db, n, fn) { db.__exportSafe = db.__exportSafe || { fns: {}, order: [] }; db.__exportSafe.fns[n] = fn; return fn(db); };   // remembers the name (like a flag) but never re-runs after export
    ES.registerCoreUdfs = function (db, A) { ES.register(db, 'core-udf', d => A.RUNTIME.registerSqlFunctions((n, f) => d.create_function(n, f))); return true; }; }
  // premise: the bare loss
  { const d = new SQL.Database(); d.run('create table t(a)'); d.run('insert into t values(1)'); d.create_function('f1', x => x + 1); d.run('create temp view v as select a from t'); d.export();
    let lostF = false, lostV = false; try { d.exec('select f1(a) from t'); } catch (e) { lostF = /no such function/.test(e.message); } try { d.exec('select a from v'); } catch (e) { lostV = /no such table/.test(e.message); }
    log('§EXPORTSAFE-PREMISE udf_lost_on_export=' + lostF + ' temp_view_lost_on_export=' + lostV);
    if (!lostF || !lostV) { log('§EXPORTSAFE-VERDICT INCONCLUSIVE premise not reproduced (sql.js no longer drops UDF/TEMP on export?)'); process.exit(3); } }
  const seedBytes = fs.readFileSync(path.join(ERP, 'ad_seed.db'));
  const fresh = () => { const d = new SQL.Database(seedBytes); global.__idmpDb = d; return d; };
  const num = (d, sql, p) => { const r = d.exec(sql, p || []); return r.length ? r[0].values.map(v => v.map(x => typeof x === 'number' ? x : (x == null ? null : String(x)))) : []; };
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const A = require(path.join(ERP, 'ad_callout.js'));
  ['support', 'support_stock', 'views', 'currency', 'uom', 'pricing', 'tax', 'sqlfn'].forEach(m => require(path.join(ERP, 'callouts', m + '.js')));
  const bindQ = (db) => A.bind((s, p) => { const st = db.prepare(s), o = []; try { if (p && p.length) st.bind(p); while (st.step()) { const r = st.getAsObject(), k = {}; Object.keys(r).forEach(x => k[x.toLowerCase()] = r[x]); o.push(k); } } finally { st.free(); } return o; }, { log: () => {} });
  const pp = num(new SQL.Database(seedBytes), 'select m_product_id, m_pricelist_version_id from m_productprice where pricestd>0 limit 1')[0];
  // R1 goal engine
  { const db = fresh(); bindQ(db); const GE = require(path.join(ERP, 'goal_engine.js')); GE.install(db);
    const Q = "select count(*), round(sum(grandtotal),2), (select trunc('2026-05-17','MM') is not null) from c_invoice_v";
    const b = num(db, Q); db.export(); let a; try { a = num(db, Q); } catch (e) { a = 'ERR ' + e.message; }
    log('§EXPORTSAFE goal_engine before=' + JSON.stringify(b) + ' after=' + JSON.stringify(a)); chk('R1 goal_engine (UDF trunc + TEMP c_invoice_v)', b[0][0] > 0 && same(a, b), { b, a }); }
  // R2 info window UDF path (ad_infowin tipQ -> core UDFs)
  { const db = fresh(); bindQ(db); global.AdCallout = A; require(path.join(ERP, 'ad_infowin.js')); const IW = global.AdInfoWindow;
    const row = () => { const r = IW.query('SELECT bomPriceStd(?,?) AS p', pp); return [Number(r[0].p)]; };
    const b = row(); db.export(); let a; try { a = row(); } catch (e) { a = 'ERR ' + e.message; }
    log('§EXPORTSAFE infowin before=' + JSON.stringify(b) + ' after=' + JSON.stringify(a)); chk('R2 info window (bomPriceStd via core-udf)', b[0] > 0 && same(a, b), { b, a }); }
  // R3 plugin pack functions
  { const db = fresh(); bindQ(db); const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exs_')), f = path.join(dir, 'fn.mjs');
    fs.writeFileSync(f, 'export function functions(R){ return { exs_plus1: { arity:[1], fn: function(x){ return Number(x)+1; } } }; }');
    global.ErpExportSafe = ES; require(path.join(ERP, 'plugin_overlay.js'));
    const names = await global.PluginEngine._bindFunctions(db, 'file://' + f, 'exs.bundle');
    const Q = 'select exs_plus1(41)', b = num(db, Q); db.export(); let a; try { a = num(db, Q); } catch (e) { a = 'ERR ' + e.message; }
    log('§EXPORTSAFE plugin_pack names=' + JSON.stringify(names) + ' before=' + JSON.stringify(b) + ' after=' + JSON.stringify(a)); chk('R3 plugin pack functions', b[0][0] === 42 && same(a, b), { b, a }); }
  // R4 callout TEMP views (ensureView)
  { const db = fresh(); bindQ(db); const ok1 = A.RUNTIME.M.ensureView('c_payment_v');
    const Q = 'select count(*), round(sum(payamt),2) from c_payment_v', b = ok1 ? num(db, Q) : [[0]]; db.export();
    const ok2 = A.RUNTIME.M.ensureView('c_payment_v'); let a; try { a = num(db, Q); } catch (e) { a = 'ERR ' + e.message; }
    log('§EXPORTSAFE ensureView before=' + JSON.stringify(b) + ' ensure2=' + ok2 + ' after=' + JSON.stringify(a)); chk('R4 callouts/views ensureView (TEMP c_payment_v)', b[0][0] > 0 && same(a, b), { b, a }); }
  // R5 dashboard rv_unprocessed
  { const db = fresh(); bindQ(db); const DS = require(path.join(ERP, 'overlay', 'dashboard_docstatus.js'));
    const q = (s, p) => { const st = db.prepare(s), o = []; try { if (p) st.bind(p); while (st.step()) { const r = st.getAsObject(), k = {}; Object.keys(r).forEach(x => k[x.toLowerCase()] = r[x]); o.push(k); } } finally { st.free(); } return o; };
    const inst = DS.install(db, q), Q = 'select count(*) from rv_unprocessed', b = num(db, Q); db.export(); let a; try { a = num(db, Q); } catch (e) { a = 'ERR ' + e.message; }
    log('§EXPORTSAFE dashboard branches=' + inst.included.length + ' before=' + JSON.stringify(b) + ' after=' + JSON.stringify(a)); chk('R5 dashboard_docstatus (TEMP rv_unprocessed)', b[0][0] > 0 && same(a, b), { b, a }); }
  // R6/R7/R8 + census (static): inline page sites cannot run headless, so judge their SOURCE
  { const html = fs.readFileSync(path.join(ERP, 'idempiere.html'), 'utf8');
    chk('R6 idempiere.html load-time core UDFs go through the registry', /ErpExportSafe\.registerCoreUdfs\(db, window\.AdCallout\)/.test(html));
    chk('R7 idempiere.html pgcollate goes through the registry', /ErpExportSafe\.register\(window\.__idmpDb, 'pgcollate'/.test(html));
    chk('R8 ws_kernel + erp_cli register through the registry', /db_export_safe\.js'\)\.registerCoreUdfs\(db, A\)/.test(fs.readFileSync(path.join(ERP, 'ws_kernel.js'), 'utf8')) && /db_export_safe\.js'\)\)\.register\(O\.db, 'core-udf'/.test(fs.readFileSync(path.join(ERP, '..', 'common', 'door', 'erp_cli.js'), 'utf8')));
    const walk = (d, o) => { fs.readdirSync(d, { withFileTypes: true }).forEach(e => { const p = path.join(d, e.name); if (e.isDirectory()) { if (!/^(tests|tools|lib|sqljs|node_modules|doc|docs)$/.test(e.name)) walk(p, o); } else if (/\.(js|mjs|html)$/.test(e.name)) o.push(p); }); return o; };
    const files = walk(ERP, []).concat(walk(path.join(ERP, '..', 'common'), []));
    const flags = [], cf = [];
    files.forEach(p => { const s = fs.readFileSync(p, 'utf8'); if (/__udfBound|__pgcollate|\bengineOn\b|\bdsOn\b/.test(s)) flags.push(path.relative(ERP, p)); if (/create_function\(/.test(s)) cf.push(path.relative(ERP, p)); });
    const ALLOW = ['callouts/sqlfn.js', 'crud_overlay.js', 'db_export_safe.js', 'goal_engine.js', 'idempiere.html', 'plugin_overlay.js', '../common/door/erp_cli.js', 'ws_kernel.js', 'common/door/erp_cli.js'];
    const cfBad = cf.filter(f => !ALLOW.includes(f) && !/erp_cli\.js$/.test(f) && f !== 'callouts/sqlfn.js');
    log('§EXPORTSAFE census create_function sites=' + JSON.stringify(cf) + ' flag_guards=' + JSON.stringify(flags));
    chk('C1 no per-site UDF flag guards survive (__udfBound/__pgcollate/engineOn/dsOn)', flags.length === 0, flags);
    chk('C2 every create_function site is an allow-listed registrar', cfBad.length === 0, cfBad); }
  log('§EXPORTSAFE-VERDICT ' + (judged === 0 ? 'INCONCLUSIVE nothing judged' : (failed ? 'FAIL' : 'PASS') + ' judged=' + judged + ' failed=' + failed) + (MUT ? ' (mutant udf_once: RED expected)' : ''));
  process.exit(judged === 0 ? 3 : failed ? 1 : 0);
})().catch(e => { log('§EXPORTSAFE-VERDICT FAIL crash ' + (e && e.stack)); process.exit(1); });
