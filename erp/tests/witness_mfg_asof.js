#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-MFG-ASOF (Milestone 4; spec ~/Projects/Mfg/MILESTONE_4_SPEC.md). READ THE LOG after every run: verdict = §MFG-ASOF-VERDICT.
// THE ISSUE it proves/disproves: exploding a BOM as of a date returns exactly the lines with ValidFrom <= date <= ValidTo (inclusive both ends, empty = open), from an INPUT date
//   (no clock), and an order created on that date snapshots only those lines.  REAL data covers ValidFrom (2 lines dated 2008-09-22); NO real ValidTo exists in the seed or the
//   reference DB, so the ValidTo cases are a LABELLED FIXTURE (copy of a real BOM + one ValidTo) and say so.  Breaks (MUST be red): MFG_BREAK=ignoreto | exclusive.
'use strict';
var fs = require('fs'), path = require('path');
var ERP = path.join(__dirname, '..');
var initSqlJs; try { initSqlJs = require('sql.js'); } catch (e) { initSqlJs = require(path.join(ERP, 'sqljs', 'sql-wasm.js')); }
var K = require(path.join(ERP, 'erp_kernel.js')), M = require(path.join(ERP, 'mfg_snapshot.js'));
var BREAK = process.env.MFG_BREAK || '', fails = 0, judged = 0, inconclusive = 0;
function check(name, ok, info) { judged++; if (!ok) fails++; console.log('  §MFG-ASOF ' + name + ' ' + (ok ? 'PASS' : 'FAIL') + (ok ? '' : ' ' + JSON.stringify(info))); }
function djb(s) { var a = 5381; for (var i = 0; i < s.length; i++) a = ((a << 5) + a + s.charCodeAt(i)) | 0; return (a >>> 0).toString(16); }
M.register(K);
var realIsEffective = M.isEffective;
if (BREAK === 'ignoreto') M.isEffective = function (f, t, d) { return realIsEffective(f, '', d); };                       // BREAK: ValidTo ignored
if (BREAK === 'exclusive') M.isEffective = function (f, t, d) { var ff = f ? String(f).slice(0, 10) : '', dd = String(d).slice(0, 10); return (!ff || dd > ff) && realIsEffective('', t, d); };   // BREAK: ValidFrom exclusive
(async function () {
  var SQL = await initSqlJs({ wasmBinary: fs.readFileSync(path.join(ERP, 'sqljs', 'sql-wasm.wasm')) });
  var seed = new SQL.Database(fs.readFileSync(path.join(ERP, 'ad_seed.db')));
  function rows(db, sql, p) { var s = db.prepare(sql), r = []; try { if (p) s.bind(p); while (s.step()) { var o = s.getAsObject(), k = {}; Object.keys(o).forEach(function (x) { k[x.toLowerCase()] = o[x]; }); r.push(k); } } finally { s.free(); } return r; }
  var db = new SQL.Database(); K.initProjection(db);
  function load(id, asId, mut) {   // real seed BOM -> kernel items; asId/mut build the labelled fixture copy
    var hid = asId || id;
    rows(seed, 'SELECT * FROM pp_product_bom WHERE pp_product_bom_id=?', [id]).forEach(function (r) { db.run('INSERT OR REPLACE INTO items (id, parent_id, type, metadata) VALUES (?,?,?,?)', ['PP_Product_BOM#' + hid, null, 'PP_Product_BOM', JSON.stringify(r)]); });
    rows(seed, 'SELECT * FROM pp_product_bomline WHERE pp_product_bom_id=? ORDER BY line', [id]).forEach(function (r) {
      var lid = asId ? 9000000 + Number(r.line) : r.pp_product_bomline_id; if (mut) mut(r);
      db.run('INSERT OR REPLACE INTO items (id, parent_id, type, metadata) VALUES (?,?,?,?)', ['PP_Product_BOMLine#' + lid, 'PP_Product_BOM#' + hid, 'PP_Product_BOMLine', JSON.stringify(r)]); });
  }
  load(50006); load(50003); load(50007);
  load(50006, 9000006, function (r) { if (Number(r.line) === 10) r.validto = '2008-12-31 00:00:00'; });   // FIXTURE: real BOM 50006 + ValidTo on its line 10
  var q = function (sql, p) { return K.query(db, sql, p); };
  function linesAt(bom, d) { return M.explodeAsOf(q, bom, d).lines.map(function (l) { return Number(l.line); }); }
  function refuse(fn) { try { fn(); return null; } catch (e) { return e.message; } }

  // A1 REAL from-side — BOM 50006 line 30 starts 2008-09-22
  var a1 = { b: linesAt(50006, '2008-08-16'), d: linesAt(50006, '2008-09-21'), f: linesAt(50006, '2008-09-22'), l: linesAt(50006, '2030-01-01') };
  console.log('§MFG-ASOF-A1 BOM50006 as-of 2008-08-16=' + a1.b + ' 2008-09-21=' + a1.d + ' 2008-09-22=' + a1.f + ' 2030-01-01=' + a1.l);
  check('A1 REAL BOM 50006: line 30 absent before 2008-09-22, present ON the first day and after',
    a1.b.indexOf(30) < 0 && a1.d.indexOf(30) < 0 && a1.f.indexOf(30) >= 0 && a1.l.indexOf(30) >= 0 && a1.b.length === 3 && a1.f.length === 4, a1);
  var a2 = { b: linesAt(50003, '2008-09-21'), f: linesAt(50003, '2008-09-22') };
  console.log('§MFG-ASOF-A2 BOM50003 as-of 2008-09-21=' + a2.b + ' 2008-09-22=' + a2.f);
  check('A2 REAL BOM 50003: line 20 absent before 2008-09-22, present on it', a2.b.join() === '10,30' && a2.f.join() === '10,20,30', a2);

  // A3 FIXTURE to-side
  var a3 = { before: linesAt(9000006, '2008-12-30'), last: linesAt(9000006, '2008-12-31'), after: linesAt(9000006, '2009-01-01') };
  console.log('§MFG-ASOF-A3 FIXTURE(copy of BOM 50006, ValidTo 2008-12-31 on line 10; no real ValidTo exists) 2008-12-30=' + a3.before + ' 2008-12-31=' + a3.last + ' 2009-01-01=' + a3.after);
  check('A3 FIXTURE ValidTo: last day included, the day after excluded (expired line must not reappear)', a3.before.indexOf(10) >= 0 && a3.last.indexOf(10) >= 0 && a3.after.indexOf(10) < 0, a3);

  // A4 refusals by name
  var r4a = refuse(function () { M.explodeAsOf(q, 50007, '2008-08-16'); }), r4b = refuse(function () { M.explodeAsOf(q, 50003, ''); });
  check('A4 header not effective -> refused by name; missing as-of date -> refused (no clock read)', /^not-effective:PP_Product_BOM#50007/.test(r4a || '') && r4b === 'asof-required', { r4a: r4a, r4b: r4b });

  // A5 order integration + replay: two orders, same template, different dates
  var hdr = rows(seed, 'SELECT m_product_id FROM pp_product_bom WHERE pp_product_bom_id=50003')[0];
  function mk(docno, asOf) { return { docno: docno, product: hdr.m_product_id, qty: 10, bomId: 50003, warehouseId: 50002, asOf: asOf }; }
  function create(o) { return K.dispatch(db, { wfmc: M.WFMC, guards: [], query: q, actor: 'user:planner', baseTs: 1000 }, { docType: 'PP_Order', action: 'CR', status: 'NEW', order: o }); }
  var rA = create(mk('ASOF-A', '2008-08-16')), rB = create(mk('ASOF-B', '2008-09-22'));
  var nA = M.readOrderLines(q, 'PP_Order:ASOF-A').filter(function (l) { return l.line_no !== 0; }).map(function (l) { return l.line_no; });
  var nB = M.readOrderLines(q, 'PP_Order:ASOF-B').filter(function (l) { return l.line_no !== 0; }).map(function (l) { return l.line_no; });
  function scope(d) { return djb(JSON.stringify(K.query(d, 'SELECT * FROM documents ORDER BY id')) + JSON.stringify(K.query(d, 'SELECT * FROM document_lines ORDER BY id'))); }
  var fresh = new SQL.Database(); K.replay(db, fresh);
  console.log('§MFG-ASOF-A5 dispatch=' + rA.ok + ',' + rB.ok + ' ASOF-A(2008-08-16) lines=' + nA + ' ASOF-B(2008-09-22) lines=' + nB + ' live=' + scope(db) + ' replay=' + scope(fresh));
  check('A5 order created 2008-08-16 snapshots lines 10,30; created 2008-09-22 snapshots 10,20,30; replay == live', rA.ok && rB.ok && nA.join() === '10,30' && nB.join() === '10,20,30' && scope(db) === scope(fresh), { nA: nA, nB: nB });

  // A6 non-vacuity: the date windows really excluded something
  var excl = M.explodeAsOf(q, 50006, '2008-08-16').excluded.length + M.explodeAsOf(q, 9000006, '2009-01-01').excluded.length;
  if (!excl) { inconclusive++; console.log('§MFG-ASOF A6 INCONCLUSIVE — no date window excluded anything'); } else check('A6 non-vacuous: date windows excluded ' + excl + ' line(s)', excl >= 2, { excl: excl });

  // A7 no clock: Date is made to throw while the module's OWN code runs. (sql.js's wasm glue reads the clock inside db.exec — measured, sql-wasm.js:119 — so the module is fed an in-memory
  //    query over the already-loaded items; that isolates mfg_snapshot.js from the library.)
  var items = K.query(db, 'SELECT id, parent_id, type, metadata FROM items');
  var qMem = function (sql, p) { return /parent_id=\?/.test(sql) ? items.filter(function (r) { return r.parent_id === p[0] && r.type === p[1]; }).sort(function (a, b) { return a.id < b.id ? -1 : 1; })
    : items.filter(function (r) { return r.id === p[0] && r.type === p[1]; }); };
  var RD = Date, trips = 0, where = ''; global.Date = function () { trips++; where = where || new Error('clock').stack.split('\n').slice(1, 4).join(' | '); throw new Error('clock read'); }; global.Date.now = global.Date;
  var e7, got7; try { got7 = M.explodeAsOf(qMem, 50003, '2008-09-22').lines.length; M.explodeOps(qMem, mk('ASOF-C', '2008-09-22')); } catch (e) { e7 = e.message; } finally { global.Date = RD; }
  check('A7 explosion reads no clock (Date forbidden while the module runs; 3 lines exploded)', e7 === undefined && trips === 0 && got7 === 3, { err: e7, trips: trips, where: where, lines: got7 });

  var verdict = fails ? 'FAIL' : (inconclusive ? 'INCONCLUSIVE' : 'PASS');
  console.log('§MFG-ASOF-VERDICT ' + verdict + ' break=' + (BREAK || 'none') + ' judged=' + judged + ' failed=' + fails + ' inconclusive=' + inconclusive);
  process.exit(verdict === 'PASS' ? 0 : 1);
})().catch(function (e) { console.log('§MFG-ASOF-VERDICT FAIL harness error: ' + e.stack); process.exit(2); });
