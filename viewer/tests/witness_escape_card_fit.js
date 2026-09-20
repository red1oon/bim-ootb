#!/usr/bin/env node
/**
 * §13.3/§13.5 CARD FIT WITNESS — DOES THE LEGEND STAY INSIDE ITS OWN PLATE?
 *
 * THE ISSUE IT EXISTS FOR, and it is not hypothetical: the first cut of the §13 legend drew every
 * row with a bare ctx.fillText and no width budget. At 854x480 the card's plate is h*0.36 = 173 px
 * wide, and the rows need far more than that, so "7 alternates  from the choice point" ran off the
 * plate and was sliced at the frame edge, the RED row's right-aligned limit printed ON TOP of its
 * own words, and the title truncated to "Escape Rou...". Delivered in a real clip and caught by a
 * reviewer's eye, not by any witness — §HUD_LAYOUT registers the card's PLATE and nothing inside
 * it, so text running past the plate scores overlaps=0 overflow=0.
 *
 * WHY THIS IS NOT PIXEL EVIDENCE. Nothing here reads a frame. The drawer is run against a
 * recording 2D context, and the predicate — "every string this card draws lies inside the plate,
 * and no two strings on one baseline overlap" — is asserted on the geometry the drawer itself
 * computed. The width model is the module's OWN estimator (len * fontPx * 0.56, cpe_escape_route.js
 * `_estW`), so it is an ESTIMATE of the browser's metrics, not a measurement of them: it is sized
 * to catch a row that overruns by tens of px, which is the defect, not a 2 px kerning difference.
 *
 * RUN: node viewer/tests/witness_escape_card_fit.js
 */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');

let pass = 0, fail = 0;
const ck = (n, c, x) => { if (c) { pass++; console.log('  §CARDFIT ok    ' + n + (x ? '   ' + x : '')); }
                          else { fail++; console.log('  §CARDFIT WRONG ' + n + (x ? '   ' + x : '')); } };

// ── the recording context. Permissive about everything that only paints, exact about text.
function recorder() {
  const R = { texts: [], font: '10px x', textAlign: 'left', textBaseline: 'alphabetic',
              fillStyle: '#000', strokeStyle: '#000', globalAlpha: 1, lineWidth: 1 };
  const px = () => { const m = /(\d+(?:\.\d+)?)px/.exec(R.font); return m ? +m[1] : 10; };
  R.measureText = (s) => ({ width: String(s).length * px() * 0.56 });
  R.fillText = (s, x, y) => {
    const w = R.measureText(s).width;
    R.texts.push({ s: String(s), x, y, w, align: R.textAlign,
                   left: R.textAlign === 'right' ? x - w : x,
                   right: R.textAlign === 'right' ? x : x + w, px: px() });
  };
  ['save','restore','beginPath','closePath','moveTo','lineTo','stroke','fill','fillRect','clip',
   'arc','rect','roundRect','translate','scale','setLineDash','strokeText','quadraticCurveTo',
   'bezierCurveTo','ellipse','strokeRect','clearRect','rotate'].forEach(k => { R[k] = () => {}; });
  R.createLinearGradient = () => ({ addColorStop: () => {} });
  R.createRadialGradient = () => ({ addColorStop: () => {} });
  return R;
}
// The panel module is a browser module with no module.exports — sliced and evaluated, the same
// technique witness_escape_route_reveal.js already uses on it.
function loadPanel() {
  const A = {};
  const src = fs.readFileSync(path.join(ROOT, 'viewer', 'cpe_resource_panel.js'), 'utf8');
  eval(src + '\nsetupCpeResourcePanel(A);');
  return A;
}
// A card exactly as escapeRouteStatCardAt returns one on Hospital_silent — the REAL strings from
// the 2026-09-20 11:47 clip's own log, not shortened for the test.
const CARD = {
  big: '3:28 mins',
  label: 'Escape Route — OVER LIMIT',
  sub: '~329 steps*  ·  247 m walked  ·  247 m vs 60.96 m limit (IBC 2021 T1017.2, I-2)⁴  ·  at 1.19 m/s (SFPE)²  ·  0.75 m stride assumed',
  subAlts: ['~329 steps*  \u00b7  247 m walked  \u00b7  247 m vs 60.96 m limit\u2074', '~329 steps*  \u00b7  247 m\u00b2'],
  // The REAL strings the card returns since red1's "the HUD color ie red '..' and grey need
  // explanation such as 'sprinklered zone'" — longer than the terse fragments they replaced, which
  // is the point of testing with them rather than with something convenient.
  legend: [
    { key: 'RED', rgb: 'rgb(229,57,53)', value: '183 m', text: 'common path \u2014 no alternative', textShort: 'no alternative', right: 'limit 30.5 m', marker: '1' },
    { key: 'YELLOW', rgb: 'rgb(255,145,0)', value: '64 m', text: 'onward to the nearest exit', textShort: 'to nearest exit', right: '', marker: '' },
    { key: 'BLUE', rgb: 'rgba(0,145,234,1)', value: '7 alternates', text: 'other exits from that point', textShort: 'other exits', right: '', marker: '' },
    { key: 'GREY', rgb: 'rgba(200,205,210,0.9)', value: '177 m', text: 'sprinklered zone', textShort: 'sprinklered', right: '', marker: '3' }
  ],
  footnotes: [
    '¹ IBC 2021 T1006.2.1 — sprinklered 30.5 m, from real heads on this route; I-2 assumed; from room centre',
    '² SFPE 1.19 m/s    ³ NFPA 13 light hazard, 3.23 m — proximity, not coverage',
    '⁴ IBC 2021 T1017.2 — measured to an exterior door, so it may over-state',
    '* 0.75 m stride — no source; this project’s own convention'
  ]
};

