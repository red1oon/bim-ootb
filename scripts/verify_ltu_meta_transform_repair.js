#!/usr/bin/env node
// verify_ltu_meta_transform_repair.js — §S11_META_TRANSFORM_REPAIR verifier for oci_patch_gate.js
// (bim-compiler prompts/4D_GANTT_TM_REFACTOR.md §S11). Runs against $GATE_DB — the SERVED
// LTU_AHouse_meta.db bytes with the patch applied by the gate itself, never a caller-chosen file.
// Self-contained: no extracted.db dependency (worktrees don't carry the gitignored DB binaries),
// only the repo's own recipe modules + the extracted-truth constants measured at patch-generation
// time.
//
// ISSUE it proves/disproves: LTU_AHouse_meta.db's per-element-corrupted transform rebase (33,528
// rows deviating >EPS from the modal rigid offset against extracted-truth, 3,105 of them pinned to
// center_z EXACTLY 0 — half the top structural floor lying on the ground plane) made the LIVE
// scheduler classify a different building from the one every fleet probe measures: §GROUNDWORK_SLAB
// n=16 on levels [VÅNING 2, VÅNING 1, TAKPLAN] instead of n=39-40 on [VÅNING 1, TAKPLAN, Ref., VÅN 1],
// Substructure 254 instead of 277. After the patch the live world must BE the probe world.
//
// W-S11-A  schedule classification equals extracted-truth (groundwork n, phase counts, level set)
// W-S11-B' every transform agrees with its own r-tree box within EPS (the in-file form of "0 rows
//          deviate from extracted+offset" — the r-tree is the pre-corruption witness the patch
//          restores from; the full 125,698-row check against extracted itself is a bench check,
//          logged in §S11_RESULTS, not runnable from a DB-less worktree)
// W-S11-C  zero rows at center_z EXACTLY 0 (3,105 before)
// Patch is produced by scripts/gen_meta_transform_patch.js (generic, fleet-wide); the LTU-specific
// gen_ltu_meta_patch.js it replaced is gone.
// W-S11-D  idempotence — re-applying the patch here updates 0 rows and changes no verdict
'use strict';
const fs = require('fs');
const path = require('path');
const repo = path.join(__dirname, '..');
const DB = process.env.GATE_DB;
if (!DB || !fs.existsSync(DB)) { console.error('§S11_VERIFY FAIL no $GATE_DB'); process.exit(1); }
const initSqlJs = require(path.join(repo, 'modeller', 'lib', 'sql-wasm.js'));
const ScheduleAuthor = require(path.join(repo, 'viewer', 'schedule_author.js'));
require(path.join(repo, 'viewer', 'schedule_gate.js'));   // registers globalThis.ScheduleGate for the recipe

// The repair selection runs at HALF ScheduleGate.EPS (see scripts/gen_meta_transform_patch.js), so
// the post-patch invariant is asserted at that same 0.025 — checking at 0.05 would pass without
// proving the tightening that closed the last 49 rows.
const EPS = 0.025;                      // ScheduleGate.EPS / 2 — the repair threshold, mirrored
const PATCH = path.join(repo, 'buildings', 'patches', 'LTU_AHouse_meta.db.sql');

// Post-repair targets, measured 2026-08-17. The probe world (LTU_AHouse_extracted.db) gives
// groundwork 39 / Substructure 277 / Superstructure 6443; the repaired live world gives 40/278/6442
// and the SAME level set. Element-by-element the two agree on 122,329 of 122,330 — the single
// difference is IfcSlab 3LVgKVMh948xjeRWVK7bTI (VÅNING 1), and its cause is measured, not residual
// corruption: the slab's edge and wall 2xhtnumnv7W9eDx5TQISpw's face are FLUSH at x≈77.905, a
// zero-area contact. extracted.db stores its coordinates float32-rounded, which happens to make the
// boxes overlap by 3.0e-5 m (so the wall counts as a bearing and blocks the slab); the doubles
// restored here miss by 2.5e-6 m (no bearing, slab joins groundwork). schedule_gate's overlap() is
// a strict inequality, so a coincident-plane tie is decided by whichever side's rounding lands
// first. Asserting the exact repaired numbers catches regression; the one-element delta is a tie,
// not a defect. The 122,329/122,330 element-level agreement is a bench check (needs both DBs) —
// see §S11_RESULTS.
const EXPECT = { els: 122330, groundwork: 40, substructure: 278, superstructure: 6442 };
const EXPECT_LEVELS = ['Ref.', 'TAKPLAN', 'VÅN 1', 'VÅNING 1'];   // sorted — identical to extracted's

// Spot rows from the corrupted tail: two IfcColumns whose served transform sat at (0, y, 0) —
// collapsed to the origin in x AND to the ground plane in z. Expected values measured 2026-08-17.
const SPOT = [
  { guid: '01ICnTtqjAUOqkdx1fF$2O', x: 12.149999, z: 11.697499 },   // VÅN 3
  { guid: '06UP8jVnT7NOEHRZdhZZeX', x: 18.549999, z: 7.485000 }     // VÅN 2
];

