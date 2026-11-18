#!/usr/bin/env node
// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — WITNESS W-X0-SESSION (bim-compiler prompts/CODE_ARCHITECTURE_DESIGN.md §F.37; owner F-26).
// Read the log after every run: exit code is not evidence. Verdict line: §X0_SESSION_W … verdict=PASS|FAIL|INCONCLUSIVE.
// ISSUE THIS PROVES OR DISPROVES: "the session summary miscounts tokens (a streamed reply is written to the transcript more than once), credits a
//   URL-load change to the wrong commit, hides a PR that never merged, or grows the history by a line on every re-run".
// INDEPENDENT SOURCE: a synthetic transcript whose totals are known by construction, and a temp git repo whose squash commit "(#7)" grows a
//   precached start-up file by exactly 250 bytes. Plus: the hook path (stdin JSON) prints to stderr and exits 2 (shown to the user at session end).
// RED CONTROLS (must be REPORTED, not hidden): the duplicated reply (dup_copies=1) and PR #8, which is not on origin/main (not_merged=1).
// Command: node devtools/x0/tests/witness_x0_session.js   (~2 s; local only, not in CI: the URL-load check parses with the TypeScript inside
//   VS Code via scripts/lib/find_ts.js, which a runner does not have — the same reason deploy_cost is left out of the CI X0 loop)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const ROOT = path.join(__dirname, '..', '..', '..'), say = s => process.stdout.write(s + '\n');
require(path.join(ROOT, 'devtools', 'vscode', 'x0-navigator', 'lib', 'js_facts.js')).loadTs(ROOT);   // the parser, from this checkout (cached for the temp repo)
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'w-x0-session-'));
process.env.X0_SESSION_HISTORY = path.join(tmp, 'hist.jsonl');
const SS = require(path.join(__dirname, '..', 'session.js'));
const checks = []; const check = (k, ok, d) => { checks.push(ok); say(`  §X0_SESSION_W_CHECK ${k} ok=${ok ? 'Y' : 'N'} ${d}`); };
try {
  // the temp repo: app/a.js is a start-up file AND precached; commit "(#7)" grows it by 250 bytes
  const repo = path.join(tmp, 'repo'), g = (...a) => cp.execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'user.email=w@x', '-c', 'user.name=w', ...a], { cwd: repo, encoding: 'utf8' });
  fs.mkdirSync(path.join(repo, 'app'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'app', 'sw.js'), "const CACHE_VERSION = 'v1';\nconst PRECACHE_ASSETS = [\n  'index.html',\n  'a.js',\n];\n");
  fs.writeFileSync(path.join(repo, 'app', 'index.html'), '<!doctype html>\n<script src="a.js?v=1"></script>\n');
  fs.writeFileSync(path.join(repo, 'app', 'a.js'), 'x'.repeat(100));
  g('init', '-q'); g('add', '.'); g('commit', '-qm', 'init');
  fs.writeFileSync(path.join(repo, 'app', 'a.js'), 'x'.repeat(350)); g('commit', '-qam', 'feat: grow a.js (#7)');
  g('update-ref', 'refs/remotes/origin/main', 'HEAD');
  // the synthetic transcript: reply A streamed twice, reply B with a shell command running two witnesses, a tool result with two PR links
  const t0 = new Date(Date.now() - 3600e3).toISOString(), t1 = new Date(Date.now() - 1800e3).toISOString();
  const A = { id: 'msg_A', model: 'm-test', usage: { input_tokens: 10, cache_creation_input_tokens: 100, cache_read_input_tokens: 1000, output_tokens: 50 }, content: [{ type: 'text', text: 'hi' }] };
  const B = { id: 'msg_B', model: 'm-test', usage: { input_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 500, output_tokens: 20 },
    content: [{ type: 'tool_use', name: 'Bash', input: { command: 'node a/tests/witness_foo.js && node witness_bar.js && node witness_foo.js' } }] };
  const tr = path.join(tmp, 'sess-0001.jsonl');
  fs.writeFileSync(tr, [{ type: 'user', timestamp: t0, message: { role: 'user', content: 'go' } }, { type: 'assistant', timestamp: t0, message: A }, { type: 'assistant', timestamp: t0, message: A },
    { type: 'assistant', timestamp: t1, message: B },
    { type: 'user', timestamp: t1, message: { role: 'user', content: [{ type: 'tool_result', content: [{ type: 'text', text: 'https://github.com/red1oon/bim-ootb/pull/7\nalso https://github.com/red1oon/bim-ootb/pull/8' }] }] } }]
    .map(x => JSON.stringify(x)).join('\n') + '\n');
  const r = SS.summarise(tr, repo), t = r.rec.tokens;
  say('  ' + r.line);
  check('tokens', r.rec.replies === 2 && t.input === 11 && t.cacheWrite === 100 && t.cacheRead === 1500 && t.output === 70, `replies=${r.rec.replies} (want 2) in=${t.input} cw=${t.cacheWrite} cr=${t.cacheRead} out=${t.output} (want 11/100/1500/70)`);
  check('red_dup_reported', r.rec.dupCopies === 1, `dup_copies=${r.rec.dupCopies} (the streamed copy is counted once and reported)`);
  check('minutes_witnesses_prs', r.rec.minutes === 30 && r.rec.witnesses === 2 && (r.rec.prs['bim-ootb'] || []).join(',') === '7,8', `minutes=${r.rec.minutes} witnesses=${r.rec.witnesses} prs=${JSON.stringify(r.rec.prs)}`);
  const app = r.rec.load.app || {};
  check('url_load', app.boot === 250 && app.precache === 250 && Object.keys(r.rec.load).length === 1, `load=${JSON.stringify(r.rec.load)} (want app start-up +250, offline +250)`);
  check('red_not_merged_reported', r.rec.notMerged.join(',') === '8' && /not on origin\/main/.test(r.text), `not_merged=${JSON.stringify(r.rec.notMerged)}`);
  SS.summarise(tr, repo);
  const lines = fs.readFileSync(process.env.X0_SESSION_HISTORY, 'utf8').split('\n').filter(Boolean).length;
  check('history_replaces', lines === 1, `history_lines_after_two_runs=${lines}`);
  // the hook path: stdin JSON with transcript_path -> summary on stderr, exit 2
  const h = cp.spawnSync(process.execPath, [path.join(__dirname, '..', 'x0.js'), 'session', '--hook', '--root', repo], { input: JSON.stringify({ session_id: 'sess-0001', transcript_path: tr, hook_event_name: 'SessionEnd', reason: 'other' }), encoding: 'utf8', env: process.env });
  check('hook', h.status === 2 && /^Session sess-000/.test(h.stderr) && h.stdout === '', `exit=${h.status} stderr_starts=${JSON.stringify(h.stderr.slice(0, 20))} stdout_chars=${h.stdout.length}`);
  // isolation: no network module, named by no page
  const net = [path.join(__dirname, '..', 'session.js'), path.join(__dirname, '..', 'x0.js')].some(f => /require\(\s*['"](node:)?(http|https|net|tls|dgram|http2)['"]/.test(fs.readFileSync(f, 'utf8')));
  check('isolated', !net, `network_require=${net ? 'Y' : 'N'}`);
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
const ok = checks.filter(Boolean).length, verdict = !checks.length ? 'INCONCLUSIVE' : ok === checks.length ? 'PASS' : 'FAIL';
say(`§X0_SESSION_W checks=${ok}/${checks.length} verdict=${verdict}`);
process.exit(verdict === 'PASS' ? 0 : 1);
