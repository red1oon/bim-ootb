#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — Scope: W-UPDATE-LIST, bim-compiler prompts/TEAMWORK_FRAMEWORK.md §46.3/§46.4 as corrected by §46.5 F7 F8 F9 F12 (Stage 3, STAGE3_SPEC). READ THE LOG after every run: verdict = §UL_VERDICT.
//   THE ISSUES it proves/disproves: the update list must bind content (a hash/size per release), travel as its OWN signed object in the relay's `pub/` area (not folded into the log, so release #17 does not hit the
//   POLICY cap), tell people what is new / withdrawn with a reason and a changelog, and judge freshness WITHOUT the device clock (a 2040 clock expires nothing). It warns; it never applies anything and never stops business.
//   Node-only: bim-ootb's own common/comm (CommPipe.memPipe, TeamKeys, TeamUpdates); KW_ROOT=<tree> serves a mutant. Signing is done HERE with WebCrypto, independent of the code under test.
//   U1 carrier · U2 shown, never applied, withdrawn never blocks business · U3 binding / ordering / base / the cap (release #17) · U4 freshness, replay, fork, signers · U5 changelog · U6 size caps · MUTANTS.
// Run: node erp/tests/witness_team_updates.js 2>&1 | tee build/scriptor/versioning_s2_s4/witness_team_updates.log
'use strict';
if (typeof globalThis.crypto === 'undefined' || !globalThis.crypto.subtle) globalThis.crypto = require('crypto').webcrypto;
var path = require('path'), fs = require('fs'), os = require('os'), cp = require('child_process'), nodeCrypto = require('crypto');
var ROOT = process.env.KW_ROOT || path.join(__dirname, '..', '..'), QUIET = !!process.env.UL_ONLY_ARMS, COMM = path.join(ROOT, 'common', 'comm');
var subtle = nodeCrypto.webcrypto.subtle, judged = 0, ARMS = {}, say = function (s) { if (!QUIET) console.log(s); };
function A(arm, okk, label, detail) { judged++; ARMS[arm] = ARMS[arm] || 0; if (!okk) ARMS[arm]++; say('   ' + (okk ? '🟢' : '🔴') + ' ' + arm + ' ' + label + (detail ? ' — ' + detail : '')); return okk; }
function canon(o) { if (o === null || typeof o !== 'object') return JSON.stringify(o); if (Array.isArray(o)) return '[' + o.map(canon).join(',') + ']'; return '{' + Object.keys(o).sort().map(function (k) { return JSON.stringify(k) + ':' + canon(o[k]); }).join(',') + '}'; }
var hex = function (b) { return Buffer.from(b).toString('hex'); }, sha = function (b) { return nodeCrypto.createHash('sha256').update(b).digest('hex'); };
async function mkKey(role) { var kp = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']), j = await subtle.exportKey('jwk', kp.publicKey), pub = { kty: j.kty, crv: j.crv, x: j.x, y: j.y }; var en = Object.assign({}, pub); if (role) en.role = role; return { priv: kp.privateKey, pub: pub, entry: en }; }
function bodyOf(st) { var b = JSON.parse(JSON.stringify(st)); delete b.sig; delete b.signer; delete b.cosigs; return b; }
async function sigOf(body, key) { return hex(await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key.priv, new TextEncoder().encode(canon(body)))); }
async function signL(st, keys) { var b = bodyOf(st), out = Object.assign({}, b, { signer: keys[0].pub, sig: await sigOf(b, keys[0]) }); if (keys.length > 1) { out.cosigs = []; for (var i = 1; i < keys.length; i++) out.cosigs.push({ signer: keys[i].pub, sig: await sigOf(b, keys[i]) }); } return out; }
var listOf = function (ks) { return ks.map(function (k) { return k.entry; }); };

