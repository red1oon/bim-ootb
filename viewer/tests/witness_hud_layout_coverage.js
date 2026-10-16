#!/usr/bin/env node
/* ⚠ WITNESS — W-HUD-LAYOUT-COVERAGE, §129.55
 * (bim-compiler prompts/LOADPATH_FREEZE_POLISH_RESUME.md §129.55)
 *
 * THE ISSUE IT PROVES OR DISPROVES:
 *   `§HUD_LAYOUT overlaps=0` was not evidence that the HUD does not overlap, because most of the
 *   HUD never registered a rect. `_drawUnlessHold` (cinema_maxq.js) registers a 0,0,1,1 PLACEHOLDER
 *   for every layer it wraps, and the witness skips placeholders by design
 *   (`if ((a.w <= 1 && a.h <= 1) || …) continue;`). So the stat card, the storey card, the status
 *   box, the day counter, the clock, the sun readout, the path map and the measure box were in the
 *   registry by NAME ONLY and contributed nothing to `overlaps`/`overflow`.
 *   That is how §129.52 — the big-stats card handed the SAME `_stackY` as the pie panel and drawn
 *   on top of it — sat under a green `overlaps=0` for a day and had to be found BY EYE.
 *
 * WHAT IT ASSERTS — three parts, each naming what it would catch:
 *   PART A  WIRING     Every layer that has a publishable rect passes a `boxFn` third argument at
 *                      its `_drawUnlessHold`/`_hudHold` call site. Read from cinema_maxq.js's own
 *                      source text, so a wiring that is deleted later turns this red.
 *   PART B  PUBLISH    The drawers actually produce a real rect when they draw, and NOTHING when
 *                      they do not. Runs the REAL `bigStatsCompositeOntoCanvas` and the REAL
 *                      `filmBoxesDrawStatus`/`filmBoxesDrawMeasure` under a recording canvas —
 *                      never a hand-copied stub of their geometry.
 *   PART C  §129.52    The regression itself, in the real rects Part B produced, judged by
 *                      `_hudRectsOverlap` EXTRACTED FROM cinema_maxq.js's own source (not retyped):
 *                        same _stackY  -> overlaps >= 1   (the defect is visible)
 *                        stacked       -> overlaps == 0   (the fix is visible)
 *
 * WHAT MAKES IT A WITNESS AND NOT A SMOKE TEST:
 *   - NO-OP:     Part C's "same _stackY" leg must FAIL to overlap-detect on the OLD code, because
 *                the old code registered no card rect at all. A change that registers nothing new
 *                cannot make that leg fire.
 *   - WRONG:     Part B checks the published rect against the drawer's OWN `_box()` output, so a
 *                fix that registered some other invented rectangle is caught.
 *   - VACUOUS:   if a drawer never draws, or a module does not publish its entry point, the part
 *                prints INCONCLUSIVE and the run exits 2 — never a quiet PASS.
 *   - CONTROL:   run it against the pre-fix tree and it must FAIL:
 *                  m=$(git rev-parse HEAD~1)
 *                  for f in viewer/cpe_resource_panel.js viewer/cpe_film_boxes.js viewer/cinema_maxq.js; do
 *                    git show $m:$f > /tmp/before_$(basename $f); done
 *                  node viewer/tests/witness_hud_layout_coverage.js /tmp/before_
 *
 * RUN: node viewer/tests/witness_hud_layout_coverage.js [prefix]
 *      `prefix` (optional) is prepended to each source basename, for the control run above.
 */
const fs = require('fs'), path = require('path'), vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const PREFIX = process.argv[2] || null;
function srcPath(base) { return PREFIX ? (PREFIX + base) : path.join(ROOT, base); }
function read(base) { return fs.readFileSync(srcPath(base), 'utf8'); }

let fails = 0, inconclusive = 0;
const say = (s) => console.log(s);

