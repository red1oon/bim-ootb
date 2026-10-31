#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
/* ⚠ DO NOT REMOVE — Scope: W-READ-SCOPE-GH, bim-compiler prompts/TEAMWORK_FRAMEWORK.md §49.1 row G4 (mailboxes + pair sealing over the REAL GitHub relay). READ THE LOG after every run — the exit code is not evidence.
 * THE ISSUE: §45.11 (W-READ-SCOPE arms A and G) ran only over an in-memory relay. This re-runs its two core arms over the real `ghPipe` (common/comm/comm_pipe.js) in the project's private test relay
 * repo red1oon/bim-teams-pipe (token from `gh auth token`, exactly as bim-compiler scripts/witness_comm_cl3b_github.js). Every run founds a FRESH space with FRESH device keys: a new space is just new paths
 * (s/<space>/…) on new branches dev/<kid>; no repo is created, no other space's path is written; the witness deletes ONLY the dev/<kid> branches it created.
 *   A  member read isolation   Y = a MODIFIED client (a fresh store that lists and gets every m/ object through the real pipe) opens 0 of X's laned ops; H opens all; Y opens its own DOWN mail.
 *                              CONTROL: a second GitHub world whose host has no `holds` (audience sealing off = F1) -> the same Y opens N of N.
 *   G  gap over GitHub         the relay withholds X's MIDDLE m/hub/ bundle -> the hub's gaps() lists exactly that bundle's box seqs; withholds the LAST -> reported from X's signed head `boxes`;
 *                              nothing withheld -> []. CONTROL: a mutant engine with no `box` (M5, needle count printed) -> the same withholding shows gaps() = [].
 *   "The relay withholds" = a reader-side view of the REAL pipe that hides one name (the same overlay W-READ-SCOPE arm G uses); every byte it does show came from GitHub.
 * Verdict §RSGH_VERDICT PASS | FAIL | INCONCLUSIVE (no token / no network / unreachable repo / an arm judged nothing => INCONCLUSIVE, never PASS).
 * Run: node common/tests/witness_read_scope_github.js [--gap-ms=3000] | tee <log>      Env: GH_GAP_MS (the pipe's minGapMs between its commits). */
'use strict';
if (typeof globalThis.crypto === 'undefined' || !globalThis.crypto.subtle) globalThis.crypto = require('crypto').webcrypto;
var path = require('path'), fs = require('fs'), os = require('os'), cp = require('child_process'), nodeCrypto = require('crypto');
var SQLJS = process.env.SQLJS_DIR || (fs.existsSync(path.join(__dirname, '..', '..', 'tests/node_modules/sql.js')) ? path.join(__dirname, '..', '..', 'tests/node_modules/sql.js') : '/home/red1/bim-ootb/tests/node_modules/sql.js');
var initSqlJs = require(SQLJS);
var ARGS = process.argv.slice(2), GAP = Number((ARGS.filter(function (a) { return /^--gap-ms=/.test(a); })[0] || '').slice(9)) || Number(process.env.GH_GAP_MS || 3000);
var OWNER = 'red1oon', REPO = 'bim-teams-pipe', COMM = path.join(__dirname, '..', 'comm');
var C = { judged: 0, fails: 0, inc: 0, arms: {} };
function slot(a) { return C.arms[a] || (C.arms[a] = { pass: 0, fail: 0, inc: 0 }); }
function ok(arm, cond, label, detail) { C.judged++; var s = slot(arm); if (cond) s.pass++; else { s.fail++; C.fails++; } console.log('   ' + (cond ? 'PASS' : 'FAIL') + ' §RSGH-' + arm + ' ' + label + (detail ? ' - ' + detail : '')); }
function vacuous(arm, label) { slot(arm).inc++; C.inc++; console.log('   INCONCLUSIVE §RSGH-' + arm + ' ' + label + ' (nothing was judged)'); }
function verdict(v, why) { console.log('§RSGH_VERDICT ' + v + ' judged=' + C.judged + ' fails=' + C.fails + ' inconclusive=' + C.inc + (why ? ' - ' + why : '')); process.exit(v === 'PASS' ? 0 : v === 'FAIL' ? 1 : 3); }

function loadEngine(dir) { ['CommEnvelope', 'CommOrder', 'CommRoster', 'CommAdmit', 'CommStore', 'CommPipe'].forEach(function (n) { delete globalThis[n]; });
  return { STORE: require(path.join(dir, 'comm_store.js')), PIPE: require(path.join(dir, 'comm_pipe.js')) }; }
