#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
/* ⚠ DO NOT REMOVE — Scope: W-UNWRAP-MEMO, bim-compiler prompts/TEAMWORK_FRAMEWORK.md §45.12 (the sealing-era slowdown). READ THE LOG after every run — the exit code is not evidence.
 * THE ISSUE: after §45.11 the hub's keyring() re-unwrapped EVERY grant addressed to it whenever the fold changed (memoised on the fold result only), so at N=100 one process made 62,168 unwrapKey
 * calls for 210 distinct grants (perf_review_20261101/scale_new_100_distinct.log) - each one an ECDH + HKDF + AES-KW. The fix memoises the crypto per grant; the RING is still rebuilt from the current fold.
 * REAL engine (common/comm) + real WebCrypto + real sql.js on an in-memory relay; host = the same stub W-READ-SCOPE uses (hub role 102, stations 200, t_up -> hub, t_down -> addressee).
 * Counts subtle.unwrapKey by wrapping it (outside the product).
 *   U1 one unwrap per grant per store   whole run: unwrapKey calls == distinct wrapped grants opened (each grant is addressed to ONE kid, each device has ONE store in the counted window).
 *   U2 flat in traffic                  rounds that add no grant: calls added == distinct grants added (== 0 expected).
 *   U3 same keys                        every store: memoised keyring() + audience ring == a FRESH store (no cache) on a copy of its db, by exported raw key bytes; again after a REVOKE + REKEY.
 *   U4 same reading                     per store: ops held / laned ops held / cl_sealed == the BASELINE engine (git archive BASE) on the same script. CONTROL: baseline vs baseline must agree, else the
 *                                       comparison is noise -> INCONCLUSIVE.
 *   MUT M1 cache lookup disabled (needle count printed, 0 = NOT APPLIED = INCONCLUSIVE) -> U1 or U2 red; a crashing mutant is NOT a kill.
 * Verdict: §UM_VERDICT PASS | FAIL | INCONCLUSIVE.   Run: node common/tests/witness_unwrap_memo.js [bim-ootb dir] [--k 6] [--rounds 3] [--no-mut] | tee <log> */
'use strict';
if (typeof globalThis.crypto === 'undefined' || !globalThis.crypto.subtle) globalThis.crypto = require('crypto').webcrypto;
var path = require('path'), fs = require('fs'), os = require('os'), cp = require('child_process'), nodeCrypto = require('crypto');
var ARGS = process.argv.slice(2), NOMUT = ARGS.indexOf('--no-mut') >= 0;
function arg(n, d) { var i = ARGS.indexOf('--' + n); return i >= 0 ? Number(ARGS[i + 1]) : d; }
var POS = ARGS.filter(function (a, i) { return !/^--/.test(a) && !/^--/.test(ARGS[i - 1] || ''); });
var TREE = path.resolve(POS[0] || path.join(__dirname, '..', '..')), BASE_COMMIT = process.env.UM_BASE || '72ecc8f9';
var K = arg('k', 6), ROUNDS = arg('rounds', 3);
var SQLJS = process.env.SQLJS_DIR || (fs.existsSync(path.join(TREE, 'tests/node_modules/sql.js')) ? path.join(TREE, 'tests/node_modules/sql.js') : '/home/red1/bim-ootb/tests/node_modules/sql.js');
var initSqlJs = require(SQLJS), SQL;

// ── the counter (outside the product) ──
var SUB = globalThis.crypto.subtle, ORIG = SUB.unwrapKey, CNT = { on: false, calls: 0, wrapped: new Set() };
SUB.unwrapKey = function (fmt, wrapped) { if (CNT.on) { CNT.calls++; CNT.wrapped.add(Buffer.from(wrapped).toString('base64')); } return ORIG.apply(this, arguments); };
function snap() { return { calls: CNT.calls, distinct: CNT.wrapped.size }; }
function resetCnt() { CNT.calls = 0; CNT.wrapped = new Set(); }

