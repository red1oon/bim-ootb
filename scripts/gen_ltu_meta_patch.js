#!/usr/bin/env node
// gen_ltu_meta_patch.js (§S11, bim-compiler prompts/4D_GANTT_TM_REFACTOR.md) —
// LTU_AHouse_meta.db carries the same per-element-corrupted transform rebase Terminal_meta.db did
// (§S10), 16x worse: 33,528 of 125,698 rows deviate >EPS from the modal rigid offset
// (−388.685560, −87.610001, 0.000000) against LTU_AHouse_extracted.db, and 3,105 sit at center_z
// EXACTLY 0 — half the top structural floor (VÅN 4, p50 z = 0.00 vs 13.73 in extracted) lying on
// the ground plane. geo.db is NOT involved: its base_geometries vertices are local-centred
// (measured 400/400), so a repaired transform moves mesh and bbox together — the "regenerate the
// pair, never snap" hold in §S10_RESULTS rested on a premise that measured false.
//
// SOURCE OF TRUTH FOR THE REPAIRED VALUES = meta.db's OWN elements_rtree. That table (125,698
// rows, keyed on elements_meta.id) was built BEFORE the corruption: its box centres agree with
// extracted+modal-offset on 125,698/125,698 rows (100.0%) but with meta's own element_transforms
// on only 92,174 (73.3%). So the pre-corruption values are already in-file, and the patch is 3
// statements (~1KB) instead of 33,528 literal UPDATEs (~4MB) — which matters because
// _applyPendingPatch re-runs the whole patch, plus a full pdb.export(), on EVERY load of this
// 52MB DB (the fleet's heaviest). Idempotent by construction: the repair set is "rows whose
// transform disagrees with their own r-tree box by >EPS"; after one apply it is empty.
//
// This script does not template the SQL (it has no per-row literals) — it MEASURES the repair set
// the SQL will touch, against both meta's r-tree and extracted-truth, and writes the patch with
// those measured numbers in its header. Run it from a checkout that has the DB binaries
// (they are gitignored; ~/bim-ootb/buildings/).
'use strict';
const fs = require('fs'), path = require('path');
const OOTB = process.env.OOTB_DIR || path.join(require('os').homedir(), 'bim-ootb');
const initSqlJs = require(path.join(OOTB, 'modeller', 'lib', 'sql-wasm.js'));
const EPS = 0.05;                 // ScheduleGate.EPS, mirrored (below it no schedule predicate can change)
const PFX = 'T0_LTU_AHouse_';

// The staging table is declared with an explicit `guid TEXT PRIMARY KEY` rather than written as a
// `CREATE TEMP TABLE ... AS SELECT`: the AS-SELECT form has no index, so the three correlated
// lookups in the UPDATE degrade to 33,524 x 33,524 scans — measured, it does not finish in 2
// minutes under the bundled wasm. With the PRIMARY KEY each lookup is an index seek (0.46s for the
// whole patch under sqlite3, ~2s under sql.js). Keep the key.
const SQL_BODY = [
  'CREATE TEMP TABLE _s11_fix (guid TEXT PRIMARY KEY, cx REAL, cy REAL, cz REAL);',
  'INSERT INTO _s11_fix SELECT m.guid,',
  '  (r.minX+r.maxX)/2.0, (r.minY+r.maxY)/2.0, (r.minZ+r.maxZ)/2.0',
  '  FROM elements_meta m JOIN elements_rtree r ON r.id = m.id',
  '  JOIN element_transforms t ON t.guid = m.guid',
  '  WHERE abs((r.minX+r.maxX)/2.0 - t.center_x) > ' + EPS,
  '     OR abs((r.minY+r.maxY)/2.0 - t.center_y) > ' + EPS,
  '     OR abs((r.minZ+r.maxZ)/2.0 - t.center_z) > ' + EPS + ';',
  'UPDATE element_transforms SET',
  '  center_x = (SELECT cx FROM _s11_fix f WHERE f.guid = element_transforms.guid),',
  '  center_y = (SELECT cy FROM _s11_fix f WHERE f.guid = element_transforms.guid),',
  '  center_z = (SELECT cz FROM _s11_fix f WHERE f.guid = element_transforms.guid)',
  ' WHERE guid IN (SELECT guid FROM _s11_fix);',
  'DROP TABLE _s11_fix;'
];

