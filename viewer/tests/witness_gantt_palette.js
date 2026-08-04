// witness_gantt_palette.js — prompts/4D_SCHEDULE_PERFECTION.md §GANTT_EDIT VIS.
//
// THE ISSUE THIS PROVES OR DISPROVES:
//   User report 2026-08-04: the Time Machine Gantt drawer's bars are "not clear enough which is
//   which". Three measurable defects were behind that, and this witness fails if any comes back:
//     1. LEGIBILITY — the in-bar label was forced white on every fill. On the old palette that was
//        2.10:1 against #8bc34a, i.e. effectively unreadable. Gate: >= 3.0:1 for every phase.
//     2. SEPARABILITY — Substructure #7a8a8e and Superstructure #5b7fa5 sat 20.8 dE apart, the
//        least-distinguishable pair on the two ADJACENT structural phases. Gate: min pairwise dE >= 30.
//     3. STATUS COLLISION — Architecture #c07a4a competed with the RESERVED status hues (#ff8c00
//        active-bar outline + cursor hairline, #ffeb3b captured-IFC-4D frame). Gate: dE >= 40 to both.
//
//   Reads the values straight out of viewer/time_machine.js, so it tests what actually ships rather
//   than a copy that can drift.
var fs = require('fs');
var path = require('path');
var SRC = path.join(__dirname, '..', '..', 'viewer', 'time_machine.js');

var pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('§W-PALETTE PASS  ' + name + (detail ? '  ' + detail : '')); }
  else { fail++; console.log('§W-PALETTE FAIL  ' + name + (detail ? '  ' + detail : '')); }
}

function grabObj(txt, varName) {
  var i = txt.indexOf('var ' + varName + ' = {');
  if (i < 0) return null;
  var j = txt.indexOf('};', i);
  return (new Function('return ' + txt.slice(txt.indexOf('{', i), j + 1) + ';'))();
}

function hx(h){h=h.replace('#','');return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)];}
function srgb(c){c/=255;return c<=0.04045?c/12.92:Math.pow((c+0.055)/1.055,2.4);}
function lum(h){var r=hx(h);return 0.2126*srgb(r[0])+0.7152*srgb(r[1])+0.0722*srgb(r[2]);}
function contrast(a,b){var l1=lum(a),l2=lum(b);if(l1<l2){var t=l1;l1=l2;l2=t;}return (l1+0.05)/(l2+0.05);}
function lab(h){var r=hx(h).map(srgb);
  var X=(r[0]*0.4124+r[1]*0.3576+r[2]*0.1805)/0.95047,Y=(r[0]*0.2126+r[1]*0.7152+r[2]*0.0722),Z=(r[0]*0.0193+r[1]*0.1192+r[2]*0.9505)/1.08883;
  function f(t){return t>0.008856?Math.cbrt(t):(7.787*t+16/116);}
  return [116*f(Y)-16,500*(f(X)-f(Y)),200*(f(Y)-f(Z))];}
function dE(a,b){var A=lab(a),B=lab(b);return Math.sqrt(Math.pow(A[0]-B[0],2)+Math.pow(A[1]-B[1],2)+Math.pow(A[2]-B[2],2));}

var txt = fs.readFileSync(SRC, 'utf8');
var COLORS = grabObj(txt, 'PHASE_COLORS');
var INK = grabObj(txt, 'PHASE_INK');
var SHORT = grabObj(txt, 'PHASE_SHORT');
var STATUS = { 'active-outline': '#ff8c00', 'captured-frame': '#ffeb3b' };
var MIN_DE = 30, MIN_STATUS_DE = 40, MIN_CONTRAST = 3.0;

check('G-PAL-0 palette-parsed', !!COLORS && !!INK && !!SHORT,
  'colors=' + (COLORS && Object.keys(COLORS).length) + ' ink=' + (INK && Object.keys(INK).length) +
  ' short=' + (SHORT && Object.keys(SHORT).length));
if (!COLORS || !INK || !SHORT) { console.log('§W-PALETTE RESULT pass=' + pass + ' fail=' + fail); process.exit(1); }

var phases = Object.keys(COLORS);

// 1 — every phase has an ink colour and a short code (a missing one silently falls back to white /
//     substring(0,3), which is the exact defect this replaced).
var missingInk = phases.filter(function (p) { return !INK[p]; });
var missingShort = phases.filter(function (p) { return !SHORT[p]; });
check('G-PAL-1 every-phase-has-ink-and-shortcode', !missingInk.length && !missingShort.length,
  'missingInk=' + JSON.stringify(missingInk) + ' missingShort=' + JSON.stringify(missingShort));

// 2 — LEGIBILITY.
var worstC = 99, worstP = '';
phases.forEach(function (p) {
  var c = contrast(INK[p] || '#ffffff', COLORS[p]);
  if (c < worstC) { worstC = c; worstP = p; }
});
check('G-PAL-2 label-contrast->=' + MIN_CONTRAST, worstC >= MIN_CONTRAST,
  'worst=' + worstC.toFixed(2) + ':1 on ' + worstP);

// 3 — SEPARABILITY.
var minD = 1e9, minPair = '';
for (var i = 0; i < phases.length; i++) for (var j = i + 1; j < phases.length; j++) {
  var d = dE(COLORS[phases[i]], COLORS[phases[j]]);
  if (d < minD) { minD = d; minPair = phases[i] + '/' + phases[j]; }
}
check('G-PAL-3 min-pairwise-dE-->=' + MIN_DE, minD >= MIN_DE,
  'min=' + minD.toFixed(1) + ' on ' + minPair);

// 4 — STATUS COLLISION.
var minS = 1e9, minSPair = '';
phases.forEach(function (p) {
  for (var s in STATUS) {
    var d = dE(COLORS[p], STATUS[s]);
    if (d < minS) { minS = d; minSPair = p + ' vs ' + s; }
  }
});
check('G-PAL-4 no-phase-near-a-reserved-status-hue', minS >= MIN_STATUS_DE,
  'min=' + minS.toFixed(1) + ' on ' + minSPair);

// 5 — short codes must be mutually distinct (the "Sub"/"Sup" collision this replaced).
var codes = phases.map(function (p) { return SHORT[p]; });
var uniq = {}; codes.forEach(function (c) { uniq[c] = 1; });
check('G-PAL-5 short-codes-distinct', Object.keys(uniq).length === codes.length,
  JSON.stringify(codes));

// 6 — the legend must stay gone; the hover tooltip is the only phase labelling.
check('G-PAL-6 legend-strip-removed', txt.indexOf('tm-gantt-legend') < 0,
  'references=' + (txt.match(/tm-gantt-legend/g) || []).length);

console.log('§W-PALETTE summary minDE=' + minD.toFixed(1) + ' minStatusDE=' + minS.toFixed(1) +
  ' worstContrast=' + worstC.toFixed(2) + ':1');
console.log('§W-PALETTE RESULT pass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);
