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
const PLATE_A = parseFloat(slice(PANEL, /ctx\.fillStyle = 'rgba\(0,0,0,([0-9.]+)\)';/, 'plate alpha'));
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
const MIN = 4.5;
function worst(inkHex, inkAlpha, plateAlpha) {
  let w = Infinity, which = null;
  for (const [name, scene] of [['dark', DARK], ['bright', BRIGHT]]) {
    const plate = comp([0,0,0], plateAlpha, scene);
    const r = ratio(comp(hex(inkHex), inkAlpha, plate), plate);
    if (r < w) { w = r; which = name; }
  }
  return { w, which };
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
console.log('§W-HUD-LEGIBLE threshold=WCAG ' + MIN + ':1, worst of {dark, bright} scene');
let anyBrightWorst = false;
for (const [name, h, a, pa] of INKS) {
  const { w, which } = worst(h, a, pa);
  if (which === 'bright') anyBrightWorst = true;
  chk('H1 ' + name + ' is legible', w >= MIN, h + ' @' + a.toFixed(2) + ' -> ' + w.toFixed(2) + ':1 (' + which + ' scene)');
}
chk('H2 the plate alpha under test is the one in the source', PLATE_A > 0 && PLATE_A <= 1, String(PLATE_A));
chk('H3 the BRIGHT scene is the harder case for at least one ink (the case eyeballing missed)',
  anyBrightWorst, 'bright-limited inks present');
console.log('\n§W-HUD-LEGIBLE pass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);
