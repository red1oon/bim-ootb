#!/usr/bin/env node
// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — WITNESS W-CODEFACTS-CLI (bim-compiler prompts/CODE_ARCHITECTURE_DESIGN.md §F.36; owner F-25).
// Read the log after every run: exit code is not evidence. Verdict line: §CODEFACTS_CLI … verdict=PASS|FAIL|INCONCLUSIVE.
// ISSUE THIS PROVES OR DISPROVES: "the code-facts terminal command can answer differently from the code-facts server (two implementations of one fact),
//   miss a tool in its help, or reach the browser / the network".
// INDEPENDENT SIDE: the facts server SPAWNED and asked over stdio JSON-RPC (initialize, tools/list, tools/call) — the protocol path an AI client
//   uses — never the module code-facts.js requires.
// RED CONTROLS (must be detected): an unknown verb exits 1 with the help on stderr; a tool name added to the server's list but not to the help
//   is reported as missing (judged on a copy of the help text with one row removed).
// INCONCLUSIVE: the server answers no tools/list, or 0 verbs were judged.
// Command: node devtools/code-facts/tests/witness_codefacts_cli.js   (~1 min: `check` runs the pre-ship checks)
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const ROOT = path.join(__dirname, '..', '..', '..'), CF_FILE = path.join(__dirname, '..', 'code-facts.js'), SERVER = path.join(ROOT, 'devtools', 'mcp', 'code-facts', 'server.js');
const say = s => process.stdout.write(s + '\n');
const { VERBS, EXTRA } = require(CF_FILE);
const SAMPLE = { field: 'camera', tag: '§BUMP', file: 'viewer/scene.js', base: 'origin/main' };

function server(calls) {
  return new Promise(resolve => {
    const ch = cp.spawn(process.execPath, [SERVER], { cwd: ROOT, stdio: ['pipe', 'pipe', 'ignore'] }), got = new Map(); let buf = '';
    ch.stdout.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); try { const m = JSON.parse(l); got.set(m.id, m); } catch (e) { /* not ours */ } } });
    ch.on('close', () => resolve(got));
    const msgs = [{ jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2025-06-18' } }, { jsonrpc: '2.0', id: 1, method: 'tools/list' }]
      .concat(calls.map((c, k) => ({ jsonrpc: '2.0', id: 10 + k, method: 'tools/call', params: { name: c.tool, arguments: c.args } })));
    msgs.forEach(m => ch.stdin.write(JSON.stringify(m) + '\n')); ch.stdin.end();
  });
}
const cf = args => cp.spawnSync(process.execPath, [CF_FILE, ...args], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 });

(async () => {
  const calls = VERBS.map(v => ({ verb: v[0], tool: v[1], args: { [v[2]]: SAMPLE[v[2]] }, argv: [v[0], SAMPLE[v[2]]] }));
  const got = await server(calls), list = got.get(1) && got.get(1).result && got.get(1).result.tools;
  const inconclusive = [];
  if (!list) inconclusive.push('the server answered no tools/list');
  let same = 0;
  calls.forEach((c, k) => {
    const s = got.get(10 + k), st = s && s.result && s.result.content && s.result.content[0].text, r = cf(c.argv), ok = st != null && r.status === 0 && r.stdout === st + '\n';
    if (ok) same++;
    say(`  §CODEFACTS_CLI_VERB verb=${c.verb} tool=${c.tool} arg=${JSON.stringify(c.argv[1])} server_chars=${st == null ? '-' : st.length} cli_chars=${r.stdout.length} exit=${r.status} same=${ok ? 'Y' : 'N'}`);
  });
  // help covers every tool of the server, nothing extra
  const h = cf(['help']).stdout, helpRows = h.split('\n').filter(l => /^  \S/.test(l)).map(l => l.trim().split(/\s+/)[0]);
  const toolsInHelp = VERBS.filter(v => helpRows.includes(v[0])).map(v => v[1]), names = list ? list.map(t => t.name) : [];
  const missing = names.filter(n => !toolsInHelp.includes(n)), extraRows = helpRows.filter(r => !VERBS.some(v => v[0] === r) && !EXTRA.some(e => e[0] === r));
  const helpOk = !!list && !missing.length && !extraRows.length && EXTRA.every(e => helpRows.includes(e[0]));
  say(`  §CODEFACTS_CLI_HELP rows=${helpRows.length} server_tools=${names.length} missing=[${missing.join(',')}] extra=[${extraRows.join(',')}] ok=${helpOk ? 'Y' : 'N'}`);
  // pure prints the W-CORE-PURE verdict line
  const p = cf(['pure']), pureOk = /^§CORE_PURE files=\d+ .*verdict=PASS/m.test(p.stdout) && p.status === 0;
  say(`  §CODEFACTS_CLI_PURE exit=${p.status} verdict_line=${pureOk ? 'Y' : 'N'}`);
  // nothing reaches the browser, no network module
  const pages = cp.execFileSync('git', ['ls-files', '*.html', '*/sw.js', '*/main.js'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
  const named = pages.filter(f => fs.readFileSync(path.join(ROOT, f), 'utf8').includes('devtools/code-facts')).length;
  const net = /require\(\s*['"](node:)?(http|https|net|tls|dgram|http2)['"]/.test(fs.readFileSync(CF_FILE, 'utf8'));
  say(`  §CODEFACTS_CLI_ISOLATION pages_naming_it=${named} network_require=${net ? 'Y' : 'N'}`);
  // red controls
  const u = cf(['no_such_verb']), red1 = u.status === 1 && /unknown verb "no_such_verb"/.test(u.stderr) && /code-facts: facts about/.test(u.stderr);
  const cut = helpRows.filter(r => r !== VERBS[0][0]), red2 = names.filter(n => !VERBS.filter(v => cut.includes(v[0])).map(v => v[1]).includes(n)).includes(VERBS[0][1]);
  say(`  §CODEFACTS_CLI_RED unknown_verb detected=${red1 ? 'Y' : 'N'} · help_row_removed detected=${red2 ? 'Y' : 'N'}`);
  if (!same && !calls.length) inconclusive.push('0 verbs judged');
  if (!red1 || !red2) inconclusive.push('a red control was not detected');
  const pass = same === calls.length && helpOk && pureOk && !named && !net;
  const verdict = inconclusive.length ? 'INCONCLUSIVE' : pass ? 'PASS' : 'FAIL';
  inconclusive.forEach(x => say('  §CODEFACTS_CLI_INCONCLUSIVE ' + x));
  say(`§CODEFACTS_CLI verbs=${calls.length} same=${same}/${calls.length} help_rows=${helpRows.length} pure=${pureOk ? 'Y' : 'N'} isolated=${!named && !net ? 'Y' : 'N'} red=${[red1, red2].filter(Boolean).length}/2 verdict=${verdict}`);
  process.exit(verdict === 'PASS' ? 0 : 1);
})();