const A = loadPanel();
// The delivery size, the mid size, and the CLIP size red1 is sighting on.
const SIZES = [[1920, 1080], [1280, 720], [854, 480]];
SIZES.forEach(([w, h]) => {
  const ctx = recorder();
  // ⚠ MEASURE AGAINST THE RECT THAT IS DRAWN, not the one bigStatsBoxRect advertises. They are not
  // the same: bigStatsBoxRect calls _box() with shownRows/clRows OMITTED, so it falls back to
  // _scanMaxResourceRows()'s worst-case reservation and reports 173x185 at 854x480 where the
  // compositor actually draws 173x131 — a 54 px lie. The first cut of this witness used the
  // advertised rect, which is precisely why it passed a card whose sub was sliced by the plate's
  // bottom edge in a delivered clip. The registered `stats-panel` rect is the drawn one.
  let box = null;
  A._hudLayoutRegister = (n, x, y, ww, hh) => { if (n === 'stats-panel') box = { x, y, w: ww, h: hh }; };
  // §ESCAPE_PANEL_SLOT — the card asks for a bigger slot (boxScale) and now sits in the corner
  // diagonally opposite the HUD column, so the fit is re-proved at the size and position it is
  // ACTUALLY drawn at, not at the old ones.
  A.bigStatsCompositeOntoCanvas(ctx, w, h, { card: CARD, boxScale: 1.22, idx: 0, n: 1, opacity: 1 }, 1, 'bl', 0, null);
  if (!box) { ck(w + 'x' + h + ' the card registered its plate', false, 'no stats-panel rect'); return; }
  const L = box.x, Rr = box.x + box.w, T = box.y, B = box.y + box.h;
  const drawn = ctx.texts;
  const over = drawn.filter(t => t.right > Rr + 0.5 || t.left < L - 0.5);
  // A baseline inside the plate is not enough: glyphs sit ABOVE the baseline and descenders hang
  // below it. 0.78/0.22 of the font size is the usual split and is well inside what this estimate
  // claims — the defect being caught is a line sliced in half, not a 1 px descender.
  const below = drawn.filter(t => t.y + t.px * 0.22 > B + 0.5 || t.y - t.px * 0.78 < T - 0.5);
  ck(w + 'x' + h + ' every drawn string stays inside the plate horizontally',
     over.length === 0,
     'plate x=' + L.toFixed(0) + '..' + Rr.toFixed(0) + ' (' + box.w.toFixed(0) + 'px)  strings=' + drawn.length +
     (over.length ? '  OVER: ' + over.slice(0, 3).map(t => '"' + t.s.slice(0, 26) + '" right=' + t.right.toFixed(0)).join(' | ') : ''));
  ck(w + 'x' + h + ' …and vertically — nothing is drawn below the plate',
     below.length === 0,
     below.length ? below.slice(0, 2).map(t => '"' + t.s.slice(0, 22) + '" y=' + t.y.toFixed(0) + ' vs bottom ' + B.toFixed(0)).join(' | ') : 'bottom=' + B.toFixed(0));
  // Two strings sharing a baseline must not share x. This is the RED-row defect: a right-aligned
  // limit printed straight over "183 m  no choice".
  let clash = null;
  for (let i = 0; i < drawn.length && !clash; i++) {
    for (let j = i + 1; j < drawn.length; j++) {
      const a = drawn[i], b = drawn[j];
      if (Math.abs(a.y - b.y) > 0.5) continue;
      if (a.right > b.left + 0.5 && b.right > a.left + 0.5) { clash = [a, b]; break; }
    }
  }
  ck(w + 'x' + h + ' no two strings on one baseline overlap',
     !clash, clash ? '"' + clash[0].s.slice(0, 20) + '" [' + clash[0].left.toFixed(0) + '..' + clash[0].right.toFixed(0) +
     '] vs "' + clash[1].s.slice(0, 20) + '" [' + clash[1].left.toFixed(0) + '..' + clash[1].right.toFixed(0) + ']' : '');
  // NOTHING THE CARD DRAWS IS ELLIPSED. An ellipsis on this card is never cosmetic: every string
  // on it is either a cited number, its source, or the disclosure that a number has no source, and
  // a truncated one loses exactly the part that makes it checkable. The card carries a fallback
  // CHAIN (card.subAlts) precisely so it can drop to a shorter whole form instead of cutting a
  // longer one. MEASURED before this leg existed: at 854x480 the sub read
  // "~329 steps* \u00b7 247 m walked \u00b7 \u2026" — the speed and the stride gone, with no footnote block
  // to carry them either.
  const cut = drawn.filter(t => /\u2026/.test(t.s) && !/^[\u00b9\u00b2\u00b3\u2074*] /.test(t.s));
  ck(w + 'x' + h + ' no legend row, title or disclosure is ellipsed',
     cut.length === 0, cut.length ? cut.map(t => '"' + t.s + '"').join(' | ') : 'footnote lines may ellipse — their marker still points somewhere');
  // §13.5's ruling, checked as behaviour rather than as a constant: the footnote block is gone at
  // clip height and present at delivery height, and the MARKERS survive either way.
  const hasFoot = drawn.some(t => /^[¹²³⁴*] /.test(t.s));
  ck(w + 'x' + h + ' footnote block ' + (h >= 750 ? 'present' : 'DROPPED') + ' (§13.5 keeps markers, never shrinks)',
     h >= 750 ? hasFoot : !hasFoot, 'footnote lines drawn=' + drawn.filter(t => /^[¹²³⁴*] /.test(t.s)).length);
  // Every legend key must actually reach the canvas — a row silently dropped to make room would be
  // §13.6's thinning by another route.
  const keys = CARD.legend.map(g => g.key).filter(k => drawn.some(t => t.s === k));
  ck(w + 'x' + h + ' all four legend keys are drawn — a row dropped to make room is still a row lost',
     keys.length === CARD.legend.length, 'drawn=' + keys.join(',') );
  // red1, 2026-09-20: "the HUD color ie red '..' and grey need explanation such as 'sprinklered
  // zone'". The WORDS are the legend's job; a row reading "177 m" with no name for the grey has
  // stopped being a legend. The drop ladder now sheds the cited limit BEFORE the descriptor,
  // because the limit is also in the disclosure row and in footnote 1 while the descriptor is
  // nowhere else on the card.
  const named = CARD.legend.filter((g) => drawn.some((t) =>
    t.s.indexOf(g.text) >= 0 || (g.textShort && t.s.indexOf(g.textShort) >= 0)));
  ck(w + 'x' + h + ' every colour is EXPLAINED in words, not just numbered',
     named.length === CARD.legend.length,
     named.length + '/' + CARD.legend.length + ' explained' +
     (named.length < CARD.legend.length
       ? '  missing: ' + CARD.legend.filter((g) => named.indexOf(g) < 0).map((g) => g.key).join(',')
       : ''));
});

console.log('§CARDFIT ' + pass + '/' + (pass + fail) + ' pass' + (fail ? '  FAIL=' + fail : ''));
process.exit(fail ? 1 : 0);