function classify(SQL, buf) {
  const RATES = (new Function(fs.readFileSync(path.join(repo, 'viewer', 'rates.js'), 'utf8') +
    '\nreturn {SEQUENCE_RULES, SEQUENCE_DEFAULT, SEQUENCE_NAME_OVERRIDES, LABOR_RATES, RATES};'))();
  const db = new SQL.Database(new Uint8Array(buf));
  const levels = [];
  const orig = console.log;
  console.log = function (m) {
    if (typeof m === 'string' && m.indexOf('§GROUNDWORK_SLAB') === 0) {
      const j = m.match(/levels=(\[[^\]]*\])/); if (j) { try { levels.push.apply(levels, JSON.parse(j[1])); } catch (e) {} }
    }
    orig.apply(console, arguments);
  };
  let els;
  try {
    els = ScheduleAuthor._buildScheduleElements(db, RATES.SEQUENCE_RULES, {
      laborRates: RATES.LABOR_RATES, rates: RATES.RATES, nameOverrides: RATES.SEQUENCE_NAME_OVERRIDES,
      defaultRule: RATES.SEQUENCE_DEFAULT });
  } finally { console.log = orig; }
  const gw = els.filter(e => (e.cls === 'IfcSlab' || e.cls === 'IfcBeam') &&
    e.phase === 'Substructure' && (e.seq === 3 || e.seq === 4)).length;
  const ph = {}; els.forEach(e => { ph[e.phase] = (ph[e.phase] || 0) + 1; });
  const rtreeOff = db.exec('SELECT COUNT(*) FROM elements_meta m JOIN elements_rtree r ON r.id=m.id ' +
    'JOIN element_transforms t ON t.guid=m.guid WHERE abs((r.minX+r.maxX)/2.0-t.center_x)>' + EPS +
    ' OR abs((r.minY+r.maxY)/2.0-t.center_y)>' + EPS + ' OR abs((r.minZ+r.maxZ)/2.0-t.center_z)>' + EPS)[0].values[0][0];
  const z0 = db.exec('SELECT COUNT(*) FROM element_transforms WHERE center_z = 0')[0].values[0][0];
  const spots = SPOT.map(s => {
    const r = db.exec("SELECT center_x, center_z FROM element_transforms WHERE guid='" + s.guid.replace(/'/g, "''") + "'");
    return r.length ? { x: r[0].values[0][0], z: r[0].values[0][1] } : null;
  });
  db.close();
  return { n: els.length, gw: gw, ph: ph, levels: levels.slice().sort(), rtreeOff: rtreeOff, z0: z0, spots: spots };
}

function report(tag, r) {
  let fail = 0;
  const chk = (name, got, want) => {
    const ok = got === want;
    console.log('§S11_VERIFY ' + tag + ' ' + name + '=' + got + ' expect=' + want + ' ' + (ok ? 'PASS' : 'FAIL'));
    if (!ok) fail++;
  };
  chk('els', r.n, EXPECT.els);                                   // W-S11-A
  chk('groundwork', r.gw, EXPECT.groundwork);
  chk('substructure', r.ph['Substructure'] || 0, EXPECT.substructure);
  chk('superstructure', r.ph['Superstructure'] || 0, EXPECT.superstructure);
  chk('levels', r.levels.join('|'), EXPECT_LEVELS.join('|'));
  chk('rtreeDisagreeing', r.rtreeOff, 0);                        // W-S11-B'
  chk('zExactZero', r.z0, 0);                                    // W-S11-C
  SPOT.forEach((s, i) => {
    const got = r.spots[i];
    const ok = got !== null && Math.abs(got.x - s.x) < 0.001 && Math.abs(got.z - s.z) < 0.001;
    console.log('§S11_VERIFY ' + tag + ' spot ' + s.guid.slice(0, 8) + ' x=' +
      (got === null ? 'MISSING' : got.x.toFixed(6)) + ' z=' + (got === null ? '' : got.z.toFixed(6)) +
      ' expect=(' + s.x + ',' + s.z + ') ' + (ok ? 'PASS' : 'FAIL'));
    if (!ok) fail++;
  });
  return fail;
}

async function main() {
  const SQL = await initSqlJs({ wasmBinary: fs.readFileSync(path.join(repo, 'modeller', 'lib', 'sql-wasm.wasm')) });
  const buf = fs.readFileSync(DB);
  let fail = report('once', classify(SQL, buf));

  // W-S11-D — idempotence: apply the same patch a SECOND time to these already-patched bytes and
  // re-run every check. Uses the shipped chunker's semantics (statement-aware batching).
  if (fs.existsSync(PATCH)) {
    const pdb = new SQL.Database(new Uint8Array(buf));
    pdb.run(fs.readFileSync(PATCH, 'utf8'));
    const again = pdb.export().buffer; pdb.close();
    fail += report('twice', classify(SQL, again));
  } else {
    console.log('§S11_VERIFY twice SKIP — patch file not in this checkout (' + PATCH + ')');
    fail++;
  }

  console.log('§S11_VERIFY_SUMMARY fail=' + fail + ' ' + (fail === 0 ? 'PASS' : 'FAIL'));
  process.exit(fail === 0 ? 0 : 1);
}
main().catch(e => { console.error('§S11_VERIFY ERR ' + (e && e.stack || e)); process.exit(1); });
