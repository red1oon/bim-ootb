// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — HR_BIM_ASSET REQUEST / TICKET (RESUME_HR_BIM_ASSET.md §RESUME — R_Request slice).
//   Models iDempiere R_Request / R_RequestType: a service ticket (maintenance / tenant issue / move) whose
//   STATUS is a SIGNED op-log FSM, and whose target is the SHARED room/asset guid that threads it to the
//   occupancy graph. State = REPLAY of the ops. Reuses the connector W-SIGN seam + binding.resolveGuid + the
//   watermark + occupancy.linkRequest (the availability effect). NON-INVENT GATES:
//     • a request scoped to a resource must resolve to a REAL building guid (else REFUSE — no phantom target)
//     • a status transition must be LEGAL from the current replayed status (else REFUSE — no skipped state)
//     • the current status/assignee are REPLAYED from the ops, never a stored flag
//   REQUEST↔OCCUPANCY: effect() maps a request to its availability op via the shared guid (maintenance→UNAVAIL,
//   move-in→ASSIGN, move-out→RELEASE). Caller supplies `ts` (no Date.now). Read the log after every run.
'use strict';
var _r = (typeof require !== 'undefined'), _g = (typeof self !== 'undefined' ? self : this);
var C = _r ? require('./connectors') : _g.HrConnectors;
var B = _r ? require('./binding') : _g.HbaBinding;
var W = _r ? require('./watermark') : _g.HbaWatermark;
var Oc = _r ? require('./occupancy') : _g.HbaOccupancy;

// the status FSM (R_Status transitions). `from:[null]` = the genesis (OPEN). An illegal verb-from-status pair
// is REFUSED — you cannot CLOSE a NEW ticket or START one that is not ASSIGNED.
var FSM = {
  OPEN:    { from: [null],                            to: 'NEW' },
  ASSIGN:  { from: ['NEW', 'ASSIGNED', 'IN_PROGRESS'], to: 'ASSIGNED' },
  START:   { from: ['ASSIGNED'],                      to: 'IN_PROGRESS' },
  RESOLVE: { from: ['ASSIGNED', 'IN_PROGRESS'],        to: 'RESOLVED' },
  CLOSE:   { from: ['RESOLVED'],                       to: 'CLOSED' },
  REOPEN:  { from: ['RESOLVED', 'CLOSED'],             to: 'IN_PROGRESS' }
};

function _signed(ev, prev) {
  var op = { id: ev.request_no + '@' + ev.ts, ts: ev.ts, period: String(ev.ts).slice(0, 7),
    actor: ev.actor || 'helpdesk', cls: 'REQUEST', verb: ev.verb, target: ev.request_no,
    params: { type: ev.type || null, resource: ev.resource || null, party: ev.party || null, summary: ev.summary || null,
      priority: ev.priority || null, assignee: ev.assignee || null, note: ev.note || null,
      from: ev.from || null, to: ev.to || null, at: ev.at || null } };
  return C.sign(op, prev || 'GENESIS');
}

// OPEN a ticket. A resource-scoped request must resolve to a REAL building guid (spatial gate).
function open(ev, knownGuids, prev) {
  if (!ev || !ev.request_no || !ev.type || ev.ts == null) return { refused: 'incomplete' };
  if (ev.resource && knownGuids != null && !B.resolveGuid(ev.resource, knownGuids)) return { refused: 'unlocated-resource', resource: ev.resource };
  return { op: _signed({ verb: 'OPEN', request_no: ev.request_no, type: ev.type, resource: ev.resource, party: ev.party,
    summary: ev.summary, priority: ev.priority || 'medium', from: ev.from, to: ev.to, at: ev.at, ts: ev.ts, actor: ev.actor }, prev) };
}

// the ops of a ticket, in ts order.
function _ops(log, id) {
  return (log || []).filter(function (o) { return o.cls === 'REQUEST' && (!id || o.target === id); })
    .slice().sort(function (a, b) { return a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0; });
}

