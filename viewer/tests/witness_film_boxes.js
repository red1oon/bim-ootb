#!/usr/bin/env node
// WITNESS — film_boxes: §HUD_BOX / §STATUS_BOX / §MEASURE_BOX, the three fixed screen boxes.
// Spec: bim-compiler prompts/MEP_CLASH_REVEAL_MOVIE.md §38.1a + §38.1b (the user's two rulings) and
// §40.1 (the implementation contract). Witness id: W-FILM-BOXES.
//
// ISSUE THIS PROVES OR DISPROVES: the user's complaint was that the film's status text "flickers
// around" — it moved and resized every time what it said changed. Does the film now put every 2D
// text draw into exactly THREE rectangles that (a) are identical on every frame of a whole film,
// (b) never overlap each other, and (c) account for every text draw in _captureFrame — with a row
// that has nothing to say left BLANK rather than removed, and the Measure panel drawn NOT AT ALL
// when no Measure beat is live?
// It can say NO: FAIL on any of the invariants; INCONCLUSIVE when the sampled film produced no text
// at all (nothing was judged); and the static scan FAILS on any unregistered draw call, which is the
// guard against the scope-blind pass (a new overlay added to _captureFrame that nobody classified).
//
// POPULATION: one row per sampled film second across a whole film's worth of frames, each carrying
// the three rectangles as they were computed FOR THAT FRAME plus every text draw a recording 2D
// context caught, tagged with the box that contains it. No GPU, no browser: cpe_film_boxes.js's
// geometry and drawing are pure and are exercised directly.
// Red control: one frame's status box is nudged 1 px — the rectangles are then not constant.
//
// Command: node viewer/tests/witness_film_boxes.js [--frames 4699] [--fps 24] [--w 1280] [--h 720] [--pos tr]
// Log Mandate: tee to out/witness_film_boxes.log and read it.
'use strict';
const fs = require('fs'), path = require('path');
const { Witness } = require('../../witness_kit/contract');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const ROOT = path.resolve(__dirname, '..', '..');
const W = +arg('w', 1280), H = +arg('h', 720), FPS = +arg('fps', 24);
const NFRAMES = +arg('frames', 4699);            // the real Hospital full film
const POS = arg('pos', 'tr');

// ── the module under test, loaded the way the page loads it (a plain global function)
const src = fs.readFileSync(path.join(ROOT, 'viewer', 'cpe_film_boxes.js'), 'utf8');
global.window = global.window || {};
new Function(src + '\nglobal.__setup = setupCpeFilmBoxes;')();
const setup = global.__setup;

// A minimal APP: the box module asks for exactly one thing from the rest of the viewer.
const A = { dayCounterBoxSize(h) { const f = Math.max(14, Math.round(h * 0.026)); return { h: Math.round(f * 0.55) * 2 + f, margin: Math.round(h * 0.028) }; } };
const quiet = console.log; let mute = false;
console.log = (...a) => { if (!mute) quiet(...a); };
setup(A);

// ── a RECORDING 2D context: every fillText is captured with the pen position and the size implied
// by the font string, so a draw can be located without a canvas.
function recCtx() {
  const draws = [];
  const st = { font: '12px x', fillStyle: '#000', textAlign: 'left', textBaseline: 'alphabetic' };
  return {
    draws,
    canvas: { width: W, height: H },
    save() {}, restore() {}, beginPath() {}, fill() {}, stroke() {}, clip() {},
    fillRect(x, y, w, h) { draws.push({ kind: 'rect', x, y, w, h }); },
    roundRect(x, y, w, h) { draws.push({ kind: 'rect', x, y, w, h }); },
    measureText(t) { const px = +(/(\d+)px/.exec(this.font) || [0, 12])[1]; return { width: String(t).length * px * 0.55 }; },
    fillText(t, x, y) {
      const px = +(/(\d+)px/.exec(this.font) || [0, 12])[1];
      draws.push({ kind: 'text', text: String(t), x, y, w: this.measureText(t).width, px });
    },
    get font() { return st.font; }, set font(v) { st.font = v; },
    get fillStyle() { return st.fillStyle; }, set fillStyle(v) { st.fillStyle = v; },
    get textAlign() { return st.textAlign; }, set textAlign(v) { st.textAlign = v; },
    get textBaseline() { return st.textBaseline; }, set textBaseline(v) { st.textBaseline = v; },
    get globalAlpha() { return 1; }, set globalAlpha(_v) {}
  };
}
// textBaseline is 'middle' everywhere the boxes draw, so a glyph occupies [y-0.6px, y+0.6px].
const inside = (d, b) => d.x >= b.x - 1 && d.x + d.w <= b.x + b.w + 1 &&
                        d.y - d.px * 0.6 >= b.y - 1 && d.y + d.px * 0.6 <= b.y + b.h + 1;

