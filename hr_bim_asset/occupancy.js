// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — HR_BIM_ASSET ROOM OCCUPANCY / AVAILABILITY (RESUME_HR_BIM_ASSET.md §RESUME — Resource-
//   Assignment slice). Models iDempiere's S_Resource / S_ResourceAssignment: a ROOM is a Resource (IS-A
//   M_Product); an ASSIGN books AssignDateFrom→AssignDateTo over the room's REAL guid; a RELEASE ends it
//   early; an UNAVAIL is the S_ResourceUnAvailable blackout (the effect a maintenance Request raises). The
//   per-room availability is a REPLAY of this signed op-log — never a stored/guessed flag. Reuses the
//   connector W-SIGN seam (C.sign/verifyChain) + binding.resolveGuid (spatial gate) + the watermark.
//   NON-INVENT GATES:
//     • ASSIGN/UNAVAIL refuse a resource that does not resolve to a REAL building guid (no phantom rooms)
//     • availability(room,period) is REPLAYED from the ops (occupied/vacant/expiring/unavailable) — honest
//     • a vacant room is shown vacant from ABSENCE of an assignment, never a fabricated tenant
//   REQUEST RELATION: `linkRequest` maps an R_Request to its availability effect via the shared resource guid
//   (move-in→ASSIGN · move-out→RELEASE · maintenance→UNAVAIL) — the full ticket workflow is a later slice.
//   Caller supplies `ts` (no Date.now) → deterministic + replayable. Read the log after every run.
(function () {
'use strict';
var _r = (typeof require !== 'undefined'), _g = (typeof self !== 'undefined' ? self : this);
var C = _r ? require('./connectors') : _g.HrConnectors;
var B = _r ? require('./binding') : _g.HbaBinding;
var W = _r ? require('./watermark') : _g.HbaWatermark;

function _ge(a, b) { return !b || a >= b; }              // period >= from (open if from null)
function _le(a, b) { return !b || a <= b; }              // period <= to   (open if to null)
function ymNum(p) { var a = String(p).split('-'); return (+a[0]) * 12 + (+a[1]); }

// build + sign ONE occupancy op onto a chain (shape matches Connectors.canonical → sign/verifyChain cover it).
function _signed(ev, prev) {
  var op = { id: ev.verb + ':' + ev.resource + '@' + ev.ts, ts: ev.ts, period: String(ev.ts).slice(0, 7),
    actor: ev.actor || 'leasing', cls: 'OCCUPANCY', verb: ev.verb, target: ev.resource,
    params: { party: ev.party || null, from: ev.from || null, to: ev.to || null, at: ev.at || null, reason: ev.reason || null, product: ev.product || 'ROOM' } };
  return C.sign(op, prev || 'GENESIS');
}

// ASSIGN a room (Resource) to a party for a period range. Spatial gate: room must resolve to a REAL guid.
function assign(ev, knownGuids, prev) {
  if (!ev || !ev.resource || !ev.party || !ev.from || ev.ts == null) return { refused: 'incomplete' };
  if (knownGuids != null && !B.resolveGuid(ev.resource, knownGuids)) return { refused: 'unlocated-room', resource: ev.resource };
  return { op: _signed({ verb: 'ASSIGN', resource: ev.resource, party: ev.party, from: ev.from, to: ev.to, ts: ev.ts, actor: ev.actor, product: ev.product }, prev) };
}
// RELEASE a party's occupancy at a period (early move-out). No spatial gate (the room was already located).
function release(ev, prev) {
  if (!ev || !ev.resource || !ev.party || !ev.at || ev.ts == null) return { refused: 'incomplete' };
  return { op: _signed({ verb: 'RELEASE', resource: ev.resource, party: ev.party, at: ev.at, ts: ev.ts, actor: ev.actor }, prev) };
}
// UNAVAIL — mark a room unavailable over a range (S_ResourceUnAvailable blackout; raised by a maintenance Request).
function unavailable(ev, knownGuids, prev) {
  if (!ev || !ev.resource || !ev.from || ev.ts == null) return { refused: 'incomplete' };
  if (knownGuids != null && !B.resolveGuid(ev.resource, knownGuids)) return { refused: 'unlocated-room', resource: ev.resource };
  return { op: _signed({ verb: 'UNAVAIL', resource: ev.resource, from: ev.from, to: ev.to, reason: ev.reason || 'maintenance', ts: ev.ts, actor: ev.actor }, prev) };
}

// the occupancy ops for a resource, in ts order.
function _ops(log, resource) {
  return (log || []).filter(function (o) { return o.cls === 'OCCUPANCY' && (!resource || o.target === resource); })
    .slice().sort(function (a, b) { return a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0; });
}

// distinct resources (rooms) that appear in the log.
function resources(log) {
  var s = {}; _ops(log).forEach(function (o) { s[o.target] = 1; }); return Object.keys(s).sort();
}

// AVAILABILITY = REPLAY. The state of a room at a period: 'unavailable' (blackout) wins; else 'occupied'
// (an active assignment covers the period, capped by any earlier RELEASE), 'expiring' (occupied + ends within
// horizon), else 'vacant'. Returns { state, party, to }. Pure + deterministic; never a stored flag.
function availability(log, resource, period, opts) {
  var horizon = (opts && opts.horizonMonths != null) ? opts.horizonMonths : 2;
  var ops = _ops(log, resource), releases = {};
  ops.forEach(function (o) { if (o.verb === 'RELEASE') { var k = o.params.party + '|'; releases[k] = (releases[k] && releases[k] < o.params.at) ? releases[k] : o.params.at; } });
  // blackout?
  for (var i = 0; i < ops.length; i++) { var u = ops[i]; if (u.verb === 'UNAVAIL' && _ge(period, u.params.from) && _le(period, u.params.to)) return { state: 'unavailable', party: null, to: u.params.to, reason: u.params.reason }; }
  // active assignment covering the period (respecting an early release)?
  var hit = null;
  ops.forEach(function (o) {
    if (o.verb !== 'ASSIGN') return;
    var to = o.params.to, rel = releases[o.params.party + '|'];
    if (rel != null && (to == null || rel < to)) to = rel;               // early move-out caps the term
    if (_ge(period, o.params.from) && _le(period, to)) hit = { party: o.params.party, to: to };
  });
  if (!hit) return { state: 'vacant', party: null, to: null };
  var d = hit.to ? (ymNum(hit.to) - ymNum(period)) : 999;
  return { state: (d >= 0 && d <= horizon) ? 'expiring' : 'occupied', party: hit.party, to: hit.to };
}

// who occupies the room at a period (or null) — convenience over availability().
function occupancyAt(log, resource, period) { var a = availability(log, resource, period); return (a.state === 'occupied' || a.state === 'expiring') ? a.party : null; }

// lens rows for the overlay: [{zone, state, party, to}] over a resource set (default = resources in the log).
function lensRows(log, period, opts) {
  var rs = (opts && opts.resources) ? opts.resources : resources(log);
  return rs.map(function (r) { var a = availability(log, r, period, opts); return { zone: r, state: a.state, party: a.party, to: a.to }; });
}

// PIVOT — the dashboard graph data (free): resource × period matrix + per-period rollup + per-room utilization
// + per-storey rollup (when opts.storeyOf supplied). allResources (e.g. the building's room list) lets VACANT
// rooms appear even with no op. Pure + deterministic; the chart pane just renders this.
function pivot(log, periods, opts) {
  opts = opts || {};
  var rs = opts.allResources ? opts.allResources.slice() : resources(log);
  var storeyOf = opts.storeyOf || function () { return 'Unknown'; };
  var byRoom = {}, byPeriod = {}, byStorey = {};
  periods.forEach(function (p) { byPeriod[p] = { period: p, occupied: 0, vacant: 0, unavailable: 0, expiring: 0, total: 0 }; });
  rs.forEach(function (r) {
    var cells = {}, occ = 0; var st = storeyOf(r) || 'Unknown';
    periods.forEach(function (p) {
      var s = availability(log, r, p, opts).state; cells[p] = s;
      byPeriod[p].total++; byPeriod[p][s]++;
      if (s === 'occupied' || s === 'expiring') occ++;
      (byStorey[st] || (byStorey[st] = { storey: st, occupied: 0, total: 0 }));
      byStorey[st].total++; if (s === 'occupied' || s === 'expiring') byStorey[st].occupied++;
    });
    byRoom[r] = { resource: r, storey: st, cells: cells, occupiedPeriods: occ, totalPeriods: periods.length,
      utilization: periods.length ? Math.round((occ / periods.length) * 100) / 100 : 0 };
  });
  Object.keys(byPeriod).forEach(function (p) { var b = byPeriod[p]; b.occRate = b.total ? Math.round(((b.occupied + b.expiring) / b.total) * 100) / 100 : 0; });
  Object.keys(byStorey).forEach(function (k) { var b = byStorey[k]; b.utilization = b.total ? Math.round((b.occupied / b.total) * 100) / 100 : 0; });
  var totRooms = rs.length, avg = totRooms ? Math.round((Object.keys(byRoom).reduce(function (s, k) { return s + byRoom[k].utilization; }, 0) / totRooms) * 100) / 100 : 0;
  return { periods: periods.slice(), byRoom: byRoom, byPeriod: byPeriod,
    byStorey: Object.keys(byStorey).sort().map(function (k) { return byStorey[k]; }),
    overall: { rooms: totRooms, avgUtilization: avg }, watermark: W ? W.mark(opts.locale || 'en') : null };
}

// REQUEST RELATION — map an R_Request to its availability EFFECT over the shared resource guid. Returns
// { kind:'ASSIGN'|'RELEASE'|'UNAVAIL', ev } the caller emits, or null for a pure ticket (no availability change).
function linkRequest(request) {
  if (!request || !request.resource || !request.type) return null;
  var t = String(request.type).toLowerCase(), base = { resource: request.resource, party: request.party || null, ts: request.ts, actor: request.actor || 'request' };
  if (t === 'move-in' || t === 'new-lease') return { kind: 'ASSIGN', ev: Object.assign(base, { from: request.from, to: request.to }) };
  if (t === 'move-out' || t === 'lease-end' || t === 'termination') return { kind: 'RELEASE', ev: Object.assign(base, { at: request.at || request.from }) };
  if (t === 'maintenance' || t === 'renovation' || t === 'blackout' || t === 'fitout') return { kind: 'UNAVAIL', ev: Object.assign(base, { from: request.from, to: request.to, reason: t }) };
  return null;                                          // complaint / query / other → pure ticket, no effect
}

// a watermarked availability statement (a generated output → §DISCLAIMER).
function summary(log, period, opts, locale) {
  var rows = lensRows(log, period, opts);
  var roll = { occupied: 0, vacant: 0, expiring: 0, unavailable: 0 };
  rows.forEach(function (r) { roll[r.state]++; });
  var out = { period: period, rooms: rows.length, rollup: roll, rows: rows,
    chainOk: C.verifyChain((log || []).filter(function (o) { return o.cls === 'OCCUPANCY'; })).ok };
  return W ? W.stamp(out, locale || 'en') : out;
}

// deterministic fingerprint over the per-room/period matrix (replay == live anchor).
function fingerprint(log, periods, opts) {
  var pv = pivot(log, periods, opts);
  var proj = Object.keys(pv.byRoom).sort().map(function (r) { return { r: r, u: pv.byRoom[r].utilization }; });
  return C._util.sha256(C._util.stableStringify(proj));
}

// DEMO SEED — populate HHS across REAL rooms (non-invent: guids come from the fixture). Builds a SIGNED,
// chained log so the demo is the same tamper-evident substrate as production. `rooms` = fixture rooms[].
function demoSeed(rooms) {
  var g = (rooms || []).map(function (r) { return r.guid; });
  var log = [], n = 0;
  function ts() { var m = ('0' + Math.floor(n / 60)).slice(-2), s = ('0' + (n % 60)).slice(-2); n++; return '2025-12-01T00:' + m + ':' + s + 'Z'; } // deterministic; min:sec robust beyond 60 ops
  function push(res) { if (res && res.op) log.push(res.op); }
  function prev() { return log.length ? log[log.length - 1].op_hash : 'GENESIS'; }
  // §RICH-DEMO (P2, 2026-07-01) — spread a DETERMINISTIC, meaningful MIX across EVERY room so ALL storeys
  // populate (the user flagged the old seed lit only Level 1: it hard-coded g[0..4]). State cycles by room index
  // — occupied → expiring → VACANT(no op) → occupied+renovation-blackout → assigned-then-released — so each run of
  // 5 rooms shows the full mix. g[0..4] behave EXACTLY as the prior seed (existing witnesses preserved). Real room
  // guids; demonstrator (watermarked-context) parties/dates; vacancy is genuine ABSENCE (never a fabricated op).
  for (var i = 0; i < g.length; i++) {
    var party = 'BP-TEN-' + (i + 1);
    switch (i % 5) {
      case 0: push(assign({ resource: g[i], party: party, from: '2026-01', to: '2026-12', ts: ts() }, null, prev())); break;             // occupied all year
      case 1: push(assign({ resource: g[i], party: party, from: '2026-01', to: '2026-06', ts: ts() }, null, prev())); break;             // expiring mid-year
      case 2: break;                                                                                                                      // VACANT (no op)
      case 3: push(assign({ resource: g[i], party: party, from: '2026-01', to: '2026-12', ts: ts() }, null, prev()));                     // occupied…
              push(unavailable({ resource: g[i], from: '2026-03', to: '2026-04', reason: 'renovation', ts: ts() }, null, prev())); break;  // …renovation blackout
      case 4: push(assign({ resource: g[i], party: party, from: '2026-01', to: '2026-12', ts: ts() }, null, prev()));                     // assigned…
              push(release({ resource: g[i], party: party, at: '2026-08', ts: ts() }, prev())); break;                                    // …early move-out Aug
    }
  }
  return { log: log, rooms: g };
}

// COMPILE (not model) — project a signed ASSIGN op onto the REAL native `s_resourceassignment` shape
// (prompts/RESUME_HR_BIM_ASSET.md §CRITICAL, P-OCC-RETRO). Columns verified against build/erp/ad_full.db
// `PRAGMA table_info(s_resourceassignment)` — s_resource_id/name/description/assigndatefrom/assigndateto/
// qty/isconfirmed are the REAL columns; there is NO party/tenant column on this table natively (verified —
// the full column list has none), so `party` is carried alongside for the caller to thread onto the
// commercial document (C_Order/C_Invoice.c_bpartner_id) instead, never bolted onto the assignment row itself.
function toResourceAssignmentRow(assignOp, seedId) {
  if (!assignOp || assignOp.verb !== 'ASSIGN') return null;
  var p = assignOp.params;
  return { s_resourceassignment_id: seedId ? seedId() : 1, s_resource_id: assignOp.target,
    name: assignOp.target, description: 'ASSIGN ' + p.party + ' ' + p.from + (p.to ? ('..' + p.to) : ''),
    assigndatefrom: p.from, assigndateto: p.to, qty: 1, isconfirmed: 'Y', _party: p.party };
}

// COMPILE (not model) — a REAL `s_resource` header row for a room (§P11, RESUME_HR_BIM_ASSET.md, deep-link
// "hover a Resource" ask). Columns verified against build/erp/ad_full.db `PRAGMA table_info(s_resource)`:
// value/name/s_resourcetype_id/isavailable are real. `s_resourcetype_id` needs a REAL S_ResourceType row —
// this repo's ad_full.db only carries Consultant(100)/Plants(50000)/Work Center(50001), none of which fit
// "Room" — so ONE new dictionary row is compiled on demand, the SAME "extend the dictionary with the missing
// master row" precedent already used by ad_tenancy.js's toWarehouseRow and iot.js's toUomRow, never forced
// onto an ill-fitting existing type.
function toResourceTypeRow(seedId) {
  return { s_resourcetype_id: seedId ? seedId() : 1, name: 'Room' };
}
// §DESIGN-RESOURCE-AVAILABILITY (RESUME_HBA_ERP_GOVERNED_DISPLAY.md, 2026-07-03) — `isavailable` and
// `percentutilization` are REAL S_Resource columns (verified against build/erp/ad_full.db PRAGMA — the
// witness_erp_deeplink.js `s_resource` REAL_COLS list carries both). They were previously a hardcoded
// `isavailable:'Y'` for EVERY room (a fabricated constant that never consulted the already-witnessed 21/21
// ASSIGN/RELEASE/UNAVAIL signed-replay availability() engine). This threads the REPLAYED state onto the real
// columns instead:
//   • isavailable — the NATIVE master on/off gate ("is this resource in service / bookable at all"). Set 'N'
//     ONLY when the room's replayed state is 'unavailable' (a real S_ResourceUnAvailable blackout / maintenance
//     — genuinely out of service). occupied/expiring/vacant are all 'Y' (the resource EXISTS and is schedulable;
//     WHO holds it WHEN is tracked by S_ResourceAssignment slots, not by flipping the master gate). This is the
//     honest native semantics — never a guessed flag.
//   • percentutilization — the room's REAL utilization from occupancy.pivot() (occupiedPeriods/totalPeriods),
//     ×100 to the column's percentage grain. A currently-inert dictionary column (no native engine consumes it)
//     populated meaningfully from a value we already compute — non-invent, the source already exists+is witnessed.
// `avail` = { state, percentutilization } supplied by compileResources from the SAME signed occupancy replay
// the Occupancy lens uses. ABSENT (avail null) → back-compat: master 'Y', no percentutilization (the prior
// behaviour verbatim — every existing witness that calls compileResources(rooms) with no log stays green).
function toResourceRow(room, s_resourcetype_id, seedId, avail) {
  if (!room || !room.guid) return null;
  var row = { s_resource_id: seedId ? seedId() : 1, value: room.guid, name: room.name || room.guid,
    s_resourcetype_id: s_resourcetype_id, isavailable: (avail && avail.state === 'unavailable') ? 'N' : 'Y' };
  if (avail && avail.percentutilization != null) row.percentutilization = avail.percentutilization;
  return row;
}
// compile the WHOLE building's rooms into S_Resource headers in one pass — {resourceType, resources:[{row,guid}],
// _watermark}. ONE resource type shared by every room (real rooms only — never fabricates a resource for a
// guid that isn't in `rooms`). §DESIGN-RESOURCE-AVAILABILITY: when `opts.log` (the signed occupancy op-log,
// e.g. A._hbaOccupancyLog) + `opts.period`/`opts.periods` are supplied, each room's real availability state +
// utilization are REPLAYED (never stored/guessed) and threaded onto the row's real isavailable/
// percentutilization columns. No log → unchanged legacy behaviour (master 'Y', no utilization).
function compileResources(rooms, opts) {
  rooms = rooms || []; opts = opts || {};
  var seq = 0; function seedId() { return ++seq; }
  var resourceType = toResourceTypeRow(function () { return 1; });
  var log = opts.log || null, period = opts.period || null;
  var periods = opts.periods || (period ? [period] : null);
  // pivot over the SAME rooms so VACANT rooms still get a (0%) utilization — allResources = the real room guids.
  var pv = (log && periods && periods.length) ? pivot(log, periods, { allResources: rooms.map(function (r) { return r.guid; }), storeyOf: opts.storeyOf }) : null;
  var resources = rooms.map(function (r) {
    var avail = null;
    if (log) {
      var st = period ? availability(log, r.guid, period, opts).state : null;
      var util = (pv && pv.byRoom[r.guid]) ? Math.round(pv.byRoom[r.guid].utilization * 100) : null;
      avail = { state: st, percentutilization: util };
    }
    return { row: toResourceRow(r, resourceType.s_resourcetype_id, seedId, avail), guid: r.guid };
  });
  return W.stamp({ resourceType: resourceType, resources: resources }, opts.locale || 'en');
}

var O = { assign: assign, release: release, unavailable: unavailable, availability: availability,
  occupancyAt: occupancyAt, resources: resources, lensRows: lensRows, pivot: pivot, linkRequest: linkRequest,
  summary: summary, fingerprint: fingerprint, demoSeed: demoSeed, toResourceAssignmentRow: toResourceAssignmentRow,
  toResourceTypeRow: toResourceTypeRow, toResourceRow: toResourceRow, compileResources: compileResources };
if (typeof module === 'object' && module.exports) module.exports = O;
else (typeof self !== 'undefined' ? self : this).HbaOccupancy = O;
})();
