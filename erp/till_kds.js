// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — till_kds.js: the till side of the kitchen link. READ THE LOG (§KDS_* / §TILL_KITCHEN* lines of erp/tests/witness_kds.js), exit codes are not evidence.
// Implementing bim-compiler prompts/POS_PLUGIN_LOCAL_FIRST.md §19.1 (Send Order, uniCenta 5.0 JPanelTicket.java:3046-3067, 3429-3490) and §19.4 (the ready/void notice back, Floreant KitchenTicketView.java:359-395).
// Send Order = REPLACE-ALL: every sale line of the open ticket goes out as ONE new generation (Seq+1) of POS_KitchenOrder rows in one atomic group; the kitchen reads the newest generation. The rows are branch-local
// (plan audience "branch", §19.3): they travel to the kitchen of this Org and never to head office. The till then runs ONE Visit (it carries whatever else is pending: the batch).
(function () {
  'use strict';
  var A = null, K = window.KdsCore, E = null, link = null, kid = null;
  var tk = function () { return A.S.cfg.tillKey; };
  function ensure() { return K.ensure(E.__idmpDb); }
  async function orderRows() { ensure(); return A.rows('SELECT * FROM pos_kitchenorder WHERE tillkey=' + A.q(tk()) + ' ORDER BY ABS(pos_kitchenorder_id)'); }
  async function statusRows() { ensure(); return A.rows('SELECT * FROM pos_kitchenstatus WHERE tillkey=' + A.q(tk()) + ' ORDER BY ABS(pos_kitchenstatus_id)'); }
  function refOf(t, assign) {   // JPanelTicket.remoteOrderId :3441-3459 - the table, else the pick-up number (assigned on the first send)
    if (!t.table && !t.pickup && assign) t.pickup = A.bumpPickup();
    return t.table || t.pickup ? K.orderRefOf(t, K.pickupString(t.pickup, null)) : null;
  }
  async function sendOrder() {
    var t = A.S.ticket; if (t.type !== 'S') { A.msg('Send Order is for a sale ticket', 'warn'); return null; }
    var ref = refOf(t, true), prev = (await orderRows()).filter(function (r) { return r.orderref === ref; }), seq = prev.reduce(function (m, r) { return Math.max(m, Number(r.seq)); }, 0) + 1;
    var kl = t.lines.filter(function (l) { return !l.disc && l.name && Number(l.qty) > 0; });
    if (!kl.length && !prev.length) { A.msg('Nothing to send', 'warn'); return null; }
    var rows = K.sendRows({ tillKey: tk(), orderRef: ref, seq: seq, lines: t.lines, client: A.S.cfg.client, org: A.S.cfg.org, now: A.nowIso(), display: 1 });
    var res = await A.depositGroup(rows.map(function (r) { return A.create('pos_kitchenorder', r); }));
    if (!res || res.committed !== true) { A.msg('Could not send the order: ' + (res && res.reason), 'bad'); A.log('§KDS_SEND FAIL ' + (res && res.reason)); return null; }
    A.persist();
    A.log('§KDS_SEND till=' + tk() + ' order=' + ref + ' seq=' + seq + ' lines=' + rows.length + ' kind=' + rows[0].kind + ' ops=' + rows.length + ' gid=' + res.gid + ' (replace-all: generation ' + seq + ' supersedes ' + (seq - 1) + ')');
    var v = await window.Till.visit();      // ONE Visit right after the send; it also carries whatever else is pending (§19.5)
    A.log('§KDS_SEND_VISIT order=' + ref + ' seq=' + seq + ' sent=' + (v && v.rep ? v.rep.sent : 'none'));
    A.msg('Order ' + ref + ' sent to the kitchen', 'ok'); await refresh(); startWatch();
    return { ref: ref, seq: seq, rows: rows.length };
  }
  var notified = function () { var s = A.S.store; s.kds = s.kds || {}; s.kds.notified = s.kds.notified || {}; return s.kds.notified; };
  // the notice back (§19.4): per order of THIS till, the newest state of its current generation; a new Done / Void raises ONE notice
  async function refresh() {
    var o = await orderRows(), s = await statusRows(), refs = {}; o.forEach(function (r) { refs[r.orderref] = 1; });
    var out = {}, nt = notified();
    Object.keys(refs).forEach(function (ref) {
      var n = K.noticeFor(o, s, tk(), ref); out[ref] = n; if (!n) return;
      var key = ref + ':' + n.seq + ':' + n.state;
      if ((n.state === 'ready' || n.state === 'void') && !nt[key]) { nt[key] = 1; A.saveStore(); A.log('§TILL_KITCHEN_NOTICE order=' + ref + ' seq=' + n.seq + ' state=' + n.state); A.msg('Kitchen: order ' + ref + ' is ' + (n.state === 'ready' ? 'READY' : 'VOID'), n.state === 'ready' ? 'ok' : 'warn'); }
    });
    A.S.kitchen = out; chip(); return out;
  }
  function chip() {
    var el = A.$('#kchip'); if (!el) return; var t = A.S.ticket, ref = t && refOf(t, false), n = ref && A.S.kitchen ? A.S.kitchen[ref] : null;
    el.hidden = !n; el.textContent = n ? 'Kitchen: ' + n.state : ''; el.setAttribute('data-kstate', n ? n.state : '');
  }
  function outstanding() { return Object.keys(A.S.kitchen || {}).some(function (r) { var n = A.S.kitchen[r]; return n && n.state === 'waiting'; }); }
  function startWatch() { if (!link) { link = window.KdsLink.create({ E: E, kid: async function () { if (!kid) kid = (await E.TeamSync.pairState()).device; return kid; }, pollMs: Number(new URLSearchParams(location.search).get('poll')) * 1000 || Number((A.S.store.kds || {}).pollMs) || 10000, log: A.log, onVisit: refresh }); link.start(outstanding); } }
  function init(api) {
    A = api; E = window.Till.engine ? window.Till.engine() : null; E = E || api.engineWin();
    A.S.store.kds = A.S.store.kds || {}; ensure();
    A.hooks.sales = chip;
    document.addEventListener('click', function (ev) { var b = ev.target.closest && ev.target.closest('button'); if (b && !b.disabled && b.getAttribute('data-btn') === 'Send Order') { ev.stopPropagation(); sendOrder(); } }, true);
    refresh().then(function () { if (outstanding()) startWatch(); });
    window.TillKds = { send: sendOrder, refresh: refresh, rows: orderRows, status: statusRows, link: function () { return link; }, tick: function () { return link ? link.tick() : null; }, start: startWatch };
    A.log('§KDS_TILL ready till=' + tk());
  }
  window.TillKdsInit = init;
})();
