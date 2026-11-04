#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-DAYCLOSE-EODA and the head-office side of W-EODA-PARTIAL (bim-compiler prompts/POS_PLUGIN_LOCAL_FIRST.md §26.5-§26.6). READ THE LOG after every run: every verdict is a §EODAC-VERDICT line, the exit code is not
//   the evidence. A mutant that CRASHES is NOT a kill: it must print its own FAIL verdict. An empty population prints INCONCLUSIVE, never PASS.
// THE ISSUES: (BOOKS) Branch Day Close over the AGGREGATED batch a branch POS admin sent (its rows + its statement) must give the SAME books as the old path (the same rows, sent per till with no statement): row-set diff 0;
//   (COMPLETE) a batch missing one till's tickets, or one ticket of a till, must be WITHHELD by the gate against the statement, named with declared vs held; (PARTIAL) a batch marked PARTIAL is imported only when the clerk ticks it.
// INPUT: the dump witness_eoda.js writes from head office's own tables (EODA_DUMP, default /tmp/eoda_logs/hq_batch.json): the I_Order / I_Payment rows exactly as head office received them + the statement rows. No row is invented here.
// Run: node erp/tests/witness_eoda_close.js            (parent: spawns the arms, judges, then the mutants when EODAC_MUTANTS=1)   child: EODAC_ARM=direct|batch|missing_till|missing_ticket|partial_off|partial_on
'use strict';
var fs = require('fs'), path = require('path'), cp = require('child_process'), url = require('url');
if (!global.window) global.window = {};
if (!global.crypto || !global.crypto.subtle) global.crypto = require('crypto').webcrypto;
var ERP = path.join(__dirname, '..'), LOGS = process.env.EODAC_LOGS || '/tmp/eoda_logs', ARM = process.env.EODAC_ARM || '', TAG = process.env.EODAC_TAG || '';
var DUMP = process.env.EODA_DUMP || path.join(LOGS, 'hq_batch.json'), PLUGIN = process.env.EODAC_PLUGIN || path.join(ERP, 'plugins', 'friendly_ops.mjs');
var SQLJS_DIR = process.env.SQLJS_DIR || '/home/red1/bim-ootb/tests/node_modules/sql.js'; if (!process.env.SQLJS) process.env.SQLJS = SQLJS_DIR;
fs.mkdirSync(LOGS, { recursive: true });
var BANK = 100, PID_DC = 53405;
function J(x) { return JSON.stringify(x); }
var TABLES = ['fact_acct', 'm_storageonhand', 'm_movement', 'm_movementline', 'c_order', 'c_orderline', 'c_invoice', 'c_invoiceline', 'c_payment', 'c_allocationhdr', 'c_allocationline', 'm_inout', 'm_inoutline', 'm_transaction', 'i_order', 'i_payment'];
var NAMED = ['fact_acct', 'm_storageonhand', 'm_movement', 'c_order', 'c_invoice', 'c_payment'];
var DROP = /^(created|updated|createdby|updatedby|.*_uu|ad_pinstance_id|processedon)$/;
var IDROP = /^(i_order_id|i_payment_id|.*_uu|created|createdby|updated|updatedby|processed|processing|i_errormsg|c_order_id|c_orderline_id|c_payment_id|c_invoice_id)$/;
var clean = function (r) { var o = {}; Object.keys(r).forEach(function (c) { if (r[c] != null && !IDROP.test(c)) o[c] = r[c]; }); return o; };

