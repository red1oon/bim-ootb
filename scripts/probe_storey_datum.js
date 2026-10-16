#!/usr/bin/env node
// probe_storey_datum.js — Implementing bim-compiler prompts/4D_MODEL_INTEGRITY.md §K.4 + §L item 1.
//
// ⚠ DO NOT REMOVE — SCOPE. Two questions, no others:
//   1. Is the injected storey datum (`room_walker.js` `compileRooms()` -> stZ) the FLOOR, or is it
//      mean wall CENTRE-z? §K.4 measured it 0.64-3.16 m high on Terminal, which bands every element
//      one level DOWN under §STOREY_DATUM (`schedule_author.js`, PR #1551).
//   2. How many storeys does the walker WALK but never emit a `spatial_structure` row for, because
//      `writeRooms()` emits one only where a room compiled?
// Read the §STOREY_DATUM_PROBE log after every run. Nothing here re-derives the walker's own
// numbers from scratch: the wall set is taken from the EXPORTED `storeyWalls()` primitive with the
// EXACT arguments `compileRooms()` passes it, so the cross-check is an independent read of the same
// source rows, not a copy of the internal reduce.
//
// The shipped building DB is NEVER mutated — it is copied to a scratch path first and writeRooms()
// runs against the copy.
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const HOME = os.homedir();
const initSqlJs = require(path.join(HOME, 'bim-ootb', 'node_modules', 'sql.js'));
const SQLJS_DIST = path.join(HOME, 'bim-ootb', 'node_modules', 'sql.js', 'dist');
const RW = require(path.join(__dirname, '..', 'viewer', 'lib', 'room_walker.js'));

const BLD = process.env.BLD_DIR || path.join(HOME, 'bim-ootb', 'buildings');
const SCRATCH = process.env.SCRATCH || '/tmp/storey_datum_probe';
const BUILDINGS = process.argv.slice(2).length ? process.argv.slice(2) : ['Terminal'];

const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
const med = a => { const v = a.slice().sort((x, y) => x - y); const n = v.length;
  return n ? (n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2) : NaN; };
const f3 = x => (x === null || x === undefined || Number.isNaN(x)) ? '   n/a' : x.toFixed(3).padStart(8);
const rows = (db, q) => { let r; try { r = db.exec(q); } catch (e) { return []; }
  if (!r.length) return []; return r[0].values.map(v => { const o = {};
    r[0].columns.forEach((c, i) => { o[c] = v[i]; }); return o; }); };

