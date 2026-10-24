#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — Scope: W-FOCUS-BOARD, bim-compiler prompts/TEAMWORK_FRAMEWORK.md §13.12.G.1 G.1.1. READ THE LOG after every run — the exit code is not evidence.
//   team_focus.js on a memPipe with REAL ECDSA devices (no mocks of the crypto). Issues proved or disproved:
//   §FB-ROUNDTRIP  A's published focus is collected by B, verified, with the exact entries
//   §FB-FORGE      "the board trusts any object under f/" is FALSE: a tampered object, an un-enrolled device, a wrong-name object are all rejected (each with its reason)
//   §FB-CAP        at most 5 entries are written; off:true writes NO details
//   §FB-HEADS      heads are collected with their ts, verified the same way
//   §FB-GHPIPE     DEP-GHPIPE-F: a pipe that refuses the f/ class makes publish report 'unsupported' once and stop retrying; the Visit would be unaffected
// Run: node common/tests/witness_focus_board.js 2>&1 | tee /tmp/witness_focus_board.log
'use strict';
if (!globalThis.crypto) globalThis.crypto = require('crypto').webcrypto;
var CS = require('../comm/comm_store.js'), ENV = require('../comm/comm_envelope.js'), PIPE = require('../comm/comm_pipe.js'), TF = require('../comm/team_focus.js');
var fails = 0, judged = 0;
function verdict(ok, label, detail) { judged++; if (!ok) fails++; console.log('   ' + (ok ? '🟢' : '🔴') + ' ' + label + (detail ? ' — ' + detail : '')); }
var SP = 'a'.repeat(64), dec = function (b) { return JSON.parse(new TextDecoder().decode(b)); }, enc = function (o) { return new TextEncoder().encode(JSON.stringify(o)); };
(async function () {
  console.log('═══ W-FOCUS-BOARD — the signed focus board over the pipe verbs (TEAMWORK_FRAMEWORK §13.12.G.1) ═══\n');
  var A = await CS.newDevice(), B = await CS.newDevice(), C = await CS.newDevice(), pipe = PIPE.memPipe('mem'), lines = [];
  var log = function (m) { lines.push(m); };
  var roster = { devices: {} }; roster.devices[A.kid] = { jwk: A.pubJwk }; roster.devices[B.kid] = { jwk: B.pubJwk };
  var fa = TF.create({ pipe: pipe, self: A, space: SP, person: 'pa', log: log }), fb = TF.create({ pipe: pipe, self: B, space: SP, person: 'pb', log: log }), fc = TF.create({ pipe: pipe, self: C, space: SP, person: 'pc', log: log });

  console.log('§FB-ROUNDTRIP');
  var before = await fb.collect(roster);
  verdict(before.focus.length === 0, 'NO-OP guard: before A publishes, B collects nothing', 'focus=' + before.focus.length);
  var E = [{ table: 'c_order', uu: '11111111-1111-4111-8111-111111111111', label: 'Order SO-1', since: 1000 }];
  var r = await fa.publish(E, { since: 1000 });
  var got = await fb.collect(roster);
  verdict(r.ok && got.focus.length === 1 && got.focus[0].kid === A.kid && got.focus[0].focus[0].label === 'Order SO-1' && got.focus[0].person === 'pa' && got.rejected.length === 0, 'A publishes one entry; B collects it verified (kid, person, label intact)', JSON.stringify(got.focus[0] && { kid: got.focus[0].kid.slice(0, 6), n: got.focus[0].focus.length, label: got.focus[0].focus[0].label }));
  verdict(Object.keys(await pipe._names().reduce(function (m, n) { m[n] = 1; return m; }, {})).some(function (n) { return n === 's/' + SP + '/f/' + A.kid; }), 'it lives at s/<space>/f/<kid> — one name per device, overwritten', 's/…/f/' + A.kid.slice(0, 6));
  await fa.publish([], { since: 2000 });
  var got2 = await fb.collect(roster);
  verdict(got2.focus.length === 1 && got2.focus[0].focus.length === 0, 'A publishes an empty set: the SAME name now says nothing is open (overwritten, not appended)', 'objects=' + got2.focus.length + ' entries=' + got2.focus[0].focus.length);

  console.log('\n§FB-FORGE');
  var name = 's/' + SP + '/f/' + A.kid, good = dec(await pipe.get(name)); good.focus = [{ table: 'c_order', uu: '22222222-2222-4222-8222-222222222222', label: 'FORGED', since: 5 }];
  await pipe.put(name, enc(good));
  var f1 = await fb.collect(roster);
  verdict(f1.focus.length === 0 && f1.rejected.length === 1 && f1.rejected[0].why === 'signature', 'a tampered object (label changed after signing) is rejected: signature', JSON.stringify(f1.rejected));
  await fa.publish(E, { since: 1000 });
  await fc.publish(E, { since: 1000 });
  var f2 = await fb.collect(roster);
  verdict(f2.focus.length === 1 && f2.rejected.length === 1 && f2.rejected[0].why === 'not-enrolled', 'CONTROL: A\'s honest object is accepted again; C (valid signature, NOT in the roster) is rejected: not-enrolled', JSON.stringify(f2.rejected));
  var s = await ENV.sign({ v: 1, kind: 'focus', space: SP, kid: B.kid, author: B.kid, person: 'pb', ts: 1, since: null, focus: [], off: false }, B);
  await pipe.put('s/' + SP + '/f/' + A.kid + 'x', enc(s));
  var f3 = await fb.collect(roster);
  verdict(f3.rejected.some(function (x) { return x.why === 'identity-mismatch'; }), 'an object written under another device\'s name is rejected: identity-mismatch', JSON.stringify(f3.rejected.map(function (x) { return x.why; })));

  console.log('\n§FB-CAP');
  var many = []; for (var i = 0; i < 8; i++) many.push({ table: 't', uu: '3333333' + i + '-3333-4333-8333-333333333333', label: 'r' + i, since: i });
  await fa.publish(many, {});
  var cap = (await fb.collect(roster)).focus.filter(function (x) { return x.kid === A.kid; })[0];
  verdict(cap.focus.length === 5, 'eight entries in → five written (the cap)', 'written=' + cap.focus.length);
  await fa.publish(E, { off: true });
  var off = (await fb.collect(roster)).focus.filter(function (x) { return x.kid === A.kid; })[0];
  verdict(off.off === true && off.focus.length === 0 && JSON.stringify(dec(await pipe.get(name))).indexOf('Order SO-1') < 0, 'off:true writes NO details at all (the bytes on the pipe contain no label), only "I am here"', 'off=' + off.off);

  console.log('\n§FB-HEADS');
  var hd = await ENV.sign({ v: 1, space: SP, author: A.kid, seq: 3, hash: null, frontier: {}, ts: 4242 }, A), hc = await ENV.sign({ v: 1, space: SP, author: C.kid, seq: 1, hash: null, frontier: {}, ts: 9999 }, C);
  await pipe.put('s/' + SP + '/h/' + A.kid, enc(hd)); await pipe.put('s/' + SP + '/h/' + C.kid, enc(hc));
  var hh = await fb.collect(roster);
  verdict(hh.heads.length === 1 && hh.heads[0].author === A.kid && hh.heads[0].ts === 4242, 'A\'s head is collected with its ts; C\'s (not enrolled) is not', JSON.stringify(hh.heads.map(function (x) { return x.ts; })));

  console.log('\n§FB-GHPIPE');
  var puts = 0, ghLike = { id: 'gh:fake', put: async function () { puts++; throw new Error('ghPipe: x is not under my prefix (' + A.kid + ')'); }, get: async function () { return null; }, list: async function () { return []; } };
  var fg = TF.create({ pipe: ghLike, self: A, space: SP, person: 'pa', log: log });
  var g1 = await fg.publish(E, {}), g2 = await fg.publish(E, {});
  var unsLines = lines.filter(function (l) { return /unsupported/.test(l); }).length;
  verdict(!g1.ok && g1.reason === 'unsupported' && !g2.ok && puts === 1 && unsLines === 1, 'a pipe that refuses the class: publish reports unsupported, tries the pipe ONCE, logs ONCE (DEP-GHPIPE-F), never throws into the Visit', 'puts=' + puts + ' logLines=' + unsLines);
  var ghReal = PIPE.ghPipe({ owner: 'x', repo: 'y', token: 't', self: A.kid, fetch: async function () { throw new Error('network must not be reached'); } }), fr = TF.create({ pipe: ghReal, self: A, space: SP, person: 'pa', log: log });
  var gr = await fr.publish(E, {});
  verdict(!gr.ok && gr.reason === 'unsupported', 'the REAL ghPipe (unmodified comm_pipe.js) refuses the f/ name before any network call → unsupported', gr.reason);

  console.log('\n──────────────────────────────────────────────');
  console.log('§W-FOCUS-BOARD ' + (fails || !judged ? (judged ? 'FAIL' : 'INCONCLUSIVE') : 'PASS') + ' judged=' + judged + ' fails=' + fails);
  process.exit(fails || !judged ? 1 : 0);
})().catch(function (e) { console.log('🔴 CRASH ' + (e && e.stack || e)); process.exit(2); });
