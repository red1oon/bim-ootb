// witness_ew_cutfill.js — Implementing CIVIL_HIGHWAY_JELAPANG.md §INSPECT_EARTH_ROAD E1/E6.
// Issue it proves/disproves: the inferred cut/fill classifier follows the user's rule (ground above road both sides = CUT,
// below both sides = FILL, mixed = SIDE-HILL), never tints a cell with road on it, reports NO-GROUND instead of guessing,
// the Inspect EW/RW panels list exactly the declared rows with ONE live feature, and a non-civil model gets nothing.
// Numbers only (no look-test). Run: node viewer/tests/witness_ew_cutfill.js
'use strict';
const fs = require('fs'), path = require('path');
const { setupEarthworksOverlay } = require('../earthworks_overlay.js');
let pass = 0, fail = 0;
function ok(c, label, extra) { (c ? pass++ : fail++); console.log('§EW_WIT ' + (c ? 'PASS' : 'FAIL') + ' ' + label + (extra ? ' ' + extra : '')); }

// pure core via a stub A (non-civil: only to reach the hook)
const A = { db: null }; setupEarthworksOverlay(A);
const infer = A._ewInfer;
const cfg = { station_m: 10, step_m: 3, reach_max_m: 60, tol_m: 0.3 };
const route = s => ({ x: s, z: 0, tx: 1, tz: 0 });               // straight road along +x, normal = (0, ±1)
const roadAt = () => 100;                                         // road top 100 m
const noRoad = () => null;
function run(groundFn, roadFn) { return infer(route, 100, roadAt, groundFn, roadFn || noRoad, cfg); }
const lat = z => Math.abs(z);

// 1 CUT: slope rising away on both sides (ground above road)
let r = run((x, z) => 100 + 0.5 * lat(z) + 1);
ok(r.grid.every(g => g.kind === 'CUT'), 'CUT when ground is above the road on both sides', 'kinds=' + [...new Set(r.grid.map(g => g.kind))]);
// independent recompute of cut volume: every cell has md = mean of its 4 corner d; |d|*step*ds
let exp = 0, nx = cfg.station_m;
for (let i = 0; i + 1 < r.stations; i++) [1, -1].forEach(() => { const K = cfg.reach_max_m / cfg.step_m; for (let k = 1; k < K; k++) { const d0 = 1 + 0.5 * (k * 3), d1 = 1 + 0.5 * ((k + 1) * 3); exp += ((d0 + d1) / 2) * 3 * nx; } });
ok(Math.abs(r.vols.cut - exp) < 1e-6 * exp + 1e-6 && r.vols.fill === 0, 'cut volume equals independent recompute', 'got=' + r.vols.cut.toFixed(1) + ' exp=' + exp.toFixed(1));

// 2 FILL: ground falls away both sides
r = run((x, z) => 100 - 0.3 * lat(z) - 1);
ok(r.grid.every(g => g.kind === 'FILL') && r.vols.cut === 0 && r.vols.fill > 0, 'FILL when ground is below the road on both sides', 'fill=' + r.vols.fill.toFixed(1));

// 3 SIDE-HILL: high on +z, low on -z
r = run((x, z) => z > 0 ? 100 + 0.5 * z + 1 : 100 - 0.3 * lat(z) - 1);
ok(r.grid.every(g => g.kind === 'SIDE-HILL') && r.vols.cut > 0 && r.vols.fill > 0, 'SIDE-HILL splits cut (high side) and fill (low side)', 'cut=' + r.vols.cut.toFixed(0) + ' fill=' + r.vols.fill.toFixed(0));

// 4 road cells never tinted: road under |z|<=6 -> no cell with a road corner is produced
r = run((x, z) => 100 + 0.5 * lat(z) + 1, (x, z) => lat(z) <= 6 ? 100 : null);
ok(r.cells.length > 0 && r.cells.every(c => c.p.every(v => !v.onRoad)), 'no tinted cell touches a road corner', 'cells=' + r.cells.length + ' offRoadOnly=true');
const maxNear = Math.min(...r.cells.map(c => Math.min(...c.p.map(v => lat(v.z)))));
ok(maxNear >= 6, 'nearest tinted lateral offset is outside the road mask', 'minOffset=' + maxNear);

// 5 NO-GROUND: no ground anywhere -> reported, zero volume, zero cells (never invented)
r = run(() => null);
ok(r.grid.every(g => g.kind === 'NO-GROUND') && r.cells.length === 0 && r.vols.cut === 0 && r.vols.fill === 0, 'NO-GROUND reported, nothing invented');

