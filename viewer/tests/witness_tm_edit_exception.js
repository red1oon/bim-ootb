#!/usr/bin/env node
/**
 * witness_tm_edit_exception.js — a Gantt edit that THROWS recovers the display, tells the user in
 * TM's own voice, and offers (never forces) closing the other open panels.
 *
 * Implementing the tm-error-handling spec (feat/tm-error-handling) — Witness: W-TM-EXC
 *
 * THE ISSUE EACH CHECK PROVES OR DISPROVES. Before this change the 7 edit pipelines
 * (commitGanttDrag, shiftGanttSchedule, commitGanttGroupShift, rescheduleGanttAsap, linkGanttBars,
 * the props-panel Apply, generateGanttSchedule) had NO try/catch: a throw anywhere in
 * verb → retime → resync → annotate → persist → repaint propagated uncaught to error_reporter.js's
 * SITEWIDE handler — a generic "Something went wrong" toast, rate-limited to 3 per session across
 * the whole app — and TM's own panel froze on whatever half-updated frame the throw interrupted.
 *
 * W-EXC-1  (static, brace-anchored) every one of the 7 pipelines has the catch wired to
 *          _tmEditExceptionRecover with its own fn label — a future 8th path is caught by W-TM-SRT's
 *          sibling philosophy: derive the list from source, never trust a hand-kept one... but the
 *          7 named here ARE the spec's list, so they are asserted by name.
 * W-EXC-2  (dynamic) a REAL throw inside the engine verb fires the catch and logs §TM_EDIT_EXCEPTION
 *          with the right fn= and error=.
 * W-EXC-3  the recovery re-derivers ALL run after the throw (no stale frame): _tmResyncAfterRetime,
 *          invalidateGanttModel, computeDays, drawGanttMini, renderAtTime.
 * W-EXC-4  the tip shown is TM-specific ("Time Machine couldn't complete this edit — <reason>"),
 *          via #tm-gantt-tip, not the sitewide toast.
 * W-EXC-5  with other panels visible in window._panels (the REAL scene.js registry shape,
 *          {id, el, nav, close}), the close-offer appears; clicking it closes exactly the visible
 *          non-TM entries (close() when present, display='none' otherwise), logs
 *          §TM_CLOSE_OTHER_PANELS closed=n ids=[...], and NEVER touches the TM panel, hidden
 *          panels, or zero-width panels.
 * W-EXC-6  with NO other visible panels, no offer is rendered (no no-op action) and the tip's
 *          pointer-events contract stays 'none'.
 * W-EXC-7  closing is user-clicked ONLY: before the click, nothing has been closed.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
function assert(cond, msg) { if (cond) { pass++; console.log('  PASS ' + msg); } else { fail++; console.log('  FAIL ' + msg); } }

const tmSrc = fs.readFileSync(path.join(__dirname, '..', 'time_machine.js'), 'utf8');

function sliceFn(src, name) {
  const idx = src.indexOf('function ' + name + '(');
  if (idx < 0) throw new Error(name + ' not found in time_machine.js');
  let d = 0, i = idx, open = false;
  for (; i < src.length; i++) {
    if (src[i] === '{') { d++; open = true; }
    else if (src[i] === '}') { d--; if (open && d === 0) break; }
  }
  return src.slice(idx, i + 1);
}

console.log('── witness_tm_edit_exception (W-TM-EXC) ──');

// ── W-EXC-1 — static: all 7 pipelines carry the catch, each with its own label ─────────────────
// openGanttProps hosts the typed-apply pipeline (the inline tmp-apply onclick), labelled
// commitGanttProps per the spec — there is no standalone function of that name.
const WRAPPED = {
  commitGanttDrag: 'commitGanttDrag',
  shiftGanttSchedule: 'shiftGanttSchedule',
  commitGanttGroupShift: 'commitGanttGroupShift',
  rescheduleGanttAsap: 'rescheduleGanttAsap',
  linkGanttBars: 'linkGanttBars',
  generateGanttSchedule: 'generateGanttSchedule',
  openGanttProps: 'commitGanttProps'
};
for (const fn in WRAPPED) {
  let body;
  try { body = sliceFn(tmSrc, fn); } catch (e) { assert(false, 'W-EXC-1 ' + fn + ' exists'); continue; }
  const wired = body.indexOf("_tmEditExceptionRecover('" + WRAPPED[fn] + "'") >= 0 && /catch\s*\(/.test(body);
  assert(wired, 'W-EXC-1 ' + fn + ' pipeline is wrapped and its catch calls _tmEditExceptionRecover(\'' + WRAPPED[fn] + '\')');
}

// ── The sandbox: real helpers + real commitGanttDrag, throwing engine verb, counting recovery ──
function makeTipEl() {
  return {
    id: 'tm-gantt-tip',
    style: { display: 'none', pointerEvents: 'none', whiteSpace: 'nowrap', overflow: 'hidden' },
    textContent: '',
    _children: [],
    appendChild: function (c) { this._children.push(c); }
  };
}
function makePanel(id, opts) {
  opts = opts || {};
  const el = {
    id: opts.elId !== undefined ? opts.elId : ('panel-' + id),
    offsetWidth: opts.width !== undefined ? opts.width : 200,
    style: { display: opts.display !== undefined ? opts.display : '' }
  };
  const p = { id: id, el: el, nav: null, close: null, _closed: 0 };
  if (opts.withClose) p.close = function () { p._closed++; };
  return p;
}

function run(opts) {
  opts = opts || {};
  const logs = [];
  const calls = { resync: 0, invalidate: 0, computeDays: 0, draw: 0, render: 0, persist: 0 };
  const tip = makeTipEl();
  const createdButtons = [];
  const sandbox = {
    console: { log: (...a) => logs.push(a.join(' ')), warn: (...a) => logs.push(a.join(' ')) },
    Math: Math, Date: Date, JSON: JSON, String: String,
    setTimeout: () => {},   // the hide timer must never fire inside the assert window
    document: {
      getElementById: id => (id === 'tm-gantt-tip' ? tip : null),
      createElement: function (tag) {
        const btn = { tag: tag, style: {}, textContent: '', _listeners: {},
          addEventListener: function (t, f) { this._listeners[t] = f; } };
        createdButtons.push(btn);
        return btn;
      }
    },
    window: {
      _panels: opts.panels || [],
      ScheduleAuthor: {
        moveTaskCascade: () => { throw new Error('boom sql.js exploded'); },
        resizeTask: () => { throw new Error('boom sql.js exploded'); },
        shiftSchedule: () => { throw new Error('boom shift exploded'); }
      }
    },
    A: () => ({ db: {
      // commitGanttDrag's tasksBefore snapshot needs the dragged task's REAL dates or it refuses
      // at no_real_task_snapshot before ever reaching the throwing verb.
      exec: () => [{ values: [['T1', '2026-01-01', '2026-01-10', 9]] }],
      run: () => {}, prepare: () => ({ run: () => {}, free: () => {} })
    } }),
    _tmEditLocked: () => false,
    _tmAnnotateCpm: () => {},
    _tmPersistEdit: () => { calls.persist++; },
    retimeTaskElements: () => {},
    _tmResyncAfterRetime: () => { calls.resync++; },
    invalidateGanttModel: () => { calls.invalidate++; },
    computeDays: () => { calls.computeDays++; },
    drawGanttMini: () => { calls.draw++; },
    renderAtTime: () => { calls.render++; },
    _cursor: 0,
    _taskIndex: { scheduleId: 'SCH_X', tasks: {} },
    _ganttTasks: [],
    _ops: [],
    _lastEdit: null
  };
  sandbox.window.window = sandbox.window;
  vm.createContext(sandbox);
  vm.runInContext(
    sliceFn(tmSrc, '_tmTipRestore') + '\n' +
    sliceFn(tmSrc, '_tmSay') + '\n' +
    sliceFn(tmSrc, '_tmVisibleOtherPanels') + '\n' +
    sliceFn(tmSrc, '_tmSayException') + '\n' +
    sliceFn(tmSrc, '_tmEditExceptionRecover') + '\n' +
    sliceFn(tmSrc, 'commitGanttDrag') + '\n' +
    sliceFn(tmSrc, 'shiftGanttSchedule') + '\n' +
    'this.__drag = commitGanttDrag; this.__shift = shiftGanttSchedule;', sandbox);
  return { sandbox, logs, calls, tip, createdButtons };
}

// ── W-EXC-2/3/4/6 — throw with NO other panels visible ──────────────────────────────────────────
{
  const r = run({ panels: [
    makePanel('tm-fake', { elId: 'time-machine-panel', withClose: true }),      // TM itself: NEVER "other"
    makePanel('hiddenone', { display: 'none', withClose: true }),               // display:none: not visible
    makePanel('zerow', { width: 0, withClose: true })                           // zero width: not visible
  ] });
  let ret;
  try { ret = r.sandbox.__drag({ taskId: 'T1', storey: 'L1', phase: 'Arch' }, 'move', 2); }
  catch (e) { assert(false, 'W-EXC-2 the throw must be CAUGHT, not propagate (escaped: ' + e.message + ')'); }
  const excLine = r.logs.find(l => l.indexOf('§TM_EDIT_EXCEPTION ') === 0);
  assert(!!excLine && excLine.indexOf('fn=commitGanttDrag') > 0 && excLine.indexOf('boom sql.js exploded') > 0,
    'W-EXC-2 §TM_EDIT_EXCEPTION logged with fn=commitGanttDrag and the real error (' + (excLine || 'NO LINE') + ')');
  assert(ret === undefined, 'W-EXC-2b a caught throw returns undefined = "did not commit" (§S73 hook contract)');
  assert(r.calls.resync === 1 && r.calls.invalidate === 1 && r.calls.computeDays === 1 && r.calls.draw === 1 && r.calls.render === 1,
    'W-EXC-3 ALL five recovery re-derivers ran after the throw — no stale frame (resync=' + r.calls.resync +
    ' invalidate=' + r.calls.invalidate + ' computeDays=' + r.calls.computeDays + ' draw=' + r.calls.draw + ' render=' + r.calls.render + ')');
  assert(r.calls.persist === 0, 'W-EXC-3b _tmPersistEdit did NOT run on the failed edit (never persist a state the verb did not commit)');
  assert(r.tip.style.display === 'block' && r.tip.textContent.indexOf("Time Machine couldn't complete this edit — ") === 0 &&
    r.tip.textContent.indexOf('boom sql.js exploded') > 0,
    'W-EXC-4 TM-specific tip shown via #tm-gantt-tip ("' + r.tip.textContent + '")');
  assert(r.tip._children.length === 0 && r.createdButtons.length === 0,
    'W-EXC-6 NO close-offer when no other panel is visible (TM itself / hidden / zero-width all filtered)');
  assert(r.tip.style.pointerEvents === 'none',
    'W-EXC-6b tip keeps pointer-events:none when no action is offered');
}

// ── W-EXC-5/7 — throw WITH two visible other panels ────────────────────────────────────────────
{
  const withClose = makePanel('clash', { withClose: true });
  const noClose = makePanel('section', { withClose: false });
  const tmP = makePanel('tm-fake', { elId: 'time-machine-panel', withClose: true });
  const hid = makePanel('hiddenone', { display: 'none', withClose: true });
  const r = run({ panels: [tmP, withClose, noClose, hid] });
  try { r.sandbox.__drag({ taskId: 'T1', storey: 'L1', phase: 'Arch' }, 'move', 2); }
  catch (e) { assert(false, 'W-EXC-5 the throw must be CAUGHT (escaped: ' + e.message + ')'); }
  const btn = r.tip._children[0];
  assert(r.tip._children.length === 1 && btn && btn.textContent.indexOf('Close other panels (2)') === 0,
    'W-EXC-5 close-offer rendered in the tip, counting exactly the 2 visible others ("' + (btn ? btn.textContent : 'NONE') + '")');
  assert(r.tip.style.pointerEvents === 'auto' && r.tip.style.whiteSpace === 'normal',
    'W-EXC-5b tip is made clickable/wrappable while the offer is up (pointer-events=' + r.tip.style.pointerEvents + ')');
  assert(withClose._closed === 0 && noClose.el.style.display !== 'none',
    'W-EXC-7 NOTHING is closed before the user clicks — the offer is explicit, never a side-effect');
  // The user clicks.
  btn._listeners.click({ stopPropagation: () => {} });
  const closeLine = r.logs.find(l => l.indexOf('§TM_CLOSE_OTHER_PANELS') >= 0);
  assert(withClose._closed === 1, 'W-EXC-5c panel WITH a close fn was closed via close()');
  assert(noClose.el.style.display === 'none', 'W-EXC-5d panel WITHOUT a close fn was hidden via display=none');
  assert(tmP._closed === 0 && tmP.el.style.display !== 'none' && hid._closed === 0,
    'W-EXC-5e the TM panel and the hidden panel were NOT touched');
  assert(!!closeLine && closeLine.indexOf('closed=2') > 0 && closeLine.indexOf('ids=[clash,section]') > 0,
    'W-EXC-5f §TM_CLOSE_OTHER_PANELS logged (' + (closeLine || 'NO LINE') + ')');
  assert(r.tip.style.display === 'none' && r.tip.style.pointerEvents === 'none',
    'W-EXC-5g tip hidden and its pointer-events contract restored after the action');
}

// ── W-EXC-2c — a second wrapped pipeline reports its OWN fn label ───────────────────────────────
{
  const r = run({});
  try { r.sandbox.__shift(3); } catch (e) { assert(false, 'W-EXC-2c shift throw must be caught (escaped: ' + e.message + ')'); }
  const excLine = r.logs.find(l => l.indexOf('§TM_EDIT_EXCEPTION ') === 0);
  assert(!!excLine && excLine.indexOf('fn=shiftGanttSchedule') > 0,
    'W-EXC-2c shiftGanttSchedule labels its own catch (' + (excLine || 'NO LINE') + ')');
}

console.log('§TM_EDIT_EXCEPTION_SUMMARY pass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);
