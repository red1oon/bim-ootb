#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
/* ⚠ DO NOT REMOVE — Scope: W-READ-SCOPE, bim-compiler prompts/TEAMWORK_FRAMEWORK.md §45.11 (sealing in the real relay layer + per-mailbox sequence). READ THE LOG after every run — the exit code is not evidence.
 * THE ISSUES: (1) F1 (§45.10) stopped station Y from DOWNLOADING station X's mail, not from READING it: every member holds the one space key, so a modified client that lists m/p_X/ and m/hub/ reads it all.
 * §45.11 seals a laned op to ONE audience (the pair key: 'hub' = hub devices, 'p_<person>' = that person's devices + the hub devices). (2) In a mailbox space gaps() returned [] (a relay that withholds a mailbox bundle was
 * invisible); a laned op now carries a SIGNED per-mailbox sequence `box:{name,seq}` and the signed head carries `boxes`. REAL engine (common/comm) + real WebCrypto + real sql.js on an in-memory relay; the host
 * (plan knowledge) is a stub that supplies the five callbacks the ERP adapter supplies (laneOf, read, wantHead, holds). Baseline engine for the controls = the F1 engine at BASE_COMMIT (git archive).
 *   A  member read isolation   Y = a MODIFIED client that lists + gets every m/ object: opens 0 of X's laned ops; H opens all; X its own. CONTROL: audience sealing off (host without holds) -> Y opens N of N.
 *   B  relay bytes             needle search over every relay object finds none of the business values (CL8 kept); the same needles ARE in H's decrypted view and a plaintext identity value IS found (the search can find).
 *   C  convergence             verdict of every business op on every device = the F1-engine run of the same script; per-record order = the F1 run's; nothing PARKED.
 *   D  tamper / move / AAD     one flipped byte -> tampered, not ingested; a DOWN bundle moved m/p_X -> m/p_Y: Y opens 0 and keeps it sealed; an UP bundle moved m/hub -> m/p_X: X's 2nd device logs §COMM_BOX_MISMATCH
 *                              and does not ingest it; AAD unit: an op relabelled to another audience that has the SAME key bytes is refused.
 *   E  rogue key               Y (a station promoted to comm_admin) mints its own candidate key for p_X and grants it to H and itself: H never seals to it; Y opens 0 of H's later DOWN mail to X.
 *   F  revocation              revoke X's 2nd device -> REKEY; the new epoch's p_X key is not granted to it; DOWN mail after the rekey: revoked device opens 0, X's 1st device opens all.
 *   G  gap restored            relay withholds X's MIDDLE m/hub/ bundle -> gaps() lists {author X, box hub, seq}; withholds the LAST -> reported from X's head `boxes`. CONTROL: the F1 engine -> gaps() = [].
 *   H  hold                    a station whose pair key does not exist yet HOLDS its laned op (reason=no-aud-key), puts nothing on the relay, sends after the hub's grant, always sealed to its audience.
 *   I  unchanged spaces        an office space and a pre-F1 POS genesis: relay shape (names + ops per object) equals the F1 engine's, no `box` field, no head `boxes`; a mailbox space DOES carry them.
 *   J  checkpoint              a snapshot built in a mailbox space: Y (space key only) opens 0 laned ops from it. CONTROL: without holds the snapshot's laned ops open for Y.
 *   MUT ten mutants, each a source replacement of the engine (needle count printed, 0 = NOT APPLIED = INCONCLUSIVE); each must turn >= 1 of its arms red; a crashing mutant is NOT a kill.
 * Verdict: §RS_SCOPE_VERDICT PASS | FAIL | INCONCLUSIVE (an arm that judged nothing = INCONCLUSIVE).   Run: node common/tests/witness_read_scope.js [bim-ootb dir] [--no-mut] [--only=A,B] | tee <log> */
'use strict';
if (typeof globalThis.crypto === 'undefined' || !globalThis.crypto.subtle) globalThis.crypto = require('crypto').webcrypto;
var path = require('path'), fs = require('fs'), os = require('os'), cp = require('child_process'), nodeCrypto = require('crypto');
var ARGS = process.argv.slice(2), NOMUT = ARGS.indexOf('--no-mut') >= 0, POS = ARGS.filter(function (a) { return !/^--/.test(a); });
var ONLY = (ARGS.filter(function (a) { return /^--only=/.test(a); })[0] || '').replace('--only=', '').split(',').filter(Boolean);
var TREE = path.resolve(POS[0] || path.join(__dirname, '..', '..')), BASE_COMMIT = process.env.RS_BASE || 'c02eaa58';
var SQLJS = process.env.SQLJS_DIR || (fs.existsSync(path.join(TREE, 'tests/node_modules/sql.js')) ? path.join(TREE, 'tests/node_modules/sql.js') : '/home/red1/bim-ootb/tests/node_modules/sql.js');
var initSqlJs = require(SQLJS);
var ALL_ARMS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];

// ── collector: the product run prints; a mutant run only collects (its failures are kills, not product failures) ──
var C = null;
function newC(print) { return { print: print, arms: {}, fails: 0, judged: 0, inc: 0 }; }
function slot(arm) { return (C.arms[arm] = C.arms[arm] || { pass: 0, fail: 0, inc: 0 }); }
function ok(arm, cond, label, detail) { C.judged++; var s = slot(arm); if (cond) s.pass++; else { s.fail++; C.fails++; }
  if (C.print) console.log('   ' + (cond ? 'PASS' : 'FAIL') + ' §RS-' + arm + ' ' + label + (detail ? ' - ' + detail : '')); return cond; }
function vacuous(arm, label) { slot(arm).inc++; C.inc++; if (C.print) console.log('   INCONCLUSIVE §RS-' + arm + ' ' + label + ' (nothing was judged)'); }

// ── engines: the tree under test, the F1 baseline (git archive of BASE_COMMIT), mutants (source replacement into a temp copy) ──
var tmpN = 0;
function copyComm(srcDir, mut) {
  var d = fs.mkdtempSync(path.join(os.tmpdir(), 'rsw_' + (tmpN++) + '_')), applied = 0;
  fs.readdirSync(srcDir).filter(function (f) { return /\.js$/.test(f); }).forEach(function (f) { var s = fs.readFileSync(path.join(srcDir, f), 'utf8');
    if (mut && mut.file === f) { var parts = s.split(mut.needle); applied = parts.length - 1; s = parts.join(mut.repl); } fs.writeFileSync(path.join(d, f), s); });
  return { dir: d, applied: applied };
}
function load(dir) { ['CommEnvelope', 'CommOrder', 'CommRoster', 'CommAdmit', 'CommStore', 'CommPipe'].forEach(function (n) { delete globalThis[n]; });
  return { ENV: require(path.join(dir, 'comm_envelope.js')), STORE: require(path.join(dir, 'comm_store.js')), ROS: require(path.join(dir, 'comm_roster.js')), PIPE: require(path.join(dir, 'comm_pipe.js')) }; }
function baseline() { var d = fs.mkdtempSync(path.join(os.tmpdir(), 'rsbase_'));
  var r = cp.spawnSync('sh', ['-c', 'git -C "' + TREE + '" archive ' + BASE_COMMIT + ' common/comm | tar -x -C "' + d + '"'], { encoding: 'utf8' });
  if (r.status !== 0 || !fs.existsSync(path.join(d, 'common/comm/comm_store.js'))) return null; return path.join(d, 'common/comm'); }

