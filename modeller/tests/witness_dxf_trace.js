// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-DXF-TRACE (bim-compiler prompts/CODE_ARCHITECTURE_DESIGN.md §F.21 slice 1, decision F-15). READ THE LOG after every run: the §DXF_TRACE_W lines carry the evidence, the exit code does not.
// THE ISSUE it proves/disproves: a body on the Modeller canvas carries its DXF handle / layer / sheet, but NOTHING says which line of code built it, so a wrong body cannot be traced to
//   the rule that made it (the 2D -> BIM accuracy question). The dev trace switch (Dxf2Prep.trace, CLI --trace) must name ONE source line per body and leave the model untouched.
//   T1 the switch changes no data: bodies.json, ops.json, verdict.json sha-256 identical with --trace off and on
//   T2 coverage: every body of the shed has a key (untraced=0); a body no builder claimed is listed by §DXF_TRACE_UNTRACED in the CLI log
//   T3 every key resolves to exactly ONE trace('<key>', ...) call in modeller/*.js (espree parse, not text search): printed as §DXF_TRACE_KEY key= bodies= at=<file>:<line>
//   T4 RED CONTROL: the T2 judge given the map with one key's bodies removed must report untraced > 0 (a judge that always says 0 is not a judge)
//   T5 OFF: with no map installed, Dxf2Prep.trace returns the body unchanged and installs nothing
// Input: the CLI-marked shed set (SHED_MARKED, default ~/Videos/dxf2bim_film_work/why/cli/marked); missing -> §SKIP (nothing judged). Zero bodies -> INCONCLUSIVE.
// Run: NODE_PATH=~/bim-compiler/node_modules SHED_MARKED=<dir> node modeller/tests/witness_dxf_trace.js < /dev/null > <log>
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process'), crypto = require('crypto');
const M = path.join(__dirname, '..'), CLI = path.join(M, 'dxf2bim_cli.js');
const MK = process.env.SHED_MARKED || path.join(os.homedir(), 'Videos', 'dxf2bim_film_work', 'why', 'cli', 'marked');
let fail = 0; const ok = (n, c, i) => { console.log((c ? 'PASS ' : 'FAIL ') + n + (i ? '  ' + i : '')); if (!c) fail++; };
if (!fs.existsSync(MK)) { console.log('§SKIP W-DXF-TRACE no marked shed set at ' + MK); process.exit(0); }
const sheets = fs.readdirSync(MK).filter(f => /\.dxf$/i.test(f)).sort().map(f => path.join(MK, f));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'w_dxf_trace_'));
const cli = (out, extra) => cp.spawnSync('node', [CLI, '--sheets', ...sheets, '--out', out, '--pack', 'pwd2024_bd', '--complete'].concat(extra), { encoding: 'utf8', env: process.env, maxBuffer: 1 << 28 });
const sha = f => fs.existsSync(f) ? crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex').slice(0, 16) : 'missing';

// T1 — off vs on
const offDir = path.join(tmp, 'off'), onDir = path.join(tmp, 'on');
const rOff = cli(offDir, []), rOn = cli(onDir, ['--trace']);
const files = ['bodies.json', 'ops.json', 'verdict.json'], sOff = files.map(f => sha(path.join(offDir, f))), sOn = files.map(f => sha(path.join(onDir, f)));
const same = files.every((f, i) => sOff[i] === sOn[i] && sOff[i] !== 'missing');
console.log('§DXF_TRACE_W T1 off=' + sOff.join(',') + ' on=' + sOn.join(',') + ' exit_off=' + rOff.status + ' exit_on=' + rOn.status + ' identical=' + (same ? 'Y' : 'N'));
ok('T1 the trace switch changes no model file (bodies/ops/verdict sha-256 off == on)', same, files.join(','));

