#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-PERIOD-STATUS (bim-compiler prompts/SQLiteIDEMPIERE.md §G-SD1-PORT; CARDINAL RULE: the shipped ERP must refuse/accept exactly like legacy iDempiere).
//   READ THE LOG after every run: every verdict is a §-line, the exit code is not the evidence.
// THE ISSUE it proves/disproves: AD_Process 167 PeriodStatus (PeriodStatus.java:53-166) and 168 PeriodControlStatus (PeriodControlStatus.java:52-139) run through the shipped
//   process seam (ad_process.js runJava = one ModelLayer.Trx, op group = the commit). MPeriod.hasUnpostedDocs (MPeriod.java:1024-1072) reads view RV_UnPosted; before this lane the bundle
//   had no such view, so a close was ACCEPTED where legacy refuses with "PostUnpostedDocs" (G-SD1). Expected values come from THIS file's own SQL (the legacy view definition read from
//   postgres rv_unposted: 15 tables, posted<>'Y', docstatus<>'VO' except PJI/MXI/MXP), never from the code under test. Negative controls: voided / posted / other-period / other-DocBaseType
//   documents do NOT block. END-OF-CHAIN: after the process ran, ModelTrade.periodOpen and a model-layer document completion see the new status. INCONCLUSIVE if a case cannot be driven.
'use strict';
var fs = require('fs'), path = require('path');
var ERP = path.join(__dirname, '..');
var initSqlJs; try { initSqlJs = require('sql.js'); } catch (e) { initSqlJs = require(path.join(ERP, 'sqljs', 'sql-wasm.js')); }
var TODAY = process.env.TODAY || new Date().toISOString().slice(0, 10), DAY = TODAY + ' 00:00:00';
var results = [], log = function (s) { console.log(s); };
function verdict(id, checks) {
  var judged = checks.length, failed = checks.filter(function (c) { return !c.ok; });
  checks.forEach(function (c) { log('  §PS-CHECK case=' + id + ' key=' + c.key + ' ' + (c.ok ? 'OK' : 'FAIL') + ' rule="' + c.rule + '"' + (c.ok ? '' : ' want=' + JSON.stringify(c.want) + ' got=' + JSON.stringify(c.got))); });
  var v = !judged ? 'INCONCLUSIVE' : failed.length ? 'FAIL' : 'PASS';
  log('§PS case=' + id + ' verdict=' + v + ' judged=' + judged + ' failed=' + failed.length); results.push({ id: id, v: v }); return v;
}
function eq(key, rule, got, want) { return { key: key, rule: rule, ok: JSON.stringify(got) === JSON.stringify(want), got: got, want: want }; }

// the legacy view rv_unposted, table by table (postgres pg_get_viewdef): [table, DateAcct column, DocBaseType (null = join c_doctype), voidTested]
var VIEW = [['gl_journal', 'dateacct', null, true], ['c_projectissue', 'movementdate', 'PJI', false], ['c_invoice', 'dateacct', null, true], ['m_inout', 'dateacct', null, true],
  ['m_inventory', 'movementdate', null, true], ['m_movement', 'movementdate', null, true], ['m_production', 'movementdate', 'MMP', true], ['c_cash', 'dateacct', 'CMC', true],
  ['c_payment', 'dateacct', null, true], ['c_allocationhdr', 'dateacct', null, true], ['c_bankstatement', 'statementdate', 'CMB', true], ['m_matchinv', 'dateacct', 'MXI', false],
  ['m_matchpo', 'dateacct', 'MXP', false], ['c_order', 'dateacct', null, true], ['m_requisition', 'datedoc', null, true]];