// ── collector ──
var C = null;
function newC(print) { return { print: print, arms: {}, fails: 0, judged: 0, inc: 0 }; }
function slot(a) { return (C.arms[a] = C.arms[a] || { pass: 0, fail: 0, inc: 0 }); }
function ok(a, cond, label, detail) { C.judged++; var s = slot(a); if (cond) s.pass++; else { s.fail++; C.fails++; }
  if (C.print) console.log('   ' + (cond ? 'PASS' : 'FAIL') + ' §UM-' + a + ' ' + label + (detail ? ' - ' + detail : '')); return cond; }
function vacuous(a, label) { slot(a).inc++; C.inc++; if (C.print) console.log('   INCONCLUSIVE §UM-' + a + ' ' + label + ' (nothing was judged)'); }

// ── engines ──
var tmpN = 0;
function copyComm(srcDir, mut) { var d = fs.mkdtempSync(path.join(os.tmpdir(), 'umw_' + (tmpN++) + '_')), applied = 0;
  fs.readdirSync(srcDir).filter(function (f) { return /\.js$/.test(f); }).forEach(function (f) { var s = fs.readFileSync(path.join(srcDir, f), 'utf8');
    if (mut && mut.file === f) { var parts = s.split(mut.needle); applied = parts.length - 1; s = parts.join(mut.repl); } fs.writeFileSync(path.join(d, f), s); });
  return { dir: d, applied: applied }; }
function load(dir) { ['CommEnvelope', 'CommOrder', 'CommRoster', 'CommAdmit', 'CommStore', 'CommPipe'].forEach(function (n) { delete globalThis[n]; });
  Object.keys(require.cache).forEach(function (k) { if (k.indexOf(dir) === 0) delete require.cache[k]; });
  return { ENV: require(path.join(dir, 'comm_envelope.js')), STORE: require(path.join(dir, 'comm_store.js')), ROS: require(path.join(dir, 'comm_roster.js')), PIPE: require(path.join(dir, 'comm_pipe.js')) }; }
function baseline() { var d = fs.mkdtempSync(path.join(os.tmpdir(), 'umbase_'));
  var r = cp.spawnSync('sh', ['-c', 'git -C "' + TREE + '" archive ' + BASE_COMMIT + ' common/comm | tar -x -C "' + d + '"'], { encoding: 'utf8' });
  return r.status === 0 && fs.existsSync(path.join(d, 'common/comm/comm_store.js')) ? path.join(d, 'common/comm') : null; }

// ── host stub (same rules as W-READ-SCOPE hostCfg) ──
function hostCfg(w) { return {
  laneOf: function (spec) { var t = spec.target.table; if (t === 't_up') return 'hub'; if (t === 't_down') { var a = w.addr[String(spec.target.uu).toLowerCase()]; return a ? 'p_' + a : null; } return null; },
  read: function (c) { var d = c.roster.devices[c.self.kid]; if (!d) return []; return c.roster.roleAt(c.self.kid, Infinity).ad_role_id === 102 ? ['hub'] : ['p_' + d.person]; },
  wantHead: function (kid, c) { var d = c.roster.devices[kid], me = c.roster.devices[c.self.kid]; if (!d) return false; return c.roster.roleAt(kid, Infinity).ad_role_id === 102 || (!!me && d.person === me.person) || c.roster.roleAt(c.self.kid, Infinity).ad_role_id === 102; },
  holds: function (aud, kid, c) { var d = c.roster.devices[kid]; if (!d) return false; var hub = c.roster.roleAt(kid, Infinity).ad_role_id === 102;
    if (aud === 'hub') return hub; var m = /^p_(.+)$/.exec(String(aud)); return !!m && (hub || d.person === m[1]); } }; }
