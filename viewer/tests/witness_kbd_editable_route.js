#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// # ⚠ DO NOT REMOVE — W-KBD-EDITABLE-ROUTE, prompts/VIEWER_ELEMENT_PARTS.md §S-G4b. Read the log after every run; exit code is not evidence.
// ISSUE IT EXPOSES: "typing `Fin plate` into the Find box leaves `Finplate`": the panel-focused key router in viewer/scene.js consumed (preventDefault) a plain space
// aimed at an INPUT. This witness evaluates the REAL predicate text between the §KBD_EDITABLE_BEGIN/END markers of scene.js (not a copy) and judges it.
// K1 space on INPUT/TEXTAREA/SELECT/contenteditable = NOT consumed (the defect) · K2 space on a non-editable target = consumed (routing unchanged)
// K3 other panel keys on an INPUT keep their routing (ArrowDown, Enter, Ctrl+Space) · K4 a printable letter is never consumed by the panel route.
// KBD_ROUTE_BREAK=1 drops the editable test from the evaluated text: K1 must FAIL. Verdict is INCONCLUSIVE when the marker block is not found.
// Usage: node viewer/tests/witness_kbd_editable_route.js > log 2>&1
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const BREAK = process.env.KBD_ROUTE_BREAK === '1';
let pass = 0, fail = 0;
const ok = (id, c, m) => { console.log('§' + (c ? 'PASS' : 'FAIL') + ' ' + id + ' | ' + m); c ? pass++ : fail++; };
const src = fs.readFileSync(path.join(__dirname, '..', 'scene.js'), 'utf8');
const a = src.indexOf('// §KBD_EDITABLE_BEGIN'), b = src.indexOf('// §KBD_EDITABLE_END');
console.log('§W-KBD-EDITABLE-ROUTE start break=' + BREAK);
if (a < 0 || b < a) { console.log('§INCONCLUSIVE marker block not found in scene.js; nothing judged'); console.log('§W-KBD-EDITABLE-ROUTE INCONCLUSIVE'); process.exit(3); }
let block = src.slice(a, b);
if (BREAK) block = block.replace("if (e.key === ' ' && noMod && _kbdEditable(e.target)) return false;", '');
const sb = { window: {} }; vm.createContext(sb); vm.runInContext(block + '\nthis.route=_kbdPanelRouteConsumes; this.edit=_kbdEditable;', sb);
console.log('§KBD block chars=' + block.length + ' exports route=' + typeof sb.route + ' edit=' + typeof sb.edit);
const ev = (key, tag, o) => Object.assign({ key, ctrlKey: false, altKey: false, metaKey: false, shiftKey: false, target: { tagName: tag, isContentEditable: false } }, o || {});
const routed = (e) => { const noMod = !e.ctrlKey && !e.altKey && !e.metaKey; return sb.route(e, noMod); };
for (const t of ['INPUT', 'TEXTAREA', 'SELECT']) ok('K1 SPACE-' + t, routed(ev(' ', t)) === false, 'space on ' + t + ' consumed=' + routed(ev(' ', t)) + ' (want false)' + (BREAK ? ' [BREAK]' : ''));
{ const e = ev(' ', 'DIV', { target: { tagName: 'DIV', isContentEditable: true } }); ok('K1 SPACE-CONTENTEDITABLE', routed(e) === false, 'consumed=' + routed(e) + ' (want false)'); }
ok('K1 SHIFT-SPACE-INPUT', routed(ev(' ', 'INPUT', { shiftKey: true })) === false, 'shift+space typed into a field is text too');
ok('K2 SPACE-NONEDITABLE', routed(ev(' ', 'DIV')) === true, 'space on a panel/body target still routes to the panel nav (unchanged)');
ok('K3 ARROWDOWN-INPUT', routed(ev('ArrowDown', 'INPUT')) === true, 'ArrowDown from the Find box still routed');
ok('K3 ENTER-INPUT', routed(ev('Enter', 'INPUT')) === true, 'Enter unchanged');
ok('K3 CTRL-SPACE-INPUT', routed(ev(' ', 'INPUT', { ctrlKey: true })) === true, 'Ctrl+Space unchanged');
ok('K4 LETTER', routed(ev('a', 'INPUT')) === false && routed(ev('a', 'DIV')) === false, 'a plain letter is never consumed by the panel route');
ok('K0 EDITABLE-PRED', sb.edit({ tagName: 'INPUT' }) && !sb.edit({ tagName: 'DIV' }) && !sb.edit(null), '_kbdEditable true for INPUT, false for DIV / null');
console.log('§W-KBD-EDITABLE-ROUTE ' + (fail ? 'FAIL' : 'PASS') + ' pass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);
