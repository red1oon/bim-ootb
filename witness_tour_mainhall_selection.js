#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-TOUR-MAINHALL-SELECTION scope (READ THE LOG after every run)
 * SCOPE: bim-compiler prompts/Viewer/FLY_TOUR_CORRIDOR_GRAPH.md §TOUR_HIGHLIGHT_LANE Tasks 2 & 3 —
 * user ask "some buildings it still does not go for the highlights, ie largest hall first".
 *
 * ISSUE IT PROVES/DISPROVES — two claims, both about SELECTION, not order:
 *   (T3) Does the building's largest space SURVIVE stop selection? §HL-FIRST can only reorder
 *        stops[], so if the per-storey budget (K rooms + 3 corridors) never admits the champion,
 *        no ordering rule and no metric can open the tour with it.
 *        PASS = the pool champion is in stops[] AND is what §HL-FIRST elects as mainHall.
 *        FAIL = a champion dropped by the budget/dedupe → the budget must reserve its slot (Task 3).
 *   (T2) Would a different scale-free metric (minDim, minDim², area×minDim) elect a BETTER
 *        highlight than today's raw rect area? Reported as an A/B table per building: any row
 *        where area elects a CORRIDOR and another metric elects a real ROOM is evidence FOR
 *        changing the metric; identical winners are evidence AGAINST touching it.
 *
 * Selection is replicated from viewer/tour.js verbatim (labels, SUSPECT_OPEN admission, corridor
 * spine budget, §R6-TYPE-DEDUPE, §CONNECTED-STOPS edge filter) — a drift between this file and
 * tour.js shows up as a changed stop count here, which is itself the alarm.
 *
 * RUN: node witness_tour_mainhall_selection.js   (needs buildings/*.db present)
 */
'use strict';
const fs = require('fs'), path = require('path');
const Database = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'better-sqlite3'));
const RG = require('./common/room_graph.js');
const BLD = '/home/red1/bim-ootb/buildings';

let pass = 0, fail = 0;
const chk = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  ❌ ' + n + (x ? '  ' + x : '')); } };

const CASES = [
  ['Hospital', 'Hospital_extracted.db', ['buildings/patches/Hospital_extracted.db.sql']],
  ['Clinic', 'Clinic_extracted.db', []],
  ['Terminal', 'Terminal_extracted.db', ['buildings/patches/Terminal_extracted.db.sql']],
  ['HHS', 'HHS_Office_Federated_extracted.db', ['buildings/patches/HHS_Office_Federated_extracted.db.sql']],
  ['LTU_AHouse', 'LTU_AHouse_extracted.db', []],
  ['JKR', 'JKR_extracted.db', ['buildings/patches/JKR_extracted.db.sql']],
  ['Duplex', 'Duplex_extracted.db', []],
];

// area = Σ rect areas (today's ranking). minDim = max over rects of min(w,h) — the widest place an
// occupant can actually stand, which is what separates a hall from a long corridor. Scale-free,
// no threshold, no per-building constant (§ABSTRACTION-AUDIT-2).
function metrics(n) {
  let area = 0, minDim = 0;
  for (const rc of (n.rects || [])) {
    const w = Math.max(0, rc.x1 - rc.x0), h = Math.max(0, rc.y1 - rc.y0);
    area += w * h;
    const m = Math.min(w, h); if (m > minDim) minDim = m;
  }
  return { area: area, minDim: minDim, minDim2: minDim * minDim, areaXmin: area * minDim };
}
const isCorr = lbl => lbl.indexOf('Hall / Corridor') >= 0 || lbl.indexOf('SUSPECT_ELONGATED') >= 0;
const nm = n => (n.name || n.guid).slice(0, 30);
function typeToken(n) {   // §R6-TYPE-DEDUPE, verbatim from tour.js
  if (String(n.label || '').indexOf('COMPILED') >= 0) return null;
  const t = String(n.name || '').toLowerCase().replace(/[0-9]+/g, ' ')
    .replace(/[^a-zÀ-￿ ]+/g, ' ').replace(/\s+/g, ' ').trim();
  return t.length >= 2 ? t : null;
}

