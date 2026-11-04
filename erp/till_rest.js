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
  function seedPlaces() { var p = []; for (var i = 0; i < 24; i++) p.push({ RecId: 'seed' + (i + 1), Name: 'Table ' + (i + 1), FloorId: 'seed', Seats: 1, X: 100 + 150 * (i % 6), Y: 50 + 100 * Math.floor(i / 6), W: 90, H: 45 }); return p; }
  async function render() {
    await leaveCurrent();                                   // coming back to the map = leaving the table: the ONE save
    await visit();                                          // ONE pull for the whole map
    var s = view.state = RC.fold(await readAll()), floors = s.floors, places = s.places;
    if (!floors.length) { floors = [{ RecId: 'seed', Name: 'Restaurant floor' }]; places = seedPlaces(); }
    if (!view.floor || !floors.some(function (f) { return f.RecId === view.floor; })) view.floor = floors[0].RecId;
    var fl = floors.filter(function (f) { return f.RecId === view.floor; })[0], now = Date.now();
    A.$('#fl-tabs').innerHTML = floors.map(function (f) { return '<button data-floor="' + A.esc(f.RecId) + '"' + (f.RecId === view.floor ? ' class="on"' : '') + '>' + A.esc(f.Name) + '</button>'; }).join('');
    var map = A.$('#fl-map'); map.style.background = fl.Image ? 'url(' + fl.Image + ') center/contain no-repeat #fafafa' : '#fafafa';
    var shown = places.filter(function (p) { return p.FloorId === view.floor; });
    map.innerHTML = shown.map(function (p) {
      var row = s.tables[p.RecId] || s.tables[p.Name], busy = row && row.State !== 'C' && (row.State === 'L' || JSON.parse(row.Body || '{"lines":[]}').lines.length), locked = row && row.State === 'L' && row.LockedBy !== tk();
      var lab = RC.label(p, row, { showCustomer: true, showWaiter: true, colour: 'black', now: now });
      return '<button class="place" data-place="' + A.esc(p.RecId) + '" data-occupied="' + (busy ? 1 : 0) + '" data-locked="' + (locked ? 1 : 0) + '" style="position:absolute;left:' + (p.X * 0.9) + 'px;top:' + (p.Y * 0.9) + 'px;width:' + (p.W * 1.2) + 'px;height:' + (p.H * 1.3) + 'px;' + (busy ? 'background:#f5c6c6' : '') + '">' + lab.map(A.esc).join('<br>') + '</button>';
    }).join('');
    A.$('#fl-state').textContent = shown.length + ' tables';
    A.log('§TILL_REST_MAP till=' + tk() + ' floor=' + fl.Name + ' tables=' + shown.length + ' occupied=' + shown.filter(function (p) { return (s.tables[p.RecId] || {}).State === 'O'; }).length + ' source=' + (s.floors.length ? 'branch' : 'uniCenta-seed'));
  }
  async function leaveCurrent() {
    if (!cur || !core.isHeld(cur)) { cur = null; return; }
    var id = cur; core.setLines(id, A.S.ticket.lines.slice()); var w0 = C.deposits, v0 = C.visits;
    await core.leave(id); cur = null; A.S.ticket = A.newTicket(); A.persist();
    A.log('§TILL_REST_LEAVE till=' + tk() + ' place=' + id + ' deposits=' + (C.deposits - w0) + ' visits=' + (C.visits - v0));
  }
  async function openPlace(id, customer, res) {
    await leaveCurrent(); await visit();
    var r = await core.open(id, { waiter: (A.S.cashier && A.S.cashier.name) || '', customer: customer || '' });
    if (!r.ok) { A.msg('Table is in use by ' + r.blockedBy, 'warn'); A.log('§TILL_REST_BLOCKED till=' + tk() + ' place=' + id + ' by=' + r.blockedBy); return r; }
    var name = ((view.state && view.state.places.concat(seedPlaces()).filter(function (p) { return p.RecId === id; })[0]) || {}).Name || id;
    cur = id; A.S.ticket = A.newTicket(); A.S.ticket.table = name; A.S.ticket.lines = r.ticket.lines.slice(); if (customer) A.S.ticket.customer = customer; A.S.ticket.at = A.S.ticket.at || A.nowIso(); A.S.afterReceipt = 'floors';
    A.persist(); A.log('§TILL_REST_OPEN till=' + tk() + ' place=' + id + ' lines=' + r.ticket.lines.length); A.go('sales'); return r;
  }
  async function rsRender() {
    await visit(); var s = RC.fold(await readAll()), places = s.floors.length ? s.places : seedPlaces();
    A.$('#rs-place').innerHTML = '<option value="">(table at check-in)</option>' + places.map(function (p) { return '<option value="' + A.esc(p.RecId) + '">' + A.esc(p.Name) + '</option>'; }).join('');
    A.$('#rs-list').innerHTML = s.reservations.slice().sort(function (a, b) { return String(a.At).localeCompare(String(b.At)); }).map(function (r) {
      return '<div data-res="' + A.esc(r.ResId) + '" data-state="' + r.State + '"' + (r.State === 'D' ? ' style="text-decoration:line-through"' : '') + '>' + A.esc(r.Customer) + ' · ' + r.Chairs + ' · ' + A.esc(r.At) + (r.PlaceId ? ' · ' + A.esc(r.PlaceId) : '') + (r.State === 'B' ? ' <button data-rr-in="' + A.esc(r.ResId) + '">Check-In Now</button>' : r.State === 'I' ? ' <button data-rr-done="' + A.esc(r.ResId) + '">Done</button>' : ' · done') + '</div>'; }).join('');
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
    A.hooks.floors = render; A.hooks.reservations = rsRender;
    window.addEventListener('click', async function (ev) {
      var b = ev.target.closest && ev.target.closest('button'); if (!b || b.disabled) return;
      if (b.hasAttribute('data-place')) { ev.stopImmediatePropagation(); await openPlace(b.getAttribute('data-place')); }
      else if (b.id === 'fl-reload') { ev.stopImmediatePropagation(); await render(); }
      else if (b.hasAttribute('data-floor')) { ev.stopImmediatePropagation(); view.floor = b.getAttribute('data-floor'); await render(); }
      else if (b.closest('#floorbar') && b.getAttribute('data-btn') === 'Tables') { ev.stopImmediatePropagation(); await leaveCurrent(); A.go('floors'); }
      else if (b.id === 'rs-save') { ev.stopImmediatePropagation(); await book(); }
      else if (b.hasAttribute('data-rr-in')) { ev.stopImmediatePropagation(); await checkIn(b.getAttribute('data-rr-in')); }
      else if (b.hasAttribute('data-rr-done')) { ev.stopImmediatePropagation(); await core.done(b.getAttribute('data-rr-done')); await rsRender(); }
    }, true);
    window.TillRest = { core: core, counts: C, render: render, open: openPlace, leave: leaveCurrent, book: book, checkIn: checkIn, rsRender: rsRender, held: function () { return cur; } };
    A.log('§TILL_REST ready till=' + tk());
  }
  window.TillRestInit = init;
})();
