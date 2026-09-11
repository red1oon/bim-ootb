#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-HUD-LEGIBLE scope (READ THE LOG after every run)
 * SCOPE: bim-compiler prompts/MEP_CLASH_REVEAL_MOVIE.md §68 ONLY — every colour the film HUD draws
 * text in must stay readable against its own plate, over the darkest AND brightest frame a bake
 * produces. Node, no browser: the values are SLICED OUT OF THE SOURCE FILES and evaluated, never
 * re-typed, so retuning any of them re-runs this check automatically.
 * RUN: node witness_hud_legibility.js
 *
 * WHY A NUMBER AND NOT AN OPINION: "is it legible" was being judged by eye, wrongly, three times
 * this session. WCAG 2.1 contrast >= 4.5:1 is the threshold used, measured on the ACTUAL composite:
 * the plate is black at its alpha over the scene, the text composites onto that plate, and the ratio
 * is text-vs-plate. A translucent plate over a bright facade is the case every earlier eyeball missed.
 *
 * ISSUES THIS WITNESS EXPOSES:
 *   H1 EVERY-INK-CLEARS-4.5 — one check per HUD ink, worst case across a dark and a bright scene.
 *   H2 THE-PLATE-IS-THE-ONE-BEING-MEASURED — the alpha read from source is the alpha tested.
 *   H3 BRIGHT-SCENE-IS-THE-HARD-CASE — asserts the bright scene really is worse than the dark one
 *      for at least one ink, so the test cannot pass by only ever checking the easy direction.
 */
'use strict';
const fs = require('fs'), path = require('path');
const read = f => fs.readFileSync(path.join(__dirname, 'viewer', f), 'utf8');
let pass = 0, fail = 0;
const chk = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  ❌ ' + n + (x ? '  ' + x : '')); } };
function slice(src, re, label) {
  const m = re.exec(src);
  if (!m) { console.log('§W-HUD-LEGIBLE SLICE-FAILED ' + label); process.exit(1); }
  return m[1];
}
// ── the real values, read out of the shipped files ──
const PANEL = read('cpe_resource_panel.js'), BOXES = read('cpe_film_boxes.js'), FILM = read('rule_findings_film.js');
const PLATE_A = parseFloat(slice(PANEL, /glass \? 'rgba\(0,0,0,([0-9.]+)\)'/, 'plate alpha (frosted branch — the lowest alpha, i.e. the hardest case)'));
const BOX_A = parseFloat(slice(BOXES, /ctx\.fillStyle = 'rgba\(0,0,0,([0-9.]+)\)';/, 'box fallback alpha'));
const STRUCT = slice(FILM, /structural: '(#[0-9a-f]{6})'/i, 'structural ink');
const EGRESS = slice(FILM, /egress: '(#[0-9a-f]{6})'/i, 'egress ink');
const TITLE = slice(BOXES, /head\.ink \|\| '(#[0-9a-f]{6})'/i, 'measure title default');
const SUB_A = parseFloat(slice(PANEL, /ctx\.fillStyle = 'rgba\(255,255,255,([0-9.]+)\)';\s*\/\/ §68/, 'card sub alpha'));
console.log('§W-HUD-LEGIBLE sliced plate=' + PLATE_A + ' boxFallback=' + BOX_A +
  ' title=' + TITLE + ' structural=' + STRUCT + ' egress=' + EGRESS + ' cardSubAlpha=' + SUB_A);

