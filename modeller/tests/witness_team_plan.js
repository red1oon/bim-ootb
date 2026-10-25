#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — Scope: W-PLAN-MODELLER, bim-compiler prompts/TEAMWORK_FRAMEWORK.md §24 (step 5a: the Modeller's shared-op list is DERIVED from the compiled plan). READ THE LOG after every run —
//   the exit code is not evidence. The REAL modeller/modeller.html in headless Chromium (software GL, no GPU), opened with ?team=1; every number is read from the live page
//   (TeamSyncModeller.classes(), the §TEAM_PLAN console line); the plan is served from the repo or replaced by request interception. Every arm names the issue it proves or disproves.
//   §P1 equivalence   — the committed plan yields EXACTLY the old literal list ("the move to rows changed what is shared").
//   §P2 zero-code     — one more list value in the plan is shared with team_sync.js byte-identical ("adding an op type needs adapter code").
//   §P3 fail closed   — no plan => nothing shared + a visible log line ("a stale built-in list silently shares").
//   §P4 plan decides  — a plan without pos_x|y|z shares no move; a hub-audience flow shares nothing ("the adapter ignores what the plan says").
//   §P5 provenance    — the §TEAM_PLAN line carries the plan hash that the generated file's header states.   §P6 0 page errors.
//   §MUTANTS          — the adapter is served with one rule broken; each must turn >= 1 arm red.
// Run: node modeller/tests/witness_team_plan.js 2>&1 | tee /tmp/witness_team_plan.log
'use strict';
var path = require('path'), http = require('http'), fs = require('fs'), crypto = require('crypto'), vm = require('vm');
var ROOT = path.join(__dirname, '..', '..');
var MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.css': 'text/css' };
function reqPw() { try { return require('playwright'); } catch (e) { return require('/home/red1/bim-ootb/tests/node_modules/playwright'); } }
var OLD = { GEOM_INSERT: 'create', GEOM_EXTRUDE: 'create', GEOM_EXTRUDE_POLY: 'create', GEOM_SWEEP: 'create', GEOM_LOFT: 'create', GEOM_REVOLVE: 'create', GEOM_MOVE: 'move' };   // the literal at origin/main 4e95b393 modeller/team_sync.js:25
var fails = 0, judged = 0, errors = 0;
function verdict(ok, label, detail) { judged++; if (!ok) fails++; console.log('   ' + (ok ? '🟢' : '🔴') + ' ' + label + (detail ? ' — ' + detail : '')); return ok; }
function sha(b) { return crypto.createHash('sha256').update(b).digest('hex').slice(0, 12); }
function same(a, b) { return JSON.stringify(Object.keys(a).sort().map(function (k) { return [k, a[k]]; })) === JSON.stringify(Object.keys(b).sort().map(function (k) { return [k, b[k]]; })); }