async function main() {
  const SQL = await initSqlJs({ wasmBinary: fs.readFileSync(path.join(OOTB, 'modeller', 'lib', 'sql-wasm.wasm')) });
  const openDb = f => new SQL.Database(fs.readFileSync(path.join(OOTB, 'buildings', f)));
  const me = openDb('LTU_AHouse_meta.db');
  const ex = openDb('LTU_AHouse_extracted.db');

  const q = (db, sql) => { const r = db.exec(sql); return r.length ? r[0].values : []; };

  // ── extracted-truth + modal offset (per-axis median), the independent reference ──
  const mt = new Map(q(me, 'SELECT guid, center_x, center_y, center_z FROM element_transforms')
    .map(v => [String(v[0]), v]));
  const et = new Map(q(ex, 'SELECT guid, center_x, center_y, center_z FROM element_transforms')
    .map(v => [String(v[0]).startsWith(PFX) ? String(v[0]).slice(PFX.length) : String(v[0]), v]));
  const med = a => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  const ds = { x: [], y: [], z: [] };
  mt.forEach((m, g) => { const e = et.get(g); if (!e) return;
    ds.x.push(m[1] - e[1]); ds.y.push(m[2] - e[2]); ds.z.push(m[3] - e[3]); });
  const M = { x: med(ds.x), y: med(ds.y), z: med(ds.z) };

  // ── the repair set the SQL will touch (transform vs its own r-tree box) ──
  const rt = new Map(q(me, 'SELECT m.guid, (r.minX+r.maxX)/2.0, (r.minY+r.maxY)/2.0, (r.minZ+r.maxZ)/2.0 ' +
    'FROM elements_meta m JOIN elements_rtree r ON r.id = m.id').map(v => [String(v[0]), v]));
  let touched = 0, maxDev = 0, agreeExt = 0, corrupt = 0, z0 = 0;
  mt.forEach((m, g) => {
    const r = rt.get(g), e = et.get(g);
    if (m[3] === 0) z0++;
    if (e && Math.max(Math.abs(m[1] - (e[1] + M.x)), Math.abs(m[2] - (e[2] + M.y)), Math.abs(m[3] - (e[3] + M.z))) > EPS) corrupt++;
    if (!r) return;
    const d = Math.max(Math.abs(r[1] - m[1]), Math.abs(r[2] - m[2]), Math.abs(r[3] - m[3]));
    if (d > EPS) { touched++; if (d > maxDev) maxDev = d; }
    if (e && Math.max(Math.abs(r[1] - (e[1] + M.x)), Math.abs(r[2] - (e[2] + M.y)), Math.abs(r[3] - (e[3] + M.z))) <= EPS) agreeExt++;
  });
  me.close(); ex.close();

  const header = [
    '-- §S11_META_TRANSFORM_REPAIR (2026-08-17, bim-compiler prompts/4D_GANTT_TM_REFACTOR.md §S11)',
    '-- LTU_AHouse_meta.db was produced with a per-element-corrupted rebase — the same defect class',
    '-- as Terminal_meta.db (§S10), 16x the rows. Against LTU_AHouse_extracted.db + the modal rigid',
    '-- offset (' + M.x.toFixed(6) + ', ' + M.y.toFixed(6) + ', ' + M.z.toFixed(6) + '), ' + corrupt + ' of ' + mt.size + ' rows deviate >' + EPS + 'm,',
    '-- and ' + z0 + ' sit at center_z EXACTLY 0 (0 do in extracted): half the top structural floor',
    '-- (VÅN 4, median z 0.00 here vs 13.73 in truth) lay on the ground plane, with 1,785 IfcMember /',
    '-- 558 IfcColumn / 439 IfcSlab / 49 IfcFooting among them. Geometry itself is identical on both',
    '-- sides (bbox sizes match on all ' + mt.size + ' rows, max diff 0.000; rotations 0 rows differ) — only',
    '-- the centres moved.',
    '--',
    '-- The repaired values come from meta.db\'s OWN elements_rtree, which was built before the',
    '-- corruption: its box centres agree with extracted+offset on ' + agreeExt + '/' + mt.size + ' rows, with',
    '-- element_transforms on far fewer. ' + touched + ' rows disagree with their r-tree box by >' + EPS + 'm',
    '-- (max ' + maxDev.toFixed(2) + 'm) and are the ones this patch snaps back. Rows already within EPS keep',
    '-- their exact values. Idempotent: after one apply the selection is empty, so a re-apply is a',
    '-- no-op. geo.db needs no patch — its base_geometries vertices are local-centred (measured',
    '-- 400/400), so a repaired transform carries mesh and bbox together.',
    '-- Generated by scripts/gen_ltu_meta_patch.js; verified by scripts/verify_ltu_meta_transform_repair.js.'
  ];
  const out = process.env.OUT || path.join(OOTB, 'buildings', 'patches', 'LTU_AHouse_meta.db.sql');
  fs.writeFileSync(out, header.concat(SQL_BODY).join('\n') + '\n');
  console.log('§S11_PATCH_GEN rows=' + touched + ' maxDev=' + maxDev.toFixed(2) + 'm corruptVsExtracted=' + corrupt +
    ' rtreeAgreesExtracted=' + agreeExt + '/' + mt.size + ' zExactZero=' + z0 +
    ' modal=(' + M.x.toFixed(6) + ',' + M.y.toFixed(6) + ',' + M.z.toFixed(6) + ') bytes=' + fs.statSync(out).size +
    ' written=' + out);
}
main().catch(e => { console.error(e); process.exit(2); });
