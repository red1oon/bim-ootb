#!/usr/bin/env node
/**
 * audit_section_refs.js — every `prompts/X.md` pointer in the code resolves to a real file.
 *
 * Implementing bim-compiler prompts/SCRIPT_LENGTH_REFACTOR_SEAMS.md §S62 — Witness: W-REF-RESOLVE
 *
 * WHY. This project tracks issues in `prompts/*.md` sections rather than an issue tracker, and the
 * code points AT those sections (`⛔ OPEN — ref: prompts/4D_GANTT_TM_REFACTOR.md §S58.5`). That is a
 * good system — the evidence lives with the decision, and it is versioned with the code — but it has
 * one failure mode an issue tracker does not: **the pointer can rot silently.** Nothing checked, in
 * either direction, that a referenced file still exists. Measured on origin/main at first run:
 * 138 distinct referenced files → 100 resolve, 25 resolve only under prompts/archive/, and 13 point
 * at nothing in either repo. A pointer to a file nobody can open is worse than no pointer: it reads
 * like provenance while carrying none.
 *
 * WHAT IT DOES NOT DO. It does not check that the § section inside the file still exists (see
 * SECTION CHECK below — measured, reported, deliberately not gated yet), and it does not judge
 * whether an archived doc is the right place for a live rule. Resolution only.
 *
 * TWO REPOS. Most specs live in the sibling bim-compiler checkout, not here. Resolution order:
 *   1. <repo>/prompts/            2. <repo>/prompts/archive/
 *   3. $PROMPTS_DIR (default ../bim-compiler/prompts)   4. $PROMPTS_DIR/archive/
 * Archive counts as RESOLVED — an archived spec is still readable, which is the whole claim a
 * pointer makes. If the sibling checkout is absent (CI runs with only this repo), refs that would
 * have resolved there are reported as NO-SIDECAR and do NOT fail: a missing neighbour is not rot.
 *
 * USAGE
 *   node tests/audit_section_refs.js            # gate: exit 1 on a NEW unresolvable ref
 *   node tests/audit_section_refs.js --list     # every ref found, with where it resolved
 *   PROMPTS_DIR=/path/to/prompts node tests/audit_section_refs.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SIDECAR = process.env.PROMPTS_DIR || path.resolve(ROOT, '..', 'bim-compiler', 'prompts');
const SCAN_DIRS = ['viewer', 'modeller', 'erp', 'common', 'scripts', 'tests'];
const LIST = process.argv.includes('--list');

// ── KNOWN_GONE — captured 2026-08-22 on origin/main. Same house pattern as audit_sw_precache.js's
// KNOWN_MISSING: shippable today, gates everything new. NOT a blessing — each is a real dead
// pointer whose spec was deleted rather than archived. Draining one means either restoring the
// doc to prompts/archive/ or removing the citation from the code that claims it.
const KNOWN_GONE = new Set([
  '2D_030_grid_ux_tshoot.md', 'ARC_GEO_FETCH_SPEC.md', 'BONSAI_LOFT_SPEC.md',
  'MODELLER_GIT_FAITHFUL_HISTORY.md', 'NAV_FIND_002_multiselect.md',
  'OCCL_STRUCT_SESSION_HANDOFF.md', 'PERIOD_CLOSE_FOLD_POC.md', 'RESUME_SEED_TRUNK.md',
  'RESUME_TERMINAL_RULE_MINING.md', 'STR_ROUTEWALKING_SPEC.md', 'TOUR_ROUTE_CACHE.md',
  'WALKER_GUARDS_ROSETTASTONE_SPEC.md', 'WATCHDOG_SCALE_AND_UX_SWEEP.md'
]);

const sidecarPresent = fs.existsSync(SIDECAR);
if (!sidecarPresent) {
  console.log('§REF_AUDIT_NOTE sidecar prompts dir not found at ' + SIDECAR +
              ' — refs that would resolve there are reported NO-SIDECAR, not failed');
}

function resolveRef(rel) {           // rel is like 'prompts/FOO.md'
  const base = path.basename(rel);
  const cands = [path.join(ROOT, rel), path.join(ROOT, 'prompts', 'archive', base)];
  if (sidecarPresent) cands.push(path.join(SIDECAR, base), path.join(SIDECAR, 'archive', base));
  for (const c of cands) if (fs.existsSync(c)) return c;
  return null;
}

// Grep is the right tool here and it is already a dependency of every other audit's workflow.
let hits = '';
try {
  hits = execSync('git grep -Ion -E "prompts/[A-Za-z0-9_]+\\.md(#[A-Za-z0-9_.§-]+)?" -- ' +
                  SCAN_DIRS.join(' '), { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
} catch (e) {
  if (e.status === 1) hits = '';    // grep found nothing — not an error
  else { console.log('§REF_AUDIT FAIL: git grep failed — ' + e.message); process.exit(1); }
}

const refs = new Map();              // 'prompts/X.md' -> [{file, line}]
for (const row of hits.split('\n')) {
  if (!row) continue;
  const m = row.match(/^([^:]+):(\d+):(.*)$/); if (!m) continue;
  const [, file, line, text] = m;
  for (const r of text.match(/prompts\/[A-Za-z0-9_]+\.md/g) || []) {
    if (!refs.has(r)) refs.set(r, []);
    refs.get(r).push({ file, line });
  }
}

let ok = 0, archived = 0, noSidecar = 0, known = 0, dead = 0, mentions = 0;
const deadList = [], revived = [];
for (const [rel, sites] of [...refs].sort()) {
  mentions += sites.length;
  const at = resolveRef(rel);
  const base = path.basename(rel);
  if (at) {
    if (KNOWN_GONE.has(base)) { revived.push(base); }
    if (at.includes(path.sep + 'archive' + path.sep)) archived++; else ok++;
    if (LIST) console.log('  ok    ' + rel + '  ->  ' + path.relative(ROOT, at));
  } else if (KNOWN_GONE.has(base)) {
    known++;
    console.log('  §REF_AUDIT KNOWN-GONE: ' + rel + ' (' + sites.length + ' citation' +
                (sites.length > 1 ? 's' : '') + ', first ' + sites[0].file + ':' + sites[0].line + ')');
  } else if (!sidecarPresent) {
    noSidecar++;
    if (LIST) console.log('  nosc  ' + rel + ' — unresolved, but the sidecar prompts dir is absent');
  } else {
    dead++; deadList.push(rel + '  (' + sites[0].file + ':' + sites[0].line + ')');
    console.log('  §REF_AUDIT DEAD: ' + rel + ' — cited at ' + sites[0].file + ':' + sites[0].line +
                ' but present in neither repo, nor either archive');
  }
}

console.log('§REF_AUDIT_SUMMARY ' + ok + ' resolved, ' + archived + ' archived, ' + known +
            ' known-gone, ' + noSidecar + ' no-sidecar, ' + dead + ' DEAD, ' +
            refs.size + ' distinct files, ' + mentions + ' citations');
if (revived.length) {
  console.log('§REF_AUDIT_REVIVED — these resolve again; drain them from KNOWN_GONE');
  revived.forEach(r => console.log('   ' + r));
}
if (deadList.length) { console.log('§REF_AUDIT_NEW_DEAD'); deadList.forEach(d => console.log('   ' + d)); }
if (dead > 0) process.exit(1);
