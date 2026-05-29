/**
 * test_override_roundtrip.js — proves the END-TO-END working model:
 *   edit in SettingsEditor -> persists to localStorage[storageKey]
 *   -> loadJsonWithOverrides(url, storageKey) deep-merges it over the shipped file
 *   -> the consumer receives the EDITED value.
 *
 * Issue proved: Settings edits actually reach consumers (print_sheet/grid_drag/measure),
 * not just the editor. SETTINGS_JSON_EDITOR.md §Persistence. Runs headless with a fetch
 * shim that reads the real viewer/*.json from disk. exit 0 = pass.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const viewer = path.resolve(__dirname, '..', 'viewer');

// fetch shim: read viewer/<file> from disk (strip ?v=N query).
function fetchShim(url) {
  const file = String(url).split('?')[0];
  const full = path.join(viewer, file);
  return Promise.resolve({
    ok: fs.existsSync(full),
    json: function() { return Promise.resolve(JSON.parse(fs.readFileSync(full, 'utf8'))); }
  });
}

const store = {};
const localStorageShim = {
  getItem(k) { return store.hasOwnProperty(k) ? store[k] : null; },
  setItem(k, v) { store[k] = String(v); },
  removeItem(k) { delete store[k]; }
};

const src = fs.readFileSync(path.join(viewer, 'settings_editor.js'), 'utf8');
const sandbox = { window: {}, document: { createElement() { return {}; } },
  localStorage: localStorageShim, fetch: fetchShim, console: { log() {}, warn() {} } };
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
const SE = sandbox.window.SettingsEditor;
const loadJsonWithOverrides = sandbox.window.loadJsonWithOverrides;

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  §ROUNDTRIP PASS ' + name); }
  else { fail++; console.log('  §ROUNDTRIP FAIL ' + name + (extra ? ' :: ' + extra : '')); }
}

// helper: simulate "user edits one field in the editor" by mutating the inferred
// schema and persisting schemaToJson (exactly what SettingsEditor.save() writes).
function editAndPersist(raw, storageKey, mutate) {
  const schema = SE.jsonToSchema(raw);
  mutate(schema);
  store[storageKey] = JSON.stringify(SE.schemaToJson(schema));
}

(async function() {
  // ── corporate.json: edit firmName -> consumer (print_sheet) reads it ─────────
  const corp = JSON.parse(fs.readFileSync(path.join(viewer, 'corporate.json'), 'utf8'));
  editAndPersist(corp, 'json_corporate', function(schema) {
    const row = schema[0].rows.find(r => r._key === 'firmName');
    row.fields[0].value = 'EDITED CO';
  });
  const merged = await loadJsonWithOverrides('corporate.json', 'json_corporate');
  check('corporate: edited firmName reaches consumer', merged.firmName === 'EDITED CO', merged.firmName);
  check('corporate: untouched field preserved', merged.tagline === corp.tagline, merged.tagline);

  // ── grid_rules.json: edit a numeric leaf -> consumer reads it ────────────────
  const grid = JSON.parse(fs.readFileSync(path.join(viewer, 'grid_rules.json'), 'utf8'));
  editAndPersist(grid, 'json_grid_rules', function(schema) {
    const sec = schema.find(s => s._key === 'grid_move');
    const row = sec.rows.find(r => r._key === 'snap_m');
    row.fields[0].value = 0.123;
  });
  const gmerged = await loadJsonWithOverrides('grid_rules.json?v=2', 'json_grid_rules');
  check('grid_rules: edited snap_m reaches consumer', gmerged.grid_move.snap_m === 0.123, gmerged.grid_move.snap_m);
  check('grid_rules: numeric array still numbers',
    Array.isArray(gmerged.floor_plan.opening_z_range) &&
    typeof gmerged.floor_plan.opening_z_range[0] === 'number', JSON.stringify(gmerged.floor_plan.opening_z_range));

  // ── clash_rules.json: edit a rule tolerance -> consumer reads it ─────────────
  const clash = JSON.parse(fs.readFileSync(path.join(viewer, 'clash_rules.json'), 'utf8'));
  editAndPersist(clash, 'json_clash_rules', function(schema) {
    const sec = schema.find(s => s._key === 'clash_rules');
    const tol = sec.rows[0].fields.find(f => f.key === 'tolerance_m');
    tol.value = 0.999;
  });
  const cmerged = await loadJsonWithOverrides('clash_rules.json?v=2', 'json_clash_rules');
  check('clash_rules: edited tolerance reaches consumer', cmerged.clash_rules[0].tolerance_m === 0.999, cmerged.clash_rules[0].tolerance_m);
  check('clash_rules: nested + list intact on a rule',
    cmerged.clash_rules[0].source.discipline === clash.clash_rules[0].source.discipline &&
    Array.isArray(cmerged.clash_rules[0].ignore_classes));

  // ── no override stored -> consumer gets shipped file unchanged ───────────────
  delete store.json_corporate;
  const plain = await loadJsonWithOverrides('corporate.json', 'json_corporate');
  check('no override -> shipped file unchanged', plain.firmName === corp.firmName, plain.firmName);

  console.log('§ROUNDTRIP_SUMMARY ' + pass + ' pass, ' + fail + ' fail');
  if (fail > 0) process.exit(1);
})();
