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
// when no Measure beat is live? §56.1 (2026-09-10): once a marker's own posting window ends, does
// the Measure box LINGER on its last content for up to filmBoxesMeasureLingerS() film-seconds
// before finally clearing, rather than going blank the very next frame nothing posts?
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
    fillRect(x, y, w, h) { draws.push({ kind: 'rect', x, y, w, h, fill: st.fillStyle }); },
    roundRect(x, y, w, h) { draws.push({ kind: 'rect', x, y, w, h, fill: st.fillStyle }); },
    measureText(t) { const px = +(/(\d+)px/.exec(this.font) || [0, 12])[1]; return { width: String(t).length * px * 0.55 }; },
    fillText(t, x, y) {
      const px = +(/(\d+)px/.exec(this.font) || [0, 12])[1];
      draws.push({ kind: 'text', text: String(t), x, y, w: this.measureText(t).width, px, fill: st.fillStyle });
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
let _lastLiveSec = -Infinity;
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
  // Measure posts only inside the beats' own windows — everywhere else the box must draw NOTHING,
  // except within LINGER_S of the LAST SAMPLE that actually posted (§56.1) — not the window's nominal
  // edge, since the 0.5s sampling stride does not land exactly on it, same as a real bake's own last
  // real frame before a marker leaves.
  A.filmBoxesMeasureReset();
  const WINDOWS = [[9.3, 14.9], [18.2, 32.2]];   // the real film's own gap between them (3.3s) exceeds
                                                   // LINGER_S, so linger from one window never reaches the next
  const measureLive = WINDOWS.some(([a, b]) => sec > a && sec < b);
  const LINGER_S = A.filmBoxesMeasureLingerS;
  if (measureLive) _lastLiveSec = sec;
  const lingering = !measureLive && _lastLiveSec > -Infinity && (sec - _lastLiveSec) <= LINGER_S;
  if (measureLive) A.filmBoxesMeasurePost('Floor plate', ['Floor area 7,585 m² (mesh footprint)', '150mm Concrete With 75mm Metal Deck', 'Level 6']);
  A.filmBoxesDrawStatus(ctx, W, H, statusRows);
  const mDrawn = A.filmBoxesDrawMeasure(ctx, W, H, undefined, sec);
  const L = A.filmBoxesLayout(W, H, armed);
  const texts = ctx.draws.filter(d => d.kind === 'text');
  const boxes = { hud: L.hud, status: L.status, measure: L.measure };
  rows.push({
    frame: i, sec: +sec.toFixed(3),
    hud: L.hud, status: L.status, measure: L.measure,
    statusFilled: statusRows.filter(r => r.text).length,
    statusLabels: statusRows.map(r => r.label).join('|'),
    measureLive: measureLive, lingering: lingering, measureDrawn: mDrawn,
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
  ruleFindingsFilmCompositeOntoCanvas: 'measure',    // §59 — posts only, same as slabBeatCompositeOntoCanvas
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

// ══ §MEASURE_TITLE_INK (MEP_CLASH_REVEAL_MOVIE.md §61) — the Measure box title default is BLUE ══
// ISSUES THESE PROVE OR DISPROVE:
//   M1 the title default really moved off §7's yellow to the project blue (fails pre-change)
//   M2 §61.3 — a QUEUED category ink (§59 structural/egress) still overrides that default, so the
//      Sanity entries look exactly as they did; changing the fallback must not change them
//   M3 only the TITLE colour moved — the body rows are still white
// Thrown, not chained: these judge one draw each, not the sampled film population above.
(function measureTitleInk() {
  const MB = [];
  function titleAndRows(ink) {
    const c = recCtx();
    A.filmBoxesMeasureReset();
    A.filmBoxesArm(W, H, armed);
    A.filmBoxesMeasurePost('Structural — column continuity', ['STB Stütze', 'Level 1', 'CRITICAL'], ink);
    A.filmBoxesDrawMeasure(c, W, H, armed, 10);
    const t = c.draws.filter(d => d.kind === 'text');
    return { title: t[0], rows: t.slice(1) };
  }
  const mk = (n, ok, x) => { MB.push({ n, ok, x }); console.log('  ' + (ok ? 'PASS' : 'FAIL') + ' ' + n + (x ? '  ' + x : '')); };

  const plain = titleAndRows(undefined);
  mk('M1 §61 Measure title default is #4fc3f7, not §7\'s #ffd600',
     plain.title && plain.title.fill === '#4fc3f7', plain.title && plain.title.fill);

  const tinted = titleAndRows('#ffaa33');
  mk('M2 §61.3 a queued category ink still overrides the default (Sanity look unchanged)',
     tinted.title && tinted.title.fill === '#ffaa33', tinted.title && tinted.title.fill);

  mk('M3 §61 body rows stay white — only the title colour moved',
     plain.rows.length > 0 && plain.rows.every(r => r.fill === '#fff'),
     plain.rows.map(r => r.fill).join(','));

  // §64 §MEASURE_PLATE_SAME_HUE — the plate must never be filled with the title's own colour.
  function plateAndTitle(ink) {
    const c = recCtx();
    A.filmBoxesMeasureReset();
    A.filmBoxesArm(W, H, armed);
    A.filmBoxesMeasurePost('Structural — column continuity', ['STB Stütze', 'Level 1', 'CRITICAL'], ink);
    A.filmBoxesDrawMeasure(c, W, H, armed, 10);
    const rect = c.draws.filter(d => d.kind === 'rect');
    const text = c.draws.filter(d => d.kind === 'text');
    return { plate: rect.length ? rect[0].fill : null, title: text.length ? text[0].fill : null };
  }
  // Compare the actual RGB, never the strings: 'rgba(255,170,51,0.32)' and '#ffaa33' are the SAME
  // hue in two notations, and a string compare would call that a pass — the exact way this bug hid.
  function rgbOf(css) {
    if (!css) return null;
    let m = /^#?([0-9a-f]{6})$/i.exec(css);
    if (m) { const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
    m = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(css);
    return m ? [+m[1], +m[2], +m[3]] : null;
  }
  const sameHue = (a, b) => { const x = rgbOf(a), y = rgbOf(b); return !!x && !!y && x[0] === y[0] && x[1] === y[1] && x[2] === y[2]; };

  const pt = plateAndTitle('#ffaa33');
  mk('P1 §64 the plate RGB is NOT the title\'s own RGB (the yellow-on-yellow bug)',
     !sameHue(pt.plate, pt.title), 'plate=' + pt.plate + ' title=' + pt.title);
  mk('P2 §64.1 the Measure plate is the standard dark fill, with an ink',
     pt.plate === 'rgba(0,0,0,0.45)', String(pt.plate));
  const pt2 = plateAndTitle(undefined);
  mk('P2b §64.1 the Measure plate is the standard dark fill, without an ink',
     pt2.plate === 'rgba(0,0,0,0.45)', String(pt2.plate));
  mk('P3 §64.2 the category ink still reaches the TITLE — no information lost',
     pt.title === '#ffaa33', String(pt.title));
  mk('P3b §61 intact — no ink still draws the blue title',
     pt2.title === '#4fc3f7', String(pt2.title));

  // §65 — when the main HUD's plate is available the boxes must DELEGATE to it, not paint a
  // look-alike. The checks above exercise the fallback (this mock A has no cpePanelPlate).
  (function delegates() {
    const calls = [];
    const saved = A.cpePanelPlate;
    A.cpePanelPlate = (ctx, x, y, w, h, rad) => { calls.push({ x, y, w, h, rad }); };
    const c = recCtx();
    A.filmBoxesMeasureReset();
    A.filmBoxesArm(W, H, armed);
    A.filmBoxesMeasurePost('Structural — column continuity', ['a', 'b', 'c'], '#ffaa33');
    A.filmBoxesDrawMeasure(c, W, H, armed, 10);
    A.cpePanelPlate = saved;
    const L = A.filmBoxesLayout(W, H, armed);
    mk('P4 §65 the Measure box delegates its background to the main HUD plate (A.cpePanelPlate)',
       calls.length === 1 && calls[0].x === L.measure.x && calls[0].y === L.measure.y &&
       calls[0].w === L.measure.w && calls[0].h === L.measure.h, JSON.stringify(calls));
    mk('P4b §65 and paints NO fill of its own when delegating (no look-alike plate underneath)',
       c.draws.filter(d => d.kind === 'rect').length === 0,
       JSON.stringify(c.draws.filter(d => d.kind === 'rect').map(d => d.fill)));
  })();

  const bad = MB.filter(m => !m.ok);
  console.log('§WITNESS_MEASURE_TITLE_INK pass=' + (MB.length - bad.length) + ' fail=' + bad.length);
  if (bad.length) throw new Error('§61 §MEASURE_TITLE_INK FAILED: ' + bad.map(m => m.n).join(' | '));
})();

const eqRect = (a, b) => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
Witness('film_boxes')
  .population(() => rows)
  .schema({ type: 'object', required: ['frame', 'sec', 'hud', 'status', 'measure', 'texts', 'unattributed', 'statusFilled', 'measureLive', 'lingering', 'measureDrawn'],
    properties: { frame: { type: 'integer', minimum: 0 }, sec: { type: 'number', minimum: 0 },
      hud: { type: 'object', required: ['x', 'y', 'w', 'h'] }, status: { type: 'object', required: ['x', 'y', 'w', 'h'] },
      measure: { type: 'object', required: ['x', 'y', 'w', 'h'] },
      texts: { type: 'integer', minimum: 0 }, unattributed: { type: 'integer', minimum: 0 },
      statusFilled: { type: 'integer', minimum: 0, maximum: 4 }, statusLabels: { type: 'string' },
      measureLive: { type: 'boolean' }, lingering: { type: 'boolean' }, measureDrawn: { type: 'integer', minimum: 0 } } })
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
  .invariant('§38.1a the Measure box draws NOTHING when no Measure beat is live and its §56.1 linger has expired, and something when either is true',
    rs => rs.every(r => ((r.measureLive || r.lingering) ? r.measureDrawn > 0 : r.measureDrawn === 0)) && rs.some(r => r.measureDrawn > 0))
  .invariant('§56.1 the box actually exercises the lingering path at least once (else the claim below is untested)',
    rs => rs.some(r => r.lingering))
  .invariant('§56.1 the box actually exercises full expiry at least once — some sample sits past every window\'s own end plus the linger, and is blank',
    rs => rs.some(r => !r.measureLive && !r.lingering && r.measureDrawn === 0))
  .invariant('§40.1 every composite call in _captureFrame is registered to a box (no scope-blind pass)',
    () => unregistered.length === 0)
  .invariant('_captureFrame draws the status box, the measure box, and uses the caption plate ONLY as the module-missing fallback',
    () => called.indexOf('filmBoxesDrawStatus') >= 0 && called.indexOf('filmBoxesDrawMeasure') >= 0 && fallbackOnly)
  .redControl(rs => { const c = rs.map(r => Object.assign({}, r)); if (c[1]) c[1].status = Object.assign({}, c[1].status, { y: c[1].status.y + 1 }); return c; })
  .run();
if (unregistered.length) console.log('§FILM_BOXES_CHAIN UNREGISTERED=[' + unregistered.join(' ') + '] — classify each in REGISTRY above or move it into a box');
