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
//   F1 a fix is offered only when proved (today closed: none) · F2 proved fix DateOrdered := today on a past closed period · F3 saved, the real Complete passes it.   red unproven -> F1
//   PF1 page: ▶ Fix offered · PF2 ▶ types the field (form change path), the new check lists only the credit hold, nothing saved, no DocAction ran   red fixdocaction -> PF2
//   PF3 the toolbar's Undo Changes takes the fix back.
//   S3 (Business Central's background check): B1 opening the order checks it by itself, count on the ? door · B2 after ▶ + Save it checks again (count 1)   red nobg -> B1
//   B3 switched off: no count, no check · B4 Show lines with issues filters the lines tab to line 20 · B5 within the 250 ms budget.
//   PEEK_PAGE=0 skips the page half.
//   Vacuous guard: a claim with nothing judged prints INCONCLUSIVE, never PASS.
// Command: node erp/tests/witness_help_peek.js 2>&1 | tee erp/tests/logs/witness_help_peek.log
'use strict';
var fs = require('fs'), path = require('path'), crypto = require('crypto'), cp = require('child_process');
var ERP = path.join(__dirname, '..'), BREAK = process.env.PEEK_BREAK || '';
if (BREAK === 'unproven') process.env.PEEK_FIX_BREAK = 'unproven';   // the engine reads it (doc_peek.js BREAK_FIX)
var _log = console.log; console.log = function () { var l = Array.prototype.join.call(arguments, ' '); if (/^§HELP_PEEK/.test(l)) _log(l); };   // the model's own § lines stay quiet; this witness's lines print
function say(s) { _log(s); }
var C = {}; function check(claim, ok, what, info) { var c = C[claim] = C[claim] || { j: 0, f: 0 }; c.j++; if (!ok) c.f++; say('  §HELP_PEEK-CHECK ' + claim + ' ' + (ok ? 'OK' : 'FAIL') + ' ' + what + (ok ? '' : ' got=' + JSON.stringify(info).slice(0, 900))); }
function verdict(claim) { var c = C[claim] || { j: 0, f: 0 }, v = c.f ? 'FAIL' : (!c.j || c.partial) ? 'INCONCLUSIVE' : 'PASS'; say('§HELP_PEEK ' + claim + ' verdict=' + v + ' judged=' + c.j + ' failed=' + c.f + (c.partial ? ' partial=' + c.partial : '')); return v; }

