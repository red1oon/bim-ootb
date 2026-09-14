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

// ── Extract PRECACHE_ASSETS array ────────────────────────────────────────────────────────────────
// §SW_AUDIT_QUOTE (2026-09-15). This used to be one regex over the raw source:
//     swSrc.match(/PRECACHE_ASSETS\s*=\s*\[([\s\S]*?)\]/)  then  body.match(/'([^']+)'/g)
// Both halves had a SILENT failure mode, and both fired for real:
//   (a) the quote pairer does not know what a comment is. ONE apostrophe in a comment inside the array
//       ("the sched4d pill's on-the-fly", PR #1736) opened a phantom string, desynchronised every quote
//       pair after it, and dropped 12 entries from the parsed set. The audit then reported files that
//       had not changed in months — print_sheet.js, ghostglass.js — as unlisted, and said nothing about
//       the real cause. 57 of this array's 187 body lines carry comments, so the surface is large.
//   (b) the array capture is non-greedy to the first ']', so a ']' anywhere in a comment would truncate
//       the body and silently hide every entry after it, the same way.
// Fixed by stripping comments — but from the BODY ONLY, located first, never from the whole file.
// MEASURED: a whole-file strip (the obvious version) makes the declaration itself unfindable
// ("ARRAY NOT FOUND"), because '//' occurs in the file outside this array. Locate, then strip, then cut.
function _stripComments(body) {
  return body
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map(function (line) {
      // Cut at the first '//' that is NOT inside a quoted string. Entry paths in this array carry no
      // protocol (verified: 0 entries contain '://'), but the quote count keeps that true by
      // construction rather than by assumption, so a future CDN entry cannot silently re-break this.
      for (var i = 0; i + 1 < line.length; i++) {
        if (line[i] === '/' && line[i + 1] === '/') {
          var quotes = (line.slice(0, i).match(/'/g) || []).length;
          if (quotes % 2 === 0) return line.slice(0, i);
        }
      }
      return line;
    })
    .join('\n');
}
const _declAt = swSrc.search(/PRECACHE_ASSETS\s*=\s*\[/);
if (_declAt < 0) { console.log('§SW_AUDIT FAIL: PRECACHE_ASSETS not found in sw.js'); process.exit(1); }
const _afterBracket = swSrc.slice(swSrc.indexOf('[', _declAt) + 1);
const _clean = _stripComments(_afterBracket);
const _end = _clean.indexOf(']');
if (_end < 0) { console.log('§SW_AUDIT FAIL: PRECACHE_ASSETS array has no closing bracket'); process.exit(1); }
const match = [null, _clean.slice(0, _end)];

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
// Individually captured on 2026-08-21 at a98b62c. These are NOT blessed — each is a real
// offline gap owed a decision (§S61.2). They are listed so the audit can gate anything NEW
// while the existing 18 get triaged, instead of the check being unshippable on day one.
var UNLISTED_TRIAGE = ['../common/history_tap.js', 'share.js', '../erp/bigdecimal.js',
  '../erp/ad_docfsm.js', 'blue_fold.js', 'proj_fold.js', 'vo_fold.js', 'proj_control.js',
  'whatif.js', 'whatif_panel.js', 'vo_approve.js', 'proj_period.js', 'proj_claim.js',
  '../common/whole_history.js', '../common/history_bar.js', '../common/about_diy.js',
  'universal_history.js', 'sfx.js'];

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
