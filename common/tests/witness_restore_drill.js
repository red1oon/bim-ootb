#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
/* ⚠ DO NOT REMOVE — Scope: W-RESTORE-DRILL, bim-compiler prompts/TEAMWORK_FRAMEWORK.md §52.2 (Triple Redundancy: rebuild from ONE copy). READ THE LOG after every run — the exit code is not evidence.
 * THE ISSUE: "the books come back from any one copy" was a design claim, never drilled. REAL engine (common/comm) + real WebCrypto + sql.js + memPipe; the W-UNWRAP-MEMO world
 * (hub H + K stations, POS mailbox space, pair sealing). A scripted day; REFERENCE = each device's fold at end of day (placed order + verdict per op). Then every device is wiped.
 *   R1 relay alone          rebuild H and station 1 from their KEYS + a copy of the relay -> fold == reference
 *   R2 second copy alone    the office box (D1, not built) MODELLED as a replica that received every relay object at put time -> fold == reference
 *   R3 lost bundle          one of station 1's middle UP bundles missing -> the rebuilt H NAMES it (gaps) and lacks exactly its ops (+ any it parks)
 *   R4 never relayed        station 1 authors 2 ops and dies before its Visit -> no rebuild contains them and nobody can name them (§LIMIT: only the device or a save-time box holds them)
 *   R5 no key               rebuild H with the wrong DH key -> laned business ops stay sealed (present, unreadable), never a silent empty ledger
 *   CTL tampered copy       one byte flipped in a station bundle -> its ops are not restored and the rebuild differs from the reference (detected)
 * Verdict: §RD_VERDICT PASS | FAIL | INCONCLUSIVE.   Run: node common/tests/witness_restore_drill.js [bim-ootb dir] [--k 4] [--rounds 3] | tee <log> */
'use strict';
if (typeof globalThis.crypto === 'undefined' || !globalThis.crypto.subtle) globalThis.crypto = require('crypto').webcrypto;
var path = require('path'), fs = require('fs'), cp = require('child_process'), nodeCrypto = require('crypto');
var ARGS = process.argv.slice(2); function arg(n, d) { var i = ARGS.indexOf('--' + n); return i >= 0 ? Number(ARGS[i + 1]) : d; }
var POS = ARGS.filter(function (a, i) { return !/^--/.test(a) && !/^--/.test(ARGS[i - 1] || ''); });
var TREE = path.resolve(POS[0] || path.join(__dirname, '..', '..')), K = arg('k', 4), ROUNDS = arg('rounds', 3);
var SQLJS = process.env.SQLJS_DIR || (fs.existsSync(path.join(TREE, 'tests/node_modules/sql.js')) ? path.join(TREE, 'tests/node_modules/sql.js') : 'sql.js');
var initSqlJs; try { initSqlJs = require(SQLJS); } catch (e) { console.log('§RD_VERDICT INCONCLUSIVE sql.js is not installed: run `cd ' + TREE + '/tests && npm install`'); process.exit(2); }
var SQL, fails = 0, judged = 0, inc = 0;
function ok(a, c, label, d) { judged++; if (!c) fails++; console.log('   ' + (c ? 'PASS' : 'FAIL') + ' §RD-' + a + ' ' + label + (d ? ' - ' + d : '')); return c; }
function vac(a, label) { inc++; console.log('   INCONCLUSIVE §RD-' + a + ' ' + label + ' (nothing was judged)'); }
var dir = process.env.RD_COMM || path.join(TREE, 'common', 'comm');
var E = { ENV: require(path.join(dir, 'comm_envelope.js')), STORE: require(path.join(dir, 'comm_store.js')), ROS: require(path.join(dir, 'comm_roster.js')), PIPE: require(path.join(dir, 'comm_pipe.js')) };
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
  devs[K + 1].person_uu = devs[0].person_uu;      // the DEPUTY: a second hub device of H's person (reads every audience, authors nothing)
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