// A rect no real drawer can ever produce, planted before each call to stand for "left over from an
// imaginary earlier frame". Anything that comes back EQUAL to it was not published by this frame's
// draw — the drawer simply never touched the global. Without this the pre-fix control reads a stale
// 999-rect as a successful publish and the witness passes on code that publishes nothing.
const STALE = { x: -7777, y: -7777, w: 9999, h: 9999 };
const isStale = (r) => !!(r && r.x === STALE.x && r.y === STALE.y && r.w === STALE.w && r.h === STALE.h);
const plantStale = () => ({ x: STALE.x, y: STALE.y, w: STALE.w, h: STALE.h });

// ── shared fakes ─────────────────────────────────────────────────────────────────────────────
function mkCtx() {
  return {
    font: '10px sans-serif', fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1,
    textAlign: '', textBaseline: '', shadowColor: '', shadowBlur: 0, shadowOffsetY: 0,
    globalCompositeOperation: 'source-over', filter: 'none',
    canvas: { width: 1920, height: 1080 },
    save() {}, restore() {}, translate() {}, scale() {}, rotate() {}, clip() {},
    beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {}, arcTo() {},
    bezierCurveTo() {}, quadraticCurveTo() {}, rect() {}, roundRect() {}, ellipse() {},
    fill() {}, stroke() {}, fillRect() {}, strokeRect() {}, clearRect() {}, drawImage() {},
    createLinearGradient() { return { addColorStop() {} }; },
    createRadialGradient() { return { addColorStop() {} }; },
    getImageData() { return { data: new Uint8ClampedArray(4) }; }, putImageData() {},
    setLineDash() {}, fillText() {}, strokeText() {},
    measureText(t) { const px = parseInt((this.font.match(/(\d+)px/) || [0, 10])[1], 10); return { width: String(t).length * px * 0.55 }; },
  };
}
function loadModule(base, setupName) {
  const win = {}; win.window = win; win.APP = {};
  win.document = { createElement: () => ({ getContext: () => mkCtx(), width: 0, height: 0 }) };
  win.devicePixelRatio = 1;
  // The stub for any global this module reaches for that the witness does not provide. It must
  // survive string concatenation and numeric coercion, or a single `'x' + someUnknownGlobal` in a
  // log line aborts the whole draw and the witness reports INCONCLUSIVE for the wrong reason.
  const mk = () => new Proxy(function () {}, {
    get: (t, k) => {
      if (k === 'then') return undefined;
      if (k === Symbol.toPrimitive) return () => 0;
      if (k === 'toString' || k === 'valueOf') return () => 0;
      if (k === Symbol.toStringTag) return 'stub';
      return mk();
    },
    set: () => true, apply: () => mk(), construct: () => mk(),
  });
  // `has: () => true` makes the sandbox claim every identifier, so a plain `get` that falls
  // through to `mk()` would hand the module a STUB for `Math`, `JSON`, `Date` … and every
  // `Math.round(h * 0.36)` in the real geometry would quietly return the stub. Measured: every
  // published rect came back 0,0,0,0. Real built-ins first, stub only for what genuinely is not
  // there (the browser globals this module reaches for and the witness does not need).
  const ctxv = vm.createContext(new Proxy(win, {
    has: () => true,
    get: (t, k) => {
      if (k in t) return t[k];
      if (k === 'window') return win;
      if (typeof k === 'string' && Object.prototype.hasOwnProperty.call(globalThis, k)) return globalThis[k];
      if (typeof k === 'string' && typeof global[k] !== 'undefined') return global[k];
      return mk();
    },
    set: (t, k, v) => { t[k] = v; return true; },
  }));
  try { vm.runInContext(read(base), ctxv, { filename: base }); }
  catch (e) { return { err: 'load threw: ' + e.message }; }
  const setup = ctxv[setupName] || win[setupName];
  if (typeof setup !== 'function') return { err: setupName + ' not published' };
  try { setup(win.APP); } catch (e) { return { err: 'setup threw: ' + e.message }; }
  return { A: win.APP };
}

