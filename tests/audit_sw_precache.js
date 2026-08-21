/**
 * audit_sw_precache.js — the sw.js precache list and the viewer's real script set agree.
 *
 * Two invariants, deliberately both directions (§S61.2, bim-compiler
 * prompts/SCRIPT_LENGTH_REFACTOR_SEAMS.md):
 *   1. LISTED-IS-REAL   every entry in PRECACHE_ASSETS exists on disk.
 *      Issue: Missing precache file → offline user gets blank page with no error.
 *   2. NEEDED-IS-LISTED every non-lib <script src> in viewer.html is in PRECACHE_ASSETS.
 *      Issue (W-SW-UNLISTED): a NEW viewer file wired into viewer.html but forgotten in
 *      PRECACHE_ASSETS passed this audit, passed audit_script_tags.js, passed every witness —
 *      and broke only offline users, silently. Invariant 1 alone cannot see that: it only ever
 *      asks about files someone already remembered to list.
 */
const fs = require('fs');
const path = require('path');

const swPath = path.resolve(__dirname, '..', 'viewer', 'sw.js');
const viewerDir = path.resolve(__dirname, '..', 'viewer');
const swSrc = fs.readFileSync(swPath, 'utf8');

// Extract PRECACHE_ASSETS array
const match = swSrc.match(/PRECACHE_ASSETS\s*=\s*\[([\s\S]*?)\]/);
if (!match) { console.log('§SW_AUDIT FAIL: PRECACHE_ASSETS not found in sw.js'); process.exit(1); }

const entries = match[1].match(/'([^']+)'/g);
if (!entries) { console.log('§SW_AUDIT FAIL: No entries in PRECACHE_ASSETS'); process.exit(1); }

// Known missing — pre-existing, tracked separately
var KNOWN_MISSING = ['index.html', 'mep_rw.db'];

var pass = 0, fail = 0, warn = 0;
for (const entry of entries) {
  const file = entry.replace(/'/g, '');
  // Skip CDN URLs and root paths
  if (file.startsWith('http') || file === '/' || file === './' || file === '') continue;
  const fullPath = path.resolve(viewerDir, file);
  if (fs.existsSync(fullPath)) {
    pass++;
  } else if (KNOWN_MISSING.includes(file)) {
    warn++;
    console.log('  §SW_AUDIT WARN: ' + file + ' — known missing (pre-existing)');
  } else {
    fail++;
    console.log('  §SW_AUDIT FAIL: ' + file + ' → ' + fullPath + ' NOT FOUND');
  }
}

console.log('§SW_AUDIT_SUMMARY ' + pass + ' found, ' + fail + ' missing, ' + warn + ' known-missing, ' + (pass + fail + warn) + ' total');

// ── Invariant 2: NEEDED-IS-LISTED (W-SW-UNLISTED) ───────────────────────────────────────────
// Same <script src> parse as audit_script_tags.js:13 and the same two skips it makes
// (:21 http/protocol-relative, :23 lib/ third-party). ONE parser shape, two callers — a second
// divergent regex here would be its own drift.
const htmlPath = path.resolve(__dirname, '..', 'viewer', 'viewer.html');
const htmlSrc = fs.readFileSync(htmlPath, 'utf8');
const listed = new Set(entries.map(e => e.replace(/'/g, '')));

// Lanes deliberately outside the offline shell. A PREFIX rule, each with its reason — not a
// bare skip list, so a new file inside one of these lanes is also knowingly excluded.
var UNLISTED_LANES = [
  { prefix: '../hr_bim_asset/', why: 'HBA demo lane — its own page, not part of the viewer offline shell' },
  { prefix: 'hba_',             why: 'HBA demo lane (viewer-side half), same scope as above' },
  { prefix: 'connect_',         why: 'dev-only cross-window harness, never shipped to an offline user' },
  { prefix: 'effects_gi_poc',   why: 'GI proof-of-concept behind Alt+G, not a shell asset' }
];
// DRAINED 2026-08-21, same PR: all 18 were added to PRECACHE_ASSETS (344 KB, measured) the
// moment this audit made them visible. Kept as an empty list, not deleted — the next file that
// needs a deliberate, reasoned exception has a place to go that is not a bare skip.
var UNLISTED_TRIAGE = [];

const scriptTags = htmlSrc.match(/src="([^"]+\.js[^"]*)"/g) || [];
var uPass = 0, uFail = 0, uLane = 0, uTriage = 0;
for (const tag of scriptTags) {
  const file = tag.match(/src="([^"]+)"/)[1].split('?')[0];
  if (file.startsWith('http') || file.startsWith('//') || file.startsWith('lib/')) continue;
  if (listed.has(file)) { uPass++; continue; }
  const lane = UNLISTED_LANES.find(l => file.startsWith(l.prefix));
  if (lane) { uLane++; continue; }
  if (UNLISTED_TRIAGE.includes(file)) {
    uTriage++;
    console.log('  §SW_AUDIT_UNLISTED WARN: ' + file + ' — captured 2026-08-21, offline gap owed a decision');
  } else {
    uFail++;
    console.log('  §SW_AUDIT_UNLISTED FAIL: ' + file + ' — loaded by viewer.html, absent from PRECACHE_ASSETS');
  }
}
console.log('§SW_AUDIT_UNLISTED_SUMMARY ' + uPass + ' precached, ' + uFail + ' unlisted, ' +
  uTriage + ' known-gap, ' + uLane + ' out-of-shell, ' + (uPass + uFail + uTriage + uLane) + ' scripts');

if (fail > 0 || uFail > 0) process.exit(1);
