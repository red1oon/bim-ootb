#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-HELP-PEEK (bim-compiler prompts/VOCAB_MESSAGE_CATALOG.md §19.21, step S1a: the engine). READ THE LOG after every run: every verdict is a §HELP_PEEK line.
// THE ISSUE it proves/disproves: legacy tells a user what stops Complete only AFTER Complete is pressed, and only the first thing. The peek (erp/doc_peek.js) must answer BEFORE,
//   on THIS document, with EVERY blocker it can see past, by running the document's own ported Complete in a trial, and the trial must leave nothing behind.
//   P1 nothing changes: the database bytes (sha256 of db.export) are equal before and after every peek.                         red PEEK_BREAK=commit  -> FAIL
//   P2 peek = Complete: on a clean order the peek says Ready AND a real Complete (committed in a copy-free second step) completes; on a broken order the peek's
//      FIRST blocker key = the key the real Complete returns.                                                                    red PEEK_BREAK=stale   -> FAIL
//   P3 every blocker: an order with k = 2 known problems (its period closed + its customer on credit hold) lists both, in legacy's order (period first, MOrder
//      :1544 before the credit check :1688), and the peek stops with nothing left (Complete passes once both are assumed).        red PEEK_BREAK=noassume -> FAIL
//   P4 the rows are cited and stay in the trial: every assume/field row carries a cite; the database hash after a peek that used them equals the hash before (= P1).
//   P5 the field: each blocker names the column the check reads (PeriodClosed -> DateAcct, credit -> C_BPartner_ID), from the rows or the message.
//   P9 cost: §HELP_PEEK cost ms=… rounds=… per peek (S3 sets a budget from this).
//   PAGE (S1b, the REAL idempiere.html, GardenAdmin; a seed copy holding the broken order is served as ad_seed.db):
//   D1 `?` (the showme pill) opens the East Help panel with its door line (guide · tour · about).
//   D2 the lightbulb Read / Compare pill (erpdoc) is gone: not in pills_idmp.json / pills.json, no page handler (owner: deprecated).
//   P8 lens off: with the friendly-ops bundle not started, the Help panel has no lens button and no peek runs.
//   PP the lightbulb Check (lens on) lists the blockers the engine finds (PeriodClosed, BPartnerCreditHold first), and nothing is written (no op-log entry, the
//      order's DocStatus, the period control and the customer unchanged).
//   P5p each blocker with a field is marked on screen (.peek-bad on the field / tab).                                         red PEEK_PAGE_BREAK=nomark -> FAIL
//   P6 Show-it: the credit blocker's Open link zooms to the Business Partner window on that customer (§ZOOM … landed=true).
//   PEEK_PAGE=0 skips the page half.
//   Vacuous guard: a claim with nothing judged prints INCONCLUSIVE, never PASS.
// Command: node erp/tests/witness_help_peek.js 2>&1 | tee erp/tests/logs/witness_help_peek.log
'use strict';
var fs = require('fs'), path = require('path'), crypto = require('crypto'), cp = require('child_process');
var ERP = path.join(__dirname, '..'), BREAK = process.env.PEEK_BREAK || '';
var _log = console.log; console.log = function () { var l = Array.prototype.join.call(arguments, ' '); if (/^§HELP_PEEK/.test(l)) _log(l); };   // the model's own § lines stay quiet; this witness's lines print
function say(s) { _log(s); }
var C = {}; function check(claim, ok, what, info) { var c = C[claim] = C[claim] || { j: 0, f: 0 }; c.j++; if (!ok) c.f++; say('  §HELP_PEEK-CHECK ' + claim + ' ' + (ok ? 'OK' : 'FAIL') + ' ' + what + (ok ? '' : ' got=' + JSON.stringify(info).slice(0, 900))); }
function verdict(claim) { var c = C[claim] || { j: 0, f: 0 }, v = !c.j ? 'INCONCLUSIVE' : c.f ? 'FAIL' : 'PASS'; say('§HELP_PEEK ' + claim + ' verdict=' + v + ' judged=' + c.j + ' failed=' + c.f); return v; }

