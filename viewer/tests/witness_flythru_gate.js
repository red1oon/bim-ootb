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
process.exit(fail ? 1 : 0);
