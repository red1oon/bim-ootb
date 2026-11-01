// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — Scope guard
// W-PIPE-RETRY — BIMCompiler prompts/TEAMWORK_FRAMEWORK.md §45.14a.
// ISSUE IT PROVES OR DISPROVES: "one dropped request fails the whole Visit" (§45.14: on a 2 %-loss line only 29 % of catch-up Visits got through at 100
//   users). After §45.14a ghPipe retries ONE request (connection dropped or 5xx), at most twice, and never retries an answer (2xx/3xx/4xx).
// Instrument: the REAL common/comm/comm_pipe.js ghPipe against common/tests/gh_standin.js (in-process), with a fetch that drops / fails chosen requests.
//   R1 one dropped request inside putMany → putMany succeeds, read back equal, exactly +1 request vs the clean control
//   R2 one dropped GET inside list → the list is complete
//   R3 one 503 → retried, succeeds
//   R4 a 404 answer (a new device's branch does not exist yet) → NOT retried (asked once)
//   R5 the same request dropped 3 times in a row → putMany throws after 3 attempts (bounded)
//   M1 MUTANT retries off (RETRIES_DEFAULT = 0 in a copy of the file) → R1's scenario throws (the instrument can see the defect)
// READ THE LOG: node common/tests/witness_pipe_retry.js > log 2>&1   (exit code is not evidence)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const ROOT = path.join(__dirname, '..', '..'), PIPE_SRC = path.join(ROOT, 'common', 'comm', 'comm_pipe.js'), STAND = require('./gh_standin.js');
const SP = 's/' + 'a'.repeat(64) + '/';
function loadPipe(mutant) {
  let src = fs.readFileSync(PIPE_SRC, 'utf8'), hits = 0;
  if (mutant) { src = src.replace('var RETRIES_DEFAULT = 2,', function () { hits++; return 'var RETRIES_DEFAULT = 0,'; }); }
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wpr_')), 'comm_pipe.js'); fs.writeFileSync(f, src);
  delete global.CommPipe; const m = require(f); return { api: m.ghPipe ? m : global.CommPipe, hits: hits };
}
// a fetch that records every request and lets a rule drop (throw) or fail (503) a chosen one
function rigFetch(rule) {
  const log = [];
  const f = async function (url, init) {
    const u = new URL(url), key = (init && init.method || 'GET') + ' ' + u.pathname.replace(/^\/repos\/[^/]+\/[^/]+/, '').replace(/[0-9a-f]{40}/g, ':sha').replace(/dev\/[0-9a-z]+/g, 'dev/:kid');
    log.push(key); const act = rule ? rule(key, log) : null;
    if (act === 'drop') throw new TypeError('fetch failed (witness drop)');
    if (act === '503') return new Response('{"message":"unavailable"}', { status: 503, headers: { 'Content-Type': 'application/json' } });
    return fetch(url, init);
  };
  f.log = log; return f;
}
function nth(key, k) { let seen = 0; return function (kk) { if (kk !== key) return null; seen++; return seen === k ? 'drop' : null; }; }
let pass = 0, fail = 0, judged = 0;
const ok = (id, c, label, extra) => { judged++; console.log('§WPR ' + id + ' ' + (c ? 'PASS' : 'FAIL') + ' ' + label + (extra ? ' — ' + extra : '')); c ? pass++ : fail++; };
const capture = []; const _log = console.log; console.log = function () { const s = Array.prototype.join.call(arguments, ' '); if (/^§PIPE-RETRY/.test(s)) capture.push(s); _log.apply(console, arguments); };

async function scenario(P, rule, kid) {   // one device: a Visit's write (bundle + head), then a second device reads it back
  const gh = await STAND.start(), api = 'http://127.0.0.1:' + gh.port, rf = rigFetch(rule);
  const A = P.ghPipe({ api: api, owner: 'o', repo: 'r', token: 't', self: kid || 'ab12', fetch: rf, minGapMs: 0 });
  const B = P.ghPipe({ api: api, owner: 'o', repo: 'r', token: 't', self: 'cd34', minGapMs: 0 });
  const bundle = new Uint8Array([1, 2, 3, 4, 5]), name = SP + 'o/' + (kid || 'ab12') + '/1-2.x.bimpack';
  let err = null; try { await A.putMany([{ name: name, bytes: bundle }, { name: SP + 'h/' + (kid || 'ab12'), bytes: new Uint8Array([9]) }]); } catch (e) { err = e; }
  let back = null; try { back = await B.get(name); } catch (e) {}
  gh.close(); return { err: err, back: back ? Array.from(back) : null, reqs: rf.log.length, log: rf.log, retries: A.stats.retries || 0 };
}
async function listScenario(P, rule) {
  const gh = await STAND.start(), api = 'http://127.0.0.1:' + gh.port, rf = rigFetch(rule);
  const W = P.ghPipe({ api: api, owner: 'o', repo: 'r', token: 't', self: 'ef56', minGapMs: 0 });
  await W.putMany([{ name: SP + 'h/ef56', bytes: new Uint8Array([7]) }]);
  const R = P.ghPipe({ api: api, owner: 'o', repo: 'r', token: 't', self: 'cd34', fetch: rf, minGapMs: 0 });
  let l = null, err = null; try { l = await R.list(SP + 'h/'); } catch (e) { err = e; }
  gh.close(); return { list: l, err: err, reqs: rf.log.length };
}

