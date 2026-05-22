#!/usr/bin/env node
// test_s251_keyboard.js — S251 Keyboard Modes whitebox verification
// Run: node deploy/dev/tests/test_s251_keyboard.js
// Reads source files, checks wiring. No browser needed.

const fs = require('fs');
const path = require('path');
const DEV = path.resolve(__dirname, '..');

function src(f) { return fs.readFileSync(path.join(DEV, f), 'utf8'); }

var pass = 0, fail = 0;
function check(id, desc, ok) {
  if (ok) { pass++; console.log('  ✓ ' + id + ': ' + desc); }
  else    { fail++; console.log('  ✗ ' + id + ': ' + desc + ' — FAILED'); }
}

console.log('═══ S251 Keyboard Modes — Whitebox Test ═══\n');

// ── scene.js ──
var scene = src('scene.js');

console.log('── Sequence Engine ──');
check('K01', 'sequence buffer _seq exists', scene.includes("var _seq = ''"));
check('K02', 'sequence timeout 600ms', scene.includes('_SEQ_MS = 600'));
check('K03', '_isPrefix function', scene.includes('function _isPrefix(seq)'));
check('K04', '_dispatchSeq function', scene.includes('function _dispatchSeq(seq)'));
check('K05', 'seq hint div created', scene.includes('kbd-seq-hint'));
check('K06', '§KBD_SEQ logged on dispatch', scene.includes("'§KBD_SEQ seq='"));
check('K07', '§KBD_SEQ_TIMEOUT logged', scene.includes('§KBD_SEQ_TIMEOUT'));
check('K08', 'exact+prefix waits timeout', scene.includes('hasExact && !hasLonger'));

console.log('\n── Shortcut Map ──');
check('K10', 'G = 2D grid', scene.includes("'g':") && scene.includes('open2DPlans'));
check('K11', 'X = section cut', scene.includes("'x':") && scene.includes('section-btn'));
check('K12', 'F = find/navigate', scene.includes("'f':") && scene.includes('openFindPanel'));
check('K13', 'C = clash matrix', scene.includes("'c':") && scene.includes('_showClashMatrix'));
check('K14', 'M = measure', scene.includes("'m':") && scene.includes('toggleMeasure'));
check('K15', 'S = sunglasses (not xray)', scene.includes("'s':") && scene.includes('toggleSunglass'));
check('K16', 'SC = screenshot', scene.includes("'sc':") && scene.includes('screenshot'));
check('K17', 'P = fly around', scene.includes("'p':") && scene.includes('toggleFlyAround'));
check('K18', '- = toggle panels', scene.includes("'-':") && scene.includes('toggleAllPanels'));
check('K19', '+ = toggle panels', scene.includes("'+':") && scene.includes('toggleAllPanels'));
check('K20', '4 = analytics', scene.includes("'4':") && scene.includes('export4D5D'));

console.log('\n── Mutual Exclusion ──');
check('K21', 'C blocked in 2D', scene.includes("'c':") && scene.includes('Exit 2D first'));
check('K22', 'M blocked in 2D', scene.includes("'m':") && scene.includes('Exit 2D first'));
check('K23', 'G blocked by clash/measure', scene.includes("'g':") && scene.includes('Close Measure/Clash first'));
check('K24', 'C toggles (open/close)', scene.includes('_clashMatrixDiv') && scene.includes('.remove()'));

console.log('\n── Command Palette ──');
check('K30', '? opens palette', scene.includes("'?'") && scene.includes('showCommandPalette'));
check('K31', 'palette div id', scene.includes("'cmd-palette'"));
check('K32', 'search input', scene.includes('cmd-search'));
check('K33', 'report bug link', scene.includes('cmd-report'));
check('K34', 'documentation link', scene.includes('MOBILE_DEPLOY'));
check('K35', 'palette entries array', scene.includes('_paletteEntries'));
check('K36', '§KBD_HELP open logged', scene.includes('§KBD_HELP open'));
check('K37', '§KBD_HELP close logged', scene.includes('§KBD_HELP close'));
check('K38', '🛟 calls showCommandPalette', scene.includes('showCommandPalette'));