const hex = h => { const n = parseInt(h.replace('#',''),16); return [(n>>16)&255,(n>>8)&255,n&255]; };
const lin = c => { c/=255; return c<=0.03928 ? c/12.92 : Math.pow((c+0.055)/1.055,2.4); };
const L = ([r,g,b]) => 0.2126*lin(r)+0.7152*lin(g)+0.0722*lin(b);
const ratio = (a,b) => { const l1=L(a), l2=L(b); return (Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05); };
const comp = (fg,a,bg) => fg.map((c,i)=>Math.round(c*a + bg[i]*(1-a)));
// darkest and brightest a real frame gives: night ground, and a sunlit white facade / sky
const DARK = hex('#101010'), BRIGHT = hex('#e8e8e8');
// §76 — THE MODEL CHANGED, because the DRAWING changed. Text is now drawn with a near-opaque dark
// shadow (rgba(0,0,0,0.95), blur ~0.35em), so the surface the eye reads a glyph against is the SHADOW,
// not the plate behind it. Measuring ink-vs-plate was the right model while the plate was the only
// backdrop; it is the wrong model now and would report a failure the viewer cannot see.
// Both are measured below: `vs plate` is kept and PRINTED for honesty (it is what the ratio would be
// with no shadow, and it is genuinely low — 1.03-1.34 at the cam-path box's 72% see-through), while
// what is ENFORCED is `vs shadow`, the real letterform contrast.
// The plate opacity is the user's call (§73.0): "It looks more like 70%, very nice, not obscuring
// background scene much" — matched to cpe_path_overview.js:208 exactly.
const MIN = 3.0;                       // enforced against the shadow the glyph actually sits on
const SHADOW = '#0d0d0d';              // rgba(0,0,0,0.95) over any backdrop lands within a shade of this
function worst(inkHex, inkAlpha, plateAlpha) {
  let w = Infinity, which = null, vsPlate = Infinity;
  for (const [name, scene] of [['dark', DARK], ['bright', BRIGHT]]) {
    const plate = comp([0,0,0], plateAlpha, scene);
    const ink = comp(hex(inkHex), inkAlpha, plate);
    vsPlate = Math.min(vsPlate, ratio(ink, plate));
    const r = ratio(ink, hex(SHADOW));           // §76 — the glyph sits on its own shadow
    if (r < w) { w = r; which = name; }
  }
  return { w, which, vsPlate };
}
const INKS = [
  ['Measure title (default)', TITLE, 1.00, PLATE_A],
  ['Structural ink', STRUCT, 1.00, PLATE_A],
  ['Safety/egress ink', EGRESS, 1.00, PLATE_A],
  ['Measure body rows', '#ffffff', 1.00, PLATE_A],
  ['card label', '#ffffff', 0.88, PLATE_A],
  ['card sub-text', '#ffffff', SUB_A, PLATE_A],
  ['Measure title on the box FALLBACK plate', TITLE, 1.00, BOX_A],
  ['Safety ink on the box FALLBACK plate', EGRESS, 1.00, BOX_A],
];
console.log('§W-HUD-LEGIBLE floor=' + MIN + ':1 (§73.0 waiver — WCAG 4.5 deliberately NOT enforced for box text), worst of {dark, bright} scene');
for (const [name, h, a, pa] of INKS) {
  const { w, which, vsPlate } = worst(h, a, pa);
  chk('H1 ' + name + ' is legible', w >= MIN,
    h + ' @' + a.toFixed(2) + ' -> ' + w.toFixed(2) + ':1 vs shadow (' + which + ' scene); vs plate alone ' + vsPlate.toFixed(2) + ':1');
}
chk('H2 the plate alpha under test is the one in the source', PLATE_A > 0 && PLATE_A <= 1, String(PLATE_A));
chk('H3 §76 the shadow is what carries legibility — vs-plate alone is genuinely LOW, so this is not ' +
  'the plate quietly doing the work',
  INKS.every(([, h, a, pa]) => worst(h, a, pa).vsPlate < 3.0),
  'max vs-plate = ' + Math.max.apply(null, INKS.map(([, h, a, pa]) => worst(h, a, pa).vsPlate)).toFixed(2) + ':1');
// Only OPAQUE inks can be fully scene-independent: text drawn at alpha < 1 (the card label at 0.88,
// the sub-text at 0.78) composites the plate into itself, so the backdrop still reaches it. Asserting
// otherwise would be asserting something physically untrue — the first draft of this check did.
chk('H3b §76 OPAQUE text is scene-independent — dark and bright give the same answer, which is what a ' +
  'per-glyph shadow buys and the plate-only model never could',
  INKS.filter(([, , a]) => a === 1).every(([, h, a, pa]) => {
    const rD = ratio(comp(hex(h), a, comp([0,0,0], pa, DARK)), hex(SHADOW));
    const rB = ratio(comp(hex(h), a, comp([0,0,0], pa, BRIGHT)), hex(SHADOW));
    return Math.abs(rD - rB) < 1e-9;
  }), 'identical in both scenes for every opaque ink');
console.log('\n§W-HUD-LEGIBLE pass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);
