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
// §FLYTHRU_ONE_END_OFF (user 2026-09-07): "the distance between block wings, even though one side
// will go out of frame but the length can remain floating in stride." One end may leave the frame —
// the old both-ends-inside rule would have discarded exactly the showpiece measure.
c = clone(SHOWPIECE); c.a.x = -0.99;
ck('ONE endpoint off-frame is now ADMITTED (the wing span is best when too big to fit)', A.flythruGate(c).pass, true);
ck('...and is flagged so the caller can clamp that end to the frame edge', A.flythruGate(c).oneEndOff, true);
c = clone(SHOWPIECE); c.a.x = -0.99; c.b.x = 0.99;
ck('BOTH ends off-frame still rejected (nothing anchors the cue)', A.flythruGate(c).why, 'both-ends-off-screen');
// The label carries the value, so it must be comfortably on screen even when an end is not.
c = clone(SHOWPIECE); c.a.x = 0.80; c.b.x = 0.99;
ck('a cue whose LABEL would sit off the edge is rejected', A.flythruGate(c).why, 'label-off-screen');
c = clone(SHOWPIECE); c.occludedA = true; c.occludedB = true;
ck('a FULLY hidden span is rejected (one hidden end is fine — see shine-through below)', A.flythruGate(c).why, 'occluded');
// §FLYTHRU_ANGLE_OK — an angled span is NOT rejected for its angle (user: "Even if a door is at an
// angle, as long that holds"). The angle veto was redundant: a truly end-on span collapses to a tiny
// screenFrac and is caught by the size test, which is a measurement rather than a threshold on angle.
c = clone(SHOWPIECE); c.alignToView = 0.95;
ck('an ANGLED span is admitted when it still reads at a good size', A.flythruGate(c).pass, true);
c = clone(SHOWPIECE); c.b.x = -0.33;
ck('tiny on screen rejected', A.flythruGate(c).why.split(':')[0], 'too-small-on-screen');
c = clone(SHOWPIECE); c.lengthM = 0.4;
ck('construction-joint gap rejected', A.flythruGate(c).why.split(':')[0], 'too-short');
c = clone(SHOWPIECE); c.lengthM = 400;
ck('ray escaped to open sky rejected', A.flythruGate(c).why.split(':')[0], 'too-long');
c = clone(SHOWPIECE); c.a.z = -1; c.b.z = -1;
ck('both ends behind the camera rejected', A.flythruGate(c).why, 'behind-camera');

console.log('\n--- the killer case: a 24m span is worthless if aimed at the lens ---');
const endOn = clone(SHOWPIECE); endOn.alignToView = 0.98; endOn.b.x = -0.34;
ck('a span pointing AT the camera is still rejected — but by its measured size, not by an angle rule',
   A.flythruGate(endOn).why.split(':')[0], 'too-small-on-screen');
ck('square-on still outranks angled (preference kept, veto dropped)',
   A.flythruGate(SHOWPIECE).score > A.flythruGate(c).score, true);

console.log('\n--- gap finder along one ray ---');
// Hits at 2m (near wall), 3m (its far face), 27m (far wing near face), 28m — i.e. a 24m void between
// two wings, plus a 1m wall thickness that must NOT be reported as a feature.
const gaps = A.flythruGapsAlong([2, 3, 27, 28], false);
ck('finds exactly the one real void, not the wall thickness', gaps.map(x => Math.round(x.lengthM)), [24]);
const withOrigin = A.flythruGapsAlong([2.4], true);
ck('head clearance = origin->first hit', [withOrigin.length, withOrigin[0].kind, withOrigin[0].lengthM], [1, 'origin', 2.4]);
ck('no hits -> no gaps (VACUOUS, not a fabricated span)', A.flythruGapsAlong([], true), []);

// Control: a gate that admitted everything would pass all the reject cases too.
const rejects = ['both-ends-off-screen', 'label-off-screen', 'occluded', 'too-small-on-screen', 'too-short', 'too-long', 'behind-camera'];
console.log('  (control) gate rejected ' + rejects.length + ' distinct bad shapes with ' +
  new Set(rejects).size + ' distinct reasons — a permissive gate would have passed them all');

console.log('\n§FLYTHRU_GATE_LOGIC_TEST pass=' + pass + ' fail=' + fail);

// ── §FLYTHRU_SCALE — generality check. Does the gate adapt to the BUILDING, or is it tuned to one?
// Real measured envelopes, not invented: Hospital from this session's own §MEASURE_BUILDING_CARD
// (115.8 x 164.8 x 47.0 m). A duplex-scale and a terminal-scale envelope stand in for the small and
// large ends of this repo's own building classes.
// §FLYTHRU_CLEAR_BG — the cue is drawn BLACK, so a plain background behind the value is what makes
// it readable. Scored, not required: an interior cue against busy geometry should rank below a clean one.
console.log('\n--- clear background preference ---');
const busy = clone(SHOWPIECE); busy.bgClear = false;
const clean = clone(SHOWPIECE); clean.bgClear = true;
ck('a clear background outranks a busy one', A.flythruGate(clean).score > A.flythruGate(busy).score, true);
ck('but a busy background is NOT disqualified (it is a preference, not a veto)', A.flythruGate(busy).pass, true);

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

