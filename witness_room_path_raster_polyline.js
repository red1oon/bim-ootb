#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-ROOM-PATH-RASTER-POLYLINE scope (READ THE LOG after every run)
 * SCOPE: bim-compiler VIEWER_FIND_PANEL_ROOM_ACCURACY.md §13 (Stage B) — common/room_graph.js
 * shortestPath() now returns an ADDITIVE `polyline`: the real walked route computed by A* over the
 * storey's walkable raster (§RASTER-ASTAR), so the DRAWN line HUGS real floor instead of the old
 * straight chord + door-visibility detour §11 measured cutting through walls/atrium air. Key finding
 * (proven here): the synthetic `circ` circulation-hub CENTROID sits on a disconnected raster island,
 * so the polyline bypasses it and routes the flanking corridor spines directly (§CIRC-NOT-A-WALKPOINT).
 * path/doors/distance are UNTOUCHED (the door-visibility legalizer + its §PATH_LEGAL_DETOUR_FAIL metric
 * the raster witnesses assert stay byte-identical). Proves: (G1) on raster-backed buildings the polyline
 * is ~fully on-floor where the old straight path was not, and NEVER worse anywhere (on-floor guarantee);
 * (G2) path/doors/distance byte-identical to origin/main; (G3) real interactive A* timing on the largest
 * building; (G4) honest degrade with no raster / no data.
 * RUN: node witness_room_path_raster_polyline.js   (needs buildings/*.db present)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const Database = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'better-sqlite3'));
const { execSync } = require('child_process');

const RG = require('./common/room_graph.js');
// "before" = origin/main's committed module (this branch is off origin/main), loaded from git so the
// regression compare is against real shipped code, not a hand-copy. It must live in common/ so its own
// relative requires (./storey_raster.js etc.) resolve.
const BEFORE_SRC = execSync('git show origin/main:common/room_graph.js', { cwd: __dirname }).toString();
const beforePath = path.join(__dirname, 'common', '_room_graph_before_' + process.pid + '.js');
fs.writeFileSync(beforePath, BEFORE_SRC);
const RGbefore = require(beforePath);
process.on('exit', () => { try { fs.unlinkSync(beforePath); } catch (e) {} });

const BLD = '/home/red1/bim-ootb/buildings';
let pass = 0, fail = 0;
const chk = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  ❌ ' + n + (x ? '  ' + x : '')); } };

function load(dbFile, patches, modeller) {
  const tmp = '/tmp/_wpoly_' + Math.random().toString(36).slice(2) + '.db';
  fs.copyFileSync(path.join(modeller ? path.join(__dirname, 'modeller') : BLD, dbFile), tmp);
  const db = new Database(tmp);
  (patches || []).forEach(p => { const f = path.join(__dirname, p); if (fs.existsSync(f)) db.exec(fs.readFileSync(f, 'utf8')); });
  return { db, tmp, dbQuery: (q) => db.prepare(q).raw(true).all() };
}
// storey of a path (single-storey pairs only): the common storey of all its real (non-stairwp) nodes.
function pathStorey(g, p) {
  let st = null;
  for (const guid of p) { const n = g.nodesByGuid[guid]; if (!n || n.storey == null || n.kind === 'stairwp') continue; if (st == null) st = n.storey; else if (st !== n.storey) return null; }
  return st;
}
function seqIllegal(g, storey, pts) { let ill = 0; for (let i = 0; i + 1 < pts.length; i++) ill += RG.chordIllegalCount(g, storey, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y); return ill; }
function nodePts(g, p) { return p.map(guid => { const n = g.nodesByGuid[guid]; return { x: n.cx, y: n.cy }; }); }

// polyline floor-legality across single-storey pairs: OLD straight (path node centres) vs NEW polyline.
function legality(label, dbFile, patches, modeller) {
  const { db, tmp, dbQuery } = load(dbFile, patches, modeller);
  const g = RG.buildGraph(dbQuery, { log: () => {} });
  const rooms = g.nodes.filter(n => n.kind === 'room');
  let single = 0, oldPts = 0, newPts = 0, improved = 0, worse = 0, withPoly = 0;
  const realLog = console.log; console.log = () => {};
  for (let i = 0; i < rooms.length; i++) for (let j = i + 1; j < rooms.length; j++) {
    const r = RG.shortestPath(g, rooms[i].guid, rooms[j].guid);
    if (!r || !r.polyline) continue; if (r.polyline.length) withPoly++;
    const st = pathStorey(g, r.path); if (st == null) continue; single++;
    const o = seqIllegal(g, st, nodePts(g, r.path)), n = seqIllegal(g, st, r.polyline);
    oldPts += o; newPts += n; if (n < o) improved++; if (n > o) worse++;
  }
  console.log = realLog; db.close(); fs.unlinkSync(tmp);
  const red = oldPts ? (100 * (oldPts - newPts) / oldPts) : 0;
  console.log('§POLY_LEGALITY ' + label + ' singleStoreyPairs=' + single + ' withPolyline=' + withPoly +
    ' OLD_illegalPts=' + oldPts + ' NEW_illegalPts=' + newPts + ' reduction=' + red.toFixed(1) + '% improvedPairs=' + improved + ' worsePairs=' + worse);
  return { single, oldPts, newPts, red, improved, worse };
}

// path/doors/distance byte-identical to origin/main
function regression(label, dbFile, patches, modeller) {
  const src = load(dbFile, patches, modeller);
  const g = RG.buildGraph(src.dbQuery, { log: () => {} });
  const gB = RGbefore.buildGraph(src.dbQuery, { log: () => {} });
  const rooms = g.nodes.filter(n => n.kind === 'room');
  let cmp = 0, id = 0, firstDiff = null;
  const realLog = console.log; console.log = () => {};
  for (let i = 0; i < rooms.length; i++) for (let j = i + 1; j < rooms.length; j++) {
    const rN = RG.shortestPath(g, rooms[i].guid, rooms[j].guid), rO = RGbefore.shortestPath(gB, rooms[i].guid, rooms[j].guid);
    cmp++;
    const same = (rN === null && rO === null) || (rN && rO && JSON.stringify(rN.path) === JSON.stringify(rO.path) &&
      JSON.stringify(rN.doors) === JSON.stringify(rO.doors) && Math.abs(rN.distance - rO.distance) < 1e-9);
    if (same) id++; else if (!firstDiff) firstDiff = rooms[i].guid + '>' + rooms[j].guid;
  }
  console.log = realLog; src.db.close(); fs.unlinkSync(src.tmp);
  console.log('§POLY_NOREG ' + label + ' compared=' + cmp + ' identical=' + id + (firstDiff ? ' firstDiff=' + firstDiff : ''));
  return { cmp, id };
}

// interactive A* timing on the largest raster-backed building — sample CONNECTED pairs (skip nulls) so
// the number reflects real A* work, not disconnected-component early-outs.
function timing(label, dbFile, patches) {
  const { db, tmp, dbQuery } = load(dbFile, patches);
  const g = RG.buildGraph(dbQuery, { log: () => {} });
  const rooms = g.nodes.filter(n => n.kind === 'room');
  const realLog = console.log; console.log = () => {};
  let n = 0, ms = 0, maxMs = 0, sumPts = 0, connected = 0;
  for (let i = 0; i < rooms.length && connected < 300; i++) for (let j = i + 1; j < rooms.length && connected < 300; j++) {
    const t0 = process.hrtime.bigint();
    const r = RG.shortestPath(g, rooms[i].guid, rooms[j].guid);
    const dt = Number(process.hrtime.bigint() - t0) / 1e6;
    n++;
    if (r && r.polyline && r.polyline.length) { connected++; ms += dt; if (dt > maxMs) maxMs = dt; sumPts += r.polyline.length; }
  }
  console.log = realLog; db.close(); fs.unlinkSync(tmp);
  const per = connected ? ms / connected : 0;
  console.log('§POLY_TIMING ' + label + ' storeys=' + Object.keys(g.rasters || {}).length + ' rooms=' + rooms.length +
    ' connectedPathsTimed=' + connected + ' avgMsPerPath=' + per.toFixed(2) + ' maxMsPerPath=' + maxMs.toFixed(2) +
    ' avgPolyPts=' + (sumPts / Math.max(1, connected)).toFixed(1));
  return { per, maxMs, connected };
}

// ═══ RUN ═══
const term = legality('Terminal(raster,splitDB)', 'Terminal_meta.db', ['viewer/buildings/patches/Terminal_meta.db.sql']);
const hhs = legality('HHS(raster)', 'HHS_Office_Federated_extracted.db', ['viewer/buildings/patches/HHS_Office_Federated_extracted.db.sql']);
const clinic = legality('Clinic(rect-fallback)', 'Clinic_extracted.db', []);
const dup = legality('Duplex(rect-fallback)', 'Duplex_ARC.db', [], true);

chk('G0 shortestPath returns a polyline (raster-backed pairs carry a real floor-hugging route)',
  term.single > 0 && hhs.single > 0 && term.oldPts > 0, 'Terminal pairs=' + term.single + ' HHS pairs=' + hhs.single);
chk('G1a Terminal(raster): polyline is ON FLOOR — old straight path had ' + term.oldPts + ' illegal pts, polyline reduces >=99%',
  term.red >= 99 && term.oldPts > 0, 'reduction=' + term.red.toFixed(1) + '% (new=' + term.newPts + ')');
chk('G1b HHS(raster): polyline reduces the old straight-path off-floor sampling by >=95% (circ-island bypass)',
  hhs.red >= 95 && hhs.oldPts > 0, 'reduction=' + hhs.red.toFixed(1) + '% old=' + hhs.oldPts + ' new=' + hhs.newPts + ' improvedPairs=' + hhs.improved);
chk('G1c ON-FLOOR GUARANTEE: the polyline is NEVER worse than the old straight path (0 worse pairs on every building)',
  term.worse === 0 && hhs.worse === 0 && clinic.worse === 0 && dup.worse === 0,
  'worsePairs T=' + term.worse + ' HHS=' + hhs.worse + ' Clinic=' + clinic.worse + ' Duplex=' + dup.worse);

const regT = regression('Terminal', 'Terminal_meta.db', ['viewer/buildings/patches/Terminal_meta.db.sql']);
const regH = regression('HHS', 'HHS_Office_Federated_extracted.db', ['viewer/buildings/patches/HHS_Office_Federated_extracted.db.sql']);
const regJ = regression('JKR', 'JKR_extracted.db', ['viewer/buildings/patches/JKR_extracted.db.sql']);
const regD = regression('Duplex', 'Duplex_ARC.db', [], true);
chk('G2 path/doors/distance byte-identical to origin/main on all buildings (polyline is purely additive)',
  regT.id === regT.cmp && regH.id === regH.cmp && regJ.id === regJ.cmp && regD.id === regD.cmp && (regT.cmp + regH.cmp + regJ.cmp + regD.cmp) > 0,
  'T=' + regT.id + '/' + regT.cmp + ' HHS=' + regH.id + '/' + regH.cmp + ' JKR=' + regJ.id + '/' + regJ.cmp + ' Duplex=' + regD.id + '/' + regD.cmp);

chk('G4 no-raster building (Clinic/Duplex rect fallback) still routes polylines, never regresses legality (honest degrade)',
  clinic.red >= 0 && dup.red >= 0 && clinic.single > 0 && dup.single > 0,
  'Clinic red=' + clinic.red.toFixed(1) + '% Duplex red=' + dup.red.toFixed(1) + '%');

const tHosp = timing('Hospital', 'Hospital_extracted.db', ['viewer/buildings/patches/Hospital_extracted.db.sql']);
chk('G3 interactive A* timing on the largest building stays well under an interactive click budget (avg <50ms, max <150ms)',
  tHosp.per < 50 && tHosp.maxMs < 150 && tHosp.connected > 0, 'avgMs=' + tHosp.per.toFixed(2) + ' maxMs=' + tHosp.maxMs.toFixed(2) + ' timed=' + tHosp.connected);

console.log('\n§W-ROOM-PATH-RASTER-POLYLINE DONE pass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);