// ── a film's worth of frames. The four caption sources are driven with the SHAPES the bake hands
// them (cinema_maxq.js's _statusSrc): {name,opacity} objects and a bare phase string, including the
// empty stretches — a film is mostly silence and the box must not move through it.
const armed = { pos: POS, day: true, overview: true, stats: true };
mute = true;
const L0 = A.filmBoxesArm(W, H, armed);
mute = false;
console.log('§WITNESS_FILM_BOXES_ENV frame=' + W + 'x' + H + ' frames=' + NFRAMES + ' fps=' + FPS + ' pos=' + POS);
console.log('§WITNESS_FILM_BOXES_RECT hud=' + JSON.stringify(L0.hud) + ' status=' + JSON.stringify(L0.status) +
  ' measure=' + JSON.stringify(L0.measure));

const rows = [];
mute = true;
for (let i = 0; i < NFRAMES; i += Math.max(1, Math.round(NFRAMES / 400))) {   // 400 samples over the film
  const sec = i / FPS;
  // the real film's own shape: an indoor stretch with a room, a reveal round with a discipline
  // caption, a storey-reveal window, and long silences in between (§37's measured structure).
  const src2 = {
    storey: (sec > 183 && sec < 188) ? { name: '🏢 Level ' + (1 + (i % 5)), opacity: 1 } : null,
    room: (sec > 18 && sec < 69) ? { name: 'Ward Corridor ' + (i % 7), opacity: 1 } : null,
    buildup: (sec < 90) ? ['Substructure', 'Superstructure', 'Envelope', 'Fit-out'][i % 4] : '',
    reveal: (sec > 157 && sec < 183) ? { name: 'Mechanical — 1,204 elements', opacity: 1 } : null
  };
  const statusRows = A.filmBoxesStatusRows(src2);
  const ctx = recCtx();
  // Measure posts only inside the beats' own windows — everywhere else the box must draw NOTHING.
  A.filmBoxesMeasureReset();
  const measureLive = (sec > 9.3 && sec < 14.9) || (sec > 18.2 && sec < 32.2);
  if (measureLive) A.filmBoxesMeasurePost('Floor plate', ['Floor area 7,585 m² (mesh footprint)', '150mm Concrete With 75mm Metal Deck', 'Level 6']);
  A.filmBoxesDrawStatus(ctx, W, H, statusRows);
  const mDrawn = A.filmBoxesDrawMeasure(ctx, W, H);
  const L = A.filmBoxesLayout(W, H, armed);
  const texts = ctx.draws.filter(d => d.kind === 'text');
  const boxes = { hud: L.hud, status: L.status, measure: L.measure };
  rows.push({
    frame: i, sec: +sec.toFixed(3),
    hud: L.hud, status: L.status, measure: L.measure,
    statusFilled: statusRows.filter(r => r.text).length,
    statusLabels: statusRows.map(r => r.label).join('|'),
    measureLive: measureLive, measureDrawn: mDrawn,
    texts: texts.length,
    unattributed: texts.filter(d => !Object.keys(boxes).some(k => inside(d, boxes[k]))).length
  });
}
mute = false;

