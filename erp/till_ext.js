// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — till_ext.js: the slice-2 screens of the Unicenta-alike till (prompts/POS_PLUGIN_LOCAL_FIRST.md §17). READ THE LOG (§TILL_* lines of erp/tests/witness_till.js), exit codes are not evidence.
// Implementing §17.3 - Witness: W-TILL-UNICENTA-PARITY / -REFUND / -HELD / -EDIT / -BAR / -PANELS. Screens: ticket button bar (U6), shared tickets (U7), Edit Sales (U10), Refund (U11), Customer Payment (U12), Payments (U13),
//   Reprint Last Ticket, Voucher, Check In/Out, Pick-up reset, restaurant map + reservations (mode=restaurant). A ticket's lines/prices/tenders are always re-derived from the DEPOSITED I_Order/I_Payment rows; what the rows do not hold lives
//   in the device store (till.v1:<tillKey>) and DOES NOT TRAVEL to head office (named per screen in §17.3). The till deposits; it completes nothing.
(function () {
  'use strict';
  var A = null;
  var uid = function (p) { return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); };
  function st() { return A.S.store; }
  function ask(text) {   // a JOptionPane confirm
    return new Promise(function (res) {
      var box = A.$('#confirmbox'); A.$('#confirm-text').textContent = text; box.hidden = false;
      var done = function (v) { box.hidden = true; A.$('#confirm-yes').onclick = A.$('#confirm-no').onclick = null; res(v); };
      A.$('#confirm-yes').onclick = function () { done(true); }; A.$('#confirm-no').onclick = function () { done(false); };
    });
  }
  var cashier = function () { return A.S.cashier ? A.S.cashier.name : ''; };
  var money = function (c) { return A.C.money(c); };

  // ── tickets re-derived from the deposited rows ──
  async function loadTicket(key) {
    var os = await A.rows('SELECT o.*, p.name AS pname FROM i_order o LEFT JOIN m_product p ON p.m_product_id=o.m_product_id WHERE o.documentno=' + A.q(key) + ' ORDER BY ABS(o.i_order_id)');
    var ps = await A.rows('SELECT * FROM i_payment WHERE documentno=' + A.q(key) + ' ORDER BY ABS(i_payment_id)');
    if (!os.length && !ps.length) return null;
    var m = /-([SRP])(\d+)$/.exec(key), lines = os.map(function (r) { return { pid: r.m_product_id, name: r.pname || ('product ' + r.m_product_id), qty: Number(r.qtyordered), price: Number(r.priceactual) }; });
    var tt = A.C.totals(lines, A.S.taxEnv);
    return { key: key, kind: m ? m[1] : 'S', number: m ? Number(m[2]) : 0, lines: lines, pays: ps, tag: (os[0] || ps[0]).description, refundOf: ((os[0] || {}).linedescription || '').replace(/^Refund of /, '') || null, gross: tt.ok ? tt.gross : null };
  }
  async function refunded(key) { return Number((await A.rows('SELECT count(*) AS n FROM i_order WHERE linedescription=' + A.q('Refund of ' + key)))[0].n) > 0; }
  function ticketText(t) {
    return A.esc(t.key) + '\n' + t.lines.map(function (l) { return l.name + '  ' + money(A.C.cents(l.price)) + '  x' + l.qty + '  ' + money(A.C.lineNetCents(l.qty, l.price)); }).join('\n') + '\nTotal  ' + (t.gross == null ? '?' : money(t.gross));
  }
  async function reprint(key) {
    var r = (st().rcpt || {})[key], model, change = 0;
    if (r) { model = r.model; change = r.change; }
    else {   // the device store was cleared: rebuild from the rows (no tendered / change / discount lines)
      var t = await loadTicket(key); if (!t) { A.msg('Ticket does not exist', 'warn'); return false; }
      var ap = { parts: t.pays.map(function (p) { var n = { X: 'cash', K: 'cheque', C: 'magcard', A: 'bank' }[p.tendertype]; return { name: n, tendered: Math.abs(A.C.cents(p.payamt)), applied: Math.abs(A.C.cents(p.payamt)), ref: p.r_pnref, auth: p.r_authcode }; }) };
      model = A.C.receiptModel({ type: t.kind, number: key, date: A.nowIso(), terminal: A.S.cfg.tillKey, user: cashier(), lines: t.lines.map(function (l) { return { name: l.name, price: A.C.cents(l.price), qty: l.qty, value: A.C.lineNetCents(l.qty, l.price) }; }), gross: t.gross, applied: ap, change: 0 });
    }
    A.S.lastReceipt = { key: key, model: model, gross: 0, change: change, firstCash: false }; A.S.afterReceipt = A.S.screen === 'editsales' ? 'editsales' : A.S.screen === 'reprintlist' ? 'sales' : A.S.screen;
    A.showReceipt(true); A.msg('Printed', 'ok'); A.log('§TILL_REPRINT key=' + key + ' fields=' + model.length); return true;
  }

  // ── U7 shared tickets ──
  function holdCurrent() {   // JTicketsBagShared.saveCurrentTicket: a ticket with lines is kept, an empty one is dropped
    var t = A.S.ticket; if (!t.lines.length) return false;
    (st().held = st().held || []).push({ id: uid('h'), ticket: t, user: cashier(), at: A.nowIso() }); A.saveStore(); return true;
  }
  function freshTicket() { A.S.ticket = A.newTicket(); A.S.pad = A.P.zero(); A.persist(); A.renderSales(); }
  function renderHeld() {
    var h = st().held || [];
    A.$('#hl-list').innerHTML = h.map(function (x) { var tt = A.C.totals(A.C.foldLines(x.ticket.lines), A.S.taxEnv); return '<button data-held="' + x.id + '">' + A.esc((x.ticket.table || 'Ticket') + ' · ' + x.ticket.lines.length + ' lines · ' + (tt.ok ? money(tt.gross) : '?') + ' · ' + x.user) + '</button>'; }).join('') || '<div class="why">No tickets awaiting completion</div>';
  }
  function recall(id) {
    var h = st().held || [], i = h.findIndex(function (x) { return x.id === id; }); if (i < 0) { A.msg('Ticket does not exist', 'warn'); return false; }
    var x = h.splice(i, 1)[0]; holdCurrent(); A.S.ticket = x.ticket; A.S.ticket.sel = -1; st().held = (st().held || []).filter(function (y) { return y.id !== id; });   // the held row is DELETED on recall (JTicketsBagShared.setActiveTicket :162)
    A.persist(); A.log('§TILL_HELD recall id=' + id + ' lines=' + x.ticket.lines.length + ' held_left=' + st().held.length); return true;
  }
  async function bag(name) {
    if (name === 'Add New Ticket') { holdCurrent(); freshTicket(); A.log('§TILL_HELD new held=' + (st().held || []).length); }
    else if (name === 'Tickets awaiting completion') { A.go('heldlist'); }
    else if (name === 'Delete') { if (await ask('Are you sure you want to Delete the current Order?')) { st().shift.removed = (st().shift.removed || 0) + 1; A.log('§TILL_LINEREMOVED Void "Ticket Deleted" removed=' + st().shift.removed); freshTicket(); } }
    else if (name === 'Reprint Ticket') { A.go('reprintlist'); }
    else if (name === 'Quick LogOff') { holdCurrent(); freshTicket(); A.S.cashier = null; A.$('#s-who').textContent = ''; A.log('§TILL_QUICKLOGOFF held=' + (st().held || []).length); A.go('login'); }
  }
  async function renderReprintList() {
    var keys = (await A.depositedDocNos()).sort(function (a, b) { return Number(b.replace(/^.*-[SRP]/, '')) - Number(a.replace(/^.*-[SRP]/, '')); });
    A.$('#rl-list').innerHTML = keys.map(function (k) { return '<button data-reprint="' + A.esc(k) + '">' + A.esc(k) + '</button>'; }).join('') || '<div class="why">No tickets</div>';
  }

  // ── U6 button bar ──
  function inputRate() { var v = parseFloat(A.S.pad.price); return A.S.pad.inValid && !isNaN(v) ? v / 100 : 0; }
  function pct(r) { return String(Math.round(r * 10000) / 100) + '%'; }
  function underLimit(lines) {   // legacy refuses a line priced under the price list's PriceLimit (Import Orders: UnderLimitPrice); the till refuses first
    return lines.some(function (l) { var p = A.S.prods.filter(function (x) { return x.pid === l.pid; })[0]; return p && Number(p.lim) > 0 && l.price < Number(p.lim) - 1e-9; });
  }
  function bar(name) {
    var t = A.S.ticket, i = t.sel, rate = inputRate();
    if (name === 'Total discount') {          // script.Totaldiscount.txt : every line price - abs(price * rate * 100) / 100
      var tt = A.curTotals();
      if (i < 0 || !(tt.ok && tt.gross > 0) || !(rate > 0)) { A.msg('Select a line and type the discount % first', 'warn'); return; }
      var nl = t.lines.map(function (l) { return { pid: l.pid, name: l.name + ' - Item Discount @  ' + pct(rate), qty: l.qty, price: l.price - Math.abs(l.price * rate * 100) / 100, disc: l.disc }; });
      if (underLimit(nl.filter(function (l) { return !l.disc; }))) { A.S.pad = A.P.zero(); A.renderPad(); A.msg('That discount takes a line under its price limit; head office would refuse the ticket', 'warn'); A.log('§TILL_DISCOUNT refused under-limit total rate=' + rate); return; }
      t.lines.forEach(function (l, j) { l.name = nl[j].name; l.price = nl[j].price; });
      A.log('§TILL_DISCOUNT total rate=' + rate + ' lines=' + t.lines.length);
    } else if (name === 'Line discount') {    // script.Linediscount.txt : a `Line Discount x%` line of price -(price * rate) is inserted after the selected line
      var l = t.lines[i];
      if (!l || l.disc || !(l.price > 0) || !(rate > 0)) { A.msg('Select a line and type the discount % first', 'warn'); return; }
      if (underLimit([{ pid: l.pid, price: l.price - Math.abs(l.price * rate * 100) / 100 }])) { A.S.pad = A.P.zero(); A.renderPad(); A.msg('That discount takes the line under its price limit; head office would refuse the ticket', 'warn'); A.log('§TILL_DISCOUNT refused under-limit line rate=' + rate); return; }
      t.lines.splice(i + 1, 0, { pid: l.pid, name: 'Line Discount ' + pct(rate), qty: l.qty, price: -(Math.abs(l.price * rate * 100) / 100), disc: true }); t.sel = i + 1;
      A.log('§TILL_DISCOUNT line rate=' + rate + ' parent=' + l.pid);
    } else if (name === 'Print preview') {
      var folded = A.C.foldLines(t.lines), tt2 = A.C.totals(folded, A.S.taxEnv);
      var rm = A.C.receiptModel({ type: t.type, number: '(preview)', date: A.nowIso(), terminal: A.S.cfg.tillKey, user: cashier(), lines: t.lines.map(function (x) { return { name: x.name, price: A.C.cents(x.price), qty: x.qty, value: A.C.lineNetCents(x.qty, x.price) }; }), gross: tt2.ok ? tt2.gross : 0, applied: { parts: [] }, change: 0 });
      A.S.lastReceipt = { key: 'preview', model: rm, gross: 0, change: 0, firstCash: false }; A.S.afterReceipt = 'sales'; A.showReceipt(true); return;
    } else if (name === 'Open drawer') { st().shift.nosales = (st().shift.nosales || 0) + 1; A.saveStore(); A.msg('Drawer opened', 'ok'); A.log('§TILL_DRAWER nosales=' + st().shift.nosales); return; }
    else if (name === 'Virtual Keyboard') { toggleKbd(); return; }
    A.S.pad = A.P.zero(); A.persist(); A.renderSales();
  }
  var lastInput = null;
  function toggleKbd() {
    var k = A.$('#vkbd'); k.hidden = !k.hidden; if (k.hidden) return;
    k.innerHTML = '1234567890qwertyuiopasdfghjklzxcvbnm'.split('').map(function (c) { return '<button class="vk" data-vk="' + c + '">' + c + '</button>'; }).join('') + '<button class="vk" data-vk=" ">space</button><button class="vk" data-vk="\b">⌫</button>';
  }

  // ── U10 Edit Sales / U11 Refund ──
  var ES = { ticket: null };
  async function esShow(t) {
    ES.ticket = t; var el = A.$('#es-ticket'), sts = A.$('#es-status');
    ['#es-edit', '#es-refund', '#es-print'].forEach(function (s) { A.$(s).disabled = true; });
    if (!t) { el.textContent = ''; sts.textContent = ''; return; }
    el.textContent = ticketText(t); var done = await refunded(t.key), open = t.tag === A.shiftTag(), sent = !!(st().sent || {})[t.key];
    A.$('#es-print').disabled = false;
    A.$('#es-edit').disabled = !(t.kind === 'S' && !done && open && !sent);       // JTicketsBagTicket.printTicket :256-262 (not refunded, cash still active) + §17.3 (a key that went out in a Visit is not rewritten)
    A.$('#es-refund').disabled = !(t.kind === 'S' && !done);
    sts.textContent = done ? 'This ticket has been refunded' : t.kind !== 'S' ? 'A refund ticket' : !open ? 'Closed cash: Edit is not available' : sent ? 'Already sent to head office: use Refund' : '';
    A.log('§TILL_ES key=' + t.key + ' kind=' + t.kind + ' refunded=' + done + ' open_shift=' + open + ' sent=' + sent + ' edit_enabled=' + !A.$('#es-edit').disabled + ' refund_enabled=' + !A.$('#es-refund').disabled);
  }
  async function esFind() {
    var kind = A.$('#u10 input[name="es-kind"]:checked').value, n = Number(A.$('#es-number').value), key = A.C.keyPrefix(A.S.cfg.orgValue, A.S.cfg.userValue, kind) + n;
    var t = n > 0 ? await loadTicket(key) : null; if (!t) A.msg('The ticket does not exist', 'warn'); await esShow(t); A.$('#es-number').value = '';
  }
  async function esFinder() {
    var kind = A.$('#u10 input[name="es-kind"]:checked').value, keys = (await A.depositedDocNos(kind)).sort(function (a, b) { return Number(a.replace(/^.*-[SRP]/, '')) - Number(b.replace(/^.*-[SRP]/, '')); });
    A.$('#es-list').innerHTML = keys.map(function (k) { return '<button data-es-key="' + A.esc(k) + '">' + A.esc(k) + '</button>'; }).join('') || '<div class="why">No tickets</div>';
  }
  function esEdit() {
    var t = ES.ticket; holdCurrent();
    A.S.ticket = { type: 'S', lines: t.lines.map(function (l) { return { pid: l.pid, name: l.name, qty: l.qty, price: l.price }; }), sel: -1, pickup: ((st().rcpt || {})[t.key] || {}).pickup || null, old: t.key, orig: null, table: null };
    A.persist(); A.log('§TILL_EDIT load key=' + t.key + ' lines=' + t.lines.length); A.go('sales');
  }
  var RF = { chosen: [] };
  function rfRender() {
    var t = ES.ticket; if (!t) { A.$('#rf-lines').innerHTML = ''; A.$('#rf-orig').textContent = ''; return; } A.$('#rf-orig').textContent = t.key;
    A.$('#rf-lines').innerHTML = t.lines.map(function (l, i) { var on = RF.chosen.indexOf(i) >= 0; return '<div data-rf="' + i + '">' + A.esc(l.name) + ' x' + l.qty + ' ' + money(A.C.cents(l.price)) + ' <button data-rf-add="' + i + '"' + (on ? ' disabled' : '') + '>' + (on ? 'Added' : 'Add') + '</button></div>'; }).join('');
  }
  function rfGo() {
    var t = ES.ticket; if (!RF.chosen.length) { A.msg('Add at least one line to refund', 'warn'); return; }
    holdCurrent();
    A.S.ticket = { type: 'R', lines: RF.chosen.map(function (i) { var l = t.lines[i]; return { pid: l.pid, name: l.name, qty: -l.qty, price: l.price }; }), sel: -1, pickup: null, old: null, orig: t.key, table: null };   // JTicketsBagTicket.java:544-564
    A.persist(); A.log('§TILL_REFUND start orig=' + t.key + ' lines=' + RF.chosen.length); A.go('sales');
  }

  // ── U12 Customer Payment ──
  var CP = { cust: null };
  async function cpSearch() {
    var f = A.$('#cp-find').value.trim().replace(/'/g, "''");
    var cs = await A.rows("SELECT c_bpartner_id AS id, value, name, COALESCE(so_creditlimit,0) AS lim, COALESCE(so_creditused,0) AS used FROM c_bpartner WHERE iscustomer='Y' AND isactive='Y' AND ad_client_id=" + Number(A.S.cfg.client) + (f ? " AND (name LIKE '%" + f + "%' OR value LIKE '%" + f + "%')" : '') + ' ORDER BY name LIMIT 20');
    A.$('#cp-list').innerHTML = cs.map(function (c) { return '<button data-cust="' + c.id + '" data-v="' + A.esc(c.value) + '" data-n="' + A.esc(c.name) + '" data-lim="' + c.lim + '" data-used="' + c.used + '">' + A.esc(c.name) + '</button>'; }).join('') || '<div class="why">No customer</div>';
  }
  function cpPick(b) {
    CP.cust = { id: Number(b.getAttribute('data-cust')), value: b.getAttribute('data-v'), name: b.getAttribute('data-n'), lim: Number(b.getAttribute('data-lim')), used: Number(b.getAttribute('data-used')) };
    A.$('#cp-card').hidden = false; A.$('#cp-name').textContent = CP.cust.name; A.$('#cp-max').textContent = money(A.C.cents(CP.cust.lim)); A.$('#cp-debt').textContent = money(A.C.cents(CP.cust.used)); A.$('#cp-amount').value = money(A.C.cents(CP.cust.used)); A.$('#cp-pay').disabled = false;
  }

  // ── U13 Payments ──
  function pmRender() {
    var seq = st().shift.seq, l = (st().cashio || []).filter(function (c) { return c.shift === seq; });
    A.$('#pm-list').innerHTML = l.map(function (c) { return '<div data-cashio="' + c.id + '">' + (c.reason === 'cashin' ? 'Cash (In)' : 'Cash (Out)') + ' ' + money(A.C.cents(c.amount)) + ' ' + A.esc(c.notes || '') + ' <button data-pm-del="' + c.id + '">Delete</button></div>'; }).join('');
  }
  function pmSave() {
    var amt = A.C.cents(A.$('#pm-amount').value), reason = A.$('#pm-reason').value; if (!(amt > 0)) { A.msg('Enter an amount', 'warn'); return; }
    var e = { id: uid('c'), shift: st().shift.seq, reason: reason, amount: (reason === 'cashout' ? -amt : amt) / 100, notes: A.$('#pm-notes').value, at: A.nowIso() };   // PaymentsEditor.java:159-166 : the reason signs the total (PaymentReasonNegative)
    (st().cashio = st().cashio || []).push(e); A.saveStore(); A.log('§TILL_CASHIO ' + reason + ' ' + e.amount + ' shift=' + e.shift); A.$('#pm-amount').value = ''; A.$('#pm-notes').value = ''; pmRender();
  }

  // ── Voucher (till-local ledger) ──
  function voRender() {
    var v = st().vouchers || [];
    A.$('#vo-number').value = 'V' + String((st().voucherSeq || 0) + 1).padStart(6, '0');
    A.$('#vo-list').innerHTML = v.map(function (x) { return '<div data-voucher="' + x.number + '" data-status="' + x.status + '">' + x.number + ' · ' + A.esc(x.customer) + ' · ' + money(A.C.cents(x.amount)) + ' · ' + (x.status === 'A' ? 'Active' : 'Used') + '</div>'; }).join('');
  }
  function voIssue() {
    var amt = A.C.cents(A.$('#vo-amount').value); if (!(amt > 0)) { A.msg('Enter an amount', 'warn'); return; }
    var n = A.$('#vo-number').value; st().voucherSeq = (st().voucherSeq || 0) + 1; (st().vouchers = st().vouchers || []).push({ number: n, customer: A.$('#vo-customer').value, amount: amt / 100, status: 'A' }); A.saveStore(); A.log('§TILL_VOUCHER issue ' + n + ' ' + amt / 100); A.$('#vo-amount').value = ''; voRender();
  }
  function voRedeem() {
    var n = A.$('#vo-redeem-number').value.trim(), v = (st().vouchers || []).filter(function (x) { return x.number === n; })[0], m = A.$('#vo-msg');
    if (!v) m.textContent = 'No such voucher'; else if (v.status !== 'A') m.textContent = 'Voucher already used'; else { v.status = 'U'; A.saveStore(); m.textContent = 'Voucher redeemed ' + money(A.C.cents(v.amount)); A.log('§TILL_VOUCHER redeem ' + n); }
    voRender();
  }

  // ── Check In/Out (shifts) ──
  function prState() { var u = A.S.cashier ? A.S.cashier.id : 0, l = (st().presence || []).filter(function (x) { return x.user === u; }); return l.length ? l[l.length - 1] : null; }
  function prRender() {
    var last = prState(), inNow = last && !last.end; A.$('#pr-in').disabled = !!inNow; A.$('#pr-out').disabled = !inNow;
    A.$('#pr-msg').textContent = !last ? '' : inNow ? cashier() + ' has Checked In at ' + last.start : cashier() + ' has Checked Out at ' + last.end;
  }
  function prIn() { (st().presence = st().presence || []).push({ user: A.S.cashier.id, name: cashier(), start: A.nowIso(), end: null }); A.saveStore(); A.log('§TILL_PRESENCE in ' + cashier()); prRender(); }
  function prOut() { var l = prState(); if (l && !l.end) { l.end = A.nowIso(); A.saveStore(); A.log('§TILL_PRESENCE out ' + cashier()); } prRender(); }

  // ── Pick-up number reset ──
  function puRender() { A.$('#pu-next').textContent = (st().pickup || 0) + 1; A.$('#pu-done').textContent = ''; A.$('#pu-confirm').hidden = true; }

  // ── restaurant (mode=restaurant) ──
  function seedFloor() {
    if (st().places) return;
    st().floors = [{ id: '0', name: 'Restaurant floor' }]; st().places = [];   // SQLite-create.sql:652-683 : Table 1..24, 6 per row at x=100+150k, y=50+100r, 90x45
    for (var i = 0; i < 24; i++) st().places.push({ id: String(i + 1), name: 'Table ' + (i + 1), x: 100 + 150 * (i % 6), y: 50 + 100 * Math.floor(i / 6), floor: '0', seats: 1, w: 90, h: 45 });
    st().reservations = st().reservations || []; A.saveStore();
  }
  function flRender() {
    var held = st().held || [];
    A.$('#fl-map').innerHTML = (st().places || []).map(function (p) {
      var h = held.filter(function (x) { return x.ticket.table === p.name; })[0], cur = A.S.ticket.table === p.name && A.S.ticket.lines.length;
      return '<button class="place" data-place="' + A.esc(p.name) + '" data-occupied="' + (h || cur ? 1 : 0) + '" style="position:absolute;left:' + (p.x * 0.9) + 'px;top:' + (p.y * 0.9) + 'px;width:' + (p.w * 1.2) + 'px;height:' + (p.h * 1.3) + 'px;' + (h || cur ? 'background:#f5c6c6' : '') + '">' + A.esc(p.name) + (h || cur ? '<br>Waiting : ' + A.esc((h ? h.at : A.S.ticket.at || '').slice(11, 16)) : '') + '</button>';
    }).join('');
    A.$('#fl-state').textContent = (st().places || []).length + ' tables';
  }
  function openTable(name, customer) {
    var h = (st().held || []).filter(function (x) { return x.ticket.table === name; })[0];
    if (A.S.ticket.lines.length && A.S.ticket.table !== name) { holdCurrent(); }
    if (h) { st().held = st().held.filter(function (x) { return x !== h; }); A.S.ticket = h.ticket; }
    else if (A.S.ticket.table !== name) { A.S.ticket = A.newTicket(); A.S.ticket.table = name; if (customer) A.S.ticket.customer = customer; }
    A.S.ticket.at = A.S.ticket.at || A.nowIso(); A.S.afterReceipt = 'floors'; A.persist(); A.log('§TILL_TABLE open ' + name + ' recalled=' + !!h); A.go('sales');
  }
  function rsRender() {
    A.$('#rs-place').innerHTML = (st().places || []).map(function (p) { return '<option>' + A.esc(p.name) + '</option>'; }).join('');
    A.$('#rs-list').innerHTML = (st().reservations || []).map(function (r) { return '<div data-res="' + r.id + '">' + A.esc(r.customer) + ' · ' + r.chairs + ' · ' + A.esc(r.date) + ' · ' + A.esc(r.place || '') + (r.in ? ' · checked in' : ' <button data-res-in="' + r.id + '">Check-In Now</button>') + '</div>'; }).join('');
  }
  function rsSave() {
    var r = { id: uid('r'), customer: A.$('#rs-customer').value, chairs: Number(A.$('#rs-chairs').value) || 1, date: A.$('#rs-date').value, notes: A.$('#rs-notes').value, place: A.$('#rs-place').value, in: false };
    if (!r.customer) { A.msg('Select a person', 'warn'); return; }
    (st().reservations = st().reservations || []).push(r); A.saveStore(); A.log('§TILL_RESERVATION save ' + r.customer + ' ' + r.place); rsRender();
  }

  function init(api) {
    A = api; var S = A.S, H = A.hooks, s = S.store;
    ['held', 'cashio', 'presence', 'vouchers', 'reservations'].forEach(function (k) { s[k] = s[k] || []; }); s.sent = s.sent || {}; s.rcpt = s.rcpt || {}; s.pickup = s.pickup || 0;
    if (S.mode === 'restaurant') { seedFloor(); A.$('#bag').hidden = true; A.$('#floorbar').hidden = false; }
    else if (S.mode === 'simple') { A.$('#bag').hidden = true; A.log('§TILL_SETUP_SIMPLE no shared-ticket bag (JTicketsBag.createTicketsBag, mode simple)'); }
    H.heldlist = renderHeld; H.reprintlist = renderReprintList; H.editsales = function () { esShow(null); A.$('#es-list').innerHTML = ''; }; H.refund = function () { RF.chosen = []; rfRender(); };
    H.custpay = function () { CP.cust = null; A.$('#cp-card').hidden = true; A.$('#cp-pay').disabled = true; A.$('#cp-list').innerHTML = ''; A.$('#cp-find').value = ''; cpSearch(); };
    H.payments = pmRender; H.vouchers = voRender; H.presence = prRender; H.pickup = puRender; H.floors = flRender; H.reservations = rsRender;
    document.addEventListener('focusin', function (ev) { if (/INPUT|TEXTAREA/.test(ev.target.tagName)) lastInput = ev.target; });
    document.addEventListener('click', async function (ev) {
      var b = ev.target.closest && ev.target.closest('button'); if (!b || b.disabled) return;
      var d = b.getAttribute('data-btn'), id = b.id;
      if (b.closest('#bag') && d) bag(d);
      else if (b.closest('#scriptbar') && d) bar(d);
      else if (d === 'Reprint Last Ticket') { var l = st().last; if (!l) { A.msg('The ticket does not exist', 'warn'); return; } reprint(l.key); }
      else if (b.closest('#floorbar') && d) { if (d === 'Reservations') A.go('reservations'); else if (d === 'Tables') { holdCurrent(); freshTicket(); A.go('floors'); } else if (d === 'Reload') { A.renderSales(); } }
      else if (b.hasAttribute('data-held')) { if (recall(b.getAttribute('data-held'))) A.go('sales'); }
      else if (id === 'hl-cancel' || id === 'rl-cancel') A.go('sales');
      else if (b.hasAttribute('data-reprint')) reprint(b.getAttribute('data-reprint'));
      else if (id === 'es-find') esFind(); else if (id === 'es-finder') esFinder(); else if (id === 'es-back') A.go('menu');
      else if (b.hasAttribute('data-es-key')) { esShow(await loadTicket(b.getAttribute('data-es-key'))); }
      else if (id === 'es-edit') esEdit(); else if (id === 'es-print') reprint(ES.ticket.key); else if (id === 'es-refund') { RF.chosen = []; A.go('refund'); }
      else if (b.hasAttribute('data-rf-add')) { RF.chosen.push(Number(b.getAttribute('data-rf-add'))); rfRender(); }
      else if (id === 'rf-all') { RF.chosen = ES.ticket.lines.map(function (_, i) { return i; }); rfRender(); } else if (id === 'rf-go') rfGo(); else if (id === 'rf-back') A.go('editsales');
      else if (id === 'cp-search') cpSearch(); else if (b.hasAttribute('data-cust')) cpPick(b);
      else if (id === 'cp-pay') { var c = A.C.cents(A.$('#cp-amount').value); if (!(c > 0)) { A.msg('Enter an amount', 'warn'); return; } A.openPay('P', c, CP.cust); } else if (id === 'cp-back') A.go('menu');
      else if (id === 'pm-save') pmSave(); else if (b.hasAttribute('data-pm-del')) { st().cashio = st().cashio.filter(function (c) { return c.id !== b.getAttribute('data-pm-del'); }); A.saveStore(); pmRender(); } else if (id === 'pm-back') A.go('menu');
      else if (id === 'vo-issue') voIssue(); else if (id === 'vo-redeem') voRedeem(); else if (id === 'vo-back') A.go('menu');
      else if (id === 'pr-in') prIn(); else if (id === 'pr-out') prOut(); else if (id === 'pr-back') A.go('menu');
      else if (id === 'pu-reset') { A.$('#pu-confirm').hidden = false; } else if (id === 'pu-confirm') { st().pickup = 0; A.saveStore(); A.log('§TILL_PICKUP reset'); puRender(); A.$('#pu-done').textContent = 'Reset complete.'; } else if (id === 'pu-back') A.go('menu');
      else if (b.hasAttribute('data-place')) openTable(b.getAttribute('data-place'));
      else if (id === 'fl-reload') flRender(); else if (id === 'fl-res') A.go('reservations'); else if (id === 'fl-back') A.go('menu');
      else if (id === 'rs-save') rsSave(); else if (id === 'rs-tables') A.go('floors'); else if (id === 'rs-back') A.go('menu');
      else if (b.hasAttribute('data-res-in')) { var r = st().reservations.filter(function (x) { return x.id === b.getAttribute('data-res-in'); })[0]; r.in = true; A.saveStore(); openTable(r.place, r.customer); }
      else if (b.classList.contains('vk')) { var ch = b.getAttribute('data-vk'); if (lastInput) { lastInput.value = ch === '\b' ? lastInput.value.slice(0, -1) : lastInput.value + ch; lastInput.dispatchEvent(new Event('input', { bubbles: true })); } }
    }, true);
    A.log('§TILL_EXT ready mode=' + S.mode + ' held=' + s.held.length);
  }
  window.TillExt = { init: init };
})();
