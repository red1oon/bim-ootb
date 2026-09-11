#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — prompts/STRUCTURAL_SANITY.md T5 witness (READ THE LOG after every run)
 * SCOPE: proves viewer/rule_checklist.js's RULE_TINT_MATERIAL_OPTS constant — the material
 * config A.showRuleModeTint feeds into `new THREE.MeshBasicMaterial(...)` for its per-color-group
 * InstancedMesh — is IDENTICAL to Clash Mode's own material config (viewer/measure.js
 * A._enterClashMode, `new THREE.MeshBasicMaterial({color, wireframe:true, transparent:true,
 * opacity:0.2, depthWrite:false})`), minus `color` (which varies per severity-color group, unlike
 * Clash Mode's per-discipline color, and is added separately at call time — see
 * A.showRuleModeTint in viewer/rule_checklist.js). Cannot build real THREE.js meshes without a
 * browser (per brief), so this asserts the CONFIG OBJECT only, deep-equal against the exact
 * values read out of measure.js by hand.
 * RUN: node tests/test_rule_mode_tint.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const RC = require('../viewer/rule_checklist.js');

let pass = 0, fail = 0;
const chk = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  ❌ ' + n + (x ? '  ' + x : '')); } };

// Exact values Clash Mode uses, per viewer/measure.js A._enterClashMode
// (`new THREE.MeshBasicMaterial({ color: color, wireframe: true, transparent: true, opacity: 0.2, depthWrite: false })`)
// — `color` excluded here since it's the per-group value the caller supplies, not a fixed option.
const CLASH_MODE_MATERIAL_OPTS = { wireframe: true, transparent: true, opacity: 0.2, depthWrite: false };

function deepEqual(a, b) {
  const ak = Object.keys(a).sort(), bk = Object.keys(b).sort();
  if (ak.length !== bk.length || ak.join(',') !== bk.join(',')) return false;
  return ak.every(k => a[k] === b[k]);
}

console.log('§W-RULE-TINT material config');
chk('RULE_TINT_MATERIAL_OPTS deep-equals Clash Mode\'s material config',
  deepEqual(RC.RULE_TINT_MATERIAL_OPTS, CLASH_MODE_MATERIAL_OPTS),
  JSON.stringify(RC.RULE_TINT_MATERIAL_OPTS) + ' vs ' + JSON.stringify(CLASH_MODE_MATERIAL_OPTS));

chk('RULE_TINT_MATERIAL_OPTS.wireframe === true', RC.RULE_TINT_MATERIAL_OPTS.wireframe === true);
chk('RULE_TINT_MATERIAL_OPTS.transparent === true', RC.RULE_TINT_MATERIAL_OPTS.transparent === true);
chk('RULE_TINT_MATERIAL_OPTS.opacity === 0.2', RC.RULE_TINT_MATERIAL_OPTS.opacity === 0.2);
chk('RULE_TINT_MATERIAL_OPTS.depthWrite === false', RC.RULE_TINT_MATERIAL_OPTS.depthWrite === false);
chk('RULE_TINT_MATERIAL_OPTS has no `color` key (added per-group at call time, not fixed)',
  !('color' in RC.RULE_TINT_MATERIAL_OPTS));

// Cross-check against the live source text of measure.js's clash-mode material literal, so this
// witness re-fails if that literal is ever edited without updating this file's hardcoded copy.
console.log('§W-RULE-TINT source cross-check against viewer/measure.js');
const measureSrc = fs.readFileSync(path.join(__dirname, '../viewer/measure.js'), 'utf8');
const clashMatLine = measureSrc.match(/var mat = new THREE\.MeshBasicMaterial\(\{[\s\S]{0,200}?\}\);/);
chk('found A._enterClashMode\'s MeshBasicMaterial literal in measure.js', !!clashMatLine, clashMatLine ? '' : 'NOT FOUND — measure.js may have moved/renamed this');
if (clashMatLine) {
  const lit = clashMatLine[0];
  chk('measure.js literal still contains wireframe: true', /wireframe:\s*true/.test(lit));
  chk('measure.js literal still contains opacity: 0.2', /opacity:\s*0\.2/.test(lit));
  chk('measure.js literal still contains depthWrite: false', /depthWrite:\s*false/.test(lit));
  chk('measure.js literal still contains transparent: true', /transparent:\s*true/.test(lit));
}


// ══ §RULE_TINT_SHINE_THROUGH (MEP_CLASH_REVEAL_MOVIE.md §62) ═══════════════════════════════════
// ISSUES THESE PROVE OR DISPROVE:
//   T1 the opt-in did NOT edit the shared constant — T5's Clash-Mode contract above still holds and
//      the no-opts path is byte-identical to it, renderOrder -1 included
//   T2 with {shineThrough:true} the film marker gets clash_film.js's exact escape from z-testing
//      (depthTest false, toneMapped false, renderOrder 900) and nothing else moves
console.log('§W-RULE-TINT §62 shine-through layering');
const base62 = RC.ruleTintMaterialOpts();
chk('T1 §62 no-opts material still deep-equals Clash Mode\'s config (T5 intact)',
  deepEqual(base62, CLASH_MODE_MATERIAL_OPTS), JSON.stringify(base62));
chk('T1b §62 no-opts renderOrder is still the original -1',
  RC.ruleTintRenderOrder() === -1, String(RC.ruleTintRenderOrder()));
chk('T1c §62 no-opts material has NO depthTest key (unchanged shape, not a false value)',
  !('depthTest' in base62), JSON.stringify(Object.keys(base62)));

const shine62 = RC.ruleTintMaterialOpts({ shineThrough: true });
chk('T2 §62 shineThrough sets depthTest:false — the one line that makes it visible through a wall',
  shine62.depthTest === false, String(shine62.depthTest));
chk('T2b §62 shineThrough sets toneMapped:false, matching clash_film.js',
  shine62.toneMapped === false, String(shine62.toneMapped));
chk('T2c §62 shineThrough renderOrder is 900 — clash_film.js\'s own value, after opaque geometry',
  RC.ruleTintRenderOrder({ shineThrough: true }) === 900, String(RC.ruleTintRenderOrder({ shineThrough: true })));
chk('T2d §62.4 shineThrough leaves wireframe/transparent/opacity/depthWrite untouched (opacity 0.2 NOT raised)',
  shine62.wireframe === true && shine62.transparent === true && shine62.opacity === 0.2 && shine62.depthWrite === false,
  JSON.stringify(shine62));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