async function child() {
  var dump = JSON.parse(fs.readFileSync(DUMP, 'utf8')), DAY = dump.day, ORG = dump.org;
  var initSqlJs = require(SQLJS_DIR), _log = console.log, SEEN = [];
  console.log = function () { SEEN.push(Array.prototype.join.call(arguments, ' ')); };
  var say = function (s) { _log(s); }, out = { arm: ARM, tag: TAG, checks: [] };
  function check(cs, key, rule, ok, info) { out.checks.push({ cs: cs, key: key, ok: !!ok }); say('  §EODAC-CHECK arm=' + ARM + ' case=' + cs + ' key=' + key + ' ' + (ok ? 'OK' : 'FAIL') + ' rule="' + rule + '"' + (ok ? '' : ' got=' + J(info).slice(0, 700))); }
  var SQL = await initSqlJs({ locateFile: function (f) { return path.join(SQLJS_DIR, 'dist', f); } });
  var db = new SQL.Database(new Uint8Array(fs.readFileSync(path.join(ERP, 'ad_seed.db'))));
  fs.readFileSync(path.join(ERP, 'patches/ad_seed.db.sql'), 'utf8').split(/;\s*\n/).forEach(function (st) { st = st.replace(/^\s*--[^\n]*\n?/gm, '').trim(); if (st) { try { db.run(st); } catch (e) { /* the loader's own tolerance */ } } });
  function q0(sql, params) { var st = db.prepare(sql), o = []; try { if (params && params.length) st.bind(params); while (st.step()) { var r = st.getAsObject(), l = {}; for (var k in r) l[k.toLowerCase()] = r[k]; o.push(l); } } finally { st.free(); } return o; }
  var IT = require(path.join(ERP, 'ad_import_tables.js')); IT.ensure(db); require(path.join(ERP, 'ad_rule.js')).ensure(db); IT.ensurePos(db);
  global.ERPEngine = require(path.join(ERP, 'erp_engine.js'));
  var K = require(path.join(ERP, 'ws_kernel.js')), k = K.build(db), ML = k.ML, AP = require(path.join(ERP, 'ad_process.js')), PR = require(path.join(ERP, 'plugin_registry.js'));
  db.run('UPDATE c_tax SET rate=0 WHERE c_tax_id=104'); db.run('UPDATE ad_orginfo SET c_location_id=114 WHERE ad_org_id=?', [ORG]);   // the same tax lookup the tills used; rate 0 as the delivery witness
  var S = { clientId: 11, orgId: 11, userId: 100, roleId: 102, warehouseId: 103, actor: 'witness:eoda-close' };
  var one = function (sql, p) { return k.q(sql, p || [])[0] || null; };
  function commit(fn, meta) {
    var trx = new ML.Trx(k.q, k.env(S)), r;
    try { r = fn(trx, ML) || { ok: true }; } catch (ex) { r = { ok: false, error: 'model threw: ' + (ex && ex.message) }; trx.say('§MODEL-ERR ' + (ex && ex.stack || ex)); }
    var ok = r.ok !== false, ops = ok ? trx.groupOps() : [], ids = []; if (ok && ops.length) ids = k.commit(S, ops, meta);
    return Object.assign({}, r, { ok: ok, ops: ops, ids: ids, log: trx.log, trx: trx });
  }
  var keyOf = function (r) { return r.documentno; };
  var tillOfKey = function (key) { var m = /^(.*)-[A-Z]\d+$/.exec(key); return m ? m[1] : ''; };
  // ── which rows head office holds in this arm (every arm starts from what head office actually received)
  var oRows = dump.i_order.slice(), pRows = dump.i_payment.slice(), stmt = dump.stmt.slice(), drop = function (f) { oRows = oRows.filter(function (r) { return !f(keyOf(r)); }); pRows = pRows.filter(function (r) { return !f(keyOf(r)); }); };
  var T1 = dump.tills[0], T2 = dump.tills[1], T3 = dump.tills[2];
  if (ARM === 'direct') stmt = [];                                                    // the OLD path: the same rows, no statement
  if (ARM === 'missing_till') drop(function (key) { return tillOfKey(key) === T2; });                                    // a whole till's tickets never arrived
  if (ARM === 'missing_ticket') { var gone = dump.keys[2][1]; drop(function (key) { return key === gone; }); }          // T3's ticket 2 never arrived
  if (ARM === 'partial_off' || ARM === 'partial_on') {                                 // head office as it stood after the PARTIAL send only: batch 1, tills T1 and T2
    stmt = stmt.filter(function (r) { return Number(r.seq) === 1; }); drop(function (key) { return tillOfKey(key) === T3; });
  }
  var ins = function (table, rows) { rows.forEach(function (r) { var f = clean(r); var cols = Object.keys(f); db.run('INSERT INTO ' + table + ' (' + cols.join(',') + ') VALUES (' + cols.map(function () { return '?'; }).join(',') + ')', cols.map(function (c) { return f[c]; })); }); };
  var saveAll = function (all) { return function (trx) { for (var i = 0; i < all.length; i++) { var sv = ML.save(trx, all[i].t, null, ML.newPO(trx, all[i].t, clean(all[i].f))); if (!sv.ok) return { ok: false, error: all[i].t + ' #' + i + ': ' + sv.error }; } return { ok: true }; }; };
  var dep = commit(saveAll(oRows.map(function (r) { return { t: 'i_order', f: r }; }).concat(pRows.map(function (r) { return { t: 'i_payment', f: r }; }))), { ws: 'deposit' });
  var sCols = ['ad_client_id', 'ad_org_id', 'isactive', 'batchid', 'businessday', 'partial', 'seq', 'kind', 'tillkey', 'series', 'tickets', 'gross', 'net', 'tax', 'tenders', 'taxes', 'override'];
  stmt.forEach(function (r, i) { var f = {}; sCols.forEach(function (c) { if (r[c] != null) f[c] = r[c]; }); f.pos_branchdaystatement_id = 900 + i; var cols = Object.keys(f); db.run('INSERT INTO pos_branchdaystatement (' + cols.join(',') + ') VALUES (' + cols.map(function () { return '?'; }).join(',') + ')', cols.map(function (c) { return f[c]; })); });
  check('FIX', 'rows-as-received', 'the rows head office received are accepted by the head-office kernel: ' + oRows.length + ' I_Order, ' + pRows.length + ' I_Payment, ' + stmt.length + ' statement rows (n>0)', dep.ok && oRows.length > 0 && pRows.length > 0 && (ARM === 'direct' || stmt.length > 0), { ok: dep.ok, err: dep.error, o: oRows.length, p: pRows.length, s: stmt.length });
  // plugins as the host installs them
  var hostDb = { query: function (sql, p) { return q0(sql, p); }, run: function (sql, p) { db.run(sql, p || []); } };
  var host = { engineVersion: '1.0.0', db: hostDb, ops: { append: function () { return 1; } }, process: AP, docAction: ML, lens: { register: function () {}, removeOwner: function () {} }, import: function (u) { return import(url.pathToFileURL(path.resolve(path.join(ERP, 'plugins'), u)).href); } };
  var reg = PR.create(host), pm = await import(url.pathToFileURL(path.join(ERP, 'plugins', 'pos_integration.mjs')).href); await reg.installBundle(pm); var st1 = await reg.startBundle('org.kernel.pos-integration');
  var fm = await import(url.pathToFileURL(PLUGIN).href); await reg.installBundle(fm); var st2 = await reg.startBundle('org.kernel.friendly-ops');
  check('PLUG', 'started', 'pos-integration and friendly-ops ACTIVE (' + path.basename(path.dirname(PLUGIN)) + ')', st1.state === 'ACTIVE' && st2.state === 'ACTIVE', [st1, st2]);
  if (TAG === 'nostatement') global.__DAYCLOSE_BREAK = 'nostatement';
  function snap() { var o = {}; TABLES.forEach(function (t) { var rows; try { rows = k.q('SELECT * FROM ' + t); } catch (e) { rows = []; } o[t] = rows.map(function (r) { var c = {}; Object.keys(r).sort().forEach(function (c0) { if (!DROP.test(c0)) c[c0] = r[c0]; }); return J(c); }).sort(); }); return o; }
  function counts() { var o = {}; ['c_order', 'c_orderline', 'c_invoice', 'm_inout', 'c_payment', 'fact_acct'].forEach(function (t) { o[t] = one('SELECT count(*) AS n FROM ' + t).n; }); return o; }
  var params = { BusinessDay: DAY, C_BankAccount_ID: BANK }; if (ARM === 'partial_on') params.IncludePartial = 'Y';
  var rc = commit(function (trx) { var r0 = AP.runInTrx(trx, PID_DC, { params: params }); return { ok: r0.ok, r: r0, error: r0.summary }; }, { ws: 'day_close' });
  var logs = rc.log.filter(function (l) { return /^§(DAYCLOSE|POSS-TICKET)/.test(l); }); logs.filter(function (l) { return /^§DAYCLOSE/.test(l); }).forEach(function (l) { say('  ' + l.slice(0, 420)); });
  var L = logs.join('\n'), msg = String((rc.r && rc.r.summary) || rc.error || ''), c = counts(), res = { arm: ARM, counts: c, snap: snap(), checks: out.checks, msg: msg };
  var imported = function (till) { return one("SELECT count(*) AS n FROM c_order WHERE documentno LIKE ? AND docstatus='CO'", [till + '-%']).n; };
  if (ARM === 'direct') check('CLOSE', 'old-path-closes', 'the old path (rows, no statement) closes: ' + msg.slice(0, 100) + '; ' + c.c_order + ' orders; says z=NOT-AVAILABLE', rc.ok && /done/.test(msg) && c.c_order >= 9 && /z=NOT-AVAILABLE/.test(L), { msg: msg, c: c });
  if (ARM === 'batch') {
    check('CLOSE', 'batch-closes', 'the aggregated batch closes with the statement judged per till: ' + msg.slice(0, 100) + '; 3 tills PASS statement=OK; ' + c.c_order + ' orders', rc.ok && /done/.test(msg) && c.c_order >= 9 && /z=DECLARED/.test(L) && (L.match(/statement=OK PASS/g) || []).length === 3 && !/WITHHELD/.test(L), { msg: msg, L: L.slice(0, 900) });
    check('CLOSE', 'statement-totals-judged', 'non-vacuous: the gate really compared totals (§DAYCLOSE-STATEMENT lines say totals=judged for 3 tills)', (L.match(/§DAYCLOSE-STATEMENT .* totals=judged/g) || []).length === 3, { L: L.slice(0, 900) });
  }
  if (ARM === 'missing_till') {
    check('COMPLETE', 'missing-till-named', 'a batch missing ALL of ' + T2 + '\'s tickets is caught by the statement: that till is WITHHELD naming declared vs held (statement-count S declared=2 held=0); the other tills still import', /WITHHELD till=.*? reason="statement-count S declared=2 held=0/.test(L) && L.indexOf(T2) > 0 && imported(T1) === 3 && imported(T3) === 4 && imported(T2) === 0, { L: L.slice(0, 900), t1: imported(T1), t3: imported(T3) });
  }
  if (ARM === 'missing_ticket') {
    check('COMPLETE', 'missing-ticket-named', 'a batch missing ONE ticket of ' + T3 + ' (its S2) is caught: that till WITHHELD with statement-count S declared=4 held=3 (and the in-sequence gap); T1 and T2 import', /statement-count S declared=4 held=3/.test(L) && imported(T3) === 0 && imported(T1) === 3 && imported(T2) === 2, { L: L.slice(0, 1000), t3: imported(T3) });
    check('COMPLETE', 'gap-also-named', 'the existing in-sequence GAP check also names the hole (gap ' + T3 + '-S2) - the statement adds the case a gap cannot show (a missing LAST ticket) and the totals', /gap .*-S2/.test(L), { L: L.slice(0, 600) });
  }
  if (ARM === 'partial_off') var nImp = imported(T1) + imported(T2) + imported(T3);
  if (ARM === 'partial_off') check('PARTIAL', 'not-imported-unless-chosen', 'head office after the PARTIAL send, Include partial batch NOT ticked: nothing imported (orders of the batch ' + nImp + '), every till WITHHELD "partial batch"; message: ' + msg.slice(0, 100), nImp === 0 && /reason="partial batch/.test(L) && (L.match(/WITHHELD till=/g) || []).length >= 2 && rc.ok, { msg: msg, c: c, L: L.slice(0, 700) });
  if (ARM === 'partial_on') check('PARTIAL', 'imported-when-chosen', 'with Include partial batch ticked the partial batch (T1 + T2, 5 tickets) imports: ' + (imported(T1) + imported(T2)) + ' orders CO, no withheld; ' + msg.slice(0, 100), rc.ok && imported(T1) + imported(T2) === 5 && imported(T3) === 0 && imported(T1) === 3 && imported(T2) === 2 && !/WITHHELD/.test(L), { msg: msg, c: c, L: L.slice(0, 700) });
  var judged = out.checks.length, failed = out.checks.filter(function (x) { return !x.ok; }).length, v = !judged ? 'INCONCLUSIVE' : failed ? 'FAIL' : 'PASS';
  say('§EODAC-ARM arm=' + ARM + (TAG ? ' mutant=' + TAG : '') + ' verdict=' + v + ' judged=' + judged + ' failed=' + failed);
  fs.writeFileSync(path.join(LOGS, 'close_snap_' + ARM + (TAG ? '_' + TAG : '') + '.json'), J(res)); fs.writeFileSync(path.join(LOGS, 'close_verdict_' + ARM + (TAG ? '_' + TAG : '') + '.json'), J({ v: v, judged: judged, failed: failed }));
  process.exit(failed ? 1 : 0);
}

function parent() {
  var all = [], line = function (s) { console.log(s); }, verdictLine = function (name, ok, judged, failed, extra) { var v = !judged ? 'INCONCLUSIVE' : ok ? 'PASS' : 'FAIL'; all.push(v); line('§EODAC-VERDICT case=' + name + ' verdict=' + v + ' judged=' + judged + ' failed=' + failed + ' ' + (extra || '')); };
  function runArm(arm, env, tag) {
    var vf0 = path.join(LOGS, 'close_verdict_' + arm + (tag ? '_' + tag : '') + '.json'), sf0 = path.join(LOGS, 'close_snap_' + arm + (tag ? '_' + tag : '') + '.json'); [vf0, sf0].forEach(function (f) { try { fs.unlinkSync(f); } catch (e) { /* none */ } });   // a stale verdict must not be read
    var logf = path.join(LOGS, 'close_arm_' + arm + (tag ? '_' + tag : '') + '.log'), r = cp.spawnSync('node', [__filename], { env: Object.assign({}, process.env, { EODAC_ARM: arm, EODAC_TAG: tag || '', EODAC_LOGS: LOGS }, env || {}), encoding: 'utf8', maxBuffer: 1 << 28, timeout: 900000 });
    fs.writeFileSync(logf, (r.stdout || '') + (r.stderr ? '\n--stderr--\n' + r.stderr : '')); var vf = path.join(LOGS, 'close_verdict_' + arm + (tag ? '_' + tag : '') + '.json'), sf = path.join(LOGS, 'close_snap_' + arm + (tag ? '_' + tag : '') + '.json');
    return { code: r.status, log: logf, out: r.stdout || '', err: r.stderr || '' };
  }
  function load(arm, tag) { var vf = path.join(LOGS, 'close_verdict_' + arm + (tag ? '_' + tag : '') + '.json'), sf = path.join(LOGS, 'close_snap_' + arm + (tag ? '_' + tag : '') + '.json'); return { verdict: fs.existsSync(vf) ? JSON.parse(fs.readFileSync(vf, 'utf8')) : null, snap: fs.existsSync(sf) ? JSON.parse(fs.readFileSync(sf, 'utf8')) : null }; }
  function runAndLoad(arm, env, tag) { var r = runArm(arm, env, tag); var l = load(arm, tag); r.verdict = l.verdict; r.snap = l.snap; line(r.out.split('\n').filter(function (x) { return /^\s*§EODAC|^\s*§DAYCLOSE-GATE|^\s*§DAYCLOSE-STATEMENT/.test(x); }).join('\n')); if (r.err) line('   stderr: ' + r.err.slice(0, 300)); return r; }
  function diff(a, b, tables) { var rep = {}, total = 0; tables.forEach(function (t) { var A = a.snap.snap[t] || [], B = b.snap.snap[t] || [], sa = {}, sb = {}; A.forEach(function (x) { sa[x] = (sa[x] || 0) + 1; }); B.forEach(function (x) { sb[x] = (sb[x] || 0) + 1; });
      var d = 0; Object.keys(sa).forEach(function (x) { d += Math.abs((sa[x] || 0) - (sb[x] || 0)); }); Object.keys(sb).forEach(function (x) { if (!sa[x]) d += sb[x]; }); rep[t] = { a: A.length, b: B.length, diff: d }; total += d; }); return { rep: rep, total: total }; }
  if (!fs.existsSync(DUMP)) { line('§EODAC-VERDICT case=INPUT verdict=INCONCLUSIVE judged=0 failed=0 reason="no dump at ' + DUMP + ' (run witness_eoda.js first): nothing judged"'); process.exit(2); }
  line('═══ W-DAYCLOSE-EODA — Branch Day Close over an aggregated batch (prompts/POS_PLUGIN_LOCAL_FIRST.md §26.5) ═══ dump=' + DUMP);
  var direct = runAndLoad('direct'), batch = runAndLoad('batch');
  var verdictOf = function (r, name) { var v = r.verdict; verdictLine(name, !!v && v.v === 'PASS', v ? v.judged : 0, v ? v.failed : 0, 'log=' + r.log + (v ? '' : ' CRASH(no verdict)')); };
  verdictOf(direct, 'OLD-PATH-closes'); verdictOf(batch, 'BATCH-closes');
  if (direct.snap && batch.snap) {
    var d = diff(direct, batch, TABLES), nz = NAMED.every(function (t) { return d.rep[t].a > 0; });
    line('§EODAC-DIFF rowDiff=' + d.total + ' ' + NAMED.map(function (t) { return t + ' ' + d.rep[t].a + '/' + d.rep[t].b; }).join(' ') + ' i_order ' + d.rep.i_order.a + '/' + d.rep.i_order.b + ' (created/updated/_uu/ad_pinstance_id columns excluded)');
    verdictLine('W-DAYCLOSE-EODA', d.total === 0 && nz, nz ? 1 : 0, d.total === 0 ? 0 : 1, 'rowDiff=' + d.total + ' nonVacuous=' + nz + ' (books of the aggregated batch == books of the old per-till path)');
  } else verdictLine('W-DAYCLOSE-EODA', false, 0, 0, 'reason="no snapshot: the diff was not made"');
  ['missing_till', 'missing_ticket', 'partial_off', 'partial_on'].forEach(function (a) { verdictOf(runAndLoad(a), { missing_till: 'W-DAYCLOSE-EODA-MISSING-TILL', missing_ticket: 'W-DAYCLOSE-EODA-MISSING-TICKET', partial_off: 'W-EODA-PARTIAL-NOT-IMPORTED', partial_on: 'W-EODA-PARTIAL-IMPORTED-WHEN-CHOSEN' }[a]); });
  if (process.env.EODAC_MUTANTS === '1') {
    var src = fs.readFileSync(path.join(ERP, 'plugins', 'friendly_ops.mjs'), 'utf8');
    var MUT = [
      { name: 'statement-check-off', arm: 'missing_till', old: "if (DC_BREAK === 'nostatement') why = [];", neu: 'if (true) why = [];', kills: 'W-DAYCLOSE-EODA-MISSING-TILL' },
      { name: 'count-not-compared', arm: 'missing_ticket', old: "if (h.count !== w.count)", neu: "if (false)", kills: 'W-DAYCLOSE-EODA-MISSING-TICKET', core: true },
      { name: 'partial-always-imported', arm: 'partial_off', old: "batch.partial && includePartial !== 'Y' ?", neu: "false ?", kills: 'W-EODA-PARTIAL-NOT-IMPORTED' }
    ];
    MUT.forEach(function (m) {
      var root = '/tmp/eoda_mut/' + m.name, dir = root + '/plugins'; fs.mkdirSync(dir, { recursive: true });
      var core = fs.readFileSync(path.join(ERP, 'eoda_core.js'), 'utf8'), s2 = m.core ? core : src, n = s2.split(m.old).length - 1, mutated = s2.replace(m.old, function () { return m.neu; }), applied = n === 1 && mutated !== s2;
      fs.writeFileSync(root + '/eoda_core.js', m.core ? mutated : core); fs.writeFileSync(dir + '/friendly_ops.mjs', m.core ? src : mutated); fs.copyFileSync(path.join(ERP, 'till_core.js'), root + '/till_core.js');
      line('§EODAC-MUTANT name=' + m.name + ' applied=' + (applied ? 'YES exactly once' : 'NO occurrences=' + n) + ' copy=' + root + ' (a copy, the shipped files untouched)');
      if (!applied) { verdictLine('MUTANT-' + m.name, false, 0, 0, 'reason="rewrite did not apply: not a kill"'); return; }
      var r = runAndLoad(m.arm, { EODAC_PLUGIN: dir + '/friendly_ops.mjs' }, m.name), killed = !!(r.verdict && r.verdict.v === 'FAIL');
      line('§EODAC-MUTANT name=' + m.name + ' ' + (killed ? 'KILLED' : 'SURVIVED') + ' by=' + m.kills + ' verdict=' + (r.verdict && r.verdict.v) + ' exit=' + r.code + ' log=' + r.log);
      verdictLine('MUTANT-' + m.name, killed, 1, killed ? 0 : 1, 'killed=' + killed);
    });
  }
  var bad = all.filter(function (v) { return v !== 'PASS'; }).length; line('§EODAC-SUMMARY verdicts=' + all.length + ' notPass=' + bad); process.exit(bad ? 1 : 0);
}
if (ARM) child().catch(function (e) { console.error('§EODAC-CRASH ' + (e && e.stack || e)); process.exit(3); }); else parent();
