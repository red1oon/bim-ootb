#!/usr/bin/env node
/* ⚠ WITNESS — W-SUN-COMPASS-WIRING, §CPE_SUN_COMPASS
 * (bim-compiler prompts/GEOREF_SUNPATH_COMPASS.md §7, bake-panel toggle).
 *
 * THE ISSUE IT PROVES OR DISPROVES — exactly one, and it is worth being precise about:
 *   The Alt+C bake panel's "Sun compass" toggle has to spell the same name in SIX places (the
 *   `_state` default, the stored-path reader, the panel census, the DOM sync list, the id in the
 *   §CPE_TOGGLE_ICONS table that renders the button, and the change handler) and then match a
 *   SEVENTH in
 *   cinema_maxq.js's overlay-flag list and an EIGHTH in cli_silent_bake.js. If any one of them
 *   drifts, the box renders, ticks, saves, and does NOTHING — silently. That is this project's
 *   recurring defect class and the same shape as the `true_north_angle` stub this whole feature
 *   exists to remove: a real UI, a real consumer, and nothing joining them.
 *
 * WHAT IT DOES NOT PROVE, stated so nobody reads more into a PASS than is there:
 *   It does NOT prove a bake draws a compass — W-SUN-COMPASS does that, against a real DB.
 *   It does NOT prove the checkbox renders — that needs a browser, and a rendered box that is not
 *   wired is precisely the failure this checks for instead.
 *   It is a WIRING check: every link in the chain exists and agrees on the name.
 *
 * NO-OP / VACUOUS / WRONG:
 *   VACUOUS: if a source file is missing it prints INCONCLUSIVE and exits 2, never PASS.
 *   NO-OP:   it asserts the OTHER overlay flags are found by the same rules, so a check that
 *            silently matches nothing fails on those first rather than passing on an empty set.
 *   WRONG:   each link is named and reported individually.
 *
 * RUN: node viewer/tests/witness_sun_compass_wiring.js
 */
var fs = require('fs');
var path = require('path');

var FILES = {
  editor: path.join(__dirname, '..', 'cinema_path_editor.js'),
  maxq: path.join(__dirname, '..', 'cinema_maxq.js'),
  cli: path.join(__dirname, '..', '..', 'cli_silent_bake.js')
};
var src = {};
for (var k in FILES) {
  if (!fs.existsSync(FILES[k])) {
    console.log('§SUN_COMPASS_WIRING INCONCLUSIVE — missing ' + FILES[k] + '. Nothing judged.');
    process.exit(2);
  }
  src[k] = fs.readFileSync(FILES[k], 'utf8');
}

var fails = 0, checks = 0;
function link(name, cond, detail) {
  checks++;
  if (!cond) fails++;
  console.log('  §SCW ' + (cond ? 'ok   ' : 'WRONG') + ' ' + name + (detail ? '   ' + detail : ''));
}

