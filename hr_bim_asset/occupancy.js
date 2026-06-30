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
  function ts() { return '2025-12-01T00:00:' + ('0' + (n++)).slice(-2) + 'Z'; }   // deterministic ordering
  function push(res) { if (res.op) log.push(res.op); }
  function prev() { return log.length ? log[log.length - 1].op_hash : 'GENESIS'; }
  if (g[0]) push(assign({ resource: g[0], party: 'BP-TEN-1', from: '2026-01', to: '2026-12', ts: ts() }, null, prev())); // occupied all year
  if (g[1]) push(assign({ resource: g[1], party: 'BP-TEN-2', from: '2026-01', to: '2026-06', ts: ts() }, null, prev())); // expiring mid-year
  if (g[3]) push(assign({ resource: g[3], party: 'BP-TEN-3', from: '2026-01', to: '2026-12', ts: ts() }, null, prev())); // occupied, then renovated
  if (g[3]) push(unavailable({ resource: g[3], from: '2026-03', to: '2026-04', reason: 'renovation', ts: ts() }, null, prev())); // blackout
  if (g[4]) push(assign({ resource: g[4], party: 'BP-TEN-4', from: '2026-01', to: '2026-12', ts: ts() }, null, prev())); // assigned…
  if (g[4]) push(release({ resource: g[4], party: 'BP-TEN-4', at: '2026-08', ts: ts() }, prev()));                       // …early move-out Aug
  // g[2], g[5..] left with NO op → genuinely VACANT (vacancy from absence, never fabricated)
  return { log: log, rooms: g };
}

var O = { assign: assign, release: release, unavailable: unavailable, availability: availability,
  occupancyAt: occupancyAt, resources: resources, lensRows: lensRows, pivot: pivot, linkRequest: linkRequest,
  summary: summary, fingerprint: fingerprint, demoSeed: demoSeed };
if (typeof module === 'object' && module.exports) module.exports = O;
else (typeof self !== 'undefined' ? self : this).HbaOccupancy = O;
})();
