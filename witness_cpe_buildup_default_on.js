#!/usr/bin/env node
// § CPE_BUILDUP_DEFAULT_ON — witness: a fresh Cinema Path Editor session must open with the
// "build the model as the film plays" checkbox CHECKED and _state.buildup seeded true, not the
// old opt-in default. Static source-assertion (deterministic, no browser needed for this claim):
// both the checkbox's rendered HTML and the _state initializer must agree, or the panel would
// show checked while the underlying state (and therefore the first bake) stayed unbuilt.
const fs = require('fs');
const path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, 'viewer/cinema_path_editor.js'), 'utf8');

let pass = true;
function P(name, ok, detail) {
  console.log('§CPE_BUILDUP_DEFAULT ' + name + ' = ' + (ok ? 'PASS' : 'FAIL') + (detail ? ' — ' + detail : ''));
  if (!ok) pass = false;
}

// G-BD-1: the checkbox markup carries the `checked` attribute.
const checkboxMatch = SRC.match(/<input id="cpe-buildup" type="checkbox"([^>]*)>/);
P('G-BD-1 checkbox has checked attribute',
  !!checkboxMatch && /\bchecked\b/.test(checkboxMatch[1]),
  checkboxMatch ? ('found tag: <input id="cpe-buildup" type="checkbox"' + checkboxMatch[1] + '>') : 'checkbox markup not found');

// G-BD-2: the fresh-session _state initializer seeds buildup: true, not false.
const stateInitMatch = SRC.match(/_state\s*=\s*\{[\s\S]*?\bbuildup:\s*(true|false)\s*,/);
P('G-BD-2 _state initializer seeds buildup:true',
  !!stateInitMatch && stateInitMatch[1] === 'true',
  stateInitMatch ? ('found: buildup: ' + stateInitMatch[1]) : '_state initializer buildup field not found');

// G-BD-3: restoring an EXISTING saved plan still honours whatever that plan actually saved
// (ov.buildup) rather than being forced true — this default only governs a FRESH session.
const restoreMatch = SRC.match(/_state\.buildup\s*=\s*!!ov\.buildup;/);
P('G-BD-3 saved-plan restore still reads the plan\'s own value (not forced)',
  !!restoreMatch, restoreMatch ? 'found: _state.buildup = !!ov.buildup;' : 'restore assignment not found — check it was not accidentally changed');

console.log('§CPE_BUILDUP_DEFAULT_VERDICT ' + (pass ? 'PASS' : 'FAIL'));
process.exit(pass ? 0 : 1);