// ── the host stub: what the ERP adapter supplies. hub role 102, station role 200; UP table t_up -> hub, DOWN table t_down -> the addressee's box ──
function hostCfg(w, o) {
  var cfg = {
    laneOf: function (spec) { var t = spec.target.table; if (t === 't_up') return 'hub'; if (t === 't_down') { var a = w.addr[String(spec.target.uu).toLowerCase()]; return a ? 'p_' + a : null; } return null; },
    read: function (c) { var d = c.roster.devices[c.self.kid]; if (!d) return []; if (o.all) return ['hub'].concat(w.persons.map(function (p) { return 'p_' + p; }));
      return c.roster.roleAt(c.self.kid, Infinity).ad_role_id === 102 ? ['hub'] : ['p_' + d.person]; },
    wantHead: function (kid, c) { var d = c.roster.devices[kid], me = c.roster.devices[c.self.kid]; if (!d) return false; return c.roster.roleAt(kid, Infinity).ad_role_id === 102 || (!!me && d.person === me.person) || c.roster.roleAt(c.self.kid, Infinity).ad_role_id === 102; }
  };
  if (o.holds !== false) cfg.holds = function (aud, kid, c) { var d = c.roster.devices[kid]; if (!d) return false; var hub = c.roster.roleAt(kid, Infinity).ad_role_id === 102;
    if (aud === 'hub') return hub; var m = /^p_(.+)$/.exec(String(aud)); return !!m && (hub || d.person === m[1]); };
  return cfg;
}

var SQL, POOL = [], PARAMS = {};
function uid(s) { var h = nodeCrypto.createHash('sha1').update(s).digest('hex'); return h.slice(0, 8) + '-' + h.slice(8, 12) + '-4' + h.slice(13, 16) + '-8' + h.slice(17, 20) + '-' + h.slice(20, 32); }
function fields(extra) { return Object.assign({ ad_client_id: 11, ad_org_id: 0 }, extra || {}); }
async function pool(E, n) { while (POOL.length < n) { var d = await E.STORE.newDevice(); d.person_uu = nodeCrypto.randomUUID(); POOL.push(d); } }
function sortKeys(o) { var r = {}; Object.keys(o).sort().forEach(function (k) { r[k] = o[k]; }); return r; }
function eq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
var NEEDLES = ['SEALNEEDLE-UP-X1', 'SEALNEEDLE-UP-Y', 'SEALNEEDLE-DOWN-X1', 'SEALNEEDLE-DOWN-Y', 'SEALNEEDLE-NOTE'];

// world(E, o): H = hub (idx 0, role 102), X1 (1), Y (2) stations; o.x2 -> a 2nd device of X's person (idx 3). o = { plan, flag, holds, all:[idx modified], det, x2, noAud }
async function founding(E, o) {
  var clock = 1700000000000, realNow = Date.now; if (o.det) Date.now = function () { return clock++; };
  try {
    await pool(E, 4);
    var plan = o.plan || 'pos', devs = POOL.slice(0, o.x2 ? 4 : 3); if (o.x2) { POOL[3].person_uu = POOL[1].person_uu; }
    var key = plan + '|' + String(o.flag) + '|' + (o.x2 ? 4 : 3), sp;
    if (!PARAMS[key]) { var nso = plan === 'pos' ? { plan: 'pos' } : undefined; if (nso && o.flag === false) nso.mailboxes = false; PARAMS[key] = await E.STORE.newSpace('rsw', devs[0], devs[0].person_uu, 'HQ', 102, nso); }
    sp = PARAMS[key];
    var w = { E: E, devs: devs, persons: [devs[1].person_uu, devs[2].person_uu], addr: {}, space: sp.space, SP: 's/' + sp.space + '/', relay: E.PIPE.memPipe('rs'), logs: [], S: [], o: o, ts: 1700000100000 };
    w.open = function (i, oo, db) { oo = oo || {}; var lg = (w.logs[i] = w.logs[i] || []);
      var S = E.STORE.open(db || new SQL.Database(), { SQL: SQL, space: sp.space, self: devs[i], access: function () { return { allowed: true }; }, log: function (m) { lg.push(String(m)); } });
      if (typeof S.setMailbox === 'function' && o.plan !== 'office' && !oo.noCfg) S.setMailbox(hostCfg(w, { holds: o.holds, all: oo.all || (o.all || []).indexOf(i) >= 0 })); return S; };
    w.S = devs.map(function (d, i) { return w.open(i); });
    var H = w.S[0]; await H.genesis(sp.params);
    if (o.noAud) H.setMailbox(null);                                                            // arm H: the hub enrolls without audience-key support (no pair key exists yet)
    await H.addPerson({ person_uu: devs[1].person_uu, name: 'Station X', ad_role_id: 200, comm_admin: false });
    await H.enroll(devs[1].kid, devs[1].pubJwk, devs[1].person_uu, devs[1].dhPubJwk);
    if (o.x2) await H.enroll(devs[3].kid, devs[3].pubJwk, devs[3].person_uu, devs[3].dhPubJwk);
    await H.addPerson({ person_uu: devs[2].person_uu, name: 'Station Y', ad_role_id: 200, comm_admin: false });
    await H.enroll(devs[2].kid, devs[2].pubJwk, devs[2].person_uu, devs[2].dhPubJwk);
    await H.setPolicy({ epoch: 1, visit_ms: 600000 });
    await H.sync(w.relay);
    if (o.noAud) H.setMailbox(plan !== 'office' ? hostCfg(w, { holds: o.holds }) : null);
    for (var i = 1; i < devs.length; i++) await w.S[i].sync(w.relay);
    return w;
  } finally { Date.now = realNow; }
}
// the traffic of the standard script: both stations send UP, H sends DOWN to each + one unaddressed note, everyone collects
async function traffic(w) {
  var realNow = Date.now, clock = 1700000200000; if (w.o.det) Date.now = function () { return clock++; };
  try {
    var H = w.S[0], X1 = w.S[1], Y = w.S[2], ts = w.ts;
    var ux = uid('upx' + w.space);
    await X1.author({ target: { table: 't_up', uu: ux }, intent: 'K2', ts: ts++, body: { op_type: 'CRUD_CREATE', params: { fields: fields({ documentno: 'SEALNEEDLE-UP-X1', amt: 10 }) } } });
    await X1.author({ target: { table: 't_up', uu: ux }, intent: 'K2', ts: ts++, body: { op_type: 'CRUD_UPDATE', params: { changes: { amt: { old: 10, new: 11 } } } } });
    await X1.sync(w.relay);
    await Y.author({ target: { table: 't_up', uu: uid('upy' + w.space) }, intent: 'K2', ts: ts++, body: { op_type: 'CRUD_CREATE', params: { fields: fields({ documentno: 'SEALNEEDLE-UP-Y', amt: 7 }) } } });
    await Y.sync(w.relay);
    await H.sync(w.relay);
    await H.author({ target: { table: 't_note', uu: uid('note' + w.space) }, intent: 'K2', ts: ts++, body: { op_type: 'CRUD_CREATE', params: { fields: fields({ name: 'SEALNEEDLE-NOTE' }) } } });
    var dx = uid('downx' + w.space), dy = uid('downy' + w.space); w.addr[dx] = w.devs[1].person_uu; w.addr[dy] = w.devs[2].person_uu;
    await H.author({ target: { table: 't_down', uu: dx }, intent: 'K2', ts: ts++, body: { op_type: 'CRUD_CREATE', params: { fields: fields({ documentno: 'SEALNEEDLE-DOWN-X1' }) } } });
    await H.author({ target: { table: 't_down', uu: dy }, intent: 'K2', ts: ts++, body: { op_type: 'CRUD_CREATE', params: { fields: fields({ documentno: 'SEALNEEDLE-DOWN-Y' }) } } });
    await H.sync(w.relay);
    for (var i = 1; i < w.S.length; i++) await w.S[i].sync(w.relay);
    await H.sync(w.relay);
    w.ts = ts; return w;
  } finally { Date.now = realNow; }
}
var MEMO = new Map();
async function std(E, o) { var k = JSON.stringify(o); var m = MEMO.get(E); if (!m) { m = {}; MEMO.set(E, m); } if (!m[k]) m[k] = await traffic(await founding(E, o)); return m[k]; }

