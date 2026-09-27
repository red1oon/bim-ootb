#!/usr/bin/env node
// WITNESS — z8_shell_reach: §ZERO Z8 (bim-compiler prompts/PHOTOREAL_STILL_RENDER.md "### Z8 SPEC", B1 reach note).
//
// ISSUE THIS PROVES OR DISPROVES: §SKY_SHELL_RAYS (B1) re-computes F only for wall-side covered cells within 2 cells of open air, so a
// facade under a deeper overhang keeps the lattice's under-read (red1's aerial: cells 9911662/3, nearest open r = 3, F 0.07/0.06 vs
// truth 0.43/0.40; reach_r2_*_dist.log: under-reads at every r = 3..8). Z8 replaces the radius with a radius-free rule: a wall-side
// covered cell joins the shell when it is within 2 cells of open air (B1) OR the lattice's own sweep reached the sky through AIR only
// (vt === 1) in at least one direction. This witness runs the REAL light_zones.js field() over a synthetic grid (a wall with a
// 5-cell-deep overhang in front and a closed room behind it lit only by a glass skylight) and proves:
//   Z8-1 facade cells at reach 5 (beyond B1's radius) are selected under 'air', NOT under 'r2' (= the B1 rule reproduced exactly);
//   Z8-2 a wall-side room cell that sees sky only THROUGH GLASS is not selected (precondition F > 0 checked, else INCONCLUSIVE);
//   Z8-3 a wall-side cell with F = 0 far from open air is not selected (precondition F = 0 checked);
//   Z8-4 the 'r2' arm selects exactly the near2 set and airOnly = 0; the fingerprint token differs between arms;
//   Z8-5 the §SKY_SHELL_RAYS line carries reach= candidates= near2= airOnly= (the GPU harness greps these).
// It does NOT prove the F values after the exact rays (no BVH in node) — the GPU harness row Z8 (cells 9911662/3, reachdist) does.
// redControl: glass made fully clear (T = 1, i.e. the air test degenerates to 'any sky') must select the skylit room cell -> FAIL.
// Prints INCONCLUSIVE (never PASS) if light_zones.js cannot be loaded or a precondition fails.
//
// Command: node viewer/tests/witness_z8_shell_reach.js
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const V = path.join(__dirname, '..');
let LZ = null;
const logs = [];
try {
  const win = { location: { search: '' } }; win.window = win;
  const con = { log: (s) => logs.push(String(s)), warn: (s) => logs.push(String(s)) };
  vm.runInNewContext(fs.readFileSync(path.join(V, 'light_zones.js'), 'utf8'), { window: win, console: con, location: win.location, performance: { now: () => Date.now() } });
  LZ = win.LightZones;
} catch (e) { console.log('    (light_zones.js sandbox load failed: ' + e.message + ')'); }
if (!LZ || !LZ._testField || !LZ.shellReach) { console.log('§WITNESS_Z8_SHELL_REACH INCONCLUSIVE missing: LightZones._testField / shellReach'); process.exitCode = 2; return; }

const SOLID = LZ.SOLID, nx = 20, ny = 12, nz = 16, nxy = nx * ny, N = nxy * nz;
const at = (i, j, k) => i + j * nx + k * nxy;
function grid(glassT) {
  const zone = new Uint16Array(N), gT = new Uint8Array(N);
  for (let c = 0; c < N; c++) zone[c] = 0;                                  // open sky everywhere, then build
  for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) zone[at(i, 0, k)] = SOLID;   // ground slab j = 0 (groundJ = 1)
  for (let j = 1; j <= 8; j++) for (let k = 0; k < nz; k++) { zone[at(8, j, k)] = SOLID; zone[at(14, j, k)] = SOLID; }   // wall i = 8, back wall i = 14
  for (let j = 1; j <= 8; j++) for (let i = 8; i <= 14; i++) { zone[at(i, j, 1)] = SOLID; zone[at(i, j, 14)] = SOLID; }  // room side walls k = 1, 14
  for (let i = 3; i <= 14; i++) for (let k = 0; k < nz; k++) zone[at(i, 8, k)] = SOLID;  // roof j = 8, overhang i = 3..7 (5 cells deep)
  zone[at(9, 8, 8)] = SOLID; gT[at(9, 8, 8)] = glassT;                     // skylight over the wall-side room cell column i = 9, k = 8
  for (let j = 1; j <= 7; j++) for (let k = 0; k < nz; k++) for (let i = 3; i <= 7; i++) zone[at(i, j, k)] = 1;   // covered exterior (under the overhang)
  for (let j = 1; j <= 7; j++) for (let k = 2; k <= 13; k++) for (let i = 9; i <= 13; i++) zone[at(i, j, k)] = 2;  // the closed room
  for (let j = 1; j <= 7; j++) for (let i = 9; i <= 13; i++) { zone[at(i, j, 0)] = 1; zone[at(i, j, 15)] = 1; }   // covered strips outside the side walls
  return { bld: 'Z8SYN', nx, ny, nz, cell: 0.5, org: { x: 0, y: 0, z: 0 }, zone, glassT: gT, groundJ: 1, zones: 2,
    zoneInfo: [{ surfaceM2: 40, apertureM2: 2 }, { surfaceM2: 60, apertureM2: 1 }] };
}
function run(reach, glassT) {
  logs.length = 0;
  const A = { activeBuilding: 'Z8SYN', _stillGroundView: false, _shellTrace: true, _stillShellReach: reach === 'r2' ? 2 : undefined };
  const Z = grid(glassT), F = LZ._testField(A, Z);
  return { A, Z, F, sh: F.shell, line: logs.find(l => /§SKY_SHELL_RAYS/.test(l)) || '', rule: LZ.shellReach(A) };
}
const air = run('air', 200), r2 = run('r2', 200);
const Fof = (R, c) => R.F.G[c] / 10000, inAirOnly = (R, c) => R.sh.trace && R.sh.trace.airOnly.indexOf(c) >= 0, inShell = (R, c) => R.sh.trace && R.sh.trace.shell.indexOf(c) >= 0;
const facade = []; for (let j = 1; j <= 6; j++) for (let k = 0; k < nz; k++) facade.push(at(7, j, k));   // reach 5 from open air (i <= 2)
const skylit = at(9, 3, 8), deep = at(11, 2, 2);   // deep: beside the side wall k = 1, open air > 2 cells away on every side (the back wall at i = 14 has open air 2 cells behind it = B1 near2)
const pre = { skylitF: Fof(air, skylit), deepF: Fof(air, deep) };
console.log('    grid ' + nx + 'x' + ny + 'x' + nz + ' | air: candidates=' + air.sh.candidates + ' near2=' + air.sh.near2 + ' airOnly=' + air.sh.airOnly + ' shell=' + air.sh.cells +
  ' | r2: candidates=' + r2.sh.candidates + ' near2=' + r2.sh.near2 + ' airOnly=' + r2.sh.airOnly + ' shell=' + r2.sh.cells + ' | skylit F=' + pre.skylitF.toFixed(4) + ' deep F=' + pre.deepF.toFixed(4));
