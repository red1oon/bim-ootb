#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — real acceptance test for OCCUPANT_PATHFINDER.md §SPINE-BRIDGE-CLUSTER
 * Classifies every room-pair diff between origin/main and this branch's room_graph.js into:
 *   SAME          - both null, or both found and byte-identical (stops/doors/distance)
 *   NEWLY_FOUND   - was null, now found (expected result of this fix)
 *   LOST          - was found, now null (real regression — must be zero)
 *   CHANGED       - both found but stops/doors/distance differ (real regression — must be zero)
 * RUN: node witness_spine_bridge_cluster_regression.js   (run from the repo root; needs
 * buildings/*.db present, and better-sqlite3 available — see ../bim-compiler/node_modules)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const Database = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'better-sqlite3'));
const { execSync } = require('child_process');

const RG = require(path.join(__dirname, 'common', 'room_graph.js'));
const BEFORE_SRC = execSync('git show origin/main:common/room_graph.js', { cwd: __dirname }).toString();
const beforePath = path.join(__dirname, 'common', '_room_graph_before_' + process.pid + '.js');
fs.writeFileSync(beforePath, BEFORE_SRC);
const RGbefore = require(beforePath);
process.on('exit', () => { try { fs.unlinkSync(beforePath); } catch (e) {} });

const BLD = path.join(__dirname, 'buildings');
const PATCH = path.join(BLD, 'patches');
const FLEET = [
  ['Hospital_meta.db', 'Hospital_meta.db.sql'],
  ['Clinic_meta.db', null],
  ['Terminal_meta.db', 'Terminal_meta.db.sql'],
  ['LTU_AHouse_extracted.db', null],
  ['JKR_extracted.db', 'JKR_extracted.db.sql'],
  ['HHS_Office_Federated_extracted.db', 'HHS_Office_Federated_extracted.db.sql'],
  ['TermRooms_extracted.db', null],
];

function load(dbFile) {
  const tmp = '/tmp/_sbc_reg_' + Math.random().toString(36).slice(2) + '.db';
  fs.copyFileSync(path.join(BLD, dbFile), tmp);
  return { db: new Database(tmp), tmp };
}
function stops(r, gg) {
  return JSON.stringify(r.path.filter(x => { const k = (gg.nodesByGuid[x] || {}).kind; return k === 'room' || k === 'exit'; }));
}

let grandSame = 0, grandNew = 0, grandLost = 0, grandChanged = 0;
for (const [dbFile, patchFile] of FLEET) {
  if (!fs.existsSync(path.join(BLD, dbFile))) { console.log('§SKIP ' + dbFile); continue; }
  const { db, tmp } = load(dbFile);
  if (patchFile) {
    const p = path.join(PATCH, patchFile);
    if (fs.existsSync(p)) db.exec(fs.readFileSync(p, 'utf8'));
  }
  const dbQuery = (q) => db.prepare(q).raw(true).all();
  const gAfter = RG.buildGraph(dbQuery, { log: () => {} });
  const gBefore = RGbefore.buildGraph(dbQuery, { log: () => {} });
  const rooms = gAfter.nodes.filter(n => n.kind === 'room');

  let same = 0, neu = 0, lost = 0, changed = 0;
  const changedDetail = [], lostDetail = [], newDetail = [];
  const realLog = console.log; console.log = () => {}; // room_graph.js's own _log() writes to
  // console.log unconditionally (not gated by buildGraph's opts.log) — silence it for the O(n^2)
  // shortestPath sweep, restored right after.
  for (let i = 0; i < rooms.length; i++) for (let j = i + 1; j < rooms.length; j++) {
    const rN = RG.shortestPath(gAfter, rooms[i].guid, rooms[j].guid);
    const rO = RGbefore.shortestPath(gBefore, rooms[i].guid, rooms[j].guid);
    if (rN === null && rO === null) { same++; continue; }
    if (rN === null && rO !== null) { lost++; if (lostDetail.length < 5) lostDetail.push(rooms[i].guid + '>' + rooms[j].guid); continue; }
    if (rN !== null && rO === null) { neu++; if (newDetail.length < 5) newDetail.push(rooms[i].guid + '>' + rooms[j].guid); continue; }
    const ident = stops(rN, gAfter) === stops(rO, gBefore) &&
      JSON.stringify(rN.doors) === JSON.stringify(rO.doors) &&
      Math.abs(rN.distance - rO.distance) < 1e-6;
    if (ident) same++; else { changed++; if (changedDetail.length < 5) changedDetail.push(rooms[i].guid + '>' + rooms[j].guid + ' dN=' + rN.distance.toFixed(1) + ' dO=' + rO.distance.toFixed(1)); }
  }
  console.log = realLog;
  console.log('§SBC_REGRESSION ' + dbFile + ' rooms=' + rooms.length + ' same=' + same + ' newlyFound=' + neu + ' lost=' + lost + ' changed=' + changed);
  if (newDetail.length) console.log('  newlyFound sample: ' + newDetail.join(' | '));
  if (lostDetail.length) console.log('  ❌ LOST sample: ' + lostDetail.join(' | '));
  if (changedDetail.length) console.log('  ❌ CHANGED sample: ' + changedDetail.join(' | '));
  grandSame += same; grandNew += neu; grandLost += lost; grandChanged += changed;
  db.close(); fs.unlinkSync(tmp);
}
console.log('§SBC_REGRESSION_TOTAL same=' + grandSame + ' newlyFound=' + grandNew + ' lost=' + grandLost + ' changed=' + grandChanged);
console.log(grandLost === 0 && grandChanged === 0 ? '✅ PASS — zero lost, zero changed (only new connectivity added)' : '❌ FAIL — real regression present');
