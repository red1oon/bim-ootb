// W-SOLID (prompts/DXF2BIM_MODELLER_LANE.md §L24): the shared solid helper (dxf2prep Solid) replaced three private copies. Issue: a changed box topology/winding silently flips
// normals or volumes of every door, section member and slab. Read the log.
const P = require('../dxf2prep.js'), S = P.Solid; let fail = 0; const ok = (n, c, i) => { console.log((c ? 'PASS ' : 'FAIL ') + n + (i ? '  ' + i : '')); if (!c) fail++; };
const ring = (x0, y0, x1, y1, z) => [[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]];
const cube = (x0, y0, z0, x1, y1, z1) => ring(x0, y0, x1, y1, z0).concat(ring(x0, y0, x1, y1, z1));
const m = S.box(cube(0, 0, 0, 2, 3, 4));
ok('SO1 a 2x3x4 box has volume +24 and 12 triangles', Math.abs(S.vol(m) - 24) < 1e-9 && m.faces.length === 12, 'vol=' + S.vol(m));
const mirrored = S.box(cube(2, 0, 0, 0, 3, 4));   // corners mirrored (a negative-volume input order)
ok('SO2 mirrored corner order still comes out outward (volume +24)', Math.abs(S.vol(mirrored) - 24) < 1e-9, 'vol=' + S.vol(mirrored));
const flipped = { vertices: m.vertices, faces: m.faces.map(f => [f[0], f[2], f[1]]) };
ok('SO3 FALSIFIER: a flipped winding is seen as negative volume, and outward() repairs it', S.vol(flipped) < 0 && S.vol(S.outward(flipped)) > 0);
const a = S.box(cube(0, 0, 0, 1, 1, 1)), b = S.box(cube(0, 0, 0, 1, 1, 1));
a.faces[0][0] = 99; ok('SO4 every box gets its own face array (no shared mutable BOX)', b.faces[0][0] === 4 && S.BOX[0][0] === 4);
console.log('SUMMARY fail=' + fail); process.exit(fail ? 1 : 0);
