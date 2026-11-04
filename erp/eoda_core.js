// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — eoda_core.js: the PURE half of the branch POS admin and the end-of-day batch. READ THE LOG (§EODA_* lines of erp/tests/witness_eoda.js), exit codes are not evidence.
// Implementing bim-compiler prompts/POS_PLUGIN_LOCAL_FIRST.md §26 (BRANCH POS ADMIN + EODA) - Witness: W-EODA-AGG / -GATE / -PARTIAL / -RELAY (erp/tests/witness_eoda.js).
// What lives here: the hand-off rows a till writes at Close Cash (POS_TillHandoff, branch-local), the fold of them at the branch admin, the branch-day STATEMENT (POS_BranchDayStatement, the declaration HQ checks),
//   and check(): the completeness test head office's Branch Day Close gate runs a batch through. No DOM, no Date.now / Math.random (the caller passes the day and the ids). All money is in cents.
// No legacy table fits the statement (ad_table has no daily-declaration table: C_BankStatement is a bank import, C_POSPayment is per order): it is a twin-local row kind, stated as such (§26.2).
'use strict';
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.EodaCore = factory();
})(typeof window !== 'undefined' ? window : globalThis, function () {
  var KEY = /^(.*)-([A-Z])(\d+)$/;                                                   // till_core.js keyPrefix: <OrgValue>-<TillUserValue>-<S|R|P><n>
  function parseKey(k) { var m = KEY.exec(String(k || '')); return m ? { till: m[1], type: m[2], n: Number(m[3]) } : null; }
  var cents = function (v) { return Math.round(Number(v || 0)); };
  var dayOf = function (d) { return String(d || '').slice(0, 10); };

  // the tender names the Z uses (till_core.js zTotals): sale tab names; a refund key (-R) uses the refund tab names
  var TN = { X: 'cash', K: 'cheque', C: 'magcard', A: 'bank' }, TR = { X: 'cashrefund', K: 'chequerefund', C: 'magcardrefund' };
  function tenderTotals(payments) {   // [{documentno, tendertype, payamt}] -> { name: cents }
    var out = {};
    (payments || []).forEach(function (p) { var ref = /-R\d+$/.test(p.documentno || ''), n = (ref ? TR : TN)[p.tendertype] || TN[p.tendertype] || p.tendertype; out[n] = (out[n] || 0) + Math.round(Number(p.payamt || 0) * 100 + (Number(p.payamt) < 0 ? -1e-7 : 1e-7)); });
    return out;
  }
  function addMaps(a, b) { var o = {}; [a, b].forEach(function (m) { Object.keys(m || {}).forEach(function (k) { o[k] = (o[k] || 0) + Number(m[k]); }); }); return o; }
  function addTaxes(a, b) { var o = {}; [a, b].forEach(function (m) { Object.keys(m || {}).forEach(function (k) { var s = o[k] = o[k] || { base: 0, amount: 0 }; s.base += cents(m[k].base); s.amount += cents(m[k].amount); }); }); return o; }
  function nz(m) { var o = {}; Object.keys(m || {}).forEach(function (k) { if (Number(m[k])) o[k] = Number(m[k]); }); return o; }
  function nzTax(m) { var o = {}; Object.keys(m || {}).forEach(function (k) { if (cents(m[k].base) || cents(m[k].amount)) o[k] = { base: cents(m[k].base), amount: cents(m[k].amount) }; }); return o; }

  // series of a key list -> { S: {first, last, count} } (count = distinct keys of that type letter)
  function series(keys) {
    var seen = {}, out = {};
    (keys || []).forEach(function (k) { var p = parseKey(k); if (!p || seen[k]) return; seen[k] = 1; var s = out[p.type] = out[p.type] || { first: p.n, last: p.n, count: 0 }; s.count++; if (p.n < s.first) s.first = p.n; if (p.n > s.last) s.last = p.n; });
    return out;
  }
  // numbers missing between 1 and the highest of each series of ONE till (the same notion as the HQ gate's GAP)
  function gaps(keys) {
    var have = {}, hi = {}, out = [];
    (keys || []).forEach(function (k) { var p = parseKey(k); if (!p) return; (have[p.type] = have[p.type] || {})[p.n] = 1; hi[p.type] = Math.max(hi[p.type] || 0, p.n); });
    Object.keys(hi).sort().forEach(function (t) { for (var n = 1; n <= hi[t]; n++) if (!have[t][n]) out.push(t + n); });
    return out;
  }

  // ── the till side (§26.3): one T row per ticket key of the shift (its I_Order lines + I_Payment tenders as the till deposited them), one Z row per business day of the shift
  var O_COLS = ['ad_client_id', 'ad_org_id', 'isactive', 'i_isimported', 'issotrx', 'doctypename', 'documentno', 'm_product_id', 'qtyordered', 'priceactual', 'c_uom_id', 'dateordered', 'description', 'linedescription'];
  var P_COLS = ['ad_client_id', 'ad_org_id', 'isactive', 'i_isimported', 'isreceipt', 'documentno', 'doctypename', 'iso_code', 'payamt', 'tendertype', 'datetrx', 'description', 'bpartnervalue', 'isapproved', 'r_pnref', 'r_authcode', 'r_result', 'r_respmsg'];
  function pick(r, cols) { var o = {}; cols.forEach(function (c) { if (r[c] != null) o[c] = r[c]; }); return o; }
  // o { tillKey, seq, start, end, client, org, orders: [i_order rows of the shift], payments: [i_payment rows of the shift], zOf(ordersOfDay, paymentsOfDay) -> TillCore.zTotals result }
  function handoffRows(o) {
    var keys = [], byKey = {}, base = function (f) { f.ad_client_id = o.client; f.ad_org_id = o.org; f.isactive = 'Y'; f.tillkey = o.tillKey; f.shiftseq = o.seq; return f; };
    (o.orders || []).forEach(function (r) { var k = r.documentno; if (!byKey[k]) { byKey[k] = { o: [], p: [] }; keys.push(k); } byKey[k].o.push(pick(r, O_COLS)); });
    (o.payments || []).forEach(function (r) { var k = r.documentno; if (!byKey[k]) { byKey[k] = { o: [], p: [] }; keys.push(k); } byKey[k].p.push(pick(r, P_COLS)); });
    var rows = keys.map(function (k) { return base({ kind: 'T', documentno: k, body: JSON.stringify(byKey[k]) }); });
    var days = {}; if (!keys.length && o.day) days[o.day] = [];                       // an empty shift still declares its close (the admin must see the till as closed)
    keys.forEach(function (k) { var b = byKey[k], d = dayOf((b.o[0] || b.p[0] || {}).dateordered || (b.o[0] || b.p[0] || {}).datetrx); (days[d] = days[d] || []).push(k); });
    Object.keys(days).sort().forEach(function (d) {
      var os = [], ps = [], ks = days[d];
      ks.forEach(function (k) { os = os.concat(byKey[k].o); ps = ps.concat(byKey[k].p); });
      var withLines = {}; os.forEach(function (r) { withLines[r.documentno] = 1; });
      var z = o.zOf(os, ps.filter(function (p) { return withLines[p.documentno]; }));
      rows.push(base({ kind: 'Z', documentno: d, body: JSON.stringify({ seq: o.seq, start: o.start, end: o.end, day: d, ok: z.ok !== false, tickets: z.tickets, units: z.units, gross: cents(z.gross), net: cents(z.net), tax: cents(z.tax),
        taxes: nzTax(z.taxes), tenders: nz(tenderTotals(ps.map(function (p) { return { documentno: p.documentno, tendertype: p.tendertype, payamt: p.payamt }; }))), keys: ks.slice().sort() }) }));
    });
    return rows;
  }

  // ── the admin side (§26.4): fold the hand-off rows (any order, duplicates ignored) into tills -> keys / Zs
  function fold(rows) {
    var tills = {};
    (rows || []).forEach(function (r) {
      var t = tills[r.tillkey] = tills[r.tillkey] || { tillKey: r.tillkey, keys: {}, zs: {} };
      var body; try { body = JSON.parse(r.body); } catch (e) { return; }
      if (r.kind === 'T') { var b0 = body.o[0] || body.p[0] || {}; t.keys[r.documentno] = { key: r.documentno, day: dayOf(b0.dateordered || b0.datetrx), shift: Number(r.shiftseq), o: body.o, p: body.p }; }
      else if (r.kind === 'Z') t.zs[r.shiftseq + '|' + r.documentno] = body;
    });
    return tills;
  }
  // the declaration of ONE till for ONE business day = the sum of its Z declarations of that day (what the till declared), with the series from the Z key lists
  function declare(till, day) {
    var zs = Object.keys(till.zs).map(function (k) { return till.zs[k]; }).filter(function (z) { return z.day === day; });
    var d = { tillKey: till.tillKey, day: day, shifts: zs.length, keys: [], tickets: 0, gross: 0, net: 0, tax: 0, tenders: {}, taxes: {} };
    zs.forEach(function (z) { d.keys = d.keys.concat(z.keys || []); d.tickets += z.tickets; d.gross += z.gross; d.net += z.net; d.tax += z.tax; d.tenders = addMaps(d.tenders, z.tenders); d.taxes = addTaxes(d.taxes, z.taxes); });
    d.tenders = nz(d.tenders); d.taxes = nzTax(d.taxes); d.series = series(d.keys);
    return d;
  }
  function days(tills) { var o = {}; Object.keys(tills).forEach(function (t) { Object.keys(tills[t].zs).forEach(function (k) { o[tills[t].zs[k].day] = 1; }); }); return Object.keys(o).sort(); }

  // the state of every till for the screen: closed = at least one Z handed for the day
  function screen(tills, expected, day) {
    var names = {}; Object.keys(tills).forEach(function (t) { names[t] = 1; }); (expected || []).forEach(function (t) { names[t] = 1; });
    var out = Object.keys(names).sort().map(function (t) {
      var T = tills[t] || { tillKey: t, keys: {}, zs: {} }, d = declare(T, day), allKeys = Object.keys(T.keys);
      return { tillKey: t, closed: d.shifts > 0, shifts: d.shifts, series: d.series, tickets: d.tickets, gaps: gaps(allKeys), gross: d.gross, net: d.net, tax: d.tax, tenders: d.tenders, taxes: d.taxes, keys: d.keys,
        unmatched: d.keys.filter(function (k) { return !T.keys[k]; }) };   // a Z names a key whose ticket row never arrived
    });
    var tot = { tills: out.length, closed: out.filter(function (x) { return x.closed; }).length, tickets: 0, gross: 0, net: 0, tax: 0, tenders: {}, taxes: {} };
    out.forEach(function (x) { tot.tickets += x.tickets; tot.gross += x.gross; tot.net += x.net; tot.tax += x.tax; tot.tenders = addMaps(tot.tenders, x.tenders); tot.taxes = addTaxes(tot.taxes, x.taxes); });
    tot.tenders = nz(tot.tenders); tot.taxes = nzTax(tot.taxes);
    return { tills: out, total: tot, allClosed: out.length > 0 && out.every(function (x) { return x.closed; }) };
  }

  // the statement rows (POS_BranchDayStatement) of ONE send. o { batchId, seq, day, partial, override, client, org, view (a screen() result, closed tills only are declared) }
  function statementRows(o) {
    var base = function (f) { f.ad_client_id = o.client; f.ad_org_id = o.org; f.isactive = 'Y'; f.batchid = o.batchId; f.businessday = o.day + ' 00:00:00'; f.partial = o.partial ? 'Y' : 'N'; f.seq = o.seq; return f; };
    var lines = o.view.tills.filter(function (t) { return t.closed; });
    var rows = lines.map(function (t) { return base({ kind: 'L', tillkey: t.tillKey, series: JSON.stringify(t.series), tickets: t.tickets, gross: t.gross, net: t.net, tax: t.tax, tenders: JSON.stringify(t.tenders), taxes: JSON.stringify(t.taxes) }); });
    var tot = lines.reduce(function (a, t) { a.tickets += t.tickets; a.gross += t.gross; a.net += t.net; a.tax += t.tax; a.tenders = addMaps(a.tenders, t.tenders); a.taxes = addTaxes(a.taxes, t.taxes); return a; }, { tickets: 0, gross: 0, net: 0, tax: 0, tenders: {}, taxes: {} });
    rows.push(base({ kind: 'B', tillkey: '', series: '', tickets: tot.tickets, gross: tot.gross, net: tot.net, tax: tot.tax, tenders: JSON.stringify(nz(tot.tenders)), taxes: JSON.stringify(nzTax(tot.taxes)), override: o.override || '' }));
    return rows;
  }

  // ── head office side (§26.5): the LATEST batch of an Org and day, and the completeness check of one till against its declared line
  // rows: the pos_branchdaystatement rows of the Org (any day). Returns null when none for the day.
  function latestBatch(rows, day) {
    var mine = (rows || []).filter(function (r) { return dayOf(r.businessday) === day; });
    if (!mine.length) return null;
    var hi = mine.reduce(function (m, r) { return Math.max(m, Number(r.seq)); }, 0), use = mine.filter(function (r) { return Number(r.seq) === hi; });
    var lines = {}, branch = null;
    use.forEach(function (r) { if (r.kind === 'L') lines[r.tillkey] = r; else if (r.kind === 'B') branch = r; });
    var parse = function (s) { try { return JSON.parse(s || '{}'); } catch (e) { return {}; } };
    var L = {}; Object.keys(lines).forEach(function (k) { var r = lines[k]; L[k] = { tillKey: k, series: parse(r.series), tickets: Number(r.tickets), gross: Number(r.gross), net: Number(r.net), tax: Number(r.tax), tenders: parse(r.tenders), taxes: parse(r.taxes) }; });
    return { batchId: use[0].batchid, seq: hi, partial: String(use[0].partial) === 'Y', lines: L, branch: branch ? { tickets: Number(branch.tickets), gross: Number(branch.gross), net: Number(branch.net), tax: Number(branch.tax), tenders: parse(branch.tenders), taxes: parse(branch.taxes), override: branch.override || '' } : null };
  }
  var same = function (a, b) { return JSON.stringify(sortObj(nz(a))) === JSON.stringify(sortObj(nz(b))); };
  function sortObj(o) { var r = {}; Object.keys(o).sort().forEach(function (k) { r[k] = o[k]; }); return r; }
  // C = TillCore (zTotals), env = its tax env or null, line = one latestBatch().lines entry, orders/payments = the rows head office holds for this till and business day (any import state)
  function check(C, env, line, orders, payments) {
    var why = [], keys = {};
    orders.forEach(function (r) { keys[r.documentno] = 1; }); payments.forEach(function (r) { keys[r.documentno] = 1; });
    var have = series(Object.keys(keys)), want = line.series || {};
    Object.keys(want).concat(Object.keys(have)).filter(function (t, i, a) { return a.indexOf(t) === i; }).sort().forEach(function (t) {
      var h = have[t] || { first: 0, last: 0, count: 0 }, w = want[t] || { first: 0, last: 0, count: 0 };
      if (h.count !== w.count) why.push('statement-count ' + t + ' declared=' + w.count + ' held=' + h.count);
      else if (h.first !== w.first || h.last !== w.last) why.push('statement-range ' + t + ' declared=' + w.first + '..' + w.last + ' held=' + h.first + '..' + h.last);
    });
    var tenders = tenderTotals(payments);
    if (!same(tenders, line.tenders)) why.push('statement-totals tenders declared=' + JSON.stringify(sortObj(nz(line.tenders))) + ' held=' + JSON.stringify(sortObj(nz(tenders))));
    var totals = 'NOT-AVAILABLE';
    if (env && C) {
      var withLines = {}; orders.forEach(function (r) { withLines[r.documentno] = 1; });
      var z = C.zTotals(orders, payments.filter(function (p) { return withLines[p.documentno]; }), env, []);
      totals = 'judged';
      if (!z.ok) why.push('statement-totals tax-not-found ' + z.error);
      else {
        if (cents(z.gross) !== line.gross || cents(z.net) !== line.net || cents(z.tax) !== line.tax) why.push('statement-totals gross/net/tax declared=' + line.gross + '/' + line.net + '/' + line.tax + ' held=' + cents(z.gross) + '/' + cents(z.net) + '/' + cents(z.tax));
        else if (JSON.stringify(sortObj(nzTax(z.taxes))) !== JSON.stringify(sortObj(nzTax(line.taxes)))) why.push('statement-totals taxes declared=' + JSON.stringify(line.taxes) + ' held=' + JSON.stringify(nzTax(z.taxes)));
      }
    }
    return { ok: !why.length, why: why, totals: totals, held: have };
  }
  // the batch's own consistency: the branch row == the sum of its lines
  function branchConsistent(batch) {
    if (!batch.branch) return { ok: false, why: 'branch-row-missing' };
    var a = { tickets: 0, gross: 0, net: 0, tax: 0, tenders: {} };
    Object.keys(batch.lines).forEach(function (k) { var l = batch.lines[k]; a.tickets += l.tickets; a.gross += l.gross; a.net += l.net; a.tax += l.tax; a.tenders = addMaps(a.tenders, l.tenders); });
    var b = batch.branch, ok = a.tickets === b.tickets && a.gross === b.gross && a.net === b.net && a.tax === b.tax && same(a.tenders, b.tenders);
    return { ok: ok, why: ok ? '' : 'branch-sum declared=' + b.gross + '/' + b.tickets + ' lines=' + a.gross + '/' + a.tickets };
  }
  return { parseKey: parseKey, tenderTotals: tenderTotals, series: series, gaps: gaps, handoffRows: handoffRows, fold: fold, declare: declare, days: days, screen: screen, statementRows: statementRows, latestBatch: latestBatch, check: check, branchConsistent: branchConsistent, O_COLS: O_COLS, P_COLS: P_COLS };
});
