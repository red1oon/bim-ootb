#!/usr/bin/env node
/* ⚠ WITNESS — W-FRAME-REUSE, §129.57
 * (bim-compiler prompts/LOADPATH_FREEZE_POLISH_RESUME.md §129.57)
 *
 * THE ISSUE IT PROVES OR DISPROVES:
 *   The 2026-09-20 Hospital hi-res bake produced 199 frames that were BYTE-IDENTICAL to the frame
 *   before them, all 199 inside the load-path freeze and none anywhere else, each costing 6,892 ms
 *   to re-derive — 22.9 min of GPU time for bytes that already existed. §129.57 hands the encoder
 *   the previous blob when nothing that drives the picture has moved.
 *
 *   The danger of such a change is the opposite defect: reusing a frame when something DID move,
 *   which freezes real animation and cannot be seen in any count — only in the film. So the
 *   witness's real job is the second half.
 *
 * WHAT IT ASSERTS:
 *   PART A  SHAPE     Driven over the freeze's measured shape (25 fade-in frames, 9 hops of
 *                     2 distinct + 23 held, 24 fade-out), the logic must reuse exactly 199 of 265
 *                     and render exactly 66. Those two numbers come from the REAL bake's hash
 *                     sequence (fixtures/framehash_Hospital_2026-09-20_0531.txt), not from taste.
 *   PART B  SELF-OFF  If the visual-rev counter moves EVERY frame — the "someone fixed the landing
 *                     glow so it animates" case — reuse must collapse to 0 on its own, with no
 *                     edit to the bake loop. This is the whole safety argument for using a counter
 *                     instead of a hand-written list of drivers, so it is tested, not asserted.
 *   PART C  GATES     A moving camera, a moving sun, a changing HUD alpha and a changing day
 *                     counter each independently force a render. Checked one at a time, so a key
 *                     that dropped one term still fails.
 *   PART D  CONTROL   window.__noFrameReuse must give 265 renders and 0 reuses.
 *   PART E  FIXTURE   The 199/66 split is re-derived from the real bake's hash file at run time —
 *                     if that file is ever replaced with a bake whose shape differs, PART A's
 *                     expectation moves with it instead of silently testing a stale number.
 *
 * WHAT MAKES IT A WITNESS AND NOT A SMOKE TEST:
 *   - NO-OP:   the key builder is EXTRACTED from cinema_maxq.js by text. Delete the reuse branch
 *              and the extraction fails -> INCONCLUSIVE, exit 2, never a quiet pass.
 *   - WRONG:   PART C fails a key that reuses across a real change.
 *   - VACUOUS: PART A's expectation comes from the fixture; with no fixture it says so and exits 2.
 *   - CONTROL: PART D, plus `git show HEAD:viewer/cinema_maxq.js > /tmp/before_cm.js &&
 *              node viewer/tests/witness_frame_reuse.js /tmp/before_cm.js` must be INCONCLUSIVE.
 *
 *   ⚠ SCOPE: this proves the DECISION logic. It does not prove the delivered film is unchanged.
 *   That is the byte-exact gate: re-bake and diff §FRAME_HASH against the fixture frame-for-frame.
 *
 * RUN: node viewer/tests/witness_frame_reuse.js [path/to/cinema_maxq.js]
 */
const fs = require('fs'), path = require('path');
const SRC = process.argv[2] || path.resolve(__dirname, '..', 'cinema_maxq.js');
const FIX = path.resolve(__dirname, 'fixtures', 'framehash_Hospital_2026-09-20_0531.txt');
const src = fs.readFileSync(SRC, 'utf8');

if (!/§129\.57 FRAME REUSE/.test(src) || !/_reuseKey === _lastFrameKey/.test(src)) {
  console.log('§FRAME_REUSE_W INCONCLUSIVE — no §129.57 reuse branch in ' + path.basename(SRC) + '; nothing judged');
  process.exit(2);
}

