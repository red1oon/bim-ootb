#!/usr/bin/env node
// WITNESS — W-BDP — §CPE_BUILDUP_PLACED
// Spec: bim-compiler prompts/MEP_CLASH_REVEAL_MOVIE.md §88.3 / §88.6e.
//
// ISSUE THIS PROVES OR DISPROVES:
//   §88 opened because Hospital's 8,899 m² Level 1 floor slab reads as bare ground from the opening
//   seconds to the closing reveal, and NO bake log could say when — or whether — it was ever drawn.
//   §CPE_BUILDUP reports `placed=N/63415`, an op count, and nothing in the codebase names a single
//   element. §CPE_BUILDUP_PLACED closes that by logging a WATCH SET of guids with the frame each
//   one's state changed.
//
//   That instrumentation is only worth anything if the watch set actually CONTAINS the element the
//   question is about, and if the frame it prints can be checked against something independent.
//   Both halves are pure data — the default watch set is one SQL query, and the frame an element is
//   due on is its ELEMENT_PLACE op's end_ts rank over all ops (the buildup is work-paced,
//   §CPE_BUILDUP_PACING mode=work, so rank/total IS the film fraction). So this is a NODE witness:
//   it runs the shipped query against the shipped DBs in under a second, on every building, and
//   needs no GPU. A browser harness would prove less, slower.
//
// GATES:
//   G-BDP-WATCH   (BLOCKING) the default watch set is non-empty, at most 16, and holds at most one
//                 slab per storey. On Hospital_silent it MUST contain 0e8pm26Tv5vPrj6zU55MOH —
//                 §88's own element. A watch set that misses it instruments the wrong thing.
//   G-BDP-ONEOP   (BLOCKING) every watched guid has EXACTLY ONE ELEMENT_PLACE op. With two, the
//                 `op=placed` field would be ambiguous and the printed frame meaningless.
//   G-BDP-FRAME   each watched guid's due frame, from its end_ts rank over all ELEMENT_PLACE ops.
//                 This is the number a §CPE_BUILDUP_PLACED line must be read against: a guid whose
//                 log line says `visible=false` long past its due frame is the §88 defect; one that
//                 never gets a line at all means the watch set never resolved it.
//   G-BDP-GROUND  reports each watched slab's underside/top against the §GROUND_Y datum (the
//                 lowest large ground-floor-named slab's underside). §88.6a turns on this pair of
//                 numbers, so the witness prints them rather than leaving them to be re-derived.
//
// Command (from the worktree root):
//   node viewer/tests/witness_buildup_placed_watch.js [building ...]
//   BLD_DIR=~/bim-ootb/buildings node viewer/tests/witness_buildup_placed_watch.js Hospital_silent
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const initSqlJs = require(path.join(os.homedir(), 'bim-ootb', 'node_modules', 'sql.js'));
const SQLJS_DIST = path.join(os.homedir(), 'bim-ootb', 'node_modules', 'sql.js', 'dist');
const BLD_DIR = process.env.BLD_DIR || path.join(os.homedir(), 'bim-ootb', 'buildings');
const FRAMES = +(process.env.FRAMES || 4699);   // the v86 Hospital film, so the numbers are comparable

// §88's own element — the one the whole section exists to explain.
const HOSPITAL_L1_SLAB = '0e8pm26Tv5vPrj6zU55MOH';

// VERBATIM from time_machine.js _bdWatchSet's default branch. Copied, not imported, because the
// viewer is a browser bundle; any edit there must be mirrored here or G-BDP-WATCH stops witnessing
// the shipped query.
const WATCH_SQL =
  'SELECT m.guid, m.ifc_class, m.storey, MAX(t.bbox_x * t.bbox_y) AS area ' +
  'FROM elements_meta m JOIN element_transforms t ON t.guid = m.guid ' +
  "WHERE m.ifc_class = 'IfcSlab' AND t.bbox_x IS NOT NULL AND t.bbox_y IS NOT NULL " +
  'GROUP BY m.storey ORDER BY area DESC LIMIT 16';

function rowsOf(db, sql) { const r = db.exec(sql); return r.length ? r[0].values : []; }