function laned(S) { return S.query("SELECT op_hash, author_kid, target_table, target_uu FROM cl_op WHERE target_table IN ('t_up','t_down')"); }
function ownerOf(w, r) { if (r.target_table === 't_down') return w.addr[String(r.target_uu).toLowerCase()]; var i = w.devs.findIndex(function (d) { return d.kid === r.author_kid; }); return w.devs[i].person_uu; }
function heldSet(S) { var h = {}; S.query('SELECT op_hash FROM cl_op').forEach(function (r) { h[r.op_hash] = 1; }); return h; }
function rowsOfObj(bytes) { var b = new SQL.Database(bytes), out = b.exec('SELECT op_hash, envelope FROM ops')[0]; var r = out ? out.values.map(function (v) { return { hash: v[0], text: v[1] }; }) : []; b.close(); return r; }
function mnames(w, re) { return w.relay._names().filter(function (n) { return re.test(n); }); }
function overlay(base, o) {                                   // a relay the reader sees: bytes replaced, names aliased (moved) or hidden; the reader's own puts go nowhere
  return { id: 'ov', stats: {}, put: async function () { return true; }, get: async function (n) { if (o.bytes && o.bytes[n]) return o.bytes[n]; if (o.alias && o.alias[n]) return base.get(o.alias[n]); return base.get(n); },
    list: async function (p) { var l = (await base.list(p)).filter(function (n) { return !(o.hide || []).includes(n); }); Object.keys(o.alias || {}).forEach(function (a) { if (a.indexOf(p) === 0 && l.indexOf(a) < 0) l.push(a); }); return l.sort(); } };
}

// ───────────────────────────────────────────────────── the arms ─────────────────────────────────────────────────────
async function armA(E, ctx) {
  var w = await std(E, { x2: false, all: [2] }), H = w.S[0], X1 = w.S[1], Y = w.S[2];
  var pop = laned(H), yPerson = w.devs[2].person_uu, foreign = pop.filter(function (r) { return ownerOf(w, r) !== yPerson; }), mineY = pop.filter(function (r) { return ownerOf(w, r) === yPerson && r.author_kid !== w.devs[2].kid; });
  if (!foreign.length) return vacuous('A', 'no laned op of another station to try to read');
  var yh = heldSet(Y), leak = foreign.filter(function (r) { return yh[r.op_hash]; }).length;
  ok('A', leak === 0, 'Y (a modified client that lists and gets every m/ object) opens 0 of the ' + foreign.length + ' laned ops of X', 'leaked=' + leak + ' downloaded_sealed=' + Y.sealed().length);
  ok('A', Y.sealed().length >= foreign.length, 'the attack really happened: Y downloaded all of them (they sit in its cl_sealed, unopened)', 'cl_sealed=' + Y.sealed().length + ' foreign=' + foreign.length);
  ok('A', mineY.length > 0 && mineY.every(function (r) { return yh[r.op_hash]; }), 'Y does open its OWN pair\'s mail (reading works)', 'own DOWN mail=' + mineY.length);
  var allOwn = []; w.S.forEach(function (S) { S.query("SELECT op_hash FROM cl_op WHERE state='OWN' AND target_table IN ('t_up','t_down')").forEach(function (r) { allOwn.push(r.op_hash); }); });
  var hh = heldSet(H); ok('A', allOwn.length > 0 && allOwn.every(function (h) { return hh[h]; }), 'H (hub) opens every laned op ever authored', allOwn.length + ' ops');
  var xh = heldSet(X1), xf = pop.filter(function (r) { return ownerOf(w, r) !== w.devs[1].person_uu; });
  ok('A', xf.length > 0 && xf.every(function (r) { return !xh[r.op_hash]; }) && pop.filter(function (r) { return ownerOf(w, r) === w.devs[1].person_uu; }).every(function (r) { return xh[r.op_hash]; }), 'X opens its own pair\'s mail and none of Y\'s', 'foreign for X=' + xf.length);
  // CONTROL: audience sealing off -> Y opens N of N
  var wc = await std(E, { x2: false, all: [2], holds: false }), Hc = wc.S[0], Yc = wc.S[2], popc = laned(Hc), fc = popc.filter(function (r) { return ownerOf(wc, r) !== wc.devs[2].person_uu; }), yhc = heldSet(Yc), lc = fc.filter(function (r) { return yhc[r.op_hash]; }).length;
  ok('A', fc.length > 0 && lc === fc.length, 'CONTROL: with audience sealing off (space key, as F1) the same Y opens ' + fc.length + ' of ' + fc.length + ' (so the isolation above is the sealing, not the fixture)', 'opened=' + lc + '/' + fc.length);
}

async function armB(E, ctx) {
  var w = await std(E, { x2: false }), H = w.S[0], names = w.relay._names(), raw = 0, objs = 0, found = {};
  for (var n of names) { var b = await w.relay.get(n); objs++; var txt = Buffer.from(b).toString('latin1'); NEEDLES.forEach(function (nd) { if (txt.indexOf(nd) >= 0) { raw++; found[nd] = (found[nd] || 0) + 1; } }); }
  var hv = H.query('SELECT envelope FROM cl_op').map(function (r) { return r.envelope; }).join('\n'), inH = NEEDLES.filter(function (nd) { return hv.indexOf(nd) >= 0; });
  if (inH.length < NEEDLES.length) return vacuous('B', 'H does not hold every needle (' + inH.length + '/' + NEEDLES.length + '): the search would prove nothing');
  ok('B', raw === 0, 'no business value in any of the ' + objs + ' relay objects (' + NEEDLES.length + ' needles)', 'hits=' + raw + ' ' + JSON.stringify(found));
  var plainHits = 0; for (var n2 of names) { var t2 = Buffer.from(await w.relay.get(n2)).toString('latin1'); if (t2.indexOf('Station X') >= 0) plainHits++; }
  ok('B', plainHits > 0, 'CONTROL: the byte search CAN find a value - a plaintext identity value (a person name) is found', 'objects containing it=' + plainHits);
}

