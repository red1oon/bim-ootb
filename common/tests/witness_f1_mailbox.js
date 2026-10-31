#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
/* ⚠ DO NOT REMOVE — Scope: W-F1-MAILBOX, bim-compiler prompts/TEAMWORK_FRAMEWORK.md §45.8 (F1 per-device mailboxes at the relay). READ THE LOG after every run — the exit code is not evidence.
 * THE ISSUE: §45.5 measured an edge's Visit #1 download growing linearly in N (every device lists and downloads every other device's bundle, then refuses ~99% of it). F1 writes an envelope under its
 * addressee's mailbox (s/<space>/m/<box>/o/<author>/…; UP -> `hub`, DOWN -> `p_<person>`), each device lists only its own mailbox; the relay stays a dumb store of paths. REAL engine (common/comm) + real WebCrypto
 * + real sql.js on an in-memory relay; the host (plan knowledge) is a stub that supplies the three callbacks the ERP adapter supplies. The adapter + 100/1000-station numbers are W-SCALE-STAR (scripts/witness_scale_star.js).
 *   A  flat bytes      the SAME station's fresh Visit at N=3,6,12: objects fetched and mailbox+head bytes are flat in N. CONTROL: the pre-F1 engine (commit c23e28cf): objects grow with N.
 *   B  convergence     the verdict of every op a device holds equals the flag-off verdict of the same op; each device's order is a subsequence of the hub's; hub verdicts equal flag-off verdicts.
 *   C  office mesh     an office space (no plan): no m/ object, bundle names and op hashes equal the pre-F1 engine's (same keys, same founding params).
 *   D  identity        no identity op is ever under m/; every device folds the same roster/policy as the hub.
 *   E  isolation       every op under m/p_X/ is addressed to X; station Y never GETs an m/p_X object. CONTROL: pre-F1, Y downloads X's DOWN envelope.
 *   F  pre-F1 space    a genesis without `mailboxes` on the NEW engine yields the pre-F1 engine's names and op hashes (mailbox cfg installed but the gate is closed).
 *   G  ACK trail       the hub's DOWN op turns SEEN by its addressee; a station's UP op turns SEEN by the hub (the seq holes do not block SEEN).
 *   I  relay gate      the write gate accepts s/<space>/m/<box>/o/<author>/…; CONTROL: the pre-F1 gate refuses it.
 *   H  mutants         each is a source replacement of the engine (needle count printed, 0 = NOT APPLIED = INCONCLUSIVE); each must turn >= 1 arm red; a crashing mutant is NOT a kill.
 * Verdict: §F1-VERDICT PASS | FAIL | INCONCLUSIVE.   Run: node common/tests/witness_f1_mailbox.js [bim-ootb dir] [--no-mut] | tee build/scriptor/f1_mailboxes/witness_f1_mailbox.log */
'use strict';
if (typeof globalThis.crypto === 'undefined' || !globalThis.crypto.subtle) globalThis.crypto = require('crypto').webcrypto;
var path = require('path'), fs = require('fs'), os = require('os'), cp = require('child_process'), nodeCrypto = require('crypto');
var ARGS = process.argv.slice(2), NOMUT = ARGS.indexOf('--no-mut') >= 0, POS = ARGS.filter(function (a) { return !/^--/.test(a); });
var TREE = path.resolve(POS[0] || path.join(__dirname, '..', '..')), BASE_COMMIT = 'c23e28cf';
var SQLJS = process.env.SQLJS_DIR || (fs.existsSync(path.join(TREE, 'tests/node_modules/sql.js')) ? path.join(TREE, 'tests/node_modules/sql.js') : '/home/red1/bim-ootb/tests/node_modules/sql.js');
var initSqlJs = require(SQLJS);

var fails = 0, judged = 0, inconcl = 0, arms = {};
function ok(arm, cond, label, detail) { judged++; arms[arm] = arms[arm] || { pass: 0, fail: 0 }; if (cond) arms[arm].pass++; else { arms[arm].fail++; fails++; }
  console.log('   ' + (cond ? 'PASS' : 'FAIL') + ' §F1-' + arm + ' ' + label + (detail ? ' - ' + detail : '')); return cond; }
function vacuous(arm, label) { inconcl++; console.log('   INCONCLUSIVE §F1-' + arm + ' ' + label + ' (nothing was judged)'); }

