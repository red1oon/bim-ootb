#!/usr/bin/env node
// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — WITNESS W-LENS, first version (bim-compiler prompts/CODE_ARCHITECTURE_DESIGN.md §F.12b, issue #2945).
// Read the log after every run: exit code is not evidence.
// ISSUE THIS PROVES OR DISPROVES: "a value from an old run is shown beside code that has since changed" — the lens must
//   show a logged value ONLY when the log names its commit and the printing file is unchanged since.
// POPULATION: a temp git repo with one file that prints two tags, and logs written by the repo's REAL scripts/log_stamp.js.
// CASES: stamped log + unchanged file → shown · the file edited after the log → hidden · the stamp lists the file as
//   dirty → hidden · RED CONTROL: the same log lines without a stamp → never shown.
// git not usable → INCONCLUSIVE, never PASS.
// Command: node devtools/vscode/x0-navigator/tests/witness_x0_lens.js
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const L = require('../lib/lens_index');

const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const { stampLine } = require(path.join(ROOT, 'scripts', 'log_stamp.js'));
const SEC = '§';
let fail = 0;
function check(label, cond) { console.log('  ' + (cond ? 'PASS ' : 'FAIL ') + label); if (!cond) fail++; return !!cond; }
function summary(f, verdict) { console.log(SEC + 'LENS ' + Object.keys(f).map(k => k + '=' + f[k]).join(' ') + ' verdict=' + verdict); }

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'x0-lens-'));
const g = a => cp.spawnSync('git', a, { cwd: TMP, encoding: 'utf8' });
if (g(['init', '-q']).status !== 0) { summary({ git: 'N' }, 'INCONCLUSIVE'); process.exit(0); }
const commit = m => { g(['add', '-A']); g(['-c', 'user.name=w', '-c', 'user.email=w@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-q', '--no-verify', '-m', m]); };
// the fixture source is assembled so this witness file itself prints no such tag
const TAG_A = SEC + 'LENS_PROBE_A', TAG_B = SEC + 'LENS_PROBE_B';
const src = ['function run(n) {', "  console.log('" + TAG_A + " n=' + n);", "  // " + TAG_B + " in a comment is not a print", "  console.log('" + TAG_B + " ok');", '}', ''].join('\n');
fs.mkdirSync(path.join(TMP, 'app')); fs.mkdirSync(path.join(TMP, 'logs'));
fs.writeFileSync(path.join(TMP, 'app', 'code.js'), src);
fs.writeFileSync(path.join(TMP, 'app', 'other.js'), 'var other = 1;\n');
fs.writeFileSync(path.join(TMP, '.gitignore'), 'logs/\n');
commit('one');
const body = [TAG_A + ' n=1', 'noise', TAG_A + ' n=42', TAG_B + ' ok', ''].join('\n');
const lens = () => L.lensesFor(TMP, 'app/code.js', fs.readFileSync(path.join(TMP, 'app', 'code.js'), 'utf8'), L.scanLogs(path.join(TMP, 'logs')), new Map());

// RED CONTROL first: the same lines, no stamp
fs.writeFileSync(path.join(TMP, 'logs', 'run.log'), body);
const r0 = lens(), s0 = L.scanLogs(path.join(TMP, 'logs'));
const redOk = check('red control: a log WITHOUT a stamp → nothing shown, nothing even considered (unstamped=' + s0.unstamped + ')', r0.shown.length === 0 && r0.hidden.length === 0 && s0.unstamped === 1);

// 1. stamped by the real stamper, file unchanged
fs.writeFileSync(path.join(TMP, 'logs', 'run.log'), stampLine(TMP, 'fixture') + '\n' + body);
const r1 = lens();
const a = r1.shown.find(x => x.tag === TAG_A), b = r1.shown.find(x => x.tag === TAG_B);
const shownOk = check('stamped log + unchanged file → both printed tags get their LAST value (' + (a && a.value) + ' | ' + (b && b.value) + '), on the printing lines, not the comment',
  r1.shown.length === 2 && a.value === TAG_A + ' n=42' && a.line === 1 && a.logLine === 4 && b.line === 3 && r1.hidden.length === 0);
check('the lens title carries the value, the log name and the commit', !!a && /^last: .*n=42 .* run\.log @ [0-9a-f]{7}$/.test(L.title(a)));