function mutantDir(file, needle, repl) { var d = fs.mkdtempSync(path.join(os.tmpdir(), 'rsgh_')), applied = 0;
  fs.readdirSync(COMM).filter(function (f) { return /\.js$/.test(f); }).forEach(function (f) { var s = fs.readFileSync(path.join(COMM, f), 'utf8'); if (f === file) { var p = s.split(needle); applied = p.length - 1; s = p.join(repl); } fs.writeFileSync(path.join(d, f), s); });
  return { dir: d, applied: applied }; }
function uid(s) { var h = nodeCrypto.createHash('sha1').update(s).digest('hex'); return h.slice(0, 8) + '-' + h.slice(8, 12) + '-4' + h.slice(13, 16) + '-8' + h.slice(17, 20) + '-' + h.slice(20, 32); }
function fields(x) { return Object.assign({ ad_client_id: 11, ad_org_id: 0 }, x || {}); }
function overlay(base, hide) { return { id: 'ov', stats: {}, put: async function () { return true; }, get: function (n) { return base.get(n); },
  list: async function (p) { return (await base.list(p)).filter(function (n) { return hide.indexOf(n) < 0; }); } }; }
function laned(S) { return S.query("SELECT op_hash, author_kid, target_table, target_uu FROM cl_op WHERE target_table IN ('t_up','t_down')"); }
function heldSet(S) { var h = {}; S.query('SELECT op_hash FROM cl_op').forEach(function (r) { h[r.op_hash] = 1; }); return h; }

// the host stub (same five callbacks as W-READ-SCOPE): hub role 102, station role 200; t_up -> hub, t_down -> the addressee's box
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