(async function main() {
  if (!BREAK && process.env.PEEK_REDS !== '0') {   // the reds: each must make its own claim FAIL (PEEK_REDS=0 skips them while iterating)
    var reds = { commit: 'P1', stale: 'P2', noassume: 'P3' }, redOk = 0; if (process.env.PEEK_PAGE !== '0') reds.nomark = 'P5p';
    Object.keys(reds).forEach(function (b) {
      var out = cp.spawnSync(process.execPath, [__filename], { env: Object.assign({}, process.env, { PEEK_BREAK: b }), encoding: 'utf8' }).stdout || '';
      var failed = new RegExp('§HELP_PEEK ' + reds[b] + ' verdict=FAIL').test(out); if (failed) redOk++;
      say('§HELP_PEEK RED ' + b + ' -> ' + reds[b] + ' ' + (failed ? 'FAILS as it must' : 'DID NOT FAIL (the witness cannot see its own defect)'));
    });
    C.RED = { j: Object.keys(reds).length, f: Object.keys(reds).length - redOk };
  }
  var K = require(path.join(ERP, 'ws_kernel.js')), k = await K.load(), db = k.db, ML = k.ML, q = k.q, A = require(path.join(ERP, 'ad_callout.js'));
  (fs.readFileSync(path.join(ERP, 'idempiere.html'), 'utf8').match(/<script src="(model_[a-z_]+\.js)/g) || []).forEach(function (m) { try { require(path.join(ERP, m.replace('<script src="', ''))); } catch (e) { say('§HELP_PEEK load ' + m + ' failed ' + (e && e.message)); } });   // the page's model classes (as witness_docno.js loads them)
  A.bind(q, {});   // the AD runtime's data access (pricing / UDF reads), as witness_docno_till.js binds it
  var DP = require(path.join(ERP, 'doc_peek.js')), RULES = JSON.parse(fs.readFileSync(path.join(ERP, 'plugins', 'friendly_ops_peek.json'), 'utf8'));
  var S = { clientId: 11, orgId: 11, userId: 100, roleId: 102, warehouseId: 103, actor: 'witness:help-peek' };
  var hash = function () { return crypto.createHash('sha256').update(Buffer.from(db.export())).digest('hex'); };
  var words = function (m) { return A.Msg.parseTranslation({}, m == null ? '' : String(m)); };
  function doPeek(id, rules) {
    if (BREAK === 'commit') {   // red: the trial is committed instead of dropped (and the savepoint released, keeping the assumptions)
      var trx = new ML.Trx(q, k.env(S)), r = ML.processIt(trx, 'c_order', id, 'CO'); if (trx.groupOps().length) k.commit(S, trx.groupOps(), { ws: 'peek-red' });
      return { ready: !!r.ok, blockers: r.ok ? [] : [{ key: DP.keyOf(r.msg), msg: r.msg, field: null }], stop: null, rounds: 1, ms: 0 };
    }
    return DP.peek({ db: db, q: q, ML: ML, env: k.env(S), table: 'c_order', id: id, rules: BREAK === 'noassume' ? { field: rules.field } : rules, text: words });
  }
  // a GardenWorld Standard Order for Joe Block (bp 118, location 113), price list 101, 2 x Oak Tree (123): every id read from ad_seed.db (queries in the witness's PR)
  function newOrder(tag) {
    var r = k.inTrx(S, { ws: 'peek-' + tag }, function (trx) {
      var o = ML.newPO(trx, 'c_order', { ad_org_id: 11, issotrx: 'Y', c_doctypetarget_id: 132, c_doctype_id: 0, c_bpartner_id: 118, c_bpartner_location_id: 113, bill_bpartner_id: 118, bill_location_id: 113,
        m_pricelist_id: 101, c_currency_id: 100, m_warehouse_id: 103, c_paymentterm_id: 105, paymentrule: 'P', deliveryrule: 'A', invoicerule: 'I', deliveryviarule: 'P', priorityrule: '5', salesrep_id: 100 });
      var sv = ML.save(trx, 'c_order', null, o); if (!sv.ok) return { ok: false, error: 'order ' + sv.error };
      var l = ML.newPO(trx, 'c_orderline', { c_order_id: sv.row.c_order_id, ad_org_id: 11, line: 10, m_product_id: 123, qtyentered: 2, qtyordered: 2, m_warehouse_id: 103, c_currency_id: 100 });
      var sl = ML.save(trx, 'c_orderline', null, l); if (!sl.ok) return { ok: false, error: 'line ' + sl.error };
      return { ok: true, id: sv.row.c_order_id };
    });
    var id = r.ok ? q('SELECT max(c_order_id) AS id FROM c_order WHERE ad_client_id=11')[0].id : null;
    say('§HELP_PEEK setup order=' + tag + ' ok=' + r.ok + (r.error ? ' err=' + r.error : '') + ' id=' + id);
    return id;
  }
  function realComplete(id) {   // the user's Complete, committed
    var r = k.inTrx(S, { ws: 'peek-real' }, function (trx) { var x = ML.processIt(trx, 'c_order', id, 'CO'); return { ok: !!x.ok, msg: x.msg, status: x.status }; });
    return { ok: r.ok, key: r.ok ? null : DP.keyOf(r.msg), msg: r.msg, status: r.status };
  }
  function shown(tag, p) { say('§HELP_PEEK peek order=' + tag + ' ready=' + p.ready + ' stop=' + p.stop + ' blockers=' + JSON.stringify(p.blockers.map(function (b) { return { key: b.key, field: b.field && (b.field.column || b.field.level), assumed: b.assumed, words: b.words }; })));
    say('§HELP_PEEK cost order=' + tag + ' ms=' + p.ms + ' rounds=' + p.rounds); }

  // P4 rows cited
  var rows = 0, cited = 0;
  Object.keys(RULES.assume).forEach(function (key) { RULES.assume[key].forEach(function (a) { rows++; if (a.cite) cited++; }); });
  Object.keys(RULES.field).forEach(function (key) { rows++; if (RULES.field[key].cite) cited++; });
  check('P4', rows > 0 && cited === rows, 'every row cites its check (' + cited + ' of ' + rows + ')', { rows: rows, cited: cited });

  // clean order: Ready, and the real Complete completes
  var clean = newOrder('clean');
  if (clean) {
    var h0 = hash(), p0 = doPeek(clean, RULES), h1 = hash(); shown('clean', p0);
    check('P1', h0 === h1, 'clean order: database unchanged by the peek', { h0: h0.slice(0, 12), h1: h1.slice(0, 12) });
    var rc = realComplete(clean);
    check('P2', p0.ready === rc.ok, 'clean order: peek ready=' + p0.ready + ' and the real Complete ok=' + rc.ok + ' agree', { peek: p0, real: rc });
  }
  // broken order: its period closed (period control of the order's DateAcct + SOO set to C, committed) and its customer on credit hold (committed)
  var bad = newOrder('broken');
  if (bad) {
    var o = q('SELECT dateacct, ad_client_id FROM c_order WHERE c_order_id=?', [bad])[0];
    var per = q("SELECT p.c_period_id FROM c_period p JOIN c_year y ON y.c_year_id=p.c_year_id JOIN c_calendar c ON c.c_calendar_id=y.c_calendar_id WHERE c.ad_client_id=11 AND date(p.startdate)<=date(?) AND date(p.enddate)>=date(?)", [o.dateacct, o.dateacct])[0];
    db.run("UPDATE c_periodcontrol SET periodstatus='C' WHERE c_period_id=? AND docbasetype='SOO'", [per && per.c_period_id]);
    db.run("UPDATE c_acctschema SET autoperiodcontrol='N' WHERE ad_client_id=11");
    db.run("UPDATE c_bpartner SET socreditstatus='H' WHERE c_bpartner_id=118");
    say('§HELP_PEEK setup broken dateacct=' + o.dateacct + ' period=' + (per && per.c_period_id) + ' SOO closed, bp 118 credit hold');
    var th = function () { var o = {}; q("SELECT name FROM sqlite_master WHERE type='table'").forEach(function (t) { try { o[t.name] = crypto.createHash('sha1').update(JSON.stringify(q('SELECT * FROM "' + t.name + '"'))).digest('hex'); } catch (e) {} }); return o; };
    var t2 = process.env.PEEK_DIFF ? th() : null;
    var h2 = hash(), p1 = doPeek(bad, RULES), h3 = hash(); shown('broken', p1);
    if (t2) { var t3 = th(); say('§HELP_PEEK diff tables=' + JSON.stringify(Object.keys(t3).filter(function (n) { return t2[n] !== t3[n]; })) + ' pagecount=' + JSON.stringify(q('PRAGMA page_count')) + ' freelist=' + JSON.stringify(q('PRAGMA freelist_count'))); }
    check('P1', h2 === h3, 'broken order: database unchanged by the peek (it used ' + p1.blockers.filter(function (b) { return b.assumed; }).length + ' assumptions)', { h2: h2.slice(0, 12), h3: h3.slice(0, 12) });
    var keys = p1.blockers.map(function (b) { return b.key; });
    var rb = realComplete(bad), first = BREAK === 'stale' ? 'NoLines' : keys[0];   // red stale: the peek's answer comes from somewhere other than this document's Complete
    check('P2', first === rb.key && !rb.ok, 'broken order: peek first blocker ' + first + ' = real Complete ' + rb.key, { peek: keys, real: rb });
    check('P3', JSON.stringify(keys) === JSON.stringify(['PeriodClosed', 'BPartnerCreditHold']) && p1.stop === null, 'broken order lists both blockers in legacy order and nothing after them', { keys: keys, stop: p1.stop });
    var fld = {}; p1.blockers.forEach(function (b) { fld[b.key] = b.field && b.field.column; });
    if (keys.indexOf('PeriodClosed') >= 0) check('P5', fld.PeriodClosed === 'DateAcct', 'PeriodClosed marks DateAcct', fld);
    if (keys.indexOf('BPartnerCreditHold') >= 0) check('P5', fld.BPartnerCreditHold === 'C_BPartner_ID', 'credit hold marks Business Partner', fld);
  }
  // SWEEP (generic, X of N): every draft document of GardenWorld in the 15 document tables of the core windows (§19.21 big picture). Each: peek leaves the
  //   database byte-equal (P1), and the peek's answer = the real Complete run right after it (P2). Tables with no draft are printed, not hidden.
  var DOCT = ['c_order', 'c_invoice', 'm_inout', 'm_inventory', 'c_payment', 'c_allocationhdr', 'c_bankstatement', 'c_banktransfer', 'c_depositbatch', 'gl_journal', 'gl_journalbatch', 'm_movement', 'm_movementconfirm', 'm_inoutconfirm', 'm_requisition'];
  var swept = [], none = [];
  DOCT.forEach(function (t) {
    var ids; try { ids = q('SELECT ' + t + '_id AS id FROM ' + t + " WHERE ad_client_id=11 AND docstatus IN ('DR','IN','IP') AND " + t + '_id NOT IN (?, ?) ORDER BY 1', [clean || 0, bad || 0]).map(function (r) { return r.id; }); }
    catch (e) { none.push(t + ':no-table'); return; }
    if (!ids.length) { none.push(t + ':no-draft'); return; }
    swept.push(t);
    ids.forEach(function (id) {
      var ha = hash(), pp = DP.peek({ db: db, q: q, ML: ML, env: k.env(S), table: t, id: id, rules: RULES, text: words }), hb = hash();
      say('§HELP_PEEK sweep ' + t + ' id=' + id + ' ready=' + pp.ready + ' stop=' + pp.stop + ' keys=' + JSON.stringify(pp.blockers.map(function (b) { return b.key; })) + ' ms=' + pp.ms + (pp.stop === 'error' ? ' error=' + JSON.stringify(pp.blockers[pp.blockers.length - 1].msg).slice(0, 200) : ''));
      check('P1', ha === hb, 'sweep ' + t + ' ' + id + ': database unchanged', { ha: ha.slice(0, 12), hb: hb.slice(0, 12) });
      var rr = k.inTrx(S, { ws: 'peek-sweep' }, function (trx) { var x = ML.processIt(trx, t, id, 'CO'); return { ok: !!x.ok, msg: x.msg }; });
      var rk = rr.ok ? null : DP.keyOf(rr.msg || rr.error), pk = pp.blockers.length ? pp.blockers[0].key : null;
      if (pp.stop === 'no-class') { say('§HELP_PEEK GAP ' + t + ': the twin has no DocAction class, so no peek (a twin gap for the parity lane, not hidden)'); check('P2', /no DocAction class/.test(String(rr.msg || '')), 'sweep ' + t + ' ' + id + ': peek no-class = real Complete has no class', { msg: rr.msg }); return; }
      check('P2', (pp.ready && rr.ok) || (pk !== null && pk === rk), 'sweep ' + t + ' ' + id + ': peek ' + (pp.ready ? 'Ready' : pk) + ' = real Complete ' + (rr.ok ? 'completed' : rk), { peek: pk, real: rk, msg: rr.msg });
    });
  });
  say('§HELP_PEEK sweep tables judged=' + swept.length + ' of ' + DOCT.length + ' [' + swept.join(',') + '] not judged=[' + none.join(',') + ']');
  var pageClaims = [];
  if (process.env.PEEK_PAGE !== '0' && (!BREAK || BREAK === 'nomark') && bad) pageClaims = await pagePart(db, bad);
  var vs = ['P1', 'P2', 'P3', 'P4', 'P5'].concat(pageClaims).map(verdict); if (C.RED) vs.push(verdict('RED'));
  var all = vs.every(function (v) { return v === 'PASS'; }) ? 'PASS' : vs.some(function (v) { return v === 'FAIL'; }) ? 'FAIL' : 'INCONCLUSIVE';
  say('§HELP_PEEK VERDICT ' + all + (BREAK ? ' (red ' + BREAK + ')' : ''));
  process.exitCode = all === 'PASS' ? 0 : 1;

  // ── PAGE half (S1b) ──
  async function pagePart(db, orderId) {
    var os = require('os'), H = require(path.join(ERP, '..', 'common', 'help', 'tests', '_hq.js'));
    var tmpSeed = path.join(os.tmpdir(), 'help_peek_seed_' + process.pid + '.db'); fs.writeFileSync(tmpSeed, Buffer.from(db.export()));   // the node kernel's DB with the broken order (period closed + credit hold) committed
    var over = { '/erp/ad_seed.db': tmpSeed };
    if (BREAK === 'nomark') { var hp = path.join(os.tmpdir(), 'help_peek_nomark_' + process.pid + '.html'); fs.writeFileSync(hp, fs.readFileSync(path.join(ERP, 'idempiere.html'), 'utf8').replace('function _peekMark(marks) {', 'function _peekMark(marks) { return;')); over['/erp/idempiere.html'] = hp; }
    var P = await H.erpPage(null, over), pg = P.pg, logsFrom = function (n, re) { return P.logs.slice(n).filter(function (l) { return re.test(l); }); };
    var wait = async function (fn, arg, ms) { for (var i = 0; i < (ms || 40); i++) { if (await pg.evaluate(fn, arg)) return true; await pg.waitForTimeout(250); } return false; };
    try {
      // D1 the door
      await pg.evaluate(function () { window.IdmpPillActions.showme(); });
      var door = await pg.evaluate(function () { var a = document.getElementById('idmp-help'), d = document.getElementById('idmp-help-door'); return { shown: !!a && a.style.display !== 'none' && !a.classList.contains('closed'), links: d ? Array.prototype.map.call(d.querySelectorAll('[data-help-door]'), function (x) { return x.getAttribute('data-help-door'); }) : [] }; });
      say('§HELP_PEEK page door ' + JSON.stringify(door));
      check('D1', door.shown && door.links.join(',') === 'guide,tour,about', '? opens the Help panel with guide · tour · about', door);
      // D2 the lightbulb pill is deprecated (owner 2026-11-24): absent from both pill registries and from the page's actions
      var reg = ['pills_idmp.json', 'pills.json'].map(function (f) { return /"id":\s*"erpdoc"/.test(fs.readFileSync(path.join(ERP, f), 'utf8')); }), hand = await pg.evaluate(function () { return typeof (window.IdmpPillActions || {}).erpdoc; });
      check('D2', !reg[0] && !reg[1] && hand === 'undefined', 'the lightbulb Read / Compare pill is gone (registries ' + JSON.stringify(reg) + ', handler ' + hand + ')', { reg: reg, hand: hand });
      // P8 lens off
      var openOrder = async function () { await pg.evaluate(function (id) { window.IdmpHost.zoom(143, null, id); }, orderId); await wait(function () { return /Sales Order/.test((document.getElementById('idmp-tabstrip') || {}).innerText || ''); }); await pg.waitForTimeout(1200); };
      var n0 = P.logs.length; await openOrder();
      var offBtns = await pg.evaluate(function () { return document.querySelectorAll('[data-lens-panel]').length; });
      check('P8', offBtns === 0 && !logsFrom(n0, /^§HELP_PEEK table=/).length, 'lens off: no panel button (' + offBtns + ') and no peek ran', { offBtns: offBtns });
      // lens on
      await pg.evaluate(async function () { var r = window.PluginEngine._reg().system; await r.installBundle(location.origin + '/erp/plugins/friendly_ops.mjs'); await r.startBundle('org.kernel.friendly-ops'); });
      await openOrder();
      var onBtn = await wait(function () { return !!document.querySelector('[data-lens-panel="friendly-ops:peek"]'); });
      say('§HELP_PEEK page lens on button=' + onBtn + ' ' + (logsFrom(0, /^§OPS-LENS panel window=/).pop() || ''));
      check('P8', onBtn, 'lens on: the Check button is in the Help panel', {});
      var before = await pg.evaluate(function (id) { var R = window.__tipRead.rows; return JSON.stringify([R('SELECT docstatus FROM c_order WHERE c_order_id=' + id), R("SELECT socreditstatus FROM c_bpartner WHERE c_bpartner_id=118"), R("SELECT count(*) AS n FROM c_periodcontrol WHERE periodstatus='O' AND ad_client_id=11")]); }, orderId);
      var n1 = P.logs.length;
      await pg.click('[data-lens-panel="friendly-ops:peek"]');
      await wait(function () { var b = document.getElementById('idmp-howto-peek'); return !!b && b.innerText.length > 0; });
      await pg.waitForTimeout(500);
      var peekLine = logsFrom(n1, /^§HELP_PEEK table=/).pop() || '', markLine = logsFrom(n1, /^§HELP_PEEK marks /).pop() || '', writes = logsFrom(n1, /^§CRUD-PERSIST|^§CRUD commit|^§KRN-COMMIT/);
      var after = await pg.evaluate(function (id) { var R = window.__tipRead.rows; return JSON.stringify([R('SELECT docstatus FROM c_order WHERE c_order_id=' + id), R("SELECT socreditstatus FROM c_bpartner WHERE c_bpartner_id=118"), R("SELECT count(*) AS n FROM c_periodcontrol WHERE periodstatus='O' AND ad_client_id=11")]); }, orderId);
      var shown = await pg.evaluate(function () { var b = document.getElementById('idmp-howto-peek'); return { text: b.innerText.replace(/\s+/g, ' ').slice(0, 400), keys: Array.prototype.map.call(b.querySelectorAll('li[data-peek-key]'), function (x) { return x.getAttribute('data-peek-key'); }),
        marked: Array.prototype.map.call(document.querySelectorAll('.peek-bad'), function (x) { return (x.getAttribute('data-ad-column') || x.textContent.trim()) + ':' + x.getAttribute('data-peek'); }) }; });
      say('§HELP_PEEK page ' + peekLine); say('§HELP_PEEK page ' + markLine); say('§HELP_PEEK page panel ' + JSON.stringify(shown));
      check('PP', shown.keys[0] === 'PeriodClosed' && shown.keys[1] === 'BPartnerCreditHold', 'the panel lists PeriodClosed then BPartnerCreditHold', shown);
      check('PP', before === after && !writes.length, 'nothing written by the peek (order, customer, period control unchanged; no commit line)', { before: before, after: after, writes: writes.slice(0, 3) });
      var mk = /on_screen=(\d+)/.exec(markLine), asked = /asked=(\d+)/.exec(markLine);
      check('P5p', !!mk && Number(mk[1]) > 0 && shown.marked.some(function (m) { return /^dateordered:PeriodClosed$/i.test(m); }) && shown.marked.some(function (m) { return /^c_bpartner_id:BPartnerCreditHold$/i.test(m); }), 'the fields are marked on screen (' + (mk ? mk[1] : 0) + ' of ' + (asked ? asked[1] : '?') + ')', shown.marked);
      // P6 Show-it
      var n2 = P.logs.length;
      await pg.evaluate(function () { var a = document.querySelector('li[data-peek-key="BPartnerCreditHold"] a[data-peek-show]'); if (a) a.click(); });
      await wait(function () { return /Business Partner/.test((document.getElementById('idmp-tabstrip') || {}).innerText || ''); });
      var z = logsFrom(n2, /^§ZOOM window=/).pop() || '';
      say('§HELP_PEEK page show ' + z);
      check('P6', /^§ZOOM window=123 c_bpartner\.\S+=118 .*landed=true/i.test(z), 'Open on the credit blocker lands on Business Partner 118', z);
      if (P.errs.length) say('§HELP_PEEK page errors ' + JSON.stringify(P.errs.slice(0, 5)));
    } finally { await P.close(); try { fs.unlinkSync(tmpSeed); } catch (e) {} }
    return ['D1', 'D2', 'P8', 'PP', 'P5p', 'P6'];
  }
})().catch(function (e) { _log('§HELP_PEEK VERDICT FAIL threw ' + (e && e.stack || e)); process.exitCode = 1; });
