#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — Scope: W-AVATAR-TRAVEL, bim-compiler prompts/TEAMWORK_FRAMEWORK.md §15.15.2/§15.15.3. READ THE LOG after every run — the exit code is not evidence.
//   team_focus.js (REAL ECDSA devices, memPipe) + team_people.js rank + team_avatars.js. Issues proved or disproved:
//   §AT-ROUNDTRIP the avatar id A publishes is collected by B (verified) and lands on A's row in rank()
//   §AT-OFF       "Don't show what I'm on" still carries the avatar while the focus stays empty (an avatar is not what I'm on)
//   §AT-FORGE     a tampered avatar id (changed after signing) is rejected like any other tampered object; an invalid id never reaches a row as a drawn avatar
//   §AT-NONE      a person who never chose has avatar null on the row, and the renderer's default (pure of person_uu) is what is drawn — same on both devices
//   §AT-FRESH     the freshest verified id of a person's devices wins (two devices, the later Visit decides)
// Run: node common/tests/witness_avatar_travel.js 2>&1 | tee /tmp/witness_avatar_travel.log
'use strict';
if (!globalThis.crypto) globalThis.crypto = require('crypto').webcrypto;
var CS = require('../comm/comm_store.js'), ENV = require('../comm/comm_envelope.js'), PIPE = require('../comm/comm_pipe.js'), TF = require('../comm/team_focus.js'), TP = require('../comm/team_people.js'), AV = require('../comm/team_avatars.js');
var fails = 0, judged = 0, inconclusive = [];
function verdict(ok, label, detail) { judged++; if (!ok) fails++; console.log('   ' + (ok ? '🟢' : '🔴') + ' ' + label + (detail ? ' — ' + detail : '')); }
var SP = 'b'.repeat(64), dec = function (b) { return JSON.parse(new TextDecoder().decode(b)); }, enc = function (o) { return new TextEncoder().encode(JSON.stringify(o)); };
(async function () {
  console.log('═══ W-AVATAR-TRAVEL — the avatar id on the signed focus board (TEAMWORK_FRAMEWORK §15.15.2) ═══\n');
  var A = await CS.newDevice(), A2 = await CS.newDevice(), B = await CS.newDevice(), pipe = PIPE.memPipe('mem'), log = function () {};
  var roster = { devices: {} }; [A, A2, B].forEach(function (d) { roster.devices[d.kid] = { jwk: d.pubJwk }; });
  var DIR = [{ person: 'pa', name: 'Aisha', role: 1, roleName: 'x', kids: [A.kid, A2.kid] }, { person: 'pb', name: 'Bilal', role: 1, roleName: 'x', kids: [B.kid] }];
  var fa = TF.create({ pipe: pipe, self: A, space: SP, person: 'pa', log: log }), fa2 = TF.create({ pipe: pipe, self: A2, space: SP, person: 'pa', log: log, now: function () { return Date.now() + 5000; } }), fb = TF.create({ pipe: pipe, self: B, space: SP, person: 'pb', log: log });
  var NOW = Date.now() + 10000, rowOf = function (col, p) { return TP.rank([], [], col.focus, NOW, { directory: DIR }).filter(function (x) { return x.person === p; })[0]; };
  console.log('§AT-ROUNDTRIP');
  var pre = rowOf(await fb.collect(roster), 'pa');
  verdict(pre.avatar === null, 'NO-OP guard: before A publishes, A\'s row has avatar null', 'avatar=' + pre.avatar);
  var E = [{ table: 'bim_element', uu: '11111111-1111-4111-8111-111111111111', label: 'extrude 11111111', since: Date.now() }];
  await fa.publish(E, { since: E[0].since, avatar: 'a07' });
  var col = await fb.collect(roster), ra = rowOf(col, 'pa');
  verdict(col.rejected.length === 0 && col.focus[0].avatar === 'a07' && ra.avatar === 'a07' && ra.focus.length === 1, 'A publishes avatar a07 with one focus entry: B collects it verified and A\'s row carries a07', 'avatar=' + ra.avatar + ' focus=' + ra.focus.length);
  verdict(AV.resolve(ra.avatar, 'pa') === 'a07' && AV.svg(AV.resolve(ra.avatar, 'pa'), 40).indexOf('data-avatar="a07"') > 0, 'the renderer draws a07 for that row', '');
  console.log('\n§AT-OFF');
  await fa.publish(E, { off: true, avatar: 'a07' });
  var off = rowOf(await fb.collect(roster), 'pa'), bytes = JSON.stringify(dec(await pipe.get('s/' + SP + '/f/' + A.kid)));
  verdict(off.off === true && off.focus.length === 0 && off.avatar === 'a07' && bytes.indexOf('extrude') < 0, 'off:true -> focus stays empty and the bytes carry no label, yet the avatar a07 still arrives', 'off=' + off.off + ' avatar=' + off.avatar);
  console.log('\n§AT-FORGE');
  var name = 's/' + SP + '/f/' + A.kid, good = dec(await pipe.get(name)); good.avatar = 'a13'; await pipe.put(name, enc(good));
  var f1 = await fb.collect(roster);
  verdict(f1.focus.length === 0 && f1.rejected.length === 1 && f1.rejected[0].why === 'signature' && rowOf(f1, 'pa').avatar === null, 'an avatar id changed AFTER signing is rejected (signature) and never reaches the row', JSON.stringify(f1.rejected));
  await fa.publish(E, { avatar: '<script>x</script>' });
  var f2 = await fb.collect(roster), r2 = rowOf(f2, 'pa');
  verdict(f2.focus[0].avatar === undefined && r2.avatar === null, 'publish refuses an id that is not 1-8 lowercase letters/digits: the object carries no avatar field', 'field=' + f2.focus[0].avatar);
  await fa.publish(E, { avatar: 'zz99' });
  var f3 = await fb.collect(roster), r3 = rowOf(f3, 'pa');
  verdict(r3.avatar === 'zz99' && !AV.valid(r3.avatar) && AV.resolve(r3.avatar, 'pa') === AV.defaultFor('pa'), 'a well-shaped but UNKNOWN id travels as text but is never drawn: the renderer resolves it to the person\'s default', 'row=' + r3.avatar + ' drawn=' + AV.resolve(r3.avatar, 'pa'));
  console.log('\n§AT-NONE');
  await fa.publish(E, {});
  var r4 = rowOf(await fb.collect(roster), 'pa'), d1 = AV.resolve(r4.avatar, 'pa');
  verdict(r4.avatar === null && AV.valid(d1) && d1 === AV.defaultFor('pa'), 'no choice -> row avatar null; both devices draw the same deterministic default', 'drawn=' + d1);
  console.log('\n§AT-FRESH');
  await fa.publish(E, { avatar: 'a03' }); await fa2.publish(E, { avatar: 'a05' });
  var r5 = rowOf(await fb.collect(roster), 'pa');
  verdict(r5.avatar === 'a05', 'two devices of one person: the freshest verified object (A2, later clock) decides -> a05 (not A\'s a03)', 'row=' + r5.avatar);
  console.log('\n' + (fails ? '🔴' : inconclusive.length ? '⚪' : '🟢') + ' §W-AVATAR-TRAVEL ' + (fails ? 'FAIL' : inconclusive.length ? 'PASS-WITH-INCONCLUSIVE(' + inconclusive.length + ')' : 'PASS') + ' judged=' + judged + ' fails=' + fails + ' inconclusive=' + inconclusive.length);
  process.exit(fails ? 1 : 0);
})().catch(function (e) { console.log('🔴 CRASH ' + (e && e.stack || e)); process.exit(1); });