function uid(s) { var h = nodeCrypto.createHash('sha1').update(s).digest('hex'); return h.slice(0, 8) + '-' + h.slice(8, 12) + '-4' + h.slice(13, 16) + '-8' + h.slice(17, 20) + '-' + h.slice(20, 32); }
function fields(x) { return Object.assign({ ad_client_id: 11, ad_org_id: 0 }, x || {}); }

// world: H (idx 0, hub 102) + K stations (idx 1..K, own persons) + X2 = a 2nd device of station 1's person (idx K+1). Fresh keys every world.
async function world(E) {
  var devs = []; for (var i = 0; i < K + 2; i++) { var d = await E.STORE.newDevice(); d.person_uu = nodeCrypto.randomUUID(); devs.push(d); }
  devs[K + 1].person_uu = devs[1].person_uu;
  var sp = await E.STORE.newSpace('umw', devs[0], devs[0].person_uu, 'HQ', 102, { plan: 'pos' });
  var w = { E: E, devs: devs, sp: sp, addr: {}, relay: E.PIPE.memPipe('um'), ts: 1700000100000, n: 0 };
  w.open = function (i, db) { var S = E.STORE.open(db || new SQL.Database(), { SQL: SQL, space: sp.space, self: devs[i], access: function () { return { allowed: true }; }, log: function () {} });
    if (typeof S.setMailbox === 'function') S.setMailbox(hostCfg(w)); return S; };
  w.S = devs.map(function (d, i) { return w.open(i); });
  var H = w.S[0]; await H.genesis(sp.params);
  for (var j = 1; j <= K; j++) { await H.addPerson({ person_uu: devs[j].person_uu, name: 'Station ' + j, ad_role_id: 200, comm_admin: false }); await H.enroll(devs[j].kid, devs[j].pubJwk, devs[j].person_uu, devs[j].dhPubJwk); }
  await H.enroll(devs[K + 1].kid, devs[K + 1].pubJwk, devs[K + 1].person_uu, devs[K + 1].dhPubJwk);
  await H.setPolicy({ epoch: 1, visit_ms: 600000 });
  await H.sync(w.relay); for (var s = 1; s < w.S.length; s++) await w.S[s].sync(w.relay); await H.sync(w.relay); for (s = 1; s < w.S.length; s++) await w.S[s].sync(w.relay);
  return w;
}
// one round: each station sends one UP, the hub collects and sends one DOWN to each person, everyone collects
async function round(w) {
  var H = w.S[0];
  for (var j = 1; j <= K; j++) { await w.S[j].author({ target: { table: 't_up', uu: uid('up' + j + '-' + w.n + w.sp.space) }, intent: 'K2', ts: w.ts++, body: { op_type: 'CRUD_CREATE', params: { fields: fields({ amt: j }) } } }); await w.S[j].sync(w.relay); }
  await H.sync(w.relay);
  for (j = 1; j <= K; j++) { var u = uid('down' + j + '-' + w.n + w.sp.space); w.addr[u] = w.devs[j].person_uu; await H.author({ target: { table: 't_down', uu: u }, intent: 'K2', ts: w.ts++, body: { op_type: 'CRUD_CREATE', params: { fields: fields({ qty: j }) } } }); }
  await H.sync(w.relay); for (var s = 1; s < w.S.length; s++) await w.S[s].sync(w.relay); await H.sync(w.relay);
  w.n++;
}
async function revokeRekey(w) { var H = w.S[0]; await H.revoke(w.devs[K + 1].kid, 0); await H.sync(w.relay); for (var s = 1; s < w.S.length; s++) await w.S[s].sync(w.relay); await H.sync(w.relay); for (s = 1; s < w.S.length; s++) await w.S[s].sync(w.relay);
  return (await H.order()).roster.rekeys.length; }

