#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: GPL-2.0-only
// ⚠ DO NOT REMOVE — W-CORE-UNTOUCHED (bim-compiler prompts/ERP_DEPTH_FILM.md §EXTENSION-LAYER LAW). READ THE LOG: §CU lines.
// THE ISSUE it proves/disproves: the overlay (lens / pill / Home / Quick-setup) is an overlay OVER an immutable core. Against the BASE commit (default: the last core commit before any overlay work, b2fa278b;
//   override with CU_BASE=<rev> to guard a later branch point) the diff of every file under erp/ OUTSIDE erp/overlay, erp/tests and erp/patches may contain ONLY (a) the single seam line
//   `<script src="overlay/boot.js">` in idempiere.html and (b) the CACHE_VERSION line of sw.js. Also: no core file references erp/overlay except that seam, and the overlay never writes with a non-TEMP DDL.
//   erp/patches/ad_seed.db.sql is the sanctioned data self-heal (legacy dictionary rows), listed separately, never code.
'use strict';
var cp = require('child_process'), path = require('path'), log = console.log, fails = 0, judged = 0;
var BASE = process.env.CU_BASE || 'b2fa278bdd9dc1361cfd07edab8d6372a44db366', REPO = path.join(__dirname, '..', '..');
function sh(c) { return cp.execSync(c, { cwd: REPO, encoding: 'utf8', maxBuffer: 1 << 26 }); }
function check(name, ok, info) { judged++; if (!ok) fails++; log('  §CU-CHECK ' + name + ' ' + (ok ? 'OK' : 'FAIL') + (ok ? '' : ' ' + JSON.stringify(info))); }
try { sh('git cat-file -e ' + BASE + '^{commit}'); } catch (e) { log('§CU-VERDICT INCONCLUSIVE base commit ' + BASE + ' not in this clone'); process.exit(3); }
var files = sh('git diff --name-only ' + BASE + ' -- erp ":!erp/overlay" ":!erp/tests" ":!erp/patches"').split('\n').filter(Boolean);
log('§CU core files differing from ' + BASE.slice(0, 8) + ': ' + (files.join(', ') || 'none'));
var allowed = ['erp/idempiere.html', 'erp/sw.js'], extra = files.filter(function (f) { return allowed.indexOf(f) < 0; });
check('CU1 no core file other than idempiere.html / sw.js differs from the base', extra.length === 0, extra);
var hunks = function (f) { return sh('git diff -U0 ' + BASE + ' -- ' + f).split('\n').filter(function (l) { return /^[+-]/.test(l) && !/^(\+\+\+|---)/.test(l); }); };
var h = hunks('erp/idempiere.html'), seam = h.filter(function (l) { return /^\+<script src="overlay\/boot\.js"><\/script>/.test(l); });
check('CU2 idempiere.html differs ONLY by the one overlay seam line (' + h.length + ' changed line(s))', h.length === 1 && seam.length === 1, h.slice(0, 4));
var s = hunks('erp/sw.js');
check('CU3 sw.js differs ONLY by CACHE_VERSION (the existing per-deploy bump)', s.length === 2 && s.every(function (l) { return /CACHE_VERSION/.test(l); }), s.slice(0, 4));
var refs = sh('git grep -l -E "overlay/(boot|home|pills|quicksetup_ui|goal_engine|dashboard_|setup_lens|window_lens|quick_input|invoice_open)" -- erp ":!erp/overlay" ":!erp/tests" ":!erp/patches" ":!erp/sqljs" || true').split('\n').filter(Boolean);
log('§CU core files referencing an overlay module: ' + (refs.join(', ') || 'none'));
check('CU4 only idempiere.html (the seam) references an overlay module', refs.every(function (f) { return f === 'erp/idempiere.html'; }) && refs.length <= 1, refs);
var v = !judged ? 'INCONCLUSIVE' : fails ? 'FAIL' : 'PASS'; log('§CU-VERDICT ' + v + ' judged=' + judged + ' failed=' + fails); process.exit(v === 'PASS' ? 0 : v === 'FAIL' ? 1 : 3);
