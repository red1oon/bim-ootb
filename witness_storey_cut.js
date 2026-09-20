// Witness for §STOREY_SECTION_CUT's pure half: does the cut Z rise monotonically across the window,
// rest on the derived slab boundary during each hold, and cover the building exactly once?
// Issue it proves or disproves: "the cut plane sweeps the storey ladder correctly" — no THREE, no DOM.
// §129.60 (2026-09-20) — WAS `require('/tmp/wt-storey-cut/viewer/cpe_storey_reveal.js')`, an
// absolute path into a DIFFERENT SESSION'S WORKTREE. This witness has never tested the file in
// its own repo: it read whatever another branch happened to have on disk, and crashed outright
// once that worktree's copy diverged. Relative, like its sibling witness_storey_reveal_list.js.
const setup = require('./viewer/cpe_storey_reveal.js');
// Hospital's real storey means, QUERIED from Hospital_silent.db (md5 09e52e5d...), not estimated.
const Z = {"Level 1": 168.78, "Level 2": 174.76, "Level 3": 179.78, "Level 4": 184.67, "Level 5": 189.18, "Level 6": 193.56, "Level 7A": 197.22, "Level 7": 200.4};
const A = {
  activeBuilding: 'Hospital', _metaGen: 0,
  dbQuery(sql) {
    if (/spatial_structure/.test(sql)) return Object.keys(Z).map(n => [n]);
    if (/elements_meta m/.test(sql)) return Object.entries(Z).map(([n, z]) => [n, z]);
    if (/MAX\(center_z/.test(sql)) return [[203.65]];
    return [];
  },
};
setup(A);
const plan = { beats: { rise: 0.9590 }, storeyReveal: { on: true, windowFrac: 0.0513 } };
const winStart = plan.beats.rise - plan.storeyReveal.windowFrac;
let prev = -Infinity, bad = 0, holds = {};
const N = 400;
for (let i = 0; i <= N; i++) {
  const tn = winStart + (plan.beats.rise - winStart) * (i / N) + 1e-9;
  const c = A.storeyRevealCutAt(plan, tn);
  if (!c) continue;
  if (c.cutZ < prev - 1e-6) { bad++; console.log('NON-MONOTONIC at tn', tn.toFixed(5), c.cutZ, '<', prev); }
  prev = c.cutZ;
  if (c.phase === 'hold') (holds[c.storey] = holds[c.storey] || []).push(c.cutZ);
}
console.log('monotonic:', bad === 0 ? 'YES' : 'NO (' + bad + ' regressions)');
const names = Object.keys(Z);
for (const n of names) {
  const h = holds[n];
  if (!h) { console.log(`  ${n}: NO HOLD PHASE SEEN`); continue; }
  const lo = Math.min(...h), hi = Math.max(...h);
  const i = names.indexOf(n);
  const expect = i + 1 < names.length ? (Z[n] + Z[names[i + 1]]) / 2 : null;
  console.log(`  ${n}: holds at ${lo.toFixed(2)}..${hi.toFixed(2)}` +
    (expect !== null ? `  expected slab midpoint ${expect.toFixed(2)}  ${Math.abs(lo - expect) < 1e-6 ? 'MATCH' : 'MISMATCH'}` : '  (top storey, extrapolated)'));
}
const first = A.storeyRevealCutAt(plan, winStart + 1e-6);
const last = A.storeyRevealCutAt(plan, plan.beats.rise - 1e-9);
console.log('sweep starts at', first && first.cutZ.toFixed(2), '(below Level 1 mean', Z['Level 1'] + ')');
console.log('sweep ends at  ', last && last.cutZ.toFixed(2), '(above Level 7 mean', Z['Level 7'] + ')');