var PLAN_SRC = fs.readFileSync(path.join(ROOT, 'modeller', 'team_plan.js'), 'utf8'), ADAPTER = fs.readFileSync(path.join(ROOT, 'modeller', 'team_sync.js'), 'utf8');
var PLAN = (function () { var g = {}; vm.runInNewContext(PLAN_SRC, { window: g, globalThis: g }); return g.TEAM_PLAN; })();
var HDR_HASH = /Plan sha256 ([0-9a-f]{64})/.exec(PLAN_SRC)[1];
function planJs(o) { return '(function (g) { g.TEAM_PLAN = ' + JSON.stringify(o) + '; })(typeof window !== \'undefined\' ? window : globalThis);\n'; }
function variant(fn) { var o = JSON.parse(JSON.stringify(PLAN)); fn(o); return planJs(o); }
var VARIANTS = {
  committed: null,
  extra: variant(function (o) { o.flows[0].payload.filter(function (p) { return p.col === 'geom_op'; })[0].values.push('GEOM_FOO'); }),
  nomove: variant(function (o) { o.flows[0].payload = o.flows[0].payload.filter(function (p) { return p.col !== 'pos_x'; }); }),
  hubonly: variant(function (o) { o.flows[0].audience = 'hub'; }),
  missing: 404
};
// adapter mutants: one broken rule each (served in place of team_sync.js)
var LITERAL = "var CLASS = { GEOM_INSERT: 'create', GEOM_EXTRUDE: 'create', GEOM_EXTRUDE_POLY: 'create', GEOM_SWEEP: 'create', GEOM_LOFT: 'create', GEOM_REVOLVE: 'create', GEOM_MOVE: 'move' }; (function () {";
var MUTANTS = [['literal list reinstated (plan ignored)', ADAPTER.replace('var CLASS = (function () {', LITERAL).replace("return c;\n  })();", "return c;\n  })(); void 0;").replace(/var CLASS = \{ GEOM_INSERT[^\n]*\(function \(\) \{/, "var CLASS = { GEOM_INSERT: 'create', GEOM_EXTRUDE: 'create', GEOM_EXTRUDE_POLY: 'create', GEOM_SWEEP: 'create', GEOM_LOFT: 'create', GEOM_REVOLVE: 'create', GEOM_MOVE: 'move' }; var _unused = (function () {")],
  ['audience ignored', ADAPTER.replace(" && x.audience === 'space'", '')],
  ['plan hash not logged', ADAPTER.replace("'§TEAM_PLAN hash=' + P.hash.slice(0, 12) + ' creates='", "'§TEAM_PLAN creates='")]];

(async function () {
  console.log('═══ W-PLAN-MODELLER — the Modeller adapter derives its shared-op list from the compiled plan (TEAMWORK_FRAMEWORK §24) ═══\n');
  var cur = { plan: null, adapter: null };
  var server = http.createServer(function (req, res) {
    var p = decodeURIComponent(new URL(req.url, 'http://x').pathname), f = path.join(ROOT, p === '/' ? '/modeller/modeller.html' : p);
    if (p === '/modeller/team_plan.js' && cur.plan !== null) { if (cur.plan === 404) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'Content-Type': 'text/javascript' }); res.end(cur.plan); return; }
    if (p === '/modeller/team_sync.js' && cur.adapter) { res.writeHead(200, { 'Content-Type': 'text/javascript' }); res.end(cur.adapter); return; }
    if (f.indexOf(ROOT) !== 0 || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
  });
  await new Promise(function (r) { server.listen(0, '127.0.0.1', r); });
  var base = 'http://127.0.0.1:' + server.address().port;
  var browser = await reqPw().chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-gpu'] });
  async function load(planKey, adapterSrc) {                                    // -> { classes, logs, errs, served }
    cur.plan = VARIANTS[planKey]; cur.adapter = adapterSrc || null;
    var ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } }), pg = await ctx.newPage(), logs = [], errs = [], served = null;
    pg.on('console', function (m) { logs.push(m.text()); }); pg.on('pageerror', function (e) { errs.push(e.message); errors++; });
    pg.on('response', function (r) { if (/\/modeller\/team_sync\.js/.test(r.url())) r.body().then(function (b) { served = sha(b); }).catch(function () {}); });
    await pg.goto(base + '/modeller/modeller.html?team=1', { waitUntil: 'load' });
    await pg.waitForFunction(function () { return window.TeamSyncModeller && typeof window.TeamSyncModeller.classes === 'function'; }, null, { timeout: 90000 });
    await new Promise(function (r) { setTimeout(r, 400); });
    var classes = await pg.evaluate(function () { return window.TeamSyncModeller.classes(); });
    await ctx.close(); return { classes: classes, logs: logs.filter(function (l) { return /§TEAM_PLAN/.test(l); }), errs: errs, served: served };
  }
  // arms as a function so the mutants can re-run them against a broken adapter; returns names of red arms
  async function arms(adapterSrc, quiet) {
    var red = [], R = {};
    function A(name, ok, label, detail) { if (!ok) red.push(name); if (!quiet) verdict(ok, label, detail); return ok; }
    for (var k of Object.keys(VARIANTS)) R[k] = await load(k, adapterSrc);
    var c = R.committed;
    if (!quiet) console.log('§P1 equivalence');
    A('P1', same(c.classes, OLD), 'the committed plan yields exactly the old literal list (6 creates + GEOM_MOVE)', Object.keys(c.classes).length + ' keys; ' + (same(c.classes, OLD) ? 'equal' : 'DIFF ' + JSON.stringify(c.classes)));
    if (!quiet) console.log('§P2 zero-code');
    A('P2', R.extra.classes.GEOM_FOO === 'create' && Object.keys(R.extra.classes).length === 8 && R.extra.classes.GEOM_ROTATE === undefined, 'one more list value in the plan is shared (GEOM_FOO=create), GEOM_ROTATE still is not', JSON.stringify(R.extra.classes.GEOM_FOO) + ' keys=' + Object.keys(R.extra.classes).length);
    A('P2', !!R.extra.served && R.extra.served === c.served, 'team_sync.js served byte-identical in both runs (no adapter change)', c.served + ' = ' + R.extra.served);
    if (!quiet) console.log('§P3 fail closed');
    A('P3', Object.keys(R.missing.classes).length === 0 && R.missing.logs.some(function (l) { return /missing — nothing is shared/.test(l); }), 'no plan => nothing shared and a visible log line', 'classes=' + JSON.stringify(R.missing.classes) + ' log=' + JSON.stringify(R.missing.logs));
    if (!quiet) console.log('§P4 the plan decides');
    A('P4', R.nomove.classes.GEOM_MOVE === undefined && Object.keys(R.nomove.classes).length === 6, 'a plan that does not carry pos_x shares no move; the 6 creates stay', JSON.stringify(Object.keys(R.nomove.classes).length) + ' keys, move=' + R.nomove.classes.GEOM_MOVE);
    A('P4', Object.keys(R.hubonly.classes).length === 0, 'a hub-audience flow on the same table shares nothing in the Modeller (only audience space)', JSON.stringify(R.hubonly.classes));
    if (!quiet) console.log('§P5 provenance');
    A('P5', c.logs.some(function (l) { return l.indexOf('hash=' + HDR_HASH.slice(0, 12)) !== -1 && /creates=6 move=pos_x\|pos_y\|pos_z/.test(l); }), 'the §TEAM_PLAN line states the hash in the generated file header, 6 creates and the move columns', JSON.stringify(c.logs) + ' header=' + HDR_HASH.slice(0, 12));
    var errN = Object.keys(R).reduce(function (n, k) { return n + R[k].errs.length; }, 0);
    if (!quiet) console.log('§P6 page errors');
    A('P6', errN === 0, 'zero page errors across all ' + Object.keys(R).length + ' loads', 'errors=' + errN);
    return red;
  }
  try {
    await arms(null, false);
    console.log('§MUTANTS (the adapter is served with one rule broken; each must turn at least one arm red)');
    for (var m of MUTANTS) { var red = await arms(m[1], true); verdict(red.length > 0, m[0] + ' -> red arms: ' + (red.length ? Array.from(new Set(red)).join(', ') : 'NONE (survivor = hole)')); }
  } finally { await browser.close(); server.close(); }
  console.log('\n§W-PLAN-MODELLER ' + (fails ? 'FAIL' : judged ? 'PASS' : 'INCONCLUSIVE') + ' judged=' + judged + ' fails=' + fails + ' pageerrors=' + errors + '  (plan unsigned: §16.13 Q1)');
  process.exit(fails ? 1 : 0);
})().catch(function (e) { console.error('🔴 witness crashed', e); process.exit(2); });
