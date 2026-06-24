#!/usr/bin/env node
// BIM OOTB — ERP. Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>. SPDX-License-Identifier: MIT
/**
 * sysmon_release_witness.js — W-SYSMON-RELEASE.
 *   Spec: prompts/RESUME_SYSMON_RELEASE_LINK.md §FIX A + §FIX B  ·  Module: erp/system_monitor.js
 *
 * Issue it PROVES: the System Monitor Release row tells the TRUTH about the deployed build, and links to its
 *   GitHub release — instead of reading "(uncontrolled)" with no provenance.
 *   - resolveRelease() prefers version.json (deterministic deployed build), falls back to the SW report, and
 *     ONLY shows "(uncontrolled)" when there is genuinely no version (non-invent).
 *   - releaseHref() builds …/releases/tag/vNNN for a clean release tag and refuses anything else.
 * §FALSIFIER: a build that has a real version but still resolves to "(uncontrolled)" = FAIL (the original bug).
 * Whitebox §-log proof only — no browser (the SW timing is the very thing version.json removes). READ THE LOG.
 */
'use strict';
var path = require('path');
var M = require(path.join(__dirname, '..', 'system_monitor.js'));

var FAILS = [];
function check(name, cond, detail) { console.log((cond ? '   ✓ ' : '   ✗ ') + name + (detail ? ' — ' + detail : '')); if (!cond) FAILS.push(name); }

console.log('═══ §SYSMON-RELEASE — release row truth + provenance link ═══');

// ── S1: the post-update window — SW not controlling, but version.json shipped the truth ─────────────────────
// This is the ORIGINAL BUG scenario: controller=null. Without version.json the row read "(uncontrolled)".
console.log('\n── S1: SW uncontrolled but version.json present (the bug it fixes) ──');
var r1 = M.resolveRelease(null, { version: 'v753', sha: 'abc1234', pr: 521, date: '2026-06-25' });
console.log('§SYSMON-RELEASE version=' + r1.version + ' source=' + r1.source + ' controlled=' + (r1.controlled ? 'Y' : 'N'));
check('W-SYSMON-RELEASE version.json wins → v753', r1.version === 'v753', 'version=' + r1.version);
check('W-SYSMON-RELEASE source=version.json', r1.source === 'version.json', 'source=' + r1.source);
check('§FALSIFIER NOT "(uncontrolled)" when a real version exists', r1.version && r1.version !== '(uncontrolled)');
var h1 = M.releaseHref(r1.version);
console.log('§SYSMON-RELEASE-LINK href=' + h1 + ' kind=release autocut=Y');
check('W-SYSMON-RELEASE-LINK href → /releases/tag/v753', h1 === 'https://github.com/red1oon/bim-ootb/releases/tag/v753', 'href=' + h1);

// ── S2: steady state — SW controlling, version.json absent → SW report is used, controlled=Y ────────────────
console.log('\n── S2: SW controlling, no version.json → SW source, controlled=Y ──');
var r2 = M.resolveRelease({ version: 'v752', controlled: true }, null);
console.log('§SYSMON-RELEASE version=' + r2.version + ' source=' + r2.source + ' controlled=' + (r2.controlled ? 'Y' : 'N'));
check('W-SYSMON-RELEASE falls back to SW → v752', r2.version === 'v752' && r2.source === 'sw');
check('W-SYSMON-RELEASE controlled flag honest (Y)', r2.controlled === true);

// ── S3: version.json wins over a stale SW (deterministic deployed build) ─────────────────────────────────────
console.log('\n── S3: version.json (v753) overrides a stale controlling SW (v752) ──');
var r3 = M.resolveRelease({ version: 'v752', controlled: true }, { version: 'v753', sha: 'def5678' });
check('W-SYSMON-RELEASE deployed build (v753) wins over stale controller', r3.version === 'v753' && r3.source === 'version.json', 'version=' + r3.version + ' source=' + r3.source);
check('W-SYSMON-RELEASE keeps the honest controlled flag from SW', r3.controlled === true);

// ── S4: genuinely no signal → honest "(uncontrolled)", NEVER invented, NO link ──────────────────────────────
console.log('\n── S4: no SW + no version.json → honest null (non-invent), no link ──');
var r4 = M.resolveRelease(null, null);
console.log('§SYSMON-RELEASE version=' + (r4.version || '(uncontrolled)') + ' source=' + r4.source + ' controlled=' + (r4.controlled ? 'Y' : 'N'));
check('W-SYSMON-RELEASE null version (caller shows "(uncontrolled)")', r4.version === null && r4.source === 'none');
check('W-SYSMON-RELEASE no link for a null version', M.releaseHref(r4.version) === null);

// ── S5: releaseHref refuses non-release strings (no invented links) ─────────────────────────────────────────
console.log('\n── S5: releaseHref is strict — only vNNN tags get a link ──');
check('href refuses "(uncontrolled)"', M.releaseHref('(uncontrolled)') === null);
check('href refuses arbitrary "main"', M.releaseHref('main') === null);
check('href refuses "v" + non-digits', M.releaseHref('vNNN') === null);
check('href accepts a clean tag v1', M.releaseHref('v1') === 'https://github.com/red1oon/bim-ootb/releases/tag/v1');

console.log('\n§SYSMON-RELEASE-WITNESS OVERALL=' + (FAILS.length === 0 ? 'PASS' : 'FAIL (' + FAILS.join('; ') + ')'));
process.exit(FAILS.length === 0 ? 0 : 1);
