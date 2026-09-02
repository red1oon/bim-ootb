#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-XPRESENCE (teams/ROADMAP.md §S11, Phase F — THE MOAT: unified BIM↔ERP presence).
//   Node-only witness over overlay/presence.js — ONE identity/colour fabric folded from presence heartbeats
//   that ride the SAME shared bus both products use. Pure, deterministic, NON-INVENT, zero modeller/erp edits.
//   Fixed ts (no Date.now / Math.random). Each § names the issue it proves.
//     §UNIFIED-ID  — a user heartbeating from BOTH bim and erp folds to ONE identity (perProduct={bim,erp}).
//     §COLOUR      — colour = signer: same person → same colour in BOTH products; different people differ.
//     §LATEST      — the unified "where now" = the max-ts heartbeat across products; per-product kept too.
//     §CROSS-READ  — THE MOAT: an ERP viewer reads BIM peers (and vice-versa) with their unified location.
//     §ACTIVE      — active = within the presence window of `now`; beyond → stale → faded dot.
//     §BUS         — the heartbeats round-trip the shared BroadcastChannel('bim_teams') seam → identical fold.
//     §DETERMINISM — shuffle arrival → identical fold; unknown product / missing user REFUSED (throw).
//   Run: node teams/tests/poc_teams_presence.js 2>&1 | tee teams/logs/presence.log — then READ the log.
'use strict';
var path = require('path');
var PR = require(path.join(__dirname, '..', 'overlay', 'presence.js'));
var D = require(path.join(__dirname, '..', 'overlay', 'dot_layer.js'));
var C = require(path.join(__dirname, '..', 'connectors.js'));

var fails = 0;
function verdict(ok, label, detail) { if (!ok) fails++; console.log('   ' + (ok ? '🟢' : '🔴') + ' ' + label + (detail ? ' — ' + detail : '')); }
var T = 1719700000000;

(function () {
  console.log('\n═══ W-XPRESENCE — unified BIM↔ERP presence: one identity, one colour, across both products ═══\n');

  // alice works in BOTH products (erp earlier, bim later → her "now" is BIM); bob in ERP; carol in BIM (stale).
  var beats = [
    PR.makePresence({ user: 'alice', product: 'erp', location: { role: 'AP', org: 'HQ', doc: 'INV-9' }, ts: T + 50 }),
    PR.makePresence({ user: 'alice', product: 'bim', location: { discipline: 'STR', level: 3, space: 'Grid-B' }, ts: T + 100 }),
    PR.makePresence({ user: 'bob',   product: 'erp', location: { role: 'Approver', org: 'HQ', doc: 'PO-1' }, ts: T + 80 }),
    PR.makePresence({ user: 'carol', product: 'bim', location: { discipline: 'ARC', level: 1 }, ts: T + 60 })
  ];

  var folded = PR.foldPresence(beats, { now: T + 150, activeMs: 60 });

  // §UNIFIED-ID — alice is ONE identity present in BOTH products.
  var a = folded.byUser['alice'];
  verdict(a && a.products.join(',') === 'bim,erp' && a.perProduct.bim && a.perProduct.erp,
    '§UNIFIED-ID  one identity spans both products', 'alice products=[' + (a && a.products.join(',')) + ']');

  // §COLOUR — colour = signer: alice's colour is the SAME across products + equals dot_layer.colorOf; ≠ bob.
  var aColor = a.color, bColor = folded.byUser['bob'].color;
  verdict(aColor === D.colorOf('alice') && aColor === D.colorOf(a.perProduct.bim.product === 'bim' ? 'alice' : 'alice') && aColor !== bColor,
    '§COLOUR  colour=signer (same person same colour both products)', 'alice=' + aColor + ' bob=' + bColor);

  // §LATEST — alice's unified "now" = BIM@T+100 (max ts); per-product erp@T+50 kept.
  var w = PR.whereIs(folded, 'alice');
  verdict(w.product === 'bim' && w.ts === T + 100 && a.perProduct.erp.ts === T + 50 && /STR · L3/.test(w.locText),
    '§LATEST  unified where-now = max-ts across products', 'alice now=' + w.product + ' @' + (w.ts - T) + ' loc="' + w.locText + '"');

  // §CROSS-READ — THE MOAT: bob (in ERP) reads the BIM peers; carol (in BIM) reads the ERP peer.
  var bobSees = PR.crossProduct(folded, { user: 'bob', product: 'erp' });
  var aliceRow = bobSees.filter(function (p) { return p.user === 'alice'; })[0];
  var carolSees = PR.crossProduct(folded, { user: 'carol', product: 'bim' });
  var bobRow = carolSees.filter(function (p) { return p.user === 'bob'; })[0];
  verdict(aliceRow && aliceRow.crossProduct === true && aliceRow.product === 'bim' && /STR/.test(aliceRow.locText) &&
          bobRow && bobRow.crossProduct === true && bobRow.product === 'erp',
    '§CROSS-READ  ERP↔BIM peers read across products', 'bob sees alice@' + (aliceRow && aliceRow.product) + ' · carol sees bob@' + (bobRow && bobRow.product));

  // §ACTIVE — alice active (now-100=50≤60); carol stale (now-60=90>60) → faded dot.
  var dots = PR.presenceDots(folded);
  var aDot = dots.filter(function (d) { return d.user === 'alice'; })[0];
  var cDot = dots.filter(function (d) { return d.user === 'carol'; })[0];
  verdict(aDot.faded === false && cDot.faded === true && a.active === true && folded.byUser['carol'].active === false,
    '§ACTIVE  presence window: active vs stale (faded)', 'alice.faded=' + aDot.faded + ' carol.faded=' + cDot.faded);

  // §BUS — the SAME heartbeats round-trip the shared BroadcastChannel('bim_teams') → identical fold.
  var received = [];
  C.bus.on('bim_teams', function (m) { if (m && m.kind === 'presence') received.push(m); });
  beats.forEach(function (h) { C.bus.send('bim_teams', h); });
  var busFold = PR.foldPresence(received, { now: T + 150, activeMs: 60 });
  verdict(received.length === 4 && JSON.stringify(busFold.list) === JSON.stringify(folded.list),
    '§BUS  one bus, both products → identical fold', 'delivered=' + received.length + ' identical=' + (JSON.stringify(busFold.list) === JSON.stringify(folded.list)));

  // §DETERMINISM — shuffle arrival → identical fold; unknown product / missing user REFUSED.
  var shuffled = beats.slice().reverse();
  var same = JSON.stringify(PR.foldPresence(shuffled, { now: T + 150, activeMs: 60 }).list) === JSON.stringify(folded.list);
  var rejProduct = false, rejUser = false;
  try { PR.makePresence({ user: 'x', product: 'cad', ts: T }); } catch (e) { rejProduct = true; }
  try { PR.makePresence({ product: 'bim', ts: T }); } catch (e) { rejUser = true; }
  verdict(same && rejProduct && rejUser, '§DETERMINISM  order-invariant + non-invent (bad input refused)',
    'shuffleSame=' + same + ' rejProduct=' + rejProduct + ' rejUser=' + rejUser);

  var n = 7;
  console.log('\n' + (fails === 0 ? '✅ W-XPRESENCE ' + n + '/' + n + ' PASS' : '❌ ' + fails + '/' + n + ' FAIL') + '\n');
  process.exit(fails === 0 ? 0 : 1);
})();
