#!/usr/bin/env node
// # ⚠ DO NOT REMOVE — scope: W-FLOOR-CARRIERS (bim-compiler prompts/4D_MODEL_INTEGRITY.md §Q.33.9). Read the log after every run.
// THE ISSUE THIS PROVES OR DISPROVES: "the film shows stairs first and the connecting floors missing" — a floor/roof plate scheduled before
// the structural carriers under it have finished, so the renderer (tm_sched_xray.js maxCarrierEnd) holds it off screen; and curtain-wall
// mullions/panels filed as structure, so they were among those carriers (§Q.32). Judged on the PLAYED layer of the persisted runs
// (scripts/cache_4d_run.js, PRIMAL LAW 5), all seven buildings.
//   W-FC-1  per building: plates (seq<=4, wider than tall in both plan dims) with >= 2 carriers (seq<=4, top meeting the plate's underside)
//           that START before their LAST carrier ENDS. Must be 0. Population printed; 0 plates judged = INCONCLUSIVE.
//           SAME-TASK early plates must be 0 (§E1_ALL_CARRIERS owns them). CROSS-TASK ones are the level/phase filing relation (§I.3,
//           not this change): a named ratchet, CROSS_LOCK below — may not grow; measured 2026-11-19 on fix/4d-floors-carriers.
//   W-FC-2  per building with rel_aggregates: children of an IfcCurtainWall still filed Superstructure. Must be 0. No table = INCONCLUSIVE.
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = process.env.FC_ROOT || path.join(__dirname, '..', '..');   // FC_ROOT: judge another tree's persisted runs (e.g. main, for a before/after)
const BLD = process.env.BLD_DIR || path.join(require('os').homedir(), 'bim-ootb', 'buildings');
const CACHE = require(path.join(ROOT, 'scripts', 'cache_4d_run.js'));
const BP = require(path.join(ROOT, 'scripts', 'lib', 'apply_building_patch.js'));
const BLDS = process.argv.slice(2).length ? process.argv.slice(2) : ['Duplex', 'HHS_Office_Federated', 'JKR', 'Clinic', 'Terminal', 'Hospital', 'LTU_AHouse'];
const EPS = 0.05, GAP = 0.5;
const CROSS_LOCK = { Duplex: 0, HHS_Office_Federated: 0, JKR: 0, Clinic: 1, Terminal: 0, Hospital: 0, LTU_AHouse: 109 };   // measured, §Q.33.10; Terminal 25 -> 0 by §RUNG_RUN_LABEL (§Q.35.1); LTU 755 -> 109 judging the patched DB (§Q.35.3)
let pass = 0, fail = 0, inc = 0;
const say = (id, b, ok, d) => { console.log('  ' + (ok === null ? 'INCONCLUSIVE' : ok ? 'PASS' : 'FAIL') + ' ' + id + ' ' + b + ' — ' + d); ok === null ? inc++ : ok ? pass++ : fail++; };
(async () => {
  let SQL = null;
  try { const initSqlJs = require(path.join(ROOT, 'modeller', 'lib', 'sql-wasm.js')); SQL = await initSqlJs({ wasmBinary: fs.readFileSync(path.join(ROOT, 'modeller', 'lib', 'sql-wasm.wasm')) }); } catch (e) {}
  for (const b of BLDS) {
    let run = CACHE.read(b); if (!run) run = CACHE.build(b, false);
    if (!run) { say('W-FC-1', b, null, 'no persisted run'); continue; }
    const P = run.play || {}, els = run.els.filter(e => P[e.guid]);
    const plates = els.filter(e => e.seq <= 4 && (e.tz - e.bz) < (e.x1 - e.x0) && (e.tz - e.bz) < (e.y1 - e.y0));
    const pool = els.filter(e => e.seq <= 4);
    // grid over the pool for speed
    const CELL = 4, grid = new Map(); const key = (i, j) => i + ',' + j;
    pool.forEach(e => { for (let i = Math.floor(e.x0 / CELL); i <= Math.floor(e.x1 / CELL); i++) for (let j = Math.floor(e.y0 / CELL); j <= Math.floor(e.y1 / CELL); j++) { const k = key(i, j); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(e); } });
    const tk = new Map(); (run.tasks || []).forEach(t => (t.guids || []).forEach(g => tk.set(g, t.id)));
    let judged = 0, early = [], worst = 0, cross = 0;
    for (const T of plates) {
      const seen = new Set(), car = [];
      for (let i = Math.floor(T.x0 / CELL); i <= Math.floor(T.x1 / CELL); i++) for (let j = Math.floor(T.y0 / CELL); j <= Math.floor(T.y1 / CELL); j++) for (const S of (grid.get(key(i, j)) || [])) {
        if (S === T || seen.has(S.guid)) continue; seen.add(S.guid);
        if (S.x1 > T.x0 && S.x0 < T.x1 && S.y1 > T.y0 && S.y0 < T.y1 && S.bz < T.bz - EPS && S.tz >= T.bz - GAP && S.tz <= T.bz + GAP) car.push(S);
      }
      if (car.length < 2) continue;
      judged++;
      const last = Math.max(...car.map(S => P[S.guid].e));
      if (P[T.guid].s < last - 1) {
        const lastS = car.reduce((a, S) => P[S.guid].e > P[a.guid].e ? S : a);
        if (tk.get(T.guid) !== tk.get(lastS.guid)) { cross++; continue; }
        const d = (last - P[T.guid].s) / 864e5; early.push({ g: T.guid, n: T.name, d: d }); if (d > worst) worst = d; }
    }
    say('W-FC-1', b, judged ? early.length === 0 : null, 'plates judged=' + judged + ' (of ' + plates.length + ' plate-shaped structural) sameTaskStartBeforeLastCarrierEnds=' + early.length +
      (early.length ? ' worstDays=' + worst.toFixed(2) + ' e.g. ' + early.slice(0, 3).map(x => '"' + String(x.n).slice(0, 30) + '"').join(', ') : ''));
    const cl = CROSS_LOCK[b];
    say('W-FC-1x', b, typeof cl === 'number' ? cross <= cl : null, 'crossTask early plates=' + cross + ' lock=' + cl + ' (level/phase filing, §I.3 — named, may not grow)');
    // W-FC-2
    const dbPath = run.dbFile ? path.join(BLD, run.dbFile) : null;
    if (!SQL || !dbPath || !fs.existsSync(dbPath)) { say('W-FC-2', b, null, 'db not readable: ' + dbPath); continue; }
    const db = new SQL.Database(new Uint8Array(fs.readFileSync(dbPath)));
    // §Q.33.11: judge the DB the run was built from — raw file + the viewer's patch (scripts/lib/apply_building_patch.js), exactly as cache_4d_run did
    const pr = run.patched ? BP.applyTo(db, run.dbFile, console.log, run.patched) : null;
    if (run.patched && (!pr || pr.failed.length)) { say('W-FC-2', b, null, 'patch did not apply (' + (pr && pr.failed.map(f => f.err).join('; ')) + ') — judged nothing'); db.close(); continue; }
    let rows = null; try { const r = db.exec("SELECT a.child_guid FROM rel_aggregates a JOIN elements_meta p ON p.guid=a.parent_guid WHERE p.ifc_class='IfcCurtainWall'"); rows = r.length ? r[0].values.map(v => v[0]) : []; } catch (e) { rows = null; }
    db.close();
    if (rows === null) { say('W-FC-2', b, null, 'no rel_aggregates table (raw file' + (run.patched ? ' + viewer patch' : ', patch not applied') + ') — curtain-wall parts cannot be told from structure'); continue; }
    if (!rows.length) { say('W-FC-2', b, null, 'no curtain-wall children declared'); continue; }
    const byG = new Map(els.map(e => [e.guid, e])), still = rows.filter(g => byG.has(g) && byG.get(g).phase === 'Superstructure');
    say('W-FC-2', b, still.length === 0, 'curtain-wall children=' + rows.length + ' stillSuperstructure=' + still.length);
  }
  console.log('§FLOOR_CARRIERS_SUMMARY pass=' + pass + ' fail=' + fail + ' inconclusive=' + inc);
  process.exit(fail ? 1 : 0);
})();
