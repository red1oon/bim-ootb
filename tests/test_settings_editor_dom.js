/**
 * test_settings_editor_dom.js — exercises SettingsEditor's DOM render + save paths
 * with a minimal DOM shim (no jsdom). Proves the witness logs fire:
 *   §PROPSHEET_RENDER sections=N rows=M  (schema -> controls)
 *   §PROPSHEET_SAVE key=... field=...    (edit persists to storageKey)
 *
 * Issue proved: the generic editor actually builds controls and write-throughs an
 * edit to localStorage — SETTINGS_JSON_EDITOR.md §Test. Run: node this. exit 0 = pass.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ── minimal DOM shim ─────────────────────────────────────────────────────────
function makeEl(tag) {
  return {
    tagName: (tag || 'div').toUpperCase(),
    style: { cssText: '' }, children: [], _listeners: {},
    _text: '', _html: '',
    get textContent() { return this._text; }, set textContent(v) { this._text = v; },
    get innerHTML() { return this._html; }, set innerHTML(v) { this._html = v; if (v === '') this.children = []; },
    appendChild(c) { this.children.push(c); return c; },
    setAttribute() {}, getAttribute() { return null; },
    addEventListener(ev, fn) { (this._listeners[ev] = this._listeners[ev] || []).push(fn); },
    setPointerCapture() {}, getBoundingClientRect() { return { top: 0, height: 10 }; },
    querySelectorAll() { return []; }
  };
}
const documentShim = { createElement: makeEl };

const store = {};
const localStorageShim = {
  getItem(k) { return store.hasOwnProperty(k) ? store[k] : null; },
  setItem(k, v) { store[k] = String(v); },
  removeItem(k) { delete store[k]; }
};

// ── load the editor in a sandbox ─────────────────────────────────────────────
const src = fs.readFileSync(path.resolve(__dirname, '..', 'viewer', 'settings_editor.js'), 'utf8');
const logs = [];
const sandbox = {
  window: {}, document: documentShim, localStorage: localStorageShim,
  console: { log: (m) => { logs.push(m); }, warn: () => {} }
};
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
const SettingsEditor = sandbox.window.SettingsEditor;

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  §EDITOR_DOM PASS ' + name); }
  else { fail++; console.log('  §EDITOR_DOM FAIL ' + name + (extra ? ' :: ' + extra : '')); }
}
function findByListener(el, ev, tag) {
  if (el._listeners && el._listeners[ev] && el._listeners[ev].length &&
      (!tag || el.tagName === tag)) return el;
  for (const c of (el.children || [])) { const r = findByListener(c, ev, tag); if (r) return r; }
  return null;
}

// ── render: a non-reorderable section with toggle + text + readonly ──────────
const container = makeEl('div');
SettingsEditor({
  container: container,
  storageKey: 'test_key',
  schema: [
    { section: 'General', _general: true, rows: [
      { id: 'flag', label: 'Flag', _key: 'flag', fields: [{ key: 'value', type: 'toggle', value: false }] },
      { id: 'name', label: 'Name', _key: 'name', fields: [{ key: 'value', type: 'text', value: 'x' }] }
    ]}
  ]
});

const renderLog = logs.find(l => l.indexOf('§PROPSHEET_RENDER') === 0);
check('render log fired', !!renderLog, renderLog);
check('render counts correct', renderLog === '§PROPSHEET_RENDER sections=1 rows=2', renderLog);

// ── save: fire the toggle's pointerup, expect §PROPSHEET_SAVE + localStorage ──
const toggleBtn = findByListener(container, 'pointerup', 'BUTTON');
check('toggle control built', !!toggleBtn);
if (toggleBtn) {
  toggleBtn._listeners.pointerup[0]({ stopPropagation() {} });
  const saveLog = logs.find(l => l.indexOf('§PROPSHEET_SAVE') === 0);
  check('save log fired', !!saveLog, saveLog);
  check('persisted to storageKey', store.test_key && JSON.parse(store.test_key).flag === true,
    store.test_key);
}

// ── reset clears the storageKey ──────────────────────────────────────────────
const ed2 = SettingsEditor({
  container: makeEl('div'), storageKey: 'test_key2',
  schema: [{ section: 'G', _general: true, rows: [
    { id: 'a', _key: 'a', fields: [{ key: 'value', type: 'text', value: '1' }] }] }]
});
store.test_key2 = '{"a":"changed"}';
ed2.reset();
check('reset removed storageKey', !store.hasOwnProperty('test_key2'));

console.log('§EDITOR_DOM_SUMMARY ' + pass + ' pass, ' + fail + ' fail');
if (fail > 0) process.exit(1);