// ── PART A — WIRING, read from cinema_maxq.js's own text ─────────────────────────────────────
// Each entry: [layer name at its _drawUnlessHold/_hudHold call site, the global it must read].
// `hud.pie` and `roster` are EXEMPT and the reason is asserted below, not assumed: their real
// rects are registered by the drawers themselves (`resource-panel` / `stats-panel`), so a second
// registration under the wrapper's name would be the same rect twice — a permanent false FAIL.
const WIRED = [
  ['hud.pathmap',          'pathOverviewLastBox'],
  ['daycounter',           'dayCounterLastBox'],
  ['suncompass.clock',     'sunClockLastBox'],
  ['suncompass.readout',   'sunReadoutLastBox'],
  ['hud.status',           'filmBoxesStatusLastBox'],
  ['measure.box',          'filmBoxesMeasureLastBox'],
];
const EXEMPT = { 'hud.pie': 'resource-panel', 'roster': 'stats-panel' };

say('── PART A — WIRING (cinema_maxq.js source) ' + '─'.repeat(40));
let maxq = '';
try { maxq = read('cinema_maxq.js'); }
catch (e) { say('§HUD_COVERAGE INCONCLUSIVE — cannot read cinema_maxq.js: ' + e.message); process.exit(2); }

// The wrapper must accept a boxFn at all, and _hudHold must forward it — without this every
// per-layer check below would be vacuous.
const takesBoxFn = /function _drawUnlessHold\(name, fn, boxFn\)/.test(maxq);
const holdForwards = /function _hudHold\(name, fn, boxFn\) \{ return _drawUnlessHold\(name, fn, boxFn\); \}/.test(maxq);
say((takesBoxFn ? '  ok    ' : '  FAIL  ') + '_drawUnlessHold(name, fn, boxFn)');
say((holdForwards ? '  ok    ' : '  FAIL  ') + '_hudHold forwards boxFn');
if (!takesBoxFn) fails++;
if (!holdForwards) fails++;

for (const [layer, global] of WIRED) {
  // the call site, up to the close of its own _drawUnlessHold/_hudHold call
  const i = maxq.indexOf("('" + layer + "',");
  if (i < 0) { say('  INCONC ' + layer + ' — no call site found'); inconclusive++; continue; }
  const window_ = maxq.slice(i, i + 1400);
  const hasBox = new RegExp('return A\\.' + global + ';').test(window_);
  say((hasBox ? '  ok    ' : '  FAIL  ') + layer + ' -> A.' + global);
  if (!hasBox) fails++;
}
for (const layer of Object.keys(EXEMPT)) {
  const i = maxq.indexOf("('" + layer + "',");
  if (i < 0) { say('  INCONC ' + layer + ' — no call site found'); inconclusive++; continue; }
  // the exemption is only sound while the drawer registers the rect under its own name
  const drawerRegisters = new RegExp("_hudLayoutRegister\\('" + EXEMPT[layer] + "'");
  const drawerSrc = read('cpe_resource_panel.js');
  const sound = drawerRegisters.test(drawerSrc);
  say((sound ? '  ok    ' : '  FAIL  ') + layer + ' EXEMPT — drawer registers ' + EXEMPT[layer] + ' itself');
  if (!sound) fails++;
}

// ── PART B — PUBLISH, from the REAL drawers ──────────────────────────────────────────────────
say('');
say('── PART B — PUBLISH (real drawers, recording canvas) ' + '─'.repeat(28));
const W = 1920, H = 1080;
const regs = [];

