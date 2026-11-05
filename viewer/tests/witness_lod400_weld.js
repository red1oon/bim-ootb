#!/usr/bin/env node
// ⚠ DO NOT REMOVE — WITNESS §LOD_WELD (bim-compiler prompts/LOD400_UPGRADER.md §H). Read the log after every run.
// ISSUE: flat-shaded unindexed triangle soups waste ~70-80 % of vertices. GREEN = weld+smooth keeps triangle count, area and bbox, cuts verts,
// keeps hard edges (a cube stays 24 verts = 3 normals per corner), smooths a cylinder, and refuses to report PASS on an empty population.
'use strict';
const L = require('../lod400_upgrade.js');
const checks = []; const ok = (n, v, d) => { checks.push(!!v); console.log('  ' + (v ? 'PASS ' : 'FAIL ') + n + (d ? '  ' + d : '')); };
function soup(P, T) { const V = []; T.forEach(t => t.forEach(i => V.push(...P[i]))); return { V: new Float32Array(V), F: Uint32Array.from(T.flat().map((_, i) => i)) }; }
const bb = V => { const m = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9]; for (let i = 0; i < V.length; i += 3) for (let k = 0; k < 3; k++) { m[k] = Math.min(m[k], V[i + k]); m[k + 3] = Math.max(m[k + 3], V[i + k]); } return m; };
// cube
const cp = [[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]], cq = [[0,3,2,1],[4,5,6,7],[0,1,5,4],[2,3,7,6],[1,2,6,5],[3,0,4,7]], ct = []; cq.forEach(q => { ct.push([q[0],q[1],q[2]], [q[0],q[2],q[3]]); });
const c = soup(cp, ct), wc = L.weldSmooth(c.V, c.F, 40);
ok('cube: 12 tris kept, hard edges kept (24 verts = 3 normals per corner)', wc.stats.tris === 12 && wc.stats.vAfter === 24, 'verts ' + wc.stats.vBefore + '->' + wc.stats.vAfter);
// cylinder (64 sides, 2 rings of caps omitted: open tube)
const n = 64, cyl = [], cT = []; for (let k = 0; k < n; k++) { const a = 2 * Math.PI * k / n; cyl.push([Math.cos(a) * .025, Math.sin(a) * .025, 0], [Math.cos(a) * .025, Math.sin(a) * .025, 1]); }
for (let k = 0; k < n; k++) { const a = 2 * k, b = 2 * ((k + 1) % n); cT.push([a, b, b + 1], [a, b + 1, a + 1]); }
const y = soup(cyl, cT), wy = L.weldSmooth(y.V, y.F, 40);
const area = L.triArea(y.V, y.F), area2 = L.triArea(wy.V, wy.F), b0 = bb(y.V), b1 = bb(wy.V);
ok('cylinder: tris kept, area drift < 1e-6, bbox identical', wy.stats.tris === y.F.length / 3 && Math.abs(area - area2) / area < 1e-6 && b0.every((v, i) => Math.abs(v - b1[i]) < 1e-7));
ok('cylinder: vertices cut >= 60 % (' + wy.stats.vBefore + '->' + wy.stats.vAfter + ')', wy.stats.vAfter <= 0.4 * wy.stats.vBefore);
let radial = 0; for (let i = 0; i < wy.V.length; i += 3) { const r = Math.hypot(wy.V[i], wy.V[i + 1]) || 1; radial = Math.max(radial, Math.abs((wy.N[i] * wy.V[i] + wy.N[i + 1] * wy.V[i + 1]) / r - 1)); }
ok('cylinder: smooth normals point radially (max deviation < 0.01)', radial < 0.01, 'dev=' + radial.toFixed(5));
// db level: empty population must say INCONCLUSIVE, not PASS
let logged = ''; const ol = console.log; console.log = s => { logged += s + '\n'; };
const fake = { exec: q => /sqlite_master/.test(q) ? [] : [], run() {} }; const r = L.upgradeDb(fake, {}); console.log = ol;
ok('empty DB: nothing welded and the log says INCONCLUSIVE', r.geoms === 0 && /INCONCLUSIVE/.test(logged));
const f = checks.filter(x => !x).length; console.log('§WITNESS_LOD_WELD ' + (f ? 'FAIL ' : 'PASS ') + (checks.length - f) + '/' + checks.length); process.exit(f ? 1 : 0);
