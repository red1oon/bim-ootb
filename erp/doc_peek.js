// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// doc_peek.js - the host seam previewComplete (bim-compiler prompts/VOCAB_MESSAGE_CATALOG.md §19.21, Witness: W-HELP-PEEK).
//   "What would stop Complete on THIS document, and where?" answered by RUNNING the document's own Complete (model_layer.js processIt, legacy
//   DocumentEngine.processIt :301-360) in a trial that is always thrown away:
//     - the model writes go to a Trx that is never committed (model_layer.js Trx: ops + pend, observers only on commit);
//     - the checks that read the database directly (e.g. model_trade.js periodOpen reads c_periodcontrol with trx.q) are looked past with the
//       lens's ASSUMPTION rows, run as SQL inside one SQLite transaction that is always rolled back (finally), so the database is byte-equal after.
//   Legacy stops at the first refusal; the peek records it, applies that message's assumption (if the lens has one) and runs Complete again, until
//   Complete passes or a blocker has no assumption (then the list says more checks may follow it).
//   It names NO table, window or message: which column a message is about, and what to assume, are the caller's DATA (the friendly-ops lens rows).
//   Never saves, never posts for real, never runs a process: the trial is dropped.
(function (root) {
  'use strict';

  // the message key legacy wrote: '@PeriodClosed@', '@FillMandatory@ M_Shipper_ID', '@BPartnerCreditHold@ - @TotalOpenBalance@=…', or a literal ('Cannot reserve Stock -> …')
  function keyOf(msg) {
    var s = String(msg == null ? '' : msg).trim().replace(/^model threw:\s*/, ''), m = /^@([A-Za-z0-9_]+)@/.exec(s);
    if (m) return m[1];
    return s.split(/\s+->\s+|:\s/)[0].trim();
  }
  // a column the message names itself (MOrder :1555 '@FillMandatory@@M_Shipper_ID@' -> the twin writes '@FillMandatory@ M_Shipper_ID')
  function namedColumn(msg) {
    var m = /^@FillMandatory@\s*@?([A-Za-z0-9_]+)@?/.exec(String(msg || ''));
    return m ? m[1] : null;
  }
  // a line the message names itself ('Line No 20 …', '@Line@ 20 …')
  function namedLine(msg) {
    var m = /(?:@Line@|Line No\.?)\s*#?\s*(\d+)/i.exec(String(msg || ''));
    return m ? Number(m[1]) : null;
  }
  // @Column@ in an assumption's SQL -> that column of the document as it stands in the trial (read with q, the database view)
  function bind(sql, doc) {
    var params = [];
    var text = String(sql).replace(/@([A-Za-z0-9_]+)@/g, function (_, c) { var v = doc[c.toLowerCase()]; params.push(v === undefined ? null : v); return '?'; });
    return { text: text, params: params };
  }
  function fieldOf(rules, table, key, msg) {
    var col = namedColumn(msg), line = namedLine(msg);
    if (col) return { column: col, level: line != null ? 'line' : 'header', line: line, source: 'message' };
    var f = (rules.field || {})[table + ':' + key] || (rules.field || {})[key];
    if (f) return { column: f.column || null, via: f.via || null, level: f.level || (line != null ? 'line' : 'header'), line: line, source: 'row', cite: f.cite || null };
    if (line != null) return { column: null, level: 'line', line: line, source: 'message' };
    return null;
  }

  // peek(o): o = { db (sql.js Database), q(sql, params) -> rows, ML (model_layer), env (the session env), table, id, rules, text(msg) -> words, max }
  //   returns { ready, blockers: [{ key, msg, words, field, assumed }], stop: null | 'no-assumption' | 'repeat' | 'max' | 'error', rounds, ms }
  function peek(o) {
    var t0 = Date.now(), table = String(o.table).toLowerCase(), rules = o.rules || {}, max = o.max || 12, out = [], stop = null, ready = false, rounds = 0, seen = {};
    if (typeof o.ML.docActionFor === 'function' && !o.ML.docActionFor(table, o.q)) return { ready: false, blockers: [], stop: 'no-class', rounds: 0, ms: Date.now() - t0 };   // the twin has no DocAction class for it: no peek (said, not faked)
    var idc = table + '_id', docRow = function () { return o.q('SELECT * FROM ' + table + ' WHERE ' + idc + '=?', [o.id])[0] || {}; };
    // BEGIN … ROLLBACK: nothing is ever committed. (A SAVEPOINT released after ROLLBACK TO commits an empty transaction, which still moves the file
    //   header's change counter: W-HELP-PEEK P1 caught it, 2026-11-24.) Inside a caller's open transaction, fall back to a savepoint rolled back to.
    var mode = 'txn'; try { o.db.run('BEGIN'); } catch (e) { mode = 'sp'; o.db.run('SAVEPOINT doc_peek'); }
    try {
      for (; rounds < max; rounds++) {
        var trx = new o.ML.Trx(o.q, Object.assign({}, o.env)), r;
        try { r = o.ML.processIt(trx, table, o.id, 'CO'); }
        catch (e) {   // legacy throws some refusals (MPeriod.testPeriodOpen -> PeriodClosedException): a thrown message that starts with a key is a blocker like any other
          var em = String(e && e.message || e); r = { ok: false, msg: em };
          if (!/^@[A-Za-z0-9_]+@/.test(em)) { r.msg = 'model threw: ' + em; stop = 'error'; }
        }
        if (r.ok) { ready = out.length === 0; break; }
        var key = keyOf(r.msg);
        if (seen[key]) { stop = 'repeat'; break; }   // an assumption that did not clear its own check: never loop
        seen[key] = true;
        var b = { key: key, msg: r.msg == null ? '' : String(r.msg), words: o.text ? o.text(r.msg) : String(r.msg), field: fieldOf(rules, table, key, r.msg), assumed: false };
        out.push(b);
        if (stop === 'error') break;
        var as = (rules.assume || {})[table + ':' + key] || (rules.assume || {})[key];
        if (!as || !as.length) { stop = 'no-assumption'; break; }
        var doc = docRow();
        as.forEach(function (a) { var x = bind(a.sql, doc); o.db.run(x.text, x.params); });
        b.assumed = true;
      }
      if (rounds >= max) stop = 'max';
    } finally {
      if (mode === 'txn') o.db.run('ROLLBACK'); else { o.db.run('ROLLBACK TO doc_peek'); o.db.run('RELEASE doc_peek'); }
    }
    return { ready: ready, blockers: out, stop: stop, rounds: rounds + (stop === 'max' ? 0 : 1), ms: Date.now() - t0 };
  }

  var api = { peek: peek, keyOf: keyOf, namedColumn: namedColumn, namedLine: namedLine };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.DocPeek = api;
})(typeof window !== 'undefined' ? window : globalThis);