// ── engines: the tree under test, the pre-F1 engine (git archive of BASE_COMMIT), and mutants (source replacement into a temp copy) ──
var tmpN = 0;
function copyComm(srcDir, mut) {
  var d = fs.mkdtempSync(path.join(os.tmpdir(), 'f1w_' + (tmpN++) + '_')), applied = 0;
  fs.readdirSync(srcDir).filter(function (f) { return /\.js$/.test(f); }).forEach(function (f) { var s = fs.readFileSync(path.join(srcDir, f), 'utf8');
    if (mut && mut.file === f) { var parts = s.split(mut.needle); applied = parts.length - 1; s = parts.join(mut.repl); } fs.writeFileSync(path.join(d, f), s); });
  return { dir: d, applied: applied };
}
function load(dir) { ['CommEnvelope', 'CommOrder', 'CommRoster', 'CommAdmit', 'CommStore', 'CommPipe'].forEach(function (n) { delete globalThis[n]; });
  return { ENV: require(path.join(dir, 'comm_envelope.js')), STORE: require(path.join(dir, 'comm_store.js')), ROS: require(path.join(dir, 'comm_roster.js')), PIPE: require(path.join(dir, 'comm_pipe.js')) }; }
function baseline() { var d = fs.mkdtempSync(path.join(os.tmpdir(), 'f1base_'));
  var r = cp.spawnSync('sh', ['-c', 'git -C "' + TREE + '" archive ' + BASE_COMMIT + ' common/comm | tar -x -C "' + d + '"'], { encoding: 'utf8' });
  if (r.status !== 0 || !fs.existsSync(path.join(d, 'common/comm/comm_store.js'))) return null; return path.join(d, 'common/comm'); }

// ── the relay: an in-memory pipe that records every GET by name ──
function countingPipe(E, getLog) { var base = E.PIPE.memPipe('f1'), p = Object.assign({}, base);
  p.get = async function (n) { var b = await base.get(n); if (b && getLog) getLog.push({ name: n, bytes: b.length }); return b; }; p._base = base; return p; }

// ── the host stub: what the ERP adapter supplies (plan knowledge). hub role 102, station role 200; UP table t_up -> hub, DOWN table t_down -> the addressee's box ──
function host(w, kind) {
  return { laneOf: function (spec) { var t = spec.target.table; if (kind === 'allhub') return 'hub'; if (t === 't_up') return 'hub'; if (t === 't_down') { var a = w.addr[String(spec.target.uu).toLowerCase()]; return a ? 'p_' + a : null; } return null; },
    read: function (c) { var d = c.roster.devices[c.self.kid]; if (!d) return []; var role = c.roster.roleAt(c.self.kid, Infinity).ad_role_id; return kind === 'allboxes' ? ['hub'].concat(w.persons.map(function (p) { return 'p_' + p; })) : role === 102 ? ['hub'] : ['p_' + d.person]; },
    wantHead: function (kid, c) { if (kind === 'allheads') return true; var d = c.roster.devices[kid], me = c.roster.devices[c.self.kid]; if (!d) return false; return c.roster.roleAt(kid, Infinity).ad_role_id === 102 || (!!me && d.person === me.person) || c.roster.roleAt(c.self.kid, Infinity).ad_role_id === 102; } };
}

var SQL, POOL = [];
function uid(s) { var h = nodeCrypto.createHash('sha1').update(s).digest('hex'); return h.slice(0, 8) + '-' + h.slice(8, 12) + '-4' + h.slice(13, 16) + '-8' + h.slice(17, 20) + '-' + h.slice(20, 32); }
function fields(extra) { return Object.assign({ ad_client_id: 11, ad_org_id: 0 }, extra || {}); }
async function pool(E, n) { while (POOL.length < n) { var d = await E.STORE.newDevice(); d.person_uu = nodeCrypto.randomUUID(); POOL.push(d); } }
var PARAMS = {};   // founding params per (poolSize|plan): reused across engines so the space id and every op hash are equal (deterministic arms F, C)