(async function main() {
  var SQL = await initSqlJs();
  var db = new SQL.Database(new Uint8Array(fs.readFileSync(path.join(ERP, 'ad_seed.db'))));
  var pOk = 0, pFail = 0;                                                    // idempiere.html's FS-15 self-heal loader, statement by statement
  fs.readFileSync(path.join(ERP, 'patches/ad_seed.db.sql'), 'utf8').split(/;\s*\n/).forEach(function (st) { st = st.replace(/^\s*--[^\n]*\n?/gm, '').trim(); if (!st) return; try { db.run(st); pOk++; } catch (e) { pFail++; } });
  log('§PS-SEED ad_seed.db + patches/ad_seed.db.sql statements=' + pOk + ' failed=' + pFail + ' today=' + TODAY);
  var A = require(path.join(ERP, 'ad_callout.js'));
  ['support', 'support_stock', 'views', 'currency', 'uom', 'pricing', 'tax', 'sqlfn'].forEach(function (m) { require(path.join(ERP, 'callouts', m + '.js')); });
  A.RUNTIME.registerSqlFunctions(function (n, f) { db.create_function(n, f); });
  var ML = require(path.join(ERP, 'model_layer.js'));
  ['model_trade', 'model_ctor', 'model_cost', 'model_match', 'model_order', 'model_invoice', 'model_post'].forEach(function (m) { require(path.join(ERP, m + '.js')); });
  var MT = require(path.join(ERP, 'model_trade.js'));
  var P = require(path.join(ERP, 'ad_process.js'));
  fs.readdirSync(path.join(ERP, 'processes')).filter(function (f) { return /\.js$/.test(f); }).sort().forEach(function (f) { require(path.join(ERP, 'processes', f)); });
  log('§PS-ENGINE javaPorts=' + Object.keys(P.JAVA).length + ' 167=' + !!P.JAVA['org.compiere.process.PeriodStatus'] + ' 168=' + !!P.JAVA['org.compiere.process.PeriodControlStatus']);

  function q(sql, params) {
    var st = db.prepare(sql), out = [];
    try { if (params && params.length) st.bind(params.map(function (v) { return v === undefined ? null : v; })); while (st.step()) { var o = st.getAsObject(), r = {}; for (var k in o) r[k.toLowerCase()] = o[k]; out.push(r); } }
    finally { st.free(); }
    return out;
  }
  function one(sql, p) { return q(sql, p || [])[0] || null; }
  var uu = 0, clock = Date.parse(DAY.replace(' ', 'T') + 'Z') + 9 * 3600 * 1000;
  function env() { clock += 1000; return { client: 11, org: 11, user: 100, role: 102, date: DAY, now: TODAY + ' 09:00:00', nowMillis: clock, uuid: function () { uu++; return '00000000-0000-4000-8000-' + ('000000000000' + uu).slice(-12); } }; }
  var cols = {}, nextId = {};
  function colsOf(t) { if (!cols[t]) cols[t] = q('PRAGMA table_info(' + t + ')').map(function (c) { return c.name.toLowerCase(); }); return cols[t]; }
  function newId(t) { if (nextId[t] == null) { var m = q('SELECT MAX(' + t + '_id) AS m FROM ' + t)[0]; nextId[t] = Math.max(Number(m.m || 0), 9000000); } return ++nextId[t]; }
  function apply(ops) {                                                      // commitGroup + listTip fold
    var ids = [], fix = function (v) { return v && typeof v === 'object' && v.__opRef != null ? ids[v.__opRef] : v; };
    ops.forEach(function (o, i) {
      var t = o.table, cs = colsOf(t); if (!cs.length) { ids[i] = null; return; }
      if (o.op_type === 'CRUD_CREATE') {
        var f = Object.assign({}, o.fields), pk = t + '_id';
        if (cs.indexOf(pk) >= 0) { f[pk] = newId(t); ids[i] = f[pk]; } else ids[i] = f[t + '_uu'];
        Object.keys(f).forEach(function (k) { f[k] = fix(f[k]); if (cs.indexOf(k) < 0) delete f[k]; });
        var ks = Object.keys(f); db.run('INSERT INTO ' + t + ' (' + ks.map(function (k) { return '"' + k + '"'; }).join(',') + ') VALUES (' + ks.map(function () { return '?'; }).join(',') + ')', ks.map(function (k) { return f[k] === undefined ? null : f[k]; }));
      } else if (o.op_type === 'CRUD_UPDATE') {
        var kk = Object.keys(o.changes).filter(function (k) { return cs.indexOf(k) >= 0; });
        if (kk.length) db.run('UPDATE ' + t + ' SET ' + kk.map(function (k) { return '"' + k + '"=?'; }).join(',') + ' WHERE ' + (o.idCol || t + '_id') + '=?', kk.map(function (k) { return fix(o.changes[k].new); }).concat([fix(o.id)]));
        ids[i] = fix(o.id);
      } else if (o.op_type === 'CRUD_DELETE') db.run('DELETE FROM ' + t + ' WHERE ' + (o.idCol || t + '_id') + '=?', [fix(o.id)]);
    });
    return ids;
  }
  function run(spec) { var r = ML.run(q, env(), spec); if (r.ok) apply(r.ops); return r; }
  // the process, the way the host runs it: one Trx, the op group is the commit. Refusals are the process's own summary/isError.
  function proc(pid, params, rec, tid) {
    var row = one('SELECT classname, name FROM ad_process WHERE ad_process_id=?', [pid]);
    var r = P.runJava(q, env(), { AD_Process_ID: pid, className: row.classname, title: row.name, Record_ID: rec || 0, Table_ID: tid || 0, params: params || {} });
    (r.log || []).forEach(function (l) { if (/§(PROC|UNPORTED|MODEL-(ERR|SEVERE|UNPORTED))/.test(l)) log('    ' + String(l).slice(0, 220)); });
    if (r.ok) apply(r.ops || []);
    return { ok: !!r.ok, summary: String(r.summary || ''), nops: (r.ops || []).length, lines: r.log || [] };
  }

  // ── independent expectations ──
  function ts(v) { v = String(v); return Date.parse((v.length === 10 ? v + ' 00:00:00' : v).replace(' ', 'T') + 'Z'); }   // timestamps, as the Java binds them (Timestamp BETWEEN Timestamp AND Timestamp)
  function unposted(periodId) {                                              // own count of the legacy view rows for one period: rv_unposted (join c_doctype, posted<>'Y', docstatus) + the Java's BETWEEN
    var p = one('SELECT startdate, enddate FROM c_period WHERE c_period_id=?', [periodId]), n = 0, by = {};
    VIEW.forEach(function (v) {
      var t = v[0], dc = v[1], cs = colsOf(t); if (!cs.length) return;
      var sql = 'SELECT x.' + dc + ' AS d FROM ' + t + ' x' + (v[2] ? '' : ' JOIN c_doctype dt ON dt.c_doctype_id=x.c_doctype_id') + " WHERE x.ad_client_id=11 AND x.posted<>'Y'" + (v[3] && cs.indexOf('docstatus') >= 0 ? " AND x.docstatus<>'VO' AND x.docstatus IN ('CO','CL','RE','VO')" : '') + ' AND substr(x.' + dc + ",1,10) BETWEEN date(?,'-1 day') AND date(?,'+1 day')";   // coarse SQL prefilter only; the judgement is the JS timestamp compare below
      var c = q(sql, [p.startdate, p.enddate]).filter(function (r) { return r.d != null && ts(r.d) >= ts(p.startdate) && ts(r.d) <= ts(p.enddate); }).length;
      if (c) by[t] = c; n += c;
    });
    return { n: n, by: by };
  }
  function ctl(periodId) { return q('SELECT c_periodcontrol_id AS id, docbasetype AS d, periodstatus AS s, periodaction AS a FROM c_periodcontrol WHERE c_period_id=? ORDER BY c_periodcontrol_id', [periodId]); }
  function setAll(periodId, st, act) { db.run('UPDATE c_periodcontrol SET periodstatus=?, periodaction=? WHERE c_period_id=?', [st, act || 'N', periodId]); }
  function states(periodId) { var o = {}; ctl(periodId).forEach(function (c) { o[c.s] = (o[c.s] || 0) + 1; }); return o; }
  var injected = [];
  function inject(t, dateStr, over) {                                        // a minimal unposted-candidate document row (own SQL, no model layer)
    var cs = colsOf(t), dc = VIEW.filter(function (v) { return v[0] === t; })[0][1], f = Object.assign({ ad_client_id: 11, ad_org_id: 11, isactive: 'Y', posted: 'N', docstatus: 'CO' }, over || {});
    f[dc] = dateStr; f[t + '_id'] = newId(t);
    if (cs.indexOf('c_doctype_id') >= 0 && f.c_doctype_id == null && !f.__nodt) f.c_doctype_id = (one("SELECT c_doctype_id AS i FROM c_doctype WHERE ad_client_id=11 AND docbasetype=? ORDER BY c_doctype_id", [f.__dbt || 'ARI']) || {}).i;
    delete f.__dbt; delete f.__nodt;
    var ks = Object.keys(f).filter(function (k) { return cs.indexOf(k) >= 0; });
    db.run('INSERT INTO ' + t + ' (' + ks.map(function (k) { return '"' + k + '"'; }).join(',') + ') VALUES (' + ks.map(function () { return '?'; }).join(',') + ')', ks.map(function (k) { return f[k]; }));
    injected.push([t, f[t + '_id']]); return f[t + '_id'];
  }
  function cleanup() { while (injected.length) { var x = injected.pop(); db.run('DELETE FROM ' + x[0] + ' WHERE ' + x[0] + '_id=?', [x[1]]); } }

  // free periods: client 11, calendar periods with control rows, own count of unposted documents = 0 (the denominator is printed)
  var free = q("SELECT c_period_id AS id, startdate AS s FROM c_period WHERE ad_client_id=11 AND periodtype='S' AND isactive='Y' AND c_period_id IN (SELECT c_period_id FROM c_periodcontrol) ORDER BY startdate").filter(function (p) { return unposted(p.id).n === 0; });
  var allP = one("SELECT COUNT(*) AS n FROM c_period WHERE ad_client_id=11 AND periodtype='S'").n;
  log('§PS-PERIODS client11 periods=' + allP + ' free_of_unposted=' + free.length + ' (control rows per period=' + (free[0] ? ctl(free[0].id).length : 0) + ')');
  if (free.length < 4) { log('§PS-NOTE fewer than 4 free periods: cannot drive'); verdict('PS-DRIVE', []); process.exit(2); }
  var PA = free[0].id, PB = free[1].id, PC = free[2].id, PD = free[3].id;
  function pdate(id) { return one('SELECT startdate AS s FROM c_period WHERE c_period_id=?', [id]).s.slice(0, 10) + ' 00:00:00'; }
  var REFUSE = /PostUnpostedDocs|unposted/i;

  // ── PS-OPEN: action O opens every control row; PeriodAction is reset to N ──
  setAll(PA, 'N', 'N'); var nA = ctl(PA).length;
  var rO = proc(167, { PeriodAction: 'O' }, PA, 142);
  verdict('PS-OPEN', [eq('ran', 'process ok', rO.ok, true), eq('all_open', 'PeriodStatus=O on every control row of the period (PeriodStatus.java:131-150)', states(PA), { O: nA }),
    eq('action_reset', "PeriodAction reset to 'N' (:131 SET PeriodAction='N')", ctl(PA).every(function (c) { return c.a === 'N'; }), true),
    eq('updated_count', '@Updated@ #n = the control rows that were not O and not P (own count)', /#\s*(\d+)/.exec(rO.summary) && Number(/#\s*(\d+)/.exec(rO.summary)[1]), nA)]);
  // idempotent re-run: rows already O are not touched (AND PeriodStatus<>?)
  var rO2 = proc(167, { PeriodAction: 'O' }, PA, 142);
  verdict('PS-OPEN-NEG-IDEMPOTENT', [eq('zero_updates', "NEG-CONTROL a second O changes nothing (AND PeriodStatus<>'O')", /#\s*0\b/.test(rO2.summary), true)]);

  // ── PS-CLOSE-CLEAN / REFUSED ──
  setAll(PB, 'O', 'N');
  var rC = proc(167, { PeriodAction: 'C' }, PB, 142);
  verdict('PS-CLOSE-CLEAN', [eq('closed', 'a period without unposted documents closes (own count was 0)', [rC.ok, states(PB)], [true, { C: ctl(PB).length }])]);
  setAll(PC, 'O', 'N');
  var inv = inject('c_invoice', pdate(PC));
  var exp = unposted(PC), rR = proc(167, { PeriodAction: 'C' }, PC, 142);
  verdict('PS-CLOSE-REFUSED', [eq('independent_count', 'the injected unposted invoice is counted by the legacy view', exp.n >= 1, true), eq('refused', 'C with an unposted document in the period is REFUSED (PeriodStatus.java:100-117, msg PostUnpostedDocs)', [rR.ok, REFUSE.test(rR.summary)], [false, true]),
    eq('unchanged', 'a refused process leaves every control row as it was (one Trx, no commit)', states(PC), { O: ctl(PC).length }), eq('no_ops', 'no op group on refusal', rR.nops, 0)]);
  // permanent close is refused for the same reason
  var rP0 = proc(167, { PeriodAction: 'P' }, PC, 142);
  verdict('PS-PERMCLOSE-REFUSED', [eq('refused', 'P is gated by the same test (:100 C or P)', [rP0.ok, REFUSE.test(rP0.summary)], [false, true]), eq('unchanged', 'rows unchanged', states(PC), { O: ctl(PC).length })]);
  // once the document is posted / voided, the same close goes through (NEG-CONTROLS: posted and voided do not block)
  db.run("UPDATE c_invoice SET posted='Y' WHERE c_invoice_id=?", [inv]);
  verdict('PS-NEG-POSTED', [eq('own_count_zero', 'posted=Y is not in the view', unposted(PC).n, 0)]);
  var rPost = proc(167, { PeriodAction: 'C' }, PC, 142);
  verdict('PS-CLOSE-AFTER-POSTED', [eq('closes', 'NEG-CONTROL the same period closes once the document is posted', [rPost.ok, states(PC)], [true, { C: ctl(PC).length }])]);
  setAll(PC, 'O', 'N'); db.run("UPDATE c_invoice SET posted='N', docstatus='VO' WHERE c_invoice_id=?", [inv]);
  var rVo = proc(167, { PeriodAction: 'C' }, PC, 142);
  verdict('PS-NEG-VOIDED', [eq('own_count_zero', 'the view excludes docstatus VO', unposted(PC).n, 0), eq('closes', 'NEG-CONTROL a voided unposted document does not block the close', [rVo.ok, states(PC)], [true, { C: ctl(PC).length }])]);
  setAll(PC, 'O', 'N'); db.run("UPDATE c_invoice SET docstatus='CO' WHERE c_invoice_id=?", [inv]); cleanup();
  var rOth = inject('c_invoice', pdate(PD)), rN1 = proc(167, { PeriodAction: 'C' }, PC, 142);
  verdict('PS-NEG-OTHERPERIOD', [eq('closes', 'NEG-CONTROL an unposted document dated in ANOTHER period does not block this one', [rN1.ok, states(PC)], [true, { C: ctl(PC).length }])]); cleanup();

  // ── PS-ORACLE: every one of the 15 tables of the view blocks a close (denominator printed) ──
  var per = [], blocked = 0, seen = 0;
  VIEW.forEach(function (v) {
    var t = v[0]; if (!colsOf(t).length) { log('§PS-ORACLE table ' + t + ' ABSENT from the bundle (cannot hold unposted rows)'); return; }
    setAll(PC, 'O', 'N'); inject(t, pdate(PC)); seen++;
    var r = proc(167, { PeriodAction: 'C' }, PC, 142), ok = !r.ok && REFUSE.test(r.summary) && states(PC).O === ctl(PC).length;
    if (ok) blocked++; else log('§PS-ORACLE-MISS table=' + t + ' ok=' + r.ok + ' summary=' + r.summary.slice(0, 100));
    cleanup();
  });
  log('§PS-ORACLE tables_of_view=' + VIEW.length + ' present=' + seen + ' blocking=' + blocked);
  verdict('PS-ORACLE-15-TABLES', seen ? [eq('every_present_table_blocks', 'an unposted CO document of each present table of the RV_UnPosted union refuses the close (denominator ' + seen + ' of ' + VIEW.length + ')', blocked, seen)] : []);

  // ── PS-PERMCLOSE: P sets P; a later O / C leaves P rows alone ──
  setAll(PD, 'O', 'N'); var rPc = proc(167, { PeriodAction: 'P' }, PD, 142);
  var rAfterO = proc(167, { PeriodAction: 'O' }, PD, 142);
  verdict('PS-PERMCLOSE', [eq('permanent', 'P on a clean period sets every row P', [rPc.ok, states(PD)], [true, { P: ctl(PD).length }]),
    eq('p_is_final', "NEG-CONTROL a later O leaves permanently closed rows alone (AND PeriodStatus<>'P')", [rAfterO.ok, states(PD)], [true, { P: ctl(PD).length }])]);

  // ── PS-NOACTION / PS-NOREC ──
  setAll(PA, 'O', 'N'); var before = JSON.stringify(ctl(PA)), rNo = proc(167, { PeriodAction: 'N' }, PA, 142);
  verdict('PS-NOACTION', [eq('dash', "PeriodAction N returns '-' (PeriodStatus.java:96-97)", rNo.summary, '-'), eq('no_writes', 'no ops, rows unchanged', [rNo.nops, JSON.stringify(ctl(PA)) === before], [0, true])]);
  var rNr = proc(167, { PeriodAction: 'C' }, 0, 142);
  verdict('PS-NOREC', [eq('refused', '@FillMandatory@ @C_Period_ID@ when no record is selected (:91-93)', [rNr.ok, /C_Period_ID|FillMandatory|Period/i.test(rNr.summary)], [false, true])]);

  // ── PS-168: PeriodControlStatus on ONE C_PeriodControl row with a pre-set PeriodAction ──
  setAll(PA, 'C', 'N'); var rows = ctl(PA), one1 = rows[0], other = rows[1];
  db.run("UPDATE c_periodcontrol SET periodaction='O' WHERE c_periodcontrol_id=?", [one1.id]);
  var r168 = proc(168, {}, one1.id, 435);
  var a1 = one('SELECT periodstatus AS s, periodaction AS a FROM c_periodcontrol WHERE c_periodcontrol_id=?', [one1.id]), a2 = one('SELECT periodstatus AS s FROM c_periodcontrol WHERE c_periodcontrol_id=?', [other.id]);
  verdict('PS-168-OPEN-ONE', [eq('ran', 'process ok', r168.ok, true), eq('row_opened', "the selected row takes its PeriodAction (O) and PeriodAction resets to N (:106-115)", [a1.s, a1.a], ['O', 'N']), eq('others_untouched', 'NEG-CONTROL the other control rows of the period are not touched', a2.s, 'C')]);
  db.run("UPDATE c_periodcontrol SET periodaction='C' WHERE c_periodcontrol_id=?", [one1.id]);
  var r168c = proc(168, {}, one1.id, 435);
  verdict('PS-168-CLOSE-CLEAN', [eq('closed', 'C with no unposted document of that DocBaseType', [r168c.ok, one('SELECT periodstatus AS s FROM c_periodcontrol WHERE c_periodcontrol_id=?', [one1.id]).s], [true, 'C'])]);
  // refusal is per DocBaseType: an unposted ARI invoice blocks the ARI control row only
  var ariRow = ctl(PA).filter(function (c) { return c.d === 'ARI'; })[0], arrRow = ctl(PA).filter(function (c) { return c.d === 'ARR'; })[0];
  if (!ariRow || !arrRow) verdict('PS-168-REFUSE-PER-DOCBASETYPE', []);
  else {
    db.run("UPDATE c_periodcontrol SET periodstatus='O', periodaction='C' WHERE c_periodcontrol_id IN (?,?)", [ariRow.id, arrRow.id]);
    inject('c_invoice', pdate(PA), { __dbt: 'ARI' });
    var rI = proc(168, {}, ariRow.id, 435), rA = proc(168, {}, arrRow.id, 435);
    var sI = one('SELECT periodstatus AS s, periodaction AS a FROM c_periodcontrol WHERE c_periodcontrol_id=?', [ariRow.id]), sA = one('SELECT periodstatus AS s FROM c_periodcontrol WHERE c_periodcontrol_id=?', [arrRow.id]);
    verdict('PS-168-REFUSE-PER-DOCBASETYPE', [eq('ari_blocked', 'the ARI row is NOT closed while an unposted ARI document is in the period (CouldNotClosePeriodControl)', [sI.s, /CouldNotClose|not close|Could not/i.test(rI.summary)], ['O', true]),
      eq('arr_closes', 'NEG-CONTROL the ARR row (no unposted ARR document) closes (DocBaseType filter, hasUnpostedDocs periodControlID>0)', [rA.ok, sA.s], [true, 'C'])]);
    cleanup();
  }

  // ── PS-DATE: the Java compares Timestamps; date-only and time-of-day values must land where a timestamp compare puts them ──
  function closeWith(table, dateStr, over, expectBlock, id, why) {
    setAll(PC, 'O', 'N'); inject(table, dateStr, over); var exp = unposted(PC).n >= 1, r = proc(167, { PeriodAction: 'C' }, PC, 142), blocked = !r.ok && REFUSE.test(r.summary);
    cleanup(); setAll(PC, 'O', 'N');
    verdict(id, [eq('oracle', 'independent timestamp oracle says ' + (expectBlock ? 'counted' : 'not counted'), exp, expectBlock), eq('process', why, blocked, expectBlock)]);
  }
  var pcRow = one('SELECT startdate AS s, enddate AS e FROM c_period WHERE c_period_id=?', [PC]), dS = pcRow.s.slice(0, 10), dE = pcRow.e.slice(0, 10);
  closeWith('c_invoice', dS, null, true, 'PS-DATE-FIRSTDAY-DATEONLY', 'a date-only DateAcct on the FIRST day equals StartDate 00:00:00 and blocks (raw string compare put it below)');
  closeWith('c_invoice', dE + ' 00:00:00', null, true, 'PS-DATE-LASTDAY-MIDNIGHT', 'DateAcct = EndDate 00:00:00 blocks');
  closeWith('c_invoice', dE, null, true, 'PS-DATE-LASTDAY-DATEONLY', 'a date-only DateAcct on the LAST day equals EndDate and blocks');
  closeWith('c_invoice', dE + ' 10:30:00', null, false, 'PS-DATE-LASTDAY-TIMEOFDAY', 'NEG-CONTROL a time-of-day on the last day is after EndDate 00:00:00 (timestamp BETWEEN, MPeriod.java:1052-1053) and is not counted');
  closeWith('c_invoice', dS + ' 10:30:00', null, true, 'PS-DATE-FIRSTDAY-TIMEOFDAY', 'a time-of-day on the first day is inside the period and blocks');
  // ── PS-ORPHAN: the view JOINs c_doctype -- a row without a doctype is not in the view ──
  closeWith('c_invoice', dS, { c_doctype_id: 9999999 }, false, 'PS-ORPHAN-DOCTYPE-ZERO', 'NEG-CONTROL c_doctype_id=9999999 (no c_doctype row): the INNER JOIN drops the row, not counted');
  closeWith('c_invoice', dS, { c_doctype_id: null, __nodt: 1 }, false, 'PS-ORPHAN-DOCTYPE-NULL', 'NEG-CONTROL c_doctype_id NULL: not counted');
  closeWith('c_cash' in {} ? 'c_cash' : 'c_projectissue', dS, null, true, 'PS-FIXED-PJI-NODOCTYPE', 'c_projectissue has a fixed DocBaseType PJI and NO c_doctype join: counted without any doctype');
  // ── PS-VO: every table whose view branch tests docstatus<>VO ignores a voided unposted document; PJI/MXI/MXP carry a fixed CO and no VO test (rv_unposted definition) ──
  var voTested = 0, voOk = 0;
  VIEW.forEach(function (v) {
    var t = v[0]; if (!v[3] || colsOf(t).indexOf('docstatus') < 0) return; voTested++;
    setAll(PC, 'O', 'N'); inject(t, pdate(PC), { docstatus: 'VO' }); var r = proc(167, { PeriodAction: 'C' }, PC, 142), good = r.ok && unposted(PC).n === 0; if (good) voOk++; else log('§PS-VO-MISS ' + t);
    cleanup(); setAll(PC, 'O', 'N');
  });
  verdict('PS-NEG-VOIDED-ALL-TABLES', voTested ? [eq('void_never_blocks', 'a VO unposted document never blocks, on each of the ' + voTested + ' tables that carry docstatus (view: docstatus<>VO)', voOk, voTested)] : []);
  // ── PS-PARTIAL: a table that EXISTS but cannot be judged must refuse by name, never count as "no unposted documents" ──
  function partial(id, ddl, undo, why, mustName) {
    setAll(PC, 'O', 'N'); db.run(ddl); var r;
    try { r = proc(167, { PeriodAction: 'C' }, PC, 142); } finally { db.run(undo); }
    var st = states(PC); setAll(PC, 'O', 'N');
    verdict(id, [eq('refused', why, [r.ok, st], [false, { O: 23 }]), eq('named', 'the refusal names the table/column (' + mustName + ')', new RegExp(mustName, 'i').test(r.summary), true)]);
  }
  partial('PS-PARTIAL-NO-POSTED', 'ALTER TABLE c_invoice RENAME COLUMN posted TO posted_x', 'ALTER TABLE c_invoice RENAME COLUMN posted_x TO posted', 'c_invoice lacks the posted column: the close is REFUSED, not accepted', 'c_invoice');
  partial('PS-PARTIAL-NO-DOCBASETYPE', 'ALTER TABLE c_doctype RENAME COLUMN docbasetype TO docbasetype_x', 'ALTER TABLE c_doctype RENAME COLUMN docbasetype_x TO docbasetype', 'c_doctype.docbasetype missing: refused by name', 'c_doctype');
  partial('PS-PARTIAL-NO-YEAR-CAL', 'ALTER TABLE c_year RENAME COLUMN c_calendar_id TO c_calendar_id_x', 'ALTER TABLE c_year RENAME COLUMN c_calendar_id_x TO c_calendar_id', 'c_year.c_calendar_id missing: refused by name, no raw SQL error', 'c_year');
  partial('PS-PARTIAL-NO-ORGINFO-CAL', 'ALTER TABLE ad_orginfo RENAME COLUMN c_calendar_id TO c_calendar_id_x', 'ALTER TABLE ad_orginfo RENAME COLUMN c_calendar_id_x TO c_calendar_id', 'ad_orginfo.c_calendar_id missing: refused by name', 'ad_orginfo');
  // NEG-CONTROL for the partial cases: a genuinely ABSENT table (c_cash is not in the bundle) is not a refusal
  verdict('PS-ABSENT-TABLE-NOT-A-REFUSAL', [eq('c_cash_absent', 'c_cash is not in the shipped bundle', colsOf('c_cash').length, 0), eq('closes', 'NEG-CONTROL the clean period still closes with c_cash absent', (function () { setAll(PC, 'O', 'N'); var r = proc(167, { PeriodAction: 'C' }, PC, 142); setAll(PC, 'O', 'N'); return r.ok; })(), true)]);
  // ── PS-MEMO: the view prefix is built once per process run (one DB handle), not per call ──
  (function () { setAll(PC, 'O', 'N'); var r = proc(167, { PeriodAction: 'C' }, PC, 142); var n = r.lines.filter(function (l) { return /§PERIOD-UNPOSTED/.test(l); }).length; setAll(PC, 'O', 'N');
    verdict('PS-MEMO-ONCE-PER-RUN', [eq('one_line', '§PERIOD-UNPOSTED is logged once for the run (view built once per DB handle)', n, 1)]); })();

  // ── PS-CHAIN: END OF THE CHAIN — after the processes ran, the model layer sees the new status ──
  db.run("UPDATE c_acctschema SET autoperiodcontrol='N' WHERE ad_client_id=11");
  var PCL = free[4] && free[4].id, POP = free[5] && free[5].id;
  if (!PCL || !POP) verdict('PS-CHAIN', []);
  else {
    setAll(PCL, 'O', 'N'); setAll(POP, 'C', 'N');
    var rcl = proc(167, { PeriodAction: 'C' }, PCL, 142), rop = proc(167, { PeriodAction: 'O' }, POP, 142);
    var dC = pdate(PCL), dO = pdate(POP), T = new ML.Trx(q, env());
    var pay = function (d) {
      var r = run({ table: 'c_payment', timing: 'SAVE', changes: ML.newPO(new ML.Trx(q, env()), 'c_payment', { ad_org_id: 11, c_doctype_id: 119, c_bankaccount_id: 101, c_bpartner_id: 112, c_currency_id: 100, payamt: 10, isreceipt: 'Y', tendertype: 'X',
        dateacct: d, datetrx: d, docstatus: 'DR', docaction: 'CO', processed: 'N', isapproved: 'N', isallocated: 'N', isprepayment: 'N', isoverunderpayment: 'N', overunderamt: 0, discountamt: 0, writeoffamt: 0, isonline: 'N', isreconciled: 'N', isdelayedcapture: 'N', posted: 'N' }) });
      if (!r.ok) return { err: 'payment save refused: ' + (r.error || r.msg) };
      var id = one('SELECT MAX(c_payment_id) AS id FROM c_payment').id, c = run({ table: 'c_payment', timing: 'DOCACTION', id: id, action: 'CO' });
      return { id: id, ok: c.ok, msg: c.msg, status: one('SELECT docstatus FROM c_payment WHERE c_payment_id=?', [id]).docstatus };
    };
    var xc = pay(dC), xo = pay(dO);
    if (xc.err || xo.err) { log('§PS-NOTE chain could not be driven: ' + (xc.err || xo.err)); verdict('PS-CHAIN', []); }
    else verdict('PS-CHAIN', [eq('ran', 'both processes ok', [rcl.ok, rop.ok], [true, true]),
      eq('periodOpen_closed', 'ModelTrade.periodOpen(date in the period the process CLOSED, ARR) is false', MT.periodOpen(T, dC, 'ARR'), false),
      eq('periodOpen_open', 'ModelTrade.periodOpen(date in the period the process OPENED, ARR) is true', MT.periodOpen(T, dO, 'ARR'), true),
      eq('closed_refused', 'a payment completed in the closed period is refused @PeriodClosed@ and stays out of CO', [xc.ok, xc.status !== 'CO', /PeriodClosed|period/i.test(String(xc.msg))], [false, true, true]),
      eq('open_completes', 'NEG-CONTROL the same payment in the opened period completes', [xo.ok, xo.status], [true, 'CO'])]);
  }

  var bad = results.filter(function (r) { return r.v === 'FAIL'; }).length, inc = results.filter(function (r) { return r.v === 'INCONCLUSIVE'; }).length;
  log('§PS_VERDICT ' + (bad ? 'FAIL' : inc ? 'INCONCLUSIVE' : 'PASS') + ' cases=' + results.length + ' fail=' + bad + ' inconclusive=' + inc);
  process.exit(bad ? 1 : inc ? 2 : 0);
})();