// T2 — coverage over every body (the judge is a function so T4 can feed it a broken map)
const bodies = JSON.parse(fs.readFileSync(path.join(onDir, 'bodies.json'), 'utf8'));
const trace = fs.existsSync(path.join(onDir, 'trace.json')) ? JSON.parse(fs.readFileSync(path.join(onDir, 'trace.json'), 'utf8')).trace : {};
const judge = (bs, t) => bs.filter(b => !t[b.guid]);
const un = judge(bodies, trace), cliLine = ((rOn.stdout || '').match(/§DXF_TRACE elements=.*/) || ['(no §DXF_TRACE line)'])[0];
console.log('§DXF_TRACE_W T2 bodies=' + bodies.length + ' untraced=' + un.length + ' cli="' + cliLine + '"');
if (!bodies.length) { console.log('§DXF_TRACE_W VERDICT INCONCLUSIVE no bodies judged'); process.exit(2); }
ok('T2 every body names the line that built it (untraced=0)', un.length === 0, un.slice(0, 5).map(b => b.guid + '/' + b.class).join(' '));

// T3 — every key resolves to exactly one trace('<key>', ...) call (espree AST over modeller/*.js)
const espree = (() => { for (const m of ['espree', path.join(M, '..', 'node_modules', 'espree'), path.join(os.homedir(), 'bim-ootb', 'node_modules', 'espree')]) { try { return require(m); } catch (e) {} } return null; })();
const sites = {};
if (espree) {
  fs.readdirSync(M).filter(f => /\.js$/.test(f)).forEach(f => {
    let ast; try { ast = espree.parse(fs.readFileSync(path.join(M, f), 'utf8'), { ecmaVersion: 'latest', loc: true }); } catch (e) { return; }
    (function walk(n) {
      if (!n || typeof n.type !== 'string') return;
      if (n.type === 'CallExpression' && n.arguments.length >= 2 && n.arguments[0].type === 'Literal' && typeof n.arguments[0].value === 'string' &&
          ((n.callee.type === 'MemberExpression' && n.callee.property.name === 'trace') || (n.callee.type === 'Identifier' && n.callee.name === '_trace')))
        (sites[n.arguments[0].value] = sites[n.arguments[0].value] || []).push(f + ':' + n.loc.start.line);
      for (const k in n) { if (k === 'loc' || k === 'range') continue; const v = n[k]; if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') walk(v); }
    })(ast);
  });
}
const used = {}; Object.values(trace).forEach(k => { const first = String(k).split(' > ')[0]; used[first] = (used[first] || 0) + 1; });
let resolved = 0; Object.keys(used).sort().forEach(k => { const at = sites[k] || []; if (at.length === 1) resolved++; console.log('§DXF_TRACE_KEY key=' + k + ' bodies=' + used[k] + ' at=' + (at.join(',') || 'NOT-FOUND')); });
console.log('§DXF_TRACE_W T3 keys=' + Object.keys(used).length + ' resolved=' + resolved + ' stamp_sites=' + Object.values(sites).reduce((a, s) => a + s.length, 0) + ' parser=' + (espree ? 'espree' : 'MISSING'));
ok('T3 every key resolves to exactly one source line', !!espree && Object.keys(used).length > 0 && resolved === Object.keys(used).length);

// T4 — red control: drop one key's bodies, the judge must see them
const drop = Object.keys(used)[0], broken = Object.assign({}, trace); Object.keys(broken).forEach(g => { if (String(broken[g]).split(' > ')[0] === drop) delete broken[g]; });
const un4 = judge(bodies, broken).length;
console.log('§DXF_TRACE_W T4 red-control dropped=' + drop + ' untraced=' + un4 + ' (want ' + (used[drop] || 0) + ')');
ok('T4 red control: the judge reports the bodies of a removed key', un4 > 0 && un4 === used[drop]);

// T5 — OFF: no map, nothing recorded, the body is returned as is
delete globalThis.__DXF_TRACE;
const P = require(path.join(M, 'dxf2prep.js')), el = { guid: 'g-off' }, back = P.trace('witness:off', el);
ok('T5 off: trace returns the same body and installs nothing', back === el && typeof globalThis.__DXF_TRACE === 'undefined');

console.log('§DXF_TRACE_W VERDICT ' + (fail ? 'FAIL' : 'PASS') + ' bodies=' + bodies.length + ' keys=' + Object.keys(used).length + ' fail=' + fail);
process.exit(fail ? 1 : 0);
