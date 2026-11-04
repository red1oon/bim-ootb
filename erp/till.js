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
  var S = { mode: 'standard', cfg: null, cashier: null, ticket: null, pad: P.zero(), screen: 'login', cat: null, catPath: [], prods: [], cats: [], store: null, taxEnv: null, pay: null, deposited: 0 };

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
    var prods = await rows('SELECT p.m_product_id AS pid, p.value AS value, p.name AS name, p.upc AS upc, p.c_uom_id AS uom, p.m_product_category_id AS cat, p.c_taxcategory_id AS taxcat, pp.pricestd AS price, pp.pricelimit AS lim, p.imageurl AS img FROM m_product p JOIN m_productprice pp ON pp.m_product_id=p.m_product_id AND pp.m_pricelist_version_id=' + Number(S.cfg.plv) + " WHERE p.isactive='Y' AND pp.isactive='Y' ORDER BY p.value");
    S.prods = prods;
    var cats = await rows("SELECT m_product_category_id AS id, name, m_product_category_parent_id AS parent FROM m_product_category WHERE isactive='Y' AND ad_client_id=" + Number(pos.ad_client_id) + ' ORDER BY name');
    S.cats = cats;
    // the tax inputs: the same rows the engine's Import Orders uses - the cash-trx partner (AD_ClientInfo.C_BPartnerCashTrx_ID, ImportOrder.js 'Set Default BP') and the default SO price list's tax flag
    var one = async function (sql) { return (await rows(sql))[0] || null; };
    var inputs = await C.driveAsync(C.taxInputs(pos), one, rows);                        // the tax inputs are till_core's ONE definition (shared with Branch Day Close's audit gate)
    var taxcatOf = {}; prods.forEach(function (p) { taxcatOf[p.pid] = p.taxcat; });
    var Eng = E.ERPEngine, day = today();
    S.taxEnv = C.taxEnv(Eng, inputs, taxcatOf, day);
    S.taxCats = await rows("SELECT c_taxcategory_id AS id, name FROM c_taxcategory WHERE isactive='Y' AND ad_client_id=" + Number(pos.ad_client_id) + ' ORDER BY name');
  }

  // ── shift + ticket ──
  function freshShift(seq) { return { host: S.cfg.tillKey, seq: seq, start: nowIso(), end: null, nosales: 0, removed: 0 }; }
  function newTicket() { return { type: 'S', lines: [], sel: -1, pickup: null, old: null, orig: null, table: null }; }
  function persist() { S.store.ticket = S.ticket; saveStore(); }
  function depositedDocNos(kind) {   // the keys of this till (all types, or one type letter)
    var like = C.keyPrefix(S.cfg.orgValue, S.cfg.userValue, kind || '') + '%';
    return rows('SELECT documentno FROM i_order WHERE documentno LIKE ' + q(like) + ' UNION SELECT documentno FROM i_payment WHERE documentno LIKE ' + q(like)).then(function (r) { return r.map(function (x) { return x.documentno; }); });
  }

  function msg(t, kind) { var el = $('#msg'); el.hidden = !t; el.textContent = t || ''; el.setAttribute('data-kind', kind || ''); if (t) log('§TILL_MSG ' + (kind || 'info') + ' ' + t); }
  var SCREENS = { login: 'u1', menu: 'u2', sales: 'u3', pay: 'u8', receipt: 'u9', close: 'u14', editsales: 'u10', refund: 'u11', custpay: 'u12', payments: 'u13', vouchers: 'u19', presence: 'u21', pickup: 'u22', floors: 'u16', reservations: 'u17', setup: 'u23', about: 'u24', heldlist: 'u7', reprintlist: 'u5r' };
  var HOOKS = {};   // screen name -> function run after the screen is shown (the screens of till_ext.js)
  function go(name) {
    if (!SCREENS[name]) { msg('This panel is not in this release', 'info'); return false; }
    S.screen = name; $$('.screen').forEach(function (e) { e.classList.remove('on'); });
    $('#' + SCREENS[name]).classList.add('on');
    if (name === 'close') renderClose(); if (name === 'sales') renderSales(); if (HOOKS[name]) HOOKS[name]();
    return true;
  }

  // ── U1 / U2 ──
  async function renderLogin() {
    var us = await rows("SELECT u.ad_user_id AS id, u.name FROM ad_user u WHERE u.isactive='Y' AND u.ad_client_id=" + Number(S.cfg.client) + ' AND EXISTS (SELECT 1 FROM ad_user_roles r WHERE r.ad_user_id=u.ad_user_id AND r.isactive=\'Y\') ORDER BY u.name');
    $('#users').innerHTML = us.map(function (u) { return '<button class="u-user" data-user-id="' + u.id + '">' + esc(u.name) + '</button>'; }).join('');
  }
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  function renderMenu() {
    $('#panels').innerHTML = R.MENU.map(function (n) { return '<button data-panel="' + esc(n) + '">' + esc(n) + '</button>'; }).join('') +
      '<div id="extras">' + [['Check In/Out', 'presence'], ['Voucher', 'vouchers'], ['Pickup Reset', 'pickup']].map(function (x) { return '<button data-extra="' + x[1] + '">' + x[0] + '</button>'; }).join('') + '</div>';   // Menu.Root.txt:115-143 (5.0), after the five Register panels
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
    else if (ef.type === 'setLine') { l.qty = ef.qty; l.price = Math.abs(l.price); }
    else if (ef.type === 'addProduct') { /* handled by the product button */ }
    else if (ef.type === 'barcode') { var p = S.prods.filter(function (x) { return x.upc === ef.code || x.value === ef.code; })[0]; if (p) addLine(p, 1); else { msg(ef.code + ' - no such product', 'warn'); } }
    else if (ef.type === 'addFree') { msg('A free-price or negative line has no legacy import mapping in this release (Import Orders needs a product)', 'warn'); }
    else if (ef.type === 'pay') { openPay(); }
    else if (ef.type === 'beep') { /* Unicenta beeps; the till stays silent and unchanged */ }
    if (ef.type !== 'pay') { persist(); renderSales(); }
  }
  function addLine(p, qty) {
    var t = S.ticket; if (t.type === 'R') { msg('A refund takes lines of the original ticket (Edit Sales, Refund)', 'warn'); return; }
    var ex = t.lines.filter(function (l) { return l.pid === p.pid && !l.disc; })[0];   // Unicenta merges a repeated product into its line (JPanelTicket.addTicketLine)
    if (ex) { ex.qty = Number(ex.qty) + qty; t.sel = t.lines.indexOf(ex); } else { t.lines.push({ pid: p.pid, name: p.name, qty: qty, price: Number(p.price) }); t.sel = t.lines.length - 1; }
    persist(); renderSales(); log('§TILL_LINE add pid=' + p.pid + ' qty=' + qty + ' lines=' + t.lines.length);
  }
  function removeLine(i) {   // LINEREMOVED audit per line; a parent takes its Line Discount lines with it
    var n = 1; if (!S.ticket.lines[i].disc) while (S.ticket.lines[i + n] && S.ticket.lines[i + n].disc) n++;
    S.ticket.lines.splice(i, n); S.ticket.sel = Math.min(S.ticket.sel, S.ticket.lines.length - 1); S.store.shift.removed = (S.store.shift.removed || 0) + n;
  }
  function curTotals() { return C.totals(C.foldLines(S.ticket.lines), S.taxEnv); }   // the totals are those of the folded lines: what head office will import
  function renderSales() {
    var t = S.ticket;
    $('#tl').innerHTML = t.lines.map(function (l, i) { return '<tr class="line' + (i === t.sel ? ' sel' : '') + '" data-i="' + i + '"><td>' + esc(l.name) + '</td><td>' + C.money(C.cents(l.price)) + '</td><td>x' + l.qty + '</td><td>' + C.money(C.lineNetCents(l.qty, l.price)) + '</td></tr>'; }).join('');
    var tt = curTotals();
    $('#t-sub').textContent = tt.ok ? C.money(tt.net) : '?'; $('#t-tax').textContent = tt.ok ? C.money(tt.tax) : '?'; $('#t-tot').textContent = tt.ok ? C.money(tt.gross) : '?';
    renderCats(); renderPad();
    var lab = t.type === 'R' ? 'Refund of ' + t.orig : t.old ? 'Editing ' + t.old : 'Ticket'; $('#tid').textContent = lab + (t.pickup ? ' · pick-up ' + t.pickup : '') + (t.table ? ' · ' + t.table : '');
    $('#south').style.display = t.type === 'R' ? 'none' : '';
    $('#heldcount').textContent = (S.store.held || []).length || '';
  }
  var BARH = 28;
  function catCollapsed() { return !!(S.store && S.store.setup && S.store.setup['catalog.collapsed']); }   // device-local, the §29.D.1 settings store
  function setCatCollapsed(v) { S.store.setup = S.store.setup || {}; S.store.setup['catalog.collapsed'] = !!v; saveStore(); renderCats(); log('§TILL_CATALOG_TOGGLE collapsed=' + !!v); }
  function childrenOf(id) { return S.cats.filter(function (c) { return (c.parent == null || c.parent === '' ? null : Number(c.parent)) === id; }); }
  function renderCats() {
    var cur = S.catPath.length ? S.catPath[S.catPath.length - 1] : null, kids = childrenOf(cur);
    var hasProd = function (id) { return S.prods.some(function (p) { return Number(p.cat) === Number(id); }) || childrenOf(Number(id)).some(function (c) { return hasProd(c.id); }); };
    kids = kids.filter(function (c) { return hasProd(c.id); });
    $('#cats').innerHTML = (cur != null ? '<button data-cat-up="1">&larr;</button>' : '') + kids.map(function (c) { return '<button data-cat="' + c.id + '"' + (S.cat === c.id ? ' class="on"' : '') + '>' + esc(c.name) + '</button>'; }).join('');
    var list = cur == null ? [] : S.prods.filter(function (p) { return Number(p.cat) === Number(cur); });
    var z = Object.assign({ 'img-width': 107, 'img-height': 60, 'cat-height': 320 }, S.sizes || {});    // uniCenta Ticket.Buttons.xml:77 img-width/img-height; ThumbNailBuilder.java:101-202 (picture, name over the bottom, centred)
    $('#products').innerHTML = list.map(function (p) { return prodTile(p, z); }).join('');
    var ch = Number(z['cat-height']) || 320, col = catCollapsed(); $('#south').style.height = (col ? BARH : ch) + 'px';    // cat-height: JPanelTicketSales.java:78-80 (code default 245, shipped 320, Ticket.Buttons.xml:77-80)
    $('#catbody').hidden = col; $('#catbar').setAttribute('aria-expanded', col ? 'false' : 'true');
    var cn = (S.cats.filter(function (c) { return c.id === cur; })[0] || {}).name;   // owner-requested addition beyond uniCenta (§33.8): the catalog folds to this bar, default expanded
    $('#catbar').innerHTML = '<b>' + esc(cn || 'Products') + '</b>' + (col ? '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg>' : '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>');   // Lucide chevron-up (collapsed: tap to expand) / chevron-down
    log('§TILL_LAYOUT cat-height=' + ch + ' collapsed=' + col + ' tile=' + z['img-width'] + 'x' + z['img-height']);
    log('§TILL_CATALOG tiles=' + list.length + ' withImage=' + list.filter(function (p) { return p.img; }).length + ' size=' + z['img-width'] + 'x' + z['img-height']);
  }
  // Lucide image-off (placeholder, no GPL art; §29.D.2). The picture is decoded only when the tile is on screen (lazy + async), CORS so the SW media cache can store a real 200 (§31).
  var NOIMG = '<svg class="noimg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 2l20 20"/><path d="M10.41 10.41a2 2 0 1 1-2.83-2.83"/><path d="M13.5 13.5 6 21"/><path d="M18 12l3 3"/><path d="M3.59 3.59A1.99 1.99 0 0 0 3 5v14a2 2 0 0 0 2 2h14c.55 0 1.052-.22 1.41-.59"/><path d="M21 15V5a2 2 0 0 0-2-2H9"/></svg>';
  function prodTile(p, z) {   // the button IS img-width x img-height (Ticket.Buttons.xml:77, W-TILL-UNICENTA-PARITY U5); picture fills it, name + price overlay the bottom (ThumbNailBuilder.java:101-202)
    var w = z['img-width'], h = z['img-height'];
    var pic = p.img ? '<img src="' + esc(p.img) + '" alt="" loading="lazy" decoding="async" crossorigin="anonymous" width="' + w + '" height="' + h + '" style="position:absolute;left:0;top:0;width:100%;height:100%;object-fit:contain">' : '<span class="ph" style="position:absolute;left:0;top:0;width:100%;height:70%;display:flex;align-items:center;justify-content:center">' + NOIMG + '</span>';
    return '<button class="prod" data-pid="' + p.pid + '" style="position:relative;overflow:hidden;box-sizing:border-box;padding:0;width:' + w + 'px;height:' + h + 'px">' + pic + '<span class="pn" style="position:absolute;left:0;right:0;bottom:0;text-align:center;font-size:9px;line-height:1.1;background:rgba(255,255,255,.8);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(p.name) + '<br><span class="pp">' + C.money(C.cents(p.price)) + '</span></span></button>';
  }
  // §31/§32: ask the service worker to fetch ONLY the pictures it does not hold yet, then evict what the catalog no longer lists. The bytes stay on the device's disk, never in the twin's DB.
  async function mediaPrefetch() {
    var urls = S.prods.map(function (p) { return p.img; }).filter(Boolean).concat(window.TillCompany ? window.TillCompany.logoUrls() : []), sw = null;
    try { if (navigator.serviceWorker) { var reg = await Promise.race([navigator.serviceWorker.ready, new Promise(function (r) { setTimeout(function () { r(null); }, 3000); })]); sw = navigator.serviceWorker.controller || (reg && reg.active); } } catch (e) { /* no SW */ }
    if (!urls.length || !sw) { log('§TILL_MEDIA INCONCLUSIVE urls=' + urls.length + ' sw=' + !!sw); return null; }
    var r = await new Promise(function (ok) { var ch = new MessageChannel(); ch.port1.onmessage = function (e) { ok(e.data); }; sw.postMessage({ type: 'MEDIA_PREFETCH', urls: urls, capMb: 50 }, [ch.port2]); setTimeout(function () { ok(null); }, 60000); });
    log('§TILL_MEDIA files=' + (r && r.files) + ' bytes=' + (r && r.bytes) + ' fetched=' + (r && r.fetched) + ' evicted=' + (r && r.evicted) + ' heap_mb=' + (performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : -1)); return r;
  }
  async function loadSizes() { try { var rs = await rows("SELECT recid, value FROM pos_floorplan WHERE kind='S'"); var o = {}; rs.forEach(function (r) { o[r.recid] = r.value; }); if (window.RestCore) S.sizes = RestCore.sizes(o); } catch (e) { /* table not made yet: defaults */ } }

  // ── U8 payment dialog (sale, refund U11, customer payment U12 share it: the tabs differ, 5.0 JPaymentSelectReceipt / Refund / Customer) ──
  function openPay(kind, amountCents, customer) {
    var sign = 1, gross;
    if (kind === 'P') { gross = amountCents; }
    else { var tt = curTotals(); if (!tt.ok) { msg('Cannot price the ticket: ' + tt.error, 'bad'); return; } kind = S.ticket.type; sign = tt.gross < 0 ? -1 : 1; gross = Math.abs(tt.gross); }
    S.pay = { gross: gross, kind: kind, sign: sign, customer: customer || null, parts: [], tab: C.tabsFor(kind)[0].name, print: true };
    $('#tabs').innerHTML = C.tabsFor(kind).map(function (t) { return '<button data-tab="' + t.name + '"' + (t.live ? '' : ' disabled data-disabled-reason="' + esc(t.reason || 'no import mapping for this tender') + '"') + '>' + t.label + '</button>'; }).join('');
    go('pay'); renderPay();
  }
  var sg = function (c) { return (S.pay && S.pay.sign < 0 && c ? '-' : '') + C.money(c); };
  function renderPay() {
    var p = S.pay, left = Math.max(p.gross - p.parts.reduce(function (a, x) { return a + Math.min(x.tendered, x.appliedMax); }, 0), 0);
    $('#paytotal').textContent = sg(p.gross); $('#remaining').textContent = sg(left);
    $$('#tabs [data-tab]').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-tab') === p.tab); });
    $('#cardfields').hidden = !/^magcard/.test(p.tab);
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
    if (/^magcard/.test(p.tab)) { part.ref = $('#card-ref').value.trim(); part.auth = $('#card-auth').value.trim(); if (!part.ref || !part.auth) { msg('Card: the terminal reference and approval code are needed (the card number is never keyed here)', 'warn'); return false; } }
    p.parts.push(part); renderPay(); return true;
  }
  function delPart() { S.pay.parts.pop(); renderPay(); }
  function remainingCents() { var p = S.pay; return p.gross - p.parts.reduce(function (a, x) { return a + Math.min(x.tendered, x.appliedMax); }, 0); }
  function bumpPickup() { S.store.pickup = (S.store.pickup || 0) + 1; return S.store.pickup; }   // DataLogicSales.getNextPickupIndex (the pickup_number sequence)
  async function payOk() {
    var p = S.pay; if (remainingCents() > 0 && !addPart()) return;
    if (remainingCents() > 0) { msg('The ticket is not covered yet: Add Part Payment', 'warn'); return; }
    return serial(async function () {
      var kind = p.kind, t = kind === 'P' ? { type: 'P', lines: [], old: null, orig: null } : S.ticket, folded = C.foldLines(t.lines), tt = kind === 'P' ? { gross: p.gross, ok: true } : C.totals(folded, S.taxEnv);
      var ap = C.applyTenders(p.parts.map(function (x) { return { name: x.name, tendered: x.tendered, ref: x.ref, auth: x.auth }; }), p.gross);
      if (!ap.ok || ap.remaining > 0) { msg('Tenders do not cover the ticket', 'bad'); return; }
      var prefix = C.keyPrefix(S.cfg.orgValue, S.cfg.userValue, kind), key, n = null;
      if (t.old) key = t.old;                                                            // 5.0 TicketInfo.copyTicket keeps the number: an edited ticket is saved under its own key
      else { var dn = await depositedDocNos(kind); n = C.nextNumber(prefix, S.store.counters && S.store.counters[kind], dn); key = prefix + n; }
      var rowsOut = C.depositRows({ lines: folded }, key, ap, { client: S.cfg.client, org: S.cfg.org, iso: S.cfg.iso, uomOf: function (pid) { return (S.prods.filter(function (x) { return x.pid === pid; })[0] || {}).uom; }, day: today(), shiftTag: shiftTag(),
        sign: p.sign, refundOf: kind === 'R' ? t.orig : null, bpartnerValue: kind === 'P' ? p.customer.value : null });
      var ops = [];
      if (t.old) {                                                                       // Edit: the old rows are removed in the SAME atomic group (DataLogicSales.deleteTicket, then saveTicket)
        (await rows('SELECT i_order_id AS id FROM i_order WHERE documentno=' + q(key))).forEach(function (r) { ops.push({ op_type: 'CRUD_DELETE', key: 'i_order', table: 'i_order', verb: 'delete', id: r.id, tombstone: true }); });
        (await rows('SELECT i_payment_id AS id FROM i_payment WHERE documentno=' + q(key))).forEach(function (r) { ops.push({ op_type: 'CRUD_DELETE', key: 'i_payment', table: 'i_payment', verb: 'delete', id: r.id, tombstone: true }); });
      }
      ops = ops.concat(rowsOut.orders.map(function (r) { return create('i_order', r); }), rowsOut.payments.map(function (r) { return create('i_payment', r); }));
      var res = await depositGroup(ops);
      if (!res || res.committed !== true) { msg('Could not save the sale on this device: ' + (res && res.reason), 'bad'); log('§TILL_DEPOSIT FAIL ' + (res && res.reason)); return; }
      if (n != null) { S.store.counters = S.store.counters || {}; S.store.counters[kind] = n; }
      var pickup = t.pickup || (kind === 'P' ? null : bumpPickup());
      var terminal = S.cfg.tillKey, rm = C.receiptModel({ type: kind, number: key, date: nowIso(), terminal: terminal, user: S.cashier ? S.cashier.name : '', lines: t.lines.map(function (l) { return { name: l.name, price: C.cents(l.price), qty: l.qty, value: C.lineNetCents(l.qty, l.price) }; }), gross: kind === 'R' ? -p.gross : tt.gross, applied: ap, change: ap.change });
      S.lastReceipt = { key: key, model: rm, gross: tt.gross, change: ap.change, firstCash: ap.parts[0] && ap.parts[0].name === 'cash' };
      S.store.last = { type: kind, key: key }; (S.store.rcpt = S.store.rcpt || {})[key] = { model: rm, change: ap.change, firstCash: S.lastReceipt.firstCash, pickup: pickup };   // 5.0 lastticket.number/type (JPanelTicket closeTicket); the detail a reprint needs and the rows do not hold (tendered, change, discount lines)
      log('§TILL_DEPOSIT key=' + key + ' type=' + kind + (t.old ? ' edit=1' : '') + ' lines=' + rowsOut.orders.length + ' tenders=' + rowsOut.payments.length + ' gross=' + sg(Math.abs(tt.gross)) + ' ops=' + ops.length + ' gid=' + res.gid + ' pickup=' + pickup + ' core_docs_written=0');
      if (kind !== 'P') S.ticket = newTicket(); S.pad = P.zero(); persist(); S.deposited++; $('#s-dep').textContent = 'deposited ' + S.deposited;
      showReceipt(p.print);
    });
  }
  // ── U9 ──
  function showReceipt(print) {
    var r = S.lastReceipt;
    $('#receipt').innerHTML = print ? (window.TillCompany ? window.TillCompany.headerHtml() : '') + r.model.map(function (f) { return '<div class="rf" data-f="' + esc(f[0]) + '">' + esc(f.join('  ')) + '</div>'; }).join('') : '<div class="rf" data-f="none">(receipt not printed)</div>';
    var cp = $('#changepop'); cp.hidden = !(r.firstCash && r.change > 0); cp.textContent = 'Change: ' + C.money(r.change);   // Ticket.Close.xml:23-60
    go('receipt');
  }
  // ── U14 Close Cash ──
  async function zFromRows() {
    var tag = shiftTag();
    var os = await rows('SELECT * FROM i_order WHERE description=' + q(tag) + ' ORDER BY i_order_id');
    var keys = os.map(function (r) { return r.documentno; }).filter(function (v, i, a) { return a.indexOf(v) === i; });
    var ps = keys.length ? await rows('SELECT * FROM i_payment WHERE documentno IN (' + keys.map(q).join(',') + ')') : [];
    var seq = S.store.shift.seq;
    return C.zTotals(os, ps, S.taxEnv, (S.store.cashio || []).filter(function (c) { return c.shift === seq; }));
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
    await handoff(sh);   // §26.3: ONE hand-off per shift to the branch POS admin (audience = branch); nothing goes to head office from a till
  }
  // Close Cash -> the branch POS admin (POS_PLUGIN_LOCAL_FIRST §26.3): the shift's tickets (their I_Order lines + I_Payment tenders, as deposited) and one Z declaration per business day, in ONE atomic group of POS_TillHandoff rows, then ONE Visit (branch lane)
  async function handoff(sh) {
    var tag = 'POS shift ' + S.cfg.tillKey + '/' + sh.seq;
    var os = await rows('SELECT * FROM i_order WHERE description=' + q(tag) + ' ORDER BY i_order_id'), ps = await rows('SELECT * FROM i_payment WHERE description=' + q(tag) + ' ORDER BY i_payment_id');
    var hr = window.EodaCore.handoffRows({ tillKey: S.cfg.tillKey, seq: sh.seq, start: sh.start, end: sh.end, client: S.cfg.client, org: S.cfg.org, orders: os, payments: ps, day: today(), zOf: function (o, p) { return C.zTotals(o, p, S.taxEnv, []); } });
    var res = await depositGroup(hr.map(function (r) { return create('pos_tillhandoff', r); }));
    if (!res || res.committed !== true) { msg('Could not hand the shift to the branch admin: ' + (res && res.reason), 'bad'); log('§EODA_HANDOFF FAIL till=' + S.cfg.tillKey + ' shift=' + sh.seq + ' ' + (res && res.reason)); return null; }
    var keys = hr.filter(function (r) { return r.kind === 'T'; }).map(function (r) { return r.documentno; });
    log('§EODA_HANDOFF till=' + S.cfg.tillKey + ' shift=' + sh.seq + ' tickets=' + keys.length + ' zrows=' + hr.filter(function (r) { return r.kind === 'Z'; }).length + ' ops=' + hr.length + ' gid=' + res.gid);
    var v = await visit();
    if (v && v.rep && v.rep.sent > 0) { S.store.sent = S.store.sent || {}; keys.forEach(function (k) { S.store.sent[k] = 1; }); saveStore(); }   // a key handed to the branch is no longer editable on the till; a Visit that sent nothing (offline) marks nothing
    return { keys: keys, visit: v };
  }


  // ── SODA (POS_PLUGIN_LOCAL_FIRST §28.3): the branch admin passes the reference deltas on the branch lane (pos_tillref). The till applies ONLY the rows that arrived (SodaCore.applyRef): a price / product (ImageURL included,
  // the URL string only) / tax row it was told about; every other row stays as it was ("old prices stay", D5). No tile or image rendering here (a later lane).
  async function applySoda() {
    if (!window.SodaCore) return null;
    var all = []; try { all = await rows('SELECT * FROM pos_tillref ORDER BY seq, ABS(pos_tillref_id)'); } catch (e) { return null; }
    var done = Number(S.store.sodaSeq || 0), fresh = all.filter(function (r) { return Number(r.seq) > done && r.kind !== 'B'; });
    var comp = fresh.filter(function (r) { return r.kind === 'O'; }); fresh = fresh.filter(function (r) { return r.kind !== 'O'; });   // §36.5: the company row is the till's own device record, not a table row
    var cres = comp.length && window.TillCompany ? window.TillCompany.apply(comp) : null;
    if (!fresh.length) { if (comp.length) { S.store.sodaSeq = comp.reduce(function (m, r) { return Math.max(m, Number(r.seq)); }, done); saveStore(); mediaPrefetch(); } return { applied: 0, company: cres }; }
    var cur = {}, ops = [], pk = {};
    for (var i = 0; i < fresh.length; i++) { var r = fresh[i], t = r.kind === 'P' ? 'm_productprice' : r.kind === 'R' ? 'm_product' : 'c_tax';
      var w = r.kind === 'P' ? 'm_product_id=' + Number(r.m_product_id) + ' AND m_pricelist_version_id=' + Number(r.m_pricelist_version_id) : r.kind === 'R' ? 'm_product_id=' + Number(r.m_product_id) : 'c_tax_id=' + Number(r.c_tax_id);
      cur[t + '|' + w] = (await rows('SELECT * FROM ' + t + ' WHERE ' + w))[0] || null; }
    var key = function (t, where) { return t + '|' + Object.keys(where).map(function (k) { return k + '=' + Number(where[k]); }).join(' AND '); };
    var W = { find: function (t, where) { return cur[key(t, where)] || null; },
      update: function (t, where, f) { var row = cur[key(t, where)]; if (!row) return; var idc = row[t + '_id'] != null ? t + '_id' : t + '_uu', ch = {}; Object.keys(f).forEach(function (k) { if (String(row[k] == null ? '' : row[k]) !== String(f[k] == null ? '' : f[k])) ch[k] = { old: row[k] == null ? null : row[k], new: f[k] }; }); if (!Object.keys(ch).length) return; ops.push({ op_type: 'CRUD_UPDATE', key: t, table: t, verb: 'update', id: row[idc], idCol: idc === t + '_id' ? undefined : idc, changes: ch }); },   // a single-key table by its id, a composite-key one (M_ProductPrice) by its UU; only the columns that differ
      insert: function (t, f) { ops.push(create(t, f)); } };
    var res = window.SodaCore.applyRef(W, fresh, { client: S.cfg.client });
    var hi = fresh.concat(comp).reduce(function (m, r) { return Math.max(m, Number(r.seq)); }, 0);
    if (ops.length) { var g = await depositGroup(ops); if (!g || g.committed !== true) { log('§SODA_TILL_APPLY FAIL till=' + S.cfg.tillKey + ' ' + (g && g.reason)); return { failed: true }; } }
    S.store.sodaSeq = hi; saveStore(); await loadConfig(); mediaPrefetch();
    log('§SODA_TILL_APPLY till=' + S.cfg.tillKey + ' rows=' + fresh.length + ' prices=' + res.applied.prices + ' products=' + res.applied.products + ' taxes=' + res.applied.taxes + ' unchanged=' + res.noop + ' upToSeq=' + hi);
    return res;
  }

  // ── events ──
  function bind() {
    document.addEventListener('click', function (ev) {
      var b = ev.target.closest && ev.target.closest('button'); if (!b || b.disabled) return;
      if (b.classList.contains('u-user')) { S.cashier = { id: Number(b.getAttribute('data-user-id')), name: b.textContent }; $('#s-who').textContent = S.cashier.name; log('§TILL_LOGIN cashier=' + S.cashier.name); go('menu'); }
      else if (b.hasAttribute('data-panel')) { var n = b.getAttribute('data-panel'); go({ Sales: S.mode === 'restaurant' ? 'floors' : 'sales', 'Edit Sales': 'editsales', 'Customer Payment': 'custpay', Payments: 'payments', 'Close Cash': 'close' }[n]); }
      else if (b.hasAttribute('data-extra')) go(b.getAttribute('data-extra'));
      else if (b.classList.contains('key')) press(b.getAttribute('data-key'));
      else if (b.id === 'b-barcode') press('\n');
      else if (b.hasAttribute('data-cat')) { S.catPath.push(Number(b.getAttribute('data-cat'))); S.cat = null; renderCats(); }
      else if (b.hasAttribute('data-cat-up')) { S.catPath.pop(); renderCats(); }
      else if (b.id === 'catbar') setCatCollapsed(!catCollapsed());
      else if (b.classList.contains('prod')) { var p = S.prods.filter(function (x) { return String(x.pid) === b.getAttribute('data-pid'); })[0]; var r = P.product(S.pad, p); S.pad = r.state; if (r.effect.type === 'addProduct') addLine(p, r.effect.qty); renderPad(); }
      else if (b.id === 'b-remove') { if (S.ticket.sel >= 0) { removeLine(S.ticket.sel); persist(); renderSales(); } }
      else if (b.hasAttribute('data-tab')) { S.pay.tab = b.getAttribute('data-tab'); renderPay(); }
      else if (b.id === 'addpart') addPart(); else if (b.id === 'delpart') delPart();
      else if (b.id === 'pay-ok') { S.pay.print = $('#printtoggle').checked; payOk(); } else if (b.id === 'pay-cancel') { go('sales'); }
      else if (b.id === 'rc-ok') { var back = S.afterReceipt || 'sales'; S.afterReceipt = null; go(back); }
      else if (b.id === 'zprint') { renderClose(); } else if (b.id === 'zclose') { $('#zconfirm').hidden = false; } else if (b.id === 'zconfirm') closeCash(); else if (b.id === 'zback') go('menu'); else if (b.id === 'zreprint') reprintZ();
      else if (b.id === 'visit') visit();
    });
    $('#tl').addEventListener('click', function (ev) { var tr = ev.target.closest('tr'); if (tr) { S.ticket.sel = Number(tr.getAttribute('data-i')); renderSales(); } });
    $('#taxcombo').innerHTML = (S.taxCats || []).map(function (c) { return '<option value="' + c.id + '">' + esc(c.name) + '</option>'; }).join('');
    document.addEventListener('keydown', function (ev) { if (S.screen !== 'sales' || /INPUT|SELECT|TEXTAREA/.test(ev.target.tagName)) return; var k = ev.key === 'Enter' ? '\n' : ev.key === 'Delete' ? '\u007f' : ev.key; if (k.length === 1 && '0123456789.*+-= \n\u007f'.indexOf(k) >= 0) press(k); });
    window.addEventListener('online', netChip); window.addEventListener('offline', netChip);
  }
  function netChip() { var off = navigator.onLine === false; $('#s-net').textContent = off ? 'offline' : 'online'; }
  async function visit() { try { var v = await E.TeamSync.visit(); log('§TILL_VISIT replicaIn=' + (v && v.replicaIn)); try { await applySoda(); } catch (e) { log('🔴 §SODA_TILL_APPLY ' + (e && e.message)); } msg('Visit done', 'ok'); return v; } catch (e) { msg('Visit failed: ' + e.message, 'bad'); } }

  async function boot() {
    var t0 = performance.now();
    var qs = new URLSearchParams(location.search); S.mode = qs.get('mode') === 'restaurant' ? 'restaurant' : 'standard'; qs.delete('mode'); document.body.setAttribute('data-mode', S.mode); if (!qs.has('team')) qs.set('team', '1'); if (!qs.has('login')) qs.set('login', '50001');   // 50001 = the Web Service user = role 50004, the role W-TEAM-UI-POS approves a till as (§15.4)
    var f = $('#b-engine'); f.src = 'idempiere.html?' + qs.toString();
    await new Promise(function (r) { f.addEventListener('load', r, { once: true }); });
    E = f.contentWindow;
    for (var i = 0; i < 1200 && !(E.TeamSync && E.__crud && E.__idmpDb && E.ERPEngine && E.APP && E.APP.actor); i++) await new Promise(function (r) { setTimeout(r, 150); });
    await E.TeamSync.ready;
    if (E.AdImportTables && E.AdImportTables.ensurePos) E.AdImportTables.ensurePos(E.__idmpDb);   // POS_TillHandoff (POS_PLUGIN_LOCAL_FIRST §26.2)
    E.TeamSync.hold(['i_order', 'i_payment']);   // §26.3: a till never sends its tickets to head office; at Close Cash it hands the shift to its branch POS admin (branch lane), which makes the ONE send
    await loadConfig(); await loadSizes(); mediaPrefetch();
    S.store = loadStore() || { shift: freshShift(1), counters: {}, ticket: null };
    { var sm = (S.store.setup || {})['machine.ticketsbag']; if (!qs.get('mode') && !new URLSearchParams(location.search).get('mode') && ['simple', 'standard', 'restaurant'].indexOf(sm) >= 0) { S.mode = sm; document.body.setAttribute('data-mode', sm); log('§TILL_SETUP_MODE applied=' + sm + ' (from the Configuration screen)'); } }
    S.ticket = S.store.ticket || newTicket();
    initPad(); await renderLogin(); renderMenu(); bind(); netChip();
    var pair = null; try { pair = await E.TeamSync.pairState(); } catch (e) { /* not paired */ }
    $('#s-pair').textContent = pair && pair.enrolled ? 'paired' : 'not paired';
    S.deposited = (await rows("SELECT count(DISTINCT documentno) AS n FROM i_order WHERE description LIKE 'POS shift %'"))[0].n;
    $('#s-dep').textContent = 'deposited ' + S.deposited;
    var ms = Math.round(performance.now() - t0), heap = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : -1;
    log('§TILL_COST engine_ready_ms=' + ms + ' heap_mb=' + heap + ' products=' + S.prods.length + ' (the engine frame is the full ERP)');
    var api = { S: S, C: C, P: P, R: R, $: $, $$: $$, q: q, esc: esc, rows: rows, depositGroup: depositGroup, create: create, msg: msg, log: log, go: go, hooks: HOOKS, persist: persist, saveStore: saveStore, newTicket: newTicket, renderSales: renderSales, openPay: openPay,
      nowIso: nowIso, today: today, shiftTag: shiftTag, curTotals: curTotals, removeLine: removeLine, addLine: addLine, bumpPickup: bumpPickup, showReceipt: showReceipt, depositedDocNos: depositedDocNos, zFromRows: zFromRows, renderPad: renderPad, press: press };
    api.engineWin = function () { return E; };
    if (window.TillExt) window.TillExt.init(api);
    if (window.TillSetupInit) window.TillSetupInit(api);
    if (window.TillCompanyInit) window.TillCompanyInit(api);   // §36: left menu panel, About, brand strip, receipt header
    if (window.TillRestInit) window.TillRestInit(api);   // §32: branch-shared open tables / floors / reservations (overrides the per-device hooks of till_ext.js)
    window.Till = { ready: true, addLine: addLine, persist: persist, rows: rows, go: go, press: press, state: function () { return S; }, engine: function () { return E; }, registry: R, zFromRows: zFromRows, visit: visit, applySoda: applySoda, depositedDocNos: depositedDocNos };
    if (window.TillKdsInit) window.TillKdsInit(api);   // P2: Send Order -> the kitchen (prompts/POS_PLUGIN_LOCAL_FIRST.md §19.1)
    go('login'); log('§TILL_BOOT till=' + S.cfg.tillKey + ' org=' + S.cfg.org + ' userId=' + S.cfg.userId + ' role=' + E.APP.roleId + ' shift=' + shiftTag());
  }
  boot().catch(function (e) { log('🔴 §TILL_BOOT ' + (e && e.stack || e)); });
})();