// The chain, for `sunCompass` and — as the control — for `measure`, an overlay flag that has
// worked since §FLYTHRU_DATUM shipped. If a rule below matches nothing, it fails on `measure`
// first, so a rule that has quietly stopped matching anything cannot pass by matching nothing.
var CHAIN = [
  ['editor: _state default is present and OFF',
   function (f) { return new RegExp('\\b' + f + ':\\s*false\\b').test(src.editor); }],
  ['editor: read back off a stored path',
   function (f) { return new RegExp('\\b' + f + ':\\s*!!s\\.' + f + '\\b').test(src.editor); }],
  ['editor: in the panel checkbox census',
   function (f) { return new RegExp('\\b' + f + ':\\s*!!ov\\.' + f + '\\b').test(src.editor); }],
  ['editor: in the DOM sync list, by element id',
   function (f, id) { return src.editor.indexOf("['" + id + "', !!_state." + f + "]") >= 0; }],
  // ⚠ REWRITTEN 2026-09-19 for §CPE_TOGGLE_ICONS. The rows used to be seven hand-written
  // `<input id="cpe-...">` literals; they are now generated from one TOGGLES table, so the literal
  // `id="cpe-sun-compass"` no longer appears anywhere in the source. All three subjects failed
  // this rule at once — including both CONTROLS, which is the signal that the RULE went stale
  // rather than the feature breaking. Loosening it to something that passes would have thrown away
  // the check; it is re-pointed at where the id actually lives now, and the generic renderer rule
  // below proves the table reaches a real input.
  ['editor: the id is declared in the toggle table',
   function (f, id) { return new RegExp("\\{\\s*id:\\s*'" + id + "'").test(src.editor); }],
  ['editor: the table is rendered into a real checkbox input',
   function () {
     return /'<input id="' \+ t\.id \+ '" type="checkbox"/.test(src.editor);
   }],
  ['editor: a change handler writes _state back',
   function (f, id) {
     return src.editor.indexOf("getElementById('" + id + "')") >= 0 &&
            new RegExp('_state\\.' + f + '\\s*=\\s*!!e\\.target\\.checked').test(src.editor);
   }],
  ['cinema_maxq: in the overlay-flag list the CLI merges through',
   function (f) { return new RegExp("'" + f + "'").test(src.maxq); }],
  // ⚠ TWO CONSUMPTION SHAPES EXIST, and the control caught this — the first cut of this rule only
  // accepted `!!_ov.<flag>` and failed `storeyReveal`, which is real and working: it is consumed as
  // `plan.storeyReveal` because the planner folds it into the plan, while `measure` and
  // `sunCompass` are read straight off the override. Both are "the bake actually reads it". A rule
  // narrower than the codebase would have failed a shipped feature and been "fixed" by loosening
  // the control instead of the rule.
  ['cinema_maxq: the bake actually reads it (via _ov or via plan)',
   function (f) {
     return new RegExp('_ov\\.' + f + '\\b').test(src.maxq) ||
            new RegExp('plan\\.' + f + '\\b').test(src.maxq);
   }]
];

var SUBJECTS = [
  { flag: 'sunCompass', id: 'cpe-sun-compass', role: 'the new one' },
  { flag: 'measure', id: 'cpe-measure', role: 'CONTROL — shipped and working since §FLYTHRU_DATUM' },
  { flag: 'storeyReveal', id: 'cpe-storey-reveal', role: 'CONTROL — §STOREY_HIGHLIGHT_REVEAL' }
];

console.log('§SUN_COMPASS_WIRING — the bake-panel checkbox chain, name by name');
SUBJECTS.forEach(function (s) {
  console.log('  — ' + s.flag + ' (' + s.role + ')');
  CHAIN.forEach(function (c) {
    link(s.flag + ' · ' + c[0], !!c[1](s.flag, s.id));
  });
});

// The CLI form, which is how a silent bake asks for it. Only sunCompass and measure have one.
link('cli_silent_bake: --sun-compass tri-state exists',
     /triState\('sun-compass', 'no-sun-compass'\)/.test(src.cli));
link('cli_silent_bake: it is put on FLAGS under the same name',
     /FLAGS\.sunCompass\s*=/.test(src.cli));

