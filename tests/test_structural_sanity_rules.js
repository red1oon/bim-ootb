#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — prompts/STRUCTURAL_SANITY.md T2 witness (READ THE LOG after every run)
 * SCOPE: proves viewer/structural_sanity.js's StructuralSanity.evaluate() against (1) a synthetic
 * fixture built in a real in-memory sql.js DB (same schema, same SQL the production code runs —
 * not a hand-rolled dbQuery mock) covering the four cases the spec names by name, and (2) a
 * regression guard against real buildings/Hospital_meta.db matching STRUCTURAL_SANITY.md's own
 * VALIDATION section (floating-member count + roof-level concentration).
 * RUN: node tests/test_structural_sanity_rules.js
 */
'use strict';
const fs = require('fs'), path = require('path');
const initSqlJs = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'sql.js'));
const StructuralSanity = require('../viewer/structural_sanity.js');

let pass = 0, fail = 0;
const chk = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  ❌ ' + n + (x ? '  ' + x : '')); } };

const SCHEMA = `
CREATE TABLE elements_meta (guid TEXT, ifc_class TEXT, element_name TEXT, storey TEXT, discipline TEXT, material_name TEXT, material_rgba TEXT, building TEXT);
CREATE TABLE element_transforms (guid TEXT, center_x REAL, center_y REAL, center_z REAL, rotation_x REAL, rotation_y REAL, rotation_z REAL, bbox_x REAL, bbox_y REAL, bbox_z REAL);
`;

