#!/usr/bin/env node
// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — SPEC: bim-compiler prompts/CODE_ARCHITECTURE_DESIGN.md §F.36 (owner F-25: an `code-facts` terminal command with its OWN help,
//   not a group in the red1 help, which every page loads). Witness: devtools/code-facts/tests/witness_codefacts_cli.js (W-CODEFACTS-CLI).
// ISSUE: the Code Facts facts (where a field is set, what a §TAG means, how a file is loaded, …) were reachable only from VS Code and from an MCP client.
// WHAT:  the same facts in a terminal, from the SAME implementation: the facts server's TOOLS (devtools/mcp/code-facts/server.js), so the
//        three front ends (editor, MCP, terminal) cannot disagree. Read-only, except `code-facts bump`, which IS scripts/bump.js. Plain node, no npm,
//        no network module, named by no page / loader / sw.js: nothing here reaches the browser.
// USE:   node devtools/code-facts/code-facts.js help · node devtools/code-facts/code-facts.js where camera · … --root <bim-ootb> --compiler-root <bim-compiler>
'use strict';
const path = require('path'), cp = require('child_process');
const argv = process.argv.slice(2);
const flags = new Set(['--root', '--compiler-root', '--extra-logs', '--transcript']);
const pos = argv.filter((a, i) => !flags.has(a) && !flags.has(argv[i - 1]));
const S = require(path.join(__dirname, '..', 'mcp', 'code-facts', 'server.js'));   // reads --root / --compiler-root from the same argv
const tool = n => S.TOOLS.find(t => t.name === n);

// verb -> [tool, argument name, what it answers, a typed example]
const VERBS = [
  ['where', 'where_is_field_set', 'field', 'where APP.<field> is written', 'code-facts where camera'],
  ['uses', 'where_is_field_used', 'field', 'every write and read of APP.<field>', 'code-facts uses camera'],
  ['tag', 'what_is_tag', 'tag', 'what a §TAG means and who prints it', 'code-facts tag §BUMP'],
  ['loaded', 'how_is_file_loaded', 'file', 'how a file reaches a user (start-up, offline, lazy)', 'code-facts loaded viewer/scene.js'],
  ['cost', 'cost_if_deployed', 'base', 'what a deploy of your changes would cost users', 'code-facts cost origin/main'],
  ['last', 'last_logged_value', 'file', 'the last logged § values of a file', 'code-facts last viewer/scene.js'],
  ['context', 'context_for_file', 'file', 'everything the indexes say about one file', 'code-facts context viewer/cost_panel.js'],
  ['check', 'ship_check', 'base', 'the pre-ship checks, stop at the first failure', 'code-facts check'],
];
const EXTRA = [
  ['pure', 'the core-purity scan (W-CORE-PURE), its verdict line', 'code-facts pure'],
  ['bump', 'scripts/bump.js with your arguments (dry run unless --write)', 'code-facts bump modeller/arc_editable.js'],
  ['session', 'one Claude Code session: tokens, PRs, URL load change (last | history [N] | --transcript F)', 'code-facts session last'],
];
function help(verb) {
  if (verb) {
    const v = VERBS.find(x => x[0] === verb); if (v) return 'code-facts ' + v[0] + ' <' + v[2] + '>: ' + tool(v[1]).description + '\n';
    const e = EXTRA.find(x => x[0] === verb); if (e) return 'code-facts ' + e[0] + ': ' + e[1] + '\n';
    return null;
  }
  const rows = VERBS.map(v => [v[0], v[3], v[4]]).concat(EXTRA);
  const w0 = Math.max(...rows.map(r => r[0].length)), w1 = Math.max(...rows.map(r => r[1].length));
  return 'code-facts: facts about this codebase from its own indexes (the same answers as Code Facts and the code-facts server).\n' +
    rows.map(r => '  ' + r[0].padEnd(w0) + '   ' + r[1].padEnd(w1) + '   e.g. ' + r[2]).join('\n') + '\n' +
    'help <verb> for one verb · read-only except bump · --root <bim-ootb> --compiler-root <bim-compiler>\n';
}
const run = (file, args) => { const r = cp.spawnSync(process.execPath, [file, ...args], { cwd: S.ROOT, stdio: 'inherit' }); return r.status == null ? 1 : r.status; };

if (require.main === module) (async () => {
  const [verb, ...rest] = pos;
  if (!verb || verb === 'help') { const t = help(rest[0]); if (t == null) { process.stderr.write(help()); process.exit(1); } process.stdout.write(t); return; }
  if (verb === 'pure') { process.exitCode = run(path.join(S.ROOT, 'erp', 'tests', 'witness_core_pure.js'), []); return; }
  if (verb === 'session') {   // §F.37 (owner F-26): local files only; --hook = the SessionEnd hook (stdin JSON; prints to stderr, exit 2 = shown to the user)
    const SS = require(path.join(__dirname, 'session.js'));
    if (rest[0] === 'history') { process.stdout.write(SS.history(+rest[1] || 10) + '\n'); return; }
    let file = null, hook = argv.includes('--hook');
    const ti = argv.indexOf('--transcript'); if (ti >= 0) file = argv[ti + 1];
    if (hook) { try { const j = JSON.parse(require('fs').readFileSync(0, 'utf8') || '{}'); file = j.transcript_path || null; } catch (e) { file = null; } }
    if (!file) file = SS.lastTranscript(process.cwd());
    if (!file) { process.stderr.write('code-facts session: no Claude Code transcript found for ' + process.cwd() + ' (pass --transcript <file>)\n'); process.exit(1); }
    const r = SS.summarise(file, S.ROOT);
    if (hook) { process.stderr.write(r.text + '\n'); process.exit(2); }
    process.stdout.write(r.text + '\n' + r.line + '\n'); return;
  }
  if (verb === 'bump') { process.exitCode = run(path.join(S.ROOT, 'scripts', 'bump.js'), argv.slice(argv.indexOf('bump') + 1)); return; }
  const v = VERBS.find(x => x[0] === verb);
  if (!v) { process.stderr.write('code-facts: unknown verb "' + verb + '"\n' + help()); process.exit(1); }
  const a = {}; if (rest[0] != null) a[v[2]] = rest[0];
  if (!rest.length && (tool(v[1]).inputSchema.required || []).includes(v[2])) { process.stderr.write('code-facts ' + v[0] + ' needs <' + v[2] + '>\n' + help(v[0])); process.exit(1); }
  process.stdout.write(String(await tool(v[1]).run(a)) + '\n');
})().catch(e => { process.stderr.write('code-facts: ' + (e && e.message) + '\n'); process.exit(1); });

module.exports = { VERBS, EXTRA };
