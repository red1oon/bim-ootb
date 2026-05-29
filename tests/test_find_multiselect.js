/**
 * test_find_multiselect.js — §NAV_FIND_002 logic test
 *
 * Spec: prompts/NAV_FIND_002_multiselect.md (bim-compiler)
 * Proves the pure logic behind Find-panel multi-select + storey visibility,
 * and asserts the deployed source actually defines the contract functions.
 *
 * Each block names the issue it proves. Browser §-log verification (FIND_MULTISEL,
 * STOREY_FILTER) is separate; this guards the algorithm against regression headlessly.
 */
'use strict';
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.log('  §FM_TEST FAIL: ' + name); }
}
function eqArr(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

// ── Reference impls — MUST mirror the deployed code (panels.js / navigate_find.js) ──
// _storeyVisible: panels.js §NAV_FIND_002
function storeyVisible(f, s) {
  if (f === null || f === undefined) return true;
  if (Array.isArray(f)) return f.indexOf(s) >= 0;
  return s === f;
}
// filterStorey arg normalization: panels.js §NAV_FIND_002
function normStorey(arg) {
  if (Array.isArray(arg)) return arg.length ? (arg.length === 1 ? arg[0] : arg.slice()) : null;
  return arg;
}
// Multi-select transition: navigate_find.js _doTap §NAV_FIND_002
// state = {sel:Set, anchor:string|null}; returns new state. labels = ordered parent labels.
function tap(state, label, mod, labels) {
  const sel = new Set(state.sel);
  let anchor = state.anchor;
  if (mod === 'shift' && anchor !== null) {
    const ai = labels.indexOf(anchor), bi = labels.indexOf(label);
    if (ai >= 0 && bi >= 0) {
      sel.clear();
      for (let k = Math.min(ai, bi); k <= Math.max(ai, bi); k++) sel.add(labels[k]);
    } else { sel.clear(); sel.add(label); anchor = label; }
  } else if (mod === 'ctrl') {
    if (sel.has(label)) sel.delete(label); else sel.add(label);
    anchor = label;
  } else {
    sel.clear(); sel.add(label); anchor = label;
  }
  return { sel, anchor };
}
// filterDiscs keep-set → hidden complement: panels.js §NAV_FIND_002
function discHidden(allDiscs, list) {
  const hidden = new Set();
  if (list && list.length) {
    const keep = new Set(list);
    allDiscs.forEach(d => { if (!keep.has(d)) hidden.add(d); });
  }
  return hidden;
}

// ── Issue 1: storey visibility must be correct for null|string|array ──
ok(storeyVisible(null, 'L1') === true, 'null filter → all visible');
ok(storeyVisible(undefined, 'L1') === true, 'undefined filter → all visible');
ok(storeyVisible('L1', 'L1') === true && storeyVisible('L1', 'L2') === false, 'single filter isolates one storey');
ok(storeyVisible(['L1', 'L2'], 'L1') === true && storeyVisible(['L1', 'L2'], 'L2') === true, 'array filter shows all selected');
ok(storeyVisible(['L1', 'L2'], 'L3') === false, 'array filter hides non-selected (regression: === would hide all)');

// ── Issue 2: filterStorey normalizes its arg (empty→all, single→string, many→array) ──
ok(normStorey([]) === null, 'empty selection → null (show all)');
ok(normStorey(['L1']) === 'L1', 'single-element array collapses to string');
ok(eqArr(normStorey(['L1', 'L2']), ['L1', 'L2']), 'multi array stays array');
ok(normStorey(null) === null && normStorey('L1') === 'L1', 'null/string pass through');

// ── Issue 3: multi-select transitions (plain replace / ctrl toggle / shift range) ──
const labels = ['L1', 'L2', 'L3', 'L4'];
let st = { sel: new Set(), anchor: null };
st = tap(st, 'L2', 'plain', labels);
ok(eqArr([...st.sel], ['L2']) && st.anchor === 'L2', 'plain tap = single select');
st = tap(st, 'L4', 'ctrl', labels);
ok(st.sel.has('L2') && st.sel.has('L4') && st.sel.size === 2, 'ctrl adds a second storey');
st = tap(st, 'L4', 'ctrl', labels);
ok(!st.sel.has('L4') && st.sel.has('L2'), 'ctrl on selected toggles it off');
st = { sel: new Set(['L2']), anchor: 'L2' };
st = tap(st, 'L4', 'shift', labels);
ok(eqArr([...st.sel].sort(), ['L2', 'L3', 'L4']), 'shift selects contiguous range from anchor');
st = tap(st, 'L1', 'shift', labels); // anchor still L2 (shift doesn't move anchor)
ok(eqArr([...st.sel].sort(), ['L1', 'L2']), 'shift range works backward from anchor');
st = tap(st, 'L3', 'plain', labels);
ok(eqArr([...st.sel], ['L3']) && st.anchor === 'L3', 'plain tap after multi clears to single');

// ── Issue 4: filterDiscs shows only listed disciplines (hidden = complement) ──
const allDiscs = ['STR', 'ARC', 'MEP', 'ELEC'];
ok(eqArr([...discHidden(allDiscs, ['STR', 'ARC'])].sort(), ['ELEC', 'MEP']), 'filterDiscs([STR,ARC]) hides the rest');
ok(discHidden(allDiscs, []).size === 0, 'filterDiscs([]) → nothing hidden (all visible)');
ok(discHidden(allDiscs, null).size === 0, 'filterDiscs(null) → nothing hidden (all visible)');
ok(eqArr([...discHidden(allDiscs, ['MEP'])].sort(), ['ARC', 'ELEC', 'STR']), 'single disc isolates one discipline');

// ── Issue 5: deployed source actually defines the contract (guards against drift) ──
const panels = fs.readFileSync(path.resolve(__dirname, '..', 'viewer', 'panels.js'), 'utf8');
const navfind = fs.readFileSync(path.resolve(__dirname, '..', 'viewer', 'navigate_find.js'), 'utf8');
ok(/A\._storeyVisible\s*=\s*function/.test(panels), 'panels.js defines A._storeyVisible');
ok(/A\.filterDiscs\s*=\s*function/.test(panels), 'panels.js defines A.filterDiscs');
ok(/§FIND_MULTISEL/.test(navfind), 'navigate_find.js logs §FIND_MULTISEL');
ok(/restored=none/.test(navfind), 'navigate_find.js: exit no longer restores (restored=none)');
ok(!/if \(A\.filterStorey\) A\.filterStorey\(null\);\s*\n\s*if \(A\.filterDisc\) A\.filterDisc\(null\);[\s\S]{0,80}§FIND_CLOSE/.test(navfind), 'closeFindPanel does not reset filters');

console.log('§FM_TEST_SUMMARY pass=' + pass + ' fail=' + fail);
process.exit(fail > 0 ? 1 : 0);
