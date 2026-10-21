// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — dd_common.js: the shared twin harness of the Distribution-Order / Inventory-Move witnesses (prompts/mfg/LIBERO_DD_SPEC.md §5). Not a witness itself: it boots the seed + patches + model layer in sql.js
//   the way witness_order_paysched_diff.js does (INSTRUMENT GOTCHA: callouts loaded and the SQL-function ports registered, else pricing fails silently), applies op groups like commitGroup, and talks to the oracle (:8097, op makedoc).
'use strict';
var fs = require('fs'), path = require('path'), http = require('http');
var ERP = path.join(__dirname, '..');
if (!global.window) global.window = {};
if (!global.crypto || !global.crypto.subtle) global.crypto = require('crypto').webcrypto;

function oracle(body) { return new Promise(function (res, rej) { var d = JSON.stringify(body), rq = http.request({ host: '127.0.0.1', port: 8097, method: 'POST', headers: { 'Content-Length': Buffer.byteLength(d) } }, function (r) { var b = ''; r.on('data', function (c) { b += c; }); r.on('end', function () { try { res(JSON.parse(b)); } catch (e) { rej(new Error(b.slice(0, 300))); } }); }); rq.on('error', rej); rq.end(d); }); }
var lc = function (o) { var x = {}; Object.keys(o).forEach(function (k) { x[k.toLowerCase()] = o[k]; }); return x; };