async function raw(k) { return Buffer.from(await SUB.exportKey('raw', k)).toString('hex'); }
async function ringDigest(S) {
  var r = await S.keyring(), out = {};
  for (var ep of Object.keys(r).sort()) { out['space#' + ep] = []; for (var k of r[ep]) out['space#' + ep].push(await raw(k)); out['space#' + ep].sort(); }
  var ar = typeof S.audKeyring === 'function' ? await S.audKeyring() : null;
  if (ar) for (var a of Object.keys(ar).sort()) for (var e of Object.keys(ar[a]).sort()) { var l = []; for (var x of ar[a][e]) l.push((await raw(x.key)) + '@' + x.origin); out[a + '#' + e] = l.sort(); }
  return { d: out, aud: !!ar, n: Object.keys(out).reduce(function (t, k) { return t + out[k].length; }, 0) };
}
async function sameKeys(w, tag) {          // memoised store vs a fresh store on a copy of its db (not counted)
  var was = CNT.on; CNT.on = false; var same = 0, diff = [], keys = 0, audSeen = false;
  try { for (var i = 0; i < w.S.length; i++) { var a = await ringDigest(w.S[i]), b = await ringDigest(w.open(i, new SQL.Database(w.S[i].db.export())));
    keys += a.n; audSeen = audSeen || a.aud; if (JSON.stringify(a.d) === JSON.stringify(b.d)) same++; else diff.push(i); } }
  finally { CNT.on = was; }
  return { same: same, of: w.S.length, diff: diff, keys: keys, aud: audSeen, tag: tag };
}
function reading(w) { return w.S.map(function (S) { return [S.query('SELECT COUNT(*) n FROM cl_op')[0].n, S.query("SELECT COUNT(*) n FROM cl_op WHERE target_table IN ('t_up','t_down')")[0].n, S.sealed().length].join('/'); }); }

// the scripted run: world, ROUNDS rounds (U1 window), ROUNDS more (U2 window), revoke+rekey, one more round
async function run(E) {
  resetCnt(); CNT.on = true;
  try {
    var w = await world(E); await round(w); var a = snap();
    for (var r = 1; r < ROUNDS; r++) await round(w);
    var keys1 = await sameKeys(w, 'before revoke');
    var b = snap(); for (r = 0; r < ROUNDS; r++) await round(w); var c = snap();
    var rk = await revokeRekey(w); await round(w); var d = snap();
    var keys2 = await sameKeys(w, 'after revoke+rekey');
    return { w: w, founding: a, preU2: b, postU2: c, end: d, rekeys: rk, keys1: keys1, keys2: keys2, reading: reading(w), ops: w.S[0].query('SELECT COUNT(*) n FROM cl_op')[0].n };
  } finally { CNT.on = false; }
}

function judge(R, base, ctl) {
  if (!R.end.distinct) vacuous('U1', 'no grant was opened in the whole run');
  else ok('U1', R.end.calls === R.end.distinct, 'one unwrapKey per grant per store over the whole run (' + (K + 2) + ' stores, ' + R.ops + ' ops at the hub)', 'calls=' + R.end.calls + ' distinct=' + R.end.distinct + ' ratio=' + (R.end.calls / R.end.distinct).toFixed(1));
  var addC = R.postU2.calls - R.preU2.calls, addD = R.postU2.distinct - R.preU2.distinct;
  if (R.postU2.calls === R.preU2.calls && R.preU2.distinct === 0) vacuous('U2', 'no grant held before the traffic window');
  else ok('U2', addC === addD, ROUNDS + ' traffic rounds add no unwrap beyond new grants', 'calls_added=' + addC + ' grants_added=' + addD);
  [R.keys1, R.keys2].forEach(function (k) {
    if (!k.keys) return vacuous('U3', 'no key held by any store (' + k.tag + ')');
    ok('U3', k.same === k.of, 'memoised keyring == fresh store keyring, ' + k.tag, k.same + '/' + k.of + ' stores, keys compared=' + k.keys + ' audience_ring=' + (k.aud ? 'compared' : 'NOT EXPOSED') + (k.diff.length ? ' differ=' + k.diff.join(',') : '')); });
  if (!R.rekeys) vacuous('U3', 'the revoke produced no REKEY - the new-epoch path was not exercised');
  if (!base) return vacuous('U4', 'baseline engine ' + BASE_COMMIT + ' could not be archived');
  if (JSON.stringify(base.reading) !== JSON.stringify(ctl.reading)) return vacuous('U4', 'baseline vs baseline disagree (' + base.reading.join(' ') + ' | ' + ctl.reading.join(' ') + ') - the comparison is noise');
  ok('U4', JSON.stringify(R.reading) === JSON.stringify(base.reading), 'per store ops/laned/sealed == baseline engine ' + BASE_COMMIT, 'tree=' + R.reading.join(' ') + ' base=' + base.reading.join(' '));
}