// 6 daylight: fill ground meets road level at 9 m -> tint stops there
r = run((x, z) => 100 - Math.max(0, 1.2 - 0.0) * 0 - Math.max(0, (9 - lat(z))) * 0.5 - (lat(z) >= 9 ? 0 : 0));
const far = r.cells.length ? Math.max(...r.cells.map(c => Math.max(...c.p.map(v => lat(v.z))))) : 0;
ok(far <= 9 + 1e-9, 'tint stops at daylight (ground meets road level)', 'maxOffset=' + far);

// 6b REGRESSION (live 2026-10-09: CUT 0 m3 on a road running through a hill): a LEVEL shoulder at road height followed by a rising cut slope must be CUT, not AT-GRADE
r = run((x, z) => lat(z) <= 6 ? 100 : 100 + 0.8 * (lat(z) - 6));
ok(r.grid.every(g => g.kind === 'CUT') && r.vols.cut > 0, 'level shoulder then rising slope = CUT (flat shoulder is not daylight)', 'cut=' + r.vols.cut.toFixed(0));
r = run((x, z) => lat(z) <= 6 ? 100 : 100 - 0.5 * (lat(z) - 6));
ok(r.grid.every(g => g.kind === 'FILL') && r.vols.fill > 0, 'level shoulder then falling slope = FILL', 'fill=' + r.vols.fill.toFixed(0));
r = run((x, z) => 100);
ok(r.grid.every(g => g.kind === 'AT-GRADE') && r.cells.length === 0, 'fully level ground = AT-GRADE, no tint');

// 6c REGRESSION (live 2026-10-09: only 1 cut found): terrain has a HOLE along the road corridor (no ground for |z|<12) -> must scan past it to the first ground
r = run((x, z) => lat(z) < 12 ? null : 100 + 0.8 * (lat(z) - 11));
ok(r.grid.every(g => g.kind === 'CUT') && r.vols.cut > 0, 'terrain hole at the corridor then rising ground = CUT (null ground is not the end)', 'cut=' + r.vols.cut.toFixed(0));
r = run((x, z) => lat(z) < 12 ? null : 100 - 0.5 * (lat(z) - 11));
ok(r.grid.every(g => g.kind === 'FILL') && r.vols.fill > 0, 'terrain hole then falling ground = FILL', 'fill=' + r.vols.fill.toFixed(0));

// 7 reach cap
r = run((x, z) => 100 + 1 + 0.5 * lat(z));
const mx = Math.max(...r.cells.map(c => Math.max(...c.p.map(v => lat(v.z)))));
ok(mx <= cfg.reach_max_m + 1e-9, 'tint never exceeds reach_max_m', 'maxOffset=' + mx);

// 8 panels: declared rows + exactly ONE live feature (EW), RW all pending
const rs = A._ewRowSets;
ok(rs.ew.length === 5 && rs.rw.length === 6 && rs.ew.concat(rs.rw).every(x => /PENDING|DEFERRED/.test(x[1])), 'EW lists 5 pending + Cut&Fill live; RW lists 6, none live', 'ew=' + rs.ew.length + ' rw=' + rs.rw.length);
const panels = fs.readFileSync(path.join(__dirname, '..', 'panels.js'), 'utf8');
const ewRow = /id: 'ew',[^}]*civilOnly: true/s.test(panels), rwRow = /id: 'rw',[^}]*civilOnly: true/s.test(panels);
ok(ewRow && rwRow && /'roadreport', 'ew', 'rw', 'clash'/.test(panels), 'Inspect drawer has EW + RW rows, civil-only', 'ew=' + ewRow + ' rw=' + rwRow);

// 9 non-civil gate: nothing happens, nothing added
let addCalls = 0; const B = { db: {}, isCivilModel: () => false, scene: { add: () => addCalls++ }, createPanel: () => { throw new Error('panel on building'); } };
setupEarthworksOverlay(B);
ok(B.showEarthworksPanel() === null && B.showRoadworksPanel() === null && addCalls === 0, 'non-civil model: no panel, no mesh (VACUOUS)');

// 10 colours: cut != fill, fill is not green-dominant
const sv = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'std_values.json'), 'utf8'))._cut_fill;
const h = x => [1, 3, 5].map(i => parseInt(x.slice(i, i + 2), 16));
const cc = h(sv.color_cut), fc = h(sv.color_fill);
ok(sv.color_cut !== sv.color_fill && fc[2] > fc[1] && fc[2] > fc[0] && cc[0] > cc[2], 'std_values colours: cut orange-ish (R dominant), fill blue-ish (B dominant, not green)', sv.color_cut + ' / ' + sv.color_fill);

console.log('§EW_WIT_SUMMARY pass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);