async function boot(opts) {
  opts = opts || {};
  var initSqlJs; try { initSqlJs = require('sql.js'); } catch (e) { initSqlJs = require('/home/red1/bim-ootb/node_modules/sql.js'); }
  var TODAY = process.env.TODAY || new Date().toISOString().slice(0, 10), DAY = TODAY + ' 00:00:00';
  var SQL = await initSqlJs(), db = new SQL.Database(new Uint8Array(fs.readFileSync(path.join(ERP, 'ad_seed.db'))));
  var ok = 0, bad = 0;
  ['ad_seed.db.sql', 'mfg.sql'].forEach(function (pf) { fs.readFileSync(path.join(ERP, 'patches', pf), 'utf8').split(/;\s*\n/).forEach(function (st) { st = st.replace(/^\s*--[^\n]*\n?/gm, '').trim(); if (!st) return; try { db.run(st); ok++; } catch (e) { bad++; } }); });
  var H = { db: db, ERP: ERP, TODAY: TODAY, DAY: DAY, oracle: oracle, lc: lc, patchOk: ok, patchBad: bad };
  var A = require(path.join(ERP, 'ad_callout.js'));
  ['support', 'support_stock', 'views', 'currency', 'uom', 'pricing', 'tax', 'sqlfn'].forEach(function (m) { require(path.join(ERP, 'callouts', m + '.js')); });
  A.RUNTIME.registerSqlFunctions(function (n, f) { db.create_function(n, f); });   // crud_overlay.js:364 - the host registers the PL/pgSQL ports
  var ML = require(path.join(ERP, 'model_layer.js')), MV = require(path.join(ERP, 'ad_modelval.js')), PR = require(path.join(ERP, 'plugin_registry.js'));
  globalThis.ModelLayer = ML; globalThis.ModelTrade = require(path.join(ERP, 'model_trade.js'));
  ['model_ctor', 'model_cost', 'model_match', 'model_order', 'model_invoice', 'model_master', 'model_rma', 'model_post'].forEach(function (m) { try { require(path.join(ERP, m + '.js')); } catch (e) { /* optional */ } });
  globalThis.ModelCost = require(path.join(ERP, 'model_cost.js')); globalThis.ModelMaster = require(path.join(ERP, 'model_master.js'));
  H.DD = require(path.join(ERP, 'model_dd.js')); H.MVT = require(path.join(ERP, 'model_movement.js')); globalThis.ModelDD = H.DD; globalThis.ModelMovement = H.MVT;
  MV.installDefaultHooks();
  H.A = A; H.ML = ML; H.MV = MV; H.PR = PR; H.FSM = require(path.join(ERP, 'ad_docfsm.js'));
  function q(sql, params) {
    var st = db.prepare(sql), out = [];
    try { if (params && params.length) st.bind(params.map(function (v) { return v === undefined ? null : v; })); while (st.step()) { var o = st.getAsObject(), r = {}; for (var k in o) r[k.toLowerCase()] = o[k]; out.push(r); } }
    finally { st.free(); }
    return out;
  }
  H.q = q; H.one = function (sql, p) { return q(sql, p || [])[0] || null; };
  var uu = 0, clock = Date.parse(DAY.replace(' ', 'T') + 'Z') + 9 * 3600 * 1000;
  H.ctx = opts.ctx || { client: 11, org: 11, role: 102, user: 101 };
  H.envFlags = {};
  H.env = function (extra) { clock += 1000; return Object.assign({ client: H.ctx.client, org: H.ctx.org, user: H.ctx.user, role: H.ctx.role, date: DAY, now: TODAY + ' 09:00:00', nowMillis: clock, uuid: function () { uu++; return '00000000-0000-4000-8000-' + ('000000000000' + uu).slice(-12); } }, H.envFlags, extra || {}); };
  var cols = {}, nextId = {};
  function colsOf(t) { if (!cols[t]) cols[t] = q('PRAGMA table_info(' + t + ')').map(function (c) { return c.name.toLowerCase(); }); return cols[t]; }
  function newId(t) { if (nextId[t] == null) { var m = q('SELECT MAX(' + t + '_id) AS m FROM ' + t)[0]; nextId[t] = Math.max(Number(m.m || 0), 9000000); } return ++nextId[t]; }
  H.apply = function (ops) {   // an op-group the way commitGroup + the listTip fold do (CREATE gets a fresh key, {__opRef} resolved, UPDATE/DELETE by key)
    var ids = [], fix = function (v) { return v && typeof v === 'object' && v.__opRef != null ? ids[v.__opRef] : v; };
    ops.forEach(function (o, i) {
      var t = o.table, cs = colsOf(t); if (!cs.length) { ids[i] = null; return; }
      if (o.op_type === 'CRUD_CREATE') {
        var f = Object.assign({}, o.fields), pk = t + '_id';
        if (cs.indexOf(pk) >= 0) { f[pk] = newId(t); ids[i] = f[pk]; } else ids[i] = f[t + '_uu'];
        Object.keys(f).forEach(function (k) { f[k] = typeof f[k] === 'string' ? f[k].replace(/\{\{opref:(\d+)\}\}/g, function (m, d) { return String(ids[Number(d)]); }) : f[k]; f[k] = fix(f[k]); if (cs.indexOf(k) < 0) delete f[k]; });
        var ks = Object.keys(f); db.run('INSERT INTO ' + t + ' (' + ks.map(function (k) { return '"' + k + '"'; }).join(',') + ') VALUES (' + ks.map(function () { return '?'; }).join(',') + ')', ks.map(function (k) { return f[k] === undefined ? null : f[k]; }));
      } else if (o.op_type === 'CRUD_UPDATE') {
        var kk = Object.keys(o.changes).filter(function (k) { return cs.indexOf(k) >= 0; });
        if (kk.length) db.run('UPDATE ' + t + ' SET ' + kk.map(function (k) { return '"' + k + '"=?'; }).join(',') + ' WHERE ' + (o.idCol || t + '_id') + '=?', kk.map(function (k) { return fix(o.changes[k].new); }).concat([fix(o.id)]));
        ids[i] = fix(o.id);
      } else if (o.op_type === 'CRUD_DELETE') db.run('DELETE FROM ' + t + ' WHERE ' + (o.idCol || t + '_id') + '=?', [fix(o.id)]);
    });
    return ids;
  };
  H.begin = function (name) { db.run('SAVEPOINT ' + name); };      // every case runs inside a savepoint: the pilot side is rolled back by makedoc, the twin side by this
  H.rollback = function (name) { db.run('ROLLBACK TO ' + name); db.run('RELEASE ' + name); };
  H.logs = [];
  H.run = function (spec, extraEnv) { var r = ML.run(q, H.env(extraEnv), spec); (r.log || []).forEach(function (l) { H.logs.push(String(l)); if (/§MODEL-(ERR|SEVERE|POST|NAMED|UNPORTED)|§DDO|§DD-|§MVD|§LDD|§LIBERO/.test(l)) console.log('    ' + String(l).slice(0, 260)); }); if (r.ok) H.apply(r.ops); return r; };
  H.newPO = function (table, fields) { return ML.newPO(new ML.Trx(q, H.env()), table, lc(fields)); };
  H.save = function (table, fields) { var r = H.run({ table: table, timing: 'SAVE', changes: H.newPO(table, fields) }); return r; };
  H.lastId = function (table) { return H.one('SELECT MAX(' + table + '_id) AS id FROM ' + table).id; };
  H.update = function (table, id, changes) { var row = H.one('SELECT * FROM ' + table + ' WHERE ' + table + '_id=?', [id]); return H.run({ table: table, timing: 'SAVE', record: row, id: id, changes: changes }); };
  H.docAction = function (table, id, action, extraEnv) { return H.run({ table: table, timing: 'DOCACTION', id: id, action: action }, extraEnv); };
  // the real bundle, started through the plugin registry the way witness_libero_corehooks.js does (the hooks are the bundle's validators)
  H.startLibero = async function (lazyTable) {
    var tokens = {}, ops = [], MVv = MV, hostDb = { query: q, run: function (sql, p) { db.run(sql, p || []); } };
    var host = { engineVersion: '1.0.0', db: hostDb, ops: { append: function (t) { ops.push(t); return ops.length; } }, modelval: MVv, callout: A, process: require(path.join(ERP, 'ad_process.js')), postTokens: tokens, docAction: ML,
      docClass: require(path.join(ERP, 'doc_poster.js')), docFsm: H.FSM, import: function (u) { return import(u); } };
    var reg = PR.create(host), URL = 'file://' + path.join(ERP, 'plugins', 'libero_manufacturing.mjs'), _l = console.log; console.log = function () {};
    try { await reg.installBundle(URL); await reg.startBundle('org.idempiere.mfg'); if (lazyTable) await reg.need({ table: lazyTable }); } finally { console.log = _l; }
    H.reg = reg; return reg.get('org.idempiere.mfg').state;
  };
  return H;
}