(async function main() {
  if (!BREAK && process.env.PEEK_REDS !== '0') {   // the reds: each must make its own claim FAIL (PEEK_REDS=0 skips them while iterating)
    var reds = { commit: 'P1', stale: 'P2', noassume: 'P3', unproven: 'F1', fixwrong: 'FX' }, redOk = 0; if (process.env.PEEK_PAGE !== '0') { reds.nomark = 'P5p'; reds.fixdocaction = 'PF2'; reds.nobg = 'B1'; }
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
  function newOrder(tag, date, extraProduct) {
    var r = k.inTrx(S, { ws: 'peek-' + tag }, function (trx) {
      var o = ML.newPO(trx, 'c_order', { ad_org_id: 11, issotrx: 'Y', c_doctypetarget_id: 132, c_doctype_id: 0, c_bpartner_id: 118, c_bpartner_location_id: 113, bill_bpartner_id: 118, bill_location_id: 113,
        m_pricelist_id: 101, c_currency_id: 100, m_warehouse_id: 103, c_paymentterm_id: 105, paymentrule: 'P', deliveryrule: 'A', invoicerule: 'I', deliveryviarule: 'P', priorityrule: '5', salesrep_id: 100 });
      if (date) { o.dateordered = date; o.dateacct = date; o.datepromised = date; }
      var sv = ML.save(trx, 'c_order', null, o); if (!sv.ok) return { ok: false, error: 'order ' + sv.error };
      var l = ML.newPO(trx, 'c_orderline', { c_order_id: sv.row.c_order_id, ad_org_id: 11, line: 10, m_product_id: 123, qtyentered: 2, qtyordered: 2, m_warehouse_id: 103, c_currency_id: 100 });
      var sl = ML.save(trx, 'c_orderline', null, l); if (!sl.ok) return { ok: false, error: 'line ' + sl.error };
      if (extraProduct) { var l2 = ML.newPO(trx, 'c_orderline', { c_order_id: sv.row.c_order_id, ad_org_id: 11, line: 20, m_product_id: extraProduct, qtyentered: 1, qtyordered: 1, m_warehouse_id: 103, c_currency_id: 100 });
        var s2 = ML.save(trx, 'c_orderline', null, l2); if (!s2.ok) return { ok: false, error: 'line 20 ' + s2.error }; }
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
  Object.keys(RULES.fix || {}).filter(function (key) { return key.charAt(0) !== '_'; }).forEach(function (key) { rows++; if (RULES.fix[key].cite) cited++; });
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
  // ── S2 FIX claims (§19.21 owner 2026-11-24: ▶ sets single field values, the easiest valid one, never Complete / Process) ──
  //   F1 a fix is offered ONLY when proved: on the broken order TODAY's period is closed, so "date := today" cannot clear PeriodClosed -> no fix offered.   red PEEK_FIX_BREAK=unproven -> FAIL
  //   F2 a proved fix: today's period open again, an order dated in a CLOSED past period -> PeriodClosed carries the fix DateOrdered (+ DateAcct) := today, proved;
  //      F3 end of the chain: that value saved for real (ML.save) -> the real Complete no longer stops at PeriodClosed.
  if (bad) {
    var pb = doPeek(bad, RULES), pc = pb.blockers.filter(function (b) { return b.key === 'PeriodClosed'; })[0];
    say('§HELP_PEEK fix order=broken period-fix=' + JSON.stringify(pc && pc.fix || null) + ' unproved=' + pb.unproved);
    check('F1', !!pc && !pc.fix && pb.unproved >= 1, 'today closed: no fix offered for PeriodClosed (unproved=' + pb.unproved + ')', { fix: pc && pc.fix, unproved: pb.unproved });
    var today = q('SELECT dateacct FROM c_order WHERE c_order_id=?', [bad])[0].dateacct, perT = q("SELECT p.c_period_id FROM c_period p JOIN c_year y ON y.c_year_id=p.c_year_id JOIN c_calendar c ON c.c_calendar_id=y.c_calendar_id WHERE c.ad_client_id=11 AND date(p.startdate)<=date(?) AND date(p.enddate)>=date(?)", [today, today])[0];
    var past = '2026-10-15 00:00:00', perP = q("SELECT p.c_period_id FROM c_period p JOIN c_year y ON y.c_year_id=p.c_year_id JOIN c_calendar c ON c.c_calendar_id=y.c_calendar_id WHERE c.ad_client_id=11 AND date(p.startdate)<=date(?) AND date(p.enddate)>=date(?)", [past, past])[0];
    db.run("UPDATE c_periodcontrol SET periodstatus='O' WHERE c_period_id=? AND docbasetype='SOO'", [perT && perT.c_period_id]);
    db.run("UPDATE c_periodcontrol SET periodstatus='C' WHERE c_period_id=? AND docbasetype='SOO'", [perP && perP.c_period_id]);
    db.run("UPDATE c_bpartner SET socreditstatus='O' WHERE c_bpartner_id=118");
    var old = newOrder('pastdated', past);
    say('§HELP_PEEK setup pastdated today-period=' + (perT && perT.c_period_id) + ' open, past-period=' + (perP && perP.c_period_id) + ' closed, credit released');
    if (old) {
      var h4 = hash(), pf = doPeek(old, RULES), h5 = hash(), pfc = pf.blockers.filter(function (b) { return b.key === 'PeriodClosed'; })[0];
      say('§HELP_PEEK fix order=pastdated keys=' + JSON.stringify(pf.blockers.map(function (b) { return b.key; })) + ' period-fix=' + JSON.stringify(pfc && pfc.fix || null));
      check('P1', h4 === h5, 'pastdated order: database unchanged by the peek that proved a fix', {});
      check('F2', !!pfc && !!pfc.fix && pfc.fix.column === 'DateOrdered' && String(pfc.fix.value).slice(0, 10) === String(today).slice(0, 10) && /cleared|completes/.test(pfc.fix.proved), 'past closed period: fix DateOrdered := today, proved (' + (pfc && pfc.fix && pfc.fix.proved) + ')', pfc);
      if (pfc && pfc.fix) {
        var sv = k.inTrx(S, { ws: 'peek-fix' }, function (trx) { var d = trx.get('c_order', old), ch = {}; ch[pfc.fix.column.toLowerCase()] = pfc.fix.value; pfc.fix.also.forEach(function (c) { ch[c.toLowerCase()] = pfc.fix.value; }); return ML.save(trx, 'c_order', d, ch); });
        var rf = realComplete(old);
        say('§HELP_PEEK fix applied save=' + sv.ok + ' then real Complete ok=' + rf.ok + ' key=' + rf.key);
        check('F3', sv.ok && rf.key !== 'PeriodClosed', 'the fix saved, the real Complete no longer stops at PeriodClosed (' + (rf.ok ? 'completed' : rf.key) + ')', rf);
      }
    }
  }
  // cloneDraft(t): a DRAFT copy of the newest Completed GardenWorld document of table t, with its line tables (the tab-level-1 tables of the window whose
  //   first tab is t, ad_seed.db), new ids, DocStatus DR / DocAction CO / Processed N (legacy CopyFrom's state for a copy). Raw SQL on the witness's own DB.
  function cloneDraft(t) {
    var src; try { src = q('SELECT * FROM ' + t + " WHERE ad_client_id=11 AND docstatus IN ('CO','CL') ORDER BY " + t + '_id DESC LIMIT 1')[0]; } catch (e) { return { why: 'no-table' }; }
    if (!src) return { why: 'no-completed-to-copy' };
    var newId = Number(q('SELECT max(' + t + '_id) AS m FROM ' + t)[0].m) + 1000, cols = q('PRAGMA table_info(' + t + ')').map(function (c) { return String(c.name).toLowerCase(); });
    var put = function (table, row, keyCol, keyVal, extra) { var r = Object.assign({}, row, extra || {}); r[keyCol] = keyVal; if ((table + '_uu') in r) r[table + '_uu'] = crypto.randomUUID();
      ['processed', 'posted', 'processing'].forEach(function (c) { if (c in r) r[c] = 'N'; });
      var ks = Object.keys(r).filter(function (k) { return cols0(table).indexOf(k) >= 0; }); db.run('INSERT INTO ' + table + ' (' + ks.join(',') + ') VALUES (' + ks.map(function () { return '?'; }).join(',') + ')', ks.map(function (k) { return r[k]; })); };
    var colCache = {}; function cols0(table) { return colCache[table] || (colCache[table] = q('PRAGMA table_info(' + table + ')').map(function (c) { return String(c.name).toLowerCase(); })); }
    try {
      var hx = { docstatus: 'DR', docaction: 'CO' }; if (cols.indexOf('documentno') >= 0) hx.documentno = String(src.documentno || '') + '-PEEK'; if (cols.indexOf('isapproved') >= 0) hx.isapproved = 'N';
      if (t === 'gl_journal' && cols.indexOf('gl_journalbatch_id') >= 0) hx.gl_journalbatch_id = null;   // a stand-alone copy: it must not join (and change the total of) the Completed batch it was copied from
      put(t, src, t + '_id', newId, hx);
      var kids = q("SELECT DISTINCT lower(ct.tablename) AS n FROM ad_tab a JOIN ad_table ct ON ct.ad_table_id=a.ad_table_id WHERE a.tablevel=1 AND a.ad_window_id IN (SELECT x.ad_window_id FROM ad_tab x JOIN ad_table y ON y.ad_table_id=x.ad_table_id WHERE lower(y.tablename)=? AND x.seqno=(SELECT min(seqno) FROM ad_tab z WHERE z.ad_window_id=x.ad_window_id))", [t]).map(function (r) { return r.n; });
      var lines = {};
      kids.forEach(function (ct) { var rows; try { rows = q('SELECT * FROM ' + ct + ' WHERE ' + t + '_id=?', [src[t + '_id']]); } catch (e) { return; }
        if (!rows.length || cols0(ct).indexOf(ct + '_id') < 0) return; var base = Number(q('SELECT max(' + ct + '_id) AS m FROM ' + ct)[0].m) + 1000;
        var gks = q("SELECT DISTINCT lower(ct2.tablename) AS n FROM ad_tab a2 JOIN ad_table ct2 ON ct2.ad_table_id=a2.ad_table_id WHERE a2.tablevel=2 AND a2.ad_window_id IN (SELECT x.ad_window_id FROM ad_tab x JOIN ad_table y ON y.ad_table_id=x.ad_table_id WHERE lower(y.tablename)=? AND x.seqno=(SELECT min(seqno) FROM ad_tab z WHERE z.ad_window_id=x.ad_window_id))", [t]).map(function (r) { return r.n; }).filter(function (g) { return cols0(g).indexOf(ct + '_id') >= 0 && cols0(g).indexOf(g + '_id') >= 0; });   // tab level 2 under THIS child (a batch's journals' lines)
        var gbase = {}; gks.forEach(function (g) { gbase[g] = Number(q('SELECT max(' + g + '_id) AS m FROM ' + g)[0].m) + 1000; });
        rows.forEach(function (row, i) { gks.forEach(function (g) { q('SELECT * FROM ' + g + ' WHERE ' + ct + '_id=?', [row[ct + '_id']]).forEach(function (r2) { var y = {}; y[ct + '_id'] = base + i; put(g, r2, g + '_id', gbase[g]++, y); lines[g] = (lines[g] || 0) + 1; }); }); });
        rows.forEach(function (row, i) { var x = {}; x[t + '_id'] = newId; if (cols0(ct).indexOf('docstatus') >= 0) { x.docstatus = 'DR'; if (cols0(ct).indexOf('docaction') >= 0) x.docaction = 'CO'; } put(ct, row, ct + '_id', base + i, x); }); lines[ct] = rows.length; });   // a copied child that is itself a document (a batch's journals) starts Drafted, as legacy CopyFrom leaves it
      return { id: newId, from: src[t + '_id'], lines: lines };
    } catch (e) { return { why: 'clone-failed:' + String(e && e.message).slice(0, 60).replace(/\s+/g, '_') }; }
  }
  // SWEEP (generic, X of N). N is READ FROM THE DICTIONARY, not listed here: the head table of every core window (the menu build_help_pack.js coreWindows reads) that has both a DocStatus and
  //   a DocAction column. Each judged document: the peek leaves the database byte-equal (P1) and its answer = the real Complete run right after it (P2). A table is JUDGED only when a peek ran:
  //   'no DocAction class in the twin' is a GAP (named for the parity lane, never counted as judged), and a table with no document and no legacy way to make one is NO-DRAFT. SW prints INCONCLUSIVE then.
  var BHP = require(path.join(ERP, 'tools', 'build_help_pack.js')), coreW = BHP.coreWindows();
  var DOCT = []; coreW.forEach(function (w) { var h = BHP.headTab(w); if (!h) return; var tn = String(h.tn).toLowerCase(); if (DOCT.indexOf(tn) >= 0) return;
    if (q("SELECT 1 x FROM ad_column WHERE ad_table_id=? AND columnname='DocStatus' AND isactive='Y'", [h.tb]).length && q("SELECT 1 x FROM ad_column WHERE ad_table_id=? AND columnname='DocAction' AND isactive='Y'", [h.tb]).length) DOCT.push(tn); }); DOCT.sort();
  say('§HELP_PEEK sweep dictionary core_windows=' + coreW.length + ' document_tables=' + DOCT.length + ' [' + DOCT.join(',') + ']');
  var swept = [], gaps = [], none = [];
  // the legacy route to a Move Confirmation draft: MMovement.prepareIt :355-356 createConfirmation() when the movement's DocType IsInTransit (MMovementConfirm.create). GardenWorld has no in-transit
  //   Material Movement type, so the witness sets that ONE flag on its own copy for the prepare and sets it back; nothing else is written by hand.
  function makeMovementConfirm() {
    var cl = cloneDraft('m_movement'); if (!cl.id) return { why: 'no-movement-to-copy:' + cl.why };
    var dt = q('SELECT d.c_doctype_id AS id, d.isintransit AS it FROM m_movement m JOIN c_doctype d ON d.c_doctype_id=m.c_doctype_id WHERE m.m_movement_id=?', [cl.id])[0];
    db.run("UPDATE c_doctype SET isintransit='Y' WHERE c_doctype_id=?", [dt.id]);
    var r = k.inTrx(S, { ws: 'peek-mkconfirm' }, function (trx) { var x = ML.processIt(trx, 'm_movement', cl.id, 'PR'); return { ok: !!x.ok, msg: x.msg }; });
    db.run('UPDATE c_doctype SET isintransit=? WHERE c_doctype_id=?', [dt.it, dt.id]);
    var cf = q("SELECT m_movementconfirm_id AS id FROM m_movementconfirm WHERE m_movement_id=? AND docstatus='DR'", [cl.id])[0];
    say('§HELP_PEEK sweep make m_movementconfirm via MMovement.prepareIt movement=' + cl.id + ' prepare_ok=' + r.ok + ' msg=' + JSON.stringify(r.msg || null) + ' confirm=' + (cf ? cf.id : null));
    return cf ? { id: cf.id, from: 'prepare of movement ' + cl.id, lines: cl.lines } : { why: 'prepare-made-no-confirmation:' + String(r.msg || '').slice(0, 60) };
  }
  DOCT.forEach(function (t) {
    var ids; try { ids = q('SELECT ' + t + '_id AS id FROM ' + t + " WHERE ad_client_id=11 AND docstatus IN ('DR','IN','IP') AND " + t + '_id NOT IN (?, ?) ORDER BY 1', [clean || 0, bad || 0]).map(function (r) { return r.id; }); }
    catch (e) { none.push(t + ':no-table'); return; }
    if (typeof ML.docActionFor === 'function' && !ML.docActionFor(t, q)) { gaps.push(t); say('§HELP_PEEK GAP ' + t + ': the twin has no DocAction class, so no peek (a twin gap for the parity lane, not counted as judged)'); return; }
    if (!ids.length) { var cl = t === 'm_movementconfirm' ? makeMovementConfirm() : cloneDraft(t); if (cl.id) { ids = [cl.id]; say('§HELP_PEEK sweep clone ' + t + ' from=' + cl.from + ' id=' + cl.id + ' lines=' + JSON.stringify(cl.lines)); } else { none.push(t + ':' + cl.why); return; } }
    swept.push(t);
    ids.forEach(function (id) {
      var ha = hash(), pp = DP.peek({ db: db, q: q, ML: ML, env: k.env(S), table: t, id: id, rules: RULES, text: words }), hb = hash();
      say('§HELP_PEEK sweep ' + t + ' id=' + id + ' ready=' + pp.ready + ' stop=' + pp.stop + ' keys=' + JSON.stringify(pp.blockers.map(function (b) { return b.key; })) + ' ms=' + pp.ms + (pp.stop === 'error' ? ' error=' + JSON.stringify(pp.blockers[pp.blockers.length - 1].msg).slice(0, 200) : ''));
      check('P1', ha === hb, 'sweep ' + t + ' ' + id + ': database unchanged', { ha: ha.slice(0, 12), hb: hb.slice(0, 12) });
      var rr = k.inTrx(S, { ws: 'peek-sweep' }, function (trx) { var x = ML.processIt(trx, t, id, 'CO'); return { ok: !!x.ok, msg: x.msg }; });
      var rk = rr.ok ? null : DP.keyOf(rr.msg || rr.error), pk = pp.blockers.length ? pp.blockers[0].key : null;
      check('P2', (pp.ready && rr.ok) || (pk !== null && pk === rk), 'sweep ' + t + ' ' + id + ': peek ' + (pp.ready ? 'Ready' : pk) + ' = real Complete ' + (rr.ok ? 'completed' : rk), { peek: pk, real: rk, msg: rr.msg });
    });
  });
  say('§HELP_PEEK sweep tables judged=' + swept.length + ' of ' + DOCT.length + ' [' + swept.join(',') + '] gap-no-class=[' + gaps.join(',') + '] no-draft=[' + none.join(',') + ']');
  C.SW = { j: swept.length, f: 0, partial: swept.length < DOCT.length ? (DOCT.length - swept.length) + ' of ' + DOCT.length + ' tables not peeked' : null };   // SW passes only when EVERY dictionary table was peeked; otherwise INCONCLUSIVE (named above), never PASS
  var pageClaims = [];
  if (process.env.PEEK_PAGE !== '0' && (!BREAK || BREAK === 'nomark' || BREAK === 'fixdocaction' || BREAK === 'nobg') && bad && past) {
    // the page's order: dated in the CLOSED past period (today open) and its customer on credit hold -> PeriodClosed (with a proved fix) then BPartnerCreditHold
    db.run("UPDATE c_bpartner SET socreditstatus='H' WHERE c_bpartner_id=118");
    var pageOrder = newOrder('page', past);
    // S3's line order: line 20 = Fertilizer#50 (product 136, attribute set 101) with no attribute instance, the set made instance-mandatory -> MOrder's ASI check names line 20
    db.run("UPDATE m_attributeset SET mandatorytype='Y' WHERE m_attributeset_id=101");
    db.run("UPDATE c_bpartner SET socreditstatus='O' WHERE c_bpartner_id=118");
    var lineOrder = newOrder('lines', null, 136);
    db.run("UPDATE c_bpartner SET socreditstatus='H' WHERE c_bpartner_id=118");
    if (pageOrder && lineOrder) pageClaims = await pagePart(db, pageOrder, past, lineOrder);
  }
  runFixRows();
  // runFixRows(): called AFTER the page half (its clones of Completed documents move the id allocator the page half's new orders use, 2026-11-25: both page orders got the same id)
  function runFixRows() {
  // ── FIX ROWS exercised (§19.21 'Named gaps': the rows below were cited but only c_order:PeriodClosed was ever hit) ──
  //   For EACH row of the lens's fix table: a made draft that really stops at that message (scenario = the document's own ONE value set past the check, or the ONE setting the check reads, both put back after),
  //   the peek lists the key, offers the row's fix PROVED (the same trial with the value no longer stops there), the peek leaves the database equal, the fix saved for real and the real Complete no longer stops at the key.
  //   A row no scenario reaches is printed 'not reached' and FX stays INCONCLUSIVE. red PEEK_BREAK=fixwrong (every row's column replaced by Description) -> FX FAIL
  var snapEV = [], FIXROWS = Object.keys(RULES.fix || {}).filter(function (x) { return x.indexOf(':') > 0; }), fxDone = [], fxMiss = [];
  var snapPC = q('SELECT c_periodcontrol_id AS id, periodstatus AS s FROM c_periodcontrol'), todayD = String(k.env(S).date).slice(0, 10), asId = (q('SELECT c_acctschema1_id AS a FROM ad_clientinfo WHERE ad_client_id=11')[0] || {}).a, snapAS = q('SELECT backdateday AS b FROM c_acctschema WHERE c_acctschema_id=?', [asId])[0];
  var periodOf = function (d) { return (q("SELECT p.c_period_id AS id FROM c_period p JOIN c_year y ON y.c_year_id=p.c_year_id JOIN c_calendar c ON c.c_calendar_id=y.c_calendar_id WHERE c.ad_client_id=11 AND date(p.startdate)<=date(?) AND date(p.enddate)>=date(?)", [d, d])[0] || {}).id; };
  var rulesFx = BREAK === 'fixwrong' ? Object.assign({}, RULES, { fix: Object.keys(RULES.fix).reduce(function (o, x) { o[x] = x.indexOf(':') > 0 ? Object.assign({}, RULES.fix[x], { column: 'Description', also: [], value: { today: true } }) : RULES.fix[x]; return o; }, {}) }) : RULES;
  var PASTD = '2026-10-15 00:00:00', BACKD = (function () { var t = new Date(todayD + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() - 30); return t.toISOString().slice(0, 10) + ' 00:00:00'; })();
  FIXROWS.forEach(function (row) {
    var t = row.split(':')[0], key = row.split(':')[1], fx = RULES.fix[row], cl = cloneDraft(t);
    if (!cl.id) { fxMiss.push(row + ':' + cl.why); say('§HELP_PEEK fixrow ' + row + ' not reached: no draft (' + cl.why + ')'); return; }
    var id = cl.id, cols0 = q('PRAGMA table_info(' + t + ')').map(function (c) { return String(c.name).toLowerCase(); }), setCols = [fx.column].concat(fx.also || []).map(function (c) { return c.toLowerCase(); }), made = null;
    db.run("UPDATE c_periodcontrol SET periodstatus='O'"); db.run('UPDATE c_acctschema SET backdateday=? WHERE c_acctschema_id=?', [snapAS ? snapAS.b : 0, asId]);
    if (key === 'PeriodClosed') {           // the document's date column sits in a CLOSED period (every document base type of that period closed, today's period open)
      db.run("UPDATE c_periodcontrol SET periodstatus='C' WHERE c_period_id=?", [periodOf(PASTD)]);
      setCols.forEach(function (c) { if (cols0.indexOf(c) >= 0) db.run('UPDATE ' + t + ' SET ' + c + '=? WHERE ' + t + '_id=?', [PASTD, id]); }); made = 'date ' + PASTD.slice(0, 10) + ' in a closed period';
    } else if (key === 'BackDateTrxNotAllowed') {   // MAcctSchema BackDateDay (MMovement :305-309 / MAcctSchema.isBackDateTrxAllowed): the schema forbids dates older than 7 days, the document is 30 days old (its period open)
      db.run('UPDATE c_acctschema SET backdateday=7 WHERE c_acctschema_id=?', [asId]);
      setCols.forEach(function (c) { if (cols0.indexOf(c) >= 0) db.run('UPDATE ' + t + ' SET ' + c + '=? WHERE ' + t + '_id=?', [BACKD, id]); }); made = 'date ' + BACKD.slice(0, 10) + ' older than BackDateDay=7';
    } else if (key === 'ControlAmtError') { // MJournal / MJournalBatch.prepareIt: ControlAmt is neither 0 nor the total debit -> the document's own TotalDr + 1
      var tot = Number(q('SELECT totaldr AS d FROM ' + t + ' WHERE ' + t + '_id=?', [id])[0].d || 0); db.run('UPDATE ' + t + ' SET controlamt=? WHERE ' + t + '_id=?', [tot + 1, id]); made = 'ControlAmt ' + (tot + 1) + ' vs TotalDr ' + tot;
      // the seed's Completed journals post to doc-controlled accounts (MJournal.prepareIt refuses that at the line, BEFORE the control amount is read, :60 then :68): the accounts of THIS copy's lines accept posting for the scenario, put back after
      var acc = q('SELECT DISTINCT account_id AS a FROM gl_journalline WHERE ' + (t === 'gl_journal' ? 'gl_journal_id=?' : 'gl_journal_id IN (SELECT gl_journal_id FROM gl_journal WHERE gl_journalbatch_id=?)'), [id]).map(function (r) { return r.a; }).filter(function (a) { return a != null; });
      acc.forEach(function (a) { var ev = q('SELECT isdoccontrolled AS d FROM c_elementvalue WHERE c_elementvalue_id=?', [a])[0]; if (ev) { snapEV.push({ id: a, d: ev.d }); db.run("UPDATE c_elementvalue SET isdoccontrolled='N' WHERE c_elementvalue_id=?", [a]); } }); made += ' (' + acc.length + ' account(s) accept posting)';
    }
    if (!made) { fxMiss.push(row + ':no-scenario'); say('§HELP_PEEK fixrow ' + row + ' not reached: no scenario for key ' + key); return; }
    var h1 = hash(), pk = DP.peek({ db: db, q: q, ML: ML, env: k.env(S), table: t, id: id, rules: rulesFx, text: words }), h2 = hash(), b = pk.blockers.filter(function (x) { return x.key === key; })[0];
    say('§HELP_PEEK fixrow ' + row + ' made=' + JSON.stringify(made) + ' id=' + id + ' keys=' + JSON.stringify(pk.blockers.map(function (x) { return x.key; })) + ' fix=' + JSON.stringify(b && b.fix ? { column: b.fix.column, value: b.fix.value, proved: b.fix.proved } : null) + ' unproved=' + pk.unproved);
    check('FX', h1 === h2, 'fixrow ' + row + ': the peek that proved the fix left the database unchanged', {});
    if (!b) { fxMiss.push(row + ':not-reached(' + pk.blockers.map(function (x) { return x.key; }).join('|') + ')'); say('§HELP_PEEK fixrow ' + row + ' not reached: the peek did not list ' + key); return; }
    check('FX', !!b.fix && b.fix.column === fx.column && /cleared|completes/.test(b.fix.proved), 'fixrow ' + row + ': the fix ' + fx.column + ' is offered and proved (' + (b.fix && b.fix.proved) + ')', b.fix || null);
    if (b.fix) {
      var sv = k.inTrx(S, { ws: 'peek-fixrow' }, function (trx) { var d = trx.get(t, id), ch = {}; ch[b.fix.column.toLowerCase()] = b.fix.value; (b.fix.also || []).forEach(function (c) { ch[c.toLowerCase()] = b.fix.value; }); return ML.save(trx, t, d, ch); });
      var rf = k.inTrx(S, { ws: 'peek-fixrow-co' }, function (trx) { var x = ML.processIt(trx, t, id, 'CO'); return { ok: !!x.ok, msg: x.msg }; }), rkey = rf.ok ? null : DP.keyOf(rf.msg);
      say('§HELP_PEEK fixrow ' + row + ' applied save=' + sv.ok + ' then real Complete ' + (rf.ok ? 'completed' : 'key=' + rkey));
      check('FX', sv.ok && rkey !== key, 'fixrow ' + row + ': the fix saved, the real Complete no longer stops at ' + key + ' (' + (rf.ok ? 'completed' : rkey) + ')', { save: sv, rf: rf });
      if (sv.ok && rkey !== key && /cleared|completes/.test(b.fix.proved)) fxDone.push(row); else fxMiss.push(row + ':fix-did-not-hold');
    } else fxMiss.push(row + ':no-fix-offered');
  });
  snapPC.forEach(function (r) { db.run('UPDATE c_periodcontrol SET periodstatus=? WHERE c_periodcontrol_id=?', [r.s, r.id]); }); snapEV.forEach(function (r) { db.run('UPDATE c_elementvalue SET isdoccontrolled=? WHERE c_elementvalue_id=?', [r.d, r.id]); }); if (asId) db.run('UPDATE c_acctschema SET backdateday=? WHERE c_acctschema_id=?', [snapAS ? snapAS.b : null, asId]);
  say('§HELP_PEEK fixrows exercised=' + fxDone.length + ' of ' + FIXROWS.length + ' [' + fxDone.join(',') + '] not-exercised=[' + fxMiss.join(',') + ']');
  C.FX = C.FX || { j: 0, f: 0 }; if (fxDone.length < FIXROWS.length) C.FX.partial = (FIXROWS.length - fxDone.length) + ' of ' + FIXROWS.length + ' fix rows not exercised';
  }
  var vs = ['P1', 'P2', 'P3', 'P4', 'P5', 'F1', 'F2', 'F3', 'SW', 'FX'].concat(pageClaims).map(verdict); if (C.RED) vs.push(verdict('RED'));
  var all = vs.every(function (v) { return v === 'PASS'; }) ? 'PASS' : vs.some(function (v) { return v === 'FAIL'; }) ? 'FAIL' : 'INCONCLUSIVE';
  say('§HELP_PEEK VERDICT ' + all + (BREAK ? ' (red ' + BREAK + ')' : ''));
  process.exitCode = all === 'PASS' ? 0 : 1;

  // ── PAGE half (S1b) ──
  async function pagePart(db, orderId, pastDate, lineOrderId) {
    var os = require('os'), H = require(path.join(ERP, '..', 'common', 'help', 'tests', '_hq.js'));
    var tmpSeed = path.join(os.tmpdir(), 'help_peek_seed_' + process.pid + '.db'); fs.writeFileSync(tmpSeed, Buffer.from(db.export()));   // the node kernel's DB with the broken order (period closed + credit hold) committed
    var over = { '/erp/ad_seed.db': tmpSeed };
    var brk = BREAK === 'fixdocaction' || BREAK === 'nobg' ? BREAK : null;
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
      await pg.evaluate(async function (b) { if (b) globalThis.__FOPS_BREAK = b; var r = window.PluginEngine._reg().system; await r.installBundle(location.origin + '/erp/plugins/friendly_ops.mjs'); await r.startBundle('org.kernel.friendly-ops'); }, brk);
      await openOrder();
      var onBtn = await wait(function () { return !!document.querySelector('[data-lens-panel="friendly-ops:peek"]'); });
      say('§HELP_PEEK page lens on button=' + onBtn + ' ' + (logsFrom(0, /^§OPS-LENS panel window=/).pop() || ''));
      check('P8', onBtn, 'lens on: the Check button is in the Help panel', {});
      var before = await pg.evaluate(function (id) { var R = window.__tipRead.rows; return JSON.stringify([R('SELECT docstatus FROM c_order WHERE c_order_id=' + id), R("SELECT socreditstatus FROM c_bpartner WHERE c_bpartner_id=118"), R("SELECT count(*) AS n FROM c_periodcontrol WHERE periodstatus='O' AND ad_client_id=11")]); }, orderId);
      var n1 = P.logs.length;
      await pg.click('[data-lens-panel="friendly-ops:peek"]');
      for (var wi = 0; wi < 40 && !logsFrom(n1, /^§HELP_PEEK marks /).length; wi++) await pg.waitForTimeout(250);   // the Check's own run (a background check may already have filled the panel)
      await pg.waitForTimeout(300);
      var peekLine = logsFrom(n1, /^§HELP_PEEK table=/).shift() || '', markLine = logsFrom(n1, /^§HELP_PEEK marks /).pop() || '', writes = logsFrom(n1, /^§CRUD-PERSIST|^§CRUD commit|^§KRN-COMMIT/);
      var after = await pg.evaluate(function (id) { var R = window.__tipRead.rows; return JSON.stringify([R('SELECT docstatus FROM c_order WHERE c_order_id=' + id), R("SELECT socreditstatus FROM c_bpartner WHERE c_bpartner_id=118"), R("SELECT count(*) AS n FROM c_periodcontrol WHERE periodstatus='O' AND ad_client_id=11")]); }, orderId);
      var shown = await pg.evaluate(function () { var b = document.getElementById('idmp-howto-peek'); return { text: b.innerText.replace(/\s+/g, ' ').slice(0, 400), keys: Array.prototype.map.call(b.querySelectorAll('li[data-peek-key]'), function (x) { return x.getAttribute('data-peek-key'); }),
        marked: Array.prototype.map.call(document.querySelectorAll('.peek-bad'), function (x) { return (x.getAttribute('data-ad-column') || x.textContent.trim()) + ':' + x.getAttribute('data-peek'); }) }; });
      say('§HELP_PEEK page ' + peekLine); say('§HELP_PEEK page ' + markLine); say('§HELP_PEEK page panel ' + JSON.stringify(shown));
      check('PP', shown.keys[0] === 'PeriodClosed' && shown.keys[1] === 'BPartnerCreditHold', 'the panel lists PeriodClosed then BPartnerCreditHold', shown);
      check('PP', before === after && !writes.length, 'nothing written by the peek (order, customer, period control unchanged; no commit line)', { before: before, after: after, writes: writes.slice(0, 3) });
      var mk = /on_screen=(\d+)/.exec(markLine), asked = /asked=(\d+)/.exec(markLine);
      check('P5p', !!mk && Number(mk[1]) > 0 && shown.marked.some(function (m) { return /^dateordered:PeriodClosed$/i.test(m); }) && shown.marked.some(function (m) { return /^c_bpartner_id:BPartnerCreditHold$/i.test(m); }), 'the fields are marked on screen (' + (mk ? mk[1] : 0) + ' of ' + (asked ? asked[1] : '?') + ')', shown.marked);
      // S2 ▶ Fix: PF1 offered (proved), PF2 applied as typed + a fresh peek no longer lists PeriodClosed + nothing saved + no DocAction ran, PF3 Undo Changes takes it back
      var fixBtn = await pg.evaluate(function () { var b = document.querySelector('#idmp-howto-peek [data-lens-run="friendly-ops:fix"]'); return b ? b.parentNode.innerText.replace(/\s+/g, ' ') : null; });
      say('§HELP_PEEK page fix offered ' + JSON.stringify(fixBtn));
      check('PF1', !!fixBtn && /Date Ordered/.test(fixBtn), 'the ▶ Fix is offered for Date Ordered (the field\'s own name)', fixBtn);
      var dbDate = function () { return pg.evaluate(function (id) { return window.__tipRead.rows('SELECT dateordered AS d FROM c_order WHERE c_order_id=' + id)[0].d; }, orderId); };
      var d0 = await dbDate(), n3 = P.logs.length;
      await pg.evaluate(function () { var b = document.querySelector('#idmp-howto-peek [data-lens-run="friendly-ops:fix"]'); if (b) b.click(); });
      await wait(function () { var b = document.getElementById('idmp-howto-peek'); return !!b && /Fixed:|Failed:/.test(b.innerText); });
      await pg.waitForTimeout(800);
      var setLine = logsFrom(n3, /^§HELP_PEEK set col=/).pop() || '', repeek = logsFrom(n3, /^§HELP_PEEK table=/).pop() || '', docAct = logsFrom(n3, /^§OPS-LENS docAction=|^§MODEL-DOCACTION|^§CRUD process /);
      var formVal = await pg.evaluate(function () { var e = document.querySelector('#idmp-inline-mount [data-col="dateordered"]'); return e ? e.value : null; }), d1 = await dbDate();
      say('§HELP_PEEK page fix ' + setLine + ' | ' + repeek + ' | form=' + formVal + ' db=' + d1 + ' docaction_lines=' + docAct.length);
      check('PF2', /ok=true/.test(setLine) && /keys=\["BPartnerCreditHold"\]/.test(repeek) && String(d1) === String(d0) && !docAct.length, '▶ typed Date Ordered, the new check lists only the credit hold, nothing saved, no DocAction ran', { setLine: setLine, repeek: repeek, d0: d0, d1: d1, docAct: docAct.slice(0, 2) });
      await pg.click('#idmp-toolbar [data-tb="ignore"]').catch(function () {}); await pg.waitForTimeout(1200);
      var formBack = await pg.evaluate(function () { var e = document.querySelector('#idmp-inline-mount [data-col="dateordered"]'); return e ? e.value : null; });
      say('§HELP_PEEK page undo form=' + formBack + ' (was ' + formVal + ', saved ' + String(d0).slice(0, 10) + ')');
      check('PF3', formBack != null && String(formBack).slice(0, 10) === String(pastDate).slice(0, 10), 'Undo Changes takes the fix back to the saved date', { formBack: formBack });
      // P6 Show-it
      var n2 = P.logs.length;
      await pg.evaluate(function () { var a = document.querySelector('li[data-peek-key="BPartnerCreditHold"] a[data-peek-show]'); if (a) a.click(); });
      await wait(function () { return /Business Partner/.test((document.getElementById('idmp-tabstrip') || {}).innerText || ''); });
      var z = logsFrom(n2, /^§ZOOM window=/).pop() || '';
      say('§HELP_PEEK page show ' + z);
      check('P6', /^§ZOOM window=123 c_bpartner\.\S+=118 .*landed=true/i.test(z), 'Open on the credit blocker lands on Business Partner 118', z);
      // ── S3 background check ──
      var bgWait = async function (from) { for (var i = 0; i < 40 && !logsFrom(from, /^§HELP_PEEK bg table=/).length; i++) await pg.waitForTimeout(250); return logsFrom(from, /^§HELP_PEEK bg table=/).pop() || ''; };
      var badge = function () { return pg.evaluate(function () { var t = document.getElementById('idmp-pill-trigger'); if (!t) return 'no-trigger'; var c = getComputedStyle(t, '::after').content; return c && c !== 'none' && c !== 'normal' ? c.replace(/"/g, '') : null; }); };   // what the eye sees on the ⋯
      var n4 = P.logs.length; await openOrder();
      var bg1 = await bgWait(n4), bd1 = await badge();
      say('§HELP_PEEK page S3 open ' + bg1 + ' badge=' + bd1);
      if (process.env.PEEK_LOGDUMP) logsFrom(n4, /^§HELP_PEEK (badge|bg)|^§OPS-LENS panel window|^§PILL|^§IDMP-PILL/).forEach(function (l) { say('   DUMP ' + l.slice(0, 160)); });
      check('B1', /count=2 /.test(bg1) && bd1 === '2', 'opening the order checks it by itself: count 2 on the ? door, no Check pressed', { bg: bg1, badge: bd1 });
      check('B5', /budget=\d+ ok/.test(bg1), 'the background check is within its budget (' + ((/ms=(\d+)/.exec(bg1) || [])[1]) + ' ms)', bg1);
      await pg.evaluate(function () { var b = document.querySelector('#idmp-howto-peek [data-lens-run="friendly-ops:fix"]'); if (b) b.click(); }); await pg.waitForTimeout(1200);
      var n5 = P.logs.length; await pg.click('#idmp-toolbar [data-tb="save"]').catch(function () {}); 
      var bg2 = await bgWait(n5), bd2 = await badge();
      say('§HELP_PEEK page S3 after ▶ + Save ' + bg2 + ' badge=' + bd2 + ' save=' + (logsFrom(n5, /^§CRUD validate key=c_order|^§CRUD-PERSIST key=c_order/).pop() || 'none').slice(0, 120));
      check('B2', /count=1 /.test(bg2) && bd2 === '1', 'after ▶ Fix and Save the background check runs again: count 1 (the credit hold)', { bg: bg2, badge: bd2 });
      var n6 = P.logs.length; await pg.click('[data-lens-panel="friendly-ops:bg"]').catch(function () {}); await pg.waitForTimeout(600); await openOrder(); await pg.waitForTimeout(800);
      var bd3 = await badge(), bg3 = logsFrom(n6, /^§HELP_PEEK bg table=/);
      say('§HELP_PEEK page S3 switched off badge=' + bd3 + ' bg_lines=' + bg3.length);
      check('B3', bd3 === null && !bg3.length, 'switched off: no count, no background check on reopening', { badge: bd3, bg: bg3 });
      await pg.click('[data-lens-panel="friendly-ops:bg"]').catch(function () {}); await pg.waitForTimeout(400);
      var n7 = P.logs.length; await pg.evaluate(function (id) { window.IdmpHost.zoom(143, null, id); }, lineOrderId); await pg.waitForTimeout(1500);
      var bg4 = await bgWait(n7), lk = await pg.evaluate(function () { var a = document.querySelector('#idmp-howto-peek a[data-peek-lines]:not([data-peek-lines=""])'); return a ? a.getAttribute('data-peek-lines') + '|' + a.textContent : null; });
      say('§HELP_PEEK page S3 line order ' + bg4 + ' link=' + lk);
      await pg.evaluate(function () { var a = Array.prototype.find.call(document.querySelectorAll('#idmp-howto-peek a[data-peek-lines]'), function (x) { return /Show lines with issues/.test(x.textContent); }); if (a) a.click(); }); await pg.waitForTimeout(1500);
      var flt = logsFrom(n7, /^§HELP_PEEK lines-filter /).pop() || '', rowsShown = await pg.evaluate(function () { return document.querySelectorAll('.idmp-grid tbody tr[data-ad-record]').length; });
      say('§HELP_PEEK page S3 ' + flt + ' grid_rows=' + rowsShown);
      check('B4', !!lk && /^20\|/.test(lk) && /in \[20\]/.test(flt) && rowsShown === 1, 'Show lines with issues: the lines tab shows only line 20', { link: lk, filter: flt, rows: rowsShown });
      if (P.errs.length) say('§HELP_PEEK page errors ' + JSON.stringify(P.errs.slice(0, 5)));
    } finally { await P.close(); try { fs.unlinkSync(tmpSeed); } catch (e) {} }
    return ['D1', 'D2', 'P8', 'PP', 'P5p', 'PF1', 'PF2', 'PF3', 'P6', 'B1', 'B2', 'B3', 'B4', 'B5'];
  }
})().catch(function (e) { _log('§HELP_PEEK VERDICT FAIL threw ' + (e && e.stack || e)); process.exitCode = 1; });