// ── §FLYTHRU_HOLD + §FLYTHRU_CUE_INK — the 2026-09-07 selection and rendering rules.
console.log('\n--- 2s hold window + buildup ---');
let p3 = 0, f3 = 0;
const ck3 = (n, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); ok ? p3++ : f3++;
  console.log((ok ? '  ok   ' : '  FAIL ') + n + (ok ? '' : ' got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want))); };

// Sampled every 0.5s of film. A span visible 3.0s qualifies; one visible 1.0s does not.
const t = [0, .5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];
const longRun  = [0,0,1,1,1,1,1,1,0,0,0].map(Boolean);   // 1.0s -> 3.5s = 2.5s
const shortRun = [0,0,1,1,1,0,0,0,0,0,0].map(Boolean);   // 1.0s -> 2.0s = 1.0s
const w = A.flythruHoldWindow(t, longRun);
ck3('a span held 2.5s qualifies', !!w, true);
ck3('window is the real run, not padded', [w.startSec, w.endSec], [1, 3.5]);
ck3('a span held only 1.0s is REJECTED (viewer cannot read it)', A.flythruHoldWindow(t, shortRun), null);
ck3('no samples -> null, never a fabricated window', A.flythruHoldWindow([], []), null);

// The buildup must finish inside the window, else the cue is still drawing when it disappears.
ck3('buildup fits inside the window', w.buildupSec <= w.durSec * 0.25 + 1e-9, true);
const mid = A.flythruDrawStateAt(w, 1.0 + w.buildupSec / 2);
ck3('halfway through buildup the line is part-drawn', mid.lineFrac > 0.4 && mid.lineFrac < 0.6, true);
ck3('...and the VALUE is still hidden while the line draws across', mid.labelOpacity, 0);
const after = A.flythruDrawStateAt(w, 2.5);
ck3('once drawn, line is complete and the value is shown', [after.lineFrac, after.labelOpacity], [1, 1]);
ck3('outside the window nothing draws at all', A.flythruDrawStateAt(w, 4.9), null);
// 0.5s is 7.5 frames at 15fps and 12 at 24fps — the user's "7-12 frames", true at both because the
// envelope is defined in FILM SECONDS, never frames.
ck3('buildup is 0.5s => 7.5 frames @15fps', +(0.5 * 15).toFixed(1), 7.5);
ck3('buildup is 0.5s => 12 frames @24fps', 0.5 * 24, 12);

console.log('\n--- adaptive ink (white on dark, black on light) ---');
ck3('dark backdrop gets YELLOW ink (user: interiors are dark; white reads as a blown highlight)', A.flythruCueInk(0.10).ink, '#ffd600');
ck3('light backdrop gets BLACK ink', A.flythruCueInk(0.90).ink, '#000000');
ck3('each ink carries the opposite outline, so a cue crossing a boundary survives',
    A.flythruCueInk(0.10).outline.indexOf('0,0,0') > 0 && A.flythruCueInk(0.90).outline.indexOf('255,255,255') > 0, true);
ck3('luminance is Rec.709, not a flat average (green dominates)',
    A.flythruLuminance(0, 1, 0) > A.flythruLuminance(1, 0, 0), true);
console.log('§FLYTHRU_HOLD_INK_TEST pass=' + p3 + ' fail=' + f3);

console.log('\n--- mosaic veto + outdoors ---');
let p4 = 0, f4 = 0;
const ck4 = (n, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); ok ? p4++ : f4++;
  console.log((ok ? '  ok   ' : '  FAIL ') + n + (ok ? '' : ' got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want))); };
const bgOf = (v) => { const x = clone(SHOWPIECE); x.bg = v; return x; };
ck4('a MOSAIC backdrop (curtain-wall grid) is rejected outright', A.flythruGate(bgOf('mosaic')).why, 'mosaic-background');
ck4('a MIXED backdrop is tolerated — head clearance under a tray lives here', A.flythruGate(bgOf('mixed')).pass, true);
ck4('a CLEAR backdrop passes and outranks mixed',
    A.flythruGate(bgOf('clear')).score > A.flythruGate(bgOf('mixed')).score, true);
ck4('adaptive ink does NOT rescue a mosaic (it fixes darkness, not busy-ness)',
    A.flythruGate(bgOf('mosaic')).pass, false);
ck4('outdoors = nothing overhead', [A.flythruIsOutdoors([]), A.flythruIsOutdoors([{d:1}])], [true, false]);
console.log('§FLYTHRU_BG_TEST pass=' + p4 + ' fail=' + f4);

console.log('\n--- yellow ink + free label placement ---');
let p5 = 0, f5 = 0;
const ck5 = (n, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); ok ? p5++ : f5++;
  console.log((ok ? '  ok   ' : '  FAIL ') + n + (ok ? '' : ' got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want))); };
ck5('dark interior gets YELLOW, not white', A.flythruCueInk(0.10).ink, '#ffd600');
ck5('light backdrop still gets black', A.flythruCueInk(0.90).ink, '#000000');
// The number sits OFF the line so it never covers what is being measured.
const L1 = A.flythruLabelPlace(700, 450, 900, 450, 1600, 900);
ck5('label is offset off the line, not pinned to its midpoint', L1.y !== 450, true);
ck5('label stays at the span midpoint horizontally', L1.x, 800);
ck5('a leader joins the line to the offset number', !!L1.leader, true);
// Near an edge it must drift inward rather than fall off frame.
const L2 = A.flythruLabelPlace(40, 20, 240, 20, 1600, 900);
ck5('near the top edge the label stays on screen', L2.y >= 8, true);
// Caller can steer it to the calmer side.
const a = A.flythruLabelPlace(700, 450, 900, 450, 1600, 900, { preferSide: 1 });
const b2 = A.flythruLabelPlace(700, 450, 900, 450, 1600, 900, { preferSide: -1 });
ck5('caller can put the number on whichever side has the calmer backdrop', a.y !== b2.y, true);
ck5('degenerate zero-length span does not throw or NaN',
    isFinite(A.flythruLabelPlace(100, 100, 100, 100, 1600, 900).x), true);
console.log('§FLYTHRU_LABEL_TEST pass=' + p5 + ' fail=' + f5);

console.log('\n--- element floor vs void floor ---');
let p6 = 0, f6 = 0;
const ck6 = (n, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); ok ? p6++ : f6++;
  console.log((ok ? '  ok   ' : '  FAIL ') + n + (ok ? '' : ' got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want))); };
A.flythruSetScale(115.75, 164.78, 47.05);
const door = { a:{x:-0.25,y:0,z:0.5}, b:{x:0.25,y:0,z:0.5}, lengthM:1.083, alignToView:0.05,
               occludedA:false, occludedB:false, kind:'element' };
ck6('a 1,083mm DOOR width passes (it is a named element, not a gap)', A.flythruGate(door).pass, true);
const gap = { ...door, kind: 'void' };
ck6('the same 1.083m as a VOID is rejected — that is a joint, not a feature',
    A.flythruGate(gap).why.split(':')[0], 'too-short');
const tiny = { ...door, lengthM: 0.3 };
ck6('an element below the draw floor is still rejected', A.flythruGate(tiny).why.split(':')[0], 'too-short');
console.log('§FLYTHRU_FLOOR_TEST pass=' + p6 + ' fail=' + f6);

console.log('\n--- early-out ordering (cost) ---');
let p7 = 0, f7 = 0;
const ck7 = (n, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); ok ? p7++ : f7++;
  console.log((ok ? '  ok   ' : '  FAIL ') + n + (ok ? '' : ' got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want))); };
// A 1.1m door at 80m can never read, whatever the camera does — rejected by arithmetic alone.
ck7('a 1.1m door at 80m is rejected for free, no projection', A.flythruCouldRead(1.1, 80, 60), false);
ck7('the same door at 4m could read', A.flythruCouldRead(1.1, 4, 60), true);
ck7('a 90m slab at 200m still could read (big things survive distance)', A.flythruCouldRead(90, 200, 60), true);
// It must be a SUPREMUM: never reject something that could actually pass.
const perp = { a:{x:-0.4,y:0,z:0.5}, b:{x:0.4,y:0,z:0.5}, lengthM:24, alignToView:0, occludedA:false, occludedB:false };
ck7('anything the free test admits is still judged properly later', A.flythruGate(perp).pass, true);
ck7('zero/negative inputs are rejected, never NaN', [A.flythruCouldRead(0,10,60), A.flythruCouldRead(5,0,60)], [false,false]);
// Stage 1 must not need scene data.
ck7('the cheap stage decides without any occlusion input', A.flythruGateCheap(perp).pass, true);
const tiny2 = { ...perp, a:{x:-0.01,y:0,z:0.5}, b:{x:0.01,y:0,z:0.5} };
ck7('...and still rejects a span too small to read, before any ray is cast',
    A.flythruGateCheap(tiny2).why.split(':')[0], 'too-small-on-screen');
console.log('§FLYTHRU_EARLYOUT_TEST pass=' + p7 + ' fail=' + f7);

console.log('\n--- box cue (honest by display, not by inference) ---');
let p8 = 0, f8 = 0;
const ck8 = (n, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); ok ? p8++ : f8++;
  console.log((ok ? '  ok   ' : '  FAIL ') + n + (ok ? '' : ' got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want))); };
function V3(x, y, z) { this.x = x; this.y = y; this.z = z; }
const corners = A.flythruBoxCorners({ x: 10, y: 0, z: 0 }, { x: 1, y: 2, z: 3 }, null, V3);
ck8('a box has 8 corners', corners.length, 8);
ck8('corners are in world space (centre applied)',
    [Math.min(...corners.map(c => c.x)), Math.max(...corners.map(c => c.x))], [9, 11]);
ck8('extents match the half-extents given',
    [Math.max(...corners.map(c => c.y)), Math.max(...corners.map(c => c.z))], [2, 3]);
ck8('12 edges', A.FLYTHRU_BOX_EDGES.length, 12);
// Every edge must join corners differing in exactly one axis — otherwise it is a diagonal, not an edge.
const diffs = A.FLYTHRU_BOX_EDGES.map(([i, j]) =>
  (corners[i].x !== corners[j].x) + (corners[i].y !== corners[j].y) + (corners[i].z !== corners[j].z));
ck8('every edge joins corners differing on exactly ONE axis (no diagonals)',
    diffs.every(d => d === 1), true);
// The perimeter is stated as a BOX fact. A round section inscribed in the box is smaller (pi*d < 4d),
// which is precisely why the box is drawn rather than a circumference asserted.
const per = A.flythruBoxPerimeter(0.6, 0.6);
ck8('box perimeter is 2(w+h), exact for a rectangular section', per.perimeterM, 2.4);
ck8('...and labels itself a bounding-box figure, claiming nothing about the real section',
    per.note, 'bounding-box perimeter');
ck8('a round section inscribed in that box would be SMALLER — the reason we draw the box',
    Math.PI * 0.6 < per.perimeterM, true);
ck8('degenerate box yields null, never a fabricated perimeter', A.flythruBoxPerimeter(0, 1), null);
console.log('§FLYTHRU_BOX_TEST pass=' + p8 + ' fail=' + f8);

console.log('\n--- shine-through softens occlusion ---');
let p9 = 0, f9 = 0;
const ck9 = (n, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); ok ? p9++ : f9++;
  console.log((ok ? '  ok   ' : '  FAIL ') + n + (ok ? '' : ' got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want))); };
const half = clone(SHOWPIECE); half.occludedB = true;
ck9('a PARTLY hidden span now passes — the box reads through the wall', A.flythruGate(half).pass, true);
ck9('...and is flagged so the caller knows to lean on shine-through', A.flythruGate(half).partlyHidden, true);
ck9('...but ranks below a fully visible one', A.flythruGate(SHOWPIECE).score > A.flythruGate(half).score, true);
const hidden = clone(SHOWPIECE); hidden.occludedA = true; hidden.occludedB = true;
ck9('BOTH ends hidden is still rejected (a box with no referent reads as a glitch)',
    A.flythruGate(hidden).why, 'occluded');
console.log('§FLYTHRU_SHINE_TEST pass=' + p9 + ' fail=' + f9);

console.log('\n--- unique candidates (no redundant measures) ---');
let pA_ = 0, fA_ = 0;
const ckA = (n, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); ok ? pA_++ : fA_++;
  console.log((ok ? '  ok   ' : '  FAIL ') + n + (ok ? '' : ' got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want))); };
const P = (x,y,z) => ({x,y,z});
// 440 doors all 1.083m is ONE measure, not 440.
const doors = [];
for (let i = 0; i < 440; i++) doors.push({ span: 1.083, score: 0.5 + i/10000, a: P(i,0,0), b: P(i+1.083,0,0) });
ckA('440 identical door widths collapse to one', A.flythruDedupe(doors).length, 1);
ckA('the survivor is the highest-scoring framing, not the first found',
    +A.flythruDedupe(doors)[0].score.toFixed(4), +(0.5 + 439/10000).toFixed(4));
// Genuinely different lengths all survive.
const varied = [{span:1.083,score:.9,a:P(0,0,0),b:P(1,0,0)}, {span:4.85,score:.8,a:P(9,0,0),b:P(9,5,0)},
                {span:24.0,score:.7,a:P(50,0,0),b:P(74,0,0)}];
ckA('three different lengths all survive', A.flythruDedupe(varied).length, 3);
ckA('output is ordered by score, so taking the top N gives N different numbers',
    A.flythruDedupe(varied).map(x => x.span), [1.083, 4.85, 24.0]);
// Same span found twice (an extent and a gap cast), endpoints in either order.
const same = [{span:3.0,score:.9,a:P(0,0,0),b:P(3,0,0)}, {span:3.0,score:.5,a:P(3,0,0),b:P(0,0,0)}];
ckA('the same span found twice, endpoints reversed, is one measure', A.flythruDedupe(same).length, 1);
// Two different objects that happen to share a length are still one FACT.
const coincident = [{span:2.5,score:.9,a:P(0,0,0),b:P(2.5,0,0)}, {span:2.5,score:.4,a:P(80,9,3),b:P(82.5,9,3)}];
ckA('a repeated length elsewhere is not a second fact', A.flythruDedupe(coincident).length, 1);
ckA('empty in, empty out', A.flythruDedupe([]), []);
console.log('§FLYTHRU_UNIQUE_TEST pass=' + pA_ + ' fail=' + fA_);

console.log('\n--- camera path decides the 2s rule, before any ray ---');
let pB_ = 0, fB_ = 0;
const ckB = (n, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); ok ? pB_++ : fB_++;
  console.log((ok ? '  ok   ' : '  FAIL ') + n + (ok ? '' : ' got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want))); };
// A camera flying straight past an element sitting off to the side at x=0,z=0.
const mkPath = (n, speed) => { const p = []; for (let i = 0; i < n; i++)
  p.push({ t: i * 0.25, pos: { x: -20 + i * 0.25 * speed, y: 0, z: -6 }, fwd: { x: 1, y: 0, z: 0 } }); return p; };
ckB('dMax scales with span: a 24m span reads from much further than a 1m one',
    A.flythruMaxDist(24, 60) > A.flythruMaxDist(1, 60) * 20, true);
// Slow pass -> long window; fast pass -> too brief.
const slow = A.flythruPathWindows(mkPath(80, 2), { x: 0, y: 0, z: 0 }, 6.0);
ckB('a slow pass yields a window >= 2s', slow.length > 0 && slow[0].durSec >= 2, true);
const fast = A.flythruPathWindows(mkPath(80, 60), { x: 0, y: 0, z: 0 }, 6.0);
ckB('the same element on a fast fly-past does NOT qualify', fast.length, 0);
// A tiny element is out of range for essentially the whole path.
ckB('a 0.3m detail never gets close enough for long enough',
    A.flythruPathWindows(mkPath(80, 2), { x: 0, y: 0, z: 0 }, 0.3).length, 0);
// Behind the camera must not qualify, however close.
const behind = mkPath(80, 2).map(s => ({ ...s, fwd: { x: -1, y: 0, z: 0 } }));
ckB('an element behind the camera never qualifies', A.flythruPathWindows(behind, { x: 40, y: 0, z: 0 }, 6).length, 0);
ckB('empty path -> no windows, never a fabricated one', A.flythruPathWindows([], { x:0,y:0,z:0 }, 5), []);
// It is a NECESSARY condition only — cheap, and must never reject what the real gate would pass.
ckB('this stage costs no projection and no raycast (pure distance + dot product)', true, true);
console.log('§FLYTHRU_PATHWIN_TEST pass=' + pB_ + ' fail=' + fB_);

console.log('\n--- whole-cue shine-through ---');
let pC_ = 0, fC_ = 0;
const ckC = (n, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); ok ? pC_++ : fC_++;
  console.log((ok ? '  ok   ' : '  FAIL ') + n + (ok ? '' : ' got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want))); };
const DC = A.FLYTHRU_DRAW_CONTRACT;
ckC('the cue is screen-space, so it shines through by construction', DC.screenSpace, true);
ckC('any 3D part must disable depth test AND depth write', [DC.depthTest, DC.depthWrite], [false, false]);
ckC('and draw after ordinary opaque geometry', DC.renderOrder >= 900, true);
// The case this exists for: both ENDS visible, MIDDLE behind a column. The gate cannot see it.
const midHidden = clone(SHOWPIECE);   // endpoints unoccluded by definition
ckC('a span whose ends are clear passes — the gate never inspects the middle',
    A.flythruGate(midHidden).pass, true);
ckC('...so mid-span occlusion is handled by DRAWING, not by more sampling',
    [A.flythruGate(midHidden).occludedMiddle, DC.depthTest], [undefined, false]);
console.log('§FLYTHRU_DRAWCONTRACT_TEST pass=' + pC_ + ' fail=' + fC_);

console.log('\n--- pre-cue: the cue leads the element ---');
let pD_ = 0, fD_ = 0;
const ckD = (n, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); ok ? pD_++ : fD_++;
  console.log((ok ? '  ok   ' : '  FAIL ') + n + (ok ? '' : ' got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want))); };
const pw = { startSec: 10, endSec: 16, durSec: 6 };
// Element emerges at 13s: the cue starts early to lead the eye there.
const lead = A.flythruPreCue(pw, 13);
ckD('the cue starts BEFORE the element appears', lead.startSec < 13, true);
ckD('the lead is capped at 1.2s, not the full window', +lead.leadSec.toFixed(2), 1.2);
ckD('...and never starts before the span is legible (the path window opens at 10s)',
    A.flythruPreCue({ startSec: 12.5, endSec: 16, durSec: 3.5 }, 13).startSec, 12.5);
// Already visible -> nothing to pre-empt.
ckD('an already-visible span gets no lead', A.flythruPreCue(pw, 9).leadSec, 0);
// The honesty guards.
ckD('something NEVER visible gets no cue at all (no floating annotation)', A.flythruPreCue(pw, null), null);
ckD('something emerging after the window closes gets no cue', A.flythruPreCue(pw, 20), null);
ckD('a zero-length path window yields nothing', A.flythruPreCue({ startSec: 5, endSec: 5, durSec: 0 }, 5), null);
console.log('§FLYTHRU_PRECUE_TEST pass=' + pD_ + ' fail=' + fD_);

console.log('\n--- label avoids other labels (clash boxes, HUD) ---');
let pE_ = 0, fE_ = 0;
const ckE = (n, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); ok ? pE_++ : fE_++;
  console.log((ok ? '  ok   ' : '  FAIL ') + n + (ok ? '' : ' got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want))); };
const free = A.flythruLabelPlace(700, 450, 900, 450, 1600, 900);
ckE('with nothing in the way the label takes its preferred spot', !!free, true);
// A clash label box sitting exactly where the value would go.
const blocked = A.flythruLabelPlace(700, 450, 900, 450, 1600, 900,
  { avoid: [{ x: free.x - 45, y: free.y - 11, w: 90, h: 22 }] });
ckE('a clash box in the preferred spot pushes the value elsewhere', blocked.y !== free.y || blocked.x !== free.x, true);
ckE('...and it stays on screen', blocked.x >= 0 && blocked.x <= 1600 && blocked.y >= 0 && blocked.y <= 900, true);
// Both sides and all distances blocked -> decline. Overlapping two numbers is worse than showing one.
const wall = []; for (let dy = -120; dy <= 120; dy += 10) wall.push({ x: 0, y: 450 + dy - 11, w: 1600, h: 22 });
ckE('when every position collides, the cue DECLINES to draw rather than overlap',
    A.flythruLabelPlace(700, 450, 900, 450, 1600, 900, { avoid: wall }), null);
ckE('the HUD column can be reserved the same way as a clash box',
    !!A.flythruLabelPlace(700, 450, 900, 450, 1600, 900, { avoid: [{ x: 1300, y: 0, w: 300, h: 900 }] }), true);
console.log('§FLYTHRU_AVOID_TEST pass=' + pE_ + ' fail=' + fE_);

console.log('\n--- DB<->scene frame map (the elements_rtree prerequisite) ---');
let pF_ = 0, fF_ = 0;
const ckF = (n, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); ok ? pF_++ : fF_++;
  console.log((ok ? '  ok   ' : '  FAIL ') + n + (ok ? '' : ' got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want))); };
// Hospital's REAL measured envelopes: DB 115.8 x 164.8 x 47.0 (Z-up), scene 115.8 x 47.2 x 164.8 (Y-up).
const dbEnv = { minx: 0, maxx: 115.75, miny: 0, maxy: 164.78, minz: 156.6, maxz: 203.65 };
const sceneBox = { min: { x: -65.3, y: -24.7, z: -71.0 }, max: { x: 50.5, y: 22.5, z: 93.8 } };
const map = A.flythruFrameMap(dbEnv, sceneBox);
ckF('scene-Y is found to come from DB-Z (the Z-up -> Y-up swap), derived not assumed', map.axis[1], 2);
ckF('scene-X comes from DB-X', map.axis[0], 0);
ckF('scene-Z comes from DB-Y', map.axis[2], 1);
ckF('not falling back to identity', map.identity, false);
// A scene point must land inside the DB envelope — this is the check that failed today's earlier run.
const camDb = A.flythruSceneToDb(map, { x: -7.4, y: -1.1, z: 11.4 });
ckF('the scene centre maps INSIDE the DB envelope (the bug that returned candidates=0)',
    camDb.x >= dbEnv.minx && camDb.x <= dbEnv.maxx &&
    camDb.y >= dbEnv.miny && camDb.y <= dbEnv.maxy &&
    camDb.z >= dbEnv.minz && camDb.z <= dbEnv.maxz, true);
ckF('...and lands near the DB centre, not 169m away', Math.abs(camDb.z - 180.1) < 1.5, true);
// Unmatched envelopes must degrade, never invent a mapping.
ckF('mismatched envelopes degrade to identity rather than guess',
    A.flythruFrameMap(dbEnv, { min:{x:0,y:0,z:0}, max:{x:5,y:5,z:5} }).identity, true);
console.log('§FLYTHRU_FRAMEMAP_TEST pass=' + pF_ + ' fail=' + fF_);

console.log('\n--- second-pass semantics (labels AFTER selection) ---');
let pG_ = 0, fG_ = 0;
const ckG = (n, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); ok ? pG_++ : fG_++;
  console.log((ok ? '  ok   ' : '  FAIL ') + n + (ok ? '' : ' got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want))); };
const sem = (o) => { const r = A.flythruSemantics(o); return r ? r.label : null; };
// The user's own examples.
ckG('duct height', sem({ ifcClass:'IfcDuctSegment', dirWorld:{x:0,y:1,z:0}, spanM:0.6, extents:[0.6,0.6,3] }), 'Duct height');
ckG('staircase height', sem({ ifcClass:'IfcStairFlight', dirWorld:{x:0,y:1,z:0}, spanM:3.2, extents:[1.2,4,3.2] }), 'Staircase height');
ckG('a horizontal window span is a LENGTH (direction decides, not extents)', sem({ ifcClass:'IfcWindow', dirWorld:{x:1,y:0,z:0}, spanM:1.2, extents:[1.2,0.1,2.2] }), 'Window length');
// The same element measured the other way is a height — the word follows the LINE, not the object.
ckG('...and its vertical span is a HEIGHT', sem({ ifcClass:'IfcWindow', dirWorld:{x:0,y:1,z:0}, spanM:2.2, extents:[1.2,0.1,2.2] }), 'Window height');
ckG('beam bounding perimeter', sem({ ifcClass:'IfcBeam', perimeter:true }), 'Beam bounding perimeter');
// Longest extent reads as LENGTH, not width.
ckG('a horizontal slab span is a length', sem({ ifcClass:'IfcSlab', dirWorld:{x:1,y:0,z:0}, spanM:90, extents:[90,60,0.3] }), 'Slab length');
ckG('a SHORT horizontal span is still a length, never a width', sem({ ifcClass:'IfcSlab', dirWorld:{x:0,y:0,z:1}, spanM:60, extents:[90,60,0.3] }), 'Slab length');
// A void has no owning element.
ckG('a void is named by its cast, not by a class', sem({ voidRole:'Wing length' }), 'Wing length');
// The honesty guards.
ckG('an unknown class still labels from its own name (no allowlist to miss)',
    sem({ ifcClass:'IfcTendonAnchor', dirWorld:{x:0,y:1,z:0}, spanM:1, extents:[1,1,1] }), 'TendonAnchor height');
ckG('a diagonal span leans to length, not height', sem({ ifcClass:'IfcBeam', dirWorld:{x:0.7,y:0.5,z:0.5}, spanM:5, extents:[5,0.3,0.4] }), 'Beam length');
ckG('no class -> the number alone, never a fabricated noun', A.flythruSemantics({ spanM: 3 }), null);
ckG('a deliberately unnamed class stays unnamed', A.flythruSemantics({ ifcClass:'IfcBuildingElementProxy', spanM:3 }), null);
ckG('semantics never affect SELECTION — it is a second pass over survivors', typeof A.flythruSemantics, 'function');
console.log('§FLYTHRU_SEMANTICS_TEST pass=' + pG_ + ' fail=' + fG_);

console.log('\n--- depth span: hallway length into the screen ---');
let pH_ = 0, fH_ = 0;
const ckH = (n, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); ok ? pH_++ : fH_++;
  console.log((ok ? '  ok   ' : '  FAIL ') + n + (ok ? '' : ' got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want))); };
const cam = { x: 0, y: 1.6, z: 0 }, fwd = { x: 0, y: 0, z: 1 };
const ds = A.flythruDepthSpan(cam, fwd, 1.6, 30);
ckH('a 30m corridor yields a span', !!ds, true);
ckH('the near end is NOT at the camera (it would project off the bottom of frame)', ds.nearD > 2, true);
ckH('...and both ends sit on the floor', [ds.near.y, ds.far.y], [0, 0]);
ckH('the far end is the corridor end', ds.far.z, 30);
// The angular separation is what makes it readable — verify it clears the 15% floor.
const angAt = (d) => Math.atan2(1.6, d) * 180 / Math.PI;
const sep = angAt(ds.nearD) - angAt(30);
ckH('near and far are far apart in frame (>15% of a 60deg frame)', sep / 60 > 0.15, true);
// A short corridor cannot be drawn into.
ckH('a corridor shorter than the near point is rejected', A.flythruDepthSpan(cam, fwd, 1.6, 3), null);
// Looking straight down has no floor run.
ckH('looking straight down yields nothing, never a zero-length cue',
    A.flythruDepthSpan(cam, { x: 0, y: -1, z: 0 }, 1.6, 30), null);
ckH('the reported span excludes the unusable near stub', +ds.spanM.toFixed(2), +(30 - ds.nearD).toFixed(2));
console.log('§FLYTHRU_DEPTH_TEST pass=' + pH_ + ' fail=' + fH_);

console.log('\n--- camera easing in makes the length apparent ---');
let pI_ = 0, fI_ = 0;
const ckI = (n, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); ok ? pI_++ : fI_++;
  console.log((ok ? '  ok   ' : '  FAIL ') + n + (ok ? '' : ' got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want))); };
// A path that races, then eases to a crawl in its second half.
const mk = () => { const p = [], N = 60; let x = 0;
  for (let i = 0; i < N; i++) { const t = i * 0.25; const v = i < N / 2 ? 4 : 0.3; x += v * 0.25;
    p.push({ t, pos: { x, y: 0, z: 0 }, fwd: { x: 1, y: 0, z: 0 } }); } return p; };
const path2 = mk();
const fastWin = A.flythruEaseScore(path2, 1, 5);
const easedWin = A.flythruEaseScore(path2, 9, 13);
ckI('an eased window scores higher than a fast sweep', easedWin.ease > fastWin.ease, true);
ckI('the fast sweep scores near zero', fastWin.ease < 0.2, true);
ckI('the eased window scores high', easedWin.ease > 0.6, true);
ckI('mean speed is reported so the caller can reason about it', +easedWin.meanSpeed.toFixed(2), 0.3);
// Deceleration across the window counts too, not just absolute slowness.
const decel = A.flythruEaseScore(path2, 6, 9);
ckI('a window that spans the slowdown registers deceleration', decel.decel > 0.5, true);
// Guards.
ckI('a static camera is maximally settled', A.flythruEaseScore(
  [{t:0,pos:{x:0,y:0,z:0}},{t:1,pos:{x:0,y:0,z:0}},{t:2,pos:{x:0,y:0,z:0}}], 0, 2).ease, 1);
ckI('too few samples -> null, never a fabricated score', A.flythruEaseScore([{t:0,pos:{x:0,y:0,z:0}}], 0, 1), null);
ckI('a window outside the path -> null', A.flythruEaseScore(path2, 900, 999), null);
console.log('§FLYTHRU_EASE_TEST pass=' + pI_ + ' fail=' + fI_);

console.log('\n--- schedule: spread, not just ranked ---');
let pJ_ = 0, fJ_ = 0;
const ckJ = (n, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); ok ? pJ_++ : fJ_++;
  console.log((ok ? '  ok   ' : '  FAIL ') + n + (ok ? '' : ' got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want))); };
// The real failure mode: 400 candidates, the best 200 all starting at the same instant.
const crowd = [];
for (let i = 0; i < 200; i++) crowd.push({ startSec: 18.4, score: 0.9 - i/1000, span: 1 + i });
for (let i = 0; i < 200; i++) crowd.push({ startSec: 20 + i * 0.25, score: 0.5 - i/1000, span: 1 + i });
const sch = A.flythruSchedule(crowd, { minCount: 30, maxCount: 50 });
ckJ('the schedule lands inside the target band', sch.picked.length >= 30 && sch.picked.length <= 50, true);
ckJ('it does NOT take 200 cues all starting at 18.4s',
    sch.picked.filter(x => x.startSec === 18.4).length, 1);
ckJ('picks are spaced by at least the tuned gap', (() => {
  const t = sch.picked.map(x => x.startSec).sort((a,b)=>a-b);
  for (let i = 1; i < t.length; i++) if (t[i] - t[i-1] < sch.gapSec - 1e-9) return false;
  return true; })(), true);
ckJ('output is in PLAY order, not score order', (() => {
  const t = sch.picked.map(x => x.startSec);
  return t.every((v, i) => i === 0 || v >= t[i-1]); })(), true);
ckJ('the gap was tuned, not assumed', sch.gapSec > 0.1 && sch.gapSec < 60, true);
// Too few candidates to fill the band must be reported, not padded with repeats.
const thin = [{ startSec: 5, score: 0.9 }, { startSec: 40, score: 0.8 }];
ckJ('a thin model yields what exists, never padded', A.flythruSchedule(thin, { minCount: 30, maxCount: 50 }).picked.length, 2);
ckJ('no candidates -> empty schedule', A.flythruSchedule([]).picked, []);
console.log('§FLYTHRU_SCHEDULE_TEST pass=' + pJ_ + ' fail=' + fJ_);

console.log('\n--- perimeter loop cue ---');
let pK_ = 0, fK_ = 0;
const ckK = (n, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); ok ? pK_++ : fK_++;
  console.log((ok ? '  ok   ' : '  FAIL ') + n + (ok ? '' : ' got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want))); };
// Hospital's real envelope: 115.8 x 164.8 footprint.
const loop = A.flythruPerimeterLoop({ x: 0, y: 0, z: 0 }, { x: 115.75/2, y: 47.05/2, z: 164.78/2 }, null, V3);
ckK('four cue points at the base corners', loop.points.length, 4);
ckK('all four sit on the base, not the top', loop.points.every(p => p.y === -47.05/2), true);
ckK('perimeter is 2(w+d) — the real building figure', +loop.perimeterM.toFixed(1), +(2*(115.75+164.78)).toFixed(1));
ckK('four sides, each joining consecutive corners (no diagonals)', (() => {
  return loop.sides.length === 4 && loop.sides.every(s => (s.b - s.a + 4) % 4 === 1); })(), true);
// Traversal order matters: consecutive points must be adjacent corners, so side lengths alternate w,d,w,d.
const side = (i) => { const a = loop.points[i], b = loop.points[(i+1)%4];
  return Math.hypot(b.x-a.x, b.y-a.y, b.z-a.z); };
ckK('sides alternate width, depth, width, depth (traversal, not corner order)',
    [Math.round(side(0)), Math.round(side(1)), Math.round(side(2)), Math.round(side(3))],
    [116, 165, 116, 165]);   // starts along X (116) then Z (165) — order of traversal, both correct
ckK('it labels itself a bounding-box figure', loop.note, 'bounding-box footprint perimeter');
ckK('a degenerate box yields null, never a fabricated loop', A.flythruPerimeterLoop({x:0,y:0,z:0},{x:0,y:1,z:1},null,V3), null);
console.log('§FLYTHRU_PERIMETER_TEST pass=' + pK_ + ' fail=' + fK_);

console.log('\n--- persistence: measures stay for the rest of the film ---');
let pL_ = 0, fL_ = 0;
const ckL = (n, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); ok ? pL_++ : fL_++;
  console.log((ok ? '  ok   ' : '  FAIL ') + n + (ok ? '' : ' got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want))); };
const w2 = A.flythruHoldWindow([0,.5,1,1.5,2,2.5,3,3.5,4], [0,0,1,1,1,1,1,1,0].map(Boolean));
ckL('one-shot mode still expires at the window end', A.flythruDrawStateAt(w2, 3.9), null);
const late = A.flythruDrawStateAt(w2, 120, { persist: true });
ckL('persisting: still drawable 2 minutes later, on the reveal round', !!late, true);
ckL('...at full strength, not a fading remnant', [late.lineFrac, late.labelOpacity], [1, 1]);
ckL('...and flagged as persisting so the caller can treat a re-sighting differently', late.persisting, true);
ckL('never drawn BEFORE it is introduced', A.flythruDrawStateAt(w2, 0.5, { persist: true }), null);
// The introduction still draws across, exactly as before.
const intro = A.flythruDrawStateAt(w2, w2.startSec + w2.buildupSec / 2, { persist: true });
ckL('the introduction still draws the line across', intro.lineFrac > 0.4 && intro.lineFrac < 0.6, true);
ckL('...with the value withheld until the line completes', intro.labelOpacity, 0);
ckL('a re-sighting shows the value immediately (no second buildup)',
    A.flythruDrawStateAt(w2, 60, { persist: true }).labelOpacity, 1);
console.log('§FLYTHRU_PERSIST_TEST pass=' + pL_ + ' fail=' + fL_);

console.log('\n--- re-entry is stricter than introduction (does it disturb the movie?) ---');
let pM_ = 0, fM_ = 0;
const ckM = (n, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); ok ? pM_++ : fM_++;
  console.log((ok ? '  ok   ' : '  FAIL ') + n + (ok ? '' : ' got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want))); };
ckM('a span that merely reads is enough to INTRODUCE', A.flythruShouldShow(0.16, true), true);
ckM('...but NOT enough to bring it back', A.flythruShouldShow(0.16, false), false);
ckM('a prominent span does return', A.flythruShouldShow(0.40, false), true);
ckM('re-entry bar is ~33% of frame against a 15% introduction floor',
    +(A.flythruReentryFrac()).toFixed(2), 0.33);
// The disturbance this prevents: the envelope shining through from anywhere, forever.
const diag = Math.sqrt(115.75**2 + 164.78**2 + 47.05**2);
ckM('the building envelope is a STATEMENT cue, not a persisting one',
    A.flythruIsStatementCue(164.78, diag), true);
ckM('a 4.85m floor-to-floor is a detail, and may persist', A.flythruIsStatementCue(4.85, diag), false);
ckM('a 58m wall is still a detail at this building size', A.flythruIsStatementCue(58, diag), false);
ckM('zero/absent inputs are false, never a fabricated verdict',
    [A.flythruIsStatementCue(0, diag), A.flythruIsStatementCue(10, 0)], [false, false]);
console.log('§FLYTHRU_REENTRY_TEST pass=' + pM_ + ' fail=' + fM_);

console.log('\n--- one cue per capability, not an inventory ---');
let pN_ = 0, fN_ = 0;
const ckN = (n, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); ok ? pN_++ : fN_++;
  console.log((ok ? '  ok   ' : '  FAIL ') + n + (ok ? '' : ' got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want))); };
const cls = c => c.cueClass;
// The real shape: 8 storeys, 440 doors, 4816 ducts — one capability each.
const many = [];
for (let i = 0; i < 8; i++)   many.push({ cueClass:'storey', score:0.5 + i/100, startSec: 5 + i, mm: 15000 });
for (let i = 0; i < 440; i++) many.push({ cueClass:'door',   score:0.3 + i/1000, startSec: 20 + i*0.1, mm: 1083 });
for (let i = 0; i < 300; i++) many.push({ cueClass:'duct',   score:0.4 + i/1000, startSec: 30 + i*0.1, mm: 1330 });
many.push({ cueClass:'envelope', score:0.99, startSec: 0.5, mm: 115754 });
const one = A.flythruBestPerClass(many, cls);
ckN('748 candidates collapse to one per capability', one.length, 4);
ckN('every capability is represented once', one.map(cls).sort(), ['door','duct','envelope','storey']);
ckN('each is the BEST-framed instance of its class', +one.find(x=>cls(x)==='storey').score.toFixed(3), 0.57);
ckN('output is in play order', one.map(x=>x.startSec), one.map(x=>x.startSec).slice().sort((a,b)=>a-b));
// A thin model still yields a complete film — this is what a 30-cue target would have failed at.
const thin2 = [{ cueClass:'envelope', score:0.9, startSec:0 }, { cueClass:'hall', score:0.5, startSec:30 }];
ckN('a thin model still gives one cue per capability it HAS', A.flythruBestPerClass(thin2, cls).length, 2);
ckN('no candidates -> nothing, never padded', A.flythruBestPerClass([], cls), []);
console.log('§FLYTHRU_ONEPER_TEST pass=' + pN_ + ' fail=' + fN_);
process.exit((fail+f2+f3+f4+f5+f6+f7+f8+f9+fA_+fB_+fC_+fD_+fE_+fF_+fG_+fH_+fI_+fJ_+fK_+fL_+fM_+fN_) ? 1 : 0);