// ONE BOX, NOT THREE — the whole point of the directive this implements. If someone later splits
// the bundle, this fails and they have to decide deliberately rather than by drift.
var boxes = (src.editor.match(/\{\s*id: 'cpe-sun-compass'/g) || []).length;
link('exactly ONE checkbox governs the whole compass overlay', boxes === 1,
     'found ' + boxes + ' — the rose, the day-of-year and the sun-angle readout are one idea');
link('no separate day-of-year or sun-angle checkbox was added',
     src.editor.indexOf('cpe-sun-day') < 0 && src.editor.indexOf('cpe-sun-angle') < 0);

// ── §CPE_TOGGLE_ICONS — the strip's REAL rendered markup, not a grep of the source. ────────────
// The IIFE that builds the strip needs only an optional `ICONS` global and returns a string, so it
// can be sliced out and run — the same trick bim-compiler's scripts/witness_georef_extract.py uses
// to reach two functions inside a CLI. That turns every check below from "the source mentions it"
// into "the markup actually contains it", which is a different and much stronger claim, and it is
// what catches a template typo that no amount of grepping the table would.
(function () {
  var a = src.editor.indexOf("(function () {\n          var I = (typeof ICONS !== 'undefined')");
  var b = src.editor.indexOf("})() +", a);
  if (a < 0 || b < 0) {
    link('the toggle-strip builder can be located for a render check', false,
         'slice markers not found — if the IIFE was refactored, re-point these markers');
    return;
  }
  // Give the slice the REAL icon set. Without it `ICONS` is undefined, `I` falls back to {}, and
  // the three panels.js icons resolve to null — so the render check would measure the stub's
  // behaviour instead of the browser's and report 6 empty slots where production has 3. That is
  // exactly the kind of assertion-about-the-harness this project's VACUOUS rule exists to stop, and
  // the check below caught it on the first run. panels.js declares `var ICONS = {...}` at top level,
  // so it slices out by brace-matching.
  var ICONS;
  (function () {
    var pj = fs.readFileSync(path.join(__dirname, '..', 'panels.js'), 'utf8');
    var i = pj.indexOf('var ICONS = {');
    if (i < 0) return;
    var depth = 0, j = pj.indexOf('{', i);
    for (var k = j; k < pj.length; k++) {
      if (pj[k] === '{') depth++;
      else if (pj[k] === '}') { depth--; if (depth === 0) { j = k; break; } }
    }
    try { ICONS = eval('(' + pj.slice(pj.indexOf('{', i), j + 1) + ')'); }
    catch (e) { /* leave undefined; the count check below reports the consequence */ }
  })();
  link('the real panels.js icon set is available to the render check',
       !!ICONS && !!ICONS.ruler && !!ICONS.triangle && !!ICONS.disciplines,
       ICONS ? Object.keys(ICONS).length + ' icons' : 'ICONS could not be sliced');

  var html;
  try {
    html = eval(src.editor.slice(a, b + 4));
  } catch (e) {
    link('the toggle strip renders without throwing', false, e.message);
    return;
  }
  link('the toggle strip renders without throwing', typeof html === 'string' && html.length > 0);

  var inputs = html.match(/<input id="(cpe-[a-z-]+)"/g) || [];
  link('the strip renders exactly 7 toggles', inputs.length === 7,
       inputs.length + ': ' + inputs.join(' ').replace(/<input id="/g, ''));
  SUBJECTS.forEach(function (s2) {
    link('rendered markup contains ' + s2.id,
         html.indexOf('<input id="' + s2.id + '" type="checkbox"') >= 0);
  });
  link('Buildup is the only one checked by default',
       (html.match(/type="checkbox" checked/g) || []).length === 1);

  // Every button carries its hint as a title — this is the regression the restyle could have
  // caused: the prose rows became icons, and an icon that dropped its hint would look finished.
  var titles = html.match(/title="[^"]+"/g) || [];
  link('all 7 buttons carry a non-empty title (the hint text survived the restyle)',
       titles.length === 7 && titles.every(function (t) { return t.length > 40; }),
       titles.length + ' titles');
  link('the Sun compass title still states it draws nothing without a site lat/long',
       /silent on a model with no site lat\/long/.test(html));
  link('the Reveal title still states its render mechanism is unbuilt',
       /retraces the walk/.test(html));

  // Icons: three stroked, one flat, three still awaiting artwork.
  var noicon = (html.match(/class="cpe-noicon"/g) || []).length;
  var svgs = (html.match(/<svg /g) || []).length;
  link('icons + placeholders account for all 7 buttons', svgs + noicon === 7,
       svgs + ' svg + ' + noicon + ' awaiting artwork');
  link('four icons resolved from panels.js\'s own ISC set (ruler, triangle, disciplines, compass)',
       svgs === 4, svgs + ' icons rendered');
  link('three slots are caption-only — no artwork invented for them', noicon === 3,
       noicon + ' caption-only: buildup, room titles, storey highlight');
  // The sun compass must use the ROSE, not the drawing instrument. `I.compass` and
  // `I.draftingCompass` sit one entry apart in a 68-icon list and the wrong one looks plausible.
  link('the sun compass uses the magnetic rose, not the drafting instrument',
       html.indexOf('<circle cx="12" cy="12" r="10"/>') >= 0 &&
       html.indexOf('m12.99 6.74 1.93 3.44') < 0);
  // ⚠ THE LICENCE GUARD. A compass traced from `clipart4585220.png` was inlined on 2026-09-19 and
  // removed the same day: the source is realclipart.com ("Personal Use"), not Flaticon's free tier
  // as first believed, so no credit line makes it shippable. These two assert it has not come back
  // — including via a "clean-room redraw" that keeps the original's exact vertices, which would
  // still be a derivative of it.
  link('the Personal-Use traced artwork is NOT in the panel',
       html.indexOf('#ff485b') < 0 && html.indexOf('#7e7e7e') < 0 &&
       html.indexOf('viewBox="0 0 100 100"') < 0);
  link('no flat-artwork slot is populated (the branch is gone; every icon is 24-box stroked)',
       (html.match(/class="cpe-flat"/g) || []).length === 0 &&
       (html.match(/viewBox="0 0 24 24"/g) || []).length === svgs);
})();

// ── §SUN_ONE — the render sun and the compass sun must be ONE sun. ────────────────────────────
// The conversion is the whole risk and it is invisible when wrong: updateSky takes a SCENE bearing
// (0 = model north, z = +cos θ), the compass reports a TRUE bearing (0 = true north, scene maps
// z = −cos), so θ = 180 − (trueAz − trueNorthAngle). Feed a true bearing straight in and the sun
// is 180° plus true north out — the light comes from the wrong side and every shadow is backwards,
// while everything still "works". Pinned here against the shipped constant.
(function () {
  var eff = fs.readFileSync(path.join(__dirname, '..', 'effects.js'), 'utf8');
  var a = eff.indexOf('function _realSunForRender()');
  var b = eff.indexOf('\n  }', a);
  if (a < 0 || b < 0) {
    link('§SUN_ONE: the render-sun hook can be located', false, 'slice markers not found');
    return;
  }
  var A2 = { _sunCompassOn: true, sunCompassInfo: null };
  var win = { _trueNorthAngle: 5 };
  var fn;
  try {
    fn = eval('(function(A, window){' + eff.slice(a, b + 4) + '; return _realSunForRender;})')(A2, win);
  } catch (e) {
    link('§SUN_ONE: the render-sun hook evaluates', false, e.message);
    return;
  }
  link('§SUN_ONE: the render-sun hook evaluates', typeof fn === 'function');

  // THE ANCHOR. The shipped scripted sun is PHOTO_SUN_AZIMUTH = 200, which the bake's own
  // §SUN_ARC_FILL_PIN sunPos proves is model bearing −20°. So a true bearing of −20 with true
  // north 0 must convert to exactly 200, or the frames are not in the same convention.
  A2.sunCompassInfo = function () { return { azimuth: -20, elevation: 55 }; };
  win._trueNorthAngle = 0;
  var r0 = fn();
  link('§SUN_ONE: model bearing −20° converts to scene azimuth 200 (the shipped constant)',
       r0 && Math.abs(r0.az - 200) < 1e-9, r0 ? 'az=' + r0.az : 'null');

  // True north must shift it, or the building's own rotation is being ignored.
  win._trueNorthAngle = 5;
  A2.sunCompassInfo = function () { return { azimuth: 267.3, elevation: 30.4 }; };
  var r5 = fn();
  link('§SUN_ONE: true north shifts the render sun too', r5 && Math.abs(r5.az - 277.7) < 1e-9,
       r5 ? 'az=' + r5.az.toFixed(1) : 'null');
  link('§SUN_ONE: elevation is passed through unchanged', r5 && Math.abs(r5.el - 30.4) < 1e-12);

  // And it must REFUSE to take over when there is nothing real to take over with — otherwise a
  // film with no cursor or no compass silently loses its scripted lighting.
  A2._sunCompassOn = false;
  link('§SUN_ONE: compass off -> the scripted arc keeps the scene', fn() === null);
  A2._sunCompassOn = true;
  A2.sunCompassInfo = function () { return { noCursor: true, azimuth: null, elevation: null }; };
  link('§SUN_ONE: no 4D cursor -> the scripted arc keeps the scene', fn() === null);
  A2.sunCompassInfo = function () { return null; };
  link('§SUN_ONE: no compass info -> the scripted arc keeps the scene', fn() === null);
})();

var verdict = fails === 0 ? 'PASS' : 'FAIL';
console.log('§SUN_COMPASS_WIRING ' + verdict + ' checks=' + checks + ' wrong=' + fails +
            ' — wiring only; W-SUN-COMPASS is what proves a compass is actually drawn');
process.exit(fails === 0 ? 0 : 1);
