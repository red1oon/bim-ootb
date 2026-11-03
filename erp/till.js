// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — till.js: the Unicenta-alike till page. READ THE LOG (§TILL_* lines), the exit code is not evidence.
// Implementing bim-compiler prompts/POS_PLUGIN_LOCAL_FIRST.md §15 (screens U1 U2 U3 U4 U5 U8 U9 U14) - Witness: W-TILL-DEPOSIT / -OFFLINE / -PAD / -UNICENTA-PARITY (erp/tests/witness_till.js).
// The till DEPOSITS: one atomic op group per ticket of I_Order lines + I_Payment tenders (legacy import rows), written through the device's own engine (idempiere.html?team=1 in a hidden frame, like borrower.js);
//   it writes ZERO C_Order / M_InOut / C_Invoice / C_Payment / Fact_Acct rows (FL-8). Prices/taxes come from the engine's functions (TillCore.totals -> ERPEngine.orderTaxes). All screen labels are Unicenta 3.81 (`pending-5x`).
(function () {
  'use strict';
  var E = null, P = window.TillPad, C = window.TillCore, R = window.TillRegistry;
  var $ = function (s) { return document.querySelector(s); }, $$ = function (s) { return [].slice.call(document.querySelectorAll(s)); };
  var q = function (s) { return "'" + String(s == null ? '' : s).replace(/'/g, "''") + "'"; };
  function log(s) { try { console.log(s); } catch (e) { /* logging never breaks the page */ } }
  var chain = Promise.resolve(); function serial(fn) { var p = chain.then(fn, fn); chain = p.catch(function () {}); return p; }
  var S = { cfg: null, cashier: null, ticket: null, pad: P.zero(), screen: 'login', cat: null, catPath: [], prods: [], cats: [], store: null, taxEnv: null, pay: null, deposited: 0 };

  // ── engine bridge ──
  function rows(sql) { return new Promise(function (res) { E.__crud.modelRun({ table: 'c_order', timing: 'PROCESS', fn: function (trx) { res(trx.q(sql)); return { ok: true }; } }, function () {}); }); }
  function depositGroup(ops) { return new Promise(function (res) { var t = setTimeout(function () { res({ committed: false, reason: 'timeout' }); }, 15000); E.__crud.applyOpGroup(ops, function (r) { clearTimeout(t); res(r); }); }); }
  var create = function (table, f) { return { op_type: 'CRUD_CREATE', key: table, table: table, verb: 'create', fields: f }; };

  // ── the device-local store (a device fact, as Unicenta's CLOSEDCASH lives in the terminal's own DB; §15.2) ──
  function skey() { return 'till.v1:' + S.cfg.tillKey; }
  function loadStore() { try { var s = localStorage.getItem(skey()); if (s) return JSON.parse(s); } catch (e) { /* private window */ } return null; }
  function saveStore() { try { localStorage.setItem(skey(), JSON.stringify(S.store)); } catch (e) { /* kept in memory */ } }
  function today() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function nowIso() { return new Date().toISOString().replace('T', ' ').slice(0, 19); }
  function shiftTag() { return 'POS shift ' + S.cfg.tillKey + '/' + S.store.shift.seq; }

  // ── master data ──
  async function loadConfig() {
    var pos = (await rows('SELECT * FROM c_pos ORDER BY c_pos_id LIMIT 1'))[0];
    if (!pos) throw new Error('no c_pos station in this tenant');
    var user = (await rows('SELECT ad_user_id AS id, name, value FROM ad_user WHERE ad_user_id=' + Number(E.APP.actor)))[0] || {};
    var org = (await rows('SELECT ad_org_id AS id, value FROM ad_org WHERE ad_org_id=' + Number(pos.ad_org_id)))[0];
    var iso = ((await rows("SELECT iso_code FROM c_currency WHERE c_currency_id = (SELECT c_currency_id FROM c_acctschema WHERE ad_client_id=" + Number(pos.ad_client_id) + " ORDER BY c_acctschema_id LIMIT 1)"))[0] || {}).iso_code || 'USD';
    var plv = (await rows('SELECT m_pricelist_version_id AS v FROM m_pricelist_version WHERE m_pricelist_id=' + Number(pos.m_pricelist_id) + ' ORDER BY validfrom DESC, m_pricelist_version_id DESC LIMIT 1'))[0];
    S.cfg = { pos: pos, client: pos.ad_client_id, org: pos.ad_org_id, orgValue: org ? org.value : String(pos.ad_org_id), userId: user.id, userValue: user.value || ('u' + user.id), iso: iso, plv: plv && plv.v, host: null };
    S.cfg.tillKey = S.cfg.orgValue + '-' + S.cfg.userValue;
    var prods = await rows('SELECT p.m_product_id AS pid, p.value AS value, p.name AS name, p.upc AS upc, p.c_uom_id AS uom, p.m_product_category_id AS cat, p.c_taxcategory_id AS taxcat, pp.pricestd AS price FROM m_product p JOIN m_productprice pp ON pp.m_product_id=p.m_product_id AND pp.m_pricelist_version_id=' + Number(S.cfg.plv) + " WHERE p.isactive='Y' AND pp.isactive='Y' ORDER BY p.value");
    S.prods = prods;
    var cats = await rows("SELECT m_product_category_id AS id, name, m_product_category_parent_id AS parent FROM m_product_category WHERE isactive='Y' AND ad_client_id=" + Number(pos.ad_client_id) + ' ORDER BY name');
    S.cats = cats;
    // the tax inputs: the same rows the engine's Import Orders uses - the cash-trx partner (AD_ClientInfo.C_BPartnerCashTrx_ID, ImportOrder.js 'Set Default BP') and the default SO price list's tax flag
    var bpId = ((await rows('SELECT c_bpartnercashtrx_id AS b FROM ad_clientinfo WHERE ad_client_id=' + Number(pos.ad_client_id)))[0] || {}).b;
    var incl = ((await rows("SELECT istaxincluded AS t FROM m_pricelist WHERE m_pricelist_id=(SELECT MAX(m_pricelist_id) FROM m_pricelist WHERE isdefault='Y' AND issopricelist='Y' AND ad_client_id=" + Number(pos.ad_client_id) + ')'))[0] || {}).t === 'Y';
    var taxes = await rows('SELECT * FROM c_tax WHERE ad_client_id=' + Number(pos.ad_client_id));
    var one = async function (sql) { return (await rows(sql))[0] || null; };
    var loc = async function (id) { return id ? one('SELECT c_country_id, c_region_id, postal FROM c_location WHERE c_location_id=' + Number(id)) : null; };
    var bp = (bpId ? await one('SELECT istaxexempt, deliveryviarule FROM c_bpartner WHERE c_bpartner_id=' + Number(bpId)) : null) || {};
    var bl = bpId ? await one("SELECT c_location_id AS l FROM c_bpartner_location WHERE c_bpartner_id=" + Number(bpId) + " AND isbillto='Y' AND isactive='Y' ORDER BY c_bpartner_location_id") : null;
    var oi = await one('SELECT c_location_id AS l FROM ad_orginfo WHERE ad_org_id=' + Number(pos.ad_org_id)), wl = await one('SELECT c_location_id AS l FROM m_warehouse WHERE m_warehouse_id=' + Number(pos.m_warehouse_id));
    var dv = await one("SELECT c.defaultvalue AS d FROM ad_column c JOIN ad_table t ON t.ad_table_id=c.ad_table_id WHERE t.tablename='C_Order' AND c.columnname='DeliveryViaRule'");
    var locs = { from: await loc(oi && oi.l), to: await loc(bl && bl.l), wh: await loc(wl && wl.l) };
    var taxcatOf = {}; prods.forEach(function (p) { taxcatOf[p.pid] = p.taxcat; });
    var children = {}; taxes.forEach(function (t) { if (t.parent_tax_id) (children[t.parent_tax_id] = children[t.parent_tax_id] || []).push(t); });
    var Eng = E.ERPEngine, day = today();
    S.taxEnv = { Eng: Eng, included: incl, taxById: function (id) { return taxes.filter(function (t) { return String(t.c_tax_id) === String(id); })[0]; },
      taxChildren: function (id) { return (children[id] || []).filter(function (t) { return t.isactive === 'Y'; }); },
      taxOf: function (pid) { var r = Eng.taxLookup({ taxes: taxes, taxCategoryId: taxcatOf[pid], isSOTrx: true, billDate: day, billFrom: locs.from, billTo: locs.to, warehouse: locs.wh, deliveryViaRule: bp.deliveryviarule || (dv && dv.d), bpTaxExempt: bp.istaxexempt }); return r; } };
    S.taxCats = await rows("SELECT c_taxcategory_id AS id, name FROM c_taxcategory WHERE isactive='Y' AND ad_client_id=" + Number(pos.ad_client_id) + ' ORDER BY name');
  }

  // ── shift + ticket ──
  function freshShift(seq) { return { host: S.cfg.tillKey, seq: seq, start: nowIso(), end: null, nosales: 0, removed: 0 }; }
  function newTicket() { return { type: 'S', lines: [], sel: -1 }; }
  function persist() { S.store.ticket = S.ticket; saveStore(); }
  function depositedDocNos() { return rows('SELECT DISTINCT documentno FROM i_order WHERE documentno LIKE ' + q(C.keyPrefix(S.cfg.orgValue, S.cfg.userValue, 'S') + '%')).then(function (r) { return r.map(function (x) { return x.documentno; }); }); }

  function msg(t, kind) { var el = $('#msg'); el.hidden = !t; el.textContent = t || ''; el.setAttribute('data-kind', kind || ''); if (t) log('§TILL_MSG ' + (kind || 'info') + ' ' + t); }
  function go(name) {
    S.screen = name; ['u1', 'u2', 'u3', 'u8', 'u9', 'u14'].forEach(function (id) { $('#' + id).classList.remove('on'); });
    var map = { login: 'u1', menu: 'u2', sales: 'u3', pay: 'u8', receipt: 'u9', close: 'u14' };
    if (map[name]) $('#' + map[name]).classList.add('on'); else { msg('This panel is not in this release', 'info'); return false; }
    if (name === 'close') renderClose(); if (name === 'sales') { renderSales(); loadConfig().then(renderSales); }   // master data (prices, taxes) is re-read on every entry to Sales: a Visit may have delivered changes
    return true;
  }

  // ── U1 / U2 ──
  async function renderLogin() {
    var us = await rows("SELECT u.ad_user_id AS id, u.name FROM ad_user u WHERE u.isactive='Y' AND u.ad_client_id=" + Number(S.cfg.client) + ' AND EXISTS (SELECT 1 FROM ad_user_roles r WHERE r.ad_user_id=u.ad_user_id AND r.isactive=\'Y\') ORDER BY u.name');
    $('#users').innerHTML = us.map(function (u) { return '<button class="u-user" data-user-id="' + u.id + '">' + esc(u.name) + '</button>'; }).join('');
  }
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  function renderMenu() {
    var built = { Sales: 'sales', 'Close Cash': 'close' };
    $('#panels').innerHTML = R.MENU.map(function (n) { var on = !!built[n]; return '<button data-panel="' + esc(n) + '"' + (on ? '' : ' disabled data-disabled-reason="not in this release"') + '>' + esc(n) + '</button>'; }).join('');
  }

  // ── U3 / U4 / U5 ──
  function ctxPad() { return { selected: S.ticket.sel >= 0 && S.ticket.sel < S.ticket.lines.length, lines: S.ticket.lines.length, canEdit: true, type: S.ticket.type }; }
  function renderPad() { $('#price').textContent = S.pad.price; $('#por').textContent = S.pad.por; }
  function initPad() {
    $('#pad').innerHTML = ['7', '8', '9', '*', '4', '5', '6', '-', '1', '2', '3', '+', '0', '.', '=', '\u007f'].map(function (k) { return '<button class="key" data-key="' + k + '">' + (k === '\u007f' ? 'C' : k) + '</button>'; }).join('');
  }
  function press(ch) {
    var r = P.press(S.pad, ch, ctxPad()); S.pad = r.state; var ef = r.effect || {};
    log('§TILL_PAD key=' + JSON.stringify(ch) + ' -> effect=' + ef.type + (ef.why ? '(' + ef.why + ')' : '') + ' price=' + S.pad.price + ' por=' + S.pad.por);
    performEffect(ef); renderPad(); return ef;
  }
  function performEffect(ef) {
    var t = S.ticket, l = t.lines[t.sel];
    if (ef.type === 'incLine') { l.qty = Number(l.qty) + ef.delta; }
    else if (ef.type === 'decLine') { l.qty = Number(l.qty) - 1; if (l.qty <= 0) removeLine(t.sel); }
    else if (ef.type === 'setLine') { l.qty = ef.qty; }
    else if (ef.type === 'addProduct') { /* handled by the product button */ }
    else if (ef.type === 'barcode') { var p = S.prods.filter(function (x) { return x.upc === ef.code || x.value === ef.code; })[0]; if (p) addLine(p, 1); else { msg(ef.code + ' - no such product', 'warn'); } }
    else if (ef.type === 'addFree' || ef.type === 'negateLine') { msg('A free-price or negative line has no legacy import mapping in this release (Import Orders needs a product)', 'warn'); }
    else if (ef.type === 'pay') { openPay(); }
    else if (ef.type === 'beep') { /* Unicenta beeps; the till stays silent and unchanged */ }
    if (ef.type !== 'pay') { persist(); renderSales(); }
  }
  function addLine(p, qty) {
    var t = S.ticket, ex = t.lines.filter(function (l) { return l.pid === p.pid; })[0];   // Unicenta merges a repeated product into its line (JPanelTicket.addTicketLine)
    if (ex) { ex.qty = Number(ex.qty) + qty; t.sel = t.lines.indexOf(ex); } else { t.lines.push({ pid: p.pid, name: p.name, qty: qty, price: Number(p.price) }); t.sel = t.lines.length - 1; }
    persist(); renderSales(); log('§TILL_LINE add pid=' + p.pid + ' qty=' + qty + ' lines=' + t.lines.length);
  }
  function removeLine(i) { S.ticket.lines.splice(i, 1); S.ticket.sel = Math.min(S.ticket.sel, S.ticket.lines.length - 1); S.store.shift.removed = (S.store.shift.removed || 0) + 1; }
  function curTotals() { return C.totals(S.ticket.lines, S.taxEnv); }
  function renderSales() {
    var t = S.ticket;
    $('#tl').innerHTML = t.lines.map(function (l, i) { return '<tr class="line' + (i === t.sel ? ' sel' : '') + '" data-i="' + i + '"><td>' + esc(l.name) + '</td><td>' + C.money(C.cents(l.price)) + '</td><td>x' + l.qty + '</td><td>' + C.money(C.lineNetCents(l.qty, l.price)) + '</td></tr>'; }).join('');
    var tt = curTotals();
    $('#t-sub').textContent = tt.ok ? C.money(tt.net) : '?'; $('#t-tax').textContent = tt.ok ? C.money(tt.tax) : '?'; $('#t-tot').textContent = tt.ok ? C.money(tt.gross) : '?';
    renderCats(); renderPad();
  }
  function childrenOf(id) { return S.cats.filter(function (c) { return (c.parent == null || c.parent === '' ? null : Number(c.parent)) === id; }); }
  function renderCats() {
    var cur = S.catPath.length ? S.catPath[S.catPath.length - 1] : null, kids = childrenOf(cur);
    var hasProd = function (id) { return S.prods.some(function (p) { return Number(p.cat) === Number(id); }) || childrenOf(Number(id)).some(function (c) { return hasProd(c.id); }); };
    kids = kids.filter(function (c) { return hasProd(c.id); });
    $('#cats').innerHTML = (cur != null ? '<button data-cat-up="1">&larr;</button>' : '') + kids.map(function (c) { return '<button data-cat="' + c.id + '"' + (S.cat === c.id ? ' class="on"' : '') + '>' + esc(c.name) + '</button>'; }).join('');
    var list = cur == null ? [] : S.prods.filter(function (p) { return Number(p.cat) === Number(cur); });
    $('#products').innerHTML = list.map(function (p) { return '<button class="prod" data-pid="' + p.pid + '">' + esc(p.name) + '<br>' + C.money(C.cents(p.price)) + '</button>'; }).join('');
  }

  // ── U8 payment dialog ──
  function openPay() {
    var tt = curTotals(); if (!tt.ok) { msg('Cannot price the ticket: ' + tt.error, 'bad'); return; }
    S.pay = { gross: tt.gross, parts: [], tab: 'cash', print: true };
    $('#tabs').innerHTML = C.TENDERS.map(function (t) { return '<button data-tab="' + t.name + '"' + (t.live ? '' : ' disabled data-disabled-reason="' + esc(t.reason) + '"') + '>' + t.label + '</button>'; }).join('');
    go('pay'); renderPay();
  }
  function paidSoFar() { return S.pay.parts.reduce(function (a, p) { return a + p.tendered; }, 0); }
  function renderPay() {
    var p = S.pay, left = Math.max(p.gross - p.parts.reduce(function (a, x) { return a + Math.min(x.tendered, x.appliedMax); }, 0), 0);
    $('#paytotal').textContent = C.money(p.gross); $('#remaining').textContent = C.money(left);
    $$('#tabs [data-tab]').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-tab') === p.tab); });
    $('#cardfields').hidden = p.tab !== 'magcard';
    $('#tender-amount').value = C.money(left);
    var ap = C.applyTenders(p.parts.map(function (x) { return { name: x.name, tendered: x.tendered, ref: x.ref, auth: x.auth }; }), p.gross);
    $('#change').textContent = C.money(ap.change);
    $('#parts').innerHTML = p.parts.map(function (x, i) { return '<div data-part="' + i + '">' + C.tenderOf(x.name).label + ' ' + C.money(x.tendered) + (x.ref ? ' ref ' + esc(x.ref) : '') + '</div>'; }).join('');
  }
  function addPart() {
    var p = S.pay, t = C.tenderOf(p.tab), amt = C.cents($('#tender-amount').value);
    if (!t || !t.live) { msg('This tender is not in this release', 'warn'); return false; }
    if (!(amt > 0)) { msg('Enter an amount', 'warn'); return false; }
    var left = p.gross - p.parts.reduce(function (a, x) { return a + Math.min(x.tendered, x.appliedMax); }, 0);
    if (left <= 0) { msg('The ticket is already covered', 'warn'); return false; }
    if (p.tab !== 'cash' && amt > left) { msg('Only cash gives change: the amount is more than remaining', 'warn'); return false; }
    var part = { name: p.tab, tendered: amt, appliedMax: left };
    if (p.tab === 'magcard') { part.ref = $('#card-ref').value.trim(); part.auth = $('#card-auth').value.trim(); if (!part.ref || !part.auth) { msg('Card: the terminal reference and approval code are needed (the card number is never keyed here)', 'warn'); return false; } }
    p.parts.push(part); renderPay(); return true;
  }
  function delPart() { S.pay.parts.pop(); renderPay(); }
  function remainingCents() { var p = S.pay; return p.gross - p.parts.reduce(function (a, x) { return a + Math.min(x.tendered, x.appliedMax); }, 0); }
  async function payOk() {
    var p = S.pay; if (remainingCents() > 0 && !addPart()) return;
    if (remainingCents() > 0) { msg('The ticket is not covered yet: Add Part Payment', 'warn'); return; }
    return serial(async function () {
      var t = S.ticket, tt = curTotals(), ap = C.applyTenders(p.parts.map(function (x) { return { name: x.name, tendered: x.tendered, ref: x.ref, auth: x.auth }; }), tt.gross);
      if (!ap.ok || ap.remaining > 0) { msg('Tenders do not cover the ticket', 'bad'); return; }
      var dn = await depositedDocNos(), prefix = C.keyPrefix(S.cfg.orgValue, S.cfg.userValue, 'S');
      var n = C.nextNumber(prefix, S.store.counters && S.store.counters.S, dn), key = prefix + n;
      var rowsOut = C.depositRows(t, key, ap, { client: S.cfg.client, org: S.cfg.org, iso: S.cfg.iso, uomOf: function (pid) { return (S.prods.filter(function (x) { return x.pid === pid; })[0] || {}).uom; }, day: today(), shiftTag: shiftTag() });
      var ops = rowsOut.orders.map(function (r) { return create('i_order', r); }).concat(rowsOut.payments.map(function (r) { return create('i_payment', r); }));
      var res = await depositGroup(ops);
      if (!res || res.committed !== true) { msg('Could not save the sale on this device: ' + (res && res.reason), 'bad'); log('§TILL_DEPOSIT FAIL ' + (res && res.reason)); return; }
      S.store.counters = S.store.counters || {}; S.store.counters.S = n;
      var terminal = S.cfg.tillKey, rm = C.receiptModel({ type: 'S', number: key, date: nowIso(), terminal: terminal, user: S.cashier ? S.cashier.name : '', lines: t.lines.map(function (l) { return { name: l.name, price: C.cents(l.price), qty: l.qty, value: C.lineNetCents(l.qty, l.price) }; }), gross: tt.gross, applied: ap, change: ap.change });
      S.lastReceipt = { key: key, model: rm, gross: tt.gross, change: ap.change, firstCash: ap.parts[0] && ap.parts[0].name === 'cash' };
      log('§TILL_DEPOSIT key=' + key + ' lines=' + rowsOut.orders.length + ' tenders=' + rowsOut.payments.length + ' gross=' + C.money(tt.gross) + ' ops=' + ops.length + ' gid=' + res.gid + ' core_docs_written=0');
      S.ticket = newTicket(); S.pad = P.zero(); persist(); S.deposited++; $('#s-dep').textContent = 'deposited ' + S.deposited;
      showReceipt(p.print);
    });
  }
  // ── U9 ──
  function showReceipt(print) {
    var r = S.lastReceipt;
    $('#receipt').innerHTML = print ? r.model.map(function (f) { return '<div class="rf" data-f="' + esc(f[0]) + '">' + esc(f.join('  ')) + '</div>'; }).join('') : '<div class="rf" data-f="none">(receipt not printed)</div>';
    var cp = $('#changepop'); cp.hidden = !(r.firstCash && r.change > 0); cp.textContent = 'Change: ' + C.money(r.change);   // Ticket.Close.xml:23-60
    go('receipt');
  }
  // ── U14 Close Cash ──
  async function zFromRows() {
    var tag = shiftTag();
    var os = await rows('SELECT * FROM i_order WHERE description=' + q(tag) + ' ORDER BY i_order_id');
    var keys = os.map(function (r) { return r.documentno; }).filter(function (v, i, a) { return a.indexOf(v) === i; });
    var ps = keys.length ? await rows('SELECT * FROM i_payment WHERE documentno IN (' + keys.map(q).join(',') + ')') : [];
    return C.zTotals(os, ps, S.taxEnv);
  }
  async function renderClose() {
    var z = await zFromRows(), sh = S.store.shift;
    $('#z-seq').textContent = sh.seq; $('#z-start').textContent = sh.start; $('#z-end').textContent = sh.end || '';
    $('#z-tickets').textContent = z.tickets; $('#z-units').textContent = z.units; $('#z-gross').textContent = C.money(z.gross); $('#z-payments').textContent = z.payments;
    $('#z-bytender').innerHTML = Object.keys(z.byTender).sort().map(function (n) { return '<span data-tender="' + n + '">' + n + ' ' + C.money(z.byTender[n]) + '</span> '; }).join('');
    $('#z-net').textContent = C.money(z.net);
    $('#z-taxes').innerHTML = Object.keys(z.taxes).map(function (id) { return '<span data-tax="' + id + '">base ' + C.money(z.taxes[id].base) + ' tax ' + C.money(z.taxes[id].amount) + '</span> '; }).join('');
    $('#zpast').innerHTML = (S.store.closed || []).map(function (c) { return '<option value="' + c.seq + '">' + c.seq + '</option>'; }).join('');
    $('#z-removed').textContent = sh.removed || 0; $('#z-nosales').textContent = sh.nosales || 0;
    log('§TILL_Z seq=' + sh.seq + ' tickets=' + z.tickets + ' units=' + z.units + ' gross=' + C.money(z.gross) + ' net=' + C.money(z.net) + ' payments=' + z.payments + ' bytender=' + JSON.stringify(z.byTender) + ' removed=' + (sh.removed || 0) + ' ok=' + z.ok);
    S.lastZ = z; return z;
  }
  async function reprintZ() {   // JPanelCloseMoneyReprint: a past Z is re-derived from ITS shift's deposited rows
    var seq = Number($('#zpast').value); if (!seq) return;
    var keep = S.store.shift.seq; S.store.shift.seq = seq; var z; try { z = await zFromRows(); } finally { S.store.shift.seq = keep; }
    $('#zdone').textContent = 'Z of shift ' + seq + ': tickets ' + z.tickets + ', sales ' + C.money(z.gross) + ', net ' + C.money(z.net); log('§TILL_ZREPRINT seq=' + seq + ' tickets=' + z.tickets + ' gross=' + C.money(z.gross));
  }
  async function closeCash() {
    var z = await renderClose(), sh = S.store.shift; sh.end = nowIso();
    S.store.closed = (S.store.closed || []).concat([{ seq: sh.seq, start: sh.start, end: sh.end, tickets: z.tickets, gross: z.gross }]);
    S.store.shift = freshShift(sh.seq + 1); saveStore();
    $('#zdone').textContent = 'Cash Closed OK'; log('§TILL_CLOSE closed=' + sh.seq + ' next=' + S.store.shift.seq + ' tickets=' + z.tickets + ' gross=' + C.money(z.gross));
    $('#zconfirm').hidden = true; await renderClose();
  }

  // ── events ──
  function bind() {
    document.addEventListener('click', function (ev) {
      var b = ev.target.closest && ev.target.closest('button'); if (!b || b.disabled) return;
      if (b.classList.contains('u-user')) { S.cashier = { id: Number(b.getAttribute('data-user-id')), name: b.textContent }; $('#s-who').textContent = S.cashier.name; log('§TILL_LOGIN cashier=' + S.cashier.name); go('menu'); }
      else if (b.hasAttribute('data-panel')) { var n = b.getAttribute('data-panel'); go(n === 'Sales' ? 'sales' : n === 'Close Cash' ? 'close' : 'x'); }
      else if (b.classList.contains('key')) press(b.getAttribute('data-key'));
      else if (b.id === 'b-barcode') press('\n');
      else if (b.hasAttribute('data-cat')) { S.catPath.push(Number(b.getAttribute('data-cat'))); S.cat = null; renderCats(); }
      else if (b.hasAttribute('data-cat-up')) { S.catPath.pop(); renderCats(); }
      else if (b.classList.contains('prod')) { var p = S.prods.filter(function (x) { return String(x.pid) === b.getAttribute('data-pid'); })[0]; var r = P.product(S.pad, p); S.pad = r.state; if (r.effect.type === 'addProduct') addLine(p, r.effect.qty); renderPad(); }
      else if (b.id === 'b-remove') { if (S.ticket.sel >= 0) { removeLine(S.ticket.sel); persist(); renderSales(); } }
      else if (b.hasAttribute('data-tab')) { S.pay.tab = b.getAttribute('data-tab'); renderPay(); }
      else if (b.id === 'addpart') addPart(); else if (b.id === 'delpart') delPart();
      else if (b.id === 'pay-ok') { S.pay.print = $('#printtoggle').checked; payOk(); } else if (b.id === 'pay-cancel') { go('sales'); }
      else if (b.id === 'rc-ok') go('sales');
      else if (b.id === 'zprint') { renderClose(); } else if (b.id === 'zclose') { $('#zconfirm').hidden = false; } else if (b.id === 'zconfirm') closeCash(); else if (b.id === 'zback') go('menu'); else if (b.id === 'zreprint') reprintZ();
      else if (b.id === 'visit') visit();
    });
    $('#tl').addEventListener('click', function (ev) { var tr = ev.target.closest('tr'); if (tr) { S.ticket.sel = Number(tr.getAttribute('data-i')); renderSales(); } });
    $('#taxcombo').innerHTML = (S.taxCats || []).map(function (c) { return '<option value="' + c.id + '">' + esc(c.name) + '</option>'; }).join('');
    document.addEventListener('keydown', function (ev) { if (S.screen !== 'sales' || /INPUT|SELECT|TEXTAREA/.test(ev.target.tagName)) return; var k = ev.key === 'Enter' ? '\n' : ev.key === 'Delete' ? '\u007f' : ev.key; if (k.length === 1 && '0123456789.*+-= \n\u007f'.indexOf(k) >= 0) press(k); });
    window.addEventListener('online', netChip); window.addEventListener('offline', netChip);
  }
  function netChip() { var off = navigator.onLine === false; $('#s-net').textContent = off ? 'offline' : 'online'; }
  async function visit() { try { var v = await E.TeamSync.visit(); log('§TILL_VISIT replicaIn=' + (v && v.replicaIn)); msg('Visit done', 'ok'); return v; } catch (e) { msg('Visit failed: ' + e.message, 'bad'); } }

  async function boot() {
    var t0 = performance.now();
    var qs = new URLSearchParams(location.search); if (!qs.has('team')) qs.set('team', '1'); if (!qs.has('login')) qs.set('login', '50001');   // 50001 = the Web Service user = role 50004, the role W-TEAM-UI-POS approves a till as (§15.4)
    var f = $('#b-engine'); f.src = 'idempiere.html?' + qs.toString();
    await new Promise(function (r) { f.addEventListener('load', r, { once: true }); });
    E = f.contentWindow;
    for (var i = 0; i < 1200 && !(E.TeamSync && E.__crud && E.__idmpDb && E.ERPEngine && E.APP && E.APP.actor); i++) await new Promise(function (r) { setTimeout(r, 150); });
    await E.TeamSync.ready;
    await loadConfig();
    S.store = loadStore() || { shift: freshShift(1), counters: {}, ticket: null };
    S.ticket = S.store.ticket || newTicket();
    initPad(); await renderLogin(); renderMenu(); bind(); netChip();
    var pair = null; try { pair = await E.TeamSync.pairState(); } catch (e) { /* not paired */ }
    $('#s-pair').textContent = pair && pair.enrolled ? 'paired' : 'not paired';
    S.deposited = (await rows("SELECT count(DISTINCT documentno) AS n FROM i_order WHERE description LIKE 'POS shift %'"))[0].n;
    $('#s-dep').textContent = 'deposited ' + S.deposited;
    var ms = Math.round(performance.now() - t0), heap = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : -1;
    log('§TILL_COST engine_ready_ms=' + ms + ' heap_mb=' + heap + ' products=' + S.prods.length + ' (the engine frame is the full ERP)');
    window.Till = { ready: true, refresh: loadConfig, rows: rows, go: go, press: press, state: function () { return S; }, engine: function () { return E; }, registry: R, zFromRows: zFromRows, visit: visit, depositedDocNos: depositedDocNos };
    go('login'); log('§TILL_BOOT till=' + S.cfg.tillKey + ' org=' + S.cfg.org + ' userId=' + S.cfg.userId + ' role=' + E.APP.roleId + ' shift=' + shiftTag());
  }
  boot().catch(function (e) { log('🔴 §TILL_BOOT ' + (e && e.stack || e)); });
})();
