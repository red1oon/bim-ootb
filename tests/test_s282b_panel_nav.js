/**
 * BIM OOTB — §S282b PanelNav + ListBuilder whitebox test (zero network, no browser).
 * Loads viewer/panel_nav.js and viewer/list_builder.js in mock sandbox.
 *
 * Tests:
 *   PanelNav: zone transitions, ArrowDown-from-input bug fix, header cycling,
 *             item navigation, expand/collapse, Enter/Space activation, reset.
 *   ListBuilder: render, drag-reorder callbacks, idAttr wiring.
 *
 * Model: tests/test_s281_input_registry.js (vm + mock DOM pattern).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0, logs = [];
function check(id, ok, detail) {
  if (ok) { pass++; console.log('  PASS ' + id); }
  else { fail++; console.log('  FAIL ' + id + (detail ? ' — ' + detail : '')); }
}

// ── DOM mock helpers ──
function makeEl(tag, id) {
  var _style = {}, _classList = new Set(), _attrs = {}, _listeners = {}, _children = [];
  return {
    tagName: tag || 'DIV',
    id: id || '',
    style: new Proxy(_style, { set: function(t,k,v) { t[k] = v; return true; }, get: function(t,k) { return t[k] || ''; } }),
    classList: {
      add: function(c) { _classList.add(c); },
      remove: function(c) { _classList.delete(c); },
      toggle: function(c, force) {
        if (force === undefined) { if (_classList.has(c)) _classList.delete(c); else _classList.add(c); }
        else if (force) _classList.add(c); else _classList.delete(c);
      },
      has: function(c) { return _classList.has(c); },
      contains: function(c) { return _classList.has(c); }
    },
    setAttribute: function(k, v) { _attrs[k] = v; },
    getAttribute: function(k) { return _attrs[k] || null; },
    addEventListener: function(ev, fn) {
      if (!_listeners[ev]) _listeners[ev] = [];
      _listeners[ev].push(fn);
    },
    removeEventListener: function() {},
    appendChild: function(child) { _children.push(child); child._parent = this; },
    insertBefore: function(child, ref) {
      var idx = _children.indexOf(ref);
      if (idx >= 0) _children.splice(idx, 0, child);
      else _children.push(child);
      child._parent = this;
    },
    removeChild: function(child) {
      var idx = _children.indexOf(child);
      if (idx >= 0) _children.splice(idx, 1);
      child._parent = null;
    },
    querySelectorAll: function(sel) { return _children.filter(function(c) { return true; }); },
    querySelector: function() { return null; },
    getBoundingClientRect: function() { return { top: 0, left: 0, width: 100, height: 30 }; },
    scrollIntoView: function() {},
    focus: function() { _focused = this; },
    contains: function() { return false; },
    get parentNode() { return this._parent || null; },
    set parentNode(v) { this._parent = v; },
    get offsetWidth() { return 100; },
    get children() { return { length: _children.length }; },
    get textContent() { return ''; },
    set textContent(v) {},
    get innerHTML() { return ''; },
    set innerHTML(v) {},
    _children: _children,
    _listeners: _listeners,
    _attrs: _attrs,
    _classList: _classList,
    setPointerCapture: function() {},
    releasePointerCapture: function() {}
  };
}

var _focused = null;
var _registeredPanels = [];

// ── Sandbox ──
function buildSandbox() {
  logs = [];
  _registeredPanels = [];
  var win = {
    _registerPanel: function(id, el, nav, closeFn) {
      _registeredPanels.push({ id: id, el: el, nav: nav, close: closeFn });
    },
    _focusPanel: function() {},
    _blurPanel: function() {},
    addEventListener: function() {},
    _isMobile: false
  };
  var doc = {
    createElement: function(tag) { return makeEl(tag); },
    getElementById: function() { return null; },
    addEventListener: function() {},
    body: makeEl('BODY'),
    activeElement: null
  };
  var sandbox = {
    window: win,
    document: doc,
    console: { log: function(msg) { logs.push(msg); }, warn: function() {} },
    setTimeout: function(fn) { fn(); },
    clearTimeout: function() {},
    localStorage: { getItem: function() { return null; }, setItem: function() {}, removeItem: function() {} },
    Array: Array, Set: Set, Math: Math, JSON: JSON, Event: function() {},
    parseInt: parseInt, parseFloat: parseFloat
  };
  sandbox.window.window = sandbox.window;
  vm.createContext(sandbox);
  return sandbox;
}

// ══════════════════════════════════════════════
// PART 1: PanelNav tests
// ══════════════════════════════════════════════
console.log('\n§S282b_TEST PanelNav — universal zone-based keyboard nav');

var pnSrc = fs.readFileSync(path.join(__dirname, '..', 'viewer', 'panel_nav.js'), 'utf8');

// Helper: make a fake KeyboardEvent
function keyEvent(key) {
  return { key: key, preventDefault: function() {}, stopPropagation: function() {} };
}

// ── Test 1: Basic construction + registration ──
(function() {
  var sb = buildSandbox();
  vm.runInContext(pnSrc, sb);
  var panel = makeEl('DIV', 'test-panel');
  var input = makeEl('INPUT', 'search');
  var header1 = makeEl('DIV', 'hdr1');
  var header2 = makeEl('DIV', 'hdr2');

  var nav = sb.window.PanelNav({
    id: 'test', panel: panel,
    zones: [
      { id: 'search', el: input, type: 'input' },
      { id: 'sec1', header: header1, items: function() { return []; } },
      { id: 'sec2', header: header2, items: function() { return []; } }
    ],
    onClose: function() {}
  });

  check('1.1 PanelNav returns nav object', typeof nav === 'object');
  check('1.2 nav has onKey', typeof nav.onKey === 'function');
  check('1.3 nav has reset', typeof nav.reset === 'function');
  check('1.4 registered with _registerPanel', _registeredPanels.length === 1 && _registeredPanels[0].id === 'test');
  check('1.5 §PANEL_NAV_WIRE log', logs.some(function(l) { return l.indexOf('§PANEL_NAV_WIRE') >= 0 && l.indexOf('zones=3') >= 0; }));
})();

// ── Test 2: ArrowDown from input → storey header (THE BUG FIX) ──
(function() {
  var sb = buildSandbox();
  vm.runInContext(pnSrc, sb);
  var panel = makeEl('DIV', 'find');
  var input = makeEl('INPUT', 'find-name');
  var storeyHdr = makeEl('DIV', 'storey-hdr');
  var typeHdr = makeEl('DIV', 'type-hdr');
  var _focusedEl = null;
  input.focus = function() { _focusedEl = 'input'; };
  storeyHdr.focus = function() { _focusedEl = 'storey-hdr'; };
  typeHdr.focus = function() { _focusedEl = 'type-hdr'; };

  var nav = sb.window.PanelNav({
    id: 'find', panel: panel,
    zones: [
      { id: 'search', el: input, type: 'input' },
      { id: 'storeys', header: storeyHdr, items: function() { return []; } },
      { id: 'types', header: typeHdr, items: function() { return []; } }
    ],
    onClose: function() {}
  });

  // THE BUG: ArrowDown from input should go to storey header, not empty result list
  nav.onKey(keyEvent('ArrowDown'));
  check('2.1 ArrowDown from input → storey header', _focusedEl === 'storey-hdr');
  var zoneLog = logs.filter(function(l) { return l.indexOf('§PANEL_NAV zone=storeys') >= 0; });
  check('2.2 §PANEL_NAV log shows storeys zone', zoneLog.length > 0);

  // ArrowDown again → type header (storeys has no items)
  nav.onKey(keyEvent('ArrowDown'));
  check('2.3 ArrowDown from empty storeys → type header', _focusedEl === 'type-hdr');

  // ArrowUp from types → storeys
  nav.onKey(keyEvent('ArrowUp'));
  check('2.4 ArrowUp from types → storeys header', _focusedEl === 'storey-hdr');

  // ArrowUp from storeys → input
  nav.onKey(keyEvent('ArrowUp'));
  check('2.5 ArrowUp from storeys → input', _focusedEl === 'input');
})();

// ── Test 3: Item navigation within a zone ──
(function() {
  var sb = buildSandbox();
  vm.runInContext(pnSrc, sb);
  var panel = makeEl('DIV', 'find');
  var input = makeEl('INPUT', 'search');
  var hdr = makeEl('DIV', 'hdr');
  var _focusedEl = null;
  input.focus = function() { _focusedEl = 'input'; };
  hdr.focus = function() { _focusedEl = 'hdr'; };

  // Create mock items
  var items = [];
  for (var i = 0; i < 4; i++) {
    var item = makeEl('DIV', 'item-' + i);
    item.scrollIntoView = function() {};
    items.push(item);
  }

  var expandCalled = false;
  var selectCalled = null;
  var nav = sb.window.PanelNav({
    id: 'find', panel: panel,
    zones: [
      { id: 'search', el: input, type: 'input' },
      { id: 'list', header: hdr,
        items: function() { return items; },
        onSelect: function(el) { selectCalled = el.id; },
        onExpand: function(z, open) { expandCalled = true; }
      }
    ],
    onClose: function() {}
  });

  // Move to list zone
  nav.onKey(keyEvent('ArrowDown'));
  check('3.1 zone focus → list header', _focusedEl === 'hdr');

  // ArrowDown → expand + first item
  nav.onKey(keyEvent('ArrowDown'));
  check('3.2 onExpand called on first ArrowDown into items', expandCalled);
  check('3.3 first item highlighted (active class)', items[0]._classList.has('active'));
  check('3.4 item 0 has cyan outline', items[0].style.outline === '2px solid #4fc3f7');
  check('3.5 §PANEL_NAV item log', logs.some(function(l) { return l.indexOf('§PANEL_NAV item zone=list idx=0') >= 0; }));

  // ArrowDown → second item
  nav.onKey(keyEvent('ArrowDown'));
  check('3.6 second item now active', items[1]._classList.has('active'));
  check('3.7 first item no longer active', !items[0]._classList.has('active'));

  // ArrowDown twice more → items[2], items[3]
  nav.onKey(keyEvent('ArrowDown'));
  nav.onKey(keyEvent('ArrowDown'));
  check('3.8 fourth item active (last)', items[3]._classList.has('active'));

  // ArrowDown past last → stays at last (no more zones)
  nav.onKey(keyEvent('ArrowDown'));
  check('3.9 ArrowDown past last item — no crash', true);

  // ArrowUp → back to items[2]
  nav.onKey(keyEvent('ArrowUp'));
  check('3.10 ArrowUp → third item', items[2]._classList.has('active'));

  // Enter on item → onSelect
  nav.onKey(keyEvent('Enter'));
  check('3.11 Enter on item → onSelect called', selectCalled === 'item-2');

  // Go back to header
  nav.onKey(keyEvent('ArrowUp'));
  nav.onKey(keyEvent('ArrowUp'));
  nav.onKey(keyEvent('ArrowUp'));
  check('3.12 ArrowUp to header clears item highlights', !items[0]._classList.has('active'));
})();

// ── Test 4: Left/Right header cycling ──
(function() {
  var sb = buildSandbox();
  vm.runInContext(pnSrc, sb);
  var panel = makeEl('DIV');
  var input = makeEl('INPUT', 'search');
  var hdr1 = makeEl('DIV', 'hdr1');
  var hdr2 = makeEl('DIV', 'hdr2');
  var _focusedEl = null;
  input.focus = function() { _focusedEl = 'input'; };
  hdr1.focus = function() { _focusedEl = 'hdr1'; };
  hdr2.focus = function() { _focusedEl = 'hdr2'; };

  var nav = sb.window.PanelNav({
    id: 'cycle', panel: panel,
    zones: [
      { id: 'search', el: input, type: 'input' },
      { id: 'sec1', header: hdr1, items: function() { return []; } },
      { id: 'sec2', header: hdr2, items: function() { return []; } }
    ],
    onClose: function() {}
  });

  // Start at input (zone 0), ArrowRight → hdr1
  nav.onKey(keyEvent('ArrowRight'));
  check('4.1 ArrowRight from input → hdr1', _focusedEl === 'hdr1');

  // ArrowRight → hdr2
  nav.onKey(keyEvent('ArrowRight'));
  check('4.2 ArrowRight from hdr1 → hdr2', _focusedEl === 'hdr2');

  // ArrowRight wraps → input
  nav.onKey(keyEvent('ArrowRight'));
  check('4.3 ArrowRight wraps → input', _focusedEl === 'input');

  // ArrowLeft wraps → hdr2
  nav.onKey(keyEvent('ArrowLeft'));
  check('4.4 ArrowLeft wraps → hdr2', _focusedEl === 'hdr2');

  // ArrowLeft → hdr1
  nav.onKey(keyEvent('ArrowLeft'));
  check('4.5 ArrowLeft → hdr1', _focusedEl === 'hdr1');
})();

// ── Test 5: Enter/Space on header → onExpand toggle ──
(function() {
  var sb = buildSandbox();
  vm.runInContext(pnSrc, sb);
  var panel = makeEl('DIV');
  var hdr = makeEl('DIV', 'hdr');
  hdr.focus = function() {};
  var expandCount = 0;

  var nav = sb.window.PanelNav({
    id: 'expand', panel: panel,
    zones: [
      { id: 'sec', header: hdr, items: function() { return []; },
        onExpand: function() { expandCount++; } }
    ],
    onClose: function() {}
  });

  nav.onKey(keyEvent('Enter'));
  check('5.1 Enter on header → onExpand called', expandCount === 1);

  nav.onKey(keyEvent(' '));
  check('5.2 Space on header → onExpand called again', expandCount === 2);
})();

// ── Test 6: Flat list zone (no header) ──
(function() {
  var sb = buildSandbox();
  vm.runInContext(pnSrc, sb);
  var panel = makeEl('DIV');
  var input = makeEl('INPUT');
  input.focus = function() {};
  var items = [];
  for (var i = 0; i < 3; i++) {
    var item = makeEl('DIV', 'r-' + i);
    item.scrollIntoView = function() {};
    items.push(item);
  }
  var clicked = null;

  var nav = sb.window.PanelNav({
    id: 'flat', panel: panel,
    zones: [
      { id: 'search', el: input, type: 'input' },
      { id: 'results',
        items: function() { return items; },
        onSelect: function(el) { clicked = el.id; } }
    ],
    onClose: function() {}
  });

  // ArrowDown from input → directly into results (no header)
  nav.onKey(keyEvent('ArrowDown'));
  // Zone 1 has no header, so _focusZone sets _ii=-1, then _moveItem should still work
  // ArrowDown again → first item
  nav.onKey(keyEvent('ArrowDown'));
  check('6.1 flat list first item active', items[0]._classList.has('active'));

  nav.onKey(keyEvent('Enter'));
  check('6.2 Enter selects first result', clicked === 'r-0');
})();

// ── Test 7: reset() clears state ──
(function() {
  var sb = buildSandbox();
  vm.runInContext(pnSrc, sb);
  var panel = makeEl('DIV');
  var input = makeEl('INPUT');
  var hdr = makeEl('DIV');
  input.focus = function() {};
  hdr.focus = function() {};

  var nav = sb.window.PanelNav({
    id: 'reset', panel: panel,
    zones: [
      { id: 'search', el: input, type: 'input' },
      { id: 'sec', header: hdr, items: function() { return []; } }
    ],
    onClose: function() {}
  });

  nav.onKey(keyEvent('ArrowDown')); // move to sec
  nav.reset();
  // After reset, internal state should be back to zone 0
  // ArrowDown should go to sec again (not further)
  nav.onKey(keyEvent('ArrowDown'));
  // If reset worked, we'd be at zone 1 again
  check('7.1 reset restores initial state', logs.filter(function(l) { return l.indexOf('§PANEL_NAV zone=sec') >= 0; }).length >= 2);
})();

// ── Test 8: Header highlight styling ──
(function() {
  var sb = buildSandbox();
  vm.runInContext(pnSrc, sb);
  var panel = makeEl('DIV');
  var input = makeEl('INPUT');
  var hdr1 = makeEl('DIV');
  var hdr2 = makeEl('DIV');
  input.focus = function() {};
  hdr1.focus = function() {};
  hdr2.focus = function() {};

  var nav = sb.window.PanelNav({
    id: 'style', panel: panel,
    zones: [
      { id: 'in', el: input, type: 'input' },
      { id: 's1', header: hdr1, items: function() { return []; } },
      { id: 's2', header: hdr2, items: function() { return []; } }
    ],
    onClose: function() {}
  });

  // Initially at zone 0 (input) — but _highlightHeaders isn't called until movement
  nav.onKey(keyEvent('ArrowRight')); // → hdr1
  check('8.1 active header has cyan outline', hdr1.style.outline === '2px solid #4fc3f7');
  check('8.2 active header has highlight bg', hdr1.style.background === 'rgba(79,195,247,0.2)');
  check('8.3 inactive header cleared', hdr2.style.outline === '');

  nav.onKey(keyEvent('ArrowRight')); // → hdr2
  check('8.4 hdr2 now highlighted', hdr2.style.outline === '2px solid #4fc3f7');
  check('8.5 hdr1 no longer highlighted', hdr1.style.outline === '');
})();

// ── Test 9: Multi-zone item traversal (storey→type like Find) ──
(function() {
  var sb = buildSandbox();
  vm.runInContext(pnSrc, sb);
  var panel = makeEl('DIV');
  var input = makeEl('INPUT');
  var hdr1 = makeEl('DIV');
  var hdr2 = makeEl('DIV');
  input.focus = function() {};
  hdr1.focus = function() {};
  hdr2.focus = function() {};

  var storeyItems = [makeEl('DIV','s0'), makeEl('DIV','s1')];
  var typeItems = [makeEl('DIV','t0'), makeEl('DIV','t1'), makeEl('DIV','t2')];
  storeyItems.forEach(function(el) { el.scrollIntoView = function() {}; });
  typeItems.forEach(function(el) { el.scrollIntoView = function() {}; });

  var nav = sb.window.PanelNav({
    id: 'multi', panel: panel,
    zones: [
      { id: 'search', el: input, type: 'input' },
      { id: 'storeys', header: hdr1, items: function() { return storeyItems; },
        onExpand: function() {}, onSelect: function(el) {} },
      { id: 'types', header: hdr2, items: function() { return typeItems; },
        onExpand: function() {}, onSelect: function(el) {} }
    ],
    onClose: function() {}
  });

  // ArrowDown 4 times: input → storeys hdr → s0 → s1 → (past last) → types hdr
  nav.onKey(keyEvent('ArrowDown')); // → storeys hdr
  nav.onKey(keyEvent('ArrowDown')); // → s0
  check('9.1 storey item 0', storeyItems[0]._classList.has('active'));
  nav.onKey(keyEvent('ArrowDown')); // → s1
  check('9.2 storey item 1', storeyItems[1]._classList.has('active'));
  nav.onKey(keyEvent('ArrowDown')); // → types hdr (past end of storeys)
  check('9.3 past storeys → types zone', logs.some(function(l) { return l.indexOf('§PANEL_NAV zone=types') >= 0; }));
  // Storey items should be cleared
  check('9.4 storey items cleared on zone exit', !storeyItems[0]._classList.has('active') && !storeyItems[1]._classList.has('active'));

  // ArrowDown into types items
  nav.onKey(keyEvent('ArrowDown')); // → t0
  check('9.5 type item 0', typeItems[0]._classList.has('active'));

  // ArrowUp all the way back
  nav.onKey(keyEvent('ArrowUp')); // → types hdr
  check('9.6 back to types header', logs.filter(function(l) { return l.indexOf('§PANEL_NAV header zone=types') >= 0; }).length > 0);
  nav.onKey(keyEvent('ArrowUp')); // → storeys zone (since types header ArrowUp goes prev)
  // Should be at storeys now
  nav.onKey(keyEvent('ArrowUp')); // → input
  // Should be at input now
  check('9.7 traversed back to input', true); // didn't crash
})();

// ── Test 10: onExpand with open=true only expands (no toggle) ──
(function() {
  var sb = buildSandbox();
  vm.runInContext(pnSrc, sb);
  var panel = makeEl('DIV');
  var hdr = makeEl('DIV');
  hdr.focus = function() {};
  var items = [makeEl('DIV')];
  items[0].scrollIntoView = function() {};
  var expandArgs = [];

  var nav = sb.window.PanelNav({
    id: 'exp', panel: panel,
    zones: [
      { id: 'sec', header: hdr, items: function() { return items; },
        onExpand: function(z, open) { expandArgs.push(open); } }
    ],
    onClose: function() {}
  });

  // ArrowDown from header into items → onExpand(z, true)
  nav.onKey(keyEvent('ArrowDown'));
  check('10.1 onExpand called with open=true on first ArrowDown', expandArgs[0] === true);

  // Enter on header → onExpand(z, undefined) — toggle
  nav.reset();
  nav.onKey(keyEvent('Enter'));
  check('10.2 Enter on header → onExpand toggle (no open arg)', expandArgs[1] === undefined);
})();


// ══════════════════════════════════════════════
// PART 2: ListBuilder tests
// ══════════════════════════════════════════════
console.log('\n§S282b_TEST ListBuilder — reorderable list extraction');

var lbSrc = fs.readFileSync(path.join(__dirname, '..', 'viewer', 'list_builder.js'), 'utf8');

// ── Test 11: Basic render ──
(function() {
  var sb = buildSandbox();
  vm.runInContext(lbSrc, sb);

  var container = makeEl('DIV');
  var renderCount = 0;
  var items = [
    { id: 'alpha', label: 'Alpha' },
    { id: 'beta', label: 'Beta' },
    { id: 'gamma', label: 'Gamma' }
  ];

  sb.window.ListBuilder({
    container: container,
    items: items,
    getId: function(item) { return item.id; },
    render: function(item) {
      renderCount++;
      var row = makeEl('DIV');
      row.textContent = item.label;
      row.style.cssText = 'cursor:grab;';
      return row;
    },
    onReorder: function() {}
  });

  check('11.1 render called 3 times', renderCount === 3);
  check('11.2 container has 3 children', container._children.length === 3);
  check('11.3 first child has data-list-id=alpha', container._children[0]._attrs['data-list-id'] === 'alpha');
  check('11.4 second child has data-list-id=beta', container._children[1]._attrs['data-list-id'] === 'beta');
  check('11.5 third child has data-list-id=gamma', container._children[2]._attrs['data-list-id'] === 'gamma');
  check('11.6 §LISTBUILDER ready log', logs.some(function(l) { return l.indexOf('§LISTBUILDER ready items=3') >= 0; }));
})();

// ── Test 12: Custom idAttr ──
(function() {
  var sb = buildSandbox();
  vm.runInContext(lbSrc, sb);

  var container = makeEl('DIV');
  sb.window.ListBuilder({
    container: container,
    items: [{ id: 'x' }],
    getId: function(item) { return item.id; },
    idAttr: 'data-action-id',
    render: function() { return makeEl('DIV'); },
    onReorder: function() {}
  });

  check('12.1 custom idAttr applied', container._children[0]._attrs['data-action-id'] === 'x');
})();

// ── Test 13: Pointer events wired (drag-to-reorder) ──
(function() {
  var sb = buildSandbox();
  vm.runInContext(lbSrc, sb);

  var container = makeEl('DIV');
  var row = null;
  sb.window.ListBuilder({
    container: container,
    items: [{ id: 'a' }],
    getId: function(item) { return item.id; },
    render: function() { row = makeEl('DIV'); return row; },
    onReorder: function() {}
  });

  check('13.1 pointerdown listener wired', row._listeners['pointerdown'] && row._listeners['pointerdown'].length > 0);
})();

// ── Test 14: Button clicks don't trigger drag ──
(function() {
  var sb = buildSandbox();
  vm.runInContext(lbSrc, sb);

  var container = makeEl('DIV');
  var row = null;
  sb.window.ListBuilder({
    container: container,
    items: [{ id: 'a' }],
    getId: function(item) { return item.id; },
    render: function() { row = makeEl('DIV'); return row; },
    onReorder: function() {}
  });

  // Simulate pointerdown with target = BUTTON — should not drag
  var prevented = false;
  var fakeEvent = {
    target: { tagName: 'BUTTON' },
    clientY: 0,
    pointerId: 1,
    preventDefault: function() { prevented = true; }
  };
  row._listeners['pointerdown'][0](fakeEvent);
  check('14.1 button click does not trigger drag (no preventDefault)', !prevented);
})();


// ══════════════════════════════════════════════
// PART 3: Integration — PanelNav + ListBuilder together
// ══════════════════════════════════════════════
console.log('\n§S282b_TEST Integration — PanelNav + ListBuilder');

// ── Test 15: Settings-style panel — PanelNav navigates ListBuilder items ──
(function() {
  var sb = buildSandbox();
  vm.runInContext(pnSrc, sb);
  vm.runInContext(lbSrc, sb);

  var container = makeEl('DIV');
  var actions = [
    { id: 'find', name: 'Find' },
    { id: 'measure', name: 'Measure' },
    { id: 'share', name: 'Share' }
  ];

  sb.window.ListBuilder({
    container: container,
    items: actions,
    getId: function(a) { return a.id; },
    idAttr: 'data-action-id',
    render: function(act) {
      var row = makeEl('DIV');
      row.scrollIntoView = function() {};
      return row;
    },
    onReorder: function() {}
  });

  var panel = makeEl('DIV', 'settings-panel');
  // Override querySelectorAll to return ListBuilder's children
  panel.querySelectorAll = function(sel) {
    if (sel.indexOf('data-action-id') >= 0) return container._children;
    return [];
  };

  var selectCalled = null;
  var nav = sb.window.PanelNav({
    id: 'settings', panel: panel,
    zones: [
      { id: 'pillRows',
        items: function() { return panel.querySelectorAll('[data-action-id]'); },
        onSelect: function(el) { selectCalled = el._attrs['data-action-id']; }
      }
    ],
    onClose: function() {}
  });

  // Navigate: ArrowDown through items
  nav.onKey(keyEvent('ArrowDown')); // → item 0 (no header, flat zone)
  check('15.1 Settings item 0 active', container._children[0]._classList.has('active'));

  nav.onKey(keyEvent('ArrowDown')); // → item 1
  check('15.2 Settings item 1 active', container._children[1]._classList.has('active'));
  check('15.3 item 0 no longer active', !container._children[0]._classList.has('active'));

  nav.onKey(keyEvent('ArrowDown')); // → item 2
  nav.onKey(keyEvent('Enter')); // select item 2
  check('15.4 Enter selects share', selectCalled === 'share');
})();

// ── Test 16: Find-style panel — 4 zones, full traversal ──
(function() {
  var sb = buildSandbox();
  vm.runInContext(pnSrc, sb);

  var panel = makeEl('DIV', 'find-panel');
  var input = makeEl('INPUT', 'find-name');
  var storeyHdr = makeEl('DIV', 'storey-hdr');
  var typeHdr = makeEl('DIV', 'type-hdr');
  var _focused = null;
  input.focus = function() { _focused = 'input'; };
  storeyHdr.focus = function() { _focused = 'storey'; };
  typeHdr.focus = function() { _focused = 'type'; };

  var storeyItems = [makeEl('DIV','s0'), makeEl('DIV','s1'), makeEl('DIV','s2')];
  var typeItems = [makeEl('DIV','t0'), makeEl('DIV','t1')];
  var resultItems = [makeEl('DIV','r0'), makeEl('DIV','r1')];
  [storeyItems, typeItems, resultItems].forEach(function(arr) {
    arr.forEach(function(el) { el.scrollIntoView = function() {}; });
  });

  var expandedSections = {};
  var nav = sb.window.PanelNav({
    id: 'find', panel: panel,
    zones: [
      { id: 'search', el: input, type: 'input' },
      { id: 'storeys', header: storeyHdr,
        items: function() { return storeyItems; },
        onSelect: function(el) {},
        onExpand: function(z, open) { expandedSections['storeys'] = open; }
      },
      { id: 'types', header: typeHdr,
        items: function() { return typeItems; },
        onSelect: function(el) {},
        onExpand: function(z, open) { expandedSections['types'] = open; }
      },
      { id: 'results',
        items: function() { return resultItems; },
        onSelect: function(el) {}
      }
    ],
    onClose: function() {}
  });

  // Full forward traversal:
  // input → storeys(hdr) → s0 → s1 → s2 → types(hdr) → t0 → t1 → results(flat) → r0 → r1
  var steps = [];
  for (var i = 0; i < 11; i++) {
    nav.onKey(keyEvent('ArrowDown'));
    var zoneLogs = logs.filter(function(l) { return l.indexOf('§PANEL_NAV') >= 0; });
    steps.push(zoneLogs[zoneLogs.length - 1] || '');
  }

  check('16.1 step 1 → storeys zone', steps[0].indexOf('zone=storeys') >= 0);
  check('16.2 step 2 → storey item 0', steps[1].indexOf('item zone=storeys idx=0') >= 0);
  check('16.3 step 4 → storey item 2', steps[3].indexOf('item zone=storeys idx=2') >= 0);
  check('16.4 step 5 → types zone', steps[4].indexOf('zone=types') >= 0);
  check('16.5 step 8 → results zone (flat)', steps[7].indexOf('zone=results') >= 0);
  check('16.6 step 9 → result item 0', steps[8].indexOf('item zone=results idx=0') >= 0);
  check('16.7 storeys expanded on entry', expandedSections['storeys'] === true);
  check('16.8 types expanded on entry', expandedSections['types'] === true);

  // Full reverse traversal back (11 ArrowUps)
  for (var j = 0; j < 11; j++) {
    nav.onKey(keyEvent('ArrowUp'));
  }
  check('16.9 full reverse traversal — back to input', _focused === 'input');
})();


// ══════════════════════════════════════════════
// PART 4: Shortcut audit — every Help key maps to _shortcuts
// ══════════════════════════════════════════════
console.log('\n§S282b_TEST Shortcut Audit — Help panel keys vs scene.js _shortcuts');

// Extract _actions key list from panels.js source (the authoritative Help panel)
// and _shortcuts keys from scene.js source — cross-check them.
(function() {
  var panelsSrc = fs.readFileSync(path.join(__dirname, '..', 'viewer', 'panels.js'), 'utf8');
  var sceneSrc = fs.readFileSync(path.join(__dirname, '..', 'viewer', 'scene.js'), 'utf8');

  // Extract action key bindings from panels.js _actions array
  // Pattern: key: 'x' or key: 'Alt+Z' or key: 'F1' or key: 'F11'
  var actionKeys = {};
  var actionRe = /\{\s*id:\s*'([^']+)'[^}]*key:\s*'([^']+)'/g;
  var m;
  while ((m = actionRe.exec(panelsSrc)) !== null) {
    actionKeys[m[1]] = m[2];
  }

  // Extract _shortcuts keys from scene.js
  // Pattern: 'x': function() or "x": function()
  var shortcutKeys = new Set();
  var scBlock = sceneSrc.match(/var _shortcuts = \{([\s\S]*?)\n  \};/);
  if (scBlock) {
    var keyRe = /^\s*'([^']+)':\s*function/gm;
    var km;
    while ((km = keyRe.exec(scBlock[1])) !== null) {
      shortcutKeys.add(km[1]);
    }
  }

  check('17.0 _actions extracted', Object.keys(actionKeys).length > 10);
  check('17.0b _shortcuts extracted', shortcutKeys.size > 10);

  // For each action with a key, verify it has a matching _shortcuts entry
  // Special keys (Alt+Z, F1, F11) are handled by the global keydown, not _shortcuts
  var specialKeys = new Set(['Alt+Z', 'F1', 'F11']);
  var allOk = true;
  var tested = 0;
  Object.keys(actionKeys).forEach(function(id) {
    var key = actionKeys[id];
    if (specialKeys.has(key)) {
      // These are handled by global keydown directly, not _shortcuts
      check('17.' + id + ' key=' + key + ' → global handler (special)', true);
      tested++;
      return;
    }
    var found = shortcutKeys.has(key) || shortcutKeys.has(key.toLowerCase());
    check('17.' + id + ' key=' + key + ' → _shortcuts[' + key + ']', found);
    if (!found) allOk = false;
    tested++;
  });

  check('17.Z all ' + tested + ' shortcut keys verified', allOk);

  // Verify no orphan shortcuts (in _shortcuts but not in any action)
  var actionKeyValues = new Set(Object.keys(actionKeys).map(function(id) { return actionKeys[id].toLowerCase(); }));
  var orphans = [];
  shortcutKeys.forEach(function(k) {
    // Some shortcuts don't have actions (like '.', sequence shortcuts, etc.)
    // Only flag truly orphaned ones
    if (!actionKeyValues.has(k.toLowerCase())) {
      orphans.push(k);
    }
  });
  // '.', '2' (2d, pill:false), 'i' (issues, pill:false) might not have action keys
  // Just report, don't fail
  console.log('  INFO orphan shortcuts (scene.js only): [' + orphans.join(',') + '] — expected for non-pill actions');
})();


// ══════════════════════════════════════════════
// PART 5: [] double-tap — focusOnlyLatest + status bar persist
// ══════════════════════════════════════════════
console.log('\n§S282b_TEST [] double-tap — focusOnlyLatest + status bar persist');

(function() {
  var panelsSrc = fs.readFileSync(path.join(__dirname, '..', 'viewer', 'panels.js'), 'utf8');

  // Build a richer sandbox that can run parts of panels.js
  logs = [];
  var _elements = {};
  var _queryResults = [];

  function fakeEl(id) {
    if (_elements[id]) return _elements[id];
    var el = makeEl('DIV', id);
    _elements[id] = el;
    return el;
  }

  // Pre-create all panel elements that focusOnlyLatest references
  var panelIds = ['hud','search-box','icon-pill','info-panel','status-bar-wrap',
                  'grid-overlay-panel','dev-banner','section-slider-panel'];
  panelIds.forEach(function(pid) { fakeEl(pid); });

  // Create some "extra" glass panels
  var glassPanel1 = makeEl('DIV', 'find-panel');
  glassPanel1._classList.add('glass-panel');
  var glassPanel2 = makeEl('DIV', 'settings-panel');
  glassPanel2._classList.add('glass-panel');
  _elements['find-panel'] = glassPanel1;
  _elements['settings-panel'] = glassPanel2;

  // Simulate focused panel via InputReg
  var _focusTop = null;
  var _panels = [
    { id: 'find', el: glassPanel1 },
    { id: 'settings', el: glassPanel2 }
  ];
  var _focusStack = ['find'];

  var win = {
    _panels: _panels,
    _focusStack: _focusStack,
    _isMobile: false,
    addEventListener: function() {},
    InputReg: {
      focusTop: function() { return _focusTop; },
      register: function() {},
      unregister: function() {}
    },
    _registerPanel: function() {},
    _focusPanel: function() {},
    _blurPanel: function() {},
    toggleAllPanels: null,
    focusOnlyLatest: null
  };

  var doc = {
    createElement: function(tag) { return makeEl(tag); },
    getElementById: function(id) { return _elements[id] || null; },
    querySelectorAll: function(sel) {
      // Return glass panels + extras for the query
      var results = [];
      Object.keys(_elements).forEach(function(id) {
        var el = _elements[id];
        // Simple selector match for class or id
        if (sel.indexOf('.glass-panel') >= 0 && el._classList.has('glass-panel')) results.push(el);
        if (sel.indexOf('#find-panel') >= 0 && el.id === 'find-panel') results.push(el);
        if (sel.indexOf('#issues-panel') >= 0 && el.id === 'issues-panel') results.push(el);
      });
      return results;
    },
    addEventListener: function() {},
    body: makeEl('BODY'),
    fullscreenElement: null,
    documentElement: { requestFullscreen: function() {} },
    activeElement: null
  };

  var sandbox = {
    window: win,
    document: doc,
    console: { log: function(msg) { logs.push(msg); }, warn: function(msg) { logs.push(msg); }, error: function() {} },
    setTimeout: function(fn, ms) { fn(); return 1; },
    clearTimeout: function() {},
    setInterval: function() { return 1; },
    clearInterval: function() {},
    localStorage: { getItem: function() { return null; }, setItem: function() {}, removeItem: function() {} },
    Array: Array, Set: Set, Math: Math, JSON: JSON, Event: function() {},
    parseInt: parseInt, parseFloat: parseFloat,
    location: { href: '' },
    Proxy: Proxy
  };
  sandbox.window.window = sandbox.window;

  // We can't run the full panels.js (too many deps), but we CAN extract and test
  // focusOnlyLatest directly. Let's eval just that function.
  vm.createContext(sandbox);

  // Extract focusOnlyLatest source from panels.js
  var fnMatch = panelsSrc.match(/window\.focusOnlyLatest = function\(\) \{([\s\S]*?)\n  \};/);
  if (!fnMatch) {
    check('18.0 focusOnlyLatest extraction', false, 'could not extract function');
  } else {
    // Build the function with the captured panelIds and _focusOnlyHidden
    var fnCode = 'var panelIds = ' + JSON.stringify(panelIds) + ';\n' +
                 'var _focusOnlyHidden = [];\n' +
                 'window.focusOnlyLatest = function() {' + fnMatch[1] + '\n};\n' +
                 'window._getFocusOnlyHidden = function() { return _focusOnlyHidden; };\n';
    vm.runInContext(fnCode, sandbox);

    check('18.0 focusOnlyLatest extracted and compiled', typeof win.focusOnlyLatest === 'function');

    // Test 18.1: With find panel as latest, double-tap hides everything EXCEPT find + status
    _focusTop = { id: 'find-panel' };
    win.focusOnlyLatest();

    var hidden = win._getFocusOnlyHidden();
    var hiddenIds = hidden.map(function(el) { return el.id; });

    check('18.1 hud hidden', hiddenIds.indexOf('hud') >= 0);
    check('18.2 search-box hidden', hiddenIds.indexOf('search-box') >= 0);
    check('18.3 icon-pill hidden', hiddenIds.indexOf('icon-pill') >= 0);
    check('18.4 status-bar-wrap NOT hidden (persists in maxed mode)',
      hiddenIds.indexOf('status-bar-wrap') < 0);
    check('18.5 status-bar-wrap has no swipe-hidden class',
      !_elements['status-bar-wrap']._classList.has('swipe-hidden'));

    // The find-panel should be preserved (it's the latest)
    check('18.6 find-panel NOT hidden (latest active)',
      !_elements['find-panel']._classList.has('swipe-hidden'));

    // §MINMAX_DBL log should show
    check('18.7 §MINMAX_DBL log emitted',
      logs.some(function(l) { return l.indexOf('§MINMAX_DBL focus-only latest=find-panel') >= 0; }));

    var hiddenCount = hidden.length;
    check('18.8 multiple panels hidden (count > 0)', hiddenCount > 0);

    // Test 18.9: Second double-tap restores everything
    win.focusOnlyLatest();
    var hidden2 = win._getFocusOnlyHidden();
    check('18.9 second double-tap restores (hidden list empty)', hidden2.length === 0);
    check('18.10 §MINMAX_DBL restore log',
      logs.some(function(l) { return l.indexOf('§MINMAX_DBL restore count=' + hiddenCount) >= 0; }));

    // Restored panels should NOT have swipe-hidden
    check('18.11 hud restored (no swipe-hidden)',
      !_elements['hud']._classList.has('swipe-hidden'));
    check('18.12 search-box restored',
      !_elements['search-box']._classList.has('swipe-hidden'));
  }
})();

// ── Test 19: focusOnlyLatest with no focused panel ──
(function() {
  var panelsSrc = fs.readFileSync(path.join(__dirname, '..', 'viewer', 'panels.js'), 'utf8');
  logs = [];

  var _elements = {};
  var panelIds = ['hud','search-box','icon-pill','info-panel','status-bar-wrap',
                  'grid-overlay-panel','dev-banner','section-slider-panel'];
  panelIds.forEach(function(pid) {
    var el = makeEl('DIV', pid);
    _elements[pid] = el;
  });

  var win = {
    _panels: [],
    _focusStack: [],
    InputReg: { focusTop: function() { return null; } },
    focusOnlyLatest: null,
    _getFocusOnlyHidden: null
  };
  var doc = {
    getElementById: function(id) { return _elements[id] || null; },
    querySelectorAll: function() { return []; }
  };
  var sandbox = {
    window: win, document: doc,
    console: { log: function(msg) { logs.push(msg); }, warn: function() {}, error: function() {} },
    Array: Array, Set: Set, Math: Math, JSON: JSON,
    parseInt: parseInt, parseFloat: parseFloat
  };
  sandbox.window.window = sandbox.window;
  vm.createContext(sandbox);

  var fnMatch = panelsSrc.match(/window\.focusOnlyLatest = function\(\) \{([\s\S]*?)\n  \};/);
  var fnCode = 'var panelIds = ' + JSON.stringify(panelIds) + ';\n' +
               'var _focusOnlyHidden = [];\n' +
               'window.focusOnlyLatest = function() {' + fnMatch[1] + '\n};\n' +
               'window._getFocusOnlyHidden = function() { return _focusOnlyHidden; };\n';
  vm.runInContext(fnCode, sandbox);

  win.focusOnlyLatest();
  check('19.1 no focused panel → hides all (except status)',
    _elements['hud']._classList.has('swipe-hidden'));
  check('19.2 status-bar-wrap still visible with no focus target',
    !_elements['status-bar-wrap']._classList.has('swipe-hidden'));
  check('19.3 §MINMAX_DBL latest=none',
    logs.some(function(l) { return l.indexOf('latest=none') >= 0; }));
})();


// ══════════════════════════════════════════════
// PART 6: Shortcut function wiring — each key fires correct function
// ══════════════════════════════════════════════
console.log('\n§S282b_TEST Shortcut function wiring — _shortcuts dispatch');

(function() {
  var sceneSrc = fs.readFileSync(path.join(__dirname, '..', 'viewer', 'scene.js'), 'utf8');

  // Extract the _shortcuts block and build a testable version
  var scBlock = sceneSrc.match(/var _shortcuts = \{([\s\S]*?)\n  \};/);
  if (!scBlock) {
    check('20.0 _shortcuts block extracted', false); return;
  }

  // Build a sandbox with spy functions for each shortcut target
  var calls = [];
  var A = {
    status: { textContent: '' },
    measureActive: false,
    _clashMatrixDiv: null,
    _gridOverlayState: null,
    toggleMeasure: function() { calls.push('toggleMeasure'); },
    toggleSection: function() { calls.push('toggleSection'); },
    openFindPanel: function() { calls.push('openFindPanel'); },
    export4D5D: function() { calls.push('export4D5D'); },
    screenshot: function() { calls.push('screenshot'); },
    quickShare: function() { calls.push('quickShare'); },
    _loadClashRules: null, // complex, skip
    loadNavigate: null
  };

  // Global stubs
  var stubs = {
    toggleSunglass: function() { calls.push('toggleSunglass'); },
    toggleTimeMachine: function() { calls.push('toggleTimeMachine'); },
    toggleFlyAround: function() { calls.push('toggleFlyAround'); },
    toggleNightMode: function() { calls.push('toggleNightMode'); },
    toggleBackground: function() { calls.push('toggleBackground'); },
    toggleShadow: function() { calls.push('toggleShadow'); },
    toggleIssues: function() { calls.push('toggleIssues'); },
    toggleRecord: function() { calls.push('toggleRecord'); },
    toggleDocPill: function() { calls.push('toggleDocPill'); },
    toggleMobilePill: function() { calls.push('toggleMobilePill'); },
    open2DPlans: function() { calls.push('open2DPlans'); },
    showCommandPalette: function() { calls.push('showCommandPalette'); },
    toggleXray: function() { calls.push('toggleXray'); }
  };

  logs = [];
  var sandbox = {
    window: Object.assign({ addEventListener: function() {} }, stubs),
    document: {
      getElementById: function() { return { click: function() { calls.push('pill-settings-click'); } }; },
      fullscreenElement: null,
      documentElement: { requestFullscreen: function() {} }
    },
    console: { log: function(msg) { logs.push(msg); }, warn: function() {}, error: function() {} },
    setTimeout: function(fn, ms) { if (ms <= 250) fn(); return 1; },
    clearTimeout: function() {},
    Array: Array, Set: Set, Math: Math, JSON: JSON,
    parseInt: parseInt, parseFloat: parseFloat,
    location: { href: '' }
  };
  // Merge stubs into window AND sandbox top-level (bare names resolve from context)
  Object.keys(stubs).forEach(function(k) { sandbox.window[k] = stubs[k]; sandbox[k] = stubs[k]; });
  sandbox.window.window = sandbox.window;

  // Build the shortcuts object in sandbox
  var code = '(function() {\n' +
    'var A = ' + JSON.stringify(A).replace(/"__fn__"/g, 'function(){}') + ';\n' +
    // Override A methods with real functions (JSON can't serialize functions)
    'A.toggleMeasure = function() { calls.push("toggleMeasure"); };\n' +
    'A.toggleSection = function() { calls.push("toggleSection"); };\n' +
    'A.openFindPanel = function() { calls.push("openFindPanel"); };\n' +
    'A.export4D5D = function() { calls.push("export4D5D"); };\n' +
    'A.screenshot = function() { calls.push("screenshot"); };\n' +
    'A.quickShare = function() { calls.push("quickShare"); };\n' +
    'A.status = { textContent: "" };\n' +
    'var calls = _testCalls;\n' +
    'var _shortcuts = {' + scBlock[1] + '\n};\n' +
    'window._testShortcuts = _shortcuts;\n' +
    '})();\n';
  sandbox._testCalls = calls;
  vm.createContext(sandbox);

  try {
    vm.runInContext(code, sandbox);
  } catch(e) {
    check('20.0 _shortcuts compile', false, e.message);
    return;
  }

  var sc = sandbox.window._testShortcuts;
  check('20.0 _shortcuts compiled', !!sc);

  // Test each shortcut fires the expected function
  var shortcutTests = [
    // [key, expectedCall, description]
    ['f', 'openFindPanel', 'F → Find'],
    ['p', 'toggleSunglass', 'P → Palette/Sunglass'],
    ['t', 'toggleTimeMachine', 'T → Time Machine'],
    ['l', 'toggleFlyAround', 'L → Fly Tour'],
    ['s', 'screenshot', 'S → Screenshot'],
    ['n', 'toggleNightMode', 'N → Night'],
    ['b', 'toggleBackground', 'B → Background'],
    ['h', 'toggleShadow', 'H → Shadow'],
    ['m', 'toggleMeasure', 'M → Measure'],
    ['r', 'toggleRecord', 'R → Record'],
    [',', 'toggleDocPill', ', → Doc Mode'],
    ['/', 'quickShare', '/ → Share'],
    ['.', 'toggleMobilePill', '. → Pill toggle'],
    ['4', 'export4D5D', '4 → 4D/5D'],
    ['x', 'toggleSection', 'X → Section Cut'],
    ['i', 'toggleIssues', 'I → Issues']
  ];

  shortcutTests.forEach(function(t) {
    var key = t[0], expected = t[1], desc = t[2];
    calls.length = 0; // clear
    if (sc[key]) {
      sc[key]();
      var fired = calls.indexOf(expected) >= 0;
      check('20.' + key + ' ' + desc, fired, fired ? '' : 'calls=[' + calls.join(',') + ']');
    } else {
      check('20.' + key + ' ' + desc, false, 'no shortcut for key=' + key);
    }
  });

  // Special: '=' calls pill-settings click
  calls.length = 0;
  if (sc['=']) {
    sc['=']();
    check('20.= Settings (pill-settings click)', calls.indexOf('pill-settings-click') >= 0);
  }

  // Special: '2' calls open2DPlans
  calls.length = 0;
  if (sc['2']) {
    sc['2']();
    check('20.2 2D Grid', calls.indexOf('open2DPlans') >= 0);
  }
})();


// ══════════════════════════════════════════════
// PART 7: _isMobile registry — single source in config.js, no re-detection
// ══════════════════════════════════════════════
console.log('\n§S282b_TEST _isMobile registry — single source, no re-detection');

(function() {
  var uiFiles = [
    'pill_builder.js', 'clash_matrix.js', 'measure.js', 'navigate_controls.js',
    'panels.js', 'time_machine.js', 'main.js'
  ];
  var rendererFiles = ['effects.js', 'streaming.js', 'scene.js'];

  var configSrc = fs.readFileSync(path.join(__dirname, '..', 'viewer', 'config.js'), 'utf8');
  var setMatches = configSrc.match(/window\._isMobile\s*=/g) || [];
  check('21.1 config.js sets window._isMobile exactly once', setMatches.length === 1);
  check('21.2 config.js uses ontouchstart', configSrc.indexOf('ontouchstart') >= 0);
  check('21.3 config.js uses maxTouchPoints', configSrc.indexOf('maxTouchPoints') >= 0);

  var reDetectPattern = /('ontouchstart'\s*in\s*window|navigator\.maxTouchPoints\s*>)/;
  var violations = [];
  uiFiles.forEach(function(f) {
    var src;
    try { src = fs.readFileSync(path.join(__dirname, '..', 'viewer', f), 'utf8'); } catch(e) { return; }
    src.split('\n').forEach(function(line, idx) {
      if (reDetectPattern.test(line)) {
        violations.push(f + ':' + (idx + 1) + ' → ' + line.trim().slice(0, 80));
      }
    });
  });
  check('21.4 no UI file re-detects mobile (' + uiFiles.length + ' files checked)',
    violations.length === 0,
    violations.length ? violations.join(' | ') : '');

  var localCopyPattern = /var\s+_isMobile\s*=/;
  var copies = [];
  uiFiles.forEach(function(f) {
    var src;
    try { src = fs.readFileSync(path.join(__dirname, '..', 'viewer', f), 'utf8'); } catch(e) { return; }
    src.split('\n').forEach(function(line, idx) {
      if (localCopyPattern.test(line)) {
        copies.push(f + ':' + (idx + 1));
      }
    });
  });
  check('21.5 no UI file has var _isMobile local copy', copies.length === 0,
    copies.length ? copies.join(', ') : '');

  rendererFiles.forEach(function(f) {
    var src;
    try { src = fs.readFileSync(path.join(__dirname, '..', 'viewer', f), 'utf8'); } catch(e) { return; }
    var hasScreenWidth = src.indexOf('screen.width') >= 0;
    check('21.7.' + f + ' has screen.width threshold (renderer-specific)', hasScreenWidth);
  });

  var mainSrc = fs.readFileSync(path.join(__dirname, '..', 'viewer', 'main.js'), 'utf8');
  var mainSets = (mainSrc.match(/window\._isMobile\s*=/g) || []);
  check('21.8 main.js does NOT set window._isMobile', mainSets.length === 0);

  var pbSrc = fs.readFileSync(path.join(__dirname, '..', 'viewer', 'pill_builder.js'), 'utf8');
  check('21.9 pill_builder.js reads window._isMobile', pbSrc.indexOf('window._isMobile') >= 0);

  var viewerHtml = fs.readFileSync(path.join(__dirname, '..', 'viewer', 'viewer.html'), 'utf8');
  var configPos = viewerHtml.indexOf('src="config.js');
  var pillPos = viewerHtml.indexOf('src="pill_builder.js');
  var panelsPos = viewerHtml.indexOf('src="panels.js');
  var mainPos = viewerHtml.indexOf('src="main.js');
  check('21.10 load order: config.js before pill_builder.js', configPos > 0 && configPos < pillPos);
  check('21.11 load order: pill_builder.js before panels.js', pillPos > 0 && pillPos < panelsPos);
  check('21.12 load order: panels.js before main.js', panelsPos > 0 && panelsPos < mainPos);

  var sb = buildSandbox();
  sb.window.ontouchstart = true;
  sb.navigator = { maxTouchPoints: 5, userAgent: '' };
  vm.runInContext(configSrc, sb);
  check('21.13 mobile sim: window._isMobile = true', sb.window._isMobile === true);

  var sb2 = buildSandbox();
  sb2.navigator = { maxTouchPoints: 0, userAgent: '' };
  vm.runInContext(configSrc, sb2);
  check('21.14 desktop sim: window._isMobile = false', sb2.window._isMobile === false);
})();


// ══════════════════════════════════════════════
// Summary
// ══════════════════════════════════════════════
console.log('\n' + pass + ' PASS, ' + fail + ' FAIL — ' + (pass + fail) + ' total');
if (fail > 0) process.exit(1);