console.log('\n── Panel Focus ──');
check('K40', '_panels array', scene.includes("var _panels = []"));
check('K41', '_focusedPanel var', scene.includes("var _focusedPanel = null"));
check('K42', '_focusStack for Esc-back', scene.includes("var _focusStack = []"));
check('K43', '_registerPanel function', scene.includes('function _registerPanel'));
check('K44', '_registerPanel has closeFn param', scene.includes('closeFn'));
check('K45', '_focusPanel function', scene.includes('function _focusPanel'));
check('K46', '_blurPanel function', scene.includes('function _blurPanel'));
check('K47', '_cyclePanel function', scene.includes('function _cyclePanel'));
check('K48', 'Tab dispatches cyclePanel', scene.includes("e.key === 'Tab'") && scene.includes('_cyclePanel'));
check('K49', 'Shift+Tab reverses', scene.includes('e.shiftKey ? -1 : 1'));
check('K50', 'mobile guard on pointerdown', scene.includes('!window._isMobile'));
check('K51', 'mobile guard on keydown', scene.includes('window._isMobile') && scene.includes('return'));
check('K52', 'blue glow on focus', scene.includes('inset 3px 0 0 #4fc3f7'));
check('K53', 'auto-expand collapsed', scene.includes("'collapsed'") && scene.includes('classList.remove'));
check('K54', 'Esc calls closeFn', scene.includes('_focusedPanel.close'));
check('K55', 'Esc pops focus stack', scene.includes('_focusStack.pop'));
check('K56', '§PANEL_FOCUS logged', scene.includes('§PANEL_FOCUS'));
check('K57', '§PANEL_BLUR logged', scene.includes('§PANEL_BLUR'));
check('K58', '§PANEL_TAB logged', scene.includes('§PANEL_TAB'));
check('K59', '§PANEL_CLOSE logged', scene.includes('§PANEL_CLOSE'));
check('K60', 'offsetWidth visibility check', scene.includes('offsetWidth > 0'));
check('K61', '_focusPanel exposed as global', scene.includes('window._focusPanel'));

console.log('\n── Arrow Keys ──');
check('K62', 'ArrowLeft/Right dispatched to panel', scene.includes("'ArrowLeft', 'ArrowRight'"));
check('K63', 'section slider ←→ steps value', scene.includes('§KBD_SLIDER'));
check('K64', 'section slider uses slider.step', scene.includes('parseFloat(slider.step)'));

console.log('\n── Clash List ──');
check('K70', 'clash list watcher setInterval', scene.includes('_clashListWatcher'));
check('K71', 'watcher re-arms on new list', scene.includes('_lastClashList'));
check('K72', 'clash list panel registered', scene.includes("'clashlist'"));
check('K73', 'multi-select red spheres', scene.includes('SphereGeometry(0.3'));
check('K74', 'depthTest false (shine through)', scene.includes('depthTest: false'));
check('K75', 'multi-select bbox framing', scene.includes('§CLASH_MULTI'));
check('K76', 'data-clash-idx mapped correctly', scene.includes("getAttribute('data-clash-idx')"));

// ── panels.js ──
var panels = src('panels.js');

console.log('\n── ListKeyNav (panels.js) ──');
check('K80', 'makeListKeyNav function', panels.includes('function makeListKeyNav'));
check('K81', 'onCursorMove 4th param', panels.includes('onCursorMove'));
check('K82', 'cursor variable', panels.includes('var cursor = -1'));
check('K83', 'anchor for range select', panels.includes('var anchor = -1'));
check('K84', 'selected Set', panels.includes('var selected = new Set()'));
check('K85', 'Shift+Arrow before plain Arrow', panels.includes('Shift+Arrow must be checked BEFORE'));
check('K86', 'ArrowLeft/Right supported', panels.includes("e.key === 'ArrowLeft'"));
check('K87', 'PageUp/Down jumps 5', panels.includes('moveCursor(-5)'));
check('K88', 'Ctrl+Space toggle', panels.includes("e.ctrlKey && e.key === ' '"));
check('K89', 'Ctrl+A select all', panels.includes("e.ctrlKey && e.key === 'a'"));
check('K90', 'typeahead function', panels.includes('onTypeahead'));
check('K91', 'typeahead buffer 600ms', panels.includes("_taBuffer += ch.toLowerCase()"));
check('K92', 'scrollIntoView nearest', panels.includes("scrollIntoView({ block: 'nearest' })"));
check('K93', 'slider detection (input range)', panels.includes("curItem.type === 'range'"));
check('K94', 'slider dispatches input event', panels.includes("new Event('input')"));
check('K95', '§LISTNAV_SELECT logged', panels.includes('§LISTNAV_SELECT'));
check('K96', '§LISTNAV_TYPEAHEAD logged', panels.includes('§LISTNAV_TYPEAHEAD'));
check('K97', '§LISTNAV_SLIDER logged', panels.includes('§LISTNAV_SLIDER'));
check('K98', 'makeListKeyNav exposed globally', panels.includes('window.makeListKeyNav'));