const rp = loadModule('cpe_resource_panel.js', 'setupCpeResourcePanel');
let cardBox = null, panelBox = null;
if (rp.err) { say('  INCONC cpe_resource_panel.js — ' + rp.err); inconclusive++; }
else {
  const A = rp.A;
  A._hudLayoutRegister = (name, x, y, w, h, parent) => regs.push({ name, x, y, w, h, parent: parent || null });
  A.resourcePanelLightDir = A.resourcePanelLightDir || (() => ({ x: 0.5, y: 0.5 }));
  const shown = { opacity: 1, roster: { rows: [{ name: 'ARC', text: 'Architectural', heads: 4 }, { name: 'STR', text: 'Structural', heads: 3 }] } };

  // the no-draw contract first: opacity 0 must publish NOTHING
  A.bigStatsLastBox = plantStale();
  try { A.bigStatsCompositeOntoCanvas(mkCtx(), W, H, shown, 0, 'tl', 0, null); } catch (e) {}
  const clearedOnNoDraw = (A.bigStatsLastBox == null);   // cleared, not merely left holding STALE
  say((clearedOnNoDraw ? '  ok    ' : '  FAIL  ') + 'bigStats publishes nothing on a frame it does not draw');
  if (!clearedOnNoDraw) fails++;

  regs.length = 0;
  A.bigStatsLastBox = plantStale();
  try { A.bigStatsCompositeOntoCanvas(mkCtx(), W, H, shown, 1, 'tl', 0, null); }
  catch (e) { say('  INCONC bigStats draw threw: ' + e.message); inconclusive++; }
  cardBox = isStale(A.bigStatsLastBox) ? null : (A.bigStatsLastBox || null);
  const statsReg = regs.filter((r) => r.name === 'stats-panel')[0] || null;
  if (!cardBox) { say('  FAIL  bigStats published no rect on a frame it DID draw'); fails++; }
  else say('  ok    bigStatsLastBox = ' + [cardBox.x, cardBox.y, cardBox.w, cardBox.h].map(Math.round).join(','));
  if (!statsReg) { say('  FAIL  bigStats registered no `stats-panel` rect'); fails++; }
  else {
    // the published rect and the registered rect must be the SAME geometry — a fix that invented
    // a second rectangle for the registry is caught here.
    const same = cardBox && statsReg.x === cardBox.x && statsReg.y === cardBox.y && statsReg.w === cardBox.w && statsReg.h === cardBox.h;
    say((same ? '  ok    ' : '  FAIL  ') + 'stats-panel registered rect == published rect');
    if (!same) fails++;
    const real = statsReg.w > 1 && statsReg.h > 1;
    say((real ? '  ok    ' : '  FAIL  ') + 'stats-panel is a REAL rect (w>1 && h>1), not a 0,0,1,1 placeholder');
    if (!real) fails++;
  }

  // the main panel, for Part C
  regs.length = 0;
  const info = { rows: [{ name: 'ARC', text: 'Architectural', heads: 4 }], totalHeads: 4, progress: 0.5, dayKey: 'd50', held: false };
  try { A.resourcePanelCompositeOntoCanvas(mkCtx(), W, H, info, 1, 'tl', 0); } catch (e) {}
  panelBox = A.resourcePanelLastBox || null;
  if (!panelBox) { say('  INCONC resource panel published no rect; Part C cannot be judged'); inconclusive++; }
  else say('  ok    resourcePanelLastBox = ' + [panelBox.x, panelBox.y, panelBox.w, panelBox.h].map(Math.round).join(','));
}

