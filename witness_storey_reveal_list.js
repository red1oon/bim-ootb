#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — MEP_CLASH_REVEAL_MOVIE.md §60.1/§60.2 witness (READ THE LOG after every run)
 * SCOPE: proves ONE thing — that `A.storeyRevealList` (viewer/cpe_storey_reveal.js) offers the reveal
 * sequence only storeys the model ITSELF declares as `IfcBuildingStorey`, and that the guards around
 * that cross-check degrade instead of emptying the reveal. Nothing about colour, opacity, pacing or
 * tint brightness is asserted here — those are §60.3-§60.5, deliberately left to the user.
 *
 * Runs against a REAL in-memory sql.js DB through the same `A.dbQuery(sql, params)` contract
 * production code uses — no stubbed query layer, so the SQL in cpe_storey_reveal.js is really executed.
 *
 * EVERY CHECK NAMES THE ISSUE IT PROVES OR DISPROVES:
 *   S1 §60.1 ROOF-LEVEL-DROPPED  — HHS ships `elements_meta.storey='Roof Level'` (45 rooftop-MEP
 *      elements, 0 walls / 0 doors / 0 IfcSpace) while `spatial_structure` declares only Level 1/2/3.
 *      It took a full 1.01s reveal slot of a 4.03s window and tinted 0 meshes. Must be gone.
 *   S2 §60.1 REAL-STOREYS-KEPT   — disproves "the fix over-prunes": the 3 real storeys survive, in
 *      ascending mean-Z order.
 *   S3 §60.1 HOSPITAL-UNCHANGED  — disproves "this breaks the other real building": Hospital declares
 *      Level 1..7A as IfcBuildingStorey, so its list is identical before and after the fix.
 *   S4 §60.1 LEGACY-DB-DEGRADES  — a DB whose spatial_structure declares NO storey at all keeps the
 *      pre-fix list untouched (DEGRADE, DON'T DISABLE).
 *   S5 §60.1 NAME-DRIFT-REFUSED  — if the cross-check would empty the list (labels in the two tables
 *      disagree entirely) the filter is REFUSED and the full list is kept. A silent zero-storey reveal
 *      is never an acceptable outcome of a filter.
 *   S6 §60.1 DROP-IS-LOGGED      — the drop is named in §STOREY_REVEAL_LIST, never silent.
 *   S7 §60.1 LAST-STAYS-LIT-IS-REAL — with HHS's OWN real plan numbers (windowFrac 0.0309,
 *      beats.rise 0.9099, durationSec 130.47) the storey still lit at the window's last instant is a
 *      storey that actually has geometry to light ('Level 3'), not 'Roof Level'. This is the check
 *      that proves §STOREY_REVEAL_LAST_STAYS_LIT stopped being a no-op.
 *   S8 §60.2 WINDOW-SEC-HONEST   — `§STOREY_REVEAL_WINDOW` must report the REAL film seconds
 *      (windowFrac x durationSec), not only the shape seconds that read 2.7 while the film played
 *      4.03. HONEST LIMITATION: viewer/effects.js cannot be required in Node (browser globals), so
 *      this one is a SOURCE-LEVEL guard on that console.log, not a behavioural test. Stated plainly
 *      rather than dressed up as something stronger.
 * RUN: node witness_storey_reveal_list.js
 */
'use strict';
const fs = require('fs'), path = require('path');
const initSqlJs = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'sql.js'));
const setupCpeStoreyReveal = require('./viewer/cpe_storey_reveal.js');

let pass = 0, fail = 0;
const chk = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  ❌ ' + n + (x ? '  ' + x : '')); } };

const SCHEMA = `
CREATE TABLE elements_meta (guid TEXT, ifc_class TEXT, element_name TEXT, storey TEXT);
CREATE TABLE element_transforms (guid TEXT, center_x REAL, center_y REAL, center_z REAL, bbox_x REAL, bbox_y REAL, bbox_z REAL);
CREATE TABLE spatial_structure (guid TEXT, type TEXT, name TEXT, parent_guid TEXT);
`;