// a copy of a pipe's objects into a fresh memPipe (optionally without some names / with altered bytes)
async function copyOf(src, o) { o = o || {}; var dst = E.PIPE.memPipe('copy'); for (var n of src._names()) { if ((o.drop || []).indexOf(n) >= 0) continue; var b = await src.get(n); if (o.alter && o.alter[n]) b = o.alter[n](b); await dst.put(n, b); } return dst; }
async function fold(S) { var L = await S.order(), v = {}; L.order.forEach(function (h) { v[h] = (L.verdict[h] || {}).verdict || 'MERGED'; }); return { order: L.order.slice(), verdict: v, parked: Object.keys(L.parked || {}).length }; }
async function rebuild(w, i, pipe, self) { var S = E.STORE.open(new SQL.Database(), { SQL: SQL, space: w.sp.space, self: self || w.devs[i], access: function () { return { allowed: true }; }, log: function () {} });
  if (typeof S.setMailbox === 'function') S.setMailbox(hostCfg(w)); await S.sync(pipe); await S.sync(pipe); return S; }
function same(a, b) { return JSON.stringify(a.order) === JSON.stringify(b.order) && JSON.stringify(a.verdict) === JSON.stringify(b.verdict); }
function bundleOps(bytes) { try { var d = new SQL.Database(bytes), r = d.exec('SELECT op_hash FROM ops'); d.close(); return r.length ? r[0].values.map(function (v) { return v[0]; }) : []; } catch (e) { return null; } }