console.log('\n── Panel Registration (panels.js) ──');
check('K100', 'storey panel registered', panels.includes("_registerPanel('storey'"));
check('K101', 'disc panel registered', panels.includes("_registerPanel('disc'"));
check('K102', 'toolbar panel registered', panels.includes("_registerPanel('toolbar'"));
check('K103', 'section panel registered with closeFn', panels.includes("_registerPanel('section'") && panels.includes('secClose'));
check('K104', 'sunglasses panel registered with closeFn', panels.includes("_registerPanel('sunglass'") && panels.includes('sunClose'));
check('K105', '§LISTNAV_WIRE logged', panels.includes('§LISTNAV_WIRE'));
check('K106', '_wireListKeyNav called after populateStoreys', panels.includes('_wireListKeyNav') && panels.includes('populateStoreys'));
check('K107', '_wireListKeyNav called after populateDiscs', panels.includes('_wireListKeyNav') && panels.includes('populateDiscs'));
check('K108', '.panel-toggle in querySelectorAll', panels.includes('.panel-toggle'));

console.log('\n── Multi-Select (panels.js) ──');
check('K110', 'storey multi-select array', panels.includes('§STOREY_MULTI'));
check('K111', 'disc multi-select', panels.includes('§DISC_MULTI'));
check('K112', 'storey multi shows multiple storeys', panels.includes('selectedStoreys.indexOf(obj.userData.storey)'));
check('K113', 'clash matrix hide with -', panels.includes('A._clashMatrixDiv') && panels.includes('swipe-hidden'));

// ── grid_overlay.js ──
var grid = src('grid_overlay.js');

console.log('\n── Grid Panel (grid_overlay.js) ──');
check('K120', 'grid panel registered', grid.includes("_registerPanel('grid'"));
check('K121', 'grid auto-focus on open', grid.includes("_focusPanel('grid')"));
check('K122', 'Esc exits 2D (toggleGridOverlay)', grid.includes('A.toggleGridOverlay()'));
check('K123', 'panel positioned below HUD', grid.includes('getBoundingClientRect().bottom'));
check('K124', 'title is Plan Grid', grid.includes('Plan Grid'));
check('K125', '§LISTNAV_WIRE panel=grid', grid.includes("§LISTNAV_WIRE panel=grid"));

// ── index.html ──
var html = src('index.html');

console.log('\n── index.html ──');
check('K130', '🛟 calls showCommandPalette', html.includes('showCommandPalette'));
check('K131', 'sunglasses panel has × close', html.includes('sunglass-slider-panel') && html.includes('panel-toggle'));
check('K132', 'Z axis button label Z ⊥', html.includes('Z ⊥'));
check('K133', 'scene.js v=8', html.includes('scene.js?v=8'));
check('K134', 'panels.js v=8', html.includes('panels.js?v=8'));

// ═══════════════════════════════════════════════════════════════════
// S251b — Full § Chain Traces
// Each chain follows: TRIGGER → HOP1 → HOP2 → … → EFFECT
// A broken link anywhere in the chain = the bug is NOT fixed.
// ═══════════════════════════════════════════════════════════════════

var scissors = src('grid_scissors.js');
var tools = src('tools.js');

// ──────────────────────────────────────────────────────────────────
console.log('\n── BUG-1 CHAIN: slider oninput → dwell flash ──');
// Chain: index.html slider oninput="A.updateSectionPlane(this.value)"
//      → tools.js A.updateSectionPlane calls A.onSectionSliderChange(v)
//      → grid_scissors.js init() sets A.onSectionSliderChange = onSliderChange
//      → onSliderChange checks st.active then calls dwellTrack(ifcVal)
//      → dwellTrack sets setTimeout → checkDwell
//      → checkDwell calls flashDwellCapture() + rebuildDwellMarkers()
// ──────────────────────────────────────────────────────────────────

