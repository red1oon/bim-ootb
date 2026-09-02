#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-E2E-STR-REWALK-COMMIT: regression guard for the STR grid-rewalk TOCTOU race fix
 * (§STRWALK_RACE_FIX — SCALE_CHECK_TERMINAL_FINDINGS_2026-07-05.md Finding 3, shipped ce61f2f / PR #665).
 * Scope: prove, at SMALL synthetic scale, that a real gridline drag over a column-framed building commits its
 * whole STR re-walk cascade as ONE signed gesture group — never as N racing individual commits (the old bug:
 * N unawaited oplog.commit() calls all snapshotting kernel_ops' optimistic nextId=MAX(id)+1 → 27/30 lost to
 * "UNIQUE constraint failed: kernel_ops.id" §KRN_GROUP ROLLBACKs). Until this file existed the only evidence
 * was one manual Terminal-scale (35k-element) log read — nothing durable. READ THE LOG AFTER EVERY RUN.
 *
 * ISSUE EACH CLAIM PROVES (TestArchitecture: a test that passes without revealing the issue is not a test):
 *   K1 SETUP-STRWALK   — the minimal REAL fixture shape swbInit's classifier accepts (elements_meta rows with
 *                        discipline='STR' AND ifc_class='IfcColumn' joined to element_transforms — the exact
 *                        _readColumns query, str_walker_bridge.js:22) walks column-framed: 4 columns → 2×2 grid,
 *                        4 girders. This is the STR path witness_e2e_gridstretch's wall-only fixture never hits.
 *   K2 GRID-MODE       — the Move-Grid pill arms gridline-drag mode (real toolbar, real user path).
 *   K3 REWALK-REAL     — the drag actually reached swbOnGridMove and produced REAL rewalk ops (>0), not a no-op.
 *   K4 RACE-FIX-LINE   — §STRWALK_RACE_FIX fired with ops==committed (the fix's own runtime tripwire).
 *   K5 ONE-GROUP       — ALL STR rewalk rows share ONE 'gesture-grp-*' gid and exactly ONE '§KRN_GROUP committed'
 *                        line covers the whole batch → still one signed group, not N commits (the fix itself).
 *   K6 ZERO-ROLLBACK   — zero '§KRN_GROUP ROLLBACK' lines. THE regression tripwire: if the race is ever
 *                        reintroduced, concurrent commits collide on kernel_ops.id and THIS is what appears.
 *   K7 GEOMETRY        — hand-computed rewalk maths off the committed rows + walker state: the 2 columns on the
 *                        dragged line (x=6) re-anchor to x=6+δ exactly; the 2 girders spanning 0→6 re-span to
 *                        6+δ exactly; girder spans afterwards are exactly {3, 3, 6+δ, 6+δ}. δ = the committed
 *                        GEOM_GRID_MOVE's own delta (drag-derived, read back — never a guessed constant).
 *   K8 CHAIN-OK        — verifyChain passes and the GEOM op-log grew by exactly 1 (the GEOM_GRID_MOVE); the
 *                        rewalk batch is non-GEOM (STR_*) so it must not disturb the geometry fold/cursor.
 *
 * Fixture maths (hand-derived): columns at (0,0) (6,0) (0,3) (6,3) → swDeriveGrid xLines=[0,6] yLines=[0,3]
 * (each line = mean of its members; gaps 6m,3m ≫ 0.5m tol). swWalkGirders → 4 girders: two X-line girders
 * (x=0, x=6) span 3; two Y-line girders (y=0, y=3) span 6. Drag gridline B (x=6) by ≈+1.5m: swReWalk re-anchors
 * the two x=6 columns (+δ), re-spans the two 6m girders to 6+δ (STEEL max 18m ⇒ GREEN→GREEN, 0 exceptions ⇒
 * deterministic op count), and TRANSLATES the x=6 X-line girder (runsAlong ⇒ no op). Batch = 2 STR_REANCHOR +
 * 2 STR_RESPAN + 1 STR_WALK_EDIT (the outliner's replay record, folded into the SAME gesture) = 5 ops.
 */
'use strict';
const { runE2E } = require('./e2e_harness');

runE2E('W-E2E-STR-REWALK-COMMIT', async (t) => {
  // Boot on a real resident open (injects the __e2e helpers exactly like witness_e2e_gridstretch), then wait
  // for the open sequence to fully finish (the ARC seed is async) so a late seed can't pollute our cleared log.
  await t.open('Duplex');
  for (let i = 0; i < 30 && !t.slog.some(l => /§ARC-SEED-WIRE Duplex/.test(l)); i++) await t.sleep(500);
  await t.shot('01-open');

  // K1 SETUP: clear via #b-clear (drops scene + oplog + walker ready-state, the proven gridstretch idiom), then
  // open a SMALL synthetic column-framed building through the walker's own open chokepoint (_openBuffer — the
  // same function every real Open path funnels into: resident fetch, local .db, .ifc). The fixture shape is the
  // EXACT row shape str_walker_bridge.js _readColumns SELECTs — not guessed. Then define the matching authoring
  // grid and author a wall spanning A→B so the grid drag also recomposes real ARC geometry (production shape).
  await t.clickSel('#b-clear'); await t.sleep(500);
  const setup = await t.pg.evaluate(async () => {
    const db = new window.SQL.Database();
    db.run('CREATE TABLE elements_meta (guid TEXT PRIMARY KEY, ifc_class TEXT, discipline TEXT)');
    db.run('CREATE TABLE element_transforms (guid TEXT PRIMARY KEY, center_x REAL, center_y REAL, center_z REAL, bbox_x REAL, bbox_y REAL, bbox_z REAL)');
    // 4 IfcColumns on a 2×2 layout: gridlines A(x=0), B(x=6) × 1(y=0), 2(y=3). bbox 0.4×0.4×3 (typical column).
    const cols = [['COL-A1', 0, 0], ['COL-B1', 6, 0], ['COL-A2', 0, 3], ['COL-B2', 6, 3]];
    for (const [g, x, y] of cols) {
      db.run('INSERT INTO elements_meta VALUES (?,?,?)', [g, 'IfcColumn', 'STR']);
      db.run('INSERT INTO element_transforms VALUES (?,?,?,?,?,?,?)', [g, x, y, 1.5, 0.4, 0.4, 3]);
    }
    const bytes = db.export(); db.close();
    const ok = window.STRWalkerOutliner._openBuffer(bytes.buffer, 'SynthSTR');   // → swbInit → ready=true
    window.Bonsai.grid.define({ xs: [0, 6], ys: [0, 3], xlabels: ['A', 'B'], ylabels: ['1', '2'] });
    const O = window.Bonsai.oplog;
    const wall = await O.commit({ op_type: 'GEOM_EXTRUDE_POLY', parameters: { profile: { points: [[0, 0], [6, 0], [6, 0.2], [0, 0.2]] }, depth: 3 } }, { color: 0x9fb4c8 });
    if (typeof syncHistory === 'function') syncHistory();
    const td = window.swbTabData();
    return { ok, wallId: wall.id, tab: td ? { columns: td.columns, girders: td.girders, grid: td.grid, system: td.system } : null };
  });
  const initLine = t.slog.find(l => /§STRWALK-INIT column-framed/.test(l) && /SynthSTR|columns=4/.test(l)) ||
                   t.slog.find(l => /§STRWALK-INIT column-framed: columns=4/.test(l));
  t.assert('K1 SETUP-STRWALK (4 real IfcColumn/STR rows walk column-framed: 2×2 grid, 4 girders — the classifier accepted the minimal fixture)',
    setup.ok && setup.tab && setup.tab.system === 'column-framed' && setup.tab.columns === 4 && setup.tab.girders === 4 && setup.tab.grid === '2×2' && !!initLine,
    'open=' + setup.ok + ' tab=' + JSON.stringify(setup.tab) + ' init="' + (initLine || 'MISSING') + '"');
  await t.clickSel('#b-fit'); await t.sleep(500);
  await t.shot('02-setup');

  // K2: arm grid-move via the real pill (shows the grid, gridlines become grabbable on the ground plane).
  await t.clickSel('#b-gridmove'); await t.sleep(400);
  const gridActive = await t.pg.evaluate(() => !!window.Bonsai.grid.active);
  t.assert('K2 GRID-MODE (Move-Grid pill armed, authoring grid active)', gridActive === true, 'grid.active=' + gridActive);
  await t.shot('03-gridmode');

  // Real pointer drag of gridline B (x=6) outward by ≈+1.5m along the ground — the same interaction pattern
  // (and the same proven mid-bay grab point geometry) as witness_e2e_gridstretch's X3.
  const DX = 1.5;
  const down = await t.proj(6, 1.5, 0);
  const up = await t.proj(6 + DX, 1.5, 0);
  const before = await t.oplog();
  const rollbacksBefore = t.slog.filter(l => /§KRN_GROUP ROLLBACK/.test(l)).length;
  await t.drag(down, up, 12);
  await t.sleep(900);
  // the rewalk gesture is awaited inside the wrapped GM.commit, but give the async fold slack anyway
  for (let i = 0; i < 16 && !t.slog.some(l => /§STRWALK_RACE_FIX/.test(l)); i++) await t.sleep(500);
  const after = await t.oplog(); const last = await t.lastOp(); const chain = await t.verifyChain();
  await t.shot('04-rewalked');

  // Read back the committed substrate: δ from the GEOM_GRID_MOVE row itself, plus every STR rewalk row + gid.
  const delta = last && last.op_type === 'GEOM_GRID_MOVE' ? last.parameters.delta : null;
  const strRows = await t.pg.evaluate(() => {
    const r = window.Bonsai.oplog.db.exec(
      "SELECT op_type, parameters, gid FROM kernel_ops WHERE op_type IN ('STR_REANCHOR','STR_RESPAN','STR_SIGNAL','STR_WALK_EDIT') ORDER BY id");
    return r.length ? r[0].values.map(v => ({ op: v[0], p: JSON.parse(v[1]), gid: v[2] })) : [];
  });
  const spansAfter = await t.pg.evaluate(() => {
    const d = window.swbTabData(); return d ? d.elements.map(e => e.span).sort((a, b) => a - b) : null;
  });

  // K3: the rewalk really ran and produced real ops (the path no prior E2E fixture ever exercised).
  const rewalkLine = t.slog.find(l => /§STRWALK-REWALK Δ=/.test(l));
  const rewalkN = rewalkLine ? parseInt((rewalkLine.match(/→ (\d+) STR ops/) || [])[1], 10) : 0;
  t.assert('K3 REWALK-REAL (swbOnGridMove produced >0 real STR rewalk ops off the dragged gridline)',
    !!rewalkLine && rewalkN > 0, 'line="' + (rewalkLine || 'MISSING') + '"');

  // K4: the fix's runtime tripwire fired, and everything it collected was committed (nothing dropped).
  const rf = t.slog.map(l => l.match(/§STRWALK_RACE_FIX ops=(\d+) .*gid=(\S+) committed=(\d+)/)).find(Boolean);
  t.assert('K4 RACE-FIX-LINE (§STRWALK_RACE_FIX fired; collected ops == committed ops — zero silently dropped rows)',
    !!rf && rf[1] === rf[3] && parseInt(rf[1], 10) === rewalkN + 1,   // +1 = the STR_WALK_EDIT replay record in the same gesture
    rf ? ('ops=' + rf[1] + ' committed=' + rf[3] + ' gid=' + rf[2]) : 'LINE MISSING');
  const gid = rf ? rf[2] : null;

  // K5: ONE signed group. DB truth: every STR row carries the SAME gesture-grp gid; log truth: exactly one
  // §KRN_GROUP committed line for that gid, covering the whole batch. N individual commits would mint N gids.
  const gids = Array.from(new Set(strRows.map(r => r.gid)));
  const committedLines = gid ? t.slog.filter(l => l.includes('§KRN_GROUP committed gid=' + gid + ' ')) : [];
  const batchOk = committedLines.length === 1 && committedLines[0].includes(' ops=' + strRows.length + ' ');
  t.assert('K5 ONE-GROUP (all ' + strRows.length + ' STR rewalk rows share ONE gesture-grp gid; exactly ONE §KRN_GROUP committed covers the batch)',
    strRows.length === 5 && gids.length === 1 && gids[0] === gid && /^gesture-grp-/.test(String(gid)) && batchOk,
    'rows=' + strRows.length + ' gids=' + JSON.stringify(gids) + ' committedLines=' + committedLines.length + ' "' + (committedLines[0] || '') + '"');

  // K6: THE regression assertion. A reintroduced unbatched-commit race collides on kernel_ops.id and rolls
  // back (all-or-none) — §KRN_GROUP ROLLBACK is its exact, observed signature (27/30 at Terminal scale).
  const rollbacks = t.slog.filter(l => /§KRN_GROUP ROLLBACK/.test(l));
  t.assert('K6 ZERO-ROLLBACK (no §KRN_GROUP ROLLBACK anywhere — the id-collision race signature is absent)',
    rollbacks.length === 0 && rollbacksBefore === 0, rollbacks.length ? rollbacks.join(' | ') : 'rollbacks=0');

  // K7: hand-computed rewalk geometry off the committed rows + the walker's folded state. Invariants (exact
  // arithmetic, tolerance 1e-9 — δ is THE one drag-derived number, read from the committed GEOM_GRID_MOVE):
  //   • the two columns walked onto x=6 (COL-B1@y0, COL-B2@y3) re-anchor from [6,y] to [6+δ,y], y preserved;
  //   • the two 6m Y-line girders re-span 6 → 6+δ; nothing else re-spans;
  //   • the walker's girder spans afterwards are exactly {3, 3, 6+δ, 6+δ}.
  const EPS = 1e-9;
  const re = strRows.filter(r => r.op === 'STR_REANCHOR');
  const rs = strRows.filter(r => r.op === 'STR_RESPAN');
  const sg = strRows.filter(r => r.op === 'STR_SIGNAL');
  const we = strRows.filter(r => r.op === 'STR_WALK_EDIT');
  const deltaOk = typeof delta === 'number' && delta > 1.0 && delta < 2.0;   // a real ≈+1.5m drag happened
  const reOk = re.length === 2 &&
    JSON.stringify(re.map(r => r.p.from[1]).sort((a, b) => a - b)) === '[0,3]' &&
    re.every(r => Math.abs(r.p.from[0] - 6) < EPS && Math.abs(r.p.to[0] - (6 + delta)) < EPS && Math.abs(r.p.to[1] - r.p.from[1]) < EPS);
  const rsOk = rs.length === 2 && rs.every(r => Math.abs(r.p.oldSpan - 6) < EPS && Math.abs(r.p.newSpan - (6 + delta)) < EPS);
  const spansOk = !!spansAfter && spansAfter.length === 4 &&
    Math.abs(spansAfter[0] - 3) < EPS && Math.abs(spansAfter[1] - 3) < EPS &&
    Math.abs(spansAfter[2] - (6 + delta)) < EPS && Math.abs(spansAfter[3] - (6 + delta)) < EPS;
  const weOk = we.length === 1 && we[0].p.axis === 'x' && Math.abs(we[0].p.delta - delta) < EPS;
  t.assert('K7 GEOMETRY (columns on B re-anchored 6→6+δ exactly; the two 6m girders re-span to 6+δ; spans after == {3,3,6+δ,6+δ}; δ=' + (deltaOk ? delta.toFixed(3) : delta) + ')',
    deltaOk && reOk && rsOk && spansOk && weOk && sg.length === 0,
    'delta=' + delta + ' reanchor=' + JSON.stringify(re.map(r => [r.p.from, r.p.to])) +
    ' respan=' + JSON.stringify(rs.map(r => [r.p.oldSpan, r.p.newSpan])) + ' spansAfter=' + JSON.stringify(spansAfter) +
    ' signals=' + sg.length + ' walkEdit=' + JSON.stringify(we.map(r => r.p)));

  // K8: the signed chain still verifies, and the GEOM fold saw exactly the ONE GEOM_GRID_MOVE (the STR batch
  // is non-GEOM by design — it must not disturb the geometry cursor/fold that gridstretch already guards).
  t.assert('K8 CHAIN-OK (verifyChain passes; GEOM log grew by exactly the one GEOM_GRID_MOVE)',
    chain === true && after.len === before.len + 1 && last && last.op_type === 'GEOM_GRID_MOVE',
    'verifyChain=' + chain + ' len ' + before.len + '→' + after.len + ' lastOp=' + (last && last.op_type));
}, { width: 1200, height: 850, dpr: 2 });