// explain(): every printed tag gets a state and a hover line (§F.15 step 2) — never silence
const ex = () => L.explain(TMP, 'app/code.js', fs.readFileSync(path.join(TMP, 'app', 'code.js'), 'utf8'), L.scanLogs(path.join(TMP, 'logs')), new Map());
const e1 = ex();
const explainShownOk = check('explain: both tags shown, hover line carries value, log line and commit (' + L.hoverLine(e1[0]) + ')',
  e1.length === 2 && e1.every(x => x.state === 'shown') && /^last value: `.*n=42` — run\.log:4 @ [0-9a-f]{7}$/.test(L.hoverLine(e1[0])));

// 2. the file is edited after the log
fs.writeFileSync(path.join(TMP, 'app', 'code.js'), src.replace('function run(n) {', 'function run(n) {\n  n = n + 1;'));
const r2 = lens();
const changedOk = check('the printing file edited after the log → nothing shown (why: ' + (r2.hidden[0] && r2.hidden[0].why) + ')',
  r2.shown.length === 0 && r2.hidden.length === 2 && r2.hidden.every(h => h.why === 'file changed since the log'));

const e2 = ex();
const explainHiddenOk = check('explain: the edited file → hidden, hover line names the reason (' + L.hoverLine(e2[0]) + ')',
  e2.length === 2 && e2.every(x => x.state === 'hidden') && L.hoverLine(e2[0]) === 'last value not shown: file changed since the log' && !/n=42/.test(L.hoverLine(e2[0])));

// 3. a log made WHILE the file was dirty: the stamp names it
fs.writeFileSync(path.join(TMP, 'logs', 'run.log'), stampLine(TMP, 'fixture') + '\n' + body);
const r3 = lens();
const dirtyOk = check('a log made while the file was dirty (the stamp names it) → nothing shown (why: ' + (r3.hidden[0] && r3.hidden[0].why) + ')',
  r3.shown.length === 0 && r3.hidden.length === 2 && r3.hidden.every(h => h.why === 'file was dirty when the log was made'));

// 4. commit the edit, log again → shown again; an unrelated dirty file does not hide it
commit('two');
fs.writeFileSync(path.join(TMP, 'app', 'other.js'), 'var other = 2;\n');
fs.writeFileSync(path.join(TMP, 'logs', 'run.log'), stampLine(TMP, 'fixture') + '\n' + body);
const r4 = lens();
check('after committing the edit a new log is shown again, and another file being dirty does not hide it', r4.shown.length === 2 && r4.hidden.length === 0);

// 5. a stamp from outside any checkout is not a stamp for this purpose
check('a stamp with commit=none is not accepted', L.parseStamp(SEC + 'LOG_STAMP commit=none dirty=? branch=none at=2026-01-01T00:00:00.000Z cmd=-') === null);

// absent: a stamped log that does not carry the tag, then no stamped log at all (the red control for "never a value")
fs.writeFileSync(path.join(TMP, 'logs', 'run.log'), stampLine(TMP, 'fixture') + '\n' + TAG_A + ' n=5\n');
const e5 = ex();
fs.writeFileSync(path.join(TMP, 'logs', 'run.log'), TAG_A + ' n=5\n' + TAG_B + ' ok\n');
const e6 = ex();
const explainAbsentOk = check('explain: a tag no stamped log carries → "tag not in any stamped log"; red control: no stamped log at all → "no stamped log found" for both, no value',
  e5.length === 2 && e5[1].state === 'absent' && L.hoverLine(e5[1]) === 'last value not shown: tag not in any stamped log' &&
  e6.length === 2 && e6.every(x => x.state === 'absent' && L.hoverLine(x) === 'last value not shown: no stamped log found'));
fs.rmSync(TMP, { recursive: true, force: true });
// the real repo, for information: how many lenses would light up today
const realScan = L.scanLogs(path.join(ROOT, 'logs'));
console.log(SEC + 'LENS_REAL stamped_logs=' + realScan.logs.length + ' unstamped_logs=' + realScan.unstamped + ' tags_in_stamped_logs=' + new Set(realScan.logs.flatMap(l => Array.from(l.tags.keys()))).size + ' (this checkout\'s logs/, for information)');
const yn = x => (x ? 'Y' : 'N');
summary({ shown: yn(shownOk), hidden_changed: yn(changedOk), hidden_dirty: yn(dirtyOk), unstamped_ignored: yn(redOk), explain_shown: yn(explainShownOk), explain_hidden: yn(explainHiddenOk), explain_absent: yn(explainAbsentOk) }, fail === 0 ? 'PASS' : 'FAIL');
if (fail) process.exitCode = 1;