function bizKey(w, S, r, env) { var i = w.devs.findIndex(function (d) { return d.kid === r.author_kid; }); return i + '|' + r.op_type + '|' + r.target_uu + '|' + env.ts; }
async function bizMap(w, S) { var L = await S.order(), out = {}, rec = {}, hubPos = {};
  S.query("SELECT op_hash, author_kid, op_type, target_table, target_uu, envelope FROM cl_op WHERE target_table IN ('t_up','t_down','t_note')").forEach(function (r) { var env = JSON.parse(r.envelope), k = bizKey(w, S, r, env), v = L.verdict[r.op_hash]; out[k] = v ? v.verdict + ':' + (v.reason || '') : 'NONE'; hubPos[r.op_hash] = k; });
  L.order.forEach(function (h) { if (hubPos[h]) { var u = hubPos[h].split('|')[2]; (rec[u] = rec[u] || []).push(hubPos[h]); } });
  var parked = Object.keys(L.verdict).filter(function (h) { return L.verdict[h].verdict === 'PARKED'; }).length; return { verdict: out, rec: rec, parked: parked }; }
async function armC(E, ctx) {
  var w = await std(E, { x2: false, det: true }), wb = await std(ctx.Ebase, { x2: false, det: true }), mh = await bizMap(w, w.S[0]), mb = await bizMap(wb, wb.S[0]);
  if (!Object.keys(mb.verdict).length) return vacuous('C', 'the F1 run has no business op');
  ok('C', eq(mh.verdict, mb.verdict) && Object.keys(mh.verdict).length === Object.keys(mb.verdict).length, 'the hub\'s verdict for every business op equals the F1-engine run of the same script', 'ops=' + Object.keys(mb.verdict).length);
  ok('C', eq(sortKeys(mh.rec), sortKeys(mb.rec)), 'the hub\'s per-record order (the order the data dependencies fix) equals the F1 run\'s', 'records=' + Object.keys(mb.rec).length + (eq(sortKeys(mh.rec), sortKeys(mb.rec)) ? '' : ' sut=' + JSON.stringify(mh.rec) + ' f1=' + JSON.stringify(mb.rec)));
  var devMis = 0, held = 0, parked = mh.parked;
  for (var i = 1; i < w.S.length; i++) { var m = await bizMap(w, w.S[i]); parked += m.parked; Object.keys(m.verdict).forEach(function (k) { held++; if (m.verdict[k] !== mb.verdict[k]) devMis++; }); }
  ok('C', held > 0 && devMis === 0, 'every station: each business op it holds has the F1 verdict', 'ops held=' + held + ' differing=' + devMis);
  ok('C', parked === 0, 'nothing is PARKED on any device', 'parked=' + parked);
}

async function wrapAud(key, privDh, pubJwk, space, epoch, from, to, aud) {       // the KEYGRANT wrap, replicated from the protocol (HKDF info = space|epoch|from|to|aud), so the rogue needs no engine internals
  var S = globalThis.crypto.subtle, pub = await S.importKey('jwk', pubJwk, { name: 'ECDH', namedCurve: 'P-256' }, false, []), bits = await S.deriveBits({ name: 'ECDH', public: pub }, privDh, 256);
  var hk = await S.importKey('raw', bits, 'HKDF', false, ['deriveKey']), kek = await S.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: new TextEncoder().encode('bim-comm-keygrant'), info: new TextEncoder().encode(space + '|' + epoch + '|' + from + '|' + to + '|' + aud) }, hk, { name: 'AES-KW', length: 256 }, false, ['wrapKey']);
  return Buffer.from(new Uint8Array(await S.wrapKey('raw', key, kek, 'AES-KW'))).toString('base64'); }

async function armD(E, ctx) {
  // D1: one flipped byte in H's DOWN bundle to X -> a fresh reader of X (keys come from H's grants) counts it tampered and does not ingest the op
  var w = await std(E, { x2: true }), X1 = w.devs[1], xbox = mnames(w, new RegExp('/m/p_' + X1.person_uu + '/o/'))[0];
  if (!xbox) return vacuous('D', 'no m/p_X/ object to tamper');
  var good = await w.relay.get(xbox), bad = new Uint8Array(good), s = Buffer.from(bad).toString('latin1'), a = s.indexOf('enc:'), c = s.indexOf(':', s.indexOf('@', a)), pos = c + 40;
  bad[pos] = String.fromCharCode(bad[pos]) === 'A' ? 66 : 65;
  var rows = rowsOfObj(good), pre = rows.length;
  var clean = w.open(1, {}, new SQL.Database()), r0 = await clean.sync(overlay(w.relay, {}));
  var tam = w.open(1, {}, new SQL.Database()), r1 = await tam.sync(overlay(w.relay, { bytes: (function () { var o = {}; o[xbox] = bad; return o; })() }));
  ok('D', r0.tampered === 0 && laned(clean).length > 0, 'CONTROL: the untouched relay yields no tampering and the reader holds laned mail', 'tampered=' + r0.tampered + ' laned held=' + laned(clean).length);
  ok('D', r1.tampered >= 1 && laned(tam).length < laned(clean).length, 'one flipped byte: counted tampered and the op is not ingested', 'tampered=' + r1.tampered + ' laned held ' + laned(clean).length + ' -> ' + laned(tam).length + ' (bundle rows=' + pre + ')');
  // D2a: the same bundle moved m/p_X -> m/p_Y: Y (fresh, honest) opens 0 of it and keeps it sealed
  var yp = w.devs[2].person_uu, mv = xbox.replace('/m/p_' + X1.person_uu + '/', '/m/p_' + yp + '/'), al = {}; al[mv] = xbox;
  var ys = w.open(2, {}, new SQL.Database()), r2 = await ys.sync(overlay(w.relay, { alias: al })), movedHashes = rows.map(function (r) { return r.hash; }), yh = heldSet(ys);
  ok('D', movedHashes.length > 0 && movedHashes.every(function (h) { return !yh[h]; }) && ys.sealed().some(function (x) { return movedHashes.indexOf(x.op_hash) >= 0; }), 'a bundle moved m/p_X -> m/p_Y: Y opens 0 of its ' + movedHashes.length + ' ops and keeps them sealed', 'sealed kept=' + ys.sealed().filter(function (x) { return movedHashes.indexOf(x.op_hash) >= 0; }).length);
  var xh = heldSet(w.S[1]); ok('D', movedHashes.every(function (h) { return xh[h]; }), 'X\'s own copy (the real m/p_X path) still folds', 'held=' + movedHashes.filter(function (h) { return xh[h]; }).length + '/' + movedHashes.length);
  // D2b: X's UP bundle moved m/hub -> m/p_X: the op says box=hub, so X's 2nd device (who holds the p_X key and COULD open it) refuses it with §COMM_BOX_MISMATCH
  var upn = mnames(w, new RegExp('/m/hub/o/' + X1.kid + '/'))[0];
  if (!upn) return vacuous('D', 'no m/hub/ object of X to move');
  var upRows = rowsOfObj(await w.relay.get(upn)), mv2 = upn.replace('/m/hub/', '/m/p_' + X1.person_uu + '/'), al2 = {}; al2[mv2] = upn;
  var x2 = w.open(3, {}, new SQL.Database()), lg0 = (w.logs[3] || []).length, r3 = await x2.sync(overlay(w.relay, { alias: al2 })), x2h = heldSet(x2), mm = (w.logs[3] || []).slice(lg0).filter(function (l) { return l.indexOf('§COMM_BOX_MISMATCH') >= 0; });
  ok('D', upRows.length > 0 && mm.length >= 1 && upRows.every(function (r) { return !x2h[r.hash]; }), 'an UP bundle moved m/hub -> m/p_X: refused with §COMM_BOX_MISMATCH, not ingested, by a device that holds the key', 'mismatch lines=' + mm.length + ' ops=' + upRows.length + ' ingested=' + upRows.filter(function (r) { return x2h[r.hash]; }).length);
  // D3 (unit, on the engine's own seal/open): an op sealed to p_X, relabelled to p_Z, with the SAME key bytes under p_Z, is refused (the AAD carries the audience)
  var T = E.STORE._t;
  if (!T) ok('D', false, 'AAD unit: the engine exposes no seal/open seam (CommStore._t) - sealing to an audience is not implemented');
  else { var K = await T.newKey(), env = { v: 3, probe: 'AAD' }, sp = 'a'.repeat(64), txt = await T.seal(env, K, 1, sp, 'p_X');
    var okOpen = await T.openText(txt, {}, sp, { p_X: { 1: [{ key: K }] } }), relabel = txt.replace('@p_X:', '@p_Z:'), badOpen = await T.openText(relabel, {}, sp, { p_Z: { 1: [{ key: K }] } });
    ok('D', okOpen.state === 'ok' && badOpen.state === 'tampered', 'AAD unit: the right audience opens; the same ciphertext relabelled to another audience (same key bytes) is refused', 'right=' + okOpen.state + ' relabelled=' + badOpen.state); }
}

