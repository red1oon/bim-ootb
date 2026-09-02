#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-POSTIT (teams/ROADMAP.md §S3, Phase B — standalone, zero impact).
//   Node-only witness over overlay/postit.js: the post-it is a signed `annot` op on a UNIVERSAL anchor,
//   private-first, organised by 4 axes, resurfacing in context — all PURE folds of the signed log,
//   NON-INVENT, deterministic (fixed ids/ts, no Date.now). Touches NO modeller code (connector STUB seam).
//     §ANNOT-SIGNED  — pin produces a signed annot op; verifyChain ok; a tampered msg breaks the chain.
//     §ANCHOR-UNIV   — all 7 universal kinds accepted (doc/field/screen/dashboard/flow/element/broadcast);
//                      an unknown kind throws (never coerced).
//     §PRIVATE-FIRST — default visibility = private (author-only); promote → shared makes it team-visible.
//     §LIFECYCLE     — fold: PIN→open, RESOLVE→resolved+faded, SNOOZE→snoozed, REOPEN→open; REPLY appends.
//     §ORGANISE      — the wall self-tidies by anchor / status / age / @mention.
//     §RECALL        — open an anchor → only its post-its resurface (private-first, resolved hidden).
//     §ORDER-INV     — shuffle op arrival → identical fold (total-order, holder-irrelevant).
//     §NONINVENT     — every folded post-it traces to a PIN op; no invented sticky.
//   Run: node teams/tests/poc_teams_postit.js 2>&1 | tee teams/logs/postit.log — then READ the log.
'use strict';
var path = require('path');
var P = require(path.join(__dirname, '..', 'overlay', 'postit.js'));

var fails = 0;
function verdict(ok, label, detail) { if (!ok) fails++; console.log('   ' + (ok ? '🟢' : '🔴') + ' ' + label + (detail ? ' — ' + detail : '')); }
var T = 1719700000000, DAY = 24 * 3600 * 1000;