console.log('    log(air): ' + air.line.slice(0, 400));
if (!(pre.skylitF > 0) || pre.deepF !== 0 || !air.sh.trace) {
  console.log('§WITNESS_Z8_SHELL_REACH INCONCLUSIVE precondition: skylit cell must see glass sky (F ' + pre.skylitF + ' > 0) and the deep cell none (F ' + pre.deepF + ' = 0)');
  process.exitCode = 2; return;
}
const facadeMissAir = facade.filter(c => !inAirOnly(air, c)).length, facadeInR2 = facade.filter(c => inShell(r2, c)).length;
const rows = [];
function row(name, got, want, ok) { rows.push({ name, got: String(got), want: String(want), ok: !!ok }); }
row('Z8-1 facade cells at reach 5 selected by the air rule', 'missing ' + facadeMissAir + ' of ' + facade.length, 'missing 0', facadeMissAir === 0);
row('Z8-1 same facade cells NOT selected by r2 (B1 radius reproduced)', facadeInR2 + ' of ' + facade.length, '0', facadeInR2 === 0);
row('Z8-2 skylit (glass-only sky) wall-side room cell not selected', inShell(air, skylit), 'false', !inShell(air, skylit));
row('Z8-3 wall-side F=0 cell far from open air not selected', inShell(air, deep), 'false', !inShell(air, deep));
row('Z8-4 r2 arm: shell = near2 set, airOnly = 0', 'shell ' + r2.sh.cells + ' near2 ' + r2.sh.near2 + ' airOnly ' + r2.sh.airOnly, 'equal, 0', r2.sh.cells === r2.sh.near2 && r2.sh.airOnly === 0 && r2.sh.candidates === r2.sh.near2);
row('Z8-4 air arm keeps every near2 cell (monotone superset)', r2.sh.trace.shell.filter(c => !inShell(air, c)).length + ' lost', '0 lost', r2.sh.trace.shell.every(c => inShell(air, c)));
row('Z8-4 rule differs per arm (fingerprint token sr<rule>)', air.rule + ' / ' + r2.rule, 'air / r2', air.rule === 'air' && r2.rule === 'r2');
row('Z8-5 §SKY_SHELL_RAYS carries reach/candidates/near2/airOnly', /reach=air candidates=\d+ near2=\d+ airOnly=\d+/.test(air.line), 'true', /reach=air candidates=\d+ near2=\d+ airOnly=\d+/.test(air.line));
row('Z8-5 no BVH in node -> line says why (never a silent PASS of the ray pass)', /no BVH/.test(air.line), 'true', /no BVH/.test(air.line));
rows.forEach(r => console.log('    ' + (r.ok ? 'ok  ' : 'BAD ') + r.name + ': got ' + r.got + ' want ' + r.want));

const { Witness } = require('../../witness_kit/contract');
Witness('Z8_SHELL_REACH')
  .population(() => rows)
  .schema({ type: 'object', required: ['name', 'got', 'want', 'ok'], properties: { name: { type: 'string' }, got: { type: 'string' }, want: { type: 'string' }, ok: { type: 'boolean' } } })
  .invariant('every Z8 row holds', rs => rs.length >= 9 && rs.every(r => r.ok))
  .redControl(rs => {   // glass fully clear: the skylit cell's lattice path becomes vt === 1 -> the air rule selects it -> Z8-2 must fail
    const clear = run('air', 255), sel = inShell(clear, skylit);
    return rs.map(r => /Z8-2/.test(r.name) ? Object.assign({}, r, { got: String(sel), ok: !sel }) : r);
  })
  .run();
