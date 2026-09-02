#!/usr/bin/env node
/* ⚠ WITNESS — §4D_FACADE_ORDER (2026-07-31 follow-on to §STAGE A / §4D_HOST_BEFORE_HOSTED).
 * Spec: bim-compiler prompts/RESUME_4D_TRUTH_AND_BE_HERE_WHEN.md §STAGE A + GANTT_ACCURACY.md
 * §4D_HOST_BEFORE_HOSTED. Read those before changing anything here.
 *
 * NAMES THE ISSUE: tests/test_host_order.js proved the GENERATIVE fallback path
 * (schedule_gate.js, via injectGantt's own PASS A/B) is 0/1445 violations once glazed
 * IfcPlate/IfcMember are reclassified out of Superstructure (rates/sequence_rules.json
 * NAME_OVERRIDES). But the AUTHORED/CAPTURED path — schedule_author.js materializeDefault()
 * groups elements into 6 WBS phases, then time_machine.js's §PLAYBACK-STAGGER block
 * (~:3454-3489) spreads each phase-task's elements across its date window — used a DIFFERENT,
 * simpler sort: raw center_z only, no trade order. A window/glazed-panel (seq 7) and its host
 * wall (seq 6) frequently have near-identical center_z (the opening sits INSIDE the wall's
 * height span), so cz-only sort still put the panel first in ~46% of touching pairs even
 * after the phase-bucket fix. This witness proves that number and proves the (seq,cz) fix.
 *
 * DB: set HOST_TEST_DB, else ~/bim-ootb/buildings/Hospital_extracted.db. SKIPs (exit 0) if absent.
 * Element construction + matchRule/matchNameOverride replicated VERBATIM from time_machine.js
 * (same whitebox convention as test_host_order.js) — the sort comparator under test is copied
 * as the literal OLD vs NEW candidates, not re-derived. NOT wired into CI (needs a 263MB building
 * DB CI does not have).
 *
 * Read the §-log lines. Exit code alone is not evidence.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const DB = process.env.HOST_TEST_DB ||
  path.join(process.env.HOME || '/home/red1', 'bim-ootb/buildings/Hospital_extracted.db');
if (!fs.existsSync(DB)) { console.log('§FACADE_STAGGER SKIP — no test DB at ' + DB); process.exit(0); }

const RATES = JSON.parse(fs.readFileSync(path.join(__dirname, '../viewer/rates/sequence_rules.json'), 'utf8'));
const SR = RATES.SEQUENCE_RULES, SD = RATES.SEQUENCE_DEFAULT, NO = RATES.NAME_OVERRIDES || [];

function matchNameOverride(cls, name) {
  if (!name) return null;
  for (const ov of NO) {
    if (ov.classes && ov.classes.indexOf(cls) < 0) continue;
    if (!ov._re) { try { ov._re = new RegExp(ov.pattern, ov.flags || 'i'); } catch (e) { ov._re = null; } }
    if (ov._re && ov._re.test(name)) return ov;
  }
  return null;
}
function matchRule(cls, name) {
  if (!cls) return SD;
  const ov = matchNameOverride(cls, name);
  if (ov) return ov;
  let bestKey = null, bestLen = 0;
  for (const key in SR) if (cls.indexOf(key) >= 0 && key.length > bestLen) { bestKey = key; bestLen = key.length; }
  return bestKey ? SR[bestKey] : SD;
}

const CELL = 4;
const cellsOf = e => {
  const o = [];
  for (let i = Math.floor(e.x0 / CELL); i <= Math.floor(e.x1 / CELL); i++)
    for (let j = Math.floor(e.y0 / CELL); j <= Math.floor(e.y1 / CELL); j++) o.push(i + ',' + j);
  return o;
};
const overlaps3d = (a, b, t) =>
  a.x0 <= b.x1 + t && a.x1 >= b.x0 - t && a.y0 <= b.y1 + t && a.y1 >= b.y0 - t &&
  a.base_z <= b.top_z + t && a.top_z >= b.base_z - t;
const GLAZE_RE = /glaz|glass|verglas|vitrage|vidrio|curtain|mullion/i;

// staggerSort — the two candidate sort keys for §PLAYBACK-STAGGER's per-task distribute.
// 'cz' = the OLD behaviour (time_machine.js pre-fix); 'seqcz' = the FIX (:3475 post-fix).
function violations(elements, sortMode) {
  const arch = elements.filter(e =>
    ['IfcWall', 'IfcWallStandardCase', 'IfcWindow', 'IfcDoor', 'IfcCurtainWall'].includes(e.cls) ||
    (['IfcPlate', 'IfcMember'].includes(e.cls) && GLAZE_RE.test(e.name)));
  arch.sort(sortMode === 'seqcz' ? (a, b) => (a.seq - b.seq) || (a.cz - b.cz) : (a, b) => a.cz - b.cz);
  arch.forEach((e, i) => { e.zrank = i; });

  const walls = arch.filter(e => e.cls === 'IfcWall' || e.cls === 'IfcWallStandardCase');
  const glaze = arch.filter(e => e.cls === 'IfcPlate' && GLAZE_RE.test(e.name));
  const grid = {};
  walls.forEach(w => cellsOf(w).forEach(c => (grid[c] = grid[c] || []).push(w)));

  let touching = 0, viol = 0;
  glaze.forEach(g => {
    const seen = {}; let hasTouch = false, earliestRank = null;
    cellsOf(g).forEach(c => {
      const a = grid[c]; if (!a) return;
      for (let i = 0; i < a.length; i++) {
        const w = a[i];
        if (seen[w.guid]) continue;
        seen[w.guid] = 1;
        if (!overlaps3d(w, g, 0.25)) continue;
        hasTouch = true;
        if (earliestRank === null || w.zrank < earliestRank) earliestRank = w.zrank;
      }
    });
    if (!hasTouch) return;
    touching++;
    if (earliestRank !== null && earliestRank > g.zrank) viol++;
  });
  return { touching, viol };
}

const rows = require('child_process').execSync(
  `sqlite3 -noheader -separator '~@~' "${DB}" ` +
  `"SELECT m.guid, m.ifc_class, COALESCE(m.element_name,''), COALESCE(t.center_z,0), COALESCE(t.bbox_z,0), ` +
  `COALESCE(t.center_x,0), COALESCE(t.center_y,0), COALESCE(t.bbox_x,0), COALESCE(t.bbox_y,0) ` +
  `FROM elements_meta m LEFT JOIN element_transforms t ON t.guid = m.guid ` +
  `WHERE m.ifc_class != 'IfcOpeningElement';"`,
  { maxBuffer: 1 << 30 }).toString().trim().split('\n').map(l => l.split('~@~'));

const elements = rows.map(r => {
  const cls = r[1], name = r[2] || '';
  const cz = +r[3] || 0, bz = +r[4] || 0, cx = +r[5] || 0, cy = +r[6] || 0, bx = +r[7] || 0, by = +r[8] || 0;
  const rule = matchRule(cls, name);
  return {
    guid: r[0], cls, name, cz, seq: rule.sequence,
    base_z: cz - bz / 2, top_z: cz + bz / 2,
    x0: cx - bx / 2, x1: cx + bx / 2, y0: cy - by / 2, y1: cy + by / 2
  };
});

console.log('§FACADE_STAGGER db=' + path.basename(DB) + ' elements=' + elements.length);
const before = violations(elements, 'cz');
const after = violations(elements, 'seqcz');
console.log('§ZORDER_FACADE sortKey=cz(OLD)    panelsWithTouchingWall=' + before.touching +
  ' violations=' + before.viol + '/' + before.touching + (before.viol ? '  RED' : ''));
console.log('§ZORDER_FACADE sortKey=seq,cz(NEW) panelsWithTouchingWall=' + after.touching +
  ' violations=' + after.viol + '/' + after.touching + (after.viol ? '  RED' : ''));

const RED = (before.viol === 0) ? 1 : 0;  // the OLD sort must show RED, or this never reproduced
const STILL_RED = (after.viol > 0) ? 1 : 0;
if (RED) console.log('§VERDICT INVALID — the OLD (cz-only) sort key shows 0 violations; nothing to fix, re-check the DB/repro');
console.log('§VERDICT ' + (STILL_RED ? 'RED' : 'GREEN') + ' — old_sort_violations=' + before.viol +
  ' new_sort_violations=' + after.viol + '. See bim-compiler prompts/RESUME_4D_TRUTH_AND_BE_HERE_WHEN.md §STAGE A.');