async function armE(E, ctx) {
  var realNow = Date.now; await pool(E, 4);
  var devs = POOL.slice(0, 3), sp = await E.STORE.newSpace('rsw-rogue-' + (tmpN++), devs[0], devs[0].person_uu, 'HQ', 102, { plan: 'pos' }), w = { E: E, devs: devs, persons: [devs[1].person_uu, devs[2].person_uu], addr: {}, space: sp.space, SP: 's/' + sp.space + '/', relay: E.PIPE.memPipe('rs'), logs: [], o: {} };
  w.open = function (i, oo) { var S = E.STORE.open(new SQL.Database(), { SQL: SQL, space: sp.space, self: devs[i], access: function () { return { allowed: true }; }, log: function () {} }); S.setMailbox(hostCfg(w, { all: i === 2 })); return S; };
  var H = w.open(0), X1 = w.open(1), Y = w.open(2), X = devs[1].person_uu, YP = devs[2].person_uu;
  await H.genesis(sp.params);
  await H.addPerson({ person_uu: YP, name: 'Station Y', ad_role_id: 200, comm_admin: false }); await H.enroll(devs[2].kid, devs[2].pubJwk, YP, devs[2].dhPubJwk);
  await H.setPolicy({ epoch: 1, visit_ms: 600000 }); await H.sync(w.relay); await Y.sync(w.relay);
  async function rogueGrant(to, key) { var wr = await wrapAud(key, devs[2].dhPrivateKey, to.dhPubJwk, sp.space, 1, devs[2].kid, to.kid, 'p_' + X);
    return Y.author({ target: { table: 'comm_device', uu: await E.ROS.devUU(to.kid) }, refs: [await E.ROS.epochUU(sp.space, 1)], body: { op_type: 'KEYGRANT', params: { kid: to.kid, epoch: 1, from_kid: devs[2].kid, wrapped: wr, aud: 'p_' + X, origin: devs[2].kid } } }); }
  var K1 = await globalThis.crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  var g1 = await rogueGrant(devs[0], K1); await Y.sync(w.relay); await H.sync(w.relay);
  var v1 = (await H.order()).verdict[g1.hash];
  ok('E', !!v1 && v1.verdict === 'REFUSED', 'layer 1: a non-admin station\'s candidate key granted to the hub is refused by the roster', v1 ? v1.verdict + ':' + v1.reason : 'none');
  await H.setRole({ person_uu: YP, comm_admin: true });                                           // the compromised-admin case: the roster WILL accept Y's grant, so only the host's eligibility rule is left
  await H.sync(w.relay); await Y.sync(w.relay);
  var K2 = await globalThis.crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  var g2 = await rogueGrant(devs[0], K2); await rogueGrant(devs[2], K2); await Y.sync(w.relay); await H.sync(w.relay);
  var v2 = (await H.order()).verdict[g2.hash];
  if (!v2 || v2.verdict !== 'MERGED') return vacuous('E', 'the roster did not accept the rogue grant (' + (v2 ? v2.reason : 'none') + ') - the sealer\'s eligibility rule was not exercised');
  await H.addPerson({ person_uu: X, name: 'Station X', ad_role_id: 200, comm_admin: false }); await H.enroll(devs[1].kid, devs[1].pubJwk, X, devs[1].dhPubJwk);
  var dx = uid('rogue-down' + sp.space); w.addr[dx] = X;
  await H.author({ target: { table: 't_down', uu: dx }, intent: 'K2', body: { op_type: 'CRUD_CREATE', params: { fields: fields({ documentno: 'SEALNEEDLE-ROGUE-DOWN' }) } } });
  await H.sync(w.relay); await X1.sync(w.relay); var yrep = await Y.sync(w.relay); await H.sync(w.relay);
  var hold = (await H.keyring()), downs = laned(H).filter(function (r) { return r.target_table === 't_down'; });
  var xh = heldSet(X1), yh = heldSet(Y);
  ok('E', downs.length > 0 && downs.every(function (r) { return xh[r.op_hash]; }), 'X opens H\'s DOWN mail (the legitimate pair works)', 'ops=' + downs.length);
  yh = heldSet(Y);
  ok('E', yrep.fetched >= 1 && Y.sealed().length + yrep.tampered >= downs.length && downs.every(function (r) { return !yh[r.op_hash]; }), 'Y (holding its own candidate key for p_X, accepted by the roster) opens 0 of H\'s DOWN mail to X: H never sealed to it', 'Y received it (fetched=' + yrep.fetched + ' unopened=' + Y.sealed().length + ' refused-by-its-key=' + yrep.tampered + ') opened=' + downs.filter(function (r) { return yh[r.op_hash]; }).length);
}

