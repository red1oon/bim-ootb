// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — rest_core.js: restaurant floors / tables / BRANCH-SHARED open tables / reservations (bim-compiler prompts/POS_PLUGIN_LOCAL_FIRST.md §32.1). READ THE LOG (§REST_* lines of erp/tests/witness_rest.js).
// Pure logic, no DOM, no table names beyond the three branch-local row kinds of the plan (POS_FloorPlan R1, POS_OpenTable R2, POS_Reservation R3). Source layout/flow: uniCenta 5.0 JTicketsBagRestaurantMap /
// JTicketsBagRestaurant / JTicketsBagRestaurantRes (cited per function). Rows never go to HQ (audience 'branch'); a table is written when the waiter LEAVES it, never per tap (§32.1 item 3).
// relay contract: relay.read() -> Promise<rows[]> (each row {_t, ...fields}); relay.write(rows[]) -> Promise (ONE request per call, the whole group atomic).
(function (g) {
  'use strict';
  var T = { F: 'POS_FloorPlan', O: 'POS_OpenTable', R: 'POS_Reservation' };
  // Highest Seq wins; a tie goes to the lower writer so every device folds the same without a server (§32.1 item 2).
  function pick(cur, row, wkey) { if (!cur) return row; if (Number(row.Seq) !== Number(cur.Seq)) return Number(row.Seq) > Number(cur.Seq) ? row : cur; return String(row[wkey] || '') < String(cur[wkey] || '') ? row : cur; }
  function fold(rows) {
    var fl = {}, pl = {}, st = {}, ot = {}, rs = {};
    (rows || []).forEach(function (r) {
      if (r._t === T.F) { var m = r.Kind === 'F' ? fl : r.Kind === 'P' ? pl : r.Kind === 'S' ? st : null; if (m) m[r.RecId] = pick(m[r.RecId], r, 'Name'); }
      else if (r._t === T.O) ot[r.PlaceId] = pick(ot[r.PlaceId], r, 'LockedBy');
      else if (r._t === T.R) rs[r.ResId] = pick(rs[r.ResId], r, 'Customer');
    });
    var alive = function (m) { return Object.keys(m).map(function (k) { return m[k]; }).filter(function (r) { return r.State !== 'X' && r.Deleted !== 'Y'; }); };
    var settings = {}, settingSeq = {}; Object.keys(st).forEach(function (k) { settings[k] = st[k].Value; settingSeq[k] = Number(st[k].Seq); });
    return { floors: alive(fl), places: alive(pl), settings: settings, settingSeq: settingSeq, tables: ot, reservations: alive(rs) };
  }
  function sha(s) { var c = (typeof require === 'function') ? require('crypto').webcrypto : g.crypto; return c.subtle.digest('SHA-256', new TextEncoder().encode(s)).then(function (b) { return Array.prototype.map.call(new Uint8Array(b), function (x) { return ('0' + x.toString(16)).slice(-2); }).join(''); }); }
  // Table button text, uniCenta JTicketsBagRestaurantMap.printState():522-643. Lines: customer (table.showcustomerdetails), waiter (table.showwaiterdetails), then "Name / Seats", Guests, waiting time (colour set); plain name otherwise.
  function label(place, row, o) {
    o = o || {}; var occ = row && row.State !== 'C' && row.Body && JSON.parse(row.Body).lines && JSON.parse(row.Body).lines.length, parts = [];
    if (o.showCustomer && row && row.Customer) parts.push(row.Customer);
    if (o.showWaiter && row && row.Waiter) parts.push(row.Waiter);
    if (!o.colour && !o.showCustomer && !o.showWaiter) return [place.Name];
    parts.push(o.colour ? place.Name + ' / ' + place.Seats : place.Name);
    if (o.colour && occ) { var sec = Math.max(0, Math.floor(((o.now || Date.now()) - Number(row.Since || row.Seq)) / 1000)); parts.push('Guests ' + (row.Guests || 0)); parts.push('Waiting ' + Math.floor(sec / 3600) + 'h:' + Math.floor((sec % 3600) / 60) + 'm'); }
    return parts;
  }

  // ── DB mapping + the branch admin's edits (§32.1 item 4). Field lists = the plan's `carries` (R1/R2/R3); DB columns are the lower-cased names.
  var FIELDS = { POS_FloorPlan: ['Kind', 'RecId', 'Name', 'FloorId', 'Seats', 'X', 'Y', 'W', 'H', 'Image', 'Value', 'Seq', 'Deleted'], POS_OpenTable: ['PlaceId', 'Seq', 'State', 'LockedBy', 'Guests', 'Waiter', 'Customer', 'Body', 'Since', 'Override'], POS_Reservation: ['ResId', 'Seq', 'Customer', 'At', 'Chairs', 'State', 'PlaceId'] };
  function fromDb(t, r) { var o = { _t: t }; FIELDS[t].forEach(function (f) { var v = r[f.toLowerCase()]; if (v !== undefined && v !== null && v !== '') o[f] = v; }); return o; }
  function toDb(row) { var o = {}; FIELDS[row._t].forEach(function (f) { if (row[f] !== undefined) o[f.toLowerCase()] = row[f]; }); return o; }
  // catalog sizes (uniCenta Ticket.Buttons.xml:77-120 defaults) read from the S rows; the admin overrides them.
  function sizes(settings) { var d = { 'img-width': 107, 'img-height': 60, 'cat-height': 320, pricevisible: 1, taxesincluded: 1 }, o = {}; Object.keys(d).forEach(function (k) { o[k] = settings && settings[k] !== undefined && settings[k] !== '' ? Number(settings[k]) : d[k]; }); return o; }
  // one edit = one row with Seq+1 over the folded current one (floor F, place P, setting S); delete = Deleted Y.
  function editRow(state, kind, rec) {
    var m = kind === 'F' ? state.floors : kind === 'P' ? state.places : null, cur = m ? m.filter(function (x) { return x.RecId === rec.RecId; })[0] : (rec.RecId in (state.settings || {}) ? { Seq: (state.settingSeq || {})[rec.RecId] || 1 } : null);
    return Object.assign({ _t: T.F, Kind: kind, Seq: (cur ? Number(cur.Seq) : 0) + 1 }, cur && m ? cur : {}, rec, { Kind: kind, Seq: (cur ? Number(cur.Seq) : 0) + 1 });
  }
  function create(opts) {
    var relay = opts.relay, me = opts.tillKey, perms = opts.perms || [], held = {}, C = { reads: 0, writes: 0, taps: 0, saves: 0 }, log = opts.log || function () {};
    var counted = { read: function () { C.reads++; return relay.read(); }, write: function (rows) { C.writes++; return relay.write(rows); } };
    function snap() { return counted.read().then(fold); }
    function row(placeId, cur, f) { return Object.assign({ _t: T.O, PlaceId: placeId, Seq: (cur ? Number(cur.Seq) : 0) + 1, State: 'O', LockedBy: '', Guests: cur ? cur.Guests : 0, Waiter: cur ? cur.Waiter : '', Customer: cur ? cur.Customer : '', Body: cur ? cur.Body : '{"lines":[]}', Since: cur ? cur.Since : Date.now() }, f); }
    var empty = function (r) { var b = r && r.Body ? JSON.parse(r.Body) : { lines: [] }; return !b.lines.length; };
    var core = {
      counts: C, fold: fold, label: label,
      // enter a table: claim the lock (1 write), read back to see who won (1 read). uniCenta DataLogicReceipts.java:101-135 (shared ticket by place) + decision 11.
      open: async function (placeId, ctx) {
        var s = await snap(), cur = s.tables[placeId];
        if (cur && cur.State === 'L' && cur.LockedBy !== me) { log('§REST_LOCK place=' + placeId + ' till=' + me + ' BLOCKED by ' + cur.LockedBy); return { ok: false, blockedBy: cur.LockedBy }; }
        await counted.write([row(placeId, cur, { State: 'L', LockedBy: me, Waiter: (ctx && ctx.waiter) || (cur && cur.Waiter) || '', Customer: (ctx && ctx.customer) || (cur && cur.Customer) || '' })]);
        var after = (await snap()).tables[placeId];
        if (!after || after.LockedBy !== me) { log('§REST_LOCK place=' + placeId + ' till=' + me + ' LOST race to ' + (after && after.LockedBy)); return { ok: false, blockedBy: after && after.LockedBy }; }
        held[placeId] = JSON.parse(after.Body || '{"lines":[]}'); held[placeId].guests = after.Guests; log('§REST_LOCK place=' + placeId + ' till=' + me + ' HELD seq=' + after.Seq);
        return { ok: true, ticket: held[placeId] };
      },
      setLines: function (placeId, lines, guests) { if (!held[placeId]) throw new Error('table not held'); held[placeId].lines = lines; if (guests !== undefined) held[placeId].guests = guests; },   // the till owns the ticket lines; the core only carries them at leave
      isHeld: function (placeId) { return !!held[placeId]; }, heldIds: function () { return Object.keys(held); },
      tap: function (placeId, line) { if (!held[placeId]) throw new Error('table not held'); held[placeId].lines.push(line); C.taps++; },         // memory only: no request
      guests: async function (placeId, n) { held[placeId].guests = n; },                                                                     // saved with the leave
      // leave the table: ONE write holds the ticket and releases the lock (§32.1 item 3).
      leave: async function (placeId) {
        var s = await snap(), cur = s.tables[placeId], t = held[placeId]; if (!t) throw new Error('table not held');
        await counted.write([row(placeId, cur, { State: t.lines.length ? 'O' : 'C', LockedBy: '', Guests: t.guests || 0, Body: JSON.stringify({ lines: t.lines }) })]); C.saves++; delete held[placeId];
        log('§REST_SAVE place=' + placeId + ' till=' + me + ' lines=' + t.lines.length); return { ok: true };
      },
      // verify the branch PIN only (uniCenta JTicketsBagRestaurant.java:339-350 asks it before Delete Current Order); none set = uniCenta's override.check false = no popup
      checkPin: async function (pin) { var want = (await snap()).settings.PinHash; if (!want) return { ok: true, none: true }; return { ok: (await sha(String(pin))) === want }; },
      // override a lock held by another till: needs the branch PIN (stored hashed in a POS_FloorPlan setting). uniCenta JTicketsBagRestaurant delete/override with PIN.
      override: async function (placeId, pin) {
        var s = await snap(), want = s.settings.PinHash; if (!want || (await sha(String(pin))) !== want) { log('§REST_OVERRIDE place=' + placeId + ' till=' + me + ' REFUSED (pin)'); return { ok: false, reason: 'pin' }; }
        await counted.write([row(placeId, s.tables[placeId], { State: 'L', LockedBy: me, Override: 'Y' })]); var a = (await snap()).tables[placeId];
        if (!a || a.LockedBy !== me) return { ok: false, reason: 'race' };
        held[placeId] = JSON.parse(a.Body || '{"lines":[]}'); held[placeId].guests = a.Guests; log('§REST_OVERRIDE place=' + placeId + ' till=' + me + ' TAKEN'); return { ok: true, ticket: held[placeId] };
      },
      // move: the lines of one table become another's, ONE write group of two rows. uniCenta JTicketsBagRestaurantMap.java:781-880 (move/merge).
      move: async function (from, to) {
        var s = await snap(), a = s.tables[from], b = s.tables[to]; if (b && !empty(b)) return { ok: false, reason: 'occupied' };
        await counted.write([row(to, b, { State: 'O', Body: a.Body, Guests: a.Guests, Waiter: a.Waiter, Customer: a.Customer, Since: a.Since }), row(from, a, { State: 'C', Body: '{"lines":[]}', Guests: 0 })]); return { ok: true };
      },
      merge: async function (from, into) {
        var s = await snap(), a = s.tables[from], b = s.tables[into]; if (!b || empty(b)) return { ok: false, reason: 'target-empty' };
        var lines = JSON.parse(b.Body).lines.concat(JSON.parse(a.Body).lines);
        await counted.write([row(into, b, { State: 'O', Body: JSON.stringify({ lines: lines }), Guests: Number(b.Guests || 0) + Number(a.Guests || 0) }), row(from, a, { State: 'C', Body: '{"lines":[]}', Guests: 0 })]); return { ok: true, lines: lines.length };
      },
      // layout mode (drag + Save) behind a permission. uniCenta JTicketsBagRestaurantMap.java:204-221,1027-1070.
      saveLayout: async function (moves) {
        if (perms.indexOf('rest.layout') < 0) { log('§REST_LAYOUT till=' + me + ' REFUSED (permission)'); return { ok: false, reason: 'permission' }; }
        var s = await snap(), rows = moves.map(function (m) { var p = s.places.filter(function (x) { return x.RecId === m.RecId; })[0]; return Object.assign({}, p, { X: m.X, Y: m.Y, Seq: Number(p.Seq) + 1 }); });
        await counted.write(rows); return { ok: true, n: rows.length };
      },
      // reservations. uniCenta JTicketsBagRestaurantRes.java:60-140,318-369; table chosen at CHECK-IN (§29.N row 17), not at booking.
      book: async function (r) { var id = r.ResId || ('R' + Date.now() + Math.floor(Math.random() * 1e4)); await counted.write([{ _t: T.R, ResId: id, Seq: 1, Customer: r.Customer, At: r.At, Chairs: r.Chairs, State: 'B', PlaceId: '' }]); return id; },
      checkIn: async function (resId, placeId) {
        var s = await snap(), r = s.reservations.filter(function (x) { return x.ResId === resId; })[0], cur = s.tables[placeId];
        if (cur && cur.State === 'L' && cur.LockedBy !== me) return { ok: false, blockedBy: cur.LockedBy }; if (cur && !empty(cur)) return { ok: false, reason: 'occupied' };
        await counted.write([Object.assign({}, r, { Seq: Number(r.Seq) + 1, State: 'I', PlaceId: placeId }), row(placeId, cur, { State: 'O', Customer: r.Customer, Guests: r.Chairs, Body: '{"lines":[]}' })]); return { ok: true };
      },
      done: async function (resId) { var s = await snap(), r = s.reservations.filter(function (x) { return x.ResId === resId; })[0]; await counted.write([Object.assign({}, r, { Seq: Number(r.Seq) + 1, State: 'D' })]); return { ok: true }; }
    };
    return core;
  }
  var API = { create: create, fold: fold, label: label, sha: sha, T: T, FIELDS: FIELDS, fromDb: fromDb, toDb: toDb, sizes: sizes, editRow: editRow };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else g.RestCore = API;
})(typeof window !== 'undefined' ? window : globalThis);
