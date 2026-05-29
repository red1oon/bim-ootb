/**
 * test_json_to_schema.js — proves SettingsEditor.jsonToSchema maps every target JSON
 * shape correctly, and schemaToJson round-trips it. No DOM needed (pure functions).
 *
 * Issue proved: auto-infer is deterministic and lossless for the project's editable
 * JSONs (corporate / grid_rules / clash_rules / initbubble), so Settings can open ANY
 * of them with zero hand-authored UI. SETTINGS_JSON_EDITOR.md §Auto-infer.
 *
 * Run: node tests/test_json_to_schema.js   (exit 0 = pass)
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const viewer = path.resolve(__dirname, '..', 'viewer');
const src = fs.readFileSync(path.join(viewer, 'settings_editor.js'), 'utf8');

// Load the IIFE in a sandbox with a fake window; pull out the exports.
const sandbox = { window: {}, console: console, fetch: undefined, localStorage: undefined };
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
const SE = sandbox.window.SettingsEditor;

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  §PROPSHEET_TEST PASS ' + name); }
  else { fail++; console.log('  §PROPSHEET_TEST FAIL ' + name + (extra ? ' :: ' + extra : '')); }
}
function readJson(f) { return JSON.parse(fs.readFileSync(path.join(viewer, f), 'utf8')); }

// ── corporate.json: flat object -> one General section, all text rows ────────
(function() {
  const raw = readJson('corporate.json');
  const schema = SE.jsonToSchema(raw);
  const keys = Object.keys(raw);
  check('corporate: single General section', schema.length === 1 && schema[0]._general,
    'sections=' + schema.length);
  check('corporate: row per key', schema[0].rows.length === keys.length,
    schema[0].rows.length + ' vs ' + keys.length);
  check('corporate: all text fields', schema[0].rows.every(r => r.fields[0].type === 'text'));
  check('corporate: round-trips', JSON.stringify(SE.schemaToJson(schema)) === JSON.stringify(raw));
})();

// ── grid_rules.json: object-of-objects -> section per key, number rows ───────
(function() {
  const raw = readJson('grid_rules.json');
  const schema = SE.jsonToSchema(raw);
  const topKeys = Object.keys(raw);
  check('grid_rules: section per top key', schema.length === topKeys.length,
    schema.length + ' vs ' + topKeys.length);
  const gm = schema.find(s => s._key === 'grid_move');
  check('grid_rules: grid_move present', !!gm);
  check('grid_rules: numeric leaves are number type',
    gm && gm.rows.every(r => r.fields[0].type === 'number'));
  check('grid_rules: round-trips', JSON.stringify(SE.schemaToJson(schema)) === JSON.stringify(raw));
})();

// ── initbubble.json: {nodes:[...]} -> reorderable section, color/number cols ─
(function() {
  const raw = readJson('initbubble.json');
  const schema = SE.jsonToSchema(raw);
  const sec = schema.find(s => s._key === 'nodes');
  check('initbubble: reorderable nodes section', !!sec && sec.reorderable === true);
  check('initbubble: row per node', sec && sec.rows.length === raw.nodes.length);
  const colorField = sec && sec.rows[0].fields.find(f => f.key === 'color');
  check('initbubble: color field inferred', !!colorField && colorField.type === 'color',
    colorField && colorField.type);
  const countField = sec && sec.rows[0].fields.find(f => f.key === 'count');
  check('initbubble: count is number', !!countField && countField.type === 'number');
  check('initbubble: round-trips', JSON.stringify(SE.schemaToJson(schema)) === JSON.stringify(raw));
})();

// ── clash_rules.json: array-of-objects with nested + array fields ────────────
(function() {
  const raw = readJson('clash_rules.json');
  const schema = SE.jsonToSchema(raw);
  const sec = schema.find(s => s._key === 'clash_rules');
  check('clash_rules: reorderable section', !!sec && sec.reorderable === true);
  const row0 = sec && sec.rows[0];
  const dotted = row0 && row0.fields.find(f => f.key === 'source.discipline');
  check('clash_rules: nested -> dotted field', !!dotted, dotted && dotted.value);
  const list = row0 && row0.fields.find(f => f.key === 'ignore_classes');
  check('clash_rules: primitive array -> comma text', !!list && list._list === true && list.type === 'text');
  // round-trip: nested rebuilt, list re-split
  const back = SE.schemaToJson(schema);
  check('clash_rules: nested round-trips',
    back.clash_rules[0].source.discipline === raw.clash_rules[0].source.discipline);
  check('clash_rules: list round-trips',
    JSON.stringify(back.clash_rules[0].ignore_classes) === JSON.stringify(raw.clash_rules[0].ignore_classes),
    JSON.stringify(back.clash_rules[0].ignore_classes));
})();

// ── overrides: upgrade a text field to choice/readonly ───────────────────────
(function() {
  const raw = { firmName: 'BIM OOTB', mode: 'dark' };
  const schema = SE.jsonToSchema(raw, {
    firmName: { readonly: true },
    mode: { type: 'choice', options: [{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }] }
  });
  const rows = schema[0].rows;
  check('override: readonly applied', rows.find(r => r._key === 'firmName').fields[0].readonly === true);
  check('override: choice + options applied',
    rows.find(r => r._key === 'mode').fields[0].type === 'choice' &&
    rows.find(r => r._key === 'mode').fields[0].options.length === 2);
})();

// ── grep proof: no app-specific identifiers in CODE (strip comments first) ────
(function() {
  const codeOnly = src
    .replace(/\/\*[\s\S]*?\*\//g, '')      // block comments
    .replace(/(^|[^:])\/\/.*$/gm, '$1');   // line comments
  const banned = /\bTHREE\b|\b_actions\b|\b_mainPill\b|bim_pill|PillBuilder|IfcOpeningElement/;
  const hit = banned.exec(codeOnly);
  check('grep: zero app-specific identifiers in code', !hit, hit && hit[0]);
})();

console.log('§PROPSHEET_TEST_SUMMARY ' + pass + ' pass, ' + fail + ' fail');
if (fail > 0) process.exit(1);