// ── comparison of one legacy row (lower-case keys, strings) against one twin row ─────────────────────────────────────────
var VOLATILE = /^(created|updated|createdby|updatedby|processedon|.*_uu)$/;
function norm(k, v) {
  if (v === undefined || v === null || v === '') return null;
  var s = String(v);
  if (/^-?\d+(\.\d+)?$/.test(s) && !/(documentno|value|name|description|trackingno|poreference)$/.test(k)) return String(Number(s));
  if (/^\d{4}-\d\d-\d\d[ T]\d\d:\d\d:\d\d/.test(s)) return s.slice(0, 10) + (/00:00:00/.test(s) ? '' : s.slice(10, 19).replace('T', ' '));
  return s;
}
// returns { diffs: ['col legacy=.. twin=..'], n: columns compared, missing: legacy columns the twin row lacks }
function cmpRow(L, T, o) {
  o = o || {}; var diffs = [], n = 0, missing = [], skip = o.skip || {};
  Object.keys(L).forEach(function (k) {
    if (skip[k]) return;
    if (!(k in T)) { missing.push(k); return; }
    if (VOLATILE.test(k)) { if (k === 'processedon') { n++; if ((L[k] == null) !== (T[k] == null || T[k] === 0 || T[k] === '0')) diffs.push('processedon set? legacy=' + (L[k] != null) + ' twin=' + (T[k] != null && T[k] !== 0)); } return; }
    n++;
    var a = norm(k, L[k]), b = norm(k, T[k]);
    if (a !== b) diffs.push(k + ' legacy=' + a + ' twin=' + b);
  });
  return { diffs: diffs, n: n, missing: missing };
}
module.exports = { boot: boot, oracle: oracle, cmpRow: cmpRow, norm: norm, lc: lc, ERP: ERP };
