#!/usr/bin/env node
// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — SPEC (W-LOG-STAMP), bim-compiler prompts/CODE_ARCHITECTURE_DESIGN.md §F.7, issue #2927
// One line that says WHICH CODE produced a log, so a saved log can be trusted (or not) against today's code:
//   §LOG_STAMP commit=<12 hex|none> dirty=<n|?> branch=<name> at=<ISO time> cmd=<label>[ dirty_files=<a,b,…>]
//   dirty       = tracked files that differ from the commit (untracked files do not count)
//   dirty_files = listed only when there are 1 to 10 of them
// Outside a git checkout it prints commit=none dirty=? and never fails: a stamp must not break the run it stamps.
// Dev-side only: no page loads this file. Witness: scripts/tests/witness_log_stamp.js. Read the log.
// Usage: node scripts/log_stamp.js [label …]        (prints the line for the current folder)
//        require('./log_stamp').stampLine(cwd, label)
'use strict';
const cp = require('child_process');

function git(cwd, args) {
  try {
    return cp.execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 15000 }).replace(/\s+$/, '');
  } catch (e) { return null; }
}

/** The stamp line for the checkout that holds `cwd`. Never throws. */
function stampLine(cwd, label) {
  const dir = cwd || process.cwd();
  const at = new Date().toISOString();
  const cmd = String(label || '').replace(/\s+/g, ' ').trim() || '-';
  const commit = git(dir, ['rev-parse', '--short=12', 'HEAD']);
  if (!commit) return '§LOG_STAMP commit=none dirty=? branch=none at=' + at + ' cmd=' + cmd;
  const branch = git(dir, ['rev-parse', '--abbrev-ref', 'HEAD']) || '?';
  const status = git(dir, ['status', '--porcelain', '-uno']);
  const files = status === null ? null : status.split('\n').filter(Boolean).map(l => l.slice(3));
  let line = '§LOG_STAMP commit=' + commit + ' dirty=' + (files ? files.length : '?') + ' branch=' + branch + ' at=' + at + ' cmd=' + cmd;
  if (files && files.length >= 1 && files.length <= 10) line += ' dirty_files=' + files.join(',');
  return line;
}

module.exports = { stampLine };
if (require.main === module) console.log(stampLine(process.cwd(), process.argv.slice(2).join(' ')));
