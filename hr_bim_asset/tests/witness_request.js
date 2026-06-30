// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-HBA-REQUEST witness (R_Request slice — service ticket as a signed status FSM threaded
//   to the room/asset guid). Each check NAMES the issue it proves. Load-bearing: a ticket is SIGNED + (when
//   resource-scoped) bound to a REAL guid (phantom → REFUSE); STATUS is a REPLAY of the op-log; an illegal
//   transition is REFUSED (FSM); tickets group by the SHARED resource guid; aging/my-work are pure dashboard
//   views; a resolved request emits its occupancy effect over the same guid (closes the Request↔occupancy loop).
//   Run: node hr_bim_asset/tests/witness_request.js
'use strict';
var fs = require('fs'), path = require('path');
var Rq = require('../request'), Oc = require('../occupancy'), C = require('../connectors'), B = require('../binding');
var checks = [];
function ok(tag, cond, msg) { checks.push(!!cond); console.log('§HBA-REQ ' + (cond ? 'PASS' : 'FAIL') + ' ' + tag + ' — ' + msg); }

var FX = JSON.parse(fs.readFileSync(path.join(__dirname, '../fixtures/hhs_rooms.json'), 'utf8'));
var ROOM = FX.rooms[5].guid, ROOM2 = FX.rooms[6].guid, FAKE = 'GUID-NOT-IN-BUILDING';

// chain helper
var log = [];
function prev() { return log.length ? log[log.length - 1].op_hash : 'GENESIS'; }
function pushOpen(ev) { var r = Rq.open(ev, FX, prev()); if (r.op) log.push(r.op); return r; }
function pushTr(ev) { var r = Rq.transition(ev, log, prev()); if (r.op) log.push(r.op); return r; }

// ---- R0: OPEN a resource-scoped ticket → signed, chain verifies -------------------------------------------
pushOpen({ request_no: 'REQ-001', type: 'maintenance', resource: ROOM, party: 'BP-TEN-2', summary: 'AHU noisy', priority: 'high', from: '2026-05', to: '2026-06', ts: '2026-04-20T08:00:00Z' });
ok('R0-signed-open', log.length === 1 && log[0].sig && C.verifyChain(log).ok && Rq.state(log, 'REQ-001').status === 'NEW',
  'OPEN → a signed ticket op; verifyChain OK; replayed status = NEW');

// ---- R1: a ticket on a non-existent room is REFUSED (spatial gate) ----------------------------------------
ok('R1-refuse-phantom', Rq.open({ request_no: 'REQ-X', type: 'maintenance', resource: FAKE, ts: '2026-04-20T08:00:00Z' }, FX).refused === 'unlocated-resource' && B.resolveGuid(FAKE, FX) === false,
  'a request scoped to a room not in the building → REFUSE (no phantom target)');

// ---- R2: legal FSM path open→assign→start→resolve→close; state replays at each step -----------------------
pushTr({ request_no: 'REQ-001', verb: 'ASSIGN', assignee: 'EMP002', ts: '2026-04-20T09:00:00Z' });
ok('R2a-assign', Rq.state(log, 'REQ-001').status === 'ASSIGNED' && Rq.state(log, 'REQ-001').assignee === 'EMP002', 'ASSIGN → ASSIGNED, assignee replayed = EMP002');
pushTr({ request_no: 'REQ-001', verb: 'START', ts: '2026-04-21T10:00:00Z' });
pushTr({ request_no: 'REQ-001', verb: 'RESOLVE', note: 'fan bearing replaced', ts: '2026-04-22T15:00:00Z' });
ok('R2b-resolve', Rq.state(log, 'REQ-001').status === 'RESOLVED' && Rq.state(log, 'REQ-001').history.length === 4, 'START→RESOLVE replays to RESOLVED with 4 history steps');

// ---- R3: an ILLEGAL transition is REFUSED (FSM gate) ------------------------------------------------------
ok('R3-illegal', Rq.transition({ request_no: 'REQ-001', verb: 'START', ts: 't' }, log).refused === 'illegal-transition'
  && Rq.transition({ request_no: 'REQ-001', verb: 'OPEN', ts: 't' }, log).refused === 'unknown-verb',
  'START from RESOLVED → REFUSE illegal-transition; re-OPEN → REFUSE (no skipped/duplicate state)');