(async () => {
  console.log('§W-STRUCT-SANITY synthetic fixture');
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run(SCHEMA);

  function meta(guid, cls, name, storey) { return [guid, cls, name, storey, 'STR', '', '', 'Fixture']; }
  function xform(guid, cx, cy, cz, bx, by, bz) { return [guid, cx, cy, cz, 0, 0, 0, bx, by, bz]; }

  const metaRows = [
    meta('col-A', 'IfcColumn', 'C-A', 'L1'),
    meta('col-B', 'IfcColumn', 'C-B', 'L1'),
    meta('col-C', 'IfcColumn', 'C-C', 'L1'),
    meta('col-D', 'IfcColumn', 'C-D', 'L1'),
    meta('fnd-A', 'IfcFooting', 'F-A', 'L1'),
    meta('fnd-B', 'IfcFooting', 'F-B', 'L1'),
    meta('fnd-C', 'IfcFooting', 'F-C', 'L1'),
    meta('fnd-D', 'IfcFooting', 'F-D', 'L1'),
    meta('col-unsupported', 'IfcColumn', 'C-Unsupported', 'Roof'),
    meta('beam-clean', 'IfcBeam', 'UB-Clean', 'L1'),
    meta('beam-main', 'IfcBeam', 'UB-Main', 'L1'),
    meta('beam-framing', 'IfcBeam', 'UB-Framing', 'L1'),
    meta('beam-floating', 'IfcBeam', 'UB-Floating', 'Roof'),
    // §SLAB_BEARING (T9.3) non-vacuity pair. IfcSlab became a beam support because a beam whose
    // CENTRE lies inside a slab's z-range is embedded in the floor plate, not suspended. The
    // danger is that a whole-floor slab then "supports" everything. These two prove the z-bracket
    // still discriminates: same slab, same footprint, one beam in-plane and one hanging below it.
    meta('slab-floor', 'IfcSlab', 'Floor Slab 300mm', 'L2'),
    meta('beam-in-slab', 'IfcBeam', 'UB-InSlab', 'L2'),
    meta('beam-under-slab', 'IfcBeam', 'UB-HangingUnderSlab', 'L2'),
  ];
  const xformRows = [
    // Columns L1: z 0..3. Footings just below: z -1..0 (touch at z=0).
    xform('col-A', 0, 0, 1.5, 0.5, 0.5, 3),
    xform('col-B', 8, 0, 1.5, 0.5, 0.5, 3),
    xform('col-C', 16, 0, 1.5, 0.5, 0.5, 3),
    xform('col-D', 24, 0, 1.5, 0.5, 0.5, 3),
    xform('fnd-A', 0, 0, -0.5, 1, 1, 1),
    xform('fnd-B', 8, 0, -0.5, 1, 1, 1),
    xform('fnd-C', 16, 0, -0.5, 1, 1, 1),
    xform('fnd-D', 24, 0, -0.5, 1, 1, 1),
    // Isolated column, nothing below it within tolerance — must flag column_continuity.
    xform('col-unsupported', 100, 100, 4.5, 0.5, 0.5, 3),
    // Clean beam: span 8 (x0..x8) at z=3, depth 0.5 -> ratio 16 (< steel warning 24), both ends on columns.
    xform('beam-clean', 4, 0, 3, 8, 0.3, 0.5),
    // Main beam: span 8 (x16..x24) at z=3, both ends on columns C/D.
    xform('beam-main', 20, 0, 3, 8, 0.3, 0.5),
    // Framing beam: perpendicular, top end (y=0) touches beam-main's footprint at same level;
    // bottom end (y=-3) dangles free. supportedCount must be 1 (cantilever-classified, NOT floating).
    // span 3 / depth 0.5 = 6, well under cantilever warning (12) -> should not appear in output at all.
    xform('beam-framing', 20, -1.5, 3, 0.3, 3, 0.5),
    // Floating beam: isolated, no support at either end -> CRITICAL floating_member.
    xform('beam-floating', 200, 200, 20, 6, 0.3, 0.5),
  ];
  // A 40m x 20m slab at z 10.00..10.30 — a real whole-floor plate, the shape that made this
  // change look dangerous.
  xformRows.push(xform('slab-floor', 20, 10, 10.15, 40, 20, 0.3));
  // In-plane: centre z 10.15 sits INSIDE the slab's [10.00, 10.30]. Embedded -> supported.
  xformRows.push(xform('beam-in-slab', 20, 5, 10.15, 8, 0.2, 0.3));
  // Hanging 3 m below the same slab, same footprint. Centre z 7.15 is under slab.zmin -> the
  // z-bracket must reject it and the beam must still read CRITICAL floating.
  xformRows.push(xform('beam-under-slab', 20, 15, 7.15, 8, 0.2, 0.3));

  metaRows.forEach(r => db.run('INSERT INTO elements_meta VALUES (?,?,?,?,?,?,?,?)', r));
  xformRows.forEach(r => db.run('INSERT INTO element_transforms VALUES (?,?,?,?,?,?,?,?,?,?)', r));

  function dbQuery(sql, params) {
    const r = params ? db.exec(sql, params) : db.exec(sql);
    if (!r.length) return [];
    return r[0].values;
  }

  const rules = JSON.parse(fs.readFileSync(path.join(__dirname, '../viewer/rates/structural_rules.json'), 'utf8'));
  const logs = [];
  const rows = StructuralSanity.evaluate(dbQuery, rules, { log: (m) => logs.push(m) });
  logs.forEach(l => console.log('  ' + l));

  const byGuid = {};
  rows.forEach(r => { (byGuid[r.guid] = byGuid[r.guid] || []).push(r); });

  chk('floating beam flagged CRITICAL floating_member',
    (byGuid['beam-floating'] || []).some(r => r.rule === 'floating_member' && r.severity === 'CRITICAL'),
    JSON.stringify(byGuid['beam-floating']));

  chk('framing beam is NOT flagged floating (beam-to-beam support recognized)',
    !(byGuid['beam-framing'] || []).some(r => r.rule === 'floating_member'),
    JSON.stringify(byGuid['beam-framing']));
  chk('framing beam has no rows at all (ratio well under cantilever threshold)',
    !byGuid['beam-framing'], JSON.stringify(byGuid['beam-framing']));

  chk('clean beam (both ends columned, low ratio) has no rows',
    !byGuid['beam-clean'], JSON.stringify(byGuid['beam-clean']));

  chk('§SLAB_BEARING a beam embedded IN a slab is NOT floating (centre inside the slab z-range)',
    !(byGuid['beam-in-slab'] || []).some(r => r.rule === 'floating_member'),
    JSON.stringify(byGuid['beam-in-slab']));
  chk('§SLAB_BEARING a beam HANGING 3m BELOW the same slab IS still flagged CRITICAL — the rule did not go vacuous',
    (byGuid['beam-under-slab'] || []).some(r => r.rule === 'floating_member' && r.severity === 'CRITICAL'),
    JSON.stringify(byGuid['beam-under-slab']));

  chk('known-unsupported column flagged CRITICAL column_continuity',
    (byGuid['col-unsupported'] || []).some(r => r.rule === 'column_continuity' && r.severity === 'CRITICAL'),
    JSON.stringify(byGuid['col-unsupported']));

  chk('supported columns (A-D, real footings below) are NOT flagged',
    !['col-A', 'col-B', 'col-C', 'col-D'].some(g => byGuid[g]),
    JSON.stringify(['col-A', 'col-B', 'col-C', 'col-D'].map(g => byGuid[g])));

  // ── Real Hospital_meta.db regression guard, per STRUCTURAL_SANITY.md's own VALIDATION section ──
  const HOSPITAL_DB = path.join(__dirname, '../buildings/Hospital_meta.db');
  if (fs.existsSync(HOSPITAL_DB)) {
    console.log('§W-STRUCT-SANITY real Hospital_meta.db');
    const hdb = new SQL.Database(new Uint8Array(fs.readFileSync(HOSPITAL_DB)));
    function hq(sql, params) { const r = params ? hdb.exec(sql, params) : hdb.exec(sql); return r.length ? r[0].values : []; }
    const hlogs = [];
    const hrows = StructuralSanity.evaluate(hq, rules, { log: (m) => hlogs.push(m) });
    hlogs.forEach(l => console.log('  ' + l));

    const floatingRows = hrows.filter(r => r.rule === 'floating_member');

    // ⚠ THESE TWO GUARDS USED TO ASSERT count in [40,50] AND ">=50% at roof levels", and they
    // passed for the whole life of the feature — against a rule that was wrong. Both numbers came
    // from STRUCTURAL_SANITY.md's VALIDATION section, which was itself written from the output of
    // the same buggy code: the framing test compared beam BOTTOMS on a model framed to TOP of
    // steel (§FRAMING_TOP_OF_STEEL). A shallow beam framing into a deep one read as unsupported,
    // which is why the flags clustered at roof levels — that is where the depth changes are.
    // Measured after the fix: 43 -> 5. The roof clustering was the bug's fingerprint, not a
    // property of the building, so asserting it kept the bug alive.
    //
    // A count is not a property. What floating_member actually claims is "nothing holds this beam
    // up", so that is what these assert now — via the rule's own witness, which names what sits
    // at each rejected end.
    const LOAD_BEARING = ['IfcColumn', 'IfcWall', 'IfcWallStandardCase', 'IfcFooting', 'IfcMember', 'IfcBeam', 'IfcSlab', 'IfcPlate'];
    const hw = StructuralSanity.evaluate(hq, rules, { log: () => {}, witness: true }).filter(r => r.rule === 'floating_member');
    const withRealBearing = hw.filter(r => (r.witness.freeEnds || [])
      .some(e => e.nearest && LOAD_BEARING.indexOf(e.nearest.ifc_class) !== -1));
    // NOT asserted as "> 0". Hospital reaches ZERO after §FRAMING_TOP_OF_STEEL,
    // §SUPPORT_CLASS_PARITY and §SUPPORT_NOT_DISCIPLINE_FILTERED (43 -> 5 -> 0), and demanding a
    // non-zero count would be the same circular mistake as the [40,50] guard this replaced:
    // encoding yesterday's output as today's requirement. What must hold is that the rule can
    // still FAIL — the synthetic fixture above flags its deliberately unsupported beam CRITICAL,
    // and that check is the non-vacuity guard for this one.
    chk('Hospital floating members are a small minority of its 1970 beams (<2%)',
      floatingRows.length < 39, 'count=' + floatingRows.length +
      (floatingRows.length === 0 ? ' — every beam has real bearing once supports are not discipline-filtered' : ''));
    // The line between a DEFECT and a THRESHOLD. The witness deliberately searches wider than the
    // rule (4x tolerance_m) so a near-miss is visible as a near-miss. Load-bearing geometry INSIDE
    // the rule's own tolerance would be a logic defect — the rule looked and failed to see what it
    // was looking for. Outside it is a threshold judgement, which is an engineer's call and not
    // something a test may quietly settle by widening a number until it passes.
    const TOL = (rules.structural_rules.filter(r => r.name === 'floating_member')[0] || {}).tolerance_m;
    const insideTol = withRealBearing.filter(r => (r.witness.freeEnds || [])
      .some(e => e.nearest && LOAD_BEARING.indexOf(e.nearest.ifc_class) !== -1 &&
                 e.nearest.gapHorizM <= TOL && e.nearest.gapVertM <= TOL));
    chk('no Hospital floating member has load-bearing geometry INSIDE the rule\'s own ' + TOL + ' m tolerance',
      insideTol.length === 0,
      insideTol.length + '/' + hw.length + (insideTol.length ? ' — the rule looked and missed it: ' +
        JSON.stringify(insideTol.slice(0, 2).map(r => r.witness.freeEnds.map(e => e.nearest && (e.nearest.ifc_class + '@' + e.nearest.gapHorizM + 'm')))) : ''));
    // Reported, NOT asserted: near-misses outside tolerance. These are the open threshold question
    // (see STRUCTURAL_SANITY.md's THRESHOLD DISCLAIMER), and loosening tolerance_m to absorb them
    // would be fitting the rule to the data rather than fixing anything.
    const nearMiss = withRealBearing.length - insideTol.length;
    console.log('    ℹ ' + nearMiss + '/' + hw.length + ' flagged beams have load-bearing geometry OUTSIDE the ' + TOL +
      ' m tolerance — a threshold question, disclosed not asserted: ' +
      JSON.stringify(withRealBearing.slice(0, 3).map(r => r.witness.freeEnds.filter(e => e.nearest)
        .map(e => e.nearest.ifc_class + '@' + e.nearest.gapHorizM + 'm'))));
    const byStorey = {};
    floatingRows.forEach(r => { byStorey[r.storey] = (byStorey[r.storey] || 0) + 1; });
    console.log('    ℹ floating members by storey after the datum fix: ' + JSON.stringify(byStorey));

    const colRows = hrows.filter(r => r.rule === 'column_continuity');
    chk('Hospital column_continuity flags a non-trivial minority (not 0, not all)',
      colRows.length > 0 && colRows.length < 255, 'count=' + colRows.length);
  } else {
    console.log('§W-STRUCT-SANITY SKIP real-DB regression guard — buildings/Hospital_meta.db not present in this worktree');
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