// world(E, o): o = { N, plan:'pos'|'office', flag:true|false (genesis `mailboxes`), cfg: host kind | null, det: deterministic clock }.
async function world(E, o) {
  var clock = 1700000000000, realNow = Date.now; if (o.det) Date.now = function () { return clock++; };
  try {
    await pool(E, o.N + 1);
    var devs = POOL.slice(0, o.N + 1), key = o.N + '|' + o.plan + '|' + String(o.flag), sp;
    if (!PARAMS[key]) { var nso = o.plan === 'pos' ? { plan: 'pos' } : undefined; if (nso && o.flag === false) nso.mailboxes = false;
      sp = await E.STORE.newSpace('f1w', devs[0], devs[0].person_uu, 'HQ', 102, nso); PARAMS[key] = sp; } sp = PARAMS[key];
    var w = { E: E, N: o.N, devs: devs, persons: devs.map(function (d) { return d.person_uu; }), addr: {}, space: sp.space, getLog: [], relay: null, S: [], SP: 's/' + sp.space + '/' };
    w.relay = countingPipe(E, null);
    function open(d, db) { var S = E.STORE.open(db || new SQL.Database(), { SQL: SQL, space: sp.space, self: d, access: function () { return { allowed: true }; }, log: function () {} });
      if (o.cfg && typeof S.setMailbox === 'function') S.setMailbox(host(w, o.cfg)); return S; }
    w.open = open;
    w.S = devs.map(function (d) { return open(d); });
    var H = w.S[0]; await H.genesis(sp.params);
    for (var i = 1; i <= o.N; i++) { await H.addPerson({ person_uu: devs[i].person_uu, name: 'S' + i, ad_role_id: 200, comm_admin: false }); await H.enroll(devs[i].kid, devs[i].pubJwk, devs[i].person_uu, devs[i].dhPubJwk); }
    await H.setPolicy({ epoch: 1, visit_ms: 600000 });
    await H.sync(w.relay);
    for (i = 1; i <= o.N; i++) await w.S[i].sync(w.relay);                       // each station takes the roster
    var ts = 1700000100000;
    for (i = 1; i <= o.N; i++) { var uu = uid('up' + i + o.N);
      var b = await w.S[i].author({ target: { table: 't_up', uu: uu }, intent: 'K2', ts: ts++, body: { op_type: 'CRUD_CREATE', params: { fields: fields({ documentno: 'T' + i, amt: 10 }) } } });
      await w.S[i].author({ target: { table: 't_up', uu: uu }, intent: 'K2', ts: ts++, body: { op_type: 'CRUD_UPDATE', params: { changes: { amt: { old: 10, new: 11 } } } } });
      await w.S[i].sync(w.relay); }
    await H.sync(w.relay);                                                         // the hub collects every UP
    var nu = uid('note' + o.N);
    await H.author({ target: { table: 't_note', uu: nu }, intent: 'K2', ts: ts++, body: { op_type: 'CRUD_CREATE', params: { fields: fields({ name: 'for everyone' }) } } });   // no addressee: stays in the shared stream
    for (i = 1; i <= o.N; i++) { var du = uid('down' + i + o.N);
      w.addr[du] = devs[i].person_uu; await H.author({ target: { table: 't_down', uu: du }, intent: 'K2', ts: ts++, body: { op_type: 'CRUD_CREATE', params: { fields: fields({ documentno: 'R' + i }) } } }); }
    await H.sync(w.relay);
    for (i = 1; i <= o.N; i++) await w.S[i].sync(w.relay);                       // each station collects what is its own
    await H.sync(w.relay);                                                         // the hub reads their heads (the ACK trail)
    return w;
  } finally { Date.now = realNow; }
}

