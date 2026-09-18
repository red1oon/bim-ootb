#!/usr/bin/env node
/* ⚠ WITNESS — W-SUN-COMPASS-WIRING, §CPE_SUN_COMPASS
 * (bim-compiler prompts/GEOREF_SUNPATH_COMPASS.md §7, bake-panel toggle).
 *
 * THE ISSUE IT PROVES OR DISPROVES — exactly one, and it is worth being precise about:
 *   The Alt+C bake panel's "Sun compass" checkbox has to spell the same field name in SIX places
 *   (the `_state` default, the stored-path reader, the panel census, the DOM sync list, the
 *   checkbox's own element id, and the change handler) and then match a SEVENTH in
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
  ['editor: the checkbox element exists with that id',
   function (f, id) { return src.editor.indexOf('id="' + id + '"') >= 0; }],
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
var boxes = (src.editor.match(/id="cpe-sun-compass/g) || []).length;
link('exactly ONE checkbox governs the whole compass overlay', boxes === 1,
     'found ' + boxes + ' — the rose, the day-of-year and the sun-angle readout are one idea');
link('no separate day-of-year or sun-angle checkbox was added',
     src.editor.indexOf('cpe-sun-day') < 0 && src.editor.indexOf('cpe-sun-angle') < 0);

var verdict = fails === 0 ? 'PASS' : 'FAIL';
console.log('§SUN_COMPASS_WIRING ' + verdict + ' checks=' + checks + ' wrong=' + fails +
            ' — wiring only; W-SUN-COMPASS is what proves a compass is actually drawn');
process.exit(fails === 0 ? 0 : 1);