(async function main() {
  SQL = await initSqlJs();
  var head = (cp.spawnSync('git', ['-C', TREE, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).stdout || '').trim();
  console.log('§RD_HEADER W-RESTORE-DRILL tree=' + TREE + ' commit=' + head + ' K=' + K + ' rounds=' + ROUNDS + ' node=' + process.version);
  var w = await world(E), box = E.PIPE.memPipe('box'), realPut = w.relay.put;
  w.relay.put = async function (n, b) { await box.put(n, b); return realPut.call(this, n, b); };      // R2 model: the office box receives every object at put time
  // the founding sync happened before the tee: seed the box with what is already on the relay
  for (var n0 of w.relay._names()) if (!box._names().includes(n0)) await box.put(n0, await w.relay.get(n0));
  for (var r = 0; r < ROUNDS; r++) await round(w);
  var D = K + 1, REF = { H: await fold(w.S[0]), X: await fold(w.S[1]), D: await fold(w.S[D]) };
  console.log('§RD_REFERENCE deputy_ops=' + REF.D.order.length + ' hub_ops=' + REF.H.order.length + ' station1_ops=' + REF.X.order.length + ' relay_objects=' + w.relay._names().length + ' box_objects=' + box._names().length);
  if (!REF.H.order.length) { vac('R1', 'the reference day placed no ops'); }
  else {
    var d1 = await fold(await rebuild(w, D, await copyOf(w.relay)));
    ok('R1', same(d1, REF.D), 'the deputy hub device rebuilt from its keys + the relay copy == reference (the relay holds the whole history)', 'ops ' + d1.order.length + '/' + REF.D.order.length);
    var h1 = await fold(await rebuild(w, 0, await copyOf(w.relay))), x1 = await fold(await rebuild(w, 1, await copyOf(w.relay)));
    var xOwn = REF.X.order.filter(function (h) { return x1.order.indexOf(h) < 0; }).length;
    ok('S1', same(h1, REF.H), 'SELF-REBUILD: the hub rebuilt from its own keys + the relay == reference', 'ops ' + h1.order.length + '/' + REF.H.order.length + ' (§52.4: before the fix, sync never fetched a device\'s own bundles)');
    ok('S1', same(x1, REF.X), 'SELF-REBUILD: station 1 rebuilt from its own keys + the relay == reference', 'ops ' + x1.order.length + '/' + REF.X.order.length + ' missing=' + xOwn + ' (= its own authored ops)');
    // S2 (§52.4): the restored station writes again -> no fork anywhere (its numbering continued)
    var cpS = await copyOf(w.relay), X2 = await rebuild(w, 1, cpS), wrote = null;
    try { await X2.author({ target: { table: 't_up', uu: uid('s2-after-restore' + w.sp.space) }, intent: 'K2', ts: w.ts++, body: { op_type: 'CRUD_CREATE', params: { fields: fields({ amt: 77 }) } } }); await X2.sync(cpS); wrote = 'ok'; } catch (e) { wrote = 'refused:' + (e.code || e.message); }
    var Dv = await rebuild(w, D, cpS), Lv = await Dv.order(), cont = Dv.query('SELECT COUNT(*) n FROM cl_contender')[0].n, eqv = (Lv.equivocations || []).length;
    ok('S2', wrote === 'ok' && cont === 0 && eqv === 0, 'the restored station writes again and no device sees a fork (contenders 0, equivocations 0)', 'write=' + wrote + ' contenders=' + cont + ' equivocations=' + eqv + ' next_seq=' + (X2.query('SELECT next_seq FROM cl_self')[0] || {}).next_seq);
    var d2 = await fold(await rebuild(w, D, await copyOf(box)));
    ok('R2', same(d2, REF.D), 'the deputy rebuilt from the office-box copy alone (modelled replica) == reference', 'ops ' + d2.order.length + '/' + REF.D.order.length);
    // R3: a middle UP bundle of station 1 missing
    var ups = w.relay._names().filter(function (n) { return n.indexOf('/m/hub/o/' + w.devs[1].kid + '/') >= 0; }).sort(function (a, b) { return Number(a.split('/').pop().split('-')[0]) - Number(b.split('/').pop().split('-')[0]); });
    if (ups.length < 3) vac('R3', 'station 1 has fewer than 3 UP bundles (' + ups.length + ')');
    else { var lost = ups[1], lostOps = bundleOps(await w.relay.get(lost)) || [], H3 = await rebuild(w, D, await copyOf(w.relay, { drop: [lost] })), h3 = await fold(H3), g = H3.gaps();
      var missing = REF.D.order.filter(function (h) { return h3.order.indexOf(h) < 0; }), named = g.filter(function (x) { return x.author === w.devs[1].kid; });
      ok('R3', named.length > 0, 'the rebuilt deputy NAMES the missing bundle as a gap', JSON.stringify(named).slice(0, 160));
      ok('R3', lostOps.length > 0 && lostOps.every(function (h) { return missing.indexOf(h) >= 0; }) && missing.length - lostOps.length === 0, 'it lacks exactly the lost bundle\'s ops (' + lostOps.length + '), nothing else', 'missing=' + missing.length + ' parked=' + h3.parked); }
    // R5: wrong DH key
    var other = await E.STORE.newDevice(), wrong = Object.assign({}, w.devs[D], { dhPrivateKey: other.dhPrivateKey }), H5 = await rebuild(w, D, await copyOf(w.relay), wrong);
    var laned = H5.query("SELECT COUNT(*) n FROM cl_op WHERE target_table IN ('t_up','t_down')")[0].n, sealed = H5.sealed().length;
    ok('R5', laned === 0 && sealed > 0, 'without the right key the business ops stay sealed: present, unreadable (not a silent empty ledger)', 'sealed=' + sealed + ' laned_opened=' + laned);
    // CONTROL: one byte flipped in a station bundle
    var victim = ups[ups.length - 1], vOps = bundleOps(await w.relay.get(victim)) || [];
    var applied = 0, flip = function (b) { var d = new SQL.Database(b), before = d.exec('SELECT envelope FROM ops')[0].values.map(function (v) { return v[0]; }).join('|');
      d.run("UPDATE ops SET envelope = substr(envelope, 1, length(envelope) - 10) || CASE WHEN substr(envelope, length(envelope) - 9, 1) = 'A' THEN 'B' ELSE 'A' END || substr(envelope, length(envelope) - 8)");
      applied = before !== d.exec('SELECT envelope FROM ops')[0].values.map(function (v) { return v[0]; }).join('|') ? 1 : 0; var c = d.export(); d.close(); return c; }, alter = {}; alter[victim] = flip;      // a real tamper: one character of the sealed/signed envelope changed (proved applied)
    var h6 = await fold(await rebuild(w, D, await copyOf(w.relay, { alter: alter })));
    var restored = vOps.filter(function (h) { return h6.order.indexOf(h) >= 0; }).length;
    if (!applied) vac('CTL', 'the tamper did not change the envelope bytes'); else ok('CTL', vOps.length > 0 && restored === 0 && !same(h6, REF.D) && h6.order.length > 0, 'a tampered bundle is not restored and the rebuild differs from the reference (detected)', 'ops in bundle=' + vOps.length + ' restored=' + restored + ' rebuilt_ops=' + h6.order.length + ' tamper_applied=' + applied);
    // R4: station 1 authors 2 ops and dies before its Visit
    var before = {}; w.S[1].query("SELECT op_hash FROM cl_op WHERE author_kid=?", [w.devs[1].kid]).forEach(function (x) { before[x.op_hash] = 1; });
    for (var j = 0; j < 2; j++) await w.S[1].author({ target: { table: 't_up', uu: uid('r4-' + j + w.sp.space) }, intent: 'K2', ts: w.ts++, body: { op_type: 'CRUD_CREATE', params: { fields: fields({ amt: 99 }) } } });
    var own = w.S[1].query("SELECT op_hash FROM cl_op WHERE author_kid=?", [w.devs[1].kid]).map(function (x) { return x.op_hash; }).filter(function (h) { return !before[h]; });
    var H4 = await rebuild(w, D, await copyOf(w.relay)), h4 = await fold(H4), seen = own.filter(function (h) { return h4.order.indexOf(h) >= 0; }).length, g4 = H4.gaps().filter(function (x) { return x.author === w.devs[1].kid; }).length;
    console.log('§LIMIT work authored but never relayed is invisible to every rebuild: ' + seen + ' of ' + own.length + ' unsent ops in the rebuilt hub, gaps naming them=' + g4 + '; only the device itself (copy 1) or a save-time office box holds them');
    ok('R4', own.length >= 2 && seen === 0 && h4.order.length > 0, 'the limit is real and measured: unsent ops are absent from the rebuild (so copy 1 / a save-time box is what protects them)', 'unsent=' + own.length + ' in_rebuild=' + seen + ' rebuilt_ops=' + h4.order.length);
  }
  // MUTANT (§52.4): restore turned off by source replacement -> S1 and S2 must turn red (needle count printed; 0 = not applied = INCONCLUSIVE)
  if (!process.env.RD_COMM && ARGS.indexOf('--no-mut') < 0) {
    var src = fs.readFileSync(path.join(dir, 'comm_store.js'), 'utf8'), needle = 'restoring = true; rHead = hd0;', nApplied = src.split(needle).length - 1;
    if (!nApplied) { inc++; console.log('   INCONCLUSIVE §RD-MUT restore-off NOT APPLIED needle_count=0'); }
    else { var md = fs.mkdtempSync(path.join(require('os').tmpdir(), 'rdmut_')); fs.readdirSync(dir).filter(function (f) { return /\.js$/.test(f); }).forEach(function (f) { var t = fs.readFileSync(path.join(dir, f), 'utf8'); if (f === 'comm_store.js') t = t.split(needle).join('rHead = hd0;'); fs.writeFileSync(path.join(md, f), t); });
      var mr = cp.spawnSync(process.execPath, [__filename, TREE, '--k', String(K), '--rounds', String(ROUNDS)], { env: Object.assign({}, process.env, { RD_COMM: md }), encoding: 'utf8', timeout: 900000 });
      var red = (mr.stdout.match(/FAIL §RD-(S1|S2)/g) || []).length, crash = /§RD_VERDICT INCONCLUSIVE crashed/.test(mr.stdout);
      judged++; if (!red || crash) fails++;
      console.log('   ' + (red && !crash ? 'PASS' : 'FAIL') + ' §RD-MUT restore-off needle_count=' + nApplied + ' red_arms=' + red + (crash ? ' CRASHED (not a kill)' : '') + ' :: ' + (mr.stdout.match(/§RD-S2 .*/) || [''])[0].slice(0, 160)); }
  }
  var verdict = fails ? 'FAIL' : (inc || !judged) ? 'INCONCLUSIVE' : 'PASS';
  console.log('§RD_VERDICT ' + verdict + ' judged=' + judged + ' fails=' + fails + ' inconclusive=' + inc);
  process.exit(verdict === 'PASS' ? 0 : 1);
})().catch(function (e) { console.log('§RD_VERDICT INCONCLUSIVE crashed: ' + (e && e.stack || e)); process.exit(2); });