var SQL, TOKEN = null, CREATED = [], MEM = ARGS.indexOf('--mem') >= 0, MEMP = null;       // --mem: offline self-check of the fixture on an in-memory pipe (never a verdict: prints INCONCLUSIVE)
function mkPipe(E, kid) { if (MEM) return MEMP || (MEMP = E.PIPE.memPipe('rsgh')); return E.PIPE.ghPipe({ owner: OWNER, repo: REPO, token: TOKEN, self: kid, minGapMs: GAP }); }
async function ghApi(method, p) { var r = await fetch('https://api.github.com/repos/' + OWNER + '/' + REPO + p, { method: method, headers: { 'Authorization': 'Bearer ' + TOKEN, 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' } }); return r.status; }

// a world on the REAL pipe: hub H (0), stations X (1) and Y (2); one ghPipe per device (a device writes only its own branch dev/<kid>)
async function world(E, o) {
  var devs = []; for (var i = 0; i < 3; i++) { var d = await E.STORE.newDevice(); d.person_uu = nodeCrypto.randomUUID(); devs.push(d); }
  var sp = await E.STORE.newSpace('rsgh', devs[0], devs[0].person_uu, 'HQ', 102, { plan: 'pos' });
  var w = { E: E, devs: devs, persons: [devs[1].person_uu, devs[2].person_uu], addr: {}, space: sp.space, SP: 's/' + sp.space + '/', logs: [], ts: Date.now(), o: o };
  w.pipe = devs.map(function (d) { return mkPipe(E, d.kid); });
  devs.forEach(function (d, i) { if (!MEM) CREATED.push(w.pipe[i].branchOf(d.kid)); });
  w.open = function (i, oo, db) { oo = oo || {}; return E.STORE.open(db || new SQL.Database(), { SQL: SQL, space: sp.space, self: devs[i], access: function () { return { allowed: true }; }, log: function (m) { w.logs.push(String(m)); } }); };
  w.cfg = function (S, oo) { S.setMailbox(hostCfg(w, { holds: o.holds, all: !!(oo && oo.all) })); return S; };
  w.dbs = devs.map(function () { return new SQL.Database(); });
  w.S = devs.map(function (d, i) { return w.cfg(w.open(i, {}, w.dbs[i])); });
  var H = w.S[0]; await H.genesis(sp.params);
  await H.addPerson({ person_uu: devs[1].person_uu, name: 'Station X', ad_role_id: 200, comm_admin: false }); await H.enroll(devs[1].kid, devs[1].pubJwk, devs[1].person_uu, devs[1].dhPubJwk);
  await H.addPerson({ person_uu: devs[2].person_uu, name: 'Station Y', ad_role_id: 200, comm_admin: false }); await H.enroll(devs[2].kid, devs[2].pubJwk, devs[2].person_uu, devs[2].dhPubJwk);
  await H.setPolicy({ epoch: 1, visit_ms: 600000 });
  await H.sync(w.pipe[0]); await w.S[1].sync(w.pipe[1]); await w.S[2].sync(w.pipe[2]);
  return w;
}
// both stations send UP (X: 2 ops in one bundle), H sends DOWN to each + one note, everyone collects; then X sends 3 more single-op bundles (arm G's material)
async function traffic(w, withG) {
  var H = w.S[0], X = w.S[1], Y = w.S[2], ts = w.ts, p = w.pipe;
  var ux = uid('upx' + w.space);
  await X.author({ target: { table: 't_up', uu: ux }, intent: 'K2', ts: ts++, body: { op_type: 'CRUD_CREATE', params: { fields: fields({ documentno: 'SEALNEEDLE-UP-X1', amt: 10 }) } } });
  await X.author({ target: { table: 't_up', uu: ux }, intent: 'K2', ts: ts++, body: { op_type: 'CRUD_UPDATE', params: { changes: { amt: { old: 10, new: 11 } } } } });
  await X.sync(p[1]);
  await Y.author({ target: { table: 't_up', uu: uid('upy' + w.space) }, intent: 'K2', ts: ts++, body: { op_type: 'CRUD_CREATE', params: { fields: fields({ documentno: 'SEALNEEDLE-UP-Y', amt: 7 }) } } });
  await Y.sync(p[2]); await H.sync(p[0]);
  var dx = uid('downx' + w.space), dy = uid('downy' + w.space); w.addr[dx] = w.devs[1].person_uu; w.addr[dy] = w.devs[2].person_uu;
  await H.author({ target: { table: 't_down', uu: dx }, intent: 'K2', ts: ts++, body: { op_type: 'CRUD_CREATE', params: { fields: fields({ documentno: 'SEALNEEDLE-DOWN-X1' }) } } });
  await H.author({ target: { table: 't_down', uu: dy }, intent: 'K2', ts: ts++, body: { op_type: 'CRUD_CREATE', params: { fields: fields({ documentno: 'SEALNEEDLE-DOWN-Y' }) } } });
  await H.sync(p[0]); await X.sync(p[1]); await Y.sync(p[2]); await H.sync(p[0]);
  w.hubSnap = w.dbs[0].export();        // the hub's own database BEFORE X's last three bundles: each gap scene is a copy of the hub that has not yet seen them (a device never re-reads its own o/ objects, so a blank store of the hub device would have no roster)
  if (withG) for (var i = 1; i <= 3; i++) { await X.author({ target: { table: 't_up', uu: uid('g' + i + w.space) }, intent: 'K2', ts: ts++, body: { op_type: 'CRUD_CREATE', params: { fields: fields({ documentno: 'G' + i }) } } }); await X.sync(p[1]); }
  if (withG) await H.sync(p[0]);
  w.ts = ts; return w;
}
function ownerOf(w, r) { if (r.target_table === 't_down') return w.addr[String(r.target_uu).toLowerCase()]; var i = w.devs.findIndex(function (d) { return d.kid === r.author_kid; }); return w.devs[i].person_uu; }
function ownerPersonOf(w, kid) { return w.devs.find(function (d) { return d.kid === kid; }).person_uu; }

// arm A on one world: Y as a MODIFIED client = a fresh store opened with a host that reads every box, through a NEW ghPipe (nothing cached)
async function readAttack(w) {
  var H = w.S[0], pop = laned(H), yP = w.devs[2].person_uu, foreign = pop.filter(function (r) { return ownerOf(w, r) !== yP; });
  var Y2 = w.cfg(w.open(2, {}, new SQL.Database()), { all: true }), pipe = mkPipe(w.E, w.devs[2].kid);
  await Y2.sync(pipe); var yh = heldSet(Y2);
  return { H: H, pop: pop, foreign: foreign, leak: foreign.filter(function (r) { return yh[r.op_hash]; }).length, sealed: Y2.sealed().length, yh: yh, mine: pop.filter(function (r) { return ownerOf(w, r) === yP && r.author_kid !== w.devs[2].kid; }), bytes: pipe.stats.bytesGet };
}
// arm G on one world: a copy of the hub's own database taken before X's last three bundles arrived reads through a view of the real pipe that hides one of X's m/hub/ bundles
async function gapScene(w, hideIdx) {
  var xk = w.devs[1].kid, names = (await w.pipe[0].list(w.SP + 'm/hub/o/' + xk + '/')).sort(function (a, b) { return Number(a.split('/').pop().split('-')[0]) - Number(b.split('/').pop().split('-')[0]); });
  var seqsOf = {}; for (var n of names) seqsOf[n] = (await w.S[0].readBundle(await w.pipe[0].get(n))).map(function (r) { return r.env && r.env.box ? r.env.box.seq : null; });
  var hub = w.cfg(w.open(0, {}, new SQL.Database(w.hubSnap))), real = mkPipe(w.E, w.devs[0].kid);
  await hub.sync(overlay(real, hideIdx == null ? [] : [names[hideIdx]]));
  var dbg = { cl_op_laned: laned(hub).length, cl_box: hub.query('SELECT COUNT(*) AS n FROM cl_box')[0].n, cl_sealed: hub.sealed().length, head_boxes: hub.query('SELECT COUNT(*) AS n FROM cl_head_boxes')[0].n };
  console.log('   §RSGH_GAPSCENE hide=' + (hideIdx == null ? 'none' : hideIdx) + ' hub copy holds ' + JSON.stringify(dbg));
  return { names: names, seqsOf: seqsOf, gaps: hub.gaps(), xk: xk, dbg: dbg };
}

(async function main() {
  console.log('§RSGH-HEADER W-READ-SCOPE-GH repo=' + OWNER + '/' + REPO + ' gap_ms=' + GAP + ' node=' + process.version + ' at=' + new Date().toISOString());
  if (MEM) TOKEN = 'mem'; else try { TOKEN = cp.execSync('gh auth token', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch (e) { TOKEN = null; }
  if (!TOKEN) return verdict('INCONCLUSIVE', 'no GitHub token (gh auth token failed)');
  var probe; if (MEM) probe = 200; else try { probe = await ghApi('GET', ''); } catch (e) { return verdict('INCONCLUSIVE', 'no network: ' + e.message); }
  if (probe !== 200) return verdict('INCONCLUSIVE', 'relay repo not reachable (HTTP ' + probe + ')');
  SQL = await initSqlJs();
  var E = loadEngine(COMM), mut = mutantDir('comm_store.js', "if (box) env.box = box;", "if (false) env.box = box;");
  try {
    console.log('\n════ world 1: sealed mailbox space over GitHub ════');
    var w1 = await traffic(await world(E, {}), true); console.log('   §RSGH space=' + w1.space.slice(0, 12) + ' devices=' + w1.devs.map(function (d) { return d.kid.slice(0, 8); }).join(','));
    var a = await readAttack(w1);
    if (!a.foreign.length) vacuous('A', 'no laned op of another station to try to read');
    else {
      ok('A', a.leak === 0, 'Y (a modified client that lists and gets every m/ object through the real GitHub pipe) opens 0 of the ' + a.foreign.length + ' laned ops of X', 'leaked=' + a.leak + ' downloaded_sealed=' + a.sealed + ' bytes_from_github=' + a.bytes);
      ok('A', a.sealed >= a.foreign.length, 'the attack really happened: all of them sit in Y\'s cl_sealed, unopened', 'cl_sealed=' + a.sealed + ' foreign=' + a.foreign.length);
      ok('A', a.mine.length > 0 && a.mine.every(function (r) { return a.yh[r.op_hash]; }), 'Y opens its OWN pair\'s mail (reading works)', 'own DOWN mail=' + a.mine.length);
      var allOwn = []; w1.S.forEach(function (S) { S.query("SELECT op_hash FROM cl_op WHERE state='OWN' AND target_table IN ('t_up','t_down')").forEach(function (r) { allOwn.push(r.op_hash); }); });
      var hh = heldSet(w1.S[0]); ok('A', allOwn.length > 0 && allOwn.every(function (h) { return hh[h]; }), 'H (hub) opens every laned op ever authored', allOwn.length + ' ops');
    }
    // arm G (world 1)
    var none = await gapScene(w1, null);
    if (none.names.length < 4) vacuous('G', 'X produced ' + none.names.length + ' mailbox bundles on GitHub, need 4');
    else {
      var midI = none.names.length - 2, lastI = none.names.length - 1, mid = await gapScene(w1, midI), last = await gapScene(w1, lastI);
      var expMid = none.seqsOf[none.names[midI]], expLast = none.seqsOf[none.names[lastI]];
      console.log('   §RSGH bundles of X under m/hub/ on GitHub=' + none.names.length + ' box seqs per bundle=' + JSON.stringify(none.names.map(function (n) { return none.seqsOf[n]; })));
      ok('G', none.gaps.length === 0, 'CONTROL: nothing withheld -> gaps() = []', JSON.stringify(none.gaps));
      ok('G', expMid.length > 0 && expMid.every(function (s) { return s != null; }) && mid.gaps.length === expMid.length && mid.gaps.every(function (g) { return g.author === mid.xk && g.box === 'hub' && expMid.indexOf(g.seq) >= 0; }),
        'the relay withholds X\'s MIDDLE m/hub/ bundle -> gaps() = exactly its box seq(s) ' + JSON.stringify(expMid), JSON.stringify(mid.gaps).slice(0, 200));
      ok('G', expLast.length > 0 && last.gaps.length === expLast.length && last.gaps.every(function (g) { return g.author === last.xk && g.box === 'hub' && expLast.indexOf(g.seq) >= 0; }),
        'the relay withholds X\'s LAST bundle -> reported from X\'s signed head `boxes`: ' + JSON.stringify(expLast), JSON.stringify(last.gaps).slice(0, 200));
    }
    // CONTROL for A: audience sealing off (F1-style space key) over the same GitHub relay
    console.log('\n════ world 2 (CONTROL for A): host without `holds` = audience sealing off ════');
    var w2 = await traffic(await world(E, { holds: false }), false), c = await readAttack(w2);
    ok('A', c.foreign.length > 0 && c.leak === c.foreign.length, 'CONTROL: with audience sealing off the same Y opens ' + c.foreign.length + ' of ' + c.foreign.length + ' over GitHub (so the isolation above is the sealing, not the fixture)', 'opened=' + c.leak + '/' + c.foreign.length);
    // CONTROL for G: a mutant engine with no `box` field -> the same withholding is invisible
    console.log('\n════ world 3 (CONTROL for G): mutant engine, no `box` in the envelope (needle count ' + mut.applied + ') ════');
    if (mut.applied !== 1) vacuous('G', 'mutant NOT APPLIED EXACTLY ONCE (count ' + mut.applied + ')');
    else {
      var E3 = loadEngine(mut.dir), w3 = await world(E3, {}); w3.hubSnap = w3.dbs[0].export();
      for (var i = 1; i <= 3; i++) { await w3.S[1].author({ target: { table: 't_up', uu: uid('m' + i + w3.space) }, intent: 'K2', ts: w3.ts++, body: { op_type: 'CRUD_CREATE', params: { fields: fields({ documentno: 'M' + i }) } } }); await w3.S[1].sync(w3.pipe[1]); }
      var mg = await gapScene(w3, 1);
      ok('G', mg.names.length === 3 && mg.gaps.length === 0, 'CONTROL (engine without `box`, same middle withholding over GitHub): gaps() = [] - the check can go red', 'bundles=' + mg.names.length + ' gaps=' + JSON.stringify(mg.gaps));
    }
  } catch (e) { console.log('   CRASH ' + (e && e.stack || e)); C.inc++; }
  finally { for (var b of CREATED) { var st = await ghApi('DELETE', '/git/refs/heads/' + b).catch(function () { return 'err'; }); console.log('   §RSGH cleanup ' + b.slice(0, 12) + ' -> ' + st); } }
  console.log('\n§RSGH-ARMS ' + JSON.stringify(C.arms));
  ['A', 'G'].forEach(function (x) { var s = C.arms[x]; if (!s || s.pass + s.fail === 0) { if (!s || !s.inc) vacuous(x, 'arm ' + x + ' judged nothing'); } });
  if (MEM) return verdict('INCONCLUSIVE', '--mem is a fixture self-check on an in-memory pipe, not the GitHub relay');
  verdict(C.fails ? 'FAIL' : (C.inc || !C.judged) ? 'INCONCLUSIVE' : 'PASS');
})();
