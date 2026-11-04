// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — till_lan.js: the till's side of the BRANCH RELAY (bim-compiler prompts/POS_PLUGIN_LOCAL_FIRST.md §38). READ THE LOG (§LAN_* / §MAIN_* lines of erp/tests/witness_branch_relay.js); exit codes are not evidence.
// Every till runs from localhost (D11) and talks to ONE dumb mailbox on the shop LAN (D12, erp/branch_relay.py), never the internet. An ORDINARY till is built with `lan` only: there is no internet pipe on it to call (D9).
// The MAIN till (flag set from HQ through its SODA record, §38.2.3) alone collects, answers stock queries and holds the internet pipe `net` (EODA up, SODA down).
// Names on the branch relay:  d/<till>/<seq8> a ticket's lines as rung · h/<till>/<shift8> the shift's hand-off rows (Close Cash) · p/<till> heartbeat · q/<till>/<n8> stock question · a/<till>/<n8> the main till's answer.
// No DOM, no clock of its own (the caller passes now), state in a plain object the caller persists (opts.state + opts.save).
'use strict';
(function (root, factory) { if (typeof module !== 'undefined' && module.exports) module.exports = factory(); else root.TillLan = factory(); })(typeof window !== 'undefined' ? window : globalThis, function () {
  var enc = new TextEncoder(), dec = new TextDecoder(), pad = function (n) { return String(n).padStart(8, '0'); };
  var J = function (o) { return enc.encode(JSON.stringify(o)); }, P = function (b) { return JSON.parse(dec.decode(b)); };
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

  // o { tillKey, lan (pipe), net (pipe|null: main only), state, save(), now(), log(), expected: [till keys], windowMs }
  function create(o) {
    var st = o.state; st.out = st.out || []; st.seq = st.seq || 0; st.shiftSent = st.shiftSent || {}; st.qn = st.qn || 0;
    st.main = st.main || { on: false }; var M = st.main;
    M.wm = M.wm || {}; M.lines = M.lines || {}; M.hand = M.hand || {}; M.beat = M.beat || {}; M.seen = M.seen || []; M.recv = M.recv || {}; M.soda = M.soda || {}; M.answered = M.answered || {};   // present on every till (empty unless main), so no read ever meets undefined
    var log = o.log || function () {}, now = o.now || Date.now, save = o.save || function () {}, WIN = o.windowMs || 120000;
    var T = { tillKey: o.tillKey, state: st };
    if (!o.isMain && o.net) throw new Error('TillLan: an ordinary till is built with the branch relay only');   // D9/D11: no internet pipe on a dumb till
    T.isMain = function () { return !!M.on; };
    // ── the flag: set from HQ through this till's own SODA row (kind M, Value = this till's key). There is no other writer.
    T.applySodaFlag = function (rows) {
      var mine = (rows || []).filter(function (r) { return r.kind === 'M' && String(r.value) === String(o.tillKey); });
      if (mine.length && !M.on) { M.on = true; M.wm = {}; M.lines = {}; M.hand = {}; M.beat = {}; M.seen = []; M.recv = {}; M.soda = M.soda || {}; M.answered = {}; save(); log('§MAIN_FLAG till=' + o.tillKey + ' set by SODA'); }
      return M.on;
    };
    T.applySodaStock = function (rows) {   // kind S rows: HQ's StorageOnHand for the branch. Main till only; an ordinary till never keeps a quantity (D7)
      if (!M.on) return 0; var n = 0;
      (rows || []).forEach(function (r) { if (r.kind !== 'S') return; M.soda[String(r.m_product_id)] = Number(JSON.parse(r.detail || '{}').qty); n++; }); if (n) save(); return n;
    };
    T.requireMain = function (op) {
      if (M.on) return null;
      var m = 'This is not the branch main till: ' + op + ' is run at the main till.'; log('§MAIN_REFUSED op=' + op + ' till=' + o.tillKey); return { refused: 'not-main', message: m };
    };
    // ── a till's own deposits (every till, main included): queued in its own store first, so the till never waits on the LAN (D9)
    function enqueue(name, obj) { st.out.push({ name: name, body: obj }); save(); }
    T.deposit = async function (key, orders, payments) { var s = ++st.seq; enqueue('d/' + o.tillKey + '/' + pad(s), { till: o.tillKey, seq: s, ts: now(), key: key, orders: orders, payments: payments }); return T.flush(); };
    T.depositShift = async function (shiftSeq, rows) { enqueue('h/' + o.tillKey + '/' + pad(shiftSeq), { till: o.tillKey, shift: shiftSeq, ts: now(), rows: rows }); return T.flush(); };
    T.flush = async function () {   // in order; a failure leaves the rest queued (the name is the key: a resend replaces, never doubles)
      var sent = 0, left = st.out;
      while (left.length) { var f = left[0]; try { await o.lan.put(f.name, J(f.body)); } catch (e) { log('§LAN_HOLD till=' + o.tillKey + ' queued=' + left.length + ' (branch relay not reachable; selling continues)'); break; } left.shift(); sent++; }
      if (sent) { try { await o.lan.put('p/' + o.tillKey, J({ till: o.tillKey, ts: now() })); } catch (e) { /* next flush */ } }
      save(); if (sent) log('§LAN_FLUSH till=' + o.tillKey + ' sent=' + sent + ' queued=' + left.length); return { sent: sent, queued: left.length };
    };
    T.beat = async function () { try { await o.lan.put('p/' + o.tillKey, J({ till: o.tillKey, ts: now() })); return true; } catch (e) { return false; } };
    // ── the main till: incremental collection by per-till sequence; each LINE is stored once (key ticketKey#index)
    T.collect = async function () {
      var r = T.requireMain('collect'); if (r) return r;
      var dn, hn, pn; try { dn = await o.lan.list('d/'); hn = await o.lan.list('h/'); pn = await o.lan.list('p/'); }
      catch (e) { log('§LAN_COLLECT relay-down (nothing collected; the tills keep selling)'); return { ok: false, reason: 'relay-down', reached: [], notReached: T.tills() }; }
      var newFiles = 0, newLines = 0, dupLines = 0, tills = {};
      dn.sort().forEach(function (n) { var m = /^d\/(.+)\/(\d{8})$/.exec(n); if (m) (tills[m[1]] = tills[m[1]] || []).push({ n: n, seq: Number(m[2]) }); });
      for (var tk of Object.keys(tills)) {
        if (M.seen.indexOf(tk) < 0) M.seen.push(tk);
        for (var f of tills[tk]) { if (f.seq <= (M.wm[tk] || 0)) continue;
          var b = await o.lan.get(f.n); if (!b) continue; var d = P(b); newFiles++;
          (d.orders || []).forEach(function (l, i) { var k = d.key + '#' + i; if (M.lines[k]) { dupLines++; return; } M.lines[k] = { till: tk, key: d.key, pid: l.m_product_id, qty: Number(l.qtyordered), seq: f.seq }; newLines++; });
          M.wm[tk] = Math.max(M.wm[tk] || 0, f.seq); }
      }
      hn.forEach(function (n) { var m = /^h\/(.+)\/(\d{8})$/.exec(n); if (m && M.seen.indexOf(m[1]) < 0) M.seen.push(m[1]); });
      for (var n of hn) { if (M.hand[n]) continue; var hb = await o.lan.get(n); if (hb) M.hand[n] = P(hb); }
      for (var pnm of pn) { var m2 = /^p\/(.+)$/.exec(pnm); if (!m2) continue; var pb = await o.lan.get(pnm); if (pb) { M.beat[m2[1]] = P(pb).ts; if (M.seen.indexOf(m2[1]) < 0) M.seen.push(m2[1]); } }
      save();
      var all = T.tills(), t = now(), reached = all.filter(function (k) { return k === o.tillKey || (M.beat[k] != null && t - M.beat[k] <= WIN); }), notReached = all.filter(function (k) { return reached.indexOf(k) < 0; });
      log('§LAN_COLLECT newFiles=' + newFiles + ' newLines=' + newLines + ' dupLines=' + dupLines + ' totalLines=' + Object.keys(M.lines).length + ' wm=' + JSON.stringify(M.wm) + ' reached=' + reached.length + '/' + all.length + ' notReached=' + notReached.join(','));
      return { ok: true, newFiles: newFiles, newLines: newLines, dupLines: dupLines, reached: reached, notReached: notReached };
    };
    T.tills = function () { var s = (o.expected || []).slice(); M.seen.forEach(function (k) { if (s.indexOf(k) < 0) s.push(k); }); return s.sort(); };
    T.stock = function (pid) {   // running record = HQ StorageOnHand (SODA) - collected lines + received
      var k = String(pid), sold = 0; Object.keys(M.lines).forEach(function (x) { if (String(M.lines[x].pid) === k) sold += M.lines[x].qty; });
      return { qty: (M.soda[k] || 0) - sold + (M.recv[k] || 0), soda: M.soda[k] || 0, sold: sold, received: M.recv[k] || 0 };
    };
    T.received = function (pid, qty) { var r = T.requireMain('receive stock'); if (r) return r; M.recv[String(pid)] = (M.recv[String(pid)] || 0) + Number(qty); save(); return { ok: true }; };
    T.handoffRows = function () { var out = []; Object.keys(M.hand).sort().forEach(function (n) { out = out.concat(M.hand[n].rows || []); }); return out; };
    // ── stock query (D7: the dumb till asks and shows; it keeps nothing)
    T.ask = async function (pid, o2) {
      o2 = o2 || {}; var n = ++st.qn, tries = o2.tries || 20, gap = o2.gapMs == null ? 150 : o2.gapMs;
      try { await o.lan.put('q/' + o.tillKey + '/' + pad(n), J({ n: n, till: o.tillKey, pid: pid, ts: now() })); } catch (e) { return { unreachable: true, message: 'main till not reachable' }; }
      for (var i = 0; i < tries; i++) { var b = null; try { b = await o.lan.get('a/' + o.tillKey + '/' + pad(n)); } catch (e) { return { unreachable: true, message: 'main till not reachable' }; }
        if (b) return P(b); await sleep(gap); }
      return { unreachable: true, message: 'main till not reachable' };
    };
    T.answerQueries = async function () {
      var r = T.requireMain('stock check'); if (r) return r;
      var qs; try { qs = await o.lan.list('q/'); } catch (e) { return { ok: false, reason: 'relay-down' }; }
      var todo = qs.filter(function (n) { return !M.answered[n]; }); if (!todo.length) return { ok: true, answered: 0 };
      var c = await T.collect(); var n = 0;
      for (var qn of todo) { var qb = await o.lan.get(qn); if (!qb) continue; var q = P(qb), s = T.stock(q.pid), unreached = c.notReached || [];
        var ans = { n: q.n, pid: q.pid, qty: s.qty, asOf: now(), reached: c.reached || [], notReached: unreached, of: T.tills().length, atMost: unreached.length > 0 };
        await o.lan.put('a/' + q.till + '/' + pad(q.n), J(ans)); M.answered[qn] = 1; n++;
        log('§STOCK_ANSWER till=' + q.till + ' pid=' + q.pid + ' qty=' + s.qty + (unreached.length ? ' atMost notReached=' + unreached.join(',') : '') + ' reached=' + (c.reached || []).length + '/' + T.tills().length); }
      save(); return { ok: true, answered: n };
    };
    // ── the shared stream of the Team space, copied both ways by NAME (bytes untouched; the readers verify the signatures as ever). Branch mailboxes (m/b_*) never leave the LAN. The main till is the only bridge,
    //    so an ordinary till sees the roster, the heads and the hub's mail through the branch relay alone. A name seen on both sides is re-copied only when one side's bytes changed since the last copy (heads, requests).
    var h32 = function (b) { var h = 5381; for (var i = 0; i < b.length; i++) h = ((h << 5) + h + b[i]) | 0; return h + ':' + b.length; };
    var lanOnly = function (n) { return /(^|\/)m\/b_[^/]+\//.test(n); };
    T.mirror = async function (net, lan) {
      var r = T.requireMain('mirror'); if (r) return r; M.mir = M.mir || {}; var up = 0, down = 0;
      var A = (await net.list('s/')).filter(function (n) { return !lanOnly(n); }), B = (await lan.list('s/')).filter(function (n) { return !lanOnly(n); }), inA = {}, inB = {}; A.forEach(function (n) { inA[n] = 1; }); B.forEach(function (n) { inB[n] = 1; });
      var all = Object.keys(Object.assign({}, inA, inB)).sort();
      for (var n of all) {
        if (inA[n] && !inB[n]) { var x = await net.get(n); if (x) { await lan.put(n, x); M.mir[n] = h32(x); down++; } }
        else if (inB[n] && !inA[n]) { var y = await lan.get(n); if (y) { await net.put(n, y); M.mir[n] = h32(y); up++; } }
        else if (/\/(h|r|f)\//.test(n)) {   // mutable on both sides: copy from the side that changed
          var xa = await net.get(n), xb = await lan.get(n); if (!xa || !xb) continue; var ha = h32(xa), hb = h32(xb), last = M.mir[n];
          if (ha !== hb) { if (ha !== last) { await lan.put(n, xa); M.mir[n] = ha; down++; } else if (hb !== last) { await net.put(n, xb); M.mir[n] = hb; up++; } } else M.mir[n] = ha; }
      }
      save(); log('§LAN_MIRROR down=' + down + ' up=' + up + ' names=' + all.length); return { down: down, up: up };
    };
    return T;
  }
  return { create: create, pad: pad };
});
