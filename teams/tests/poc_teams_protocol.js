#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-PROTO (prompts/RESUME_DISTRIBUTED_BRANCHES.md §3/§7/§12). The 3 OPEN design
//   items are deterministic & NON-INVENT: a content-addressed seam, a minimal Tier-1 heartbeat, and
//   an op-message default that never fabricates prose. node-only over teams/ via the stub seam.
//     §CAS-SAME      — same datum on two nodes → SAME casKey (content-addressed, not id-addressed).
//     §CAS-TAMPER    — a tampered datum → DIFFERENT key (tamper-evident seam).
//     §CAS-DEDUP     — casPut of an identical datum adds NO duplicate; input store untouched.
//     §CAS-ROUNDTRIP — casGet(store, casPut key) returns the stored datum; miss → undefined.
//     §HB-MINIMAL    — heartbeat is fixed-schema, carries the TIP HASH not the ops, pure over inputs.
//     §HB-LATEST     — summarize picks the latest-by-ts heartbeat per branch.
//     §MSG-AUTHOR    — withMessage uses the author message verbatim when present.
//     §MSG-DEFAULT   — absent message → deterministic describe(op) (same input → same output).
//     §MSG-NONINVENT — withMessage never fabricates: default == the projection, input op untouched.
//   Fixed timestamps/ids only (NO Date.now / NO Math.random). Read the log after every run.
//   Run: node teams/tests/poc_teams_protocol.js 2>&1 | tee teams/logs/protocol.log
'use strict';
var path = require('path');
var P = require(path.join(__dirname, '..', 'protocol.js'));
var L = require(path.join(__dirname, '..', 'chatlog.js'));   // consume describe — do NOT fork it
var fails = 0, n = 0;
function verdict(ok, label, detail) { n++; if (!ok) fails++; console.log('   ' + (ok ? '🟢' : '🔴') + ' ' + label + (detail ? ' — ' + detail : '')); }
var T = 1719700000000;
function op(id, ts, br, au, cls, verb, tgt, p) { return { id: id, ts: ts, branch: br, author: au, cls: cls, verb: verb, target: tgt, params: p || {} }; }

