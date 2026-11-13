#!/usr/bin/env node
// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — WITNESS W-LOG-STAMP (bim-compiler prompts/CODE_ARCHITECTURE_DESIGN.md §F.7, bim-ootb #2927)
// ISSUE THIS PROVES OR DISPROVES: "a saved log does not say which code produced it" — the stamp must name the
//   real commit, must CHANGE when a tracked file is edited, and must be line 1 of the logs the two savers write.
// POPULATION: a temp git repo made here (clean → edited → plus an untracked file), a folder that is no checkout,
//   the "Run this witness" task's OWN command read from .vscode/tasks.json, and the real suite runner (--list).
// RED CONTROL: the stamp of the edited repo must differ from the clean one (dirty=1, file named). A stamp that
//   reads the same before and after an edit proves nothing.
// git not available → INCONCLUSIVE, never PASS.
// Command: node scripts/tests/witness_log_stamp.js      Final line: §LOG_STAMP_W … verdict=. Read the log.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const { stampLine } = require('../log_stamp');

const ROOT = path.resolve(__dirname, '..', '..');
let fail = 0;
function check(label, cond) { console.log('  ' + (cond ? 'PASS ' : 'FAIL ') + label); if (!cond) fail++; return cond; }
function summary(f, verdict) { console.log('§LOG_STAMP_W ' + Object.keys(f).map(k => k + '=' + f[k]).join(' ') + ' verdict=' + verdict); }
const SHAPE = /^§LOG_STAMP commit=([0-9a-f]{12}|none) dirty=(\d+|\?) branch=\S+ at=\d{4}-\d\d-\d\dT[\d:.]+Z cmd=.+$/;
const field = (line, k) => { const m = new RegExp('(?:^| )' + k + '=(\\S+)').exec(line); return m ? m[1] : null; };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'log-stamp-'));
const repo = path.join(tmp, 'repo'), plain = path.join(tmp, 'plain');
fs.mkdirSync(repo); fs.mkdirSync(plain);
const g = args => cp.spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
const init = g(['init', '-q']);
if (init.status !== 0) { console.log('  git not usable here'); summary({ clean: '?' }, 'INCONCLUSIVE'); process.exit(0); }
fs.writeFileSync(path.join(repo, 'code.js'), 'var a = 1;\n');
g(['add', 'code.js']);
g(['-c', 'user.name=w', '-c', 'user.email=w@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-q', '--no-verify', '-m', 'one']);
const head = (g(['rev-parse', '--short=12', 'HEAD']).stdout || '').trim();

// 1. clean repo
const clean = stampLine(repo, 'fixture run');
console.log('  ' + clean);
const cleanOk = check('clean repo: the stamp names that repo\'s HEAD (' + head + ') and dirty=0',
  SHAPE.test(clean) && head.length === 12 && field(clean, 'commit') === head && field(clean, 'dirty') === '0' && !/dirty_files=/.test(clean));

// 2. an untracked file alone is not "dirty code"
fs.writeFileSync(path.join(repo, 'notes.txt'), 'x\n');
const untracked = stampLine(repo, 'fixture run');
const untrackedOk = check('an untracked file alone leaves dirty=0', field(untracked, 'dirty') === '0');

// 3. red control: edit a tracked file → the stamp must change
fs.writeFileSync(path.join(repo, 'code.js'), 'var a = 2;\n');
const dirty = stampLine(repo, 'fixture run');
console.log('  ' + dirty);
const dirtyOk = check('red control: after editing a tracked file the stamp says dirty=1 and names it',
  SHAPE.test(dirty.replace(/ dirty_files=\S+$/, '')) && field(dirty, 'dirty') === '1' && field(dirty, 'dirty_files') === 'code.js' && field(dirty, 'commit') === head);

// 4. no checkout
const none = stampLine(plain, '');
const nogitOk = check('a folder that is no checkout → commit=none dirty=?, no crash', SHAPE.test(none) && field(none, 'commit') === 'none' && field(none, 'dirty') === '?');

// 5. the task's own command: line 1 of the saved log is the stamp, the witness's exit code is kept
const tasksTxt = fs.readFileSync(path.join(ROOT, '.vscode', 'tasks.json'), 'utf8').split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
const task = JSON.parse(tasksTxt).tasks.find(t => /^Run this witness/.test(t.label));
let taskOk = false;
if (task) {
  fs.writeFileSync(path.join(repo, 'fx_fail.js'), "console.log('  FAIL thing'); process.exitCode = 1;\n");
  const cmd = task.command.split('${workspaceFolder}').join(ROOT).split('${relativeFile}').join('fx_fail.js').split('${fileBasenameNoExtension}').join('fx_fail');
  const r = cp.spawnSync('bash', ['-c', cmd], { cwd: repo, encoding: 'utf8' });
  let lines = [];
  try { lines = fs.readFileSync(path.join(repo, 'logs', 'fx_fail.log'), 'utf8').split('\n'); } catch (e) { lines = []; }
  console.log('  task log line 1: ' + (lines[0] || '<none>'));
  taskOk = check('"Run this witness": line 1 of the saved log is the stamp of the folder it ran in, the output follows, exit code kept (' + r.status + ')',
    SHAPE.test((lines[0] || '').replace(/ dirty_files=\S+$/, '')) && field(lines[0], 'commit') === head && /cmd=fx_fail\.js/.test(lines[0])
    && lines[1] === '  FAIL thing' && r.status === 1);
} else check('"Run this witness" task found in .vscode/tasks.json', false);

// 6. the suite runner prints the stamp first
const s = cp.spawnSync(process.execPath, [path.join(ROOT, 'tests', 'run_witness_suite.js'), '--list'], { cwd: ROOT, encoding: 'utf8' });
const first = (s.stdout || '').split('\n')[0];
const realHead = (cp.spawnSync('git', ['rev-parse', '--short=12', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).stdout || '').trim();
console.log('  suite line 1: ' + first);
const suiteOk = check('suite runner: its first output line is the stamp of this checkout (' + (realHead || 'no git') + ')',
  SHAPE.test(first.replace(/ dirty_files=\S+$/, '')) && (realHead ? field(first, 'commit') === realHead : field(first, 'commit') === 'none')
  && /§SUITE_LIST \d+ witnesses/.test(s.stdout));

fs.rmSync(tmp, { recursive: true, force: true });
const yn = b => (b ? 'Y' : 'N');
summary({ clean: yn(cleanOk), dirty_seen: yn(dirtyOk), untracked_ignored: yn(untrackedOk), nogit: yn(nogitOk), task_first_line: yn(taskOk), suite_first_line: yn(suiteOk) },
  fail === 0 ? 'PASS' : 'FAIL');
if (fail) process.exitCode = 1;