(async () => {
  console.log('§WPR_HEADER W-PIPE-RETRY pipe=' + PIPE_SRC + ' node=' + process.version);
  const P = loadPipe(false).api;
  const ctl = await scenario(P, null);
  console.log('§WPR CONTROL clean Visit write: err=' + (ctl.err && ctl.err.message) + ' reqs=' + ctl.reqs + ' back=' + JSON.stringify(ctl.back) + ' requests=' + JSON.stringify(ctl.log));
  if (ctl.err || JSON.stringify(ctl.back) !== '[1,2,3,4,5]') { console.log('§WPR_VERDICT INCONCLUSIVE judged=0 (the clean control failed: the instrument cannot judge)'); process.exit(2); }
  const r1 = await scenario(P, nth('POST /git/trees', 1));
  ok('R1', !r1.err && JSON.stringify(r1.back) === '[1,2,3,4,5]' && r1.reqs === ctl.reqs + 1 && r1.retries === 1, 'one dropped tree POST inside putMany → write succeeds, read back equal, +1 request', JSON.stringify({ err: r1.err && r1.err.message, back: r1.back, reqs: r1.reqs, control: ctl.reqs, retries: r1.retries }));
  const lctl = await listScenario(P, null), r2 = await listScenario(P, nth('GET /git/matching-refs/heads/dev/', 1));
  ok('R2', !r2.err && JSON.stringify(r2.list) === JSON.stringify(lctl.list) && r2.list.length === 1 && r2.reqs === lctl.reqs + 1, 'one dropped list GET → list complete, +1 request', JSON.stringify({ list: r2.list, control: lctl.list, reqs: r2.reqs, controlReqs: lctl.reqs, err: r2.err && r2.err.message }));
  let n503 = 0; const r3 = await scenario(P, function (k) { if (k === 'POST /git/blobs' && n503 === 0) { n503++; return '503'; } return null; });
  ok('R3', !r3.err && JSON.stringify(r3.back) === '[1,2,3,4,5]' && r3.retries === 1, 'one 503 on a blob POST → retried, write succeeds', JSON.stringify({ err: r3.err && r3.err.message, retries: r3.retries, reqs: r3.reqs }));
  const refGets = ctl.log.filter(function (k) { return k === 'GET /git/ref/heads/dev/:kid'; }).length, r4retry = capture.filter(function (l) { return /path=\/git\/ref\/heads\//.test(l); }).length;
  ok('R4', refGets === 1 && r4retry === 0, 'a 404 answer (new device: its branch does not exist yet) is asked ONCE, never retried', JSON.stringify({ refGets: refGets, retryLinesForRef: r4retry }));
  const r5 = await scenario(P, function (k, log) { return k === 'POST /git/trees' ? 'drop' : null; });
  const r5tries = r5.log.filter(function (k) { return k === 'POST /git/trees'; }).length;
  ok('R5', !!r5.err && r5tries === 3, 'the same request dropped every time → putMany throws after exactly 3 attempts (bounded)', JSON.stringify({ err: r5.err && r5.err.message, treeAttempts: r5tries }));
  const MU = loadPipe(true);
  if (MU.hits !== 1) console.log('§WPR M1 VACUOUS the mutant did not apply (hits=' + MU.hits + ')');
  else { const m1 = await scenario(MU.api, nth('POST /git/trees', 1));
    ok('M1', !!m1.err, 'MUTANT retries off → the same single drop fails the write (the defect §45.14 measured)', JSON.stringify({ err: m1.err && m1.err.message, retries: m1.retries })); }
  console.log('§WPR_VERDICT ' + (fail ? 'FAIL' : 'PASS') + ' judged=' + judged + ' fails=' + fail + ' retry_lines=' + capture.length);
  process.exit(fail ? 1 : 0);
})().catch(function (e) { console.log('§WPR_VERDICT INCONCLUSIVE FATAL ' + (e && e.stack)); process.exit(2); });