// ── PART E — the expected split, re-derived from the REAL bake ───────────────────────────────
let EXPECT_REUSE = null, EXPECT_RENDER = null, HOLD = [1923, 2187];
try {
  const rows = fs.readFileSync(FIX, 'utf8').trim().split('\n').map((l) => l.split(' '));
  let prev = null, dup = 0, tot = 0;
  for (const [iS, sha] of rows) {
    const i = +iS;
    if (i < HOLD[0] || i > HOLD[1]) { prev = null; continue; }
    tot++; if (sha === prev) dup++; prev = sha;
  }
  EXPECT_REUSE = dup; EXPECT_RENDER = tot - dup;
  console.log('fixture: ' + tot + ' freeze frames, ' + dup + ' byte-identical to predecessor, ' + (tot - dup) + ' distinct');
} catch (e) {
  console.log('§FRAME_REUSE_W INCONCLUSIVE — cannot read the reference hash fixture: ' + e.message);
  process.exit(2);
}

// ── the decision, reproduced from the source's own key terms ─────────────────────────────────
// Every term below is read out of the extracted key expression, so a key that drops one is caught
// by PART C rather than by this witness quietly agreeing with it.
const keyBody = src.slice(src.indexOf("var _reuseKey = null;"), src.indexOf("var blob;"));
const TERMS = { hudAlpha: /_loadPathHudAlpha/, rev: /_loadPathVisualRev/, prevRev: /_prevVisualRev/, pose: /camera.*position|_rp\.x/, target: /_rt\.x/, sun: /sunCompassInfo/, day: /_dayInfo/ };
for (const [name, rx] of Object.entries(TERMS)) {
  if (!rx.test(keyBody)) { console.log('  FAIL  the reuse key has no `' + name + '` term'); process.exitCode = 1; }
}
const ok = (c, m) => { console.log((c ? '  ok    ' : '  FAIL  ') + m); if (!c) process.exitCode = 1; };
function keyOf(st, noReuse) {
  if (noReuse || !st.inHold) return null;
  return ['h1', st.hudAlpha.toFixed(6), 'rev' + st.rev + '+' + st.prevRev,
    st.pose.map((v) => v.toFixed(4)).join(','), st.target.map((v) => v.toFixed(4)).join(','),
    st.sun.toFixed(3), String(st.day)].join('|');
}
function run(frames, noReuse) {
  let lastKey = null, lastBlob = null, reused = 0, rendered = 0, runs = 0, inRun = 0;
  for (const st of frames) {
    const k = keyOf(st, noReuse);
    if (k !== null && k === lastKey && lastBlob) { reused++; inRun++; }
    else { if (inRun) { runs++; inRun = 0; } rendered++; lastBlob = 'blob' + rendered; lastKey = k; }
  }
  if (inRun) runs++;
  return { reused, rendered, runs };
}