(async () => {
  const SQL = await initSqlJs();

  // Build a DB from (elements: [storey, z, ifc_class][], declared: [type, name][]).
  function makeDb(elements, declared) {
    const db = new SQL.Database();
    db.run(SCHEMA);
    elements.forEach((e, i) => {
      const guid = 'g' + i;
      db.run('INSERT INTO elements_meta VALUES (?,?,?,?)', [guid, e[2] || 'IfcWall', 'E' + i, e[0]]);
      db.run('INSERT INTO element_transforms VALUES (?,?,?,?,?,?,?)', [guid, 0, 0, e[1], 1, 1, 1]);
    });
    declared.forEach((d, i) => db.run('INSERT INTO spatial_structure VALUES (?,?,?,?)', ['s' + i, d[0], d[1], null]));
    return db;
  }
  function makeA(db, bld) {
    const A = {
      activeBuilding: bld, _metaGen: 0,
      dbQuery: (sql, params) => { const r = params ? db.exec(sql, params) : db.exec(sql); return r.length ? r[0].values : []; }
    };
    setupCpeStoreyReveal(A);
    return A;
  }
  function capture(fn) {
    const lines = [], _log = console.log;
    console.log = (m) => { if (typeof m === 'string') lines.push(m); _log(m); };
    let out; try { out = fn(); } finally { console.log = _log; }
    return { out, lines };
  }
  const names = (l) => l.map(s => s.name);

  // ── HHS, as the canonical ~/Downloads/HHS_Office_Federated_silent.db really is ──
  // spatial_structure: exactly 3 IfcBuildingStorey rows + 100 IfcSpace rows (2 stand in here).
  // elements_meta: the same 3 plus 'Roof Level' (rooftop MEP: IfcFlowSegment/IfcSlab, no walls,
  // no doors) and 'Unknown' (2,120 real elements at mean z 5.16 — must stay excluded by the
  // PRE-EXISTING string filter, which this fix does not touch).
  console.log('\n§W-STOREY-LIST 1/4 — HHS shape (spatial_structure: Level 1/2/3 only)');
  const hhs = makeDb([
    ['Level 1', 2.52, 'IfcWall'], ['Level 1', 2.5, 'IfcDoor'],
    ['Level 2', 6.08, 'IfcWall'],
    ['Level 3', 9.71, 'IfcWall'],
    ['Roof Level', 10.82, 'IfcFlowSegment'], ['Roof Level', 10.9, 'IfcSlab'],
    ['Unknown', 5.16, 'IfcWall'],
    ['Level 2 Ceiling', 6.5, 'IfcCovering'], ['Level 3 TOS', 9.9, 'IfcSlab']
  ], [['IfcBuildingStorey', 'Level 1'], ['IfcBuildingStorey', 'Level 2'], ['IfcBuildingStorey', 'Level 3'],
      ['IfcSpace', 'R9'], ['IfcSpace', 'R10']]);
  const Ah = makeA(hhs, 'HHS');
  const capH = capture(() => Ah.storeyRevealList());
  const listH = names(capH.out);
  chk('S1 §60.1 ROOF-LEVEL-DROPPED — "Roof Level" is not an IfcBuildingStorey, so it is not a reveal slot',
      listH.indexOf('Roof Level') === -1 && listH.length === 3, JSON.stringify(listH));
  chk('S2 §60.1 REAL-STOREYS-KEPT — the 3 declared storeys survive, ascending mean Z (no over-prune)',
      JSON.stringify(listH) === JSON.stringify(['Level 1', 'Level 2', 'Level 3']), JSON.stringify(listH));
  chk('S2b §60.1 PRE-EXISTING FILTERS INTACT — Unknown / " Ceiling" / " TOS" still excluded',
      ['Unknown', 'Level 2 Ceiling', 'Level 3 TOS'].every(n => listH.indexOf(n) === -1), JSON.stringify(listH));
  chk('S6 §60.1 DROP-IS-LOGGED — §STOREY_REVEAL_LIST names what it dropped and why (never silent)',
      capH.lines.some(l => l.indexOf('§STOREY_REVEAL_LIST') === 0 && /dropped=\[[^\]]*Roof Level/.test(l)),
      capH.lines.filter(l => l.indexOf('§STOREY_REVEAL_LIST') === 0).join(' | '));

  // S7 — HHS's OWN real plan values, read off out/HHS_lingerfit2_854x480.log:
  //   §STOREY_REVEAL_WINDOW windowFrac=0.0309 orbitStartFrac(rise)=0.9099 ; film durationSec=130.47
  // Pre-fix the final instant of the window belonged to 'Roof Level' (meshesTouched=0 in that bake),
  // which made §STOREY_REVEAL_LAST_STAYS_LIT keep a storey lit that lights nothing.
  const planH = { beats: { rise: 0.9099 }, storeyReveal: { on: true, windowFrac: 0.0309 }, durationSec: 130.47 };
  const lastVis = capture(() => Ah.storeyRevealVisualAt(planH, 0.9099 - 1e-6)).out;
  chk('S7 §60.1 LAST-STAYS-LIT-IS-REAL — the storey lit at the window\'s last instant has geometry ("Level 3"), not "Roof Level"',
      !!lastVis && lastVis.storey === 'Level 3' && lastVis.n === 3 && lastVis.dark === false,
      lastVis ? `storey=${lastVis.storey} n=${lastVis.n} dark=${lastVis.dark}` : 'null');
  const slotSec = (0.0309 * 130.47) / (lastVis ? lastVis.n : 1);
  chk('S7b §60.1 DWELL RECOVERED — HHS\'s real 4.03s window now gives ~1.34s/storey, not 1.01s',
      slotSec > 1.3 && slotSec < 1.4, 'slotSec=' + slotSec.toFixed(2) + 's');

  // ── Hospital, as ~/Downloads/Hospital_silent.db really is: Level 1..7A ARE declared ──
  console.log('\n§W-STOREY-LIST 2/4 — Hospital shape (spatial_structure declares Level 1..7A)');
  const hospElems = [['Level 1', 1], ['Level 2', 5], ['Level 3', 9], ['Level 4', 13],
                     ['Level 5', 17], ['Level 6', 21], ['Level 7', 25], ['Level 7A', 29],
                     ['Unknown', 11], ['Level 2 Ceiling', 6], ['Level 3 TOS', 10]]
                    .map(e => [e[0], e[1], 'IfcWall']);
  const hospDecl = ['Level 1', 'Level 2', 'Level 3', 'Level 4', 'Level 5', 'Level 6', 'Level 7', 'Level 7A',
                    'Level 2 Ceiling', 'Level 3 TOS'].map(n => ['IfcBuildingStorey', n]);
  const Ahosp = makeA(makeDb(hospElems, hospDecl), 'Hospital');
  const listHosp = names(capture(() => Ahosp.storeyRevealList()).out);
  chk('S3 §60.1 HOSPITAL-UNCHANGED — all 8 real levels survive; the fix costs the other real building nothing',
      JSON.stringify(listHosp) === JSON.stringify(['Level 1', 'Level 2', 'Level 3', 'Level 4', 'Level 5', 'Level 6', 'Level 7', 'Level 7A']),
      JSON.stringify(listHosp));

  // ── Legacy export: spatial_structure exists but declares no storey at all ──
  console.log('\n§W-STOREY-LIST 3/4 — legacy DB (no IfcBuildingStorey rows anywhere)');
  const Aleg = makeA(makeDb([['Level 1', 1, 'IfcWall'], ['Roof Level', 9, 'IfcSlab']],
                            [['IfcSpace', 'R1']]), 'Legacy');
  const capL = capture(() => Aleg.storeyRevealList());
  chk('S4 §60.1 LEGACY-DB-DEGRADES — no declared storey ⇒ pre-fix list kept untouched, reveal never emptied',
      JSON.stringify(names(capL.out)) === JSON.stringify(['Level 1', 'Roof Level']), JSON.stringify(names(capL.out)));
  chk('S4b §60.1 DEGRADE IS LOGGED — the absent cross-check is stated, not assumed',
      capL.lines.some(l => l.indexOf('§STOREY_REVEAL_LIST') === 0 && /no cross-check/.test(l)),
      capL.lines.filter(l => l.indexOf('§STOREY_REVEAL_LIST') === 0).join(' | '));

  // ── Name drift: storeys ARE declared, but under names no element carries ──
  console.log('\n§W-STOREY-LIST 4/4 — name drift (declared names match no element label)');
  const Adrift = makeA(makeDb([['Level 1', 1, 'IfcWall'], ['Level 2', 5, 'IfcWall']],
                              [['IfcBuildingStorey', 'STOREY_01'], ['IfcBuildingStorey', 'STOREY_02']]), 'Drift');
  const capD = capture(() => Adrift.storeyRevealList());
  chk('S5 §60.1 NAME-DRIFT-REFUSED — a cross-check that would empty the reveal is refused, full list kept',
      JSON.stringify(names(capD.out)) === JSON.stringify(['Level 1', 'Level 2']), JSON.stringify(names(capD.out)));
  chk('S5b §60.1 REFUSAL IS LOGGED — the refusal says why, so a real drift is visible in the log',
      capD.lines.some(l => /CROSS-CHECK REFUSED/.test(l)),
      capD.lines.filter(l => l.indexOf('§STOREY_REVEAL_LIST') === 0).join(' | '));

  // ── §60.2 — source-level guard (see the HONEST LIMITATION note in this file's header) ──
  console.log('\n§W-STOREY-LIST §60.2 — §STOREY_REVEAL_WINDOW honesty (source-level guard)');
  const eff = fs.readFileSync(path.join(__dirname, 'viewer', 'effects.js'), 'utf8');
  const winLog = eff.slice(eff.indexOf("'§STOREY_REVEAL_WINDOW"), eff.indexOf("'§STOREY_REVEAL_WINDOW") + 900);
  chk('S8 §60.2 WINDOW-SEC-HONEST — the line reports realWindowSec (windowFrac x durationSec), not only shape seconds',
      /realWindowSec=/.test(winLog) && /_storeyRevealWindowFrac \* durationSec/.test(eff),
      /realWindowSec=/.test(winLog) ? 'present' : 'ABSENT — the 2.7s-vs-4.03s disagreement is back');

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