// STATE = REPLAY: current status + assignee + the OPEN meta + history. Pure + deterministic.
function state(log, id) {
  var ops = _ops(log, id); if (!ops.length) return null;
  var s = { request_no: id, status: null, assignee: null, history: [] };
  ops.forEach(function (o) {
    var to = (FSM[o.verb] || {}).to; s.status = to != null ? to : s.status;
    if (o.verb === 'OPEN') { ['type', 'resource', 'party', 'summary', 'priority', 'from', 'to', 'at'].forEach(function (k) { s[k] = o.params[k]; }); s.opened = o.ts; }
    if (o.params.assignee) s.assignee = o.params.assignee;
    s.updated = o.ts; s.history.push({ ts: o.ts, verb: o.verb, status: to, assignee: o.params.assignee || null, note: o.params.note || null });
  });
  return s;
}

// a status transition. GATED by the FSM: the verb must be legal from the current replayed status, else REFUSE.
function transition(ev, log, prev) {
  if (!ev || !ev.request_no || !ev.verb || ev.ts == null) return { refused: 'incomplete' };
  if (!FSM[ev.verb] || ev.verb === 'OPEN') return { refused: 'unknown-verb', verb: ev.verb };
  var cur = state(log, ev.request_no); var from = cur ? cur.status : null;
  if (FSM[ev.verb].from.indexOf(from) < 0) return { refused: 'illegal-transition', from: from, verb: ev.verb };
  return { op: _signed({ verb: ev.verb, request_no: ev.request_no, assignee: ev.assignee, note: ev.note, ts: ev.ts, actor: ev.actor }, prev) };
}

// all tickets with their current state.
function requests(log) {
  var ids = {}; _ops(log).forEach(function (o) { ids[o.target] = 1; });
  return Object.keys(ids).sort().map(function (id) { return state(log, id); });
}
// tickets on a given room/asset guid (the shared-resource thread).
function byResource(log, resource) { return requests(log).filter(function (r) { return r.resource === resource; }); }

// my-work inbox: open (not CLOSED) tickets assigned to a person, oldest-first (the deskless queue).
function myWork(log, assignee) {
  return requests(log).filter(function (r) { return r.assignee === assignee && r.status !== 'CLOSED'; })
    .sort(function (a, b) { return a.opened < b.opened ? -1 : a.opened > b.opened ? 1 : 0; });
}

// AGING — open tickets bucketed by age at `asOf` (the dashboard's SLA view). Pure.
function aging(log, asOf) {
  var cut = (typeof asOf === 'number') ? asOf : Date.parse(asOf);
  var buckets = { '<1d': 0, '1-3d': 0, '3-7d': 0, '>7d': 0 }, open = [];
  requests(log).forEach(function (r) {
    if (r.status === 'CLOSED') return;
    var age = (cut - Date.parse(r.opened)) / 86400000;
    var b = age < 1 ? '<1d' : age < 3 ? '1-3d' : age <= 7 ? '3-7d' : '>7d';
    buckets[b]++; open.push({ request_no: r.request_no, resource: r.resource, status: r.status, ageDays: Math.round(age * 10) / 10, priority: r.priority });
  });
  return { asOf: asOf, buckets: buckets, open: open, openCount: open.length };
}

// REQUEST↔OCCUPANCY — the availability effect of a ticket over its shared resource guid (reuses
// occupancy.linkRequest). Returns { kind, ev } the caller emits onto the occupancy log, or null (pure ticket).
function effect(log, id) {
  var r = state(log, id); if (!r || !r.resource) return null;
  return Oc.linkRequest({ type: r.type, resource: r.resource, party: r.party, from: r.from, to: r.to, at: r.at, ts: r.updated, actor: 'request:' + id });
}

// a watermarked ticket statement (a generated output → §DISCLAIMER).
function summary(log, id, locale) {
  var r = state(log, id) || { request_no: id }; r.chainOk = C.verifyChain(_ops(log, id)).ok;
  return W ? W.stamp(r, locale || 'en') : r;
}
// deterministic fingerprint over the ticket states (replay == live anchor).
function fingerprint(log) {
  var proj = requests(log).map(function (r) { return { id: r.request_no, s: r.status, a: r.assignee }; });
  return C._util.sha256(C._util.stableStringify(proj));
}

var R = { FSM: FSM, open: open, transition: transition, state: state, requests: requests, byResource: byResource,
  myWork: myWork, aging: aging, effect: effect, summary: summary, fingerprint: fingerprint };
if (typeof module === 'object' && module.exports) module.exports = R;
else (typeof self !== 'undefined' ? self : this).HbaRequest = R;
