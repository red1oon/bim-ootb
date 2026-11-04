// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — till_rest.js: the till side of the branch-shared restaurant (bim-compiler prompts/POS_PLUGIN_LOCAL_FIRST.md §32.1). READ THE LOG (§TILL_REST_* lines of erp/tests/witness_till_rest.js).
// Replaces the per-device localStorage open tables of till_ext.js (held[] by table name) with rest_core.js over the branch-local rows POS_FloorPlan / POS_OpenTable / POS_Reservation. Floors and tables come from
// the branch POS admin (branch_floors.js); with none set up yet the till shows uniCenta's own seed floor (SQLite-create.sql:652-683, Table 1..24) as in-memory places, never written.
// A table is saved when the waiter LEAVES it (the floor map renders, or Tables is pressed), never per tap: ONE deposit group + ONE Visit. Map layout: JTicketsBagRestaurantMap.java:140-182; button text :522-643.
(function () {
  'use strict';
  var A = null, E = null, core = null, RC = window.RestCore, cur = null, C = { visits: 0, deposits: 0 }, view = { floor: null, state: null };
  var tk = function () { return A.S.cfg.tillKey; };
  async function readAll() { var all = []; for (var t in RC.FIELDS) { var rs = await A.rows('SELECT * FROM ' + t.toLowerCase() + ' ORDER BY ABS(' + t.toLowerCase() + '_id)'); rs.forEach(function (r) { all.push(RC.fromDb(t, r)); }); } return all; }
  async function visit() { C.visits++; try { return await window.Till.visit(); } catch (e) { return null; } }
  async function writeRows(rows) {
    var ops = rows.map(function (r) { var tb = r._t.toLowerCase(); return { op_type: 'CRUD_CREATE', key: tb, table: tb, verb: 'create', fields: Object.assign({ ad_client_id: A.S.cfg.client, ad_org_id: A.S.cfg.org }, RC.toDb(r)) }; });
    C.deposits++; var res = await A.depositGroup(ops); if (!res || res.committed !== true) throw new Error('deposit failed: ' + (res && res.reason)); await visit();
  }
  function seedPlaces() { var p = []; for (var i = 0; i < 24; i++) p.push({ RecId: 'Table ' + (i + 1), Name: 'Table ' + (i + 1), FloorId: 'seed', Seats: [2, 4, 6][i % 3], X: 100 + 150 * (i % 6), Y: 50 + 100 * Math.floor(i / 6), W: 90, H: 45 }); return p; }
  // §33.7 D2: the table drawn from its own row. Round (ellipse) when W == H, else a rectangle; one chair per seat (14x10, 3 px outside): rectangle = ceil(n/2) on the top long side, floor(n/2) on the bottom, centres at (i+.5)/m of the width; round = evenly round the circumference.
  var OCC = '<svg class="occ" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>';   // Lucide users (for edit_group.png, Place.java:41-42)
  function drawTable(W, H, n) {
    var round = W === H, ch = [], i;
    if (round) { var rx = W / 2 + 3 + 5; for (i = 0; i < n; i++) { var a = 2 * Math.PI * i / n - Math.PI / 2, cx = W / 2 + Math.cos(a) * rx, cy = H / 2 + Math.sin(a) * rx; ch.push('<rect class="chair" x="' + (cx - 7).toFixed(2) + '" y="' + (cy - 5).toFixed(2) + '" width="14" height="10" rx="2" transform="rotate(' + (a * 180 / Math.PI + 90).toFixed(2) + ' ' + cx.toFixed(2) + ' ' + cy.toFixed(2) + ')"/>'); } }
    else { var top = Math.ceil(n / 2), bot = n - top; for (i = 0; i < top; i++) ch.push('<rect class="chair" x="' + ((i + .5) / top * W - 7).toFixed(2) + '" y="-13" width="14" height="10" rx="2"/>'); for (i = 0; i < bot; i++) ch.push('<rect class="chair" x="' + ((i + .5) / bot * W - 7).toFixed(2) + '" y="' + (H + 3) + '" width="14" height="10" rx="2"/>'); }
    var body = round ? '<ellipse class="tbl-body" cx="' + W / 2 + '" cy="' + H / 2 + '" rx="' + W / 2 + '" ry="' + H / 2 + '"/>' : '<rect class="tbl-body" x="0" y="0" width="' + W + '" height="' + H + '" rx="3"/>';
    return '<svg class="tbl" data-shape="' + (round ? 'round' : 'rect') + '" width="' + W + '" height="' + H + '">' + body + ch.join('') + '</svg>';
  }
  async function render() {
    await leaveCurrent();                                   // coming back to the map = leaving the table: the ONE save
    await visit();                                          // ONE pull for the whole map
    var s = view.state = RC.fold(await readAll()), floors = s.floors, places = s.places;
    if (!floors.length) { floors = [{ RecId: 'seed', Name: 'Restaurant floor' }]; places = seedPlaces(); }
    if (!view.floor || !floors.some(function (f) { return f.RecId === view.floor; })) view.floor = floors[0].RecId;
    var fl = floors.filter(function (f) { return f.RecId === view.floor; })[0], now = Date.now();
    A.$('#fl-tabs').innerHTML = floors.map(function (f) { return '<button data-floor="' + A.esc(f.RecId) + '"' + (f.RecId === view.floor ? ' class="on"' : '') + '>' + A.esc(f.Name) + '</button>'; }).join('');
    var map = A.$('#fl-map'), setup = (A.S.store && A.S.store.setup) || {}, trans = !!setup['table.transbtn'], col = { t: setup['table.tablecolour'] || '#D62E52', c: setup['table.customercolour'] || '#58B000', w: setup['table.waitercolour'] || '#258FB0' };
    var k = Math.min(1, (map.parentNode.clientWidth || 960) / 960); map.style.height = Math.round(600 * k) + 'px'; map.style.background = '#fafafa';   // uniCenta's 960x600 space (restaurant_floor.png), scaled to fit
    var shown = places.filter(function (p) { return p.FloorId === view.floor; });
    var img = trans && fl.Image ? '<div class="floorimg" style="position:absolute;left:0;top:0;width:960px;height:600px;background:url(' + A.esc(fl.Image) + ') center/contain no-repeat"></div>' : '';   // IMAGE mode (§33.7 D3): the floor's own picture, the tables are only transparent buttons
    map.innerHTML = '<div id="fl-stage" data-k="' + k + '" style="transform:scale(' + k + ')">' + img + shown.map(function (p) {
      var row = s.tables[p.RecId] || s.tables[p.Name], busy = row && row.State !== 'C' && (row.State === 'L' || JSON.parse(row.Body || '{"lines":[]}').lines.length), locked = row && row.State === 'L' && row.LockedBy !== tk();
      var lab = RC.label(p, row, { showCustomer: true, showWaiter: true, colour: 'black', now: now }), W = Number(p.W) || 90, H = Number(p.H) || 45, n = Number(p.Seats) || 0;
      var lines = lab.map(function (t) { var c = row && row.Customer && t === row.Customer ? col.c : row && row.Waiter && t === row.Waiter ? col.w : col.t; return '<span style="color:' + c + '">' + A.esc(t) + '</span>'; }).join('<br>');
      return '<button class="place" data-place="' + A.esc(p.RecId) + '" data-occupied="' + (busy ? 1 : 0) + '" data-locked="' + (locked ? 1 : 0) + '" data-seats="' + n + '" data-w="' + W + '" data-h="' + H + '" style="left:' + (Number(p.X) - W / 2) + 'px;top:' + (Number(p.Y) - H / 2) + 'px;width:' + W + 'px;height:' + H + 'px">'
        + (trans ? '' : drawTable(W, H, n)) + (busy ? OCC : '') + '<span class="lbl">' + lines + '</span></button>';
    }).join('') + '</div>';
    A.$('#fl-state').textContent = shown.length + ' tables'; movingText();
    A.log('§TILL_REST_DRAW mode=' + (trans ? 'image' : 'drawn') + ' k=' + k.toFixed(3) + ' tables=' + shown.length + ' chairs=' + shown.reduce(function (a, p) { return a + (trans ? 0 : Number(p.Seats) || 0); }, 0));
    A.log('§TILL_REST_MAP till=' + tk() + ' floor=' + fl.Name + ' tables=' + shown.length + ' occupied=' + shown.filter(function (p) { return (s.tables[p.RecId] || {}).State === 'O'; }).length + ' source=' + (s.floors.length ? 'branch' : 'uniCenta-seed'));
  }
  async function leaveCurrent() {
    if (!cur || !core.isHeld(cur)) { cur = null; return; }
    var id = cur; core.setLines(id, A.S.ticket.lines.slice()); var w0 = C.deposits, v0 = C.visits;
    await core.leave(id); cur = null; A.S.ticket = A.newTicket(); A.persist();
    A.log('§TILL_REST_LEAVE till=' + tk() + ' place=' + id + ' deposits=' + (C.deposits - w0) + ' visits=' + (C.visits - v0));
  }
  // ── uniCenta's popups, ONE generic pair (JNumberPop / JGuestsPop / JOptionPane): a number or PIN box, and a yes/no box ──
  function askNumber(title, secret) {
    return new Promise(function (res) {
      var box = A.$('#numbox'), inp = A.$('#num-input'); A.$('#num-title').textContent = title; inp.type = secret ? 'password' : 'text'; inp.value = ''; box.hidden = false; inp.focus();
      var done = function (v) { box.hidden = true; A.$('#num-ok').onclick = A.$('#num-no').onclick = null; res(v); };
      A.$('#num-ok').onclick = function () { done(inp.value); }; A.$('#num-no').onclick = function () { done(null); };
    });
  }
  function ask(text) {
    return new Promise(function (res) {
      var box = A.$('#confirmbox'); A.$('#confirm-text').textContent = text; box.hidden = false;
      var done = function (v) { box.hidden = true; A.$('#confirm-yes').onclick = A.$('#confirm-no').onclick = null; res(v); };
      A.$('#confirm-yes').onclick = function () { done(true); }; A.$('#confirm-no').onclick = function () { done(false); };
    });
  }
  var clip = null;   // the table being moved (uniCenta m_PlaceClipboard)
  function placeName(id) { return ((view.state && view.state.places.concat(seedPlaces()).filter(function (p) { return p.RecId === id; })[0]) || {}).Name || id; }
  function enter(id, r, customer) {
    cur = id; A.S.ticket = A.newTicket(); A.S.ticket.table = placeName(id); A.S.ticket.lines = r.ticket.lines.slice(); A.S.ticket.guests = r.ticket.guests || 0; if (customer) A.S.ticket.customer = customer; A.S.ticket.at = A.S.ticket.at || A.nowIso(); A.S.afterReceipt = 'floors';
    A.persist(); A.log('§TILL_REST_OPEN till=' + tk() + ' place=' + id + ' lines=' + r.ticket.lines.length); A.go('sales'); guestsLabel(); return r;
  }
  function guestsLabel() { var b = A.$('#guestsbtn'); if (b) b.textContent = 'Guests' + (A.S.ticket && A.S.ticket.guests ? ' ' + A.S.ticket.guests : ''); }
  async function openPlace(id, customer, res) {
    await leaveCurrent(); await visit();
    var r = await core.open(id, { waiter: (A.S.cashier && A.S.cashier.name) || '', customer: customer || '' });
    if (!r.ok) {
      if (r.blockedBy && !(await core.checkPin('')).none) {   // a branch PIN exists: the override popup of uniCenta (title.override.enterpin / message.override.badpin)
        var pin = await askNumber('Enter PIN Number', true); if (pin === null) return r;
        var o = await core.override(id, pin); if (!o.ok) { A.msg('PIN Number Incorrect', 'warn'); return o; }
        A.log('§TILL_REST_OVERRIDE till=' + tk() + ' place=' + id); return enter(id, o, customer);
      }
      A.msg('Table is in use by ' + r.blockedBy, 'warn'); A.log('§TILL_REST_BLOCKED till=' + tk() + ' place=' + id + ' by=' + r.blockedBy); return r;
    }
    return enter(id, r, customer);
  }
  // Move Table (JTicketsBagRestaurant.java:318-329 -> JTicketsBagRestaurantMap.moveTicket :356-373): save the ticket, put the table on the clipboard, show the map
  async function moveStart() {
    if (!cur) return; var id = cur; await leaveCurrent(); clip = id; A.log('§TILL_REST_MOVE_START till=' + tk() + ' from=' + id); A.go('floors');
  }
  function movingText() { if (clip) A.$('#fl-state').textContent = 'Moving table ' + placeName(clip) + '. Select another Table or the original Table'; }
  // a table clicked while the clipboard is full (JTicketsBagRestaurantMap.java:781-880): same = cancel, empty = move, occupied = merge after the confirm
  async function clipClick(to) {
    var from = clip;
    if (to === from) { clip = null; A.log('§TILL_REST_MOVE_CANCEL till=' + tk() + ' place=' + from); return openPlace(from); }
    var s = RC.fold(await readAll()), t = s.tables[to], full = t && t.State !== 'C' && JSON.parse(t.Body || '{"lines":[]}').lines.length;
    if (!full) { var m = await core.move(from, to); clip = null; A.log('§TILL_REST_MOVE till=' + tk() + ' from=' + from + ' to=' + to + ' ok=' + m.ok); return m.ok ? openPlace(to) : (A.msg('Table is now full', 'warn'), openPlace(from)); }
    if (await ask('Merge Tables: This will Merge tables.  Are you sure you want to do this?')) { var g = await core.merge(from, to); clip = null; A.log('§TILL_REST_MERGE till=' + tk() + ' from=' + from + ' into=' + to + ' ok=' + g.ok + ' lines=' + g.lines); return openPlace(to); }
    clip = null; return openPlace(from);   // no merge: uniCenta reopens the original table
  }
  // Guests (JGuestsPop 'Enter Number of Guests', JTicketsBagRestaurant.java:384-391): held with the ticket, saved with the leave
  async function guests() {
    if (!cur) return; var v = await askNumber('Enter Number of Guests', false); if (v === null || !/^\d+$/.test(v.trim())) return; var n = Number(v);
    await core.guests(cur, n); A.S.ticket.guests = n; A.persist(); guestsLabel(); A.log('§TILL_REST_GUESTS till=' + tk() + ' place=' + cur + ' guests=' + n);
  }
  // Delete Current Order (JTicketsBagRestaurant.java:339-380): PIN first when the branch has one, then the confirm, then the table is cleared
  async function deleteOrder() {
    if (!cur) return; var id = cur;
    if (!(await core.checkPin('')).none) { var pin = await askNumber('Enter PIN Number', true); if (pin === null) return; if (!(await core.checkPin(pin)).ok) { A.msg('PIN Number Incorrect', 'warn'); A.log('§TILL_REST_DELETE till=' + tk() + ' place=' + id + ' REFUSED (pin)'); return; } }
    if (!(await ask('Are you sure you want to Delete the current Order?'))) return;
    core.setLines(id, [], 0); await core.leave(id); cur = null; A.S.ticket = A.newTicket(); A.persist(); A.log('§TILL_REST_DELETE till=' + tk() + ' place=' + id + ' DELETED'); A.go('floors');
  }
  async function rsRender() {
    await visit(); var s = RC.fold(await readAll()), places = s.floors.length ? s.places : seedPlaces();
    A.$('#rs-place').innerHTML = '<option value="">(table at check-in)</option>' + places.map(function (p) { return '<option value="' + A.esc(p.RecId) + '">' + A.esc(p.Name) + '</option>'; }).join('');
    A.$('#rs-list').innerHTML = s.reservations.slice().sort(function (a, b) { return String(a.At).localeCompare(String(b.At)); }).map(function (r) {
      return '<div data-res="' + A.esc(r.ResId) + '" data-state="' + r.State + '"' + (r.State === 'D' ? ' style="text-decoration:line-through"' : '') + '>' + A.esc(r.Customer) + ' · ' + r.Chairs + ' · ' + A.esc(r.At) + (r.PlaceId ? ' · ' + A.esc(r.PlaceId) : '') + (r.State === 'B' ? ' <button data-res-in="' + A.esc(r.ResId) + '">Check-In Now</button>' : r.State === 'I' ? ' <button data-res-done="' + A.esc(r.ResId) + '">Done</button>' : ' · done') + '</div>'; }).join('');
  }
  async function book() {
    var c = A.$('#rs-customer').value; if (!c) { A.msg('Select a person', 'warn'); return; }
    var id = await core.book({ Customer: c, Chairs: Number(A.$('#rs-chairs').value) || 1, At: A.$('#rs-date').value }); A.log('§TILL_REST_BOOK till=' + tk() + ' res=' + id); await rsRender();
  }
  async function checkIn(resId) {   // the table is chosen NOW (receive mode, JTicketsBagRestaurantMap.java:648-661); the select of the form is the chooser
    var pid = A.$('#rs-place').value; if (!pid) { A.msg('Choose a table in the list, then Check-In Now', 'warn'); return; }
    var r = await core.checkIn(resId, pid); if (!r.ok) { A.msg('Table not free', 'warn'); return; }
    A.log('§TILL_REST_CHECKIN till=' + tk() + ' res=' + resId + ' place=' + pid); var rs = view.state && view.state.reservations.filter(function (x) { return x.ResId === resId; })[0];
    await openPlace(pid, rs && rs.Customer);
  }
  function init(api) {
    A = api; E = api.engineWin(); RC = window.RestCore; if (!RC) return;
    core = RC.create({ tillKey: A.S.cfg.tillKey, perms: [], log: A.log, relay: { read: readAll, write: writeRows } });
    if (A.S.mode !== 'restaurant') { window.TillRest = { core: core, counts: C }; return; }
    if (!A.$('#fl-tabs')) { var t = document.createElement('div'); t.id = 'fl-tabs'; A.$('#fl-map').parentNode.insertBefore(t, A.$('#fl-map')); }
    var fb = A.$('#floorbar'); fb.insertAdjacentHTML('beforeend', '<button id="tb-move" title="Move Table">Move</button><button id="guestsbtn" title="Number of Guests for this table">Guests</button><button id="tb-delete" title="Delete Current Order">Delete</button>');   // JTicketsBagRestaurant.java:240-290 (controls of the table's sales screen)
        A.hooks.floors = render; A.hooks.reservations = rsRender;
    window.addEventListener('click', async function (ev) {
      var b = ev.target.closest && ev.target.closest('button'); if (!b || b.disabled) return;
      if (b.hasAttribute('data-place')) { ev.stopImmediatePropagation(); if (clip) await clipClick(b.getAttribute('data-place')); else await openPlace(b.getAttribute('data-place')); }
      else if (b.id === 'tb-move') { ev.stopImmediatePropagation(); await moveStart(); }
      else if (b.id === 'guestsbtn') { ev.stopImmediatePropagation(); await guests(); }
      else if (b.id === 'tb-delete') { ev.stopImmediatePropagation(); await deleteOrder(); }
      else if (b.id === 'fl-reload') { ev.stopImmediatePropagation(); await render(); }
      else if (b.hasAttribute('data-floor')) { ev.stopImmediatePropagation(); view.floor = b.getAttribute('data-floor'); await render(); }
      else if (b.closest('#floorbar') && b.getAttribute('data-btn') === 'Tables') { ev.stopImmediatePropagation(); await leaveCurrent(); A.go('floors'); }
      else if (b.id === 'rs-save') { ev.stopImmediatePropagation(); await book(); }
      else if (b.hasAttribute('data-res-in')) { ev.stopImmediatePropagation(); await checkIn(b.getAttribute('data-res-in')); }
      else if (b.hasAttribute('data-res-done')) { ev.stopImmediatePropagation(); await core.done(b.getAttribute('data-res-done')); await rsRender(); }
    }, true);
    window.TillRest = { core: core, counts: C, render: render, moveStart: moveStart, guests: guests, deleteOrder: deleteOrder, clip: function () { return clip; }, open: openPlace, leave: leaveCurrent, book: book, checkIn: checkIn, rsRender: rsRender, held: function () { return cur; } };
    A.log('§TILL_REST ready till=' + tk());
  }
  window.TillRestInit = init;
})();
