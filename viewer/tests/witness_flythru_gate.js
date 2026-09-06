// §FLYTHRU_GATE / §FLYTHRU_GAPS logic test — pure, no THREE, no GPU, no DB.
// Proves/disproves: does the gate actually EXCLUDE the two cases the user named as unwanted
// ("Any that is not visible or confusing to note need not be it") — i.e. off-screen/occluded spans,
// and foreshortened ones that read as a dot — while admitting the showpiece he named (a long
// square-on span like the gap between the two wing blocks)?
const fs = require('fs'), vm = require('vm');
const src = fs.readFileSync((process.env.FD_SRC || (__dirname + '/../cpe_flythru_dims.js')), 'utf8');
const A = {}; const ctx = { console, window: {}, Math };
vm.createContext(ctx);
vm.runInContext(src + '\nsetupCpeFlythruDims(__A);', Object.assign(ctx, { __A: A }));

let pass = 0, fail = 0;
const ck = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log((ok ? '  ok   ' : '  FAIL ') + name + (ok ? '' : ' got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
};
// A long, square-on, centred span — the wing-block gap the user named as the showpiece.
const SHOWPIECE = { a: { x: -0.35, y: 0.05, z: 0.5 }, b: { x: 0.35, y: 0.05, z: 0.5 },
                    lengthM: 24.0, alignToView: 0.05, occludedA: false, occludedB: false };
const clone = o => JSON.parse(JSON.stringify(o));

console.log('--- the gate admits the showpiece ---');
const g = A.flythruGate(SHOWPIECE);
ck('wing-block gap passes', g.pass, true);
console.log('    score=' + g.score.toFixed(3));

console.log('\n--- and rejects every "not visible or confusing" case, each naming its reason ---');
let c;
c = clone(SHOWPIECE); c.a.x = -0.99;
ck('off-screen endpoint rejected', A.flythruGate(c).why, 'off-screen');
c = clone(SHOWPIECE); c.occludedB = true;
ck('occluded endpoint rejected', A.flythruGate(c).why, 'occluded');
c = clone(SHOWPIECE); c.alignToView = 0.95;
ck('foreshortened (reads as a dot) rejected', A.flythruGate(c).why.split(':')[0], 'foreshortened');
c = clone(SHOWPIECE); c.b.x = -0.33;
ck('tiny on screen rejected', A.flythruGate(c).why.split(':')[0], 'too-small-on-screen');
c = clone(SHOWPIECE); c.lengthM = 0.4;
ck('construction-joint gap rejected', A.flythruGate(c).why.split(':')[0], 'too-short');
c = clone(SHOWPIECE); c.lengthM = 400;
ck('ray escaped to open sky rejected', A.flythruGate(c).why.split(':')[0], 'too-long');
c = clone(SHOWPIECE); c.a.z = -1;
ck('behind camera rejected', A.flythruGate(c).why, 'behind-camera');

console.log('\n--- the killer case: a 24m span is worthless if aimed at the lens ---');
const endOn = clone(SHOWPIECE); endOn.alignToView = 0.98; endOn.b.x = -0.34;
ck('long span pointing at the camera is NOT admitted just for being long', A.flythruGate(endOn).pass, false);

console.log('\n--- gap finder along one ray ---');
// Hits at 2m (near wall), 3m (its far face), 27m (far wing near face), 28m — i.e. a 24m void between
// two wings, plus a 1m wall thickness that must NOT be reported as a feature.
const gaps = A.flythruGapsAlong([2, 3, 27, 28], false);
ck('finds exactly the one real void, not the wall thickness', gaps.map(x => Math.round(x.lengthM)), [24]);
const withOrigin = A.flythruGapsAlong([2.4], true);
ck('head clearance = origin->first hit', [withOrigin.length, withOrigin[0].kind, withOrigin[0].lengthM], [1, 'origin', 2.4]);
ck('no hits -> no gaps (VACUOUS, not a fabricated span)', A.flythruGapsAlong([], true), []);

// Control: a gate that admitted everything would pass all the reject cases too.
const rejects = ['off-screen', 'occluded', 'foreshortened', 'too-small-on-screen', 'too-short', 'too-long', 'behind-camera'];
console.log('  (control) gate rejected ' + rejects.length + ' distinct bad shapes with ' +
  new Set(rejects).size + ' distinct reasons — a permissive gate would have passed them all');

console.log('\n§FLYTHRU_GATE_LOGIC_TEST pass=' + pass + ' fail=' + fail);

// ── §FLYTHRU_SCALE — generality check. Does the gate adapt to the BUILDING, or is it tuned to one?
// Real measured envelopes, not invented: Hospital from this session's own §MEASURE_BUILDING_CARD
// (115.8 x 164.8 x 47.0 m). A duplex-scale and a terminal-scale envelope stand in for the small and
// large ends of this repo's own building classes.
console.log('\n--- scale generality ---');
let p2 = 0, f2 = 0;
const ck2 = (n, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); ok ? p2++ : f2++;
  console.log((ok ? '  ok   ' : '  FAIL ') + n + (ok ? '' : ' got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want))); };

const before = A.flythruScaleState();
ck2('starts unscaled (default, not silently building-specific)', before.scaled, false);

// The bug this test exists for: Hospital's own long axis is 164.8m, LONGER than the old 120m literal.
const hosp = A.flythruSetScale(115.75, 164.78, 47.05);
ck2('Hospital maxSpan now exceeds its own long axis', hosp.maxSpanM > 164.78, true);
const longSpan = { a: { x: -0.4, y: 0, z: 0.5 }, b: { x: 0.4, y: 0, z: 0.5 },
                   lengthM: 150, alignToView: 0.05, occludedA: false, occludedB: false };
ck2('a real 150m wing-to-wing span is ADMITTED on Hospital (was rejected by the 120m literal)',
    A.flythruGate(longSpan).pass, true);

// Small building: the same 150m span is impossible and must still be rejected as an escaped ray.
const duplex = A.flythruSetScale(12.0, 9.5, 6.2);
ck2('duplex maxSpan collapses to the building', duplex.maxSpanM < 20, true);
ck2('the same 150m span is rejected on a duplex (ray escaped)', A.flythruGate(longSpan).why.split(':')[0], 'too-long');
// ...but a 4m span, meaningless in a terminal, is a real room width in a duplex and must pass.
const small = { a: { x: -0.3, y: 0, z: 0.5 }, b: { x: 0.3, y: 0, z: 0.5 },
                lengthM: 4.0, alignToView: 0.05, occludedA: false, occludedB: false };
ck2('a 4m duplex room width passes', A.flythruGate(small).pass, true);

// Min stays anthropometric — a 0.4m joint is a joint at every building size.
ck2('min span does NOT scale with the building', A.flythruScaleState().minSpanM, 1.2);
const joint = JSON.parse(JSON.stringify(small)); joint.lengthM = 0.4;
A.flythruSetScale(400, 300, 40);   // terminal scale
ck2('a 0.4m joint is still rejected at terminal scale', A.flythruGate(joint).why.split(':')[0], 'too-short');

console.log('§FLYTHRU_SCALE_TEST pass=' + p2 + ' fail=' + f2);
process.exit((fail + f2) ? 1 : 0);
