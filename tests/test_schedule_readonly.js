/**
 * test_schedule_readonly.js — proves the Phase-1 schedule showcase opens READ-ONLY.
 *
 * Issue proved (SETTINGS_JSON_EDITOR.md §Whole-file read-only): a registry entry with
 * readonly:true opens the schedule_instance contract JSON with EVERY field display-only
 * and no write path. Witnesses:
 *   §PROPSHEET_READONLY id=json_schedule fields=N writable=0   (no editable controls)
 *   §PROPSHEET_RENDER sections=2 rows=M                         (Project + Phases render)
 * and asserts no 'change'-wired input and no toggle button exist (pure spans).
 *
 * Run: node tests/test_schedule_readonly.js   (exit 0 = pass). Uses the same DOM shim
 * as test_settings_editor_dom.js — no jsdom.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function makeEl(tag) {
  return {
    tagName: (tag || 'div').toUpperCase(),
    style: { cssText: '' }, children: [], _listeners: {}, _text: '', _html: '',
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
  setItem(k, v) { store[k] = String(v); }, removeItem(k) { delete store[k]; }
};

const src = fs.readFileSync(path.resolve(__dirname, '..', 'viewer', 'settings_editor.js'), 'utf8');
const logs = [];
const sandbox = { window: {}, document: documentShim, localStorage: localStorageShim,
  console: { log: (m) => { logs.push(m); }, warn: () => {} } };
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
const SettingsEditor = sandbox.window.SettingsEditor;

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' :: ' + extra : '')); }
}
function find(el, ev, tag) {
  if (el._listeners && el._listeners[ev] && el._listeners[ev].length && (!tag || el.tagName === tag)) return el;
  for (const c of (el.children || [])) { const r = find(c, ev, tag); if (r) return r; }
  return null;
}

// schedule_instance contract JSON — captured provider (mirrors panels.js _projectSchedule output)
const instance = {
  Project: { building: 'Hospital 2.0', start: '2026-05-11', calendar: '9 - 5', source: 'captured' },
  Phases: [
    { id: 'p0', phase: 'Site Works',   start: '2026-05-11', weeks: 1, elements: 1,   source: 'captured' },
    { id: 'p1', phase: 'Substructure', start: '2026-05-16', weeks: 3, elements: 607, source: 'captured' },
    { id: 'p2', phase: 'Level 1',      start: '2026-06-10', weeks: 4, elements: 562, source: 'captured' },
    { id: 'p3', phase: 'Level 2',      start: '2026-07-10', weeks: 4, elements: 418, source: 'captured' }
  ]
};

const schema = SettingsEditor.jsonToSchema(instance, {});
const container = makeEl('div');
SettingsEditor({ container: container, storageKey: 'json_schedule', schema: schema,
  readonly: true, persist: false, onChange: function () {} });

const roLog = logs.find(l => l.indexOf('§PROPSHEET_READONLY') === 0);
check('§PROPSHEET_READONLY fired', !!roLog, roLog);
check('writable=0 (no write path)', !!roLog && /writable=0$/.test(roLog), roLog);

const renderLog = logs.find(l => l.indexOf('§PROPSHEET_RENDER') === 0);
check('§PROPSHEET_RENDER fired', !!renderLog, renderLog);
check('2 sections render (Project + Phases)', !!renderLog && /sections=2 /.test(renderLog), renderLog);

// read-only proof: no input wired with 'change' and no toggle BUTTON anywhere
check('no editable text/number/choice control (no change listener)', !find(container, 'change'), 'found a change-wired input');
check('no toggle button (would be editable)', !find(container, 'pointerup', 'BUTTON'), 'found a toggle button');

console.log('§SCHEDULE_RO_SUMMARY ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail > 0 ? 1 : 0);
