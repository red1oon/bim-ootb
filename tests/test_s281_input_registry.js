/**
 * BIM OOTB — §S281 input registry whitebox smoke-test (zero network, no browser).
 * Loads viewer/input_registry.js in a mock window/document sandbox and asserts the
 * P0 FACADE: defines window.InputReg, delegates panel ops to scene.js exports,
 * registers icons, and changes NO keypress behaviour (attaches no listeners).
 * Model: tests/test_s251_keyboard.js (src+check pattern).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', 'viewer', 'input_registry.js');
const code = fs.readFileSync(SRC, 'utf8');

let pass = 0, fail = 0;
function check(id, ok, detail) {
  if (ok) { pass++; console.log('  PASS ' + id); }
  else { fail++; console.log('  FAIL ' + id + (detail ? ' — ' + detail : '')); }
}

// ── Build a mock window/document with spies on scene.js's exported delegators ──
const calls = [];
const fakeBtns = {}; // id -> { classes:Set }
function fakeBtn(id) {
  if (!fakeBtns[id]) fakeBtns[id] = { _c: new Set(),
    classList: { toggle(c, on) { fakeBtns[id]._c[on ? 'add' : 'delete'](c); } } };
  return fakeBtns[id];
}

let focused = null; // simulated current focused panel
const panels = [];

const win = {
  _panels: panels,
  _focusStack: [],
  _getFocusedPanel: () => focused,
  _registerPanel: (id, el, nav, closeFn) => { calls.push(['register', id]); panels.push({ id, el, nav, close: closeFn }); },
  _focusPanel: (id) => { calls.push(['focus', id]); },
  _blurPanel: () => { calls.push(['blur']); },
  _cyclePanel: (dir) => { calls.push(['cycle', dir]); },
  addEventListener: (ev) => { calls.push(['addEventListener', ev]); }, // spy: facade must NOT call this
};
const doc = { getElementById: (id) => fakeBtn(id) };

const sandbox = { window: win, document: doc, console: { log: () => {} } };
sandbox.window.window = sandbox.window;
vm.createContext(sandbox);
vm.runInContext(code, sandbox);

const R = win.InputReg;

console.log('§S281_TEST input_registry facade');

// 1. Defines the API surface
check('1.1 InputReg defined', !!R);
check('1.2 has register/unregister', R && typeof R.register === 'function' && typeof R.unregister === 'function');
check('1.3 has focus/blur/cycle', R && ['focus', 'blur', 'cycle'].every(m => typeof R[m] === 'function'));
check('1.4 has focusTop/focusStackIds/releaseTop', R && ['focusTop', 'focusStackIds', 'releaseTop'].every(m => typeof R[m] === 'function'));
check('1.5 has syncActiveButtons', R && typeof R.syncActiveButtons === 'function');

// 2. CRITICAL: facade attaches NO event listeners (no behaviour change)
check('2.1 no addEventListener called at load', !calls.some(c => c[0] === 'addEventListener'));

// 3. Panel register delegates to scene._registerPanel (byte-compatible)
R.register({ id: 'demo', el: {}, kind: 'panel', release: () => {} });
check('3.1 panel register → _registerPanel', calls.some(c => c[0] === 'register' && c[1] === 'demo'));

// 4. focusTop reflects scene.js current focused panel
focused = { id: 'demo', close: null };
check('4.1 focusTop = current focused panel', R.focusTop() && R.focusTop().id === 'demo');
focused = null;
check('4.2 focusTop null when none focused', R.focusTop() === null);

// 5. focusStackIds = prev stack + current on top
win._focusStack = ['a', 'b'];
focused = { id: 'c', close: null };
check('5.1 focusStackIds appends current', JSON.stringify(R.focusStackIds()) === JSON.stringify(['a', 'b', 'c']));

// 6. releaseTop: calls close + blur, returns true; false when nothing focused
let closed = false;
focused = { id: 'c', close: () => { closed = true; } };
const r1 = R.releaseTop();
check('6.1 releaseTop returns true when focused', r1 === true);
check('6.2 releaseTop called panel.close', closed === true);
check('6.3 releaseTop called blur', calls.some(c => c[0] === 'blur'));
focused = null;
check('6.4 releaseTop false when nothing focused', R.releaseTop() === false);

// 7. Icon register + syncActiveButtons drives the .active class from isActive()
let xrayOn = false;
R.register({ id: 'xray', kind: 'icon', btnId: 'xray-btn', isActive: () => xrayOn, release: () => {} });
xrayOn = true; R.syncActiveButtons();
check('7.1 active class ON when isActive true', fakeBtn('xray-btn')._c.has('active'));
xrayOn = false; R.syncActiveButtons();
check('7.2 active class OFF when isActive false', !fakeBtn('xray-btn')._c.has('active'));

// 8. Idempotent icon re-register (no duplicate)
R.register({ id: 'xray', kind: 'icon', btnId: 'xray-btn', isActive: () => false, release: () => {} });
check('8.1 icon re-register dedupes', R._icons.filter(i => i.id === 'xray').length === 1);

// 9. P1 contract: focusOnlyLatest must derive "latest" from focusTop(), not _focusStack.
//    Simulate the bug condition: a panel is focused but NOT yet on _focusStack.
win._focusStack = []; // stack empty (current panel never pushed until blurred)
focused = { id: 'find', close: null };
const p1Latest = (win.InputReg && win.InputReg.focusTop()) ? win.InputReg.focusTop().id : null;
check('9.1 focusTop yields current panel when stack empty (P1 fix)', p1Latest === 'find');

// 10. P3 contract: the 7 overflow icons each expose btnId + isActive + release, and
//     syncActiveButtons reflects each flag independently.
const flags = { xray: false, section: false, sunglass: false, fly: false, shadow: false, bg: false, grid2d: false };
const ids = { xray: 'xray-btn', section: 'section-btn', sunglass: 'sunglass-btn', fly: 'fly-btn', shadow: 'shadow-overflow-btn', bg: 'bg-overflow-btn', grid2d: 'grid-2d-btn' };
Object.keys(flags).forEach(k => R.register({ id: 'of-' + k, kind: 'icon', btnId: ids[k], isActive: () => flags[k], release: () => {} }));
flags.section = true; flags.bg = true; R.syncActiveButtons();
check('10.1 section-btn active when only section flag on', fakeBtn('section-btn')._c.has('active'));
check('10.2 bg-overflow-btn active when only bg flag on', fakeBtn('bg-overflow-btn')._c.has('active'));
check('10.3 sunglass-btn NOT active (flag off)', !fakeBtn('sunglass-btn')._c.has('active'));
check('10.4 exact button IDs preserved', Object.values(ids).every(id => R._icons.some(i => i.btnId === id)));

console.log('§S281_TEST_SUMMARY pass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);