// ---- R4: CLOSE then REOPEN (legal) -----------------------------------------------------------------------
pushTr({ request_no: 'REQ-001', verb: 'CLOSE', ts: '2026-04-23T09:00:00Z' });
pushTr({ request_no: 'REQ-001', verb: 'REOPEN', note: 'noise returned', ts: '2026-05-02T09:00:00Z' });
ok('R4-reopen', Rq.state(log, 'REQ-001').status === 'IN_PROGRESS', 'CLOSE→REOPEN → back to IN_PROGRESS (legal)');

// ---- R5: tickets group by the SHARED resource guid -------------------------------------------------------
pushOpen({ request_no: 'REQ-002', type: 'complaint', resource: ROOM, party: 'BP-TEN-2', summary: 'temperature', ts: '2026-05-03T08:00:00Z' });
pushOpen({ request_no: 'REQ-003', type: 'maintenance', resource: ROOM2, party: 'BP-TEN-3', summary: 'light out', ts: '2026-05-04T08:00:00Z' });
ok('R5-by-resource', Rq.byResource(log, ROOM).length === 2 && Rq.byResource(log, ROOM2).length === 1,
  'byResource threads tickets to the room guid: ROOM has 2, ROOM2 has 1 (shared-resource join)');

// ---- R6: AGING buckets + my-work inbox (dashboard views) -------------------------------------------------
pushTr({ request_no: 'REQ-003', verb: 'ASSIGN', assignee: 'EMP002', ts: '2026-05-04T09:00:00Z' });
var ag = Rq.aging(log, '2026-05-10T00:00:00Z');
ok('R6a-aging', ag.openCount === 3 && (ag.buckets['>7d'] + ag.buckets['3-7d'] + ag.buckets['1-3d'] + ag.buckets['<1d']) === 3,
  'aging: 3 open tickets bucketed by age (none CLOSED — REQ-001 reopened) — SLA dashboard view');
var mine = Rq.myWork(log, 'EMP002');
ok('R6b-mywork', mine.length === 2 && mine[0].request_no === 'REQ-001',
  'my-work for EMP002 = the 2 tickets assigned to me, oldest-first (REQ-001 then REQ-003)');

// ---- R7: REQUEST↔OCCUPANCY — a maintenance ticket emits its UNAVAIL effect over the shared room guid ------
var eff = Rq.effect(log, 'REQ-001');                       // type maintenance, resource ROOM, from/to 2026-05/06
ok('R7a-effect-map', eff && eff.kind === 'UNAVAIL' && eff.ev.resource === ROOM && eff.ev.from === '2026-05',
  'a maintenance ticket → an UNAVAIL availability effect over the SAME room guid (Request drives occupancy)');
var occLog = [Oc.unavailable(eff.ev, FX, 'GENESIS').op];
ok('R7b-effect-applied', Oc.availability(occLog, ROOM, '2026-05').state === 'unavailable',
  'applying the effect → the room is unavailable in the occupancy graph (loop closed via the guid)');
ok('R7c-pure-ticket', Rq.effect(log, 'REQ-002') === null,
  'a complaint ticket → no availability effect (pure ticket) — non-invent (not every request moves the room)');

// ---- R8: tamper-evident + deterministic + watermarked summary --------------------------------------------
var tampered = JSON.parse(JSON.stringify(log)); tampered[1].params.assignee = 'EMP999';
ok('R8-tamper', C.verifyChain(tampered).ok === false, 'editing a signed ticket op (re-assign) breaks verifyChain');
ok('R9-deterministic', Rq.fingerprint(log) === Rq.fingerprint(JSON.parse(JSON.stringify(log))), 'ticket-state fingerprint is deterministic (replay == live)');
var sum = Rq.summary(log, 'REQ-001', 'ms');
ok('R10-watermark', sum._watermark === 'CONTOH — TIDAK RASMI' && sum.status === 'IN_PROGRESS' && sum.chainOk === true,
  'ticket summary is a watermarked output (ms) with replayed status + chainOk');

var pass = checks.filter(Boolean).length, fail = checks.length - pass;
console.log('\n§HBA-REQ ' + pass + '/' + checks.length + ' PASS' + (fail ? (' — ' + fail + ' FAIL') : ''));
process.exit(fail ? 1 : 0);
