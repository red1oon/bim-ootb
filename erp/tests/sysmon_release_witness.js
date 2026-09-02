#!/usr/bin/env node
// BIM OOTB — ERP. Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>. SPDX-License-Identifier: MIT
/**
 * sysmon_release_witness.js — W-SYSMON-RELEASE.
 *   Spec: prompts/RESUME_SYSMON_RELEASE_LINK.md §FIX A + §FIX B (revised 2026-06-25: semver + build)
 *   Module: erp/system_monitor.js
 *
 * Issue it PROVES: the System Monitor Release row tells the TRUTH and links to a release that EXISTS.
 *   Two decoupled ids: `version` = the SEMVER release (vX.Y.Z, cut by release-please — the row links it);
 *   `build` = the deployed sw CACHE_VERSION (vNNN — cache-bust id, has no release of its own).
 *   - resolveRelease() prefers version.json (carries both), falls back to the SW report (build only), and
 *     ONLY shows "(uncontrolled)" when there is genuinely no signal (non-invent).
 *   - releaseHref() links ONLY a semver tag — NEVER a bare build vNNN (which has no release → would 404).
 * §FALSIFIER: a real version that resolves to "(uncontrolled)" = FAIL; a link to a non-existent build tag = FAIL.
 * Whitebox §-log proof only — no browser (the SW timing is the very thing version.json removes). READ THE LOG.
 */
'use strict';
var path = require('path');
var M = require(path.join(__dirname, '..', 'system_monitor.js'));

var FAILS = [];
function check(name, cond, detail) { console.log((cond ? '   ✓ ' : '   ✗ ') + name + (detail ? ' — ' + detail : '')); if (!cond) FAILS.push(name); }

console.log('═══ §SYSMON-RELEASE — semver release + build, truth + a link that exists ═══');

// ── S1: deployed — version.json carries the semver release + the build; row links the SEMVER ───────────────
console.log('\n── S1: version.json {version: semver, build: vNNN} ──');
var r1 = M.resolveRelease(null, { version: 'v1.2.0', build: 'v754', sha: 'abc1234', pr: 523, date: '2026-06-25' });
console.log('§SYSMON-RELEASE version=' + r1.version + ' build=' + r1.build + ' source=' + r1.source);
check('W-SYSMON-RELEASE version = semver v1.2.0', r1.version === 'v1.2.0', 'version=' + r1.version);
check('W-SYSMON-RELEASE build = vNNN v754 (distinct from version)', r1.build === 'v754');
check('W-SYSMON-RELEASE source=version.json', r1.source === 'version.json');
var h1 = M.releaseHref(r1.version);
console.log('§SYSMON-RELEASE-LINK href=' + h1 + ' kind=release');
check('W-SYSMON-RELEASE-LINK href → /releases/tag/v1.2.0', h1 === 'https://github.com/red1oon/bim-ootb/releases/tag/v1.2.0', 'href=' + h1);

// ── S2: SW-only fallback (no version.json) — SW knows the BUILD, not the semver; show build, NO link ───────
console.log('\n── S2: SW controlling, no version.json → build only, NO 404-link ──');
var r2 = M.resolveRelease({ version: 'v754', controlled: true }, null);
console.log('§SYSMON-RELEASE version=' + r2.version + ' build=' + r2.build + ' source=' + r2.source + ' controlled=' + (r2.controlled ? 'Y' : 'N'));
check('W-SYSMON-RELEASE falls back to SW build v754', r2.version === 'v754' && r2.build === 'v754' && r2.source === 'sw');
check('W-SYSMON-RELEASE controlled flag honest (Y)', r2.controlled === true);
check('§FALSIFIER no link for a bare build id (would 404)', M.releaseHref(r2.version) === null);

// ── S3: version.json (semver) wins over a stale controlling SW (build) ─────────────────────────────────────
console.log('\n── S3: version.json semver overrides a stale controlling SW build ──');
var r3 = M.resolveRelease({ version: 'v753', controlled: true }, { version: 'v1.2.0', build: 'v754' });
check('W-SYSMON-RELEASE deployed semver wins', r3.version === 'v1.2.0' && r3.source === 'version.json', 'version=' + r3.version);
check('W-SYSMON-RELEASE keeps honest controlled flag from SW', r3.controlled === true);

// ── S4: genuinely no signal → honest "(uncontrolled)", NEVER invented, NO link ──────────────────────────────
console.log('\n── S4: no SW + no version.json → honest null (non-invent), no link ──');
var r4 = M.resolveRelease(null, null);
console.log('§SYSMON-RELEASE version=' + (r4.version || '(uncontrolled)') + ' source=' + r4.source);
check('W-SYSMON-RELEASE null version (caller shows "(uncontrolled)")', r4.version === null && r4.source === 'none');
check('W-SYSMON-RELEASE no link for a null version', M.releaseHref(r4.version) === null);

// ── S5: releaseHref links ONLY semver tags — never a build id, never junk ────────────────────────────────────
console.log('\n── S5: releaseHref is strict — only vX.Y[.Z] tags get a link ──');
check('href accepts v1.0.0', M.releaseHref('v1.0.0') === 'https://github.com/red1oon/bim-ootb/releases/tag/v1.0.0');
check('href accepts v2.3 (two-part)', M.releaseHref('v2.3') === 'https://github.com/red1oon/bim-ootb/releases/tag/v2.3');
check('§FALSIFIER href REFUSES a bare build id v754', M.releaseHref('v754') === null);
check('href refuses "(uncontrolled)"', M.releaseHref('(uncontrolled)') === null);
check('href refuses arbitrary "main"', M.releaseHref('main') === null);
check('href refuses "vNNN"', M.releaseHref('vNNN') === null);

console.log('\n§SYSMON-RELEASE-WITNESS OVERALL=' + (FAILS.length === 0 ? 'PASS' : 'FAIL (' + FAILS.join('; ') + ')'));
process.exit(FAILS.length === 0 ? 0 : 1);