(async function main() {
  SQL = await initSqlJs();
  var head = (cp.spawnSync('git', ['-C', TREE, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).stdout || '').trim();
  console.log('§UM_HEADER W-UNWRAP-MEMO tree=' + TREE + ' commit=' + head + ' base=' + BASE_COMMIT + ' K=' + K + ' rounds=' + ROUNDS + ' node=' + process.version);
  var commDir = path.join(TREE, 'common/comm'), t0 = Date.now();
  var R = await run(load(copyComm(commDir).dir));
  console.log('§UM_COUNT tree founding=' + JSON.stringify(R.founding) + ' preU2=' + JSON.stringify(R.preU2) + ' postU2=' + JSON.stringify(R.postU2) + ' end=' + JSON.stringify(R.end) + ' rekeys=' + R.rekeys + ' ms=' + (Date.now() - t0));
  var bdir = baseline(), base = null, ctl = null;
  if (bdir) { var t1 = Date.now(); base = await run(load(copyComm(bdir).dir)); console.log('§UM_COUNT base end=' + JSON.stringify(base.end) + ' ms=' + (Date.now() - t1)); ctl = await run(load(copyComm(bdir).dir)); }
  C = newC(true); judge(R, base, ctl); var main_ = C;
  var killed = 0, mutTried = 0, mutInc = 0;
  if (!NOMUT) {
    var MUTS = [{ id: 'M1', why: 'cache lookup disabled', file: 'comm_store.js', needle: '_openCache.get(ck)', repl: 'undefined', arms: ['U1', 'U2'] }];
    for (var m of MUTS) { mutTried++; var cc = copyComm(commDir, m);
      if (!cc.applied) { mutInc++; console.log('   INCONCLUSIVE §UM-MUT ' + m.id + ' (' + m.why + ') NOT APPLIED needle_count=0'); continue; }
      var MR; try { MR = await run(load(cc.dir)); } catch (e) { console.log('   FAIL §UM-MUT ' + m.id + ' crashed (a crash is not a kill): ' + e.message); continue; }
      C = newC(false); judge(MR, base, ctl); var red = m.arms.filter(function (a) { return C.arms[a] && C.arms[a].fail > 0; });
      if (red.length) killed++;
      console.log('   ' + (red.length ? 'PASS' : 'FAIL') + ' §UM-MUT ' + m.id + ' (' + m.why + ') needle_count=' + cc.applied + ' red=' + (red.join(',') || 'none') + ' calls=' + MR.end.calls + ' distinct=' + MR.end.distinct); }
    C = main_;
  }
  var mutFail = mutTried - killed - mutInc, verdict = (C.fails || mutFail) ? 'FAIL' : (C.inc || mutInc || !C.judged) ? 'INCONCLUSIVE' : 'PASS';
  console.log('§UM_VERDICT ' + verdict + ' judged=' + C.judged + ' fails=' + C.fails + ' inconclusive=' + C.inc + ' mutants=' + (NOMUT ? 'skipped' : killed + '/' + mutTried));
  process.exit(verdict === 'PASS' ? 0 : 1);
})().catch(function (e) { console.log('§UM_VERDICT INCONCLUSIVE crashed: ' + (e && e.stack || e)); process.exit(2); });
