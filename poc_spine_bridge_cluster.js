#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — POC GATE, calculation-only, no engine edit
 * SCOPE: OCCUPANT_PATHFINDER.md §SPINE-BRIDGE-CLUSTER POC gate. Measures, per fleet building/storey,
 * how many connected components of E1 (door) edges have ZERO members touching spine/circ (E2/E6/E7)
 * — i.e. how many rooms today's `_degSoFar[lg]` guard skips because they have SOME degree, just not
 * to circulation. Uses only room_graph.js's own exported buildGraph()/edges — no engine change.
 * RUN: node poc_spine_bridge_cluster.js   (run from the repo root; needs buildings/*.db present)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const Database = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'better-sqlite3'));
const RG = require(path.join(__dirname, 'common', 'room_graph.js'));

const BLD = path.join(__dirname, 'buildings');
const PATCH = path.join(BLD, 'patches');
const FLEET = [
  // Hospital/Clinic/Terminal ship meta/extracted SPLIT locally (extracted.db lacks
  // spatial_structure) — use the meta.db + its patch, same pairing the detour-backtrack
  // witness used (RESUME_ROOMPATH_DETOUR_BACKTRACK.md §1). LTU/JKR/HHS/TermRooms are unsplit
  // extracted.db with spatial_structure already present.
  ['Hospital_meta.db', 'Hospital_meta.db.sql'],
  ['Clinic_meta.db', null],
  ['Terminal_meta.db', 'Terminal_meta.db.sql'],
  ['LTU_AHouse_extracted.db', null],
  ['JKR_extracted.db', 'JKR_extracted.db.sql'],
  ['HHS_Office_Federated_extracted.db', 'HHS_Office_Federated_extracted.db.sql'],
  ['TermRooms_extracted.db', null],
  // Duplex: no meta.db split present locally, extracted.db lacks spatial_structure — skipped
  // honestly rather than faked; not evidence of zero isolated components for this building.
];

function unionFind(n) {
  const parent = Array.from({ length: n }, (_, i) => i);
  function find(x) { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; }
  function union(a, b) { a = find(a); b = find(b); if (a !== b) parent[a] = b; }
  return { find, union };
}

let grandTotalIsolatedComponents = 0, grandTotalIsolatedRooms = 0;

for (const [dbFile, patchFile] of FLEET) {
  const src = path.join(BLD, dbFile);
  if (!fs.existsSync(src)) { console.log('§SKIP ' + dbFile + ' (not present locally)'); continue; }
  const tmp = '/tmp/_poc_sbc_' + Math.random().toString(36).slice(2) + '.db';
  fs.copyFileSync(src, tmp);
  const db = new Database(tmp);
  if (patchFile) {
    const p = path.join(PATCH, patchFile);
    if (fs.existsSync(p)) db.exec(fs.readFileSync(p, 'utf8'));
  }
  const dbQuery = (q) => db.prepare(q).raw(true).all();
  const logs = [];
  const g = RG.buildGraph(dbQuery, { log: (m) => logs.push(m) });

  const rooms = g.nodes.filter(n => n.kind === 'room');
  const guidToIdx = {}; rooms.forEach((r, i) => guidToIdx[r.guid] = i);
  const uf = unionFind(rooms.length);

  const touchesSpine = {}; // room guid -> true if it has an E2/E6/E7 edge
  g.edges.forEach(e => {
    if (e.kind === 'E1' && guidToIdx[e.a] !== undefined && guidToIdx[e.b] !== undefined) {
      uf.union(guidToIdx[e.a], guidToIdx[e.b]);
    }
    if (e.kind === 'E2' || e.kind === 'E6' || e.kind === 'E7') {
      if (guidToIdx[e.a] !== undefined) touchesSpine[e.a] = true;
      if (guidToIdx[e.b] !== undefined) touchesSpine[e.b] = true;
    }
  });

  const compMembers = {};
  rooms.forEach((r, i) => { const root = uf.find(i); (compMembers[root] = compMembers[root] || []).push(r); });

  let isolatedComponents = 0, isolatedRooms = 0;
  const detail = [];
  Object.values(compMembers).forEach(members => {
    if (members.length < 2) return; // size-1 orphans are already handled by today's per-node bridge attempt
    const anyTouches = members.some(m => touchesSpine[m.guid]);
    if (!anyTouches) {
      isolatedComponents++;
      isolatedRooms += members.length;
      detail.push('storey=' + members[0].storey + ' size=' + members.length + ' rooms=' + members.map(m => m.name).join(',') + ' guids=' + members.map(m => m.guid).join(','));
    }
  });

  console.log('§POC_SBC ' + dbFile + ' rooms=' + rooms.length + ' isolatedComponents(size>=2, zero spine touch)=' + isolatedComponents + ' isolatedRooms=' + isolatedRooms);
  detail.forEach(d => console.log('  ' + d));

  grandTotalIsolatedComponents += isolatedComponents;
  grandTotalIsolatedRooms += isolatedRooms;
  fs.unlinkSync(tmp);
}

console.log('§POC_SBC_TOTAL isolatedComponents=' + grandTotalIsolatedComponents + ' isolatedRooms=' + grandTotalIsolatedRooms);
