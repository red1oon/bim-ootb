/**
 * test_recursive_render.js — proves the editor's RECURSIVE view handler: a row carrying a
 * `children[]` array renders as a collapsed bar that expands to its child rows, to any depth.
 *
 * Issue proved: collapsed schedule bars (e.g. Level 3 → [Level 3 TOS, Level 3 Ceiling]) are
 * rendered without flattening; child fields are present (and readonly when opts.readonly).
 * Backward-compat: a flat schema (no children) is unaffected (covered by test_settings_editor_dom).
 *
 * Run: node tests/test_recursive_render.js   (exit 0 = pass). Same DOM shim, no jsdom.
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
const localStorageShim = { getItem(k){return store.hasOwnProperty(k)?store[k]:null;}, setItem(k,v){store[k]=String(v);}, removeItem(k){delete store[k];} };

const src = fs.readFileSync(path.resolve(__dirname, '..', 'viewer', 'settings_editor.js'), 'utf8');
const logs = [];
const sandbox = { window: {}, document: documentShim, localStorage: localStorageShim, console: { log:(m)=>logs.push(m), warn:()=>{} } };
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
const SettingsEditor = sandbox.window.SettingsEditor;

let pass = 0, fail = 0;
function check(name, cond, extra) { if (cond) { pass++; console.log('  PASS ' + name); } else { fail++; console.log('  FAIL ' + name + (extra?' :: '+extra:'')); } }
function deepFindText(el, txt) {
  if (el._text === txt) return el;
  for (const c of (el.children || [])) { const r = deepFindText(c, txt); if (r) return r; }
  return null;
}
function anyListener(el, ev) {
  if (el._listeners && el._listeners[ev] && el._listeners[ev].length) return true;
  return (el.children || []).some(c => anyListener(c, ev));
}

// nested schema: a collapsed Level bar whose children are sub-storeys (recursive WBS)
const schema = [
  { section: 'Phases', rows: [
    { id: 'l3', label: 'Level 3', fields: [
        { key: 'start', type: 'text', value: '2026-08-09' },
        { key: 'weeks', type: 'number', value: 4 } ],
      children: [
        { id: 'l3tos', label: 'Level 3 TOS', fields: [{ key: 'weeks', type: 'number', value: 3 }],
          children: [
            { id: 'l3tos-task', label: 'Steel erection', fields: [{ key: 'elements', type: 'number', value: 464 }] }
          ] },
        { id: 'l3ceil', label: 'Level 3 Ceiling', fields: [{ key: 'weeks', type: 'number', value: 6 }] }
      ] }
  ]}
];

const container = makeEl('div');
SettingsEditor({ container: container, storageKey: 'json_schedule', schema: schema, readonly: true, persist: false });

const ro = logs.find(l => l.indexOf('§PROPSHEET_READONLY') === 0);
check('§PROPSHEET_READONLY fired', !!ro, ro);
// 2 (Level 3) + 1 (TOS) + 1 (TOS task) + 1 (Ceiling) = 5 fields across the whole tree
check('readonly marked ALL nested fields (5, recursion reached depth 2)', !!ro && /fields=5 /.test(ro), ro);

check('parent bar "Level 3" rendered', !!deepFindText(container, 'Level 3'));
check('child bar "Level 3 TOS" rendered (depth 1)', !!deepFindText(container, 'Level 3 TOS'));
check('grandchild "Steel erection" rendered (depth 2)', !!deepFindText(container, 'Steel erection'));
check('collapsed bars are tappable (pointerup wired for expand)', anyListener(container, 'pointerup'));
check('readonly: no editable input wired (no change listener even on nested numbers)', !anyListener(container, 'change'));

console.log('§RECURSE_SUMMARY ' + pass + ' pass, ' + fail + ' fail');
process.exit(fail > 0 ? 1 : 0);