(function () {
  console.log('\n═══ W-POSTIT — the self-organising sticky = signed annot op on a universal anchor ═══\n');

  var docA = P.makeAnchor('doc', 'INV-001');
  var dashB = P.makeAnchor('dashboard', 'AR-aging');

  // build a real signed post-it log.
  var log = [];
  log = P.pin(log, { id: 'p1', ts: T + 10, author: 'alice', anchor: docA, msg: 'check tax line @bob' }).log;          // private
  log = P.pin(log, { id: 'p2', ts: T + 20, author: 'carol', anchor: dashB, msg: 'AR spike', visibility: 'shared' }).log;
  log = P.reply(log,   { id: 'r1', ts: T + 30, author: 'bob',   anchor: docA, pinId: 'p1', msg: 'fixed, recheck' }).log;
  log = P.promote(log, { id: 'm1', ts: T + 40, author: 'alice', anchor: docA, pinId: 'p1', visibility: 'shared' }).log;
  log = P.pin(log, { id: 'p3', ts: T + 50, author: 'alice', anchor: docA, msg: 'old note', visibility: 'shared' }).log;
  log = P.resolve(log, { id: 's1', ts: T + 60, author: 'alice', anchor: docA, pinId: 'p3' }).log;
  log = P.snooze(log,  { id: 'z1', ts: T + 70, author: 'carol', anchor: dashB, pinId: 'p2' }).log;

  // §ANNOT-SIGNED — every action is a signed annot op; the chain verifies; tamper breaks it.
  verdict(log.every(function (o) { return o.cls === 'annot' && o.op_hash && o.sig; }) && P.verify(log).ok,
    '§ANNOT-SIGNED  signed annot ops + chain verifies', 'ops=' + log.length + ' verify=' + P.verify(log).ok);
  var tampered = log.map(function (o) { return Object.assign({}, o); });
  tampered[0].params = Object.assign({}, tampered[0].params, { msg: 'EDITED' });
  verdict(!P.verify(tampered).ok, '§ANNOT-SIGNED tamper  edited msg breaks the chain', 'verify=' + P.verify(tampered).ok);

  // §ANCHOR-UNIV — all 7 kinds accepted; unknown kind throws.
  var allKinds = ['doc', 'field', 'screen', 'dashboard', 'flow', 'element', 'broadcast'];
  var okAll = allKinds.every(function (k) { try { P.makeAnchor(k, 'X'); return true; } catch (e) { return false; } });
  var rejected = false; try { P.makeAnchor('bogus', 'X'); } catch (e) { rejected = true; }
  verdict(okAll && rejected, '§ANCHOR-UNIV  7 universal kinds; unknown rejected', 'accepted=' + allKinds.length + '/7 rejectUnknown=' + rejected);

  var posts = P.foldPostits(log);
  var byId = {}; posts.forEach(function (p) { byId[p.pinId] = p; });

  // §PRIVATE-FIRST — a fresh pin defaults private (author-only); after promote → shared = team-visible.
  var freshLog = P.pin([], { id: 'x1', ts: T + 5, author: 'dave', anchor: docA, msg: 'mine only' }).log;
  var fresh = P.foldPostits(freshLog)[0];
  var privBefore = fresh.visibility === 'private' && P.visibleTo(fresh, 'dave') && !P.visibleTo(fresh, 'erin');
  var promoted = byId['p1'];   // alice's p1 promoted to shared at m1
  var sharedAfter = promoted.visibility === 'shared' && P.visibleTo(promoted, 'erin');
  verdict(privBefore && sharedAfter, '§PRIVATE-FIRST  private default → promote → team-visible',
    'fresh=' + fresh.visibility + '(dave-only) p1=' + promoted.visibility + '(team)');

  // §LIFECYCLE — statuses + reply append.
  verdict(byId['p1'].status === 'open' && byId['p1'].replies.length === 1 && byId['p1'].replies[0].author === 'bob' &&
          byId['p3'].status === 'resolved' && byId['p3'].faded && byId['p2'].status === 'snoozed' && byId['p2'].faded,
    '§LIFECYCLE  PIN/RESOLVE/SNOOZE/REPLY fold', 'p1=open+1reply p3=resolved/faded p2=snoozed/faded');

  // §ORGANISE — anchor / status / mention / age.
  var byAnchor = P.organise(posts, 'anchor');
  var byStatus = P.organise(posts, 'status');
  var byMention = P.organise(posts, 'mention');
  var byAge = P.organise(posts, 'age', { now: T + 70, ageMs: 1 * DAY });   // all within a day → 'new'
  var orgOk = (byAnchor['doc:INV-001'] || []).length === 2 &&         // p1, p3
              (byStatus['open'] || []).length === 1 &&                 // p1
              (byStatus['resolved'] || []).length === 1 &&             // p3
              (byMention['bob'] || []).length === 1 &&                 // p1 (@bob)
              (byAge['new'] || []).length === posts.length;            // all recent
  verdict(orgOk, '§ORGANISE  anchor/status/mention/age axes', 'doc:INV-001=' + (byAnchor['doc:INV-001'] || []).length +
    ' open=' + (byStatus['open'] || []).length + ' @bob=' + (byMention['bob'] || []).length + ' new=' + (byAge['new'] || []).length);

  // §RECALL — open INV-001 as bob: resurfaces p1 (shared, open); hides p3 (resolved) by default.
  var recalled = P.recall(posts, docA, 'bob');
  var recallOk = recalled.length === 1 && recalled[0].pinId === 'p1';
  var withResolved = P.recall(posts, docA, 'bob', { includeResolved: true }).length === 2;
  verdict(recallOk && withResolved, '§RECALL  anchor context resurfaces (resolved hidden by default)',
    'INV-001→' + recalled.map(function (p) { return p.pinId; }).join(',') + ' (+resolved=2)');

  // §ORDER-INV — shuffle arrival → identical fold.
  var shuffled = log.slice().reverse();
  verdict(JSON.stringify(P.foldPostits(log)) === JSON.stringify(P.foldPostits(shuffled)),
    '§ORDER-INV  shuffle → identical fold', 'total-order, holder-irrelevant');

  // §NONINVENT — every folded post-it has a PIN op behind it; no invented sticky.
  var pinIds = log.filter(function (o) { return o.verb === 'PIN'; }).map(function (o) { return o.params.pinId; }).sort();
  var foldIds = posts.map(function (p) { return p.pinId; }).sort();
  verdict(JSON.stringify(pinIds) === JSON.stringify(foldIds), '§NONINVENT  every post-it traces to a PIN op',
    'pins=[' + pinIds.join(',') + '] fold=[' + foldIds.join(',') + ']');

  var n = 9;
  console.log('\n' + (fails === 0 ? '✅ W-POSTIT ' + n + '/' + n + ' PASS' : '❌ ' + fails + '/' + n + ' FAIL') + '\n');
  process.exit(fails === 0 ? 0 : 1);
})();