async function armF(E, ctx) {
  var w = await founding(E, { x2: true }), H = w.S[0], X1 = w.S[1], Y = w.S[2], X2 = w.S[3];
  await traffic(w);
  await H.revoke(w.devs[3].kid, 0); await H.sync(w.relay);
  var R = (await H.order()).roster, rk = R.rekeys.length;
  if (!rk) return vacuous('F', 'no REKEY happened after the revoke - the new-epoch key was not exercised');
  var dx = uid('f-down' + w.space); w.addr[dx] = w.devs[1].person_uu;
  await H.author({ target: { table: 't_down', uu: dx }, intent: 'K2', body: { op_type: 'CRUD_CREATE', params: { fields: fields({ documentno: 'SEALNEEDLE-F-DOWN-1' }) } } });
  var dx2 = uid('f-down2' + w.space); w.addr[dx2] = w.devs[1].person_uu;
  await H.author({ target: { table: 't_down', uu: dx2 }, intent: 'K2', body: { op_type: 'CRUD_CREATE', params: { fields: fields({ documentno: 'SEALNEEDLE-F-DOWN-2' }) } } });
  await H.sync(w.relay); await X1.sync(w.relay); await X2.sync(w.relay); await H.sync(w.relay);
  var after = [dx, dx2], hs = function (S) { var h = {}; S.query('SELECT target_uu FROM cl_op').forEach(function (r) { h[String(r.target_uu).toLowerCase()] = 1; }); return h; };
  var x1h = hs(X1), x2h = hs(X2), epochs = mnames(w, /\/m\/p_/).map(function (n) { return n; });
  var sealed2 = 0; for (var n of epochs) for (var r of rowsOfObj(await w.relay.get(n))) if (/^enc:2@p_/.test(r.text)) sealed2++;
  var Rn = (await H.order()).roster, gr2 = Rn.grants.filter(function (g) { return g.kid === w.devs[3].kid && g.epoch === 2; });
  ok('F', sealed2 >= 2, 'the DOWN mail after the rekey is sealed under epoch 2 and an audience', 'epoch-2 audience-sealed ops on the relay=' + sealed2);
  ok('F', gr2.length === 0, 'no epoch-2 grant (space or pair) was issued to the revoked device', 'grants to revoked at epoch 2=' + gr2.length);
  ok('F', after.every(function (u) { return x1h[u]; }), 'X\'s first device opens all of the post-rekey DOWN mail', after.filter(function (u) { return x1h[u]; }).length + '/' + after.length);
  ok('F', after.every(function (u) { return !x2h[u]; }) && X2.sealed().length >= 2, 'the revoked device opens 0 of it (it downloaded the sealed ops, cl_sealed=' + X2.sealed().length + ')', 'opened=' + after.filter(function (u) { return x2h[u]; }).length);
}

async function armG(E, ctx) {
  async function scene(Ex, withhold) {
    var w = await founding(Ex, { x2: false }), H = w.S[0], X1 = w.S[1], ts = 1700000300000;
    for (var i = 1; i <= 3; i++) { await X1.author({ target: { table: 't_up', uu: uid('g' + i + w.space) }, intent: 'K2', ts: ts++, body: { op_type: 'CRUD_CREATE', params: { fields: fields({ documentno: 'G' + i }) } } }); await X1.sync(w.relay); }
    var names = mnames(w, new RegExp('/m/hub/o/' + w.devs[1].kid + '/')).sort(function (a, b) { return Number(a.split('/').pop().split('-')[0]) - Number(b.split('/').pop().split('-')[0]); });
    var hubR = w.S[0]; var hide = withhold === 'mid' ? [names[1]] : withhold === 'last' ? [names[2]] : [];
    await hubR.sync(overlay(w.relay, { hide: hide })); return { names: names, gaps: hubR.gaps(), rep: hubR, xkid: w.devs[1].kid };
  }
  var none = await scene(E, 'none'), mid = await scene(E, 'mid'), last = await scene(E, 'last');
  if (none.names.length !== 3) return vacuous('G', 'X did not produce three mailbox bundles (' + none.names.length + ')');
  var kid = null;
  ok('G', none.gaps.length === 0, 'CONTROL: nothing withheld -> gaps() = []', JSON.stringify(none.gaps));
  ok('G', mid.gaps.length === 1 && mid.gaps[0].box === 'hub' && mid.gaps[0].seq === 2 && mid.gaps[0].author === mid.xkid, 'the relay withholds X\'s MIDDLE m/hub/ bundle -> gaps() = [{author X, box hub, seq 2}]', JSON.stringify(mid.gaps).slice(0, 160));
  ok('G', last.gaps.length === 1 && last.gaps[0].box === 'hub' && last.gaps[0].seq === 3 && last.gaps[0].author === last.xkid, 'the relay withholds X\'s LAST bundle -> reported from X\'s signed head `boxes`: [{box hub, seq 3}]', JSON.stringify(last.gaps).slice(0, 160));
  var Eb = ctx.Ebase, mb = await (async function () { var w = await founding(Eb, { x2: false }), X1 = w.S[1], ts = 1700000300000;
    for (var i = 1; i <= 3; i++) { await X1.author({ target: { table: 't_up', uu: uid('g' + i + w.space) }, intent: 'K2', ts: ts++, body: { op_type: 'CRUD_CREATE', params: { fields: fields({ documentno: 'G' + i }) } } }); await X1.sync(w.relay); }
    var nm = mnames(w, new RegExp('/m/hub/o/' + w.devs[1].kid + '/')).sort(function (a, b) { return Number(a.split('/').pop().split('-')[0]) - Number(b.split('/').pop().split('-')[0]); });
    var hr = w.S[0]; await hr.sync(overlay(w.relay, { hide: [nm[1]] })); return { n: nm.length, gaps: hr.gaps() }; })();
  ok('G', mb.n === 3 && mb.gaps.length === 0, 'CONTROL (the F1 engine, same withholding): gaps() = [] - the stated F1 limit, shown', 'bundles=' + mb.n + ' gaps=' + JSON.stringify(mb.gaps));
}

