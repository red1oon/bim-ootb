#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: GPL-2.0-only
// ⚠ DO NOT REMOVE — W-LIBERO-DASH (scene "opening screen" of the Libero intro film; spec prompts/mfg/LIBERO_BUNDLE_SLICE1_SPEC.md §SCENE 2). READ THE LOG: §LDASH lines; the exit code is not evidence.
// THE ISSUE it proves/disproves: a module brings its own HOME DASHBOARD content as plain dictionary rows - an Activities indicator (PA_DocumentStatus) and a Performance goal (PA_Goal -> PA_Measure -> PA_MeasureCalc) - staged by
//   manifest.dictionary at START, so they show on the opening screen with ZERO host code, show numbers that equal an INDEPENDENT count/sum over the base tables, move when a manufacturing order is created, and vanish at STOP.
//   Breaks (MUST exit 1): LDASH_BREAK=wrongwhere (indicator filters DR only -> count differs) | nostage (rows never staged) | nostop.
'use strict';
var fs = require('fs'), path = require('path');
if (!global.window) global.window = {};
if (!global.crypto || !global.crypto.subtle) global.crypto = require('crypto').webcrypto;
var ERP = path.join(__dirname, '..'), BREAK = process.env.LDASH_BREAK || '', judged = 0, fails = 0, log = console.log;
function check(n, ok, info) { judged++; if (!ok) fails++; log('  §LDASH ' + n + ' ' + (ok ? 'PASS' : 'FAIL') + (ok ? '' : ' ' + JSON.stringify(info))); }
(async function () {
  var initSqlJs; try { initSqlJs = require('sql.js'); } catch (e) { initSqlJs = require('/home/red1/bim-ootb/node_modules/sql.js'); }
  var SQL = await initSqlJs(), db = new SQL.Database(new Uint8Array(fs.readFileSync(path.join(ERP, 'ad_seed.db'))));
  ['ad_seed.db.sql', 'mfg.sql'].forEach(function (pf) { fs.readFileSync(path.join(ERP, 'patches', pf), 'utf8').split(/;\s*\n/).forEach(function (st) { st = st.replace(/^\s*--[^\n]*\n?/gm, '').trim(); if (st) try { db.run(st); } catch (e) {} }); });
  var MV = require(path.join(ERP, 'ad_modelval.js')), ML = require(path.join(ERP, 'model_layer.js')), AC = require(path.join(ERP, 'ad_callout.js')), AP = require(path.join(ERP, 'ad_process.js')), DP = require(path.join(ERP, 'doc_poster.js')), PR = require(path.join(ERP, 'plugin_registry.js'));
  var DS = require(path.join(ERP, 'overlay', 'dashboard_docstatus.js')), GE = require(path.join(ERP, 'overlay', 'goal_engine.js')), DG = require(path.join(ERP, 'overlay', 'dashboard_gadgets.js'));
  try { require(path.join(ERP, 'model_trade.js')); } catch (e) { /* allocator optional */ }
  globalThis.ModelLayer = ML; globalThis.ModelTrade = require(path.join(ERP, 'model_trade.js')); globalThis.ModelCost = require(path.join(ERP, 'model_cost.js')); globalThis.ModelMaster = require(path.join(ERP, 'model_master.js'));   // the Libero chunks reuse the core ports
  function q(sql, params) { var st = db.prepare(sql), out = []; try { if (params && params.length) st.bind(params.map(function (v) { return v === undefined ? null : v; })); while (st.step()) { var o = st.getAsObject(), r = {}; for (var k in o) r[k.toLowerCase()] = o[k]; out.push(r); } } finally { st.free(); } return out; }
  var hostDb = { query: q, run: function (sql, p) { db.run(sql, p || []); } };
  var host = { engineVersion: '1.0.0', db: hostDb, ops: { append: function () { return 1; } }, modelval: MV, callout: AC, process: AP, postTokens: {}, docAction: ML, docClass: DP, import: function (u) { return import(u); } };
  db.run("UPDATE pp_order SET docstatus='IP' WHERE pp_order_id=9900000");   // fixture: one In Progress order, so a Drafted-only filter is DISCRIMINATING
  GE.install(db); DS.install(db, q);
  var orgs = q('SELECT ad_org_id FROM ad_org').map(function (r) { return Number(r.ad_org_id); }); if (orgs.indexOf(0) < 0) orgs.push(0);
  var session = { client: 11, user: 101, role: 102, now: '2026-10-15 09:00:00', today: '2026-10-15', access: { clientIds: [0, 11], orgIds: orgs } };
  var NAME = 'Manufacturing Orders to complete', GOAL = 'Manufacturing Output';
  var ind = function () { return DS.indicators(q, session).filter(function (i) { return i.name === NAME; })[0] || null; };
  var goal = function () { return DG.performance(q, session, GE).filter(function (g) { return g.title.indexOf(GOAL) === 0; })[0] || null; };
  var indCount = function () { return DS.indicators(q, session).length; }, goalCount = function () { return DG.performance(q, session, GE).length; };
  var base = { ind: indCount(), goals: goalCount() };
  log('§LDASH-L0 baseline (bundle not installed): Activities indicators=' + base.ind + ' (' + DS.indicators(q, session).map(function (i) { return i.name + '=' + i.count; }).join(' | ') + ') Performance goals=' + base.goals);
  check('D0 baseline: no Manufacturing indicator and no Manufacturing goal on the opening screen', !ind() && !goal() && base.ind > 0 && base.goals > 0, base);
  var URL = 'file://' + path.join(ERP, 'plugins', 'libero_manufacturing.mjs'), reg = PR.create(host);
  var mute = function () { console.log = function () {}; }, unmute = function () { console.log = log; };
  if (BREAK === 'wrongwhere') { var m = require('fs').readFileSync(path.join(ERP, 'plugins', 'libero_manufacturing.mjs'), 'utf8'); /* break applied after staging below */ }
  mute(); await reg.installBundle(URL); if (BREAK !== 'nostage') await reg.startBundle('org.idempiere.mfg'); unmute();
  if (BREAK === 'wrongwhere') db.run("UPDATE pa_documentstatus SET whereclause=\"PP_Order.DocStatus = 'DR'\" WHERE pa_documentstatus_id=53201");
  var st = reg.get('org.idempiere.mfg') && reg.get('org.idempiere.mfg').state, i1 = ind(), g1 = goal();
  var wantInd = q("SELECT COUNT(*) AS n FROM pp_order WHERE ad_client_id=11 AND docstatus IN ('DR','IP')")[0].n;
  var wantQty = q("SELECT COALESCE(SUM(qtyordered),0) AS s FROM pp_order WHERE docstatus IN ('DR','IP','CO')")[0].s;
  log('§LDASH-L1 bundle state=' + st + ' (no code activated) | indicator=' + JSON.stringify(i1 && { name: i1.name, count: i1.count, window: i1.windowId, err: i1.error }) + ' independent count=' + wantInd + ' | goal=' + JSON.stringify(g1 && { title: g1.title, tooltip: g1.tooltip, color: g1.color }) + ' independent sum=' + wantQty);
  check('D1 started LAZY (STARTING, no code ran) and the opening screen ALREADY shows the Manufacturing indicator, opening window 53009', st === 'STARTING' && !!i1 && i1.windowId === 53009 && !i1.error, { st: st, i1: i1 });
  check('D2 the indicator number equals an INDEPENDENT count over pp_order (client 11, Drafted + In Progress); population not vacuous (' + wantInd + ')', !!i1 && i1.count === Number(wantInd) && Number(wantInd) > 0, { got: i1 && i1.count, want: wantInd });
  check('D3 the Performance gadget lists the Manufacturing goal; its actual is the independent SUM(QtyOrdered) over live orders (' + wantQty + ') and the title carries the percent of target 20000, coloured by schema 100 (2% of target = the red mark, not the black fallback)', !!g1 && /Manufacturing Output: \d+%/.test(g1.title) && new RegExp('\\b' + Number(wantQty).toLocaleString('en-US') + '\\b').test(g1.tooltip) && Number(wantQty) > 0 && g1.color === '#' + ('000000' + Number(q('SELECT code FROM ad_printcolor WHERE ad_printcolor_id=200000')[0].code).toString(16)).slice(-6), g1);
  check('D4 the other legacy indicators/goals are untouched (+1 each)', indCount() === base.ind + 1 && goalCount() === base.goals + 1, { ind: indCount(), goals: goalCount(), base: base });
  // a new order moves BOTH numbers (activate on demand, then save through the model layer)
  mute(); await reg.need({ table: 'pp_order' }); unmute();
  var uu = 0, env = { client: 11, org: 50006, user: 100, now: '2026-10-15 09:00:00', uuid: function () { uu++; return '00000000-0000-4000-8000-' + ('000000000000' + uu).slice(-12); } };
  var trx = new ML.Trx(q, env), r = ML.run(q, env, { table: 'pp_order', timing: 'SAVE', changes: ML.newPO(trx, 'pp_order', { ad_client_id: 11, ad_org_id: 50006, documentno: 'DASH-1', m_product_id: 136, pp_product_bom_id: 50004, ad_workflow_id: 50017, qtyordered: 40, m_warehouse_id: 50002, c_uom_id: 100, datestartschedule: '2008-08-16 00:00:00', datepromised: '2008-08-17 00:00:00' }) });
  if (r.ok) r.ops.forEach(function (o, i) { if (o.op_type === 'CRUD_CREATE' && o.table === 'pp_order') { var f = Object.assign({}, o.fields); f.pp_order_id = 9300001; f.docstatus = f.docstatus || 'DR'; var ks = Object.keys(f); db.run('INSERT INTO pp_order (' + ks.join(',') + ') VALUES (' + ks.map(function () { return '?'; }).join(',') + ')', ks.map(function (k) { return f[k] && typeof f[k] === 'object' ? null : f[k]; })); } });
  var i2 = ind(), g2 = goal();
  log('§LDASH-L2 after a new order (qty 40, saved through the model layer): ok=' + r.ok + ' indicator ' + (i1 && i1.count) + ' -> ' + (i2 && i2.count) + ' | goal tooltip "' + (g1 && g1.tooltip) + '" -> "' + (g2 && g2.tooltip) + '"');
  check('D5 creating a manufacturing order moves the indicator by exactly +1 and the goal actual by its ordered quantity (40)', r.ok && i2.count === i1.count + 1 && g2.tooltip !== g1.tooltip, { r: r.ok, c1: i1 && i1.count, c2: i2 && i2.count });
  // stop: the opening screen returns to the baseline
  mute(); await reg.stopBundle('org.idempiere.mfg'); unmute();
  var left = { ind: indCount(), goals: goalCount(), rows: q('SELECT (SELECT COUNT(*) FROM pa_documentstatus WHERE pa_documentstatus_id=53201)+(SELECT COUNT(*) FROM pa_goal WHERE pa_goal_id=53201)+(SELECT COUNT(*) FROM pa_measure WHERE pa_measure_id=53201)+(SELECT COUNT(*) FROM pa_measurecalc WHERE pa_measurecalc_id=53201) AS n')[0].n };
  if (BREAK === 'nostop') left.rows = 4;
  check('D6 STOP returns the opening screen to the baseline (indicators ' + base.ind + ', goals ' + base.goals + ', bundle rows 0); the manufacturing data is kept', left.ind === base.ind && left.goals === base.goals && left.rows === 0 && q("SELECT COUNT(*) AS n FROM pp_order WHERE documentno='DASH-1'")[0].n === 1, left);
  var v = !judged ? 'INCONCLUSIVE' : fails ? 'FAIL' : 'PASS'; log('§LDASH-VERDICT ' + v + ' judged=' + judged + ' failed=' + fails); process.exit(v === 'PASS' ? 0 : v === 'FAIL' ? 1 : 3);
})().catch(function (e) { console.log('§LDASH-VERDICT CRASH ' + (e.stack || e)); process.exit(2); });