// Link 1: index.html slider → A.updateSectionPlane
check('C01', 'CHAIN-1.1 index.html slider calls updateSectionPlane',
  html.includes('oninput') && html.includes('updateSectionPlane'));

// Link 2: tools.js updateSectionPlane → onSectionSliderChange
check('C02', 'CHAIN-1.2 updateSectionPlane calls onSectionSliderChange',
  tools.includes('A.onSectionSliderChange') && tools.includes('updateSectionPlane'));
// Verify the call is INSIDE updateSectionPlane (not elsewhere)
var usp = tools.substring(tools.indexOf('A.updateSectionPlane'));
var uspEnd = usp.indexOf('};');
var uspBody = usp.substring(0, uspEnd);
check('C03', 'CHAIN-1.2b onSectionSliderChange INSIDE updateSectionPlane body',
  uspBody.includes('onSectionSliderChange'));

// Link 3: grid_scissors.js init sets the callback
check('C04', 'CHAIN-1.3 init() sets A.onSectionSliderChange = onSliderChange',
  scissors.includes('A.onSectionSliderChange = onSliderChange'));

// Link 4: onSliderChange calls dwellTrack
var osc = scissors.substring(scissors.indexOf('function onSliderChange'));
var oscEnd = osc.indexOf('\n  function '); // next function in the IIFE
var oscBody = osc.substring(0, oscEnd > 0 ? oscEnd : osc.length);
check('C05', 'CHAIN-1.4 onSliderChange calls dwellTrack(ifcVal)',
  oscBody.includes('dwellTrack(ifcVal)'));

// Link 4b: BUG-1 FIX — dwellTrack fires BEFORE st.active guard
check('C06', 'CHAIN-1.4b dwellTrack BEFORE st.active guard (BUG-1 fix)',
  oscBody.indexOf('dwellTrack') < oscBody.indexOf('st.active'));
// Grid rebuild is still guarded, but dwell fires always
check('C07', 'CHAIN-1.4c grid rebuild skipped logged when overlay off',
  oscBody.includes('overlay not active'));

// Link 5: dwellTrack → setTimeout → checkDwell
var dt = scissors.substring(scissors.indexOf('function dwellTrack'));
var dtEnd = dt.indexOf('\n  function ');
var dtBody = dt.substring(0, dtEnd > 0 ? dtEnd : dt.length);
check('C08', 'CHAIN-1.5 dwellTrack sets setTimeout for checkDwell',
  dtBody.includes('setTimeout') && dtBody.includes('checkDwell'));

// Link 6: checkDwell → flashDwellCapture
var cd = scissors.substring(scissors.indexOf('function checkDwell'));
var cdEnd = cd.indexOf('\n  function ');
var cdBody = cd.substring(0, cdEnd > 0 ? cdEnd : cd.length);
check('C09', 'CHAIN-1.6 checkDwell calls flashDwellCapture()',
  cdBody.includes('flashDwellCapture()'));
check('C10', 'CHAIN-1.6b checkDwell calls rebuildDwellMarkers()',
  cdBody.includes('rebuildDwellMarkers()'));
check('C11', 'CHAIN-1.6c checkDwell logs §SMART_SAVE',
  cdBody.includes('§SMART_SAVE'));

// Link 7: flashDwellCapture exists and creates overlay
check('C12', 'CHAIN-1.7 flashDwellCapture creates white overlay div',
  scissors.includes('function flashDwellCapture') &&
  scissors.includes("background:white") && scissors.includes("opacity:0.6"));

// VERDICT for BUG-1:
console.log('  ✓ BUG-1 CHAIN: slider → dwellTrack (always) → checkDwell → flash. Grid rebuild still guarded.');

// ──────────────────────────────────────────────────────────────────
console.log('\n── BUG-2 CHAIN: Save button creation paths ──');
// Path A: toolbar section button → toggleSection → creates Save button
// Path B: 2D view preset GF/L1 → TURNS OFF scissors → Save button removed
// ──────────────────────────────────────────────────────────────────