async function armH(E, ctx) {
  var w = await founding(E, { x2: false, noAud: true }), H = w.S[0], X1 = w.S[1], ts = 1700000400000, relay = w.relay;
  var uu = uid('h-up' + w.space);
  await X1.author({ target: { table: 't_up', uu: uu }, intent: 'K2', ts: ts++, body: { op_type: 'CRUD_CREATE', params: { fields: fields({ documentno: 'SEALNEEDLE-H-UP' }) } } });
  var l0 = (w.logs[1] || []).length, r1 = await X1.sync(relay), holdLog = (w.logs[1] || []).slice(l0).filter(function (l) { return /§COMM_SEAL .* hold seq=\d+ reason=no-aud-key aud=p_/.test(l); });
  var mNow = mnames(w, /\/m\//).filter(function (n) { return n.indexOf('/o/' + w.devs[1].kid + '/') > 0; });
  ok('H', holdLog.length >= 1 && r1.sent === 0 && mNow.length === 0, 'no pair key yet: the station HOLDS its laned op (§COMM_SEAL hold ... reason=no-aud-key), sends nothing, puts nothing on the relay', 'hold lines=' + holdLog.length + ' sent=' + r1.sent + ' own mailbox objects=' + mNow.length);
  var leak0 = 0; for (var n of relay._names()) { if (Buffer.from(await relay.get(n)).toString('latin1').indexOf('SEALNEEDLE-H-UP') >= 0) leak0++; }
  ok('H', leak0 === 0, 'the held op is nowhere on the relay (not under the space key, not plaintext)', 'objects containing it=' + leak0);
  await H.sync(relay); var r2 = await X1.sync(relay), mAfter = mnames(w, /\/m\/hub\/o\//).filter(function (n) { return n.indexOf('/o/' + w.devs[1].kid + '/') > 0; });
  var texts = []; for (var n2 of mAfter) rowsOfObj(await relay.get(n2)).forEach(function (r) { texts.push(r.text); });
  ok('H', r2.sent >= 1 && mAfter.length >= 1 && texts.length >= 1 && texts.every(function (t) { return t.indexOf('enc:1@p_' + w.devs[1].person_uu + ':') === 0; }), 'after the hub\'s grant the op is sent, and every row is sealed to the pair (enc:1@p_X:...)', 'sent=' + r2.sent + ' objects=' + mAfter.length + ' rows=' + texts.length + ' prefixes=' + texts.map(function (t) { return t.slice(0, 8); }).join(','));
  await H.sync(relay); var hh = heldSet(H); ok('H', !!hh[X1.query("SELECT op_hash FROM cl_op WHERE target_uu=?", [uu])[0].op_hash], 'the hub reads it (the pair key is shared with the hub)');
}

async function shape(w) { var out = {}, H = w.S[0], idx = {}; w.devs.forEach(function (d, i) { idx[d.kid] = i; });
  for (var n of w.relay._names().filter(function (x) { return !/\/h\//.test(x); })) { var b = await w.relay.get(n), nm = n.replace(w.SP, '').replace(/\.[0-9a-f]{12}\.bimpack$/, '').replace(/[0-9a-f]{64}/g, function (k) { return idx[k] !== undefined ? 'd' + idx[k] : k; });
    out[nm] = (await H.readBundle(b)).map(function (r) { return r.env ? r.env.body.op_type + ':' + r.env.target.table + ':' + r.env.seq + (r.env.box ? ':BOX' : '') : 'sealed'; }).join(','); } return out; }
async function armI(E, ctx) {
  async function same(label, plan, flag) {
    var a = await founding(E, { plan: plan, flag: flag, det: true }), b = await founding(ctx.Ebase, { plan: plan, flag: flag, det: true });
    await traffic(a); await traffic(b);
    var sa = await shape(a), sb = await shape(b), mobj = Object.keys(sa).filter(function (x) { return /^m\//.test(x); }).length, boxes = JSON.stringify(sa).indexOf(':BOX'), headBox = 0;
    for (var n of a.relay._names().filter(function (x) { return /\/h\//.test(x); })) if (JSON.parse(Buffer.from(await a.relay.get(n)).toString('utf8')).boxes !== undefined) headBox++;
    if (!Object.keys(sb).length) return vacuous('I', label);
    ok('I', eq(Object.keys(sa), Object.keys(sb)) && eq(sa, sb) && mobj === 0 && boxes < 0 && headBox === 0, label, 'objects=' + Object.keys(sb).length + ' m/=' + mobj + ' box fields=' + (boxes < 0 ? 0 : '>0') + ' heads with boxes=' + headBox + ' shapes equal=' + eq(sa, sb)); }
  await same('office mesh: relay shape equals the F1 engine\'s; no m/ object, no `box`, no head `boxes`', 'office', undefined);
  await same('a pre-F1 POS genesis (no `mailboxes`): relay shape equals the F1 engine\'s; no m/ object, no `box`, no head `boxes`', 'pos', false);
  var wm = await std(E, { x2: false }), hb = 0, hn = 0; for (var n2 of wm.relay._names().filter(function (x) { return /\/h\//.test(x); })) { hn++; if (JSON.parse(Buffer.from(await wm.relay.get(n2)).toString('utf8')).boxes !== undefined) hb++; }
  var env0 = laned(wm.S[0]).map(function (r) { return JSON.parse(wm.S[0].query('SELECT envelope FROM cl_op WHERE op_hash=?', [r.op_hash])[0].envelope); });
  ok('I', hn > 0 && hb === hn && env0.length > 0 && env0.every(function (e) { return e.box && Number.isInteger(e.box.seq) && typeof e.box.name === 'string'; }), 'a mailbox space DOES carry them: every laned envelope has a signed `box`, every head has `boxes`', 'heads=' + hb + '/' + hn + ' laned envelopes with box=' + env0.filter(function (e) { return e.box; }).length + '/' + env0.length);
}

async function armJ(E, ctx) {
  async function snap(holds) {
    var w = await founding(E, { x2: false, holds: holds }); await traffic(w);
    var H = w.S[0], c = await H.checkpoint(w.relay, {});
    if (!c || c.skipped) return { skipped: c ? c.skipped : 'none' };
    var Y = w.open(2, {}, new SQL.Database()), rep = await Y.sync(w.relay), yh = heldSet(Y);
    var inSnap = rowsOfObj(await w.relay.get(c.name)), inHash = {}; inSnap.forEach(function (r) { inHash[r.hash] = 1; });
    var foreign = laned(H).filter(function (r) { return ownerOf(w, r) !== w.devs[2].person_uu && inHash[r.op_hash]; });
    var note = H.query("SELECT op_hash FROM cl_op WHERE target_table='t_note'")[0];
    return { c: c, foreign: foreign, leak: foreign.filter(function (r) { return yh[r.op_hash]; }).length, sealedY: Y.sealed().length, noteOpen: !!yh[note.op_hash], rows: inSnap.length, state: stateView(Y, foreign) };
  }
  // G5 (§49.1): the snapshot STATE (verdicts + order + record ids), as Y holds it after sync, must carry no laned-op detail. stateView = what Y can read of it with the team key (+ its own pair key).
  function stateView(Y, foreign) { var rows = Y.query('SELECT state_json FROM cl_snapmeta'), txt = rows.map(function (r) { return String(r.state_json); }).join('\n'), opened = rows.filter(function (r) { return /^\s*\{/.test(String(r.state_json)); }).length;
    return { rows: rows.length, opened: opened, hashHits: foreign.filter(function (r) { return txt.indexOf(r.op_hash) >= 0; }).length, uuHits: foreign.filter(function (r) { return txt.toLowerCase().indexOf(String(r.target_uu).toLowerCase()) >= 0; }).length }; }
  var s = await snap(true), sc = await snap(false);
  if (s.skipped) return vacuous('J', 'the hub did not build a snapshot (' + s.skipped + ')');
  ok('J', s.foreign.length > 0 && s.leak === 0 && s.sealedY >= s.foreign.length, 'Y (space key only) opens 0 of the ' + s.foreign.length + ' laned ops of others that the snapshot carries (' + s.rows + ' ops in it)', 'leaked=' + s.leak + ' kept sealed=' + s.sealedY);
  ok('J', s.noteOpen, 'Y still opens the unaddressed (space-key) op (the snapshot does not lock everything)', 'note opened=' + s.noteOpen);
  ok('J', s.state.hashHits === 0 && s.state.uuHits === 0 && s.foreign.length > 0, 'G5: the snapshot STATE (' + s.state.rows + ' state row(s) fetched, ' + s.state.opened + ' readable with the team key) names 0 of the ' + s.foreign.length + ' laned op ids and 0 of their record ids', 'op ids in state=' + s.state.hashHits + ' record ids in state=' + s.state.uuHits);
  if (sc.skipped || !sc.state.opened) vacuous('J', 'G5 CONTROL: no readable state without audience sealing (' + (sc.skipped || 'state not opened') + ')'); else ok('J', sc.state.hashHits === sc.foreign.length, 'G5 CONTROL: without audience sealing the same STATE lists ' + sc.state.hashHits + ' of ' + sc.foreign.length + ' laned op ids (the check can find them)', 'op ids in state=' + sc.state.hashHits);
  if (sc.skipped) vacuous('J', 'CONTROL snapshot skipped (' + sc.skipped + ')'); else ok('J', sc.foreign.length > 0 && sc.leak === sc.foreign.length, 'CONTROL: without audience sealing the same snapshot opens ' + sc.foreign.length + ' of ' + sc.foreign.length + ' for Y', 'opened=' + sc.leak);
}

var ARMFN = { A: armA, B: armB, C: armC, D: armD, E: armE, F: armF, G: armG, H: armH, I: armI, J: armJ };

(async function main() {
  SQL = await initSqlJs();
  var baseDir = baseline();
  console.log('§RS-HEADER W-READ-SCOPE tree=' + TREE + ' base=' + BASE_COMMIT + ' node=' + process.version + ' at=' + new Date().toISOString());
  if (!baseDir) { console.log('§RS_SCOPE_VERDICT INCONCLUSIVE - cannot extract the F1 baseline engine (git archive ' + BASE_COMMIT + ')'); process.exit(2); }
  var Ebase = load(copyComm(baseDir).dir), sut = copyComm(path.join(TREE, 'common/comm')), Esut = load(sut.dir), ctx = { Ebase: Ebase };
  async function runArms(E, arms) { for (var a of arms) { try { await ARMFN[a](E, ctx); } catch (e) { if (C.print) console.log('   FAIL §RS-' + a + ' CRASHED: ' + (e && e.stack || e)); slot(a).fail++; C.fails++; C.judged++; slot(a).crash = (e && e.message) || String(e); } } }
  var arms = ONLY.length ? ONLY : ALL_ARMS;
  C = newC(true); await runArms(Esut, arms);
  arms.forEach(function (a) { var s = C.arms[a]; if (!s || (s.pass + s.fail === 0)) { if (!s || !s.inc) { vacuous(a, 'arm ' + a + ' judged nothing'); } } });
  var product = C; var realFails = product.fails;

  var MUT = [
    { id: 'M1', what: 'laned ops sealed with the space key', file: 'comm_store.js', needle: "enc[r.op_hash] = await _seal(JSON.parse(r.envelope), ak, ep, space, au); }", repl: "enc[r.op_hash] = await _seal(JSON.parse(r.envelope), ring[ep][0], ep, space); }", expect: ['A', 'J'] },
    { id: 'M2', what: 'pair key granted to every device', file: 'comm_store.js', needle: "function eligForGrant(aud, kid, R) { return holdsOf(aud, kid, R); }", repl: "function eligForGrant(aud, kid, R) { return true; }", expect: ['A', 'E'] },
    { id: 'M3', what: 'the sealer accepts an ineligible origin', file: 'comm_store.js', needle: "function eligForSeal(aud, origin, R) { return holdsOf(aud, origin, R); }", repl: "function eligForSeal(aud, origin, R) { return true; }", expect: ['E'] },
    { id: 'M4', what: 'AAD without the audience', file: 'comm_store.js', needle: "'|' + epoch + (aud ? '|' + aud : '')", repl: "'|' + epoch + ''", expect: ['D'] },
    { id: 'M5', what: 'no `box` in the envelope', file: 'comm_store.js', needle: "if (box) env.box = box;", repl: "if (false) env.box = box;", expect: ['G', 'I'] },
    { id: 'M6', what: 'the signed head without `boxes`', file: 'comm_store.js', needle: "if (mbFlag) { var bx = {};", repl: "if (false) { var bx = {};", expect: ['G', 'I'] },
    { id: 'M7', what: 'a box mismatch is ingested', file: 'comm_store.js', needle: "if (env.box && env.box.name !== bn) {", repl: "if (false) {", expect: ['D'] },
    { id: 'M8', what: 'the revoked device is granted the new epoch\'s key', file: 'comm_store.js', needle: ".filter(function (k) { return R.revokes[k] == null && R.devices[k].dh; });", repl: ".filter(function (k) { return R.devices[k].dh; });", expect: ['F'] },
    { id: 'M9', what: 'a laned op with no audience key is sent under the space key', file: 'comm_store.js', needle: "if (!ak) { log('§COMM_SEAL kid=' + self.kid + ' hold seq=' + r.author_seq + ' reason=no-aud-key aud=' + au); break; }", repl: "if (!ak) { ak = ring[ep][0]; au = null; }", expect: ['H'] },
    { id: 'M10', what: 'G5: the snapshot state is sealed with the team key and carries the laned detail', file: 'comm_store.js', needle: "if (!aOnC) pk.run('INSERT INTO meta VALUES (?,?)', ['state', stText]);", repl: "if (true) pk.run('INSERT INTO meta VALUES (?,?)', ['state', stText]);", expect: ['J'] }
  ];
  var killed = 0, bad = 0;
  if (NOMUT || ONLY.length) console.log('\n§RS-MUTANTS skipped'); else {
    console.log('\n════ mutants ════');
    for (var m of MUT) {
      var cm = copyComm(path.join(TREE, 'common/comm'), { file: m.file, needle: m.needle, repl: m.repl });
      console.log('   §RS-MUT ' + m.id + ' "' + m.what + '" needle_count=' + cm.applied);
      if (cm.applied !== 1) { bad++; console.log('   INCONCLUSIVE §RS-MUT ' + m.id + ' NOT APPLIED EXACTLY ONCE (count ' + cm.applied + ')'); continue; }
      var E2 = load(cm.dir); C = newC(false); var crashed = null;
      try { for (var a of m.expect) { try { await ARMFN[a](E2, ctx); } catch (e) { crashed = (e && e.message) || String(e); if (C.arms[a]) C.arms[a].crash = crashed; } } } catch (e2) { crashed = String(e2); }
      var hit = m.expect.filter(function (a) { return C.arms[a] && C.arms[a].fail > 0 && !C.arms[a].crash; }), onlyCrash = m.expect.filter(function (a) { return C.arms[a] && C.arms[a].crash; });
      if (!hit.length) { bad++; console.log('   ' + (onlyCrash.length ? 'INCONCLUSIVE' : 'FAIL') + ' §RS-MUT ' + m.id + (onlyCrash.length ? ' CRASHED (not a kill): ' + crashed : ' SURVIVED (no arm went red)') + '  (designed to hit ' + m.expect.join(',') + ')'); }
      else { killed++; console.log('   PASS §RS-MUT ' + m.id + ' KILLED by arm(s) ' + hit.join(',') + '  (designed to hit ' + m.expect.join(',') + ')'); }
    }
    console.log('§RS_MUTANTS killed=' + killed + '/' + MUT.length + ' not_killed=' + bad);
  }
  C = product;
  var armsOut = {}; Object.keys(product.arms).forEach(function (a) { armsOut[a] = { pass: product.arms[a].pass, fail: product.arms[a].fail, inc: product.arms[a].inc }; });
  console.log('\n§RS-ARMS ' + JSON.stringify(armsOut));
  var mutBad = !(NOMUT || ONLY.length) && killed !== MUT.length, v = (product.fails || mutBad) ? 'FAIL' : (product.inc || !product.judged) ? 'INCONCLUSIVE' : 'PASS';
  console.log('§RS_SCOPE_VERDICT ' + v + ' judged=' + product.judged + ' fails=' + product.fails + ' inconclusive=' + product.inc + ' mutants=' + ((NOMUT || ONLY.length) ? 'skipped' : killed + '/' + MUT.length));
  process.exit(v === 'PASS' ? 0 : v === 'FAIL' ? 1 : 2);
})().catch(function (e) { console.log('§RS_SCOPE_VERDICT INCONCLUSIVE - witness crashed: ' + (e && e.stack || e)); process.exit(2); });