// ── THE ANTI-SCOPE-BLIND SCAN. The rows above prove the boxes behave; they cannot prove that
// _captureFrame draws nothing else, because they do not run it. So read it and classify every
// composite call in its body against a declared registry — an unregistered one FAILS.
const maxq = fs.readFileSync(path.join(ROOT, 'viewer', 'cinema_maxq.js'), 'utf8');
const bodyStart = maxq.indexOf('function _captureFrame(');
const bodyEnd = maxq.indexOf('// §MAXQ_MP4 — mp4/H.264 stitch', bodyStart);
const body = maxq.slice(bodyStart, bodyEnd);
const REGISTRY = {
  flythruDatumCompositeOntoCanvas: 'in-model',       // §17.5 marks laid in the model's own planes
  flythruCuesCompositeOntoCanvas: 'in-model',        // dimension arrows; its panel posts to §MEASURE_BOX
  linearBeatCompositeOntoCanvas: 'in-model',
  slabBeatCompositeOntoCanvas: 'measure',            // posts only
  indoorBeatsCompositeOntoCanvas: 'in-model',
  flyoutBeatsCompositeOntoCanvas: 'in-model',      // arrowed spans in the model; its figure posts to §MEASURE_BOX
  clashLabelsCompositeOntoCanvas: 'clash-exception', // §40.1: leader-anchored to a 3D contact
  filmBoxesDrawMeasure: 'measure',
  filmBoxesDrawStatus: 'status',
  roomTitleCompositeOntoCanvas: 'status-fallback',   // only in the `else` when the module failed to load
  dayCounterCompositeOntoCanvas: 'hud',
  pathOverviewCompositeOntoCanvas: 'hud',
  resourcePanelCompositeOntoCanvas: 'hud',
  bigStatsCompositeOntoCanvas: 'hud'
};
const called = [...new Set((body.match(/A\.([A-Za-z]+CompositeOntoCanvas|filmBoxesDraw[A-Za-z]+)\s*\(/g) || [])
  .map(m => m.replace(/^A\./, '').replace(/\s*\($/, '')))];
const unregistered = called.filter(c => !REGISTRY[c]);
console.log('§FILM_BOXES_CHAIN calls=' + called.length + ' [' + called.map(c => c + ':' + (REGISTRY[c] || 'UNREGISTERED')).join(' ') + ']');
const fallbackOnly = /\} else if \(titleInfo && titleInfo\.opacity > 0 && A\.roomTitleCompositeOntoCanvas\)/.test(body);

const totalText = rows.reduce((a, r) => a + r.texts, 0);
if (!totalText) console.log('§WITNESS_FILM_BOXES INCONCLUSIVE — no text was drawn on any sampled frame; nothing was judged');

const eqRect = (a, b) => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
Witness('film_boxes')
  .population(() => rows)
  .schema({ type: 'object', required: ['frame', 'sec', 'hud', 'status', 'measure', 'texts', 'unattributed', 'statusFilled', 'measureLive', 'measureDrawn'],
    properties: { frame: { type: 'integer', minimum: 0 }, sec: { type: 'number', minimum: 0 },
      hud: { type: 'object', required: ['x', 'y', 'w', 'h'] }, status: { type: 'object', required: ['x', 'y', 'w', 'h'] },
      measure: { type: 'object', required: ['x', 'y', 'w', 'h'] },
      texts: { type: 'integer', minimum: 0 }, unattributed: { type: 'integer', minimum: 0 },
      statusFilled: { type: 'integer', minimum: 0, maximum: 4 }, statusLabels: { type: 'string' },
      measureLive: { type: 'boolean' }, measureDrawn: { type: 'integer', minimum: 0 } } })
  .invariant('§38.1b the three rectangles are IDENTICAL on every frame of the film',
    rs => rs.every(r => eqRect(r.hud, rs[0].hud) && eqRect(r.status, rs[0].status) && eqRect(r.measure, rs[0].measure)))
  .invariant('the three rectangles are pairwise non-overlapping',
    rs => !A.filmBoxesOverlap(rs[0].hud, rs[0].status) && !A.filmBoxesOverlap(rs[0].hud, rs[0].measure) && !A.filmBoxesOverlap(rs[0].status, rs[0].measure))
  .invariant('§STATUS_BOX sits in the same column as §HUD_BOX and directly below it (top corner)',
    rs => rs[0].status.x === rs[0].hud.x && rs[0].status.w === rs[0].hud.w &&
          (POS === 'tl' || POS === 'tr' ? rs[0].status.y >= rs[0].hud.y + rs[0].hud.h : rs[0].status.y + rs[0].status.h <= rs[0].hud.y))
  .invariant('every text draw lands inside one of the three boxes (0 unattributed)',
    rs => rs.every(r => r.unattributed === 0))
  .invariant('§38.1b a status row with nothing to say is BLANK, never removed — 4 labels always, box height fixed',
    rs => rs.every(r => r.statusLabels === 'Storey|Room|Build-up|Reveal' && r.status.h === rs[0].status.h))
  .invariant('the film really does have silent stretches AND filled ones (else the constancy proves nothing)',
    rs => rs.some(r => r.statusFilled === 0 || r.statusFilled < 4) && rs.some(r => r.statusFilled > 0))
  .invariant('§38.1a the Measure box draws NOTHING when no Measure beat is live, and something when one is',
    rs => rs.every(r => (r.measureLive ? r.measureDrawn > 0 : r.measureDrawn === 0)) && rs.some(r => r.measureDrawn > 0))
  .invariant('§40.1 every composite call in _captureFrame is registered to a box (no scope-blind pass)',
    () => unregistered.length === 0)
  .invariant('_captureFrame draws the status box, the measure box, and uses the caption plate ONLY as the module-missing fallback',
    () => called.indexOf('filmBoxesDrawStatus') >= 0 && called.indexOf('filmBoxesDrawMeasure') >= 0 && fallbackOnly)
  .redControl(rs => { const c = rs.map(r => Object.assign({}, r)); if (c[1]) c[1].status = Object.assign({}, c[1].status, { y: c[1].status.y + 1 }); return c; })
  .run();
if (unregistered.length) console.log('§FILM_BOXES_CHAIN UNREGISTERED=[' + unregistered.join(' ') + '] — classify each in REGISTRY above or move it into a box');
