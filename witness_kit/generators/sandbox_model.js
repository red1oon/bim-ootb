// witness_kit/generators/sandbox_model.js — THE SANDBOX. A ~20-element synthetic building that
// reproduces every NAMED, MEASURED 4D defect, so the model can be tested without a 6,839-element
// building whose noise hides which rule broke.
//
// USER RULING 2026-08-26: "no more long winded building to building because all of them exhibit
// the same hell, thus a sandbox is representative."
//
// NOTHING HERE IS INVENTED FOR FLAVOUR. Every element exists to reproduce a defect that was
// measured on a real building and written down; the citation is on the row. The sandbox is a
// MINIMAL REPRODUCTION of recorded findings, not a guess at what a building looks like.
//
// Schema is exactly what schedule_author.js _buildScheduleElements reads:
//   elements_meta(guid, ifc_class, element_name, storey)
//   element_transforms(guid, center_x/y/z, bbox_x/y/z)
'use strict';

// [cls, name, storey, cx, cy, cz, bx, by, bz, why]
const ROWS = [
  // ── Level 1 structure — the ordinary spine every phase chain assumes exists.
  ['IfcFooting', 'Footing L1',   'L1',  0, 0, -0.50, 4.0, 4.0, 1.00, 'substructure root'],
  ['IfcColumn',  'Column L1',    'L1', -1.8, 0, 1.50, 0.4, 0.4, 3.00, 'superstructure'],
  ['IfcSlab',    'Slab L1',      'L1',  0, 0, 3.10, 4.0, 4.0, 0.20, 'superstructure'],

  // ── HELL A — WALL BEARS WALL, SAME CELL. 4D_BAR_MODEL.md §16: Duplex
  // 2O2Fr$t4X7Zf8NOew3FNhv, IfcWallStandardCase seq=5 elected an IfcSlab 2.99m ABOVE as its
  // support because the wall beneath it is also seq=5 and outside supportPool. Both walls are
  // (Architecture, L1) — ONE CELL — so no phase-level ordering can separate them. This is the
  // 10.2% / 28.9% / 69.3% intra-bar population measured in the review session's §S10.
  ['IfcWallStandardCase', 'Wall lower L1', 'L1', 0, -1.9, -0.50, 4.0, 0.2, 1.00, 'HELL A: bears the wall above, same cell'],
  ['IfcWallStandardCase', 'Wall upper L1', 'L1', 0, -1.9,  1.50, 4.0, 0.2, 3.00, 'HELL A: stands on the wall below, same cell'],

  // ── HELL B — STACKING. Every element in a cell inheriting the cell window starts at the same
  // instant. Review session §S14: kernel_ops max 12 -> 139, 315 elements in piles >= 20.
  // Four more walls in the SAME (Architecture, L1) cell make the pile visible at n=6.
  ['IfcWallStandardCase', 'Wall N L1', 'L1',  0,  1.9, 1.50, 4.0, 0.2, 3.00, 'HELL B: stacking'],
  ['IfcWallStandardCase', 'Wall E L1', 'L1',  1.9, 0,  1.50, 0.2, 4.0, 3.00, 'HELL B: stacking'],
  ['IfcWallStandardCase', 'Wall W L1', 'L1', -1.9, 0,  1.50, 0.2, 4.0, 3.00, 'HELL B: stacking'],
  ['IfcDoor',             'Door L1',   'L1',  0, -1.9, 1.05, 0.9, 0.2, 2.10, 'ARCH closeup vs envelope: straddles MEP (4D_BAR_MODEL §19)'],

  // ── HELL C — MEP UNDER ARCH. The original complaint: pipes hanging in air at DAY 0 HR 3.
  // A duct below the slab it hangs from, and a light fixture whose only contacts are above it
  // (4D_BAR_MODEL.md §14.2: HHS 00szGmqsL8Tv_ErgPOhgVh, 8 contacts ALL above, judged "ground").
  ['IfcFlowSegment',  'Duct L1',  'L1', 0, 0, 2.75, 3.0, 0.3, 0.30, 'HELL C: hangs from the slab above'],
  ['IfcFlowTerminal', 'Light L1', 'L1', 0.8, 0.8, 2.92, 0.6, 0.6, 0.06, 'HELL C: all contacts above (§14.2)'],
  ['IfcCovering',     'Floor fin L1', 'L1', 0, 0, 0.02, 4.0, 4.0, 0.02, 'finishes'],

  // ── Level 2 — the ladder needs a second level to be testable at all.
  ['IfcColumn',           'Column L2',    'L2', -1.8, 0, 4.80, 0.4, 0.4, 3.00, 'superstructure L2'],
  ['IfcSlab',             'Slab L2',      'L2',  0, 0, 6.30, 4.0, 4.0, 0.20, 'superstructure L2'],
  ['IfcWallStandardCase', 'Wall S L2',    'L2',  0, -1.9, 4.80, 4.0, 0.2, 3.00, 'ladder: must follow Wall * L1'],
  ['IfcFlowSegment',      'Duct L2',      'L2',  0, 0, 5.95, 3.0, 0.3, 0.30, 'ladder + HELL C on L2'],
  ['IfcCovering',         'Floor fin L2', 'L2',  0, 0, 3.22, 4.0, 4.0, 0.02, 'finishes L2'],

  // ── HOLE 1 — NO LEVEL. 4D_BAR_MODEL.md §12.4: HHS §ZONE_INDEX noStorey=2120 (30.8%);
  // Terminal carries 33,848 "Unknown". task = (phase x level) gives these no cell at all.
  ['IfcBuildingElementProxy', 'Unlevelled proxy', null, 1.5, 1.5, 2.00, 0.3, 0.3, 1.00, 'HOLE 1: no storey -> no address'],

  // ── HOLE 2 — SPANS LEVELS. A riser crossing both storeys belongs to no single level.
  // CONSTRUCTION_GRID_BOM_DUAL_MODEL.md §SHELL-N-ZSPAN measured these on Terminal: pipe risers
  // to 40m, columns 45m, walls 44m. A cell cannot contain one.
  ['IfcFlowSegment', 'Riser L1-L2', 'L1', 1.7, 1.7, 3.10, 0.2, 0.2, 6.40, 'HOLE 2: spans both levels'],

  // ── ORPHAN — touches nothing. HHS measured 36-39 of these; they are des=-1 forever (§14.2).
  ['IfcBuildingElementProxy', 'Orphan', 'L2', 3.6, 3.6, 5.00, 0.2, 0.2, 0.40, 'orphan: zero contacts (§14.2)']
];

// buildSandbox(SQL) -> sql.js Database, in memory. Deterministic guids so a failure names a row.
function buildSandbox(SQL) {
  const db = new SQL.Database();
  db.run('CREATE TABLE elements_meta (guid TEXT PRIMARY KEY, ifc_class TEXT, element_name TEXT, ' +
         'storey TEXT, discipline TEXT, material_name TEXT, material_rgba TEXT, building TEXT)');
  db.run('CREATE TABLE element_transforms (guid TEXT PRIMARY KEY, center_x REAL, center_y REAL, ' +
         'center_z REAL, bbox_x REAL, bbox_y REAL, bbox_z REAL)');
  const m = db.prepare('INSERT INTO elements_meta (guid,ifc_class,element_name,storey,building) VALUES (?,?,?,?,?)');
  const t = db.prepare('INSERT INTO element_transforms VALUES (?,?,?,?,?,?,?)');
  ROWS.forEach((r, i) => {
    const guid = 'SBX' + String(i).padStart(3, '0');
    m.run([guid, r[0], r[1], r[2], 'Sandbox']);
    t.run([guid, r[3], r[4], r[5], r[6], r[7], r[8]]);
  });
  m.free(); t.free();
  return db;
}

module.exports = { buildSandbox, ROWS };