// a re-install of station 1 (same identity, empty database) = the Visit #1 of the measured edge
async function visit1(w, idx) {
  var log = [], pipe = countingPipe(w.E, log); pipe._base = w.relay._base; pipe.get = async function (n) { var b = await w.relay._base.get(n); if (b) log.push({ name: n, bytes: b.length }); return b; };
  pipe.list = function (p) { return w.relay._base.list(p); }; pipe.put = function (n, b) { return w.relay._base.put(n, b); };
  var S = w.open(w.devs[idx]); var t0 = Date.now(); await S.sync(pipe);
  var cls = { o: 0, m: 0, h: 0, objs: log.length, bytes: 0 }; log.forEach(function (g) { var k = g.name.split('/')[2]; cls[k] = (cls[k] || 0) + g.bytes; cls.bytes += g.bytes; });
  return { S: S, log: log, cls: cls, ms: Date.now() - t0 };
}
function names(w) { return w.relay._base._names().filter(function (n) { return !/\/h\//.test(n); }); }

// the SHAPE of the relay: object name (kid -> pool index, hash suffix dropped) -> the ops inside as type:table:seq. (Key grants are random, so op hashes differ run to run; the shape does not.)
async function hashLists(w) { var out = {}, H = w.S[0], idx = {}; w.devs.forEach(function (d, i) { idx[d.kid] = i; });
  for (var n of names(w)) { var b = await w.relay._base.get(n), nm = n.replace(w.SP, '').replace(/\.[0-9a-f]{12}\.bimpack$/, '').replace(/[0-9a-f]{64}/g, function (k) { return idx[k] !== undefined ? 'd' + idx[k] : k; });
    out[nm] = (await H.readBundle(b)).map(function (r) { return r.env ? r.env.body.op_type + ':' + r.env.target.table + ':' + r.env.seq : 'sealed'; }).join(','); } return out; }
function eq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
async function verdictMap(S) { var L = await S.order(), by = {}, rows = S.query('SELECT op_hash, author_kid, author_seq FROM cl_op'); rows.forEach(function (r) { var v = L.verdict[r.op_hash]; by[r.author_kid.slice(0, 8) + '#' + r.author_seq] = v ? v.verdict + ':' + (v.reason || '') : 'NONE'; }); return by; }

// ── the arms for ONE engine ("sut") against the pre-F1 engine ("base"); returns a summary used to judge mutants ──
async function arms_(label, Esut, Ebase, tag) {
  var before = fails; console.log('\n════ ' + label + ' ════');
  var res = {};
  // A: flat bytes at N = 3, 6, 12 (flag on) vs the pre-F1 engine
  var rowsOn = [], rowsOff = [];
  for (var N of [3, 6, 12]) {
    var wOn = await world(Esut, { N: N, plan: 'pos', cfg: 'ok' }), vOn = await visit1(wOn, 1);
    var wOff = await world(Ebase, { N: N, plan: 'pos', cfg: 'ok' }), vOff = await visit1(wOff, 1);
    rowsOn.push({ N: N, c: vOn.cls }); rowsOff.push({ N: N, c: vOff.cls });
    console.log('   §F1-A-POINT N=' + N + ' F1: objs=' + vOn.cls.objs + ' bytes=' + vOn.cls.bytes + ' (o=' + vOn.cls.o + ' m=' + (vOn.cls.m || 0) + ' h=' + vOn.cls.h + ')   pre-F1: objs=' + vOff.cls.objs + ' bytes=' + vOff.cls.bytes + ' (o=' + vOff.cls.o + ' h=' + vOff.cls.h + ')');
    if (N === 12) res.w12 = wOn, res.v12 = vOn, res.wOff12 = wOff, res.vOff12 = vOff;
  }
  var on3 = rowsOn[0].c, on12 = rowsOn[2].c, off3 = rowsOff[0].c, off12 = rowsOff[2].c;
  if (!on3.objs) vacuous('A', 'the measured edge fetched nothing'); else {
    ok('A', on12.objs === on3.objs, 'objects fetched in a fresh Visit are flat in N (3 -> 12)', on3.objs + ' -> ' + on12.objs);
    ok('A', ((on12.m || 0) + on12.h) <= ((on3.m || 0) + on3.h) * 1.15 + 50, 'mailbox + head bytes flat in N', ((on3.m || 0) + on3.h) + ' -> ' + ((on12.m || 0) + on12.h));
    ok('A', off12.objs > off3.objs * 1.8, 'CONTROL pre-F1: the same measure GROWS with N (so the flat arm is not vacuous)', off3.objs + ' -> ' + off12.objs + ' objects, ' + off3.bytes + ' -> ' + off12.bytes + ' bytes');
    ok('A', on12.bytes < off12.bytes, 'F1 downloads fewer bytes than pre-F1 at N=12', on12.bytes + ' < ' + off12.bytes);
    console.log('   §F1-A-SLOPE roster/shared (o/) bytes N=3 ' + on3.o + ' -> N=12 ' + on12.o + ' (identity ops reach everyone: the stated floor)'); }
  res.A = { on: rowsOn, off: rowsOff };

  // E: isolation, on the N=12 world
  var w = res.w12, H = w.S[0], leak = 0, boxes = 0, pop = 0;
  for (var n of names(w).filter(function (x) { return /\/m\/p_/.test(x); })) { boxes++; var X = n.split('/')[3].slice(2);
    for (var r of await H.readBundle(await w.relay._base.get(n))) { pop++; if (!r.env) continue; var a = w.addr[String(r.env.target.uu).toLowerCase()]; if (a !== X) leak++; } }
  if (!pop) vacuous('E', 'no mailbox object to judge'); else ok('E', leak === 0, 'every op under m/p_X/ is addressed to X', 'objects=' + boxes + ' ops=' + pop + ' foreign=' + leak);
  var got1 = res.v12.log.map(function (g) { return g.name; }), foreign = got1.filter(function (g) { var m = /\/m\/p_([^/]+)\//.exec(g); return m && m[1] !== w.devs[1].person_uu; }), hubBox = got1.filter(function (g) { return /\/m\/hub\//.test(g); });
  ok('E', foreign.length === 0 && hubBox.length === 0 && got1.length > 0, 'station 1 never GETs another station\'s mailbox nor the hub inbox', 'gets=' + got1.length + ' foreign=' + foreign.length + ' hub=' + hubBox.length);
  var otherDown = Object.keys(res.wOff12.addr).filter(function (u) { return res.wOff12.addr[u] !== res.wOff12.devs[1].person_uu; }), heldOff = res.vOff12.S.query('SELECT target_uu FROM cl_op').map(function (r) { return String(r.target_uu).toLowerCase(); });
  ok('E', otherDown.some(function (u) { return heldOff.indexOf(u) >= 0; }), 'CONTROL pre-F1: station 1 DID download another station\'s DOWN envelope', 'foreign DOWN ops held=' + otherDown.filter(function (u) { return heldOff.indexOf(u) >= 0; }).length);
  var heldOn = res.v12.S.query('SELECT target_uu FROM cl_op').map(function (r) { return String(r.target_uu).toLowerCase(); });
  ok('E', !otherDown.some(function (u) { return heldOn.indexOf(u) >= 0; }) && Object.keys(w.addr).filter(function (u) { return w.addr[u] === w.devs[1].person_uu && heldOn.indexOf(u) >= 0; }).length === 1, 'station 1 holds exactly its own DOWN op and no other', 'own=1 foreign=' + otherDown.filter(function (u) { return heldOn.indexOf(u) >= 0; }).length);

  // D: identity never under m/, same roster everywhere
  var idUnderM = 0, mOps = 0; for (var n2 of names(w).filter(function (x) { return /\/m\//.test(x); })) for (var r2 of await H.readBundle(await w.relay._base.get(n2))) { mOps++; if (r2.env && Esut.ROS.IDENTITY[r2.env.body.op_type]) idUnderM++; }
  if (!mOps) vacuous('D', 'no mailbox op to judge'); else ok('D', idUnderM === 0, 'no identity op under m/', 'mailbox ops=' + mOps + ' identity=' + idUnderM);
  var hr = (await H.order()).roster, same = 0, allDev = 0; for (var i = 1; i <= 12; i++) { allDev++; var rr = (await w.S[i].order()).roster;
    if (eq(Object.keys(rr.devices).sort(), Object.keys(hr.devices).sort()) && eq(rr.policy && rr.policy.params, hr.policy && hr.policy.params) && eq(Object.keys(rr.persons).sort(), Object.keys(hr.persons).sort())) same++; }
  ok('D', same === allDev && !!hr.policy, 'every station folds the hub\'s roster, persons and policy', same + '/' + allDev + ' (policy present=' + !!hr.policy + ')');
  var vv = await visit1(w, 3), rrr = (await vv.S.order()).roster;
  ok('D', !!rrr.devices[w.devs[3].kid] && rrr.roleAt(w.devs[3].kid, Infinity).ad_role_id === 200, 'a re-installed station learns its own role from the shared stream alone', 'role=' + (rrr.devices[w.devs[3].kid] ? rrr.roleAt(w.devs[3].kid, Infinity).ad_role_id : 'none'));

  // B: convergence vs flag-off
  var hubOn = await verdictMap(H), hubOff = await verdictMap(res.wOff12.S[0]), mism = 0, held = 0, devMis = 0;
  Object.keys(hubOff).forEach(function (k) { if (hubOn[k] !== hubOff[k]) mism++; });
  ok('B', Object.keys(hubOff).length > 0 && mism === 0 && Object.keys(hubOn).length === Object.keys(hubOff).length, 'the hub\'s verdict for every op equals the pre-F1 verdict', 'ops=' + Object.keys(hubOff).length + ' differing=' + mism);
  var hubOrder = (await H.order()).order, pos = {}; hubOrder.forEach(function (h, i3) { pos[h] = i3; });
  for (var j = 1; j <= 12; j++) { var vm = await verdictMap(w.S[j]), Lj = await w.S[j].order(); Object.keys(vm).forEach(function (k) { held++; if (vm[k] !== hubOff[k]) devMis++; });
    var sub = Lj.order.map(function (h) { return pos[h]; }); for (var q = 1; q < sub.length; q++) if (sub[q] < sub[q - 1]) { devMis++; break; } }
  ok('B', held > 0 && devMis === 0, 'every station: each op it holds has the flag-off verdict, and its order is a subsequence of the hub\'s', 'ops held across 12 stations=' + held + ' differing=' + devMis);
  var parkedAny = 0; for (var j2 = 1; j2 <= 12; j2++) { var Lq = await w.S[j2].order(); parkedAny += Object.keys(Lq.verdict).filter(function (h) { return Lq.verdict[h].verdict === 'PARKED'; }).length; }
  ok('B', parkedAny === 0, 'no op is PARKED on any station (nothing the station needs is missing)', 'parked=' + parkedAny);

  // G: the ACK trail
  var dh = H.delivery().filter(function (x) { return x.verdict; }), downs = H.query("SELECT op_hash, author_seq FROM cl_op WHERE author_kid=? AND target_table='t_down'", [w.devs[0].kid]);
  var seenDown = 0; downs.forEach(function (d) { var x = H.delivery().filter(function (y) { return y.hash === d.op_hash; })[0], addr = w.addr[H.query('SELECT target_uu FROM cl_op WHERE op_hash=?', [d.op_hash])[0].target_uu]; var kid = w.devs.filter(function (z) { return z.person_uu === addr; })[0].kid; if (x && x.seenBy.indexOf(kid) >= 0) seenDown++; });
  var seenUp = 0, upAll = 0;
  for (var s3 = 1; s3 <= 12; s3++) { w.S[s3].delivery().forEach(function (x) { upAll++; if (x.seenBy.indexOf(w.devs[0].kid) >= 0) seenUp++; }); }
  if (!downs.length) vacuous('G', 'no DOWN op'); else {
    ok('G', seenDown === downs.length, 'each DOWN op is SEEN by its addressee (despite the seq holes)', seenDown + '/' + downs.length);
    ok('G', upAll > 0 && seenUp === upAll, 'each station\'s UP ops are SEEN by the hub', seenUp + '/' + upAll); }
  res.failed = fails - before; return res;
}

// C + F: the pre-F1 engine and the new engine produce the same names + op hashes when the gate is closed
async function sameAsBase(arm, label, Esut, Ebase, plan, cfg) {
  var a = await world(Esut, { N: 3, plan: plan, flag: false, cfg: cfg, det: true }), b = await world(Ebase, { N: 3, plan: plan, flag: false, cfg: null, det: true });
  var ha = await hashLists(a), hb = await hashLists(b), na = Object.keys(ha), nb = Object.keys(hb), mObjs = na.filter(function (x) { return /\/m\//.test(x); }).length;
  if (!nb.length) vacuous(arm, label); else ok(arm, eq(na, nb) && eq(ha, hb) && mObjs === 0, label, 'objects=' + nb.length + ' m/=' + mObjs + ' names equal=' + eq(na, nb) + ' ops-per-object equal=' + eq(ha, hb));
}

// I: the relay's one-writer rule knows the mailbox path (ghPipe/gatedPipe name check). CONTROL: the pre-F1 gate refuses the very same name as `bad-name`, so the change is needed.
async function gateArm(Esut, Ebase) {
  async function tryPut(E, name) { var g = E.PIPE.gatedPipe(E.PIPE.memPipe('g'), { token: 't' }), w = g.writer('t'); var r = await w.put(name, new Uint8Array([1])); return { ok: r !== false, why: g.refusals[0] && g.refusals[0].reason }; }
  var sp = 'a'.repeat(64), kid = 'b'.repeat(64);
  var good = await tryPut(Esut, 's/' + sp + '/m/hub/o/' + kid + '/1-2.abc.bimpack'), malformed = await tryPut(Esut, 's/' + sp + '/m/hub/x.bimpack'), old = await tryPut(Ebase, 's/' + sp + '/m/hub/o/' + kid + '/1-2.abc.bimpack');
  ok('I', good.ok, 'the write gate accepts s/<space>/m/<box>/o/<author>/<bundle>', JSON.stringify(good));
  ok('I', !malformed.ok && malformed.why === 'bad-name', 'a mailbox name with no author segment is still refused (bad-name)', JSON.stringify(malformed));
  ok('I', !old.ok && old.why === 'bad-name', 'CONTROL pre-F1: the same mailbox name is refused by the old gate (so the pipe change is what makes it writable)', JSON.stringify(old));
}

(async function main() {
  SQL = await initSqlJs();
  var baseDir = baseline();
  console.log('§F1-HEADER W-F1-MAILBOX tree=' + TREE + ' base=' + BASE_COMMIT + ' node=' + process.version + ' at=' + new Date().toISOString());
  if (!baseDir) { console.log('§F1-VERDICT INCONCLUSIVE - cannot extract the pre-F1 engine (git archive ' + BASE_COMMIT + ')'); process.exit(2); }
  var sut = copyComm(path.join(TREE, 'common/comm')), Esut = load(sut.dir), Ebase = load(copyComm(baseDir).dir);
  Esut = load(sut.dir);
  console.log('   F1 present in the engine under test: setMailbox=' + (typeof Esut.STORE.open(new SQL.Database(), { SQL: SQL, space: 'a'.repeat(64), self: { kid: 'x' }, access: function () { return { allowed: true }; }, log: function () {} }).setMailbox));
  var base = await arms_('engine under test', Esut, Ebase, 'sut');
  await sameAsBase('C', 'office mesh: relay shape (object names + the ops in each) equal to the pre-F1 engine, no m/ object', Esut, Ebase, 'office', 'ok');
  await sameAsBase('F', 'a pre-F1 POS genesis (no `mailboxes`): relay shape (object names + the ops in each) equal to the pre-F1 engine, no m/ object', Esut, Ebase, 'pos', 'ok');
  console.log('\n   -- relay name rule --'); await gateArm(Esut, Ebase);
  var realFails = fails;

  // H: mutants - each engine source replaced; judged by the arms above (a crash is not a kill)
  var MUT = [
    { id: 'M1', what: 'read() returns every box (the edge lists the others\' mail)', host: 'allboxes', expect: ['A', 'E'] },
    { id: 'M7', what: 'wantHead always true (heads are not bounded)', host: 'allheads', expect: ['A'] },
    { id: 'M2', what: 'every business op is put on the hub lane (DOWN envelopes mis-boxed)', host: 'allhub', expect: ['A', 'B', 'E'] },
    { id: 'M3', what: 'an identity op is given a lane', file: 'comm_store.js', needle: "var lane = null;\n      if (!ident &&", repl: "var lane = null;\n      if (true &&", expect: ['D'] },
    { id: 'M5', what: 'the genesis gate forced on (a pre-F1 space sprouts m/)', file: 'comm_roster.js', needle: "mailboxes: gen.env.body.params.mailboxes === 1", repl: "mailboxes: true", expect: ['C', 'F'] },
    { id: 'M8', what: 'the relay name rule forgets the mailbox path (gate refuses m/…)', file: 'comm_pipe.js', needle: "p[2] === 'm' && p[3] && p[4] === 'o' && p[5]) return p[5];", repl: "p[2] === 'zz' && p[3] && p[4] === 'o' && p[5]) return p[5];", expect: ['I'] },
    { id: 'M6', what: 'the signed head keeps the contiguous prefix (the holes block SEEN)', file: 'comm_store.js', needle: "frontier: mbFlag ? await recvMax() : await frontier()", repl: "frontier: await frontier()", expect: ['G'] }
  ];
  if (NOMUT) console.log('\n§F1-MUTANTS skipped (--no-mut)'); else {
    console.log('\n════ mutants ════'); var killed = 0, unapplied = 0;
    for (var m of MUT) {
      var before = JSON.stringify(arms), f0 = fails, applied = 1, E2;
      if (m.file) { var cm = copyComm(path.join(TREE, 'common/comm'), { file: m.file, needle: m.needle, repl: m.repl }); applied = cm.applied; E2 = applied ? load(cm.dir) : null; }
      else E2 = Esut;
      console.log('   §F1-MUT ' + m.id + ' "' + m.what + '" needle_count=' + applied);
      if (!applied) { unapplied++; console.log('   INCONCLUSIVE §F1-MUT ' + m.id + ' NOT APPLIED (the needle is not in the source)'); continue; }
      var saveFails = fails, savedArms = JSON.parse(JSON.stringify(arms)), crashed = null, hit = [];
      try {
        if (m.host) { var w2 = await world(E2, { N: 12, plan: 'pos', cfg: m.host }), v2 = await visit1(w2, 1); var w2b = await world(E2, { N: 3, plan: 'pos', cfg: m.host }), v2b = await visit1(w2b, 1);
          var o3 = v2b.cls, o12 = v2.cls; if (o12.objs !== o3.objs || ((o12.m || 0) + o12.h) > ((o3.m || 0) + o3.h) * 1.15 + 50) hit.push('A');
          var gets = v2.log.map(function (g) { return g.name; }); if (gets.some(function (g) { return /\/m\/hub\//.test(g) || (/\/m\/p_/.test(g) && g.indexOf('/m/p_' + w2.devs[1].person_uu + '/') < 0); })) hit.push('E');
          if (m.id === 'M2') { var Hh = w2.S[0], bad = 0; for (var nn of names(w2).filter(function (x) { return /\/m\/p_/.test(x); })) bad++; if (!bad) hit.push('E'); } }
        else if (m.id === 'M3') { var w3 = await world(E2, { N: 3, plan: 'pos', cfg: 'allhub' }), v3 = await visit1(w3, 1), r3 = (await v3.S.order()).roster;
          var Hm = w3.S[0], idm = 0; for (var n4 of names(w3).filter(function (x) { return /\/m\//.test(x); })) for (var r4 of await Hm.readBundle(await w3.relay._base.get(n4))) if (r4.env && E2.ROS.IDENTITY[r4.env.body.op_type]) idm++;
          if (idm > 0 || !r3.devices[w3.devs[1].kid]) hit.push('D'); }
        else if (m.id === 'M5') { var a1 = await world(E2, { N: 3, plan: 'office', flag: false, cfg: 'ok', det: true }); if (names(a1).some(function (x) { return /\/m\//.test(x); }) || true) { var b1 = await world(Ebase, { N: 3, plan: 'office', flag: false, cfg: null, det: true }); if (!eq(names(a1), names(b1))) hit.push('C'); }
          var a2 = await world(E2, { N: 3, plan: 'pos', flag: false, cfg: 'ok', det: true }), b2 = await world(Ebase, { N: 3, plan: 'pos', flag: false, cfg: null, det: true }); if (!eq(names(a2), names(b2))) hit.push('F'); }
        else if (m.id === 'M8') { var g8 = E2.PIPE.gatedPipe(E2.PIPE.memPipe('g'), { token: 't' }), r8 = await g8.writer('t').put('s/' + 'a'.repeat(64) + '/m/hub/o/' + 'b'.repeat(64) + '/1-2.abc.bimpack', new Uint8Array([1])); if (r8 === false) hit.push('I'); }
        else if (m.id === 'M6') { var w6 = await world(E2, { N: 3, plan: 'pos', cfg: 'ok' }), H6 = w6.S[0], downs6 = H6.query("SELECT op_hash FROM cl_op WHERE author_kid=? AND target_table='t_down'", [w6.devs[0].kid]), seen6 = 0;
          downs6.forEach(function (d) { var x = H6.delivery().filter(function (y) { return y.hash === d.op_hash; })[0]; if (x && x.seenBy.length) seen6++; }); if (seen6 < downs6.length) hit.push('G'); }
      } catch (e) { crashed = e; }
      fails = saveFails; arms = savedArms;                                   // mutant judgments never count as product failures
      if (crashed) { console.log('   INCONCLUSIVE §F1-MUT ' + m.id + ' CRASHED (not a kill): ' + (crashed && crashed.message)); unapplied++; continue; }
      var killedHere = hit.length > 0; if (killedHere) killed++;
      console.log('   ' + (killedHere ? 'PASS' : 'FAIL') + ' §F1-MUT ' + m.id + ' ' + (killedHere ? 'KILLED by arm(s) ' + hit.join(',') : 'SURVIVED (no arm went red)') + '  (designed to hit ' + m.expect.join(',') + ')');
      if (!killedHere) { fails++; arms.H = arms.H || { pass: 0, fail: 0 }; arms.H.fail++; } else { arms.H = arms.H || { pass: 0, fail: 0 }; arms.H.pass++; }
    }
    console.log('§F1-MUTANTS killed=' + killed + '/' + MUT.length + ' not_applied_or_crashed=' + unapplied);
    if (unapplied) inconcl++;
  }
  console.log('\n§F1-ARMS ' + JSON.stringify(arms));
  var v = fails ? 'FAIL' : (inconcl || !judged) ? 'INCONCLUSIVE' : 'PASS';
  console.log('§F1-VERDICT ' + v + ' judged=' + judged + ' fails=' + fails + ' inconclusive=' + inconcl + ' product_fails=' + realFails);
  process.exit(v === 'PASS' ? 0 : v === 'FAIL' ? 1 : 2);
})().catch(function (e) { console.log('§F1-VERDICT INCONCLUSIVE - witness crashed: ' + (e && e.stack || e)); process.exit(2); });