(async () => {
  const SQL = await initSqlJs({ locateFile: f => path.join(SQLJS_DIST, f) });
  fs.mkdirSync(SCRATCH, { recursive: true });

  for (const bld of BUILDINGS) {
    let src = path.join(BLD, bld + '_meta.db');
    if (!fs.existsSync(src) || fs.statSync(src).size === 0) src = path.join(BLD, bld + '_extracted.db');
    if (!fs.existsSync(src)) { console.log('§STOREY_DATUM_PROBE ' + bld + ' SKIP no DB'); continue; }
    const work = path.join(SCRATCH, bld + '_probe.db');
    fs.copyFileSync(src, work);                       // never touch the shipped DB
    const db = new SQL.Database(fs.readFileSync(work));

    console.log('\n══════ §STOREY_DATUM_PROBE ' + bld + '  (src=' + path.basename(src) + ') ══════');

    // ── independent read of the SAME wall set compileRooms() uses (exported primitives, same args)
    const ds = RW.doorStats(db);
    const vertMin = ds.h > 0 ? RW.VERT_FACTOR * ds.h : 0.0;
    const anchors = RW.storeyZAnchors(db);
    const wallsBy = RW.storeyWalls(db, vertMin, anchors);   // rows: [cx,cy,cz,bx,by,bz]

    // ── the walker's own output
    const compiled = RW.compileRooms(db);
    const stZ = compiled.stZ, allrooms = compiled.rooms;

    // ── reference "where is the floor really": median slab TOP per raw storey label
    const slabTop = {};
    rows(db, "SELECT m.storey st, t.center_z cz, t.bbox_z bz FROM elements_meta m " +
             "JOIN element_transforms t ON t.guid=m.guid WHERE m.ifc_class LIKE 'IfcSlab%' " +
             "AND t.center_z IS NOT NULL")
      .forEach(r => { (slabTop[r.st] = slabTop[r.st] || []).push(r.cz + (r.bz || 0) / 2); });

    console.log('storey                |walls| stZ(shipped)| meanCentreZ| meanBaseZ | rooms | slabTop | err_vs_slab');
    console.log('----------------------|-----|-------------|------------|-----------|-------|---------|------------');
    const walked = Object.keys(wallsBy).sort();
    let emitted = 0, walkedGate = 0, dropped = 0;
    for (const st of walked) {
      const ws = wallsBy[st];
      const tooFew = ws.length < 3;                        // the walker's own gate (:1157)
      if (!tooFew) walkedGate++;
      const mc = mean(ws.map(w => w[2]));                  // mean wall CENTRE-z  (the bug)
      const mb = mean(ws.map(w => w[2] - w[5] / 2));       // mean wall BASE-z    (the fix)
      const nRooms = allrooms.filter(r => r.storey === st).length;
      if (!tooFew && nRooms > 0) emitted++;
      if (!tooFew && nRooms === 0) dropped++;
      const stop = slabTop[st] ? med(slabTop[st]) : null;
      const shipped = stZ[st];
      const err = (shipped !== undefined && stop !== null) ? shipped - stop : null;
      console.log(st.slice(0, 21).padEnd(22) + '|' + String(ws.length).padStart(5) + '|' +
        (shipped === undefined ? '   (not set)' : f3(shipped)).padStart(13) + '|' + f3(mc).padStart(12) + '|' +
        f3(mb).padStart(11) + '|' + String(nRooms).padStart(7) + '|' + f3(stop) + '|' + f3(err));
    }

    // ── which reduce does the shipped stZ actually match?
    let matchCentre = 0, matchBase = 0, n = 0;
    for (const st of Object.keys(stZ)) {
      const ws = wallsBy[st]; if (!ws) continue; n++;
      if (Math.abs(stZ[st] - mean(ws.map(w => w[2]))) < 1e-9) matchCentre++;
      if (Math.abs(stZ[st] - mean(ws.map(w => w[2] - w[5] / 2))) < 1e-9) matchBase++;
    }
    console.log('§STOREY_DATUM_PROBE ' + bld + ' stZ_reduce: matches_meanCentreZ=' + matchCentre +
                '/' + n + '  matches_meanBaseZ=' + matchBase + '/' + n +
                '   VERDICT=' + (matchBase === n && n > 0 ? 'FLOOR (fixed)'
                              : matchCentre === n && n > 0 ? 'MID-WALL (§K.4 defect present)'
                              : n === 0 ? 'INCONCLUSIVE (no storeys walked)' : 'MIXED'));

    // ── Bug 2: how many walked storeys never reach spatial_structure
    console.log('§STOREY_DATUM_PROBE ' + bld + ' emit: storeysInStZ=' + Object.keys(stZ).length +
                ' withRooms=' + emitted + ' withoutRooms=' + dropped +
                ' -> old guard would DROP ' + dropped + ' storey row(s)');

    // ── run the real writeRooms() against the copy and COUNT what actually landed
    RW.writeRooms(db, compiled);
    const st_rows = rows(db, "SELECT guid,name,center_z FROM spatial_structure " +
      "WHERE type='IfcBuildingStorey' AND guid LIKE 'STC\\_%' ESCAPE '\\' ORDER BY center_z");
    console.log('§STOREY_DATUM_PROBE ' + bld + ' writeRooms -> STC_ rows=' + st_rows.length);
    st_rows.forEach(r => console.log('   STC row  ' + String(r.name).padEnd(24) + f3(r.center_z)));
    // what the §STOREY_DATUM consumer (schedule_author.js) will actually read
    const usable = rows(db, "SELECT name, center_z FROM spatial_structure " +
      "WHERE type='IfcBuildingStorey' AND center_z IS NOT NULL");
    console.log('§STOREY_DATUM_PROBE ' + bld + ' consumer-visible datum rows (center_z NOT NULL)=' +
                usable.length + '  [schedule_author.js §STOREY_DATUM band source]');
    db.close();
  }
})().catch(e => { console.error('PROBE FAILED', e); process.exit(1); });