const fb = loadModule('cpe_film_boxes.js', 'setupCpeFilmBoxes');
if (fb.err) { say('  INCONC cpe_film_boxes.js — ' + fb.err); inconclusive++; }
else {
  const A = fb.A;
  if (typeof A.filmBoxesArm === 'function') { try { A.filmBoxesArm(W, H, {}); } catch (e) {} }
  A.filmBoxesStatusLastBox = plantStale();
  let n = 0;
  try { n = A.filmBoxesDrawStatus(mkCtx(), W, H, A.filmBoxesStatusRows ? A.filmBoxesStatusRows(null) : []); } catch (e) { say('  INCONC status draw threw: ' + e.message); inconclusive++; }
  const sb = isStale(A.filmBoxesStatusLastBox) ? null : A.filmBoxesStatusLastBox;
  const L = A.filmBoxesLayout ? A.filmBoxesLayout(W, H, {}) : null;
  if (!sb) { say('  FAIL  filmBoxesDrawStatus published no rect (rows drawn=' + n + ')'); fails++; }
  else {
    const same = L && L.status && sb.x === L.status.x && sb.y === L.status.y && sb.w === L.status.w && sb.h === L.status.h;
    say((same ? '  ok    ' : '  FAIL  ') + 'filmBoxesStatusLastBox == its own L.status (' + [sb.x, sb.y, sb.w, sb.h].map(Math.round).join(',') + ')');
    if (!same) fails++;
  }
  // measure box: nothing posted this frame => must publish nothing
  A.filmBoxesMeasureLastBox = plantStale();
  if (A.filmBoxesMeasureReset) A.filmBoxesMeasureReset();
  try { A.filmBoxesDrawMeasure(mkCtx(), W, H, null, 0); } catch (e) {}
  const idleClear = (A.filmBoxesMeasureLastBox == null);
  say((idleClear ? '  ok    ' : '  FAIL  ') + 'measure box publishes nothing on an idle frame');
  if (!idleClear) fails++;
  // and a real rect on a frame that does post
  if (A.filmBoxesMeasurePost) {
    A.filmBoxesMeasureLastBox = plantStale();
    try { A.filmBoxesMeasurePost('Floor plate', ['12.4 m'], null); A.filmBoxesDrawMeasure(mkCtx(), W, H, null, 1); } catch (e) {}
    const mb = isStale(A.filmBoxesMeasureLastBox) ? null : A.filmBoxesMeasureLastBox;
    const okM = !!(mb && mb.w > 1 && mb.h > 1);
    say((okM ? '  ok    ' : '  FAIL  ') + 'measure box publishes a REAL rect on a frame that posts');
    if (!okM) fails++;
  } else { say('  INCONC filmBoxesMeasurePost not published'); inconclusive++; }
}

// ── PART C — §129.52 REGRESSION, judged by cinema_maxq.js's OWN overlap rule ─────────────────
say('');
say('── PART C — §129.52 regression (card vs pie panel) ' + '─'.repeat(30));
// EXTRACTED, never retyped: pull _hudRectsOverlap straight out of cinema_maxq.js's source so this
// witness can never drift from the rule the bake actually applies.
const mOv = maxq.match(/function _hudRectsOverlap\(a, b\) \{[\s\S]*?\n  \}/);
if (!mOv) { say('§HUD_COVERAGE INCONCLUSIVE — could not extract _hudRectsOverlap from cinema_maxq.js'); process.exit(2); }
const overlap = vm.runInNewContext(mOv[0] + '\n_hudRectsOverlap;');

if (!cardBox || !panelBox) { say('  INCONC no real card/panel rects to judge — the card publishes nothing, so this leg cannot fire (see PART B)'); inconclusive++; }
else {
  // The defect: §129.52 handed the card the SAME _stackY as the pie panel.
  const cardAtSameY = { x: panelBox.x, y: panelBox.y, w: cardBox.w, h: cardBox.h };
  const collides = overlap(panelBox, cardAtSameY);
  say((collides ? '  ok    ' : '  FAIL  ') + '§129.52 layout (same _stackY) is DETECTED as an overlap');
  if (!collides) fails++;
  // The fix: _stackY advances past the panel plus the row gap.
  const gapY = 0;   // 0 is the WORST case for this check — any real gap only separates them further
  const cardStacked = { x: panelBox.x, y: panelBox.y + panelBox.h + gapY, w: cardBox.w, h: cardBox.h };
  const clean = !overlap(panelBox, cardStacked);
  say((clean ? '  ok    ' : '  FAIL  ') + 'stacked layout (_stackY += panel.h + gap) reads CLEAN');
  if (!clean) fails++;
}

say('');
const verdict = inconclusive && !fails ? 'INCONCLUSIVE' : (fails ? 'FAIL' : 'PASS');
say('§HUD_COVERAGE ' + verdict + ' fails=' + fails + ' inconclusive=' + inconclusive +
  ' wiredLayers=' + WIRED.length + ' exempt=' + Object.keys(EXEMPT).join(',') +
  (PREFIX ? ' srcPrefix=' + PREFIX : ''));
process.exit(verdict === 'PASS' ? 0 : (verdict === 'INCONCLUSIVE' ? 2 : 1));