(async () => {
  const SQL = await initSqlJs({ locateFile: f => path.join(SQLJS_DIST, f) });
  let names = process.argv.slice(2);
  if (!names.length) {
    names = fs.readdirSync(BLD_DIR).filter(f => f.endsWith('.db')).map(f => f.replace(/\.db$/, ''));
  }
  let fail = 0, checked = 0;

  for (const name of names) {
    const p = path.join(BLD_DIR, name + '.db');
    if (!fs.existsSync(p)) { console.log(`§W-BDP SKIP ${name} — no such DB at ${p}`); continue; }
    let db;
    try { db = new SQL.Database(new Uint8Array(fs.readFileSync(p))); }
    catch (e) { console.log(`§W-BDP SKIP ${name} — unreadable (${e.message})`); continue; }

    const hasOps = rowsOf(db, "SELECT name FROM sqlite_master WHERE type='table' AND name='kernel_ops'").length;
    if (!hasOps) { console.log(`§W-BDP SKIP ${name} — no kernel_ops (not a 4D DB)`); db.close(); continue; }
    checked++;

    const watch = rowsOf(db, WATCH_SQL);

    // ── G-BDP-WATCH ────────────────────────────────────────────────────────────────────────────
    const storeys = watch.map(r => r[2]);
    const dupStorey = storeys.length !== new Set(storeys).size;
    let wOk = watch.length > 0 && watch.length <= 16 && !dupStorey;
    let wNote = '';
    if (name === 'Hospital_silent') {
      const has = watch.some(r => r[0] === HOSPITAL_L1_SLAB);
      if (!has) { wOk = false; wNote = ' — MISSES §88\'s own Level 1 slab ' + HOSPITAL_L1_SLAB; }
      else wNote = ' — contains §88\'s Level 1 slab';
    }
    console.log(`§W-BDP G-BDP-WATCH ${wOk ? 'PASS' : 'FAIL'} ${name} n=${watch.length} storeys=${storeys.length}` +
      ` dupStorey=${dupStorey}${wNote}`);
    if (!wOk) fail++;

    // ── all ELEMENT_PLACE ops, ranked by end_ts ────────────────────────────────────────────────
    const ops = rowsOf(db, "SELECT output_guid, timestamp, parameters FROM kernel_ops " +
                           "WHERE op_type='ELEMENT_PLACE' AND undone=0 AND output_guid IS NOT NULL");
    const endOf = r => { let e = null; try { e = (JSON.parse(r[2] || '{}') || {})._end_ts; } catch (x) {} return e || (r[1] + 60000); };
    const ends = ops.map(endOf).sort((a, b) => a - b);
    const opsByGuid = new Map();
    for (const r of ops) { const l = opsByGuid.get(r[0]) || []; l.push(r); opsByGuid.set(r[0], l); }

    // ── §GROUND_Y datum (tools.js §GROUND_Y_LOWEST_GF), for G-BDP-GROUND ───────────────────────
    const GF = "('Ground Floor','Ground','First Floor','1st Floor','Level 0','Level 00','Level 1','GF','L0','L00','L1','00','0','1F','EG','Erdgeschoss','Storey 1','Plan 1','VÅN 1','VÅNING 1','1. OG','Rez-de-chaussée','RC','Planta Baja','PB','Piso 0','Begane grond','BG','GROUND FLOOR LEVEL','Ground Lev','Aras Tanah','u.etg')";
    const gfRows = rowsOf(db,
      'SELECT t.center_z - t.bbox_z/2 AS bottom, t.bbox_x*t.bbox_y AS area, t.center_z FROM element_transforms t ' +
      'JOIN elements_meta m ON t.guid=m.guid ' +
      "WHERE m.ifc_class='IfcSlab' AND t.bbox_z IS NOT NULL AND t.bbox_z < 1.0 AND t.bbox_x IS NOT NULL " +
      'AND t.bbox_y IS NOT NULL AND m.storey IN ' + GF + ' ORDER BY area DESC LIMIT 5');
    let groundZ = null;
    for (const r of gfRows) if (groundZ === null || r[2] < groundZ.cz) groundZ = { z: r[0], cz: r[2] };
    const gz = groundZ ? groundZ.z : null;

    let oneOpOk = true;
    for (const w of watch) {
      const [guid, cls, storey, area] = w;
      const list = opsByGuid.get(guid) || [];
      if (list.length !== 1) { oneOpOk = false;
        console.log(`§W-BDP G-BDP-ONEOP FAIL ${name} guid=${guid} storey="${storey}" ops=${list.length} — \`op=\` would be ambiguous`);
        continue; }
      const end = endOf(list[0]);
      // rank = how many ops have finished by the time this one has → the work fraction, which IS
      // the film fraction under §CPE_BUILDUP_PACING mode=work.
      let lo = 0, hi = ends.length;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (ends[mid] <= end) lo = mid + 1; else hi = mid; }
      const rank = lo, frac = rank / ends.length, dueFrame = Math.round(frac * FRAMES);
      const g = rowsOf(db, `SELECT center_z, bbox_z FROM element_transforms WHERE guid='${guid}'`)[0];
      const base = g ? g[0] - g[1] / 2 : null, top = g ? g[0] + g[1] / 2 : null;
      console.log(`§W-BDP G-BDP-FRAME ${name} guid=${guid} cls=${cls} storey="${storey}" area=${Math.round(area)}m2` +
        ` rank=${rank}/${ends.length} work=${(frac * 100).toFixed(3)}% dueFrame=${dueFrame}/${FRAMES}` +
        (gz == null || base == null ? '' :
          ` | G-BDP-GROUND base=${base.toFixed(3)} top=${top.toFixed(3)} groundZ=${gz.toFixed(3)}` +
          ` topAboveGround=${(top - gz).toFixed(3)}m`));
    }
    console.log(`§W-BDP G-BDP-ONEOP ${oneOpOk ? 'PASS' : 'FAIL'} ${name} watched=${watch.length}`);
    if (!oneOpOk) fail++;
    db.close();
  }

  console.log(`§W-BDP VERDICT ${fail === 0 ? 'PASS' : 'FAIL'} buildingsChecked=${checked} blockingFailures=${fail}`);
  process.exit(fail === 0 ? 0 : 1);
})();
