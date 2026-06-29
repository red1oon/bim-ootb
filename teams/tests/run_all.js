// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — run all 3 Teams-overlay witnesses; non-zero exit on any fail.
//   Standalone: no modeller deps. Read the log after every run.
'use strict';
var cp = require('child_process'), path = require('path');
var tests = ['poc_teams_cross_branch.js', 'poc_teams_blame.js', 'poc_teams_chatlog.js'];
var fail = 0;
tests.forEach(function (t) {
  var r = cp.spawnSync(process.execPath, [path.join(__dirname, t)], { encoding: 'utf8' });
  process.stdout.write(r.stdout || '');
  if (r.stderr) process.stderr.write(r.stderr);
  if (r.status !== 0 || /❌|FAIL/.test(r.stdout || '')) fail++;
});
console.log('\n' + (fail === 0 ? '✅ ALL TEAMS WITNESSES PASS (25/25)' : '❌ ' + fail + ' witness file(s) FAILED'));
process.exit(fail === 0 ? 0 : 1);
