// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — run ALL Teams-overlay witnesses (auto-discovered); non-zero exit on any fail.
//   Standalone: no modeller deps. Read the log after every run.
'use strict';
var cp = require('child_process'), path = require('path'), fs = require('fs');
var dir = __dirname;
var tests = fs.readdirSync(dir)
  .filter(function (f) { return /^poc_teams_.*\.js$/.test(f); })
  .sort();
var fail = 0;
tests.forEach(function (t) {
  var r = cp.spawnSync(process.execPath, [path.join(dir, t)], { encoding: 'utf8' });
  process.stdout.write(r.stdout || '');
  if (r.stderr) process.stderr.write(r.stderr);
  if (r.status !== 0 || /❌|FAIL/.test(r.stdout || '')) fail++;
});
console.log('\n──────────────────────────────────────────────');
console.log(tests.length + ' witness file(s): ' + tests.join(', '));
console.log(fail === 0 ? '✅ ALL TEAMS WITNESSES PASS' : '❌ ' + fail + ' witness file(s) FAILED');
process.exit(fail === 0 ? 0 : 1);
