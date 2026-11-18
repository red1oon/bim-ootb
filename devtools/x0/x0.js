#!/usr/bin/env node
// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — SPEC: bim-compiler prompts/CODE_ARCHITECTURE_DESIGN.md §F.36 (owner F-25: an `x0` terminal command with its OWN help,
//   not a group in the red1 help, which every page loads). Witness: devtools/x0/tests/witness_x0_cli.js (W-X0-CLI).
// ISSUE: the X0 facts (where a field is set, what a §TAG means, how a file is loaded, …) were reachable only from VS Code and from an MCP client.
// WHAT:  the same facts in a terminal, from the SAME implementation: the facts server's TOOLS (devtools/mcp/x0-facts/server.js), so the
//        three front ends (editor, MCP, terminal) cannot disagree. Read-only, except `x0 bump`, which IS scripts/bump.js. Plain node, no npm,
//        no network module, named by no page / loader / sw.js: nothing here reaches the browser.
// USE:   node devtools/x0/x0.js help · node devtools/x0/x0.js where camera · … --root <bim-ootb> --compiler-root <bim-compiler>
'use strict';
const path = require('path'), cp = require('child_process');
const argv = process.argv.slice(2);
const flags = new Set(['--root', '--compiler-root', '--extra-logs']);
const pos = argv.filter((a, i) => !flags.has(a) && !flags.has(argv[i - 1]));
const S = require(path.join(__dirname, '..', 'mcp', 'x0-facts', 'server.js'));   // reads --root / --compiler-root from the same argv
const tool = n => S.TOOLS.find(t => t.name === n);

// verb -> [tool, argument name, what it answers, a typed example]
const VERBS = [
  ['where', 'where_is_field_set', 'field', 'where APP.<field> is written', 'x0 where camera'],
  ['uses', 'where_is_field_used', 'field', 'every write and read of APP.<field>', 'x0 uses camera'],
  ['tag', 'what_is_tag', 'tag', 'what a §TAG means and who prints it', 'x0 tag §BUMP'],
  ['loaded', 'how_is_file_loaded', 'file', 'how a file reaches a user (start-up, offline, lazy)', 'x0 loaded viewer/scene.js'],
  ['cost', 'cost_if_deployed', 'base', 'what a deploy of your changes would cost users', 'x0 cost origin/main'],
  ['last', 'last_logged_value', 'file', 'the last logged § values of a file', 'x0 last viewer/scene.js'],
  ['context', 'context_for_file', 'file', 'everything the indexes say about one file', 'x0 context viewer/cost_panel.js'],
  ['check', 'ship_check', 'base', 'the pre-ship checks, stop at the first failure', 'x0 check'],
];
const EXTRA = [
  ['pure', 'the core-purity scan (W-CORE-PURE), its verdict line', 'x0 pure'],
  ['bump', 'scripts/bump.js with your arguments (dry run unless --write)', 'x0 bump modeller/arc_editable.js'],
];
function help(verb) {
  if (verb) {
    const v = VERBS.find(x => x[0] === verb); if (v) return 'x0 ' + v[0] + ' <' + v[2] + '>: ' + tool(v[1]).description + '\n';
    const e = EXTRA.find(x => x[0] === verb); if (e) return 'x0 ' + e[0] + ': ' + e[1] + '\n';
    return null;
  }
  const rows = VERBS.map(v => [v[0], v[3], v[4]]).concat(EXTRA);
  const w0 = Math.max(...rows.map(r => r[0].length)), w1 = Math.max(...rows.map(r => r[1].length));
  return 'x0: facts about this codebase from its own indexes (the same answers as X0 Navigator and the x0-facts server).\n' +
    rows.map(r => '  ' + r[0].padEnd(w0) + '   ' + r[1].padEnd(w1) + '   e.g. ' + r[2]).join('\n') + '\n' +
    'help <verb> for one verb · read-only except bump · --root <bim-ootb> --compiler-root <bim-compiler>\n';
}
const run = (file, args) => { const r = cp.spawnSync(process.execPath, [file, ...args], { cwd: S.ROOT, stdio: 'inherit' }); return r.status == null ? 1 : r.status; };

if (require.main === module) (async () => {
  const [verb, ...rest] = pos;
  if (!verb || verb === 'help') { const t = help(rest[0]); if (t == null) { process.stderr.write(help()); process.exit(1); } process.stdout.write(t); return; }
  if (verb === 'pure') { process.exitCode = run(path.join(S.ROOT, 'erp', 'tests', 'witness_core_pure.js'), []); return; }
  if (verb === 'bump') { process.exitCode = run(path.join(S.ROOT, 'scripts', 'bump.js'), argv.slice(argv.indexOf('bump') + 1)); return; }
  const v = VERBS.find(x => x[0] === verb);
  if (!v) { process.stderr.write('x0: unknown verb "' + verb + '"\n' + help()); process.exit(1); }
  const a = {}; if (rest[0] != null) a[v[2]] = rest[0];
  if (!rest.length && (tool(v[1]).inputSchema.required || []).includes(v[2])) { process.stderr.write('x0 ' + v[0] + ' needs <' + v[2] + '>\n' + help(v[0])); process.exit(1); }
  process.stdout.write(String(await tool(v[1]).run(a)) + '\n');
})().catch(e => { process.stderr.write('x0: ' + (e && e.message) + '\n'); process.exit(1); });

module.exports = { VERBS, EXTRA };
