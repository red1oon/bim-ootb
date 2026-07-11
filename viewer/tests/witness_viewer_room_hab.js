#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-VIEWER-ROOM-HAB / W-VIEWER-TYPE-GROUP scope (READ THE LOG after every run)
 * SCOPE: bim-compiler prompts/Modeller/DISC_Walker/VIEWER_FIND_PANEL_ROOM_ACCURACY.md §2 Tasks 1+2
 * + §2b — the Viewer Find Panel Room Lens habitability filter (shared common/room_habitability.js
 * module, ported verbatim from disc_walker.js's W-ROOM-HAB-proven spaceHabitable) and the Type
 * toggle's COMPILED→predefined_type fallthrough fix, proven on REAL data whitebox-first per
 * docs/TestArchitecture.md §Browser Testing (§-log primary, no Playwright value checks).
 *
 * ISSUES THIS WITNESS EXPOSES (each named, per the test doctrine):
 *   V1 MODULE-PARITY   — does common/room_habitability.js classify EXACTLY like disc_walker.js's
 *                        proven original on Duplex's hand-verified known-21 (20 habitable, exactly
 *                        R301 Roof excluded, label:ROOF)? A drift here = the "shared module" claim
 *                        is false and the two copies have already diverged.
 *   V2 FALSIFIER       — exclude-list emptied → R301's label signal must VANISH and only the
 *                        independent zband signal may fire (z1 8.91 > envelope+0.25). Proves V1's
 *                        pass depends on the real NONHAB_TYPES list, not harness bias.
 *   V3 OBJECT-TYPE LOAD-BEARING — the OLD query had NO object_type column; a name-only label
 *                        ('R301') never matches ROOF, so the label signal would be structurally
 *                        blind on Duplex. Recompute verdicts with name-only labels: R301's label
 *                        exclusion must VANISH (only zband may still catch it). Proves the query
 *                        change (adding object_type + the empty→name fallback) is what makes
 *                        Task 1's filter able to fire, not just the classifier's existence.
 *   V4 HHS-POST-MIGRATION — §2b's ROOM021 migration applied: HHS buildings db carries 105 IfcSpace
 *                        (was 14 stale rows), ALL pass the filter (COMPILED/synthetic rows carry no
 *                        real space-type label — placement exclusion is the separate RM_ mechanism,
 *                        display is wanted here), zero non-habitable leaks.
 *   V5 TYPE-GROUPING   — Task 2's precedence fix, run on HHS's real rows with the OLD line vs the
 *                        NEW line: old (r[3]||r[4]) buckets all 105 under 'COMPILED'; new
 *                        (COMPILED→r[4]) yields INTERNAL_DOORPART=105 as its own group. Both are
 *                        computed and logged so the fix's effect is visible, not asserted.
 *   V6 STOREY-INTACT   — the Storey grouping path (default view) is untouched by Task 2: HHS rooms
 *                        group under their 4 real storeys (Level 1/2/3 + Unknown), no '(no storey)'.
 * RUN: node viewer/tests/witness_viewer_room_hab.js   (from the worktree root)
 * PASS bar: all chk() green. Read-only — mutates nothing.
 */
'use strict';
const path = require('path');
const Database = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'better-sqlite3'));
const RH = require(path.join(__dirname, '..', '..', 'common', 'room_habitability.js'));

const DUPLEX = path.join(process.env.HOME, 'bim-compiler', 'deploy', 'buildings', 'Duplex_extracted.db');
const HHS = path.join(__dirname, '..', '..', 'buildings', 'HHS_Office_Federated_extracted.db');
let pass = 0, fail = 0;
const chk = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  ❌ ' + n + (x ? '  ' + x : '')); } };

// The EXACT queries _allRoomVolumes() now runs (viewer/navigate_find.js §2 Task 1), node-side.
const ROOM_SQL = "SELECT guid, name, object_type, center_x, center_y, center_z, size_x, size_y, size_z" +
  " FROM spatial_structure WHERE type='IfcSpace' AND center_x IS NOT NULL AND size_x IS NOT NULL";
const ENV_SQL = "SELECT MIN(center_z-bbox_z/2) z0, MAX(center_z+bbox_z/2) z1 FROM element_transforms";

function volumes(dbPath, excludeList) {
  const db = new Database(dbPath, { readonly: true });
  const env = db.prepare(ENV_SQL).get();
  const rows = db.prepare(ROOM_SQL).raw().all();  // raw() = value arrays, same shape as A.dbQuery
  const kept = [], excluded = [];
  rows.forEach(r => {
    // label fallback exactly as the Viewer code: object_type empty → name
    const label = (r[2] != null && String(r[2]).length) ? r[2] : r[1];
    const z1 = (r[5] || 0) + (r[8] || 0) / 2;
    const v = RH.spaceHabitable({ label: label, z1: z1 }, { z1: env.z1 }, excludeList);
    if (v.ok) kept.push({ guid: r[0], name: r[1] }); else excluded.push({ name: r[1], why: v.why });
  });
  db.close();
  return { env, rows, kept, excluded };
}

