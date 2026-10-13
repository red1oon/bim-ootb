#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-NC1-CALENDAR (bim-compiler prompts/ERP_DEPTH_FILM.md §NC-1; CARDINAL RULE: the twin creates periods exactly like legacy iDempiere).
//   READ THE LOG after every run: every verdict is a §NC1 line, the exit code is not the evidence.
// THE ISSUE it proves/disproves: AD_Process 100 YearCreatePeriods -> MYear.createStdPeriods (MYear.java:209-285) + MPeriod.beforeSave/afterSave (MPeriod.java:799-873) on the twin.
//   Expected rows are computed HERE by an independent java.util.GregorianCalendar model (month add CLAMPS to the last day of the target month), never by the code under test.
//   Legacy confirmation of the same rows = pilot WS (needs ws_nc1_yearperiods.sql, ask-first admin action) - until then verdicts are tagged oracle=JAVA-SEMANTICS, not LEGACY-MEASURED.
//   INCONCLUSIVE if a case cannot be driven. Negative control: a deliberately wrong oracle (no clamp) must DISAGREE on the day-31 case.
'use strict';
var fs = require('fs'), path = require('path');
var ERP = path.join(__dirname, '..');
var initSqlJs; try { initSqlJs = require('sql.js'); } catch (e) { initSqlJs = require(path.join(ERP, 'sqljs', 'sql-wasm.js')); }
var TODAY = process.env.TODAY || new Date().toISOString().slice(0, 10), DAY = TODAY + ' 00:00:00';
var results = [], log = function (s) { console.log(s); };
function verdict(id, checks) {
  var judged = checks.length, failed = checks.filter(function (c) { return !c.ok; });
  checks.forEach(function (c) { log('  §NC1-CHECK case=' + id + ' key=' + c.key + ' ' + (c.ok ? 'OK' : 'FAIL') + ' rule="' + c.rule + '"' + (c.ok ? '' : ' want=' + JSON.stringify(c.want) + ' got=' + JSON.stringify(c.got))); });
  var v = !judged ? 'INCONCLUSIVE' : failed.length ? 'FAIL' : 'PASS';
  log('§NC1 case=' + id + ' verdict=' + v + ' judged=' + judged + ' failed=' + failed.length); results.push({ id: id, v: v }); return v;
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
  log('§NC1-SEED ad_seed.db + patches/ad_seed.db.sql statements=' + pOk + ' failed=' + pFail + ' today=' + TODAY);
  var A = require(path.join(ERP, 'ad_callout.js'));
  ['support', 'support_stock', 'views', 'currency', 'uom', 'pricing', 'tax', 'sqlfn'].forEach(function (m) { require(path.join(ERP, 'callouts', m + '.js')); });
  A.RUNTIME.registerSqlFunctions(function (n, f) { db.create_function(n, f); });
  var ML = require(path.join(ERP, 'model_layer.js'));
  ['model_trade', 'model_ctor', 'model_cost', 'model_match', 'model_order', 'model_invoice', 'model_post'].forEach(function (m) { require(path.join(ERP, m + '.js')); });
  var MT = require(path.join(ERP, 'model_trade.js'));
  var P = require(path.join(ERP, 'ad_process.js'));
  fs.readdirSync(path.join(ERP, 'processes')).filter(function (f) { return /\.js$/.test(f); }).sort().forEach(function (f) { require(path.join(ERP, 'processes', f)); });
  log('§NC1-ENGINE javaPorts=' + Object.keys(P.JAVA).length + ' 167=' + !!P.JAVA['org.compiere.process.PeriodStatus'] + ' 168=' + !!P.JAVA['org.compiere.process.PeriodControlStatus']);

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


  // ── independent Java GregorianCalendar model ──
  var MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  function dim(y, m) { return new Date(Date.UTC(y, m + 1, 0)).getUTCDate(); }
  function addMonth(c, clamp) { var y = c.y, m = c.m + 1; if (m > 11) { m = 0; y++; } var d = clamp ? Math.min(c.d, dim(y, m)) : c.d; return { y: y, m: m, d: d }; }
  function addDay(c, n) { var t = new Date(Date.UTC(c.y, c.m, c.d + n)); return { y: t.getUTCFullYear(), m: t.getUTCMonth(), d: t.getUTCDate() }; }
  function iso(c) { function p(n) { return n < 10 ? '0' + n : '' + n; } return c.y + '-' + p(c.m + 1) + '-' + p(c.d); }
  function fmt(c, f) { var yy = String(c.y); if (f === 'MMM yyyy') return MON[c.m] + ' ' + yy; return MON[c.m] + '-' + yy.slice(2); }
  function javaPeriods(fy, startIso, f, clamp) {                              // MYear.createStdPeriods :228-281
    var c = startIso ? { y: +startIso.slice(0, 4), m: +startIso.slice(5, 7) - 1, d: +startIso.slice(8, 10) } : { y: fy, m: 0, d: 1 }, out = [];
    for (var i = 0; i < 12; i++) { var e = addDay(addMonth(c, clamp), -1); out.push({ no: i + 1, name: fmt(c, f || 'MMM-yy'), s: iso(c), e: iso(e) }); c = addDay(e, 1); }
    return out;
  }
  var seq = 0, newCal = function (name) { var id = newId('c_calendar'); db.run('INSERT INTO c_calendar (c_calendar_id,ad_client_id,ad_org_id,isactive,name) VALUES (?,?,?,?,?)', [id, 11, 0, 'Y', name]); return id; };
  var newYear = function (cal, fy) { var id = newId('c_year'); db.run('INSERT INTO c_year (c_year_id,ad_client_id,ad_org_id,isactive,c_calendar_id,fiscalyear) VALUES (?,?,?,?,?,?)', [id, 11, 0, 'Y', cal, String(fy)]); return id; };
  function periodsOf(yearId) { return q("SELECT periodno AS no, name, substr(startdate,1,10) AS s, substr(enddate,1,10) AS e, periodtype AS t FROM c_period WHERE c_year_id=? ORDER BY periodno", [yearId]); }
  function diff(want, got) { var bad = []; for (var i = 0; i < 12; i++) { var w = want[i], g = got[i]; if (!g || g.name !== w.name || g.s !== w.s || g.e !== w.e || g.no !== w.no) bad.push({ no: i + 1, want: w, got: g || null }); } return bad; }
  function ctlCount(yearId) { return one("SELECT COUNT(*) AS n FROM c_periodcontrol WHERE c_period_id IN (SELECT c_period_id FROM c_period WHERE c_year_id=?)", [yearId]).n; }
  var dbt = one("SELECT COUNT(DISTINCT docbasetype) AS n FROM c_doctype WHERE ad_client_id=11 AND isactive='Y'").n;
  log('§NC1-ENV client11 distinct active DocBaseTypes=' + dbt + ' oracle=JAVA-SEMANTICS');

  var TWIN = {};
  function rowCase(id, claim, fy, start, f, clamp, calId) {
    var cal = calId || newCal('NC1-' + id + '-' + (++seq)), yr = newYear(cal, fy);
    var p = {}; if (start) p.StartDate = start + ' 00:00:00'; if (f) p.DateFormat = f;
    var r = proc(100, p, yr, 177), got = periodsOf(yr), want = javaPeriods(fy, start, f, clamp), bad = diff(want, got);
    var v = verdict(id, [eq('ran', 'process ok (' + r.summary.slice(0, 60) + ')', r.ok, true), eq('count', '12 periods', got.length, 12), eq('rows', claim + ' (name/PeriodNo/Start/End vs GregorianCalendar model)', bad.length, 0),
      eq('type', "PeriodType 'S' (MPeriod.java:541-543)", got.every(function (g) { return g.t === 'S'; }), true), eq('ctl', 'C_PeriodControl = 12 x distinct active DocBaseType (afterSave :849-873)', ctlCount(yr), 12 * dbt)]);
    log('§NC1 row=' + id + ' oracle=JAVA-SEMANTICS twin_periods=' + got.length + ' diff=' + bad.length + (bad[0] ? ' first=' + JSON.stringify(bad[0]) : ''));
    TWIN[id] = got;
    return { yr: yr, cal: cal, got: got, bad: bad };
  }
  rowCase('NC1.1', 'Jan-start year 2027', 2027, null, null, true);
  var l = rowCase('NC1.1b', 'leap year 2028: Feb = 29 days', 2028, null, null, true);
  verdict('NC1.1b-FEB29', [eq('feb', 'Feb-28 ends on the 29th', l.got[1] && l.got[1].e, '2028-02-29')]);
  rowCase('NC1.2', 'fiscal year from 2027-07-01, DateFormat MMM yyyy', 2027, '2027-07-01', 'MMM yyyy', true);
  var d31 = rowCase('NC1.3', 'start on the 31st clamps via GregorianCalendar', 2027, '2027-01-31', null, true);
  // NEGATIVE CONTROL: the no-clamp (JS Date overflow) oracle must DISAGREE with the Java model, else the day-31 row proves nothing
  var nc = diff(javaPeriods(2027, '2027-01-31', null, true), javaPeriods(2027, '2027-01-31', null, false));
  verdict('NC1.3-NEG-ORACLE', [eq('differs', 'clamp vs overflow models differ on the 31st (the row is not vacuous)', nc.length > 0, true)]);

  // NC1.4 re-run on the same year = reuse branch (:260-272), same rows, no duplicates
  var y4 = rowCase('NC1.4a', 'first run', 2029, null, null, true), n0 = q('SELECT COUNT(*) AS n FROM c_period WHERE c_year_id=?', [y4.yr])[0].n;
  var r2 = proc(100, {}, y4.yr, 177), n1 = one('SELECT COUNT(*) AS n FROM c_period WHERE c_year_id=?', [y4.yr]).n;
  verdict('NC1.4-RERUN', [eq('ran', 'second run ok', r2.ok, true), eq('same_count', 'no duplicate periods (existing period of the calendar reused)', n1, n0), eq('rows', 'same rows', diff(javaPeriods(2029, null, null, true), periodsOf(y4.yr)).length, 0), eq('ctl', 'no duplicate control rows', ctlCount(y4.yr), 12 * dbt)]);
  // NC1.4 overlap: StartDate 2027-06-15 inside Jun-27 of the NC1.1 calendar-less year -> reuse Jun-27 with new dates -> end overlaps Jul-27 -> refusal
  var cal5 = newCal('NC1-overlap'), ya = newYear(cal5, 2027); proc(100, {}, ya, 177);
  var yb = newYear(cal5, 2028), before = one('SELECT COUNT(*) AS n FROM c_period WHERE c_year_id IN (SELECT c_year_id FROM c_year WHERE c_calendar_id=?)', [cal5]).n;
  var ro = proc(100, { StartDate: '2027-06-15 00:00:00' }, yb, 177), after = one('SELECT COUNT(*) AS n FROM c_period WHERE c_year_id IN (SELECT c_year_id FROM c_year WHERE c_calendar_id=?)', [cal5]).n;
  verdict('NC1.4-OVERLAP', [eq('refused', 'overlapping StartDate is refused (MPeriod.beforeSave :824-843: "Period overlaps with: Jul-27")', [ro.ok, /overlaps with/i.test(ro.summary)], [false, true]), eq('no_ops', 'one Trx, nothing committed', [ro.nops, after], [0, before])]);
  log('§NC1-OVERLAP summary=' + ro.summary.slice(0, 120));
  // NC1.6 org -> calendar (MPeriod.getC_Calendar_ID :981-997; findByCalendar :170-190): org 12 gets its own calendar B whose Dec-2026 period is INACTIVE;
  //   the client calendar (102) has an active Dec-2026 period. AutoPeriodControl=Y (GW schemas, history 10000d / future 100d) => open iff a period is found.
  var calB = newCal('NC1-orgcal'), yB = newYear(calB, 2026); proc(100, {}, yB, 177);
  var decB = one("SELECT c_period_id AS id FROM c_period WHERE c_year_id=? AND periodno=12", [yB]); db.run("UPDATE c_period SET isactive='N' WHERE c_period_id=?", [decB.id]);
  var oi12 = one('SELECT c_calendar_id AS c FROM ad_orginfo WHERE ad_org_id=12'); db.run('UPDATE ad_orginfo SET c_calendar_id=? WHERE ad_org_id=12', [calB]);
  var tr = new ML.Trx(q, env()), dayX = '2026-12-01 00:00:00';
  var o11 = MT.periodOpen(tr, dayX, 'SOO', 11), o12 = MT.periodOpen(tr, dayX, 'SOO', 12), o0 = MT.periodOpen(tr, dayX, 'SOO', 0);
  verdict('NC1.6-ORG-CALENDAR', [eq('org11_client_cal', 'org without own calendar uses the CLIENT calendar (period found, open)', o11, true), eq('org12_own_cal', 'org 12 uses ITS calendar: period inactive -> not found -> closed', o12, false), eq('org0', 'org 0 uses the client calendar', o0, true)]);
  log('§NC1 row=NC1.6 oracle=JAVA-SEMANTICS(MPeriod.java:981-997) org11=' + o11 + ' org12=' + o12 + ' org0=' + o0);
  db.run('UPDATE ad_orginfo SET c_calendar_id=? WHERE ad_org_id=12', [oi12 ? oi12.c : null]);
  // NC1.7 special period type A inside a standard period is accepted (overlap test is per PeriodType)
  var spec = one("SELECT c_period_id AS id, startdate AS s, enddate AS e FROM c_period WHERE c_year_id=? AND periodno=12", [ya]);
  var yst = { getC_Calendar_ID: function () { return cal5; }, getAD_Client_ID: function () { return 11; }, getAD_Org_ID: function () { return 0; }, getC_Year_ID: function () { return ya; } }, rs = { ok: true, err: '' };
  try { MT.MPeriod_save(new ML.Trx(q, env()), null, { ad_client_id: 11, ad_org_id: 0, c_year_id: ya, periodno: 13, name: 'Adj-27', periodtype: 'A', startdate: spec.s, enddate: spec.e }, yst); } catch (e) { rs = { ok: false, err: String(e.message || e) }; }
  log('§NC1-ADJ err=' + rs.err.slice(0, 160));
  verdict('NC1.7-ADJUSTING', [eq('accepted', "PeriodType 'A' over a standard period is accepted (overlap is per PeriodType)", rs.ok, true)]);

  // ── LEGACY-MEASURED: rows the pilot produced for the same cases (scripts/bridge/nc1_legacy.js -> out/nc1_legacy.json) ──
  var LJ = process.env.NC1_LEGACY || path.join(ERP, '..', '..', '..', 'bim-compiler', 'scripts', 'bridge', 'out', 'nc1_legacy.json');
  if (!fs.existsSync(LJ)) { log('§NC1-LEGACY INCONCLUSIVE no legacy file ' + LJ); verdict('NC1-LEGACY', []); }
  else {
    var L = JSON.parse(fs.readFileSync(LJ, 'utf8')).cases, key = function (p) { return p.no + '|' + p.name + '|' + p.s + '|' + p.e + '|' + p.t; };
    ['NC1.1', 'NC1.1b', 'NC1.2', 'NC1.3', 'NC1.4a'].forEach(function (id) {
      var lg = (L[id] || {}).periods || [], tw = TWIN[id] || [], d = 0, first = null;
      for (var i = 0; i < Math.max(lg.length, tw.length); i++) if (!lg[i] || !tw[i] || key(lg[i]) !== key(tw[i])) { d++; first = first || { legacy: lg[i], twin: tw[i] }; }
      log('§NC1-LEGACY row=' + id + ' legacy=' + lg.length + ' twin=' + tw.length + ' diff=' + d + (first ? ' first=' + JSON.stringify(first) : '') + ' oracle=LEGACY-MEASURED');
      verdict('LEGACY-' + id, [eq('rows', 'twin periods == legacy periods (PeriodNo|Name|Start|End|Type)', [lg.length, d], [12, 0])]);
    });
    verdict('LEGACY-OVERLAP', [eq('both_refuse', 'legacy and twin both refuse with "Period overlaps with: Jul-27"', [(L['NC1.4-OVERLAP'] || {}).ok, /Period overlaps with: Jul-27/.test((L['NC1.4-OVERLAP'] || {}).summary || ''), ro.ok, /overlaps with: Jul-27/.test(ro.summary)], [false, true, false, true])]);
    verdict('LEGACY-ADJUSTING', [eq('accepted', 'legacy accepts the adjusting period like the twin', [(L['NC1.7-ADJUSTING'] || {}).ok, rs.ok], [true, true])]);
    verdict('LEGACY-CTL', [eq('ctl', 'control rows per year: legacy == twin == 12 x DocBaseTypes', [(L['NC1.1'] || {}).ctl, JSON.parse(fs.readFileSync(LJ, 'utf8')).dbt * 12], [12 * dbt, 12 * dbt])]);
  }
  var bad = results.filter(function (r) { return r.v !== 'PASS'; });
  log('§NC1-VERDICT ' + (bad.length ? 'FAIL ' + bad.map(function (r) { return r.id + '=' + r.v; }).join(',') : 'PASS') + ' cases=' + results.length);
  process.exit(bad.length ? 1 : 0);
})().catch(function (e) { console.log('§NC1 CRASH ' + (e && e.stack || e)); process.exit(2); });
