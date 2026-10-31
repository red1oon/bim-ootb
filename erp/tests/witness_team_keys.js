#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — Scope: W-KEYS, bim-compiler prompts/TEAMWORK_FRAMEWORK.md §46.5 F5/F6/F7 (Stage 2 "trust"; spec STAGE2_SPEC). READ THE LOG after every run: verdict = §KW_VERDICT.
//   THE ISSUES it proves/disproves: (F5) the trust list was a flat set - any listed key could rotate, publish an executors map AND sign translation sets, and one key sufficed; a lost-key recovery
//   key that can ONLY rotate, and an N-of-M threshold, were not buildable. (F6) plugin bundles were unsigned (`plugin_registry.js` "signature is reserved but NOT enforced"). (F7) "now" for expiry was
//   a device's own Date.now(): a 2040 clock would expire everything for everyone. Rule: the time anchor comes ONLY from admin-signed POLICY objects, bounded.
//   Node-only: bim-ootb's OWN common/comm + erp/plugin_registry.js (KW_ROOT=<tree> serves a mutant / the OLD tree), sql.js. Signing is done HERE with WebCrypto (independent of the code under test).
//   R roles · T threshold · B bundles · A anchor · L legacy compatibility (a log written by the UNMODIFIED origin/main engine folds identically) · MUTANTS (source replacement; a crash is NOT a kill).
// Run: node erp/tests/witness_team_keys.js 2>&1 | tee build/scriptor/versioning_s2_s4/witness_team_keys.log        env KW_OLD=<dir of origin/main common/comm> enables L1.
'use strict';
if (typeof globalThis.crypto === 'undefined' || !globalThis.crypto.subtle) globalThis.crypto = require('crypto').webcrypto;
var path = require('path'), fs = require('fs'), os = require('os'), cp = require('child_process'), nodeCrypto = require('crypto');
var HERE = path.join(__dirname, '..', '..'), ROOT = process.env.KW_ROOT || HERE, QUIET = !!process.env.KW_ONLY_ARMS;
var COMM = path.join(ROOT, 'common', 'comm');
function reqSql() { try { return require('sql.js'); } catch (e) { return require('/home/red1/bim-ootb/tests/node_modules/sql.js'); } }
var subtle = nodeCrypto.webcrypto.subtle, judged = 0, ARMS = {}, say = function (s) { if (!QUIET) console.log(s); };
function A(arm, ok, label, detail) { if (ok === null) { say('   ⚪ ' + arm + ' ' + label + (detail ? ' — ' + detail : '')); return null; } judged++; ARMS[arm] = ARMS[arm] || 0; if (!ok) ARMS[arm]++; say('   ' + (ok ? '🟢' : '🔴') + ' ' + arm + ' ' + label + (detail ? ' — ' + detail : '')); return ok; }
function canon(o) { if (o === null || typeof o !== 'object') return JSON.stringify(o); if (Array.isArray(o)) return '[' + o.map(canon).join(',') + ']'; return '{' + Object.keys(o).sort().map(function (k) { return JSON.stringify(k) + ':' + canon(o[k]); }).join(',') + '}'; }
function hex(b) { return Buffer.from(b).toString('hex'); }
async function mkKey(role) { var kp = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']), j = await subtle.exportKey('jwk', kp.publicKey);
  var pub = { kty: j.kty, crv: j.crv, x: j.x, y: j.y }; var entry = Object.assign({}, pub); if (role) entry.role = role; return { priv: kp.privateKey, pub: pub, entry: entry }; }
function bodyOf(st) { var b = JSON.parse(JSON.stringify(st)); delete b.sig; delete b.signer; delete b.cosigs; return b; }
async function sigOf(body, key) { return hex(await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key.priv, new TextEncoder().encode(canon(body)))); }
// sign a statement with keys[0] as the primary and the rest as cosigs (the scheme of STAGE2_SPEC K2)
async function signStmt(st, keys) { var b = bodyOf(st), out = Object.assign({}, b, { signer: keys[0].pub, sig: await sigOf(b, keys[0]) });
  if (keys.length > 1) { out.cosigs = []; for (var i = 1; i < keys.length; i++) out.cosigs.push({ signer: keys[i].pub, sig: await sigOf(b, keys[i]) }); } return out; }
