// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — kds_core.js: the PURE half of the kitchen hand-off (till Send Order + kitchen screen). READ THE LOG (§KDS_* lines), the exit code is not evidence.
// Implementing bim-compiler prompts/POS_PLUGIN_LOCAL_FIRST.md §19 (P2) - Witness: W-KDS-BRANCH / -REPLACE / -RELAY (erp/tests/witness_kds.js).
// uniCenta 5.0 is the base: Send Order = replace-all of the ticket's lines into the shared `orders` queue (JPanelTicket.java:3429-3490); the order id is the table, else the pick-up number (:3441-3459).
// What uniCenta lacks and §14A.P fills: states waiting/done/void (Floreant KitchenTicket.java:408-409), recall (Chromis KitchenscrController.java:273-276), changed lines marked (URY FEATURES.md:9-16,60-64),
//   a ready/void notice back to the till (Floreant KitchenTicketView.java:359-395), elapsed green/amber/red (Chromis OrderPanel.java:143-162).
// The two tables are BRANCH-LOCAL (§19.2): declared as virtual tables in the plan source (bim-compiler build/scriptor/flows_pos.json K1/K2, audience "branch"); the physical SQL tables are a device overlay made on the till's and the kitchen's
//   OWN engine frame (the ad_import_tables.js pattern, outside the team base hash). They are NOT legacy import tables and nothing head office imports reads them. Determinism: no Date.now / Math.random here (the caller passes `now`).
'use strict';
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.KdsCore = factory();
})(typeof window !== 'undefined' ? window : globalThis, function () {
  var BASE = '"ad_client_id" NUMERIC, "ad_org_id" NUMERIC, "isactive" TEXT, "created" TEXT, "createdby" NUMERIC, "updated" TEXT, "updatedby" NUMERIC, ';
  var DDL = {
    pos_kitchenorder: 'CREATE TABLE IF NOT EXISTS "pos_kitchenorder" ("pos_kitchenorder_id" NUMERIC, ' + BASE + '"pos_kitchenorder_uu" TEXT, "tillkey" TEXT, "orderref" TEXT, "seq" NUMERIC, "line" NUMERIC, "qty" NUMERIC, "details" TEXT, "displayid" NUMERIC, "ordertime" TEXT, "kind" TEXT)',
    pos_kitchenstatus: 'CREATE TABLE IF NOT EXISTS "pos_kitchenstatus" ("pos_kitchenstatus_id" NUMERIC, ' + BASE + '"pos_kitchenstatus_uu" TEXT, "tillkey" TEXT, "orderref" TEXT, "seq" NUMERIC, "line" NUMERIC, "state" TEXT, "statusseq" NUMERIC, "statustime" TEXT)'
  };
  var ORDER_TABLE = 'pos_kitchenorder', STATUS_TABLE = 'pos_kitchenstatus';
  // The comm layer admits an op only against a table the device's dictionary knows (team_sync.js access(): 'no-table' -> REFUSED). The two tables are NOT in the base dictionary (its hash must not move), so each BRANCH device
  // adds ONE ad_table row per table to its own live dictionary at boot, the same ids and the same access level (2 = Organization) on the till and the kitchen, outside the team base hash (the ad_import_tables.js pattern).
  // Head office does not add them: it never reads the branch box. Role 50004 carries no AD_Table_Access rule, so a known table with AccessLevel 2 is writable by it (ad_access.js isTableAccess).
  var AD_ROWS = { pos_kitchenorder: [7900001, 'POS Kitchen Order', 'POS_KitchenOrder'], pos_kitchenstatus: [7900002, 'POS Kitchen Status', 'POS_KitchenStatus'] };
  function ensure(db) {
    var made = 0;
    Object.keys(DDL).forEach(function (t) { var r = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='" + t + "'"); if (r.length && r[0].values.length) return; db.run(DDL[t]); made++; });
    Object.keys(AD_ROWS).forEach(function (t) { var a = AD_ROWS[t], r = db.exec('SELECT 1 FROM ad_table WHERE ad_table_id=' + a[0]); if (r.length && r[0].values.length) return;
      db.run("INSERT INTO ad_table (ad_table_id, ad_client_id, ad_org_id, isactive, name, tablename, isview, accesslevel, entitytype, isdeleteable, ishighvolume, importtable, ischangelog, ad_table_uu) VALUES (?,0,0,'Y',?,?,'N','2','U','Y','N','N','N',?)", [a[0], a[1], a[2], 'kds00000-0000-4000-8000-0000000' + a[0]]); made++; });
    return made;
  }

  // JPanelTicket.getPickupString (:1915-1927): the pick-up number, zero padded ONLY when the till.pickupsize property is set (absent by default)
  function pickupString(n, size) { var s = String(Number(n) || 0); if (size != null && size !== '' && Number(size) >= s.length) while (s.length < Number(size)) s = '0' + s; return s; }
  // JPanelTicket.remoteOrderId (:3441-3459): customer name, else the table/place, else the pick-up number. The till has no customer on a ticket (Customer button disabled).
  function orderRefOf(ticket, pickupStr) { if (ticket.customer) return String(ticket.customer); if (ticket.table) return String(ticket.table); return pickupStr; }

  // The rows of ONE Send Order = one generation. Every line is sent (5.0 does not filter by a product flag: ISKITCHEN is gone, printto only feeds paper tickets). `lines` are the ticket lines {name, qty};
  // a line with no name or qty<=0 (a Line Discount line has no product) is not a kitchen line. An EMPTY ticket after an earlier send is a cancel row (URY cancelled KOT).
  function sendRows(o) {   // o { tillKey, orderRef, seq, lines, client, org, now, display }
    var ls = (o.lines || []).filter(function (l) { return !l.disc && l.name && Number(l.qty) > 0; });
    var base = function (f) { f.ad_client_id = o.client; f.ad_org_id = o.org; f.isactive = 'Y'; f.tillkey = o.tillKey; f.orderref = o.orderRef; f.seq = o.seq; f.ordertime = o.now; return f; };
    if (!ls.length) return [base({ line: 0, qty: 0, details: '', displayid: o.display || 1, kind: 'C' })];
    return ls.map(function (l, i) { return base({ line: i + 1, qty: Number(l.qty), details: String(l.name), displayid: o.display || 1, kind: 'L' }); });
  }
  function statusRow(o) {   // o { tillKey, orderRef, seq, line, state, statusSeq, client, org, now }
    return { ad_client_id: o.client, ad_org_id: o.org, isactive: 'Y', tillkey: o.tillKey, orderref: o.orderRef, seq: o.seq, line: o.line || 0, state: o.state, statusseq: o.statusSeq, statustime: o.now };
  }

  function utcMs(t) { var m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(String(t || '')); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : NaN; }
  // Chromis OrderPanel.java:143-162: elapsed minutes > amber -> amber, > red -> red, else green. The two limits are branch settings (Chromis screen.amber/screen.red); the source has no default and the owner ruled none: both unset = colour off.
  function ageClass(elapsedMs, amberMin, redMin) { if (!(amberMin > 0) || !(redMin > 0)) return 'off'; var m = Math.floor(elapsedMs / 60000); return m > redMin ? 'red' : m > amberMin ? 'amber' : 'green'; }   // owner 2026-11-03 "Off until set": NO default; with either limit unset the card carries no colour ('off')
  function mmss(ms) { var s = Math.max(0, Math.floor(ms / 1000)); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); }   // OrderPanel.java:135-136 MM:SS

  // fold(orderRows, statusRows, opts{now, amber, red, station}) -> cards. A card = one (till, order id). Its CURRENT queue is the highest Seq (replace-all result); the generation before it gives the change marks.
  function fold(orderRows, statusRows, opts) {
    opts = opts || {}; var by = {};
    (orderRows || []).forEach(function (r) { var k = r.tillkey + '\u0001' + r.orderref; (by[k] = by[k] || { till: r.tillkey, ref: r.orderref, gens: {}, sts: [] }).gens[Number(r.seq)] = (by[k].gens[Number(r.seq)] || []).concat([r]); });
    (statusRows || []).forEach(function (s) { var k = s.tillkey + '\u0001' + s.orderref; if (by[k]) by[k].sts.push(s); });
    var cards = [];
    Object.keys(by).forEach(function (k) {
      var c = by[k], seqs = Object.keys(c.gens).map(Number).sort(function (a, b) { return a - b; }), cur = seqs[seqs.length - 1], rows = c.gens[cur].slice().sort(function (a, b) { return a.line - b.line; });
      var cancelled = rows.length === 1 && rows[0].kind === 'C', lines = cancelled ? [] : rows;
      var prevSeq = seqs.length > 1 ? seqs[seqs.length - 2] : null; if (prevSeq != null) { var pr = c.gens[prevSeq]; if (pr.length === 1 && pr[0].kind === 'C') prevSeq = null; }   // the generation before this one gives the marks; after a cancel the card is simply re-opened
      var prev = prevSeq == null ? [] : c.gens[prevSeq].filter(function (r) { return r.kind === 'L'; }), pm = {}; prev.forEach(function (r) { pm[r.details] = r; });
      var marks = {}, removed = [];
      if (prevSeq != null && !cancelled) {
        lines.forEach(function (r) { var p = pm[r.details]; marks[r.line] = !p ? { m: 'added' } : Number(p.qty) !== Number(r.qty) ? { m: 'changed', was: Number(p.qty) } : null; });
        var curNames = {}; lines.forEach(function (r) { curNames[r.details] = 1; });
        prev.forEach(function (p) { if (!curNames[p.details]) removed.push({ details: p.details, qty: Number(p.qty) }); });
      }
      // states of the CURRENT generation only: the newest status row (highest StatusSeq) per Line; Line 0 is the whole ticket
      var st = c.sts.filter(function (s) { return Number(s.seq) === cur; }), latest = {};
      st.forEach(function (s) { var l = Number(s.line); if (!latest[l] || Number(s.statusseq) > Number(latest[l].statusseq)) latest[l] = s; });
      var ticketState = latest[0] ? latest[0].state : 'W', bumpedAt = latest[0] ? String(latest[0].statustime) : '', items = {}; Object.keys(latest).forEach(function (l) { if (Number(l) > 0) items[l] = latest[l].state; });
      var maxStatusSeq = c.sts.reduce(function (a, s) { return Math.max(a, Number(s.statusseq)); }, 0);
      var t0 = utcMs(rows[0].ordertime), elapsed = isNaN(t0) || opts.now == null ? 0 : opts.now - t0;
      var stationLines = opts.station == null ? lines : lines.filter(function (r) { return Number(r.displayid) === Number(opts.station); });
      if (opts.station != null && !cancelled && !stationLines.length) return;      // a card appears on a station only if it has a line for it (Chromis DataLogicKitchen.java:50-56)
      cards.push({ till: c.till, ref: c.ref, seq: cur, firstSeq: seqs[0], modified: prevSeq != null && !cancelled && (removed.length > 0 || Object.keys(marks).some(function (l) { return marks[l]; })), cancelled: cancelled,
        lines: stationLines.map(function (r) { return { line: Number(r.line), qty: Number(r.qty), details: r.details, display: Number(r.displayid), mark: marks[r.line] || null, state: items[r.line] || 'W' }; }),
        removed: removed, state: ticketState, bumpedAt: bumpedAt, time: rows[0].ordertime, elapsedMs: elapsed, age: ageClass(elapsed, opts.amber, opts.red), clock: mmss(elapsed), maxStatusSeq: maxStatusSeq });
    });
    cards.sort(function (a, b) { return utcMs(a.time) - utcMs(b.time) || (a.ref < b.ref ? -1 : 1); });
    return cards;
  }
  // The till's view of one order (the notice back): waiting / ready (Floreant STATUS_READY) / void (STATUS_VOID) / cancelled-by-till; null when nothing was sent for it.
  function noticeFor(orderRows, statusRows, tillKey, orderRef) {
    var cs = fold((orderRows || []).filter(function (r) { return r.tillkey === tillKey && r.orderref === orderRef; }), (statusRows || []).filter(function (r) { return r.tillkey === tillKey && r.orderref === orderRef; }), {});
    if (!cs.length) return null; var c = cs[0];
    return { state: c.cancelled ? 'cancelled' : c.state === 'D' ? 'ready' : c.state === 'V' ? 'void' : 'waiting', seq: c.seq, statusSeq: c.maxStatusSeq };
  }
  return { DDL: DDL, ORDER_TABLE: ORDER_TABLE, STATUS_TABLE: STATUS_TABLE, ensure: ensure, pickupString: pickupString, orderRefOf: orderRefOf, sendRows: sendRows, statusRow: statusRow, fold: fold, noticeFor: noticeFor, ageClass: ageClass, mmss: mmss, utcMs: utcMs };
});