// ── V1/V2/V3 on Duplex's hand-verified known-21 ──────────────────────────────
const dx = volumes(DUPLEX);
console.log(`§VIEWER-ROOM-HAB duplex spaces=${dx.rows.length} env.z1=${dx.env.z1.toFixed(2)} kept=${dx.kept.length} excluded=${dx.excluded.length}`);
dx.excluded.forEach(e => console.log(`§VIEWER-ROOM-HAB NONHAB ${e.name} — ${e.why}`));
chk('V1 MODULE-PARITY duplex known-21 → 20 habitable + exactly R301 excluded (label:ROOF)',
  dx.rows.length === 21 && dx.kept.length === 20 && dx.excluded.length === 1 &&
  dx.excluded[0].name === 'R301' && dx.excluded[0].why === 'label:ROOF',
  `${dx.kept.length} ok, excluded: ${dx.excluded.map(e => e.name + '(' + e.why + ')').join(',') || 'none'}`);

const dxNoList = volumes(DUPLEX, []);
console.log(`§VIEWER-ROOM-HAB falsifier(list=[]) excluded=${dxNoList.excluded.map(e => e.name + '(' + e.why + ')').join(',') || 'none'}`);
chk('V2 FALSIFIER list emptied → label signal vanishes, independent zband still catches R301',
  dxNoList.excluded.length === 1 && dxNoList.excluded[0].name === 'R301' &&
  /^zband:/.test(dxNoList.excluded[0].why),
  dxNoList.excluded[0] && dxNoList.excluded[0].why);
// V3: simulate the OLD query's blindness — labels from name only (no object_type column).
const db3 = new Database(DUPLEX, { readonly: true });
const env3 = db3.prepare(ENV_SQL).get();
const nameOnly = db3.prepare(ROOM_SQL).raw().all().map(r => {
  const v = RH.spaceHabitable({ label: r[1], z1: (r[5] || 0) + (r[8] || 0) / 2 }, { z1: env3.z1 });
  return { name: r[1], why: v.ok ? null : v.why };
}).filter(x => x.why);
db3.close();
console.log(`§VIEWER-ROOM-HAB v3(name-only labels) excluded=${nameOnly.map(e => e.name + '(' + e.why + ')').join(',') || 'none'}`);
chk('V3 OBJECT-TYPE LOAD-BEARING name-only labels (old query shape) → label:ROOF vanishes, only zband catches R301',
  nameOnly.length === 1 && nameOnly[0].name === 'R301' && /^zband:/.test(nameOnly[0].why) &&
  dx.excluded[0].why === 'label:ROOF',
  `name-only: ${nameOnly[0] && nameOnly[0].why}; new query: label:ROOF via object_type='Roof'`);

// ── V4 HHS post-ROOM021 migration ────────────────────────────────────────────
const hh = volumes(HHS);
console.log(`§VIEWER-ROOM-HAB hhs spaces=${hh.rows.length} env.z1=${hh.env.z1.toFixed(2)} kept=${hh.kept.length} excluded=${hh.excluded.length}`);
chk('V4 HHS-POST-MIGRATION 105 IfcSpace rows (was stale 14), all kept, zero non-habitable leaks',
  hh.rows.length === 105 && hh.kept.length === 105 && hh.excluded.length === 0,
  `rows=${hh.rows.length} kept=${hh.kept.length} excluded=${hh.excluded.length}`);

// ── V5 Task 2 Type-grouping precedence, old vs new, on HHS's real rows ──────
const db2 = new Database(HHS, { readonly: true });
const treeRows = db2.prepare("SELECT s.guid, s.name, p.name, s.object_type, s.predefined_type" +
  " FROM spatial_structure s LEFT JOIN spatial_structure p ON p.guid = s.parent_guid" +
  " WHERE s.type='IfcSpace' AND s.center_x IS NOT NULL ORDER BY p.name, s.name").raw().all();
const groupOld = {}, groupNew = {};
treeRows.forEach(r => {
  const gkOld = r[3] || r[4] || '(untyped)';                                        // the OLD line (the bug)
  const gkNew = (r[3] === 'COMPILED') ? (r[4] || '(untyped)') : (r[3] || r[4] || '(untyped)'); // the NEW line
  groupOld[gkOld] = (groupOld[gkOld] || 0) + 1;
  groupNew[gkNew] = (groupNew[gkNew] || 0) + 1;
});
console.log('§VIEWER-TYPE-GROUP hhs OLD precedence groups=' + JSON.stringify(groupOld));
console.log('§VIEWER-TYPE-GROUP hhs NEW precedence groups=' + JSON.stringify(groupNew));
chk('V5 TYPE-GROUPING old line buckets 105 under COMPILED; new line shows INTERNAL_DOORPART=105',
  groupOld['COMPILED'] === 105 && groupNew['INTERNAL_DOORPART'] === 105 && !groupNew['COMPILED'],
  `old.COMPILED=${groupOld['COMPILED']} new.INTERNAL_DOORPART=${groupNew['INTERNAL_DOORPART']}`);

// ── V6 Storey grouping untouched ─────────────────────────────────────────────
const storeys = {};
treeRows.forEach(r => { const gk = r[2] || '(no storey)'; storeys[gk] = (storeys[gk] || 0) + 1; });
console.log('§VIEWER-TYPE-GROUP hhs storey groups=' + JSON.stringify(storeys));
chk('V6 STOREY-INTACT 4 real storey groups, no (no storey) orphan',
  Object.keys(storeys).length === 4 && !storeys['(no storey)'],
  Object.keys(storeys).join('|'));
db2.close();

console.log(`§VIEWER-ROOM-HAB RESULT pass=${pass} fail=${fail}`);
process.exit(fail ? 1 : 0);