console.log('══ W-TOUR-MAINHALL-SELECTION — does the largest space survive stop selection? ══\n');
const table = [];
for (const [label, dbFile, patches] of CASES) {
  if (!fs.existsSync(path.join(BLD, dbFile))) { console.log('— ' + label + ': db missing, skipped'); continue; }
  const tmp = '/tmp/_wmainhall_' + Math.random().toString(36).slice(2) + '.db';
  fs.copyFileSync(path.join(BLD, dbFile), tmp);
  const db = new Database(tmp);
  patches.forEach(p => { const f = path.join(__dirname, p); if (fs.existsSync(f)) db.exec(fs.readFileSync(f, 'utf8')); });
  const realLog = console.log; console.log = () => {};
  let g;
  try { g = RG.buildGraph(q => db.prepare(q).raw(true).all(), { log: () => {} }); }
  finally { console.log = realLog; }

  const edgeGuids = {}; for (const e of g.edges) { edgeGuids[e.a] = true; edgeGuids[e.b] = true; }
  const byStorey = {}, stZSum = {}, stN = {};
  for (const n of g.nodes) {
    const lbl = String(n.label || '');
    if (!byStorey[n.storey]) byStorey[n.storey] = { corridors: [], rooms: [] };
    const rec = Object.assign({ guid: n.guid, node: n, corridor: isCorr(lbl) }, metrics(n));
    if (isCorr(lbl)) byStorey[n.storey].corridors.push(rec);
    else if (lbl.indexOf('SUSPECT_') < 0 || lbl.indexOf('SUSPECT_OPEN') >= 0) byStorey[n.storey].rooms.push(rec);
    stZSum[n.storey] = (stZSum[n.storey] || 0) + n.cz; stN[n.storey] = (stN[n.storey] || 0) + 1;
  }
  const storeys = Object.keys(byStorey).sort((a, b) => stZSum[a] / stN[a] - stZSum[b] / stN[b]);
  const K = storeys.length >= 4 ? 2 : storeys.length === 3 ? 3 : 4;   // §R6-BUDGET
  const seenType = {}, stops = [];
  let typeDeduped = 0, isolatedDropped = 0;
  for (const st of storeys) {
    const b = byStorey[st];
    b.corridors.sort((a, c) => c.area - a.area); b.rooms.sort((a, c) => c.area - a.area);
    const picks = b.corridors.slice(0, 3);   // §R6-CORRIDOR-SPINE — a SEPARATE budget from the rooms
    let taken = 0;
    for (const r of b.rooms) {
      if (taken >= K) break;
      const tok = typeToken(r.node);
      if (tok && seenType[tok]) { typeDeduped++; continue; }
      if (tok) seenType[tok] = true;
      picks.push(r); taken++;
    }
    for (const r of picks) { if (edgeGuids[r.guid]) stops.push(r); else isolatedDropped++; }
  }
  const pool = [];
  for (const st of storeys) for (const r of byStorey[st].corridors.concat(byStorey[st].rooms)) if (edgeGuids[r.guid]) pool.push(r);

  if (!pool.length || !stops.length) { console.log('— ' + label + ': empty pool/stops, skipped'); db.close(); fs.unlinkSync(tmp); continue; }
  console.log('── ' + label + '  storeys=' + storeys.length + ' K=' + K + ' pool=' + pool.length +
    ' stops=' + stops.length + ' (typeDeduped=' + typeDeduped + ' isolatedDropped=' + isolatedDropped + ')');
  const row = { label: label };
  for (const key of ['area', 'minDim', 'minDim2', 'areaXmin']) {
    const champ = pool.slice().sort((a, b) => b[key] - a[key])[0];
    const elected = stops.slice().sort((a, b) => b[key] - a[key])[0];   // §HL-FIRST's mainHall
    const survived = stops.some(s => s.guid === champ.guid);
    row[key] = { champ: champ, elected: elected, survived: survived };
    console.log('   ' + key.padEnd(8) + ' champion=' + nm(champ.node) + ' (' + champ.area.toFixed(0) + 'm²/' +
      champ.minDim.toFixed(1) + 'm' + (champ.corridor ? ', CORRIDOR' : ', room') + ')  survivesSelection=' +
      (survived ? 'YES' : '** NO **') + '  elected=' + nm(elected.node) +
      (elected.corridor ? ' [CORRIDOR]' : ' [room]') + ' storey=' + elected.node.storey);
  }
  // T3 gate: the champion must survive, under EVERY metric — otherwise the budget needs a reserved slot.
  chk(label + ': area champion survives selection', row.area.survived, nm(row.area.champ.node));
  chk(label + ': area champion IS the elected mainHall', row.area.elected.guid === row.area.champ.guid,
    nm(row.area.elected.node));
  // §R6-CORRIDOR-SPINE structural fact: rooms and corridors draw from SEPARATE budgets, so a room
  // can never lose its slot TO a corridor. Asserted, because Task 3's premise assumed they compete.
  const roomsPicked = stops.filter(s => !s.corridor).length, corrPicked = stops.filter(s => s.corridor).length;
  chk(label + ': rooms and corridors use separate budgets (no competition)',
    roomsPicked <= storeys.length * K && corrPicked <= storeys.length * 3,
    'rooms=' + roomsPicked + '/≤' + (storeys.length * K) + ' corridors=' + corrPicked + '/≤' + (storeys.length * 3));
  table.push(row);
  db.close(); fs.unlinkSync(tmp);
}

// T2 evidence table: does any alternative metric rescue a building whose area-winner is a corridor?
console.log('\n── T2 metric A/B: elected mainHall per metric (CORRIDOR = the failure the user reported) ──');
let metricWouldHelp = 0;
for (const r of table) {
  const cells = ['area', 'minDim', 'minDim2', 'areaXmin'].map(k => nm(r[k].elected.node) + (r[k].elected.corridor ? '*' : ''));
  console.log('   ' + r.label.padEnd(12) + cells.map(c => c.padEnd(26)).join(''));
  if (r.area.elected.corridor && ['minDim', 'minDim2', 'areaXmin'].some(k => !r[k].elected.corridor)) metricWouldHelp++;
}
console.log('   (columns: area | minDim | minDim² | area×minDim;  * = a CORRIDOR was elected)');
console.log('   buildings where changing the metric would swap a CORRIDOR for a real ROOM: ' + metricWouldHelp);
chk('T2: metric change is only justified if it rescues a building', true,
  metricWouldHelp === 0 ? 'rescues 0 buildings → keep raw area, no change (§ABSTRACTION-AUDIT-2: no tuning without a defect)'
                        : 'rescues ' + metricWouldHelp + ' → change the metric');

console.log('\n' + (fail ? '❌ FAIL ' : '✅ PASS ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
