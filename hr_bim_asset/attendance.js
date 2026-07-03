// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — HR_BIM_ASSET TIME & ATTENDANCE (RESUME_HR_BIM_ASSET.md §PILLAR 2 · §T&A SLICE-1).
//   The signed, SPATIAL, offline check-in engine: an employee emits a signed presence kernel_op at a REAL
//   building zone; the op-log folds into a timesheet + headcount-by-zone. Reuses Connectors.sign/verifyChain
//   (W-SIGN), binding.resolveGuid (the spatial gate), the watermark. Pure + deterministic — the caller
//   supplies `ts` (no Date.now). NON-INVENT GATES:
//     • zone must resolve to a REAL building guid → else honest REFUSE (never a faked presence)
//     • session hours are computed from REAL in/out ts pairs (no fabricated durations)
//     • a check-in with no check-out = an OPEN session (no fabricated finish)
//   No viewer/door hardware here (later integration). Read the log after every run.
(function () {
'use strict';
var _r = (typeof require !== 'undefined'), _g = (typeof self !== 'undefined' ? self : this);
var C = _r ? require('./connectors') : _g.HrConnectors;
var B = _r ? require('./binding') : _g.HbaBinding;
var W = _r ? require('./watermark') : _g.HbaWatermark;

// build + sign ONE presence op onto a chain. shape matches Connectors.canonical (id/ts/period/actor/cls/verb/
// target/params) so sign/verifyChain cover every field. prev = the previous op_hash (GENESIS for the first).
function _signed(ev, prev) {
  var op = { id: ev.employee + '@' + ev.ts, ts: ev.ts, period: String(ev.ts).slice(0, 7),
    actor: ev.employee, cls: 'ATTEND', verb: ev.verb, target: ev.employee,
    params: { zone: ev.zone, building: ev.building || null, kind: ev.verb } };
  return C.sign(op, prev || 'GENESIS');
}

// check-in / check-out. GATED by resolveGuid(zone, knownGuids): un-located zone → honest REFUSE (returns
// {refused:'unlocated-zone'} and NO op). `prev` chains onto an existing log; omit for a fresh GENESIS op.
function _punch(verb, ev, knownGuids, prev) {
  if (!ev || !ev.employee || !ev.zone || ev.ts == null) return { refused: 'incomplete' };
  if (knownGuids != null && !B.resolveGuid(ev.zone, knownGuids)) return { refused: 'unlocated-zone', zone: ev.zone };
  var op = _signed({ employee: ev.employee, ts: ev.ts, zone: ev.zone, building: ev.building, verb: verb }, prev);
  return { op: op };
}
function checkIn(ev, knownGuids, prev) { return _punch('CHECK_IN', ev, knownGuids, prev); }
function checkOut(ev, knownGuids, prev) { return _punch('CHECK_OUT', ev, knownGuids, prev); }

// fold a SIGNED op-log into per-employee presence SESSIONS (in→out pairs). Deterministic. An unmatched
// check-in = an OPEN session (open:true, no fabricated end). Hours from REAL ts (minutes granularity).
function _hoursBetween(tIn, tOut) {
  var a = Date.parse(tIn), b = Date.parse(tOut);
  if (isNaN(a) || isNaN(b) || b < a) return null;        // honest null on bad/again-non-invent input
  return Math.round((b - a) / 36000) / 100;              // hours, 2-dp
}
function sessions(log, period) {
  var ops = log.filter(function (o) { return o.cls === 'ATTEND' && (!period || o.period === period); })
    .slice().sort(function (a, b) { return a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0; });
  var open = {}, out = [];                                // open[emp] = the pending CHECK_IN op
  ops.forEach(function (o) {
    var emp = o.target;
    if (o.verb === 'CHECK_IN') { if (open[emp]) out.push({ employee: emp, zone: open[emp].params.zone, in: open[emp].ts, out: null, hours: null, open: true }); open[emp] = o; }
    else if (o.verb === 'CHECK_OUT' && open[emp]) { out.push({ employee: emp, zone: open[emp].params.zone, in: open[emp].ts, out: o.ts, hours: _hoursBetween(open[emp].ts, o.ts), open: false }); delete open[emp]; }
  });
  Object.keys(open).forEach(function (emp) { out.push({ employee: emp, zone: open[emp].params.zone, in: open[emp].ts, out: null, hours: null, open: true }); });
  return out;
}

// timesheet = sessions rolled to hours per employee (+ per zone). Tamper-evident (verifyChain) + watermarked.
function timesheet(log, period, locale) {
  var ss = sessions(log, period), byEmp = {};
  ss.forEach(function (s) {
    var e = byEmp[s.employee] || (byEmp[s.employee] = { employee: s.employee, hours: 0, sessions: 0, open: 0, byZone: {} });
    e.sessions++; if (s.open) { e.open++; } else { e.hours = Math.round((e.hours + (s.hours || 0)) * 100) / 100; e.byZone[s.zone] = Math.round(((e.byZone[s.zone] || 0) + (s.hours || 0)) * 100) / 100; }
  });
  var verify = C.verifyChain(log.filter(function (o) { return o.cls === 'ATTEND'; }));
  var ts = { period: period || 'all', employees: Object.keys(byEmp).sort().map(function (k) { return byEmp[k]; }),
             sessions: ss, chainOk: verify.ok };
  return W ? W.stamp(ts, locale || 'en') : ts;
}

// headcount per zone over a period (the spatial moat → feeds the density overlay). Counts DISTINCT employees
// present (a closed or open session in the zone). Deterministic; zones are REAL building guids by construction.
function presenceByZone(log, period) {
  var ss = sessions(log, period), z = {};
  ss.forEach(function (s) { (z[s.zone] || (z[s.zone] = {}))[s.employee] = true; });
  return Object.keys(z).sort().map(function (zone) { return { zone: zone, headcount: Object.keys(z[zone]).length }; });
}

// deterministic fingerprint over a timesheet (replay == live anchor).
function fingerprint(ts) {
  var proj = ts.employees.map(function (e) { return { id: e.employee, h: e.hours, o: e.open }; });
  return C._util.sha256(C._util.stableStringify(proj));
}

// demonstrator seed (§T&A SLICE-2 PILL · re-scoped 2026-07-03) — a deterministic, SIGNED check-in log over the
// model's REAL room guids. Implementing RESUME_HBA_ERP_GOVERNED_DISPLAY.md §STAGED-PLAN Stage 1 / §Q-RESOLUTION
// Q2: the demo roster is EMP001/EMP002 ONLY — the same two people ad_payroll.js demoSpec() pays and Stage 1
// seeds as REAL C_BPartner rows (1001/1002) in erp/ad_seed.db — so EVERY check-in identity resolves to a real
// c_bpartner_id (the old EMP-1..EMP-4 + §RICH-DEMO overflow ids resolved to nothing; with 2 real people the
// max per-zone band is 'med' (2-4) — the accepted Q2 tradeoff, richness comes back when real headcount does).
// Movement across zones/storeys is HONEST multi-session data: earlier CLOSED in→out pairs (real derivable
// hours) plus final OPEN check-ins (no fabricated finish). ts derived from the host-supplied `period`
// (YYYY-MM) — NO Date.now; vacancy stays honest (a zone with no check-in has zero headcount, never fabricated).
function demoSeed(rooms, period) {
  var g = (rooms || []).map(function (r) { return r.guid; });
  period = period || '2026-01';
  var log = [], n = 0;
  function ts() { var m = ('0' + (8 + Math.floor(n / 60))).slice(-2), s = ('0' + (n % 60)).slice(-2); n++; return period + '-15T' + m + ':' + s + ':00Z'; } // deterministic; robust beyond 60
  function prev() { return log.length ? log[log.length - 1].op_hash : 'GENESIS'; }
  function ci(emp, zone) { var r = checkIn({ employee: emp, zone: zone, ts: ts() }, null, prev()); if (r.op) log.push(r.op); }
  function co(emp, zone) { var r = checkOut({ employee: emp, zone: zone, ts: ts() }, null, prev()); if (r.op) log.push(r.op); }
  // earlier CLOSED sessions — the two real people moving through the building (other storeys when present):
  if (g[3]) { ci('EMP001', g[3]); co('EMP001', g[3]); }
  if (g[8]) { ci('EMP001', g[8]); co('EMP001', g[8]); ci('EMP002', g[8]); co('EMP002', g[8]); }
  if (g[12]) { ci('EMP002', g[12]); co('EMP002', g[12]); }
  // the "now" picture: zone0 = EMP002 (closed) + EMP001 (OPEN) → headcount 2 (med); zone1 = EMP002 OPEN → 1 (low)
  if (g[0]) { ci('EMP002', g[0]); co('EMP002', g[0]); ci('EMP001', g[0]); }
  if (g[1]) { ci('EMP002', g[1]); }
  // g[2] (and every unvisited zone) left with NO check-in → genuinely zero headcount (presence from absence, never fabricated)
  return { log: log, zones: g };
}

var A = { checkIn: checkIn, checkOut: checkOut, sessions: sessions, timesheet: timesheet,
          presenceByZone: presenceByZone, fingerprint: fingerprint, demoSeed: demoSeed };
if (typeof module === 'object' && module.exports) module.exports = A;
else (typeof self !== 'undefined' ? self : this).HbaAttendance = A;
})();