(function () {
  console.log('\n═══ W-PROTO — seam CAS · Tier-1 heartbeat · op-message default (§3/§7/§12) ═══\n');

  // ── W-PROTO-CAS — content-addressed shared datum (the seam) ──────────────────
  // A shared datum_plane (zone-split seam). key-order differs between the two "nodes" → the stable
  // serializer must normalize it so content addressing holds.
  var datumA = { type: 'datum_plane', axis: 'Z', value: 3.1, guid: 'DP-2', anchors: ['Col-201', 'Col-204'] };
  var datumB = { value: 3.1, anchors: ['Col-201', 'Col-204'], guid: 'DP-2', axis: 'Z', type: 'datum_plane' }; // same content, shuffled keys
  var kA = P.casKey(datumA), kB = P.casKey(datumB);
  verdict(kA === kB, '§CAS-SAME  same datum on two nodes → same key (content-addressed)', kA.slice(0, 12) + '…');

  var tampered = { type: 'datum_plane', axis: 'Z', value: 3.2, guid: 'DP-2', anchors: ['Col-201', 'Col-204'] }; // 3.1→3.2
  verdict(P.casKey(tampered) !== kA, '§CAS-TAMPER  tampered datum → different key (tamper-evident)');

  var store0 = {};
  var r1 = P.casPut(store0, datumA);
  var r2 = P.casPut(r1.store, datumB);                 // identical content → identical key → dedup
  verdict(r1.key === r2.key, '§CAS-DEDUP  identical datum → same key');
  verdict(Object.keys(r2.store).length === 1, '§CAS-DEDUP  no duplicate entry added', Object.keys(r2.store).length + ' entry');
  verdict(Object.keys(store0).length === 0, '§CAS-DEDUP  input store NOT mutated (immutable add)');

  var got = P.casGet(r2.store, r1.key);
  verdict(got === datumA, '§CAS-ROUNDTRIP  casGet returns the stored datum');
  verdict(P.casGet(r2.store, 'nope') === undefined, '§CAS-ROUNDTRIP  miss → undefined');

  // ── W-PROTO-HEARTBEAT — Tier-1 awareness payload ─────────────────────────────
  var tip = 'a1b2c3';
  var hb1 = P.makeHeartbeat({ branch: 'MEP', author: 'MEP', tipHash: tip, scope: { type: 'zone', value: 'East' }, ts: T + 10 });
  var hb1b = P.makeHeartbeat({ branch: 'MEP', author: 'MEP', tipHash: tip, scope: { type: 'zone', value: 'East' }, ts: T + 10 });
  var keys = Object.keys(hb1).sort().join(',');
  verdict(keys === 'author,branch,kind,scope,tip,ts', '§HB-MINIMAL  fixed schema, minimal keys', keys);
  verdict(hb1.kind === 'heartbeat' && hb1.tip === tip, '§HB-MINIMAL  carries the TIP HASH (awareness), not ops');
  verdict(JSON.stringify(hb1) === JSON.stringify(hb1b), '§HB-MINIMAL  pure over inputs (no Date.now/random)');

  var hbList = [
    P.makeHeartbeat({ branch: 'MEP', author: 'MEP', tipHash: 'mep-old', scope: {}, ts: T + 5 }),
    P.makeHeartbeat({ branch: 'STR', author: 'STR', tipHash: 'str-1',  scope: {}, ts: T + 7 }),
    P.makeHeartbeat({ branch: 'MEP', author: 'MEP', tipHash: 'mep-new', scope: {}, ts: T + 9 })  // newer MEP
  ];
  var pres = P.summarizeHeartbeats(hbList);
  verdict(Object.keys(pres).length === 2, '§HB-LATEST  one entry per branch', Object.keys(pres).sort().join(','));
  verdict(pres.MEP.tip === 'mep-new' && pres.MEP.ts === T + 9, '§HB-LATEST  picks latest-by-ts per branch', 'MEP tip=' + pres.MEP.tip);

  // ── W-PROTO-MESSAGE — op-message default policy ──────────────────────────────
  // authored op (carries params.message) — used verbatim
  var authored = op('s3', T + 60, 'STR', 'STR', 'geom', 'SIZE', 'Col-204', { w: 0.55, cost: 1400, message: 'Upsized W12→W14 for level-2 load' });
  var wm = P.withMessage(authored, L.describe);
  verdict(wm.params.message === 'Upsized W12→W14 for level-2 load', '§MSG-AUTHOR  author message used verbatim');

  // bare op (no message) — deterministic projection via the SHARED describe (not forked)
  var bare = op('m1', T + 30, 'MEP', 'MEP', 'geom', 'INSERT', 'Duct-7', { box: { x: 1, y: 5, z: 2.4, w: 8, d: .5, h: .5 }, disc: 'MEP' });
  var d1 = P.withMessage(bare, L.describe);
  var d2 = P.withMessage(bare, L.describe);
  verdict(d1.params.message === L.describe(bare), '§MSG-DEFAULT  absent message → deterministic describe(op)', d1.params.message);
  verdict(d1.params.message === d2.params.message, '§MSG-DEFAULT  same input → same output (pure)');

  // §MSG-NONINVENT — the default is EXACTLY the projection (no fabricated prose) + input untouched
  verdict(d1.params.message === 'Duct-7 placed (MEP)', '§MSG-NONINVENT  default == projection, nothing invented');
  verdict(bare.params.message === undefined, '§MSG-NONINVENT  stored op keeps message optional (input untouched)');

  console.log('\n' + (fails === 0 ? '✅ W-PROTO ' + n + '/' + n + ' PASS' : '❌ ' + fails + '/' + n + ' FAIL') + '\n');
  process.exit(fails === 0 ? 0 : 1);
})();