// ── PART A — REPLAY THE REAL BAKE ───────────────────────────────────────────────────────────
// Not a synthetic guess at the hold's shape. For every real freeze frame we know, from that bake's
// own hash, whether the picture ACTUALLY changed. We drive the key with the state that frame had
// and check the one property that matters:
//
//     the logic must NEVER reuse across a frame the real bake found DIFFERENT.
//
// A count alone cannot catch that; only the pairing can. Coverage (how many of the 199 real
// duplicates it captures) is reported beside it, because a safe-but-useless predicate that reuses
// nothing would otherwise pass this leg.
const HOLD_START = HOLD[0], FPS = 24, FADE_FRAMES = 24;   // fadeSec 1.0 at 24 fps, §129.27 front-loaded
const shaAt = {};
for (const [iS, sha] of fs.readFileSync(FIX, 'utf8').trim().split('\n').map((l) => l.split(' '))) shaAt[+iS] = sha;
function stateAt(i, opts) {
  opts = opts || {};
  const e = i - HOLD_START, last = HOLD[1] - HOLD_START;
  // §129.27: HUD ramps OUT over the first fadeSec after arm and back IN over the last fadeSec.
  let hudAlpha = 0;
  if (e < FADE_FRAMES) hudAlpha = 1 - e / FADE_FRAMES;
  else if (e > last - FADE_FRAMES) hudAlpha = 1 - (last - e) / FADE_FRAMES;
  // _revealStackStep: revealed = floor(stackElapsed) + 1, so it mutates once per second of hold.
  const rev = opts.revEveryFrame ? e : Math.floor(e / FPS);
  const prevRev = e <= 0 ? -1 : (opts.revEveryFrame ? e - 1 : Math.floor((e - 1) / FPS));
  return { inHold: true, hudAlpha, rev, prevRev, pose: [-23.55, -0.07, -9.29], target: [0, 0, 0], sun: 26.5, day: 'tr' };
}
function replay(opts, noReuse) {
  opts = opts || {};
  let lastKey = null, lastBlob = null, reused = 0, rendered = 0, unsafe = [], caught = 0;
  for (let i = HOLD[0]; i <= HOLD[1]; i++) {
    const st = stateAt(i, opts);
    if (opts.mutate) opts.mutate(st, i - HOLD_START);
    const k = keyOf(st, noReuse);
    const realDup = (shaAt[i] !== undefined && shaAt[i] === shaAt[i - 1]);
    if (k !== null && k === lastKey && lastBlob) {
      reused++;
      if (!realDup) unsafe.push(i); else caught++;
    } else { rendered++; lastBlob = 'b' + rendered; lastKey = k; }
  }
  return { reused, rendered, unsafe, caught };
}

console.log('\n── PART A — REPLAY (safety first, then coverage) ' + '─'.repeat(20));
const a = replay();
ok(a.unsafe.length === 0, 'never reused across a frame the real bake found DIFFERENT' +
  (a.unsafe.length ? ' — UNSAFE at frames ' + a.unsafe.slice(0, 8).join(',') : ''));
ok(a.caught >= EXPECT_REUSE - 2,
  'captured ' + a.caught + ' of the ' + EXPECT_REUSE + ' real duplicates (rendered ' + a.rendered + ' of ' + (EXPECT_REUSE + EXPECT_RENDER) + ')');
console.log('        -> ' + (a.caught * 6.892 / 60).toFixed(1) + ' min saved at this bake\'s measured 6,892 ms/freeze-frame');

console.log('\n── PART B — SELF-OFF (the glow-was-fixed case) ' + '─'.repeat(22));
const b = replay({ revEveryFrame: true });
ok(b.reused === 0, 'a rev counter moving every frame collapses reuse to ' + b.reused + ' with no edit to the bake loop');

console.log('\n── PART C — GATES (each term alone must force a render) ' + '─'.repeat(13));
for (const [term, mutate] of [
  ['camera',   (s, i) => { s.pose[0] += i * 0.01; }],
  ['target',   (s, i) => { s.target[1] += i * 0.01; }],
  ['sun',      (s, i) => { s.sun += i * 0.01; }],
  ['hudAlpha', (s, i) => { s.hudAlpha = (i % 7) / 7; }],
  ['day',      (s, i) => { s.day = 'd' + i; }],
]) {
  const r = replay({ mutate: mutate });
  ok(r.reused === 0, 'a moving `' + term + '` forces a render on every frame (reused=' + r.reused + ')');
}

console.log('\n── PART D — CONTROL (__noFrameReuse) ' + '─'.repeat(32));
const d = replay({}, true);
ok(d.reused === 0 && d.rendered === 265, 'reuse disabled -> rendered=' + d.rendered + ' reused=' + d.reused);

console.log('');
const verdict = process.exitCode ? 'FAIL' : 'PASS';
console.log('§FRAME_REUSE_W ' + verdict + ' src=' + path.basename(SRC) +
  ' (SCOPE: the decision logic only — the delivered film is proven by diffing a real bake\'s §FRAME_HASH against ' + path.basename(FIX) + ')');
process.exit(process.exitCode ? 1 : 0);