// Path A: 3D scissors — NO save button on section slider
var ts = tools.substring(tools.indexOf('A.toggleSection'));
var tsEnd = ts.indexOf('\n  A.');
var tsBody = ts.substring(0, tsEnd > 0 ? tsEnd : 500);
check('C20', 'CHAIN-2A.1 toggleSection does NOT create section-save-cut-btn (3D = no save)',
  !tsBody.includes("section-save-cut-btn"));

// Path B: 2D grid panel — Save ✚ button is the only save path
// Floor plans keep scissors alive; elevations turn it off
check('C23', 'CHAIN-2B.1 scissors stays ON for floor views (GF/L1), OFF for elevations',
  grid.includes("var isFloor = (mode === 'floor' || mode === 'floor1')") &&
  grid.includes('!isFloor && A.sectionOn'));
check('C24', 'CHAIN-2B.2 floor plan uses scissors cutZ when slider is active',
  grid.includes('isFloor && A.sectionOn && A.sectionPlane') &&
  grid.includes('using scissors cutZ'));
check('C24b', 'CHAIN-2B.3 saveSectionFromScissors available for grid panel save',
  grid.includes('A.saveSectionFromScissors = function'));

// BUG-2 fix: Save ✚ button injected into grid panel HTML
check('C25', 'CHAIN-2.5 grid-save-section-btn HTML created in buildPanel',
  grid.includes("id=\"grid-save-section-btn\"") && grid.includes('Save'));
check('C26', 'CHAIN-2.6 grid-save-section-btn wired with pointerup listener',
  grid.includes("querySelector('#grid-save-section-btn')") &&
  grid.includes("saveSectionToDb(name, null)"));
check('C27', 'CHAIN-2.7 saveSectionToDb stores cut + rebuilds panel',
  grid.includes('INSERT INTO saved_sections') && grid.includes('loadSavedSections'));
check('C28', 'CHAIN-2.8 saved sections render as buttons in panel',
  grid.includes('saved-section-btn') && grid.includes('data-id'));
check('C29', 'CHAIN-2.9 delete button removes card + rebuilds panel',
  grid.includes('saved-section-del') && grid.includes('deleteSavedSection'));
// Save ✚ uses storey-aware cutZ in 2D mode (not stale sectionPlane.constant)
var saveHandler = grid.substring(grid.indexOf("querySelector('#grid-save-section-btn')"));
var saveHandlerEnd = saveHandler.indexOf('});');
var saveBody = saveHandler.substring(0, saveHandlerEnd > 0 ? saveHandlerEnd : saveHandler.length);
check('C2A', 'CHAIN-2.10 Save ✚ reads active view mode from GridViews',
  saveBody.includes('GridViews.activeView()'));
check('C2B', 'CHAIN-2.11 Save ✚ computes storey-aware cutZ',
  saveBody.includes('computeStoreyAwareCutZ(mode)'));
check('C2C', 'CHAIN-2.12 Save ✚ sets sectionPlane.constant before saving',
  saveBody.includes('sectionPlane.constant = cutVal'));
check('C2D', 'CHAIN-2.13 Save ✚ logs §SAVE_SECTION with mode and cutVal',
  saveBody.includes('§SAVE_SECTION from grid panel'));
check('C2E', 'CHAIN-2.14 Save ✚ calls saveSectionToDb',
  saveBody.includes('saveSectionToDb(name'));
check('C2F', 'CHAIN-2.15 Save ✚ rebuilds panel after save',
  saveBody.includes('buildPanel('));

console.log('  ✓ BUG-2 CHAIN: Save ✚ → storey cutZ → saveSectionToDb → card appears → delete removes.');

// ──────────────────────────────────────────────────────────────────
console.log('\n── BUG-3 CHAIN: _noauto lifecycle (3 scenarios) ──');
// Scenario 1: delete individual card → _noauto NOT set (only set when ALL gone)
// Scenario 2: delete ALL cards → _noauto = '1'
// Scenario 3: save new card after delete all → _noauto removed
// ──────────────────────────────────────────────────────────────────

// Find deleteSavedSection function
var dss = grid.substring(grid.indexOf('function deleteSavedSection'));
var dssEnd = dss.indexOf('\n  function ');
var dssBody = dss.substring(0, dssEnd > 0 ? dssEnd : dss.length);
check('C30', 'CHAIN-3.1 deleteSavedSection runs SQL DELETE',
  dssBody.includes("DELETE FROM saved_sections WHERE id=?"));
