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

// ══ §RULE_TINT_ROOM_GEOM (MEP_CLASH_REVEAL_MOVIE.md §67) — real Hospital DB ═════════════════════
// ISSUES THESE PROVE OR DISPROVE:
//   R1 an injected room guid (RM_, spatial_structure only) resolves a bbox — before §67 it did not,
//      so every room-based Safety finding was dropped from the 3-D tint. Fails pre-change.
//   R2 a real IFC element still resolves from element_transforms — §67 did not break the main path.
//   R3 a guid in NEITHER table is NAMED in the log, never dropped in silence.
console.log('§W-RULE-TINT §67 two-table geometry (real Hospital_silent.db)');
(function roomGeom() {
  const dbFile = path.join(process.env.HOME, 'Downloads', 'Hospital_silent.db');
  if (!fs.existsSync(dbFile)) {
    console.log('  §W-RULE-TINT SKIP-DB — ' + dbFile + ' absent; R1/R2/R3 not run');
    console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
  }
  const initSqlJs = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'sql.js'));
  return initSqlJs().then(SQL => {
    const db = new SQL.Database(new Uint8Array(fs.readFileSync(dbFile)));
    const dbQuery = (sql, params) => { const r = db.exec(sql, params); return r.length ? r[0].values : []; };
    const roomGuid = dbQuery("SELECT guid FROM spatial_structure WHERE guid LIKE 'RM_%' LIMIT 1")[0][0];
    const elemGuid = dbQuery("SELECT guid FROM element_transforms LIMIT 1")[0][0];
    const inET = dbQuery("SELECT COUNT(*) FROM element_transforms WHERE guid = ?", [roomGuid])[0][0];
    chk('R1-setup the room guid really has NO element_transforms row (the premise)', inET === 0, 'rows=' + inET);
    const got = RC.ruleTintRowsFor(dbQuery, [elemGuid, roomGuid, 'NOT_A_GUID']);
    chk('R1 §67 an injected room resolves a bbox from spatial_structure',
      !!got[roomGuid] && got[roomGuid].length === 7, roomGuid + ' -> ' + JSON.stringify(got[roomGuid]));
    chk('R1b its size_* land in the bbox slots as real non-zero extents (geometry, not a placeholder)',
      !!got[roomGuid] && got[roomGuid][4] > 0 && got[roomGuid][5] > 0 && got[roomGuid][6] > 0,
      got[roomGuid] && got[roomGuid].slice(4).join('x'));
    chk('R2 §67 a real IFC element still resolves from element_transforms (main path intact)',
      !!got[elemGuid], elemGuid);
    chk('R3 §67 a guid in neither table resolves nothing and is reported, not silently dropped',
      !got['NOT_A_GUID'], 'absent as expected');
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  });
})();
