#!/usr/bin/env node
// witness_tm_panel_resize.js — §TM_PANEL_RESIZE (2026-08-05). Proves the new drawer-width resize
// grip does the right pixel math given `_panel` is horizontally CENTERED (left:50%,
// translateX(-50%)) — dragging the right edge by dx must grow width by 2*dx for the visible edge to
// actually track the cursor 1:1, and the result must clamp to [PANEL_W_MIN, min(92vw, 900)]. Slices
// the real wirePanelResize by balanced braces, never reimplements the drag math.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
function assert(cond, msg) { if (cond) { pass++; console.log('  PASS ' + msg); } else { fail++; console.log('  FAIL ' + msg); } }

function sliceFn(src, name) {
  const idx = src.indexOf('function ' + name + '(');
  if (idx < 0) throw new Error(name + ' not found');
  let depth = 0, i = idx, seenOpen = false;
  for (; i < src.length; i++) {
    if (src[i] === '{') { depth++; seenOpen = true; }
    else if (src[i] === '}') { depth--; if (seenOpen && depth === 0) return src.slice(idx, i + 1); }
  }
  throw new Error('unbalanced braces for ' + name);
}

const tmSrc = fs.readFileSync(path.join(__dirname, '..', 'time_machine.js'), 'utf8');
const varsMatch = tmSrc.match(/var PANEL_W_DEFAULT = \d+, PANEL_W_EDIT = \d+, PANEL_W_MIN = \d+;/);
if (!varsMatch) throw new Error('PANEL_W_* constants not found');
const sliced = varsMatch[0] + '\n' + sliceFn(tmSrc, 'wirePanelResize');

function fakeElement(rectWidth) {
  const handlers = {};
  return {
    _wired: false, classList: { add: function () {}, remove: function () {} },
    addEventListener: function (type, fn) { handlers[type] = fn; },
    setPointerCapture: function () {}, releasePointerCapture: function () {},
    getBoundingClientRect: function () { return { width: rectWidth }; },
    style: {}, _handlers: handlers
  };
}

function makeSandbox(startWidth, innerWidth) {
  const grip = fakeElement(0);
  const panel = fakeElement(startWidth);
  let loggedWidth = null;
  const sandbox = {
    console: { log: function (msg) { const m = /width=(\d+)px/.exec(msg); if (m) loggedWidth = parseInt(m[1], 10); } },
    Math: Math, window: { innerWidth: innerWidth },
    document: { getElementById: function (id) { return id === 'tm-panel-resize-grip' ? grip : null; } },
    _panel: panel, _panelW: 0
  };
  vm.createContext(sandbox);
  vm.runInContext(sliced, sandbox);
  sandbox.wirePanelResize();
  return { sandbox: sandbox, grip: grip, panel: panel, getLoggedWidth: function () { return loggedWidth; } };
}

function ev(clientX) { return { clientX: clientX, preventDefault: function () {}, stopPropagation: function () {} }; }

// ── Case 1: dragging the right edge by +40px must grow width by 80px (2x, centered-panel math) ──
{
  const h = makeSandbox(376, 1600);
  h.grip._handlers.pointerdown(ev(500));
  h.grip._handlers.pointermove(ev(540));
  assert(h.panel.style.width === '456px', '2x symmetric growth: +40px drag -> width 376+80=456px, got ' + h.panel.style.width);
  h.grip._handlers.pointerup(ev(540));
  assert(h.getLoggedWidth() === 456, '§TM_PANEL_RESIZE log reports the same final width');
}

// ── Case 2: dragging left (shrink) clamps at PANEL_W_MIN (320), never goes negative/smaller ──
{
  const h = makeSandbox(376, 1600);
  h.grip._handlers.pointerdown(ev(500));
  h.grip._handlers.pointermove(ev(0));   // huge leftward drag
  assert(h.panel.style.width === '320px', 'clamps to PANEL_W_MIN=320px on a huge shrink drag, got ' + h.panel.style.width);
}

// ── Case 3: on a narrow viewport, the ceiling is 92vw, not the hardcoded 900px ──
{
  const h = makeSandbox(376, 500);   // 92% of 500 = 460, well under 900
  h.grip._handlers.pointerdown(ev(0));
  h.grip._handlers.pointermove(ev(1000));  // huge rightward drag
  assert(h.panel.style.width === '460px', 'clamps to 92vw=460px on a narrow viewport (not the 900px ceiling), got ' + h.panel.style.width);
}

// ── Case 4: no drag in progress — pointermove before pointerdown must not touch the panel ──
{
  const h = makeSandbox(376, 1600);
  h.grip._handlers.pointermove(ev(999));
  assert(h.panel.style.width === undefined, 'RED CONTROL: pointermove with no active drag never sets width');
}

console.log('\n§TM_PANEL_RESIZE SUMMARY pass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);