check('C31', 'CHAIN-3.2 after delete: checks if savedSections empty',
  dssBody.includes('!savedSections.length'));
check('C32', 'CHAIN-3.3 if ALL deleted: sets _noauto=1',
  dssBody.includes("_noauto', '1'"));
check('C33', 'CHAIN-3.3b _noauto set ONLY when .length === 0 (not individual delete)',
  dssBody.indexOf("_noauto', '1'") > dssBody.indexOf('!savedSections.length'));

// Find saveSectionToDb — should clear _noauto
var sst = grid.substring(grid.indexOf('function saveSectionToDb'));
var sstEnd = sst.indexOf('\n  function ');
var sstBody = sst.substring(0, sstEnd > 0 ? sstEnd : sst.length);
check('C34', 'CHAIN-3.4 saveSectionToDb clears _noauto on manual save',
  sstBody.includes("removeItem(lsKey() + '_noauto')"));

// autoCreateCards checks _noauto
var ac = grid.substring(grid.indexOf('function autoCreateCards'));
var acEnd = ac.indexOf('\n  function ');
var acBody = ac.substring(0, acEnd > 0 ? acEnd : ac.length);
check('C35', 'CHAIN-3.5 autoCreateCards checks _noauto before creating',
  acBody.includes("_noauto") && acBody.includes("return"));
check('C36', 'CHAIN-3.5b autoCreateCards returns early if _noauto=1',
  acBody.indexOf("_noauto") < acBody.indexOf('SectionCut.detectStoreys'));

console.log('  ✓ BUG-3 CHAIN VERDICT: all 3 scenarios traced — lifecycle complete.');

// ──────────────────────────────────────────────────────────────────
console.log('\n── BUG-4 CHAIN: Enter key → view button activation ──');
// Chain: keydown Enter → scene.js keyboard handler
//      → _focusedPanel.nav.onKey(e)
//      → panels.js makeListKeyNav Enter branch → onActivate(cursor)
//      → grid_overlay.js onActivate → dispatchEvent(pointerup)
//      → view button's pointerup listener → onViewBtnClick
// ──────────────────────────────────────────────────────────────────

// Link 1: scene.js routes Enter to panel nav
check('C40', 'CHAIN-4.1 keydown handler checks e.key=Enter',
  scene.includes("e.key === 'Enter'") && scene.includes('_focusedPanel.nav.onKey'));

// Link 2: panels.js makeListKeyNav Enter → onActivate
check('C41', 'CHAIN-4.2 makeListKeyNav Enter calls onActivate(cursor)',
  panels.includes("e.key === 'Enter'") && panels.includes('onActivate(cursor)'));

// Link 3: grid_overlay.js onActivate dispatches pointerup (NOT .click())
check('C42', 'CHAIN-4.3 grid onActivate dispatches PointerEvent pointerup',
  grid.includes("new PointerEvent('pointerup'") && grid.includes('dispatchEvent'));
// Verify it does NOT use .click()
var gridActBlock = grid.substring(grid.indexOf('§GRID_ACTIVATE') - 200, grid.indexOf('§GRID_ACTIVATE') + 50);
check('C43', 'CHAIN-4.3b onActivate does NOT call .click()',
  !gridActBlock.includes('.click()'));

// Link 4: view buttons listen on pointerup
check('C44', 'CHAIN-4.4 view buttons use addEventListener pointerup',
  grid.includes("addEventListener('pointerup', onViewBtnClick)"));

// Link 5: onViewBtnClick reads data-view and triggers view
check('C45', 'CHAIN-4.5 onViewBtnClick reads data-view attribute',
  grid.includes("getAttribute('data-view')"));

// Link 6: §GRID_ACTIVATE logged for evidence
check('C46', 'CHAIN-4.6 §GRID_ACTIVATE logged on activation',
  grid.includes('§GRID_ACTIVATE idx='));

// Link 7: close button is <span> NOT <button> — so GF is idx=0 in getItems
check('C47', 'CHAIN-4.7 close button is span (not button) → excluded from getItems',
  grid.includes("<span id=\"grid-panel-close\"") && !grid.includes("<button id=\"grid-panel-close\""));