var sha = function (s) { return nodeCrypto.createHash('sha256').update(s).digest('hex'); };
var uuid = function () { return nodeCrypto.randomUUID(); };
var listOf = function (ks) { return ks.map(function (k) { return k.entry; }); };
var OWN = {}; // filled

function loadEngine(dir) {
  ['CommEnvelope', 'CommOrder', 'CommRoster', 'CommAdmit', 'CommStore', 'CommPipe', 'TeamKeys'].forEach(function (n) { delete globalThis[n]; });
  var E = { STORE: require(path.join(dir, 'comm_store.js')), ROS: require(path.join(dir, 'comm_roster.js')) };
  try { E.TK = require(path.join(dir, 'team_keys.js')); } catch (e) { E.TK = null; }
  return E;
}

(async function () {
  var SQL = await reqSql()(), E = loadEngine(COMM), STORE = E.STORE, ROS = E.ROS, TK = E.TK;
  say('═══ W-KEYS — roles, threshold, bundle signing, time anchor (spec STAGE2_SPEC; review F5/F6/F7) ═══   root=' + ROOT + ' team_keys=' + (TK ? 'loaded' : 'ABSENT') + '\n');
  async function space(keys, T) {
    var F = await STORE.newDevice(); F.person_uu = uuid(); var o = { planTrust: listOf(keys) }; if (T) o.planTrustThreshold = T;
    var sp = await STORE.newSpace('kw', F, F.person_uu, 'F', 102, o);
    var S = STORE.open(new SQL.Database(), { SQL: SQL, space: sp.space, self: F, access: function () { return { allowed: true }; }, log: function () {} }); await S.genesis(sp.params);
    return { S: S, F: F, sp: sp };
  }
  async function rotate(S, newKeys, prevKeys, signers, threshold) { var st = { kind: 'plan-trust', keys: listOf(newKeys), prev: await ROS.planTrustHash(listOf(prevKeys)) }; if (threshold) st.threshold = threshold;
    return S.publishStatement(await signStmt(st, signers)); }
  async function exe(S, map, prevMap, signers) { return S.publishStatement(await signStmt({ kind: 'executors', map: map, prev: await ROS.executorsHash(prevMap) }, signers)); }
  var why = function (r) { return r.verdict + (r.reason && r.verdict.indexOf(':') < 0 ? ':' + r.reason : ''); };
  async function rejects(p) { try { await p; return null; } catch (e) { return e; } }

  // ── R: roles ──
  say('── R: per-key roles (F5) ──');
  var Ko = await mkKey(), Kr = await mkKey('rotate-only'), Kp = await mkKey('publish'), Kn = await mkKey();
  var s1 = await space([Ko, Kr]);
  var r1 = await rotate(s1.S, [Kn, Kr], [Ko, Kr], [Kr]);
  A('R1', r1.ok === true, 'the rotate-only recovery key ALONE replaces a lost owner key (rotation Ko->Kn signed by Kr)', why(r1));
  var pt = await s1.S.planTrust();
  A('R1', pt && pt.length === 2 && pt.some(function (k) { return k.x === Kn.pub.x; }) && !pt.some(function (k) { return k.x === Ko.pub.x; }) && pt.some(function (k) { return k.x === Kr.pub.x && k.role === 'rotate-only'; }), 'the folded list holds the new owner key and the recovery key WITH its role', JSON.stringify((pt || []).map(function (k) { return k.role || 'owner'; })));
  var s2 = await space([Ko, Kr]);
  var r2 = await exe(s2.S, { c_order: 102 }, {}, [Kr]), r2c = await exe(s2.S, { c_order: 102 }, {}, [Ko]);
  A('R2', !r2.ok && why(r2) === 'REFUSED:executors-role', 'the rotate-only key CANNOT publish an executors map', why(r2));
  A('R2', r2c.ok === true, 'CONTROL: the owner key publishes the same map (the refusal is the role, not the map)', why(r2c));
  var s3 = await space([Ko, Kp]);
  var r3 = await rotate(s3.S, [Ko, Kp, Kn], [Ko, Kp], [Kp]), r3c = await exe(s3.S, { c_order: 102 }, {}, [Kp]);
  A('R3', !r3.ok && why(r3) === 'REFUSED:plan-trust-role', 'a publish-only key CANNOT rotate the list', why(r3));
  A('R3', r3c.ok === true, 'CONTROL: the same publish-only key publishes an executors map', why(r3c));
  var e4a = await rejects(STORE.newSpace('kw', await STORE.newDevice(), uuid(), 'F', 102, { planTrust: listOf([Kr]) })), e4b = await rejects(STORE.newSpace('kw', await STORE.newDevice(), uuid(), 'F', 102, { planTrust: listOf([Kp]) }));
  A('R4', e4a && /no-publisher/.test(e4a.message) && e4b && /no-rotator/.test(e4b.message), 'a list nobody can publish with / rotate with is refused at founding', (e4a && e4a.message) + ' | ' + (e4b && e4b.message));
  A('R4', ROS.planTrustProblem(listOf([Ko, { kty: 'EC', crv: 'P-256', x: Kp.pub.x, y: Kp.pub.y, role: 'wizard' }])) !== null, 'an unknown role is refused (not silently treated as owner)', String(ROS.planTrustProblem(listOf([Ko, Object.assign({}, Kp.entry, { role: 'wizard' })]))));
  var s5 = await space([Ko, Kr]), r5 = await rotate(s5.S, [Kn, Kr], [Ko, Kr], [Kn]), r5b = await s5.S.publishStatement(Object.assign(await signStmt({ kind: 'plan-trust', keys: listOf([Kn, Kr]), prev: await ROS.planTrustHash(listOf([Ko, Kr])) }, [Ko]), { keys: listOf([Kn, Ko, Kr]) }));
  A('R5', !r5.ok && /untrusted-signer/.test(why(r5)), 'preserved: an OUTSIDE signer is still refused', why(r5));
  A('R5', !r5b.ok, 'preserved: a statement edited after signing is still refused', why(r5b));

  // ── T: threshold ──
  say('\n── T: signing threshold (F5) ──');
  var K1 = await mkKey(), K2 = await mkKey(), K3 = await mkKey(), K4 = await mkKey(), K5 = await mkKey();
  var t1 = await space([K1, K2, K3], 2), th0 = (await t1.S.order()).roster.planTrustThreshold;
  A('T0', th0 === 2, 'the genesis pins the threshold (roster.planTrustThreshold)', String(th0));
  var a = await rotate(t1.S, [K1, K2], [K1, K2, K3], [K1]);
  A('T1', !a.ok && why(a) === 'REFUSED:plan-trust-threshold', 'T=2: ONE signature on a rotation is REFUSED', why(a));
  var b = await rotate(t1.S, [K1, K2], [K1, K2, K3], [K1, K1]);
  A('T1', !b.ok && why(b) === 'REFUSED:plan-trust-threshold', 'T=2: the SAME key signing twice counts once - REFUSED', why(b));
  var fk = await signStmt({ kind: 'plan-trust', keys: listOf([K1, K2]), prev: await ROS.planTrustHash(listOf([K1, K2, K3])) }, [K1, K2]); fk.cosigs[0].sig = await sigOf({ other: 1 }, K2);
  var d = await t1.S.publishStatement(fk);
  A('T4', !d.ok && why(d) === 'REFUSED:plan-trust-threshold', 'a forged cosignature (a signature over other content) is ignored, so the count falls short', why(d));
  var c = await rotate(t1.S, [K1, K2], [K1, K2, K3], [K1, K2]);
  A('T1', c.ok === true, 'CONTROL: two distinct listed keys (both also in the new list, as T stays 2) sign - MERGED', why(c));
  A('T1', (await t1.S.order()).roster.planTrustThreshold === 2, 'a rotation that omits `threshold` KEEPS the threshold in force (no silent downgrade)', String((await t1.S.order()).roster.planTrustThreshold));
  var t2 = await space([K1, K2, K3], 2), e1 = await exe(t2.S, { c_order: 102 }, {}, [K1]), e2 = await exe(t2.S, { c_order: 102 }, {}, [K1, K2]);
  A('T2', !e1.ok && why(e1) === 'REFUSED:executors-threshold', 'T=2: ONE signature on an executors map is REFUSED', why(e1));
  A('T2', e2.ok === true, 'CONTROL: two distinct keys publish the map', why(e2));
  var t3 = await space([K1, K2, K3], 2), n1 = await rotate(t3.S, [K1, K4], [K1, K2, K3], [K1, K2], 2);
  A('T3', !n1.ok && why(n1) === 'REFUSED:plan-trust-new-threshold', 'a rotation declaring T_new=2 with no 2 signers from the NEW list is REFUSED', why(n1));
  var n2 = await rotate(t3.S, [K1, K4], [K1, K2, K3], [K1, K2, K4], 2);
  A('T3', n2.ok === true && (await t3.S.order()).roster.planTrustThreshold === 2, 'CONTROL: K1 (both lists) + K2 (old) + K4 (new) satisfy old T=2 and new T=2', why(n2));
  var t5 = await space([K1, K2, K3], 2), u1 = await rotate(t5.S, [K1, K2, K3].slice(0, 1), [K1, K2, K3], [K1, K2], 2);
  A('T5', !u1.ok && /threshold-unreachable/.test(why(u1)), 'a threshold larger than the keys able to meet it is refused', why(u1));

  // ── B: bundle signing ──
  say('\n── B: bundle signing (F6) ──');
  var PR = null, prErr = null; try { PR = require(path.join(ROOT, 'erp', 'plugin_registry.js')); } catch (e) { prErr = e; }
  var SRC = 'export const manifest={id:"kw.demo",version:"1.0.0"};\n', BYTES = Buffer.from(SRC);
  async function bundleSig(keys, over) { var b = Object.assign({ kind: 'bundle', id: 'kw.demo', version: '1.0.0', digest: sha(SRC), bytes: BYTES.length }, over || {}); return signStmt(b, keys); }
  function mod(sigObj, id, ver) { return { manifest: { id: id || 'kw.demo', version: ver || '1.0.0', engineVersion: '>=0.9.0' }, activate: function () {}, signature: sigObj }; }
  async function install(trust, sigObj, bytes, over) {
    var bundles = { 'u://b': mod(sigObj, over && over.id, over && over.version) }, host = { engineVersion: '0.10.0', import: function (u) { return Promise.resolve(bundles[u]); } };
    if (trust) { host.bundleTrust = function () { return trust; }; host.fetchBytes = function () { return Promise.resolve(bytes || BYTES); }; }
    var reg = PR.create(host); try { var r = await reg.installBundle('u://b'); return { ok: true, r: r, signed: reg.list()[0].signed }; } catch (e) { return { ok: false, code: e.code || null, msg: e.message }; }
  }
  var Bo = await mkKey(), Bq = await mkKey(), Bo2 = await mkKey(), Brr = await mkKey('rotate-only'), Bpp = await mkKey('publish'), Bx = await mkKey();
  var TR = { keys: listOf([Bo, Brr, Bpp]), threshold: 1 };
  if (!PR) A('B0', false, 'plugin_registry.js loads', String(prErr && prErr.message));
  else {
    var b1 = await install(TR, await bundleSig([Bo]));
    A('B1', b1.ok && b1.signed === true, 'a bundle signed by an owner key installs and the registry reports signed=true (no unsigned badge)', b1.ok ? 'installed' : b1.code + ' ' + b1.msg);
    var b1b = await install(TR, await bundleSig([Bpp]));
    A('B1', b1b.ok, 'a publish-only key may sign a bundle', b1b.ok ? 'installed' : b1b.code + ' ' + b1b.msg);
    var b2 = await install(TR, undefined);
    A('B2', !b2.ok && b2.code === 'bundle-unsigned', 'an UNSIGNED bundle is refused when the host requires signatures', b2.code + ' ' + (b2.msg || ''));
    var b3 = await install(TR, await bundleSig([Bo]), Buffer.from(SRC + '// tampered\n'));
    A('B3', !b3.ok && b3.code === 'bundle-digest-mismatch', 'a bundle whose bytes differ from the signed digest is refused', b3.code + ' ' + (b3.msg || ''));
    var b4 = await install(TR, await bundleSig([Bx]));
    A('B4', !b4.ok && b4.code === 'bundle-signer', 'a bundle signed by an OUTSIDE key is refused', b4.code);
    var b5 = await install(TR, await bundleSig([Brr]));
    A('B5', !b5.ok && b5.code === 'bundle-role', 'a rotate-only key may NOT sign a bundle', b5.code);
    var b6 = await install({ keys: listOf([Bo, Bo2]), threshold: 2 }, await bundleSig([Bo]));
    A('B6', !b6.ok && b6.code === 'bundle-threshold', 'T=2 with ONE signature is refused', b6.code);
    var b6c = await install({ keys: listOf([Bo, Bo2]), threshold: 2 }, await bundleSig([Bo, Bo2]));
    A('B6', b6c.ok, 'CONTROL: T=2 with two signatures installs', b6c.ok ? 'installed' : b6c.code);
    var b8 = await install(TR, await bundleSig([Bo], { version: '9.9.9' }));
    A('B8', !b8.ok && b8.code === 'bundle-identity', 'a signature made for ANOTHER version of the bundle is refused', b8.code);
    var b9 = await install(TR, Object.assign(await bundleSig([Bo]), { sig: '00'.repeat(64) }));
    A('B9', !b9.ok && b9.code === 'bundle-signature', 'a corrupted signature is refused', b9.code);
    var b7 = await install(null, undefined);
    A('B7', b7.ok && b7.signed === false, 'LEGACY: no bundleTrust => an unsigned bundle installs exactly as before', b7.ok ? 'installed' : b7.code);
    // the build step CLI: produces a signature the registry accepts
    var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-b-')), ent = path.join(dir, 'b.js'); fs.writeFileSync(ent, SRC);
    var pj = await subtle.exportKey('jwk', Bo.priv); fs.writeFileSync(path.join(dir, 'p.jwk'), JSON.stringify(pj)); fs.writeFileSync(path.join(dir, 'q.jwk'), JSON.stringify(Bo.pub));
    var cli = path.join(ROOT, 'erp', 'tools', 'sign_bundle.js'), out = fs.existsSync(cli) ? cp.spawnSync(process.execPath, [cli, 'sign', ent, path.join(dir, 'p.jwk'), path.join(dir, 'q.jwk'), '--id', 'kw.demo', '--version', '1.0.0'], { encoding: 'utf8' }) : { status: -1, stdout: '', stderr: 'no cli' };
    var sj = null; try { sj = JSON.parse(out.stdout); } catch (e) { /* stays null */ }
    var bc = sj ? await install(TR, sj) : { ok: false, code: 'no-signature', msg: out.stderr };
    A('B10', !!sj && bc.ok, 'the BUILD STEP (erp/tools/sign_bundle.js) writes a signature the registry accepts', sj ? (bc.ok ? 'installed' : bc.code) : 'cli: ' + String(out.stderr).split('\n')[0]);
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // ── A: time anchor ──
  say('\n── A: the time anchor (F7) ──');
  var DAY = 86400000, T0 = Date.UTC(2026, 9, 31), realNow = Date.now;
  var as = await space([Ko, Kr]);
  async function pub(S, ts) { return S.publishAnchor ? S.publishAnchor(ts) : { ok: false, verdict: 'NO-API', reason: 'publishAnchor missing' }; }
  var a0 = await pub(as.S, T0), anchor0 = (await as.S.order()).roster.anchor;
  A('A2', a0.ok === true && anchor0 === T0, 'an admin-signed POLICY sets the anchor', why(a0) + ' anchor=' + anchor0);
  var a1 = await pub(as.S, T0 - DAY), a2 = await pub(as.S, T0 + 400 * DAY), a3 = await pub(as.S, T0 + 100 * DAY);
  A('A2', !a1.ok && why(a1) === 'REFUSED:anchor-skew', 'an anchor that goes BACK is refused', why(a1));
  A('A2', !a2.ok && why(a2) === 'REFUSED:anchor-skew', 'an anchor that jumps > 366 days is refused (a typo cannot expire everything)', why(a2));
  A('A2', a3.ok === true && (await as.S.order()).roster.anchor === T0 + 100 * DAY, 'CONTROL: a 100-day step is accepted', why(a3));
  var cur = (await as.S.order()).roster.anchor;
  Date.now = function () { return Date.UTC(2040, 0, 1); };       // a device whose clock says 2040
  var farOps;
  try {
    var pol = await as.S.policy(), np = JSON.parse(JSON.stringify(pol.params)); np.epoch = pol.epoch + 1; delete np.anchor_ts; np.visit_ms = 60000;
    farOps = await as.S.setPolicy(np);           // an op authored under the 2040 clock
    var after = (await as.S.order()).roster.anchor;
    A('A3', after === cur, 'an op authored under a 2040 device clock does not move the anchor', 'anchor ' + cur + ' -> ' + after);
    var exps = [after + DAY, after + 30 * DAY, after + 100 * DAY].map(function (x) { return TK ? TK.isExpired(x, after) : null; });
    A('A1', TK && exps[0] === false && exps[1] === false && exps[2] === false, 'with the device clock at 2040, entries expiring after the anchor are NOT expired (the clock is never read)', JSON.stringify(exps));
    A('A1', TK && TK.isExpired(T0 + 30 * DAY, T0 + 200 * DAY) === true, 'CONTROL: the function does say "expired" when an admin-signed anchor is past the expiry', String(TK && TK.isExpired(T0 + 30 * DAY, T0 + 200 * DAY)));
  } finally { Date.now = realNow; }
  A('A4', TK && TK.isExpired(T0, null) === false, 'no anchor yet => nothing is expired (and the verdict says so, never a guess)', String(TK && TK.isExpired(T0, null)));

  // ── L: legacy compatibility ──
  say('\n── L: spaces and statements written before this change keep loading ──');
  if (!process.env.KW_OLD || !fs.existsSync(path.join(process.env.KW_OLD, 'comm_store.js'))) A('L1', null, 'INCONCLUSIVE - KW_OLD (origin/main common/comm) not given: nothing was judged', '');
  else {
    var OLD = loadEngine(process.env.KW_OLD);
    var L0 = await OLD.STORE.newDevice(); L0.person_uu = uuid();
    var lk0 = await mkKey(), lk1 = await mkKey(), lk2 = await mkKey(), plainList = function (ks) { return ks.map(function (k) { return k.pub; }); };
    var lsp = await OLD.STORE.newSpace('kw', L0, L0.person_uu, 'F', 102, { planTrust: plainList([lk0, lk1]) });
    var LS = OLD.STORE.open(new SQL.Database(), { SQL: SQL, space: lsp.space, self: L0, access: function () { return { allowed: true }; }, log: function () {} }); await LS.genesis(lsp.params);
    var lr1 = await LS.publishStatement(await signStmt({ kind: 'plan-trust', keys: plainList([lk1, lk2]), prev: await OLD.ROS.planTrustHash(plainList([lk0, lk1])) }, [lk1]));
    var lr2 = await LS.publishStatement(await signStmt({ kind: 'executors', map: { c_order: 102 }, prev: await OLD.ROS.executorsHash({}) }, [lk2]));
    var lr3 = await LS.publishStatement(await signStmt({ kind: 'executors', map: { c_order: 103 }, prev: await OLD.ROS.executorsHash({ c_order: 102 }) }, [lk0]));   // lk0 was dropped: REFUSED by the old engine
    var oldOrder = await LS.order(), envs = LS.query('SELECT op_hash, envelope FROM cl_op').map(function (r) { return JSON.parse(r.envelope); });
    var N0 = await STORE.newDevice(); N0.person_uu = uuid();
    var NS = STORE.open(new SQL.Database(), { SQL: SQL, space: lsp.space, self: N0, access: function () { return { allowed: true }; }, log: function () {} });
    for (var ei = 0; ei < envs.length; ei++) await NS.ingest(envs[ei], 'x');
    var newOrder = await NS.order(), hs = Object.keys(oldOrder.verdict), diffV = hs.filter(function (h) { var o = oldOrder.verdict[h], n = newOrder.verdict[h]; return !n || o.verdict !== n.verdict || (o.reason || null) !== (n.reason || null); });
    A('L1', hs.length >= 4 && lr1.ok && lr2.ok && !lr3.ok && diffV.length === 0, 'a log written by the UNMODIFIED engine (rotation, executors map, a refused stale-signer map) folds to the IDENTICAL verdicts under the new engine', 'ops=' + hs.length + ' differing=' + diffV.length + ' old: ' + why(lr1) + ' / ' + why(lr2) + ' / ' + why(lr3));
    var ptNew = await NS.planTrust(), ptOld = await LS.planTrust();
    A('L1', canon(ptNew) === canon(ptOld), 'the folded trust list is byte-identical (no role field invented)', canon(ptNew).slice(0, 60));
    A('L1', (await ROS.planTrustHash(plainList([lk1, lk2]))) === (await OLD.ROS.planTrustHash(plainList([lk1, lk2]))) && (await ROS.planTrustHash(plainList([lk1, lk2]))) === sha(canon(plainList([lk1, lk2]))), 'planTrustHash of a role-less list equals the old hash AND sha256(canonical(list)) - the `prev` chain is unchanged', '');
    A('L1', (await ROS.planTrustHash(listOf([Kr, Ko]))) !== (await ROS.planTrustHash(plainList([Kr, Ko]))), 'CONTROL: a role DOES change the hash (a role change is a signed rotation)', '');
    A('L1', (await NS.order()).roster.planTrustThreshold === 1 && (await NS.order()).roster.anchor === null, 'a legacy space reads threshold 1 and no anchor', String((await NS.order()).roster.planTrustThreshold) + '/' + String((await NS.order()).roster.anchor));
  }

  // ── verdict ──
  var armsRed = Object.keys(ARMS).filter(function (k) { return ARMS[k] > 0; });
  console.log('§KW_ARMS red=' + (armsRed.length ? armsRed.join(',') : 'none') + ' judged=' + judged + (QUIET ? '' : ''));
  if (process.env.KW_ONLY_ARMS) process.exit(armsRed.length ? 1 : 0);
  var inconclusive = !process.env.KW_OLD;
  if (armsRed.length) { console.log('§KW_VERDICT FAIL judged=' + judged + ' red=' + armsRed.join(',') + ' mutants=NOT RUN (the base run is red)'); process.exit(1); }
  var M = [
    ['role ignored on rotation', 'comm/team_keys.js', /\/\*KW:CAN\*\/[^\n]*/, '/*KW:CAN*/ function can(key, need) { return true; }', 'R3'],
    ['threshold ignored', 'comm/team_keys.js', 'n >= T', 'n >= 1', 'T1'],
    ['duplicate signer counted twice', 'comm/team_keys.js', /\/\*KW:DISTINCT\*\//, 'seen = {}; /*KW:DISTINCT*/', 'T1'],
    ['new-threshold check removed', 'comm/comm_roster.js', "return no('plan-trust-new-threshold')", "void 0", 'T3'],
    ['bundle digest not compared', 'comm/team_keys.js', 'loadedDigest !== signature.digest', 'false', 'B3'],
    ['anchor skew check removed', 'comm/comm_roster.js', "return no('anchor-skew')", "void 0", 'A2'],
    ['isExpired reads Date.now', 'comm/team_keys.js', /function isExpired\(expiresTs, anchor\) \{/, 'function isExpired(expiresTs, anchor) { anchor = Date.now();', 'A1'],
    ['planTrustOf drops the role', 'comm/comm_roster.js', /\/\*KW:ROLEKEEP\*\/[^\n]*\n/, '/*KW:ROLEKEEP*/\n', 'R1'],
    ['executors judged with the rotate ability', 'comm/comm_roster.js', "exSig[h], 'publish'", "exSig[h], 'rotate'", 'R2']
  ];
  var killed = 0;
  M.forEach(function (m) {
    var file = path.join(ROOT, m[1].indexOf('comm/') === 0 ? 'common/' + m[1] : m[1]), src = fs.readFileSync(file, 'utf8'), s2 = src.replace(m[2], m[3]);
    if (s2 === src) { console.log('   🔴 mutant ' + m[0] + ': MUTATION DID NOT APPLY'); return; }
    var d = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-mut-'));
    ['common/comm', 'erp', 'erp/tools'].forEach(function (rel) { fs.mkdirSync(path.join(d, rel), { recursive: true }); });
    fs.readdirSync(path.join(ROOT, 'common/comm')).filter(function (x) { return /\.js$/.test(x); }).forEach(function (x) { fs.copyFileSync(path.join(ROOT, 'common/comm', x), path.join(d, 'common/comm', x)); });
    ['plugin_registry.js', 'layered_registry.js'].forEach(function (x) { fs.copyFileSync(path.join(ROOT, 'erp', x), path.join(d, 'erp', x)); });
    if (fs.existsSync(path.join(ROOT, 'erp/tools/sign_bundle.js'))) fs.copyFileSync(path.join(ROOT, 'erp/tools/sign_bundle.js'), path.join(d, 'erp/tools/sign_bundle.js'));
    fs.writeFileSync(path.join(d, m[1].indexOf('comm/') === 0 ? 'common/' + m[1] : m[1]), s2);
    var r = cp.spawnSync(process.execPath, [__filename], { env: Object.assign({}, process.env, { KW_ROOT: d, KW_ONLY_ARMS: '1' }), encoding: 'utf8', maxBuffer: 1 << 26 }); fs.rmSync(d, { recursive: true, force: true });
    var mm = /§KW_ARMS red=(\S+)/.exec(r.stdout || ''), reds = mm && mm[1] !== 'none' ? mm[1].split(',') : [], hit = !!mm && reds.some(function (x) { return x === m[4]; }); if (hit) killed++;
    console.log('   ' + (hit ? '🟢' : '🔴') + ' mutant ' + m[0] + ' -> ' + (mm ? 'red=' + (reds.join(',') || 'none') : 'CRASHED (not a kill) ' + String(r.stderr).split('\n')[0]) + ' (expected ' + m[4] + ')');
  });
  var verdict = killed !== M.length ? 'FAIL' : (inconclusive ? 'INCONCLUSIVE' : 'PASS');
  console.log('§KW_VERDICT ' + verdict + ' judged=' + judged + ' mutants=' + killed + '/' + M.length + (inconclusive ? ' (KW_OLD not given: L1 judged nothing)' : ''));
  process.exit(verdict === 'PASS' ? 0 : 1);
})().catch(function (e) { console.log('§KW_CRASH ' + (e && e.stack || e)); process.exit(2); });