(async function () {
  ['CommEnvelope', 'CommPipe', 'TeamKeys', 'TeamUpdates', 'VersionRange'].forEach(function (n) { delete globalThis[n]; });
  var PIPE = require(path.join(COMM, 'comm_pipe.js')), TK = require(path.join(COMM, 'team_keys.js')), TU = null, loadErr = null;
  try { TU = require(path.join(COMM, 'team_updates.js')); } catch (e) { loadErr = e; }
  say('═══ W-UPDATE-LIST — the signed update list in the relay\'s pub/ area (STAGE3_SPEC; review F7 F8 F9 F12) ═══   root=' + ROOT + ' team_updates=' + (TU ? 'loaded' : 'ABSENT ' + (loadErr && loadErr.message)) + '\n');
  if (!TU) { A('U0', false, 'team_updates.js loads', String(loadErr && loadErr.message)); console.log('§UL_VERDICT FAIL judged=' + judged + ' (module absent)'); process.exit(1); }
  var DAY = 86400000, T0 = Date.UTC(2026, 9, 31), SPACE = sha('space-x'), KID = sha('dev').slice(0, 16), BASE = sha('base-1');
  var Ko = await mkKey(), Kr = await mkKey('rotate-only'), Kp = await mkKey('publish'), Kn = await mkKey(), K2 = await mkKey();
  var REL = {};         // id@ver -> bytes
  function rel(id, ver) { var k = id + '@' + ver; if (!REL[k]) REL[k] = new TextEncoder().encode('release bytes of ' + k + '\n'); return REL[k]; }
  function entry(id, cur, over) { var b = rel(id, cur); return Object.assign({ id: id, kind: 'plugin', current: cur, minimum: '1.0.0', status: 'update-available', hash: sha(b), size: b.length, carrier: 'pub', apply: 'none',
    changelog: { Added: [{ what: 'a thing in ' + id + ' ' + cur, why: 'the team asked for it' }] } }, over || {}); }
  function body(n, entries, over) { return Object.assign({ kind: 'update-list', space: SPACE, number: n, prev: null, signed_at: T0 + n * DAY, expires: T0 + n * DAY + 30 * DAY, caps: { list_entries: 64, list_bytes: 65536, release_bytes: 2097152, policy_upcaster_sets: 16 }, entries: entries }, over || {}); }
  function mkctx(over) { return Object.assign({ space: SPACE, trust: { keys: listOf([Ko, Kr]), threshold: 1 }, anchor: T0, state: { last: null }, installed: {}, base: { sha256: BASE }, policySets: 0, log: function () {} }, over || {}); }
  var logs = []; var lg = function (l) { logs.push(l); };

  // ── U1 carrier ──
  say('── U1: the list is its own signed object in pub/, not in the log (F9) ──');
  var pipe = PIPE.memPipe('relay'), ctx = mkctx({ log: lg });
  var L1 = await signL(body(1, [entry('kw.alpha', '1.1.0'), entry('kw.beta', '2.0.0')]), [Ko]);
  var p1 = await TU.publish(pipe, SPACE, KID, L1, ctx);
  A('U1', p1.ok && p1.name === 's/' + SPACE + '/pub/' + KID + '/update-list-00000001.json', 'a signed list is published under s/<space>/pub/<kid>/update-list-<n>.json', p1.name || p1.reason);
  var c2 = mkctx(), best = await TU.pickBest(pipe, c2);
  A('U1', best.list && best.list.number === 1 && best.rejected.length === 0, 'a device lists pub/, takes the highest valid list and verifies it', 'number=' + (best.list && best.list.number));
  var other = await signL(body(2, [entry('kw.alpha', '1.2.0')], { space: sha('other-space') }), [Ko]);
  await pipe.put('s/' + SPACE + '/pub/' + KID + '/update-list-00000002.json', new TextEncoder().encode(JSON.stringify(other)));
  var best2 = await TU.pickBest(pipe, mkctx());
  A('U1', best2.list && best2.list.number === 1 && best2.rejected.some(function (r) { return r.reason === 'list-wrong-space'; }), 'CONTROL: a list for another space is rejected (list-wrong-space) and the valid #1 is still found', JSON.stringify(best2.rejected));
  var G = PIPE.gatedPipe(PIPE.memPipe('g'), { token: 't1', max_object_bytes: 100000, max_puts_per_hour: 100 }), W = G.writer('t1');
  var gOk = await W.put('s/' + SPACE + '/pub/' + KID + '/update-list-00000001.json', new Uint8Array([1])), gBad = await W.put('s/' + SPACE + '/pubx/' + KID + '/update-list-00000001.json', new Uint8Array([1]));
  A('U1', gOk !== false && gBad === false && G.refusals.length === 1 && G.refusals[0].reason === 'bad-name', 'the write gate attributes a pub/ object to its writer kid (accepted); a name outside the contract is refused bad-name', JSON.stringify(G.refusals.map(function (r) { return r.reason; })));

  // ── U2 shown, never applied; withdrawn never blocks business ──
  say('\n── U2: shown to everyone, applied by no one; a withdrawal warns and never blocks business ──');
  var puts0 = pipe.stats.put, installed = { 'kw.alpha': '1.0.0', 'kw.beta': '2.0.0', 'kw.gamma': '1.0.0', 'kw.delta': '1.0.0' }, snap = JSON.stringify(installed);
  var L2 = await signL(body(2, [entry('kw.alpha', '1.1.0'), entry('kw.beta', '2.0.0', { status: 'current' }),
    entry('kw.gamma', '1.5.0', { status: 'withdrawn', reason: 'wrong totals on credit notes', changelog: undefined }), entry('kw.delta', '1.2.0', { requires: { 'kw.gamma': '>=1.5.0' } })], { prev: await TU.bodyHash(L1) }), [Ko]);
  L2 = JSON.parse(JSON.stringify(L2));
  var cx = mkctx({ state: { last: { number: 1, hash: await TU.bodyHash(L1) } }, installed: installed, release: async function (e) { return rel(e.id, e.current); }, prev: L1, log: lg });
  var v2 = await TU.verify(L2, cx), rows = await TU.classify(L2, cx), by = {}; rows.forEach(function (r) { by[r.id] = r; });
  A('U2', v2.ok && by['kw.alpha'].state === 'update-available' && by['kw.beta'].state === 'current', 'an update is flagged update-available; an installed-current module is current', rows.map(function (r) { return r.id + ':' + r.state; }).join(' '));
  A('U2', JSON.stringify(installed) === snap && pipe.stats.put === puts0 && JSON.stringify(cx.installed) === snap, 'NOTHING is applied by itself: the installed set and the relay are untouched after verify+classify', 'puts ' + puts0 + '->' + pipe.stats.put);
  A('U2', by['kw.gamma'].state === 'withdrawn' && by['kw.gamma'].yanked === true && by['kw.gamma'].reason === 'wrong totals on credit notes', 'a withdrawn release shows [YANKED] with its reason', by['kw.gamma'].state + ' / ' + by['kw.gamma'].reason);
  A('U2', TU.businessAllowed(by['kw.gamma']) === true && TU.publishAllowed(by['kw.gamma']) === false && TU.publishAllowed(by['kw.alpha']) === true, 'business is NEVER blocked by a flag; only PUBLISHING is held back for the withdrawn module', 'business=' + TU.businessAllowed(by['kw.gamma']) + ' publish(gamma)=' + TU.publishAllowed(by['kw.gamma']) + ' publish(alpha)=' + TU.publishAllowed(by['kw.alpha']));
  A('U2', by['kw.delta'].warn.indexOf('depends-on-withdrawn:kw.gamma') >= 0, 'a module that requires the withdrawn one gets a warning (the list only warns)', by['kw.delta'].warn.join(','));
  A('U2', logs.some(function (l) { return /§UPD_ENTRY id=kw.gamma state=withdrawn \[YANKED\]/.test(l); }), 'the §UPD_ENTRY log line says it', logs.filter(function (l) { return /kw.gamma/.test(l); })[0] || 'none');

  // ── U3 binding, ordering, base, the cap ──
  say('\n── U3: content binding (F8), arrival order, base-changing packages, release #17 (F9) ──');
  var P3 = PIPE.memPipe('p3'), c3 = mkctx({ log: lg }), E3 = entry('kw.alpha', '1.1.0'), L3 = await signL(body(1, [E3, entry('kw.beta', '2.0.0')]), [Ko]);
  c3.release = function (e) { return TU.getRelease(P3, SPACE, e); };
  await TU.publish(P3, SPACE, KID, L3, c3);
  var r3a = await TU.classify(L3, c3);
  A('U3', r3a.every(function (r) { return r.state === 'not-downloaded'; }), 'a list that arrives BEFORE its release: "update available, not yet downloaded" - never adopted', r3a.map(function (r) { return r.state; }).join(','));
  await TU.putRelease(P3, SPACE, KID, rel('kw.alpha', '1.1.0')); await TU.putRelease(P3, SPACE, KID, rel('kw.beta', '2.0.0'));
  var r3b = await TU.classify(L3, c3);
  A('U3', r3b.every(function (r) { return r.state === 'update-available'; }), 'the release lands and matches: update-available', r3b.map(function (r) { return r.state; }).join(','));
  var P3b = PIPE.memPipe('p3b'), c3b = mkctx({ log: lg }); c3b.release = function (e) { return TU.getRelease(P3b, SPACE, e); };
  await P3b.put(TU.releaseName(SPACE, KID, E3.hash), new TextEncoder().encode('TAMPERED bytes served under the right name'));
  await TU.putRelease(P3b, SPACE, KID, rel('kw.beta', '2.0.0'));
  var r3c = await TU.classify(L3, c3b), m3 = {}; r3c.forEach(function (r) { m3[r.id] = r; });
  A('U3', m3['kw.alpha'].state === 'hash-mismatch' && m3['kw.beta'].state === 'update-available', 'an entry whose hash does not match its release is hash-mismatch (not offered); the other entry is unaffected', r3c.map(function (r) { return r.id + ':' + r.state; }).join(' '));
  var L3s = await signL(body(1, [entry('kw.alpha', '1.1.0', { size: E3.size + 1 })]), [Ko]), r3d = await TU.classify(L3s, c3);
  A('U3', r3d[0].state === 'hash-mismatch', 'a wrong SIZE is a mismatch too', r3d[0].state);
  var Eb = entry('kw.base', '3.0.0', { kind: 'release', base: { sha256: sha('base-2') } }), Lb = await signL(body(1, [Eb]), [Ko]);
  var rb = await TU.classify(Lb, mkctx({ release: async function () { return rel('kw.base', '3.0.0'); } })), pb = await TU.publish(PIPE.memPipe('x'), SPACE, KID, Lb, mkctx());
  A('U3', rb[0].state === 'refused-base-change', 'a RECEIVER refuses a base-changing package', rb[0].state + ' / ' + rb[0].reason);
  A('U3', !pb.ok && /refused-base-change/.test(pb.reason), 'the publisher refuses to list it too (D7 is enforced at both ends)', pb.reason);
  var ctrlBase = await TU.classify(await signL(body(1, [entry('kw.same', '1.1.0', { kind: 'release', base: { sha256: BASE } })]), [Ko]), mkctx({ release: async function () { return rel('kw.same', '1.1.0'); } }));
  A('U3', ctrlBase[0].state === 'update-available', 'CONTROL: the same package with the space\'s own base is accepted', ctrlBase[0].state);
  var es = [], inst17 = {}; for (var i = 1; i <= 17; i++) { es.push(entry('kw.rel' + i, '1.' + i + '.0', { apply: 'policy', kind: 'release' })); if (i <= 16) inst17['kw.rel' + i] = '1.' + i + '.0'; }
  var L17 = await signL(body(1, es), [Ko]), P17 = PIPE.memPipe('p17'), c17 = mkctx({ installed: inst17, policySets: 16, release: async function (e) { return rel(e.id, e.current); } });
  var p17 = await TU.publish(P17, SPACE, KID, L17, c17), best17 = await TU.pickBest(P17, mkctx()), r17 = await TU.classify(L17, c17), s17 = {}; r17.forEach(function (r) { s17[r.id] = r.state; });
  A('U3', p17.ok && best17.list && best17.list.entries.length === 17, 'release #17: the list carries 17 releases (it is not POLICY, so the 16-set cap does not stop it)', 'entries=' + (best17.list && best17.list.entries.length));
  A('U3', s17['kw.rel17'] === 'apply-blocked-cap' && s17['kw.rel16'] === 'current', 'with 16 sets already in the POLICY the 17th is shown apply-blocked-cap ("compact before applying"), not hidden', 'rel16=' + s17['kw.rel16'] + ' rel17=' + s17['kw.rel17']);
  var r17c = await TU.classify(L17, Object.assign({}, c17, { policySets: 15 }));
  A('U3', r17c[16].state === 'update-available', 'CONTROL: with 15 sets in the POLICY the same 17th is update-available', r17c[16].state);

  // ── U4 freshness, replay, fork, signers ──
  say('\n── U4: freshness without the device clock; replay, fork, signers ──');
  var L4 = await signL(body(3, [entry('kw.alpha', '1.1.0')]), [Ko]), realNow = Date.now, vFar, vAnch;
  Date.now = function () { return Date.UTC(2040, 0, 1); };
  try { vFar = await TU.verify(L4, mkctx({ anchor: T0 })); } finally { Date.now = realNow; }
  A('U4', vFar.ok && vFar.outOfDate === false, 'a device clock at 2040 does NOT mark the list out of date (the clock is never read)', 'outOfDate=' + vFar.outOfDate);
  vAnch = await TU.verify(L4, mkctx({ anchor: L4.expires + DAY }));
  A('U4', vAnch.ok && vAnch.outOfDate === true, 'CONTROL: an admin-signed anchor past `expires` DOES mark it out of date (advisory; the list is still shown)', 'outOfDate=' + vAnch.outOfDate);
  var vSkew = await TU.verify(await signL(body(3, [entry('kw.alpha', '1.1.0')], { signed_at: T0 + 400 * DAY, expires: T0 + 430 * DAY }), [Ko]), mkctx({ anchor: T0 }));
  A('U4', !vSkew.ok && vSkew.reason === 'list-skew', 'a signed_at that jumps past the anchor skew bound is refused (a typo cannot expire everything)', vSkew.reason);
  var H2 = await TU.bodyHash(L2), vRep = await TU.verify(L1, mkctx({ state: { last: { number: 2, hash: H2 } } }));
  A('U4', !vRep.ok && vRep.reason === 'list-replayed', 'a replayed OLDER list is refused (monotonic number)', vRep.reason);
  var L2b = await signL(body(2, [entry('kw.alpha', '1.9.0')], { prev: await TU.bodyHash(L1) }), [Ko]), vFork = await TU.verify(L2b, mkctx({ state: { last: { number: 2, hash: H2 } } }));
  A('U4', !vFork.ok && vFork.reason === 'list-fork', 'the same number with DIFFERENT content is a fork, not adopted', vFork.reason);
  var L3w = await signL(body(3, [entry('kw.alpha', '1.1.0')], { prev: sha('not-the-previous') }), [Ko]), vFork2 = await TU.verify(L3w, mkctx({ state: { last: { number: 2, hash: H2 } } }));
  A('U4', !vFork2.ok && vFork2.reason === 'list-fork', 'a list whose `prev` does not match the list this device holds is a fork', vFork2.reason);
  var vOk2 = await TU.verify(L2, mkctx({ state: { last: { number: 2, hash: H2 } } }));
  A('U4', vOk2.ok, 'CONTROL: the very same list again is idempotent (accepted)', String(vOk2.reason));
  var Lold = await signL(body(1, [entry('kw.alpha', '1.1.0')]), [Kn]);
  var vRet = await TU.verify(Lold, mkctx({ trust: { keys: listOf([Ko, Kr]), threshold: 1 } })), vRol = await TU.verify(await signL(body(1, [entry('kw.alpha', '1.1.0')]), [Kr]), mkctx()), vPub = await TU.verify(await signL(body(1, [entry('kw.alpha', '1.1.0')]), [Kp]), mkctx({ trust: { keys: listOf([Ko, Kp]), threshold: 1 } }));
  A('U4', !vRet.ok && vRet.reason === 'list-signer', 'a list signed by a key no longer in the trust list (retired / outsider) is refused', vRet.reason);
  A('U4', !vRol.ok && vRol.reason === 'list-role', 'a rotate-only key cannot sign a list', vRol.reason);
  A('U4', vPub.ok, 'CONTROL: a publish-only key can', String(vPub.reason));
  var T2 = { keys: listOf([Ko, K2]), threshold: 2 }, vT1 = await TU.verify(await signL(body(1, [entry('kw.alpha', '1.1.0')]), [Ko]), mkctx({ trust: T2 })), vT2 = await TU.verify(await signL(body(1, [entry('kw.alpha', '1.1.0')]), [Ko, K2]), mkctx({ trust: T2 }));
  A('U4', !vT1.ok && vT1.reason === 'list-threshold' && vT2.ok, 'T=2: one signature refused (list-threshold); control: two distinct signatures accepted', vT1.reason + ' / ' + String(vT2.reason));
  var Lt = JSON.parse(JSON.stringify(L1)); Lt.entries[0].current = '9.9.9'; var vTa = await TU.verify(Lt, mkctx());
  A('U4', !vTa.ok && vTa.reason === 'list-signature', 'a list edited after signing is refused', vTa.reason);

  // ── U5 changelog ──
  say('\n── U5: every release says WHAT and WHY; Removed / breaking needs a major (F12) ──');
  async function pubOne(en, prevL) { return TU.publish(PIPE.memPipe('c'), SPACE, KID, await signL(body(2, [en], { prev: prevL ? await TU.bodyHash(prevL) : null }), [Ko]), mkctx({ prev: prevL || null, state: { last: prevL ? { number: 1, hash: await TU.bodyHash(prevL) } : null } })); }
  var Lp = await signL(body(1, [entry('kw.alpha', '1.0.0')]), [Ko]);
  var u5a = await pubOne(entry('kw.alpha', '1.1.0', { changelog: {} }), Lp), u5b = await pubOne(entry('kw.alpha', '1.1.0', { changelog: { Fixed: [{ what: 'a bug' }] } }), Lp);
  A('U5', !u5a.ok && /changelog-empty/.test(u5a.reason) && !u5b.ok && /changelog-why/.test(u5b.reason), 'an empty changelog and a line without a reason are refused by the release tool', u5a.reason + ' | ' + u5b.reason);
  var u5c = await pubOne(entry('kw.alpha', '1.1.0', { changelog: { Removed: [{ what: 'the old column', why: 'unused', action: 'none' }] } }), Lp), u5d = await pubOne(entry('kw.alpha', '2.0.0', { changelog: { Removed: [{ what: 'the old column', why: 'unused' }] } }), Lp);
  A('U5', !u5c.ok && /changelog-needs-major/.test(u5c.reason) && u5d.ok === true, 'a Removed line with a MINOR bump is refused; with a MAJOR bump it is accepted', u5c.reason + ' | ' + (u5d.ok ? 'accepted' : u5d.reason));
  var u5e = await pubOne(entry('kw.alpha', '1.2.0', { changelog: { Changed: [{ what: 'rounding', why: 'legal', breaking: true }] } }), Lp);
  A('U5', !u5e.ok && /changelog-needs-major/.test(u5e.reason), 'a breaking Changed line needs a major too', u5e.reason);
  var Lbad = await signL(body(1, [entry('kw.ok', '1.1.0'), entry('kw.noWhy', '1.1.0', { changelog: { Fixed: [{ what: 'x' }] } })]), [Ko]), rbad = await TU.classify(Lbad, mkctx({ release: async function (e) { return rel(e.id, e.current); } }));
  A('U5', rbad[0].state === 'update-available' && rbad[1].state === 'invalid' && rbad[1].reason === 'changelog-why', 'on RECEIVE an invalid entry is flagged invalid with its reason; the rest of the list is unaffected', rbad.map(function (r) { return r.id + ':' + r.state + (r.state === 'invalid' ? '(' + r.reason + ')' : ''); }).join(' '));

  // ── U6 caps ──
  say('\n── U6: size caps (F9) ──');
  var many = []; for (var m = 0; m < 65; m++) many.push(entry('kw.m' + m, '1.1.0'));
  var vBig = await TU.verify(await signL(body(1, many), [Ko]), mkctx());
  A('U6', !vBig.ok && vBig.reason === 'list-too-large', '65 entries (> 64) is list-too-large', vBig.reason);
  var vOk64 = await TU.verify(await signL(body(1, many.slice(0, 64)), [Ko]), mkctx());
  A('U6', vOk64.ok, 'CONTROL: 64 entries is accepted', String(vOk64.reason));

  // ── verdict ──
  var armsRed = Object.keys(ARMS).filter(function (k) { return ARMS[k] > 0; });
  console.log('§UL_ARMS red=' + (armsRed.length ? armsRed.join(',') : 'none') + ' judged=' + judged);
  if (process.env.UL_ONLY_ARMS) process.exit(armsRed.length ? 1 : 0);
  if (!judged) { console.log('§UL_VERDICT INCONCLUSIVE judged=0'); process.exit(1); }
  if (armsRed.length) { console.log('§UL_VERDICT FAIL judged=' + judged + ' red=' + armsRed.join(',') + ' mutants=NOT RUN (the base run is red)'); process.exit(1); }
  var M = [
    ['release hash/size not compared', 'comm/team_updates.js', /\/\*UL:HASH\*\/ \(await TK\.sha256hex\(bytes\)\) !== e\.hash \|\| bytes\.length !== e\.size/, 'false', 'U3'],
    ['replay check removed', 'comm/team_updates.js', 'list.number < last.number', 'false', 'U4'],
    ['out-of-date read from the device clock', 'comm/team_updates.js', 'outOfDate: TK.isExpired(list.expires, eff)', 'outOfDate: list.expires < Date.now()', 'U4'],
    ['signer ability not checked (rotate instead of publish)', 'comm/team_updates.js', "'publish', ctx.trust.threshold", "'rotate', ctx.trust.threshold", 'U4'],
    ['receiver does not check the base', 'comm/team_updates.js', /\/\*UL:BASE\*\/ e\.base\.sha256 !== ctx\.base\.sha256/, 'false', 'U3'],
    ['policy-cap check removed', 'comm/team_updates.js', '>= LIMITS.policy_upcaster_sets) { row.state', '>= 1e9) { row.state', 'U3'],
    ['a withdrawn module blocks business', 'comm/team_updates.js', 'function businessAllowed(row) { return true; }', "function businessAllowed(row) { return row.state !== 'withdrawn'; }", 'U2'],
    ['changelog reason not required', 'comm/team_updates.js', /\/\*UL:WHY\*\/[^\n]*/, '', 'U5'],
    ['anchor skew not bounded', 'comm/team_updates.js', 'list.signed_at > ctx.anchor + TK.ANCHOR_MAX_SKEW_MS', 'false', 'U4'],
    ['entries length cap removed (verify)', 'comm/team_updates.js', 'list.entries.length > LIMITS.list_entries', 'false', 'U6']
  ];
  var killed = 0, applied = 0;
  M.forEach(function (m) {
    var file = path.join(ROOT, 'common', m[1]), src = fs.readFileSync(file, 'utf8'), s2 = src.replace(m[2], m[3]);
    if (s2 === src) { console.log('   🔴 mutant ' + m[0] + ': MUTATION DID NOT APPLY'); return; }
    applied++;
    var d = fs.mkdtempSync(path.join(os.tmpdir(), 'ul-mut-')); fs.mkdirSync(path.join(d, 'common/comm'), { recursive: true });
    fs.readdirSync(COMM).filter(function (x) { return /\.js$/.test(x); }).forEach(function (x) { fs.copyFileSync(path.join(COMM, x), path.join(d, 'common/comm', x)); });
    fs.writeFileSync(path.join(d, 'common', m[1]), s2);
    var r = cp.spawnSync(process.execPath, [__filename], { env: Object.assign({}, process.env, { KW_ROOT: d, UL_ONLY_ARMS: '1' }), encoding: 'utf8', maxBuffer: 1 << 26 }); fs.rmSync(d, { recursive: true, force: true });
    var mm = /§UL_ARMS red=(\S+)/.exec(r.stdout || ''), reds = mm && mm[1] !== 'none' ? mm[1].split(',') : [], hit = !!mm && reds.indexOf(m[4]) >= 0; if (hit) killed++;
    console.log('   ' + (hit ? '🟢' : '🔴') + ' mutant ' + m[0] + ' -> ' + (mm ? 'red=' + (reds.join(',') || 'none') : 'CRASHED (not a kill) ' + String(r.stderr).split('\n')[0]) + ' (expected ' + m[4] + ')');
  });
  var verdict = killed === M.length ? 'PASS' : 'FAIL';
  console.log('§UL_VERDICT ' + verdict + ' judged=' + judged + ' mutants=' + killed + '/' + M.length);
  process.exit(verdict === 'PASS' ? 0 : 1);
})().catch(function (e) { console.log('§UL_CRASH ' + (e && e.stack || e)); process.exit(2); });