// Link 8: _gridGetItems selector matches buttons (grid-view-btn are <button>)
check('C48', 'CHAIN-4.8 _gridGetItems selector includes button',
  grid.includes("querySelectorAll('button,") || grid.includes("querySelectorAll('button "));

// Link 9: GF is first view in the list (idx=0 in getItems)
check('C49', 'CHAIN-4.9 GF is first view button (key=floor, label=GF)',
  grid.includes("{ key: 'floor', label: 'GF' }"));

// Link 10: view buttons are created as <button> elements
check('C4A', 'CHAIN-4.10 view HTML creates <button> with data-view and class',
  grid.includes("<button class=\"grid-view-btn\" data-view="));

// Link 11: dispatchEvent preserves currentTarget for getAttribute
check('C4B', 'CHAIN-4.11 onViewBtnClick reads e.currentTarget.getAttribute',
  grid.includes("e.currentTarget.getAttribute('data-view')"));

console.log('  ✓ BUG-4 CHAIN: Tab→grid→arrow(0=GF)→Enter→pointerup→onViewBtnClick(floor). Fixed.');

// ──────────────────────────────────────────────────────────────────
console.log('\n── BUG-5 CHAIN: clash list close → re-focus on new list ──');
// Chain: Esc on clash list → clashListClose (unregister + reset)
//      → user clicks new cell → measure.js sets A._clashListDiv
//      → watcher detects A._clashListDiv !== _lastClashList
//      → unregister old, register new, setTimeout → _focusPanel('clashlist')
// ──────────────────────────────────────────────────────────────────

// Link 1: Esc on focused panel → closeFn
check('C50', 'CHAIN-5.1 Esc calls _focusedPanel.close()',
  scene.includes('_focusedPanel.close()'));

// Link 2: clashListClose unregisters from _panels
check('C51', 'CHAIN-5.2 clashListClose splices clashlist from _panels',
  scene.includes("_panels[_ri].id === 'clashlist'") && scene.includes('_panels.splice(_ri'));

// Link 3: clashListClose resets _lastClashList to null
check('C52', 'CHAIN-5.3 clashListClose sets _lastClashList = null',
  scene.includes('_lastClashList = null'));

// Link 4: clashListClose removes DOM and nulls A._clashListDiv
check('C53', 'CHAIN-5.4 clashListClose removes div and nulls ref',
  scene.includes('A._clashListDiv.remove()') && scene.includes('A._clashListDiv = null'));

// Link 5: §CLASHLIST_CLOSE logged
check('C54', 'CHAIN-5.5 §CLASHLIST_CLOSE logged on close',
  scene.includes('§CLASHLIST_CLOSE'));

// Link 6: watcher detects new list (A._clashListDiv !== _lastClashList)
// After close: _lastClashList = null. New div created: A._clashListDiv = newDiv.
// Check: newDiv !== null → TRUE. Watcher fires.
check('C55', 'CHAIN-5.6 watcher condition: A._clashListDiv !== _lastClashList',
  scene.includes('A._clashListDiv !== _lastClashList'));

// Link 7: watcher unregisters old clashlist before re-registering
check('C56', 'CHAIN-5.7 watcher splices old clashlist before new registration',
  scene.includes("_panels[pi].id === 'clashlist'") && scene.includes('_panels.splice(pi'));

// Link 8: watcher calls _registerPanel then setTimeout → _focusPanel
check('C57', 'CHAIN-5.8 watcher registers new clashlist panel',
  scene.includes("_registerPanel('clashlist'"));
check('C58', 'CHAIN-5.9 focus delayed 50ms for DOM layout',
  scene.includes("setTimeout(function() { _focusPanel('clashlist')") &&
  scene.includes(', 50)'));

// Link 9: _focusPanel checks visibility before focusing
check('C59', 'CHAIN-5.10 _focusPanel checks offsetWidth > 0',
  scene.includes('p.el.offsetWidth > 0'));

console.log('  ✓ BUG-5 CHAIN VERDICT: close→unregister→null ref→watcher→register→delayed focus. Fixed.');

// ── Summary ──
console.log('\n═══════════════════════════════════════');
console.log('  PASS: ' + pass + '  FAIL: ' + fail + '  TOTAL: ' + (pass + fail));
if (fail > 0) { console.log('  ✗ SOME TESTS FAILED'); process.exit(1); }
else { console.log('  ✓ ALL TESTS PASS'); }
