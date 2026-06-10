// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — Witness: W-DOC-DOTS (HISTORY_SESSION_EVENTS.md §A1-DOC)
// Issue PROVED/DISPROVED: committed doc changes (Save/New/Delete/DocAction) were INVISIBLE in the
//   glassbowl Z (#scrub) — only VIEW moments recorded; AND the fix must record at the COMMIT boundary
//   only, never per keystroke (typing = the field's native undo; "editing 10 chars then Save = ONE dot").
// Proves, against the REAL crud_overlay PURE CORE (module.exports — the designed headless seam):
//   1. CORE.buildOp + CORE.docLabel: each committed verb yields ONE label — update→'Save …',
//      create→'New …', delete→'Delete …', process→'CO … → IP'.
//   2. Ten value edits before ONE buildOp still yield ONE op/label (the commit gesture is the unit;
//      no keystroke path exists — structurally, docDot is called ONLY from the funnel).
//   3. Funnel wiring: applyOp's three CRUD branches + commitProcess committed + dryProcess each call
//      docDot(CORE.docLabel(…)); dry path is marked ' (dry)'.
//   4. glassbowl.html recordDocMoment is PAGE-LOCAL: pushes a §DOC-DOT into viewHist with NO
//      WholeHistory mirror (CRUD detail never crowds W); docSeq keeps two same-label saves distinct;
//      vlRestoring gates it (scrub-restore never mints a dot).
// §-log first — READ tests/poc_doc_dots.log before any conclusion.
// Run:  node tests/poc_doc_dots.js 2>&1 | tee tests/poc_doc_dots.log   (cwd = bim-ootb/erp)
'use strict';
var fs = require('fs'), path = require('path');
var CORE = require(path.join(__dirname, '../crud_overlay.js'));   // node → module.exports = PURE CORE

var fail = 0;
function ok(c, m){ console.log((c ? '§W-DOC-DOTS PASS ' : '§W-DOC-DOTS FAIL ') + m); if (!c) fail++; }
ok(typeof CORE.buildOp === 'function' && typeof CORE.docLabel === 'function', 'PURE CORE loaded (buildOp + docLabel)');

var entry = { key: 'c_order', ordinal: 1, verbs: ['create','edit','delete','process'],
  fields: [ { col: 'docstatus', type: 'text' }, { col: 'grandtotal', type: 'number' } ] };
var orig = { docstatus: 'DR', grandtotal: '100' };

// 1. one committed verb = one label (REAL buildOp → REAL docLabel)
var up = CORE.buildOp('update', entry, { docstatus: 'DR', grandtotal: '250' }, orig, { id: 5 });
ok(CORE.docLabel(up) === 'Save c_order', 'UPDATE → "Save c_order": ' + CORE.docLabel(up));
var cr = CORE.buildOp('create', entry, { docstatus: 'DR', grandtotal: '1' }, null, {});
ok(CORE.docLabel(cr) === 'New c_order', 'CREATE → "New c_order": ' + CORE.docLabel(cr));
var de = CORE.buildOp('delete', entry, {}, orig, { id: 5 });
ok(CORE.docLabel(de) === 'Delete c_order', 'DELETE → "Delete c_order": ' + CORE.docLabel(de));
var pr = CORE.buildOp('process', entry, { docstatus: 'DR' }, orig, { id: 5 });
ok(/^CO c_order → /.test(CORE.docLabel(pr)), 'DOC_ACTION → "' + CORE.docLabel(pr) + '" (action + transition)');
ok(CORE.docLabel(pr, 'Sales Order') === CORE.docLabel(pr).replace('c_order', 'Sales Order'), 'friendly name substitutes via the name arg');

// 2. ten "keystrokes" then ONE save = ONE op carrying ONE coalesced change-set = ONE label
var vals = { docstatus: 'DR', grandtotal: '250' };
for (var i = 0; i < 10; i++) vals.grandtotal = String(250 + i);   // typing never reaches the funnel
var one = CORE.buildOp('update', entry, vals, orig, { id: 5 });
ok(Object.keys(one.changes).length === 1 && CORE.docLabel(one) === 'Save c_order',
  '10 edits then ONE Save = ONE op (changes=' + JSON.stringify(Object.keys(one.changes)) + ') = ONE dot label');

// 3. funnel wiring (structural, against the shipped source)
var src = fs.readFileSync(path.join(__dirname, '../crud_overlay.js'), 'utf8');
var calls = (src.match(/docDot\(CORE\.docLabel\(/g) || []).length;
ok(calls === 5, 'docDot(CORE.docLabel(…)) wired at exactly the 5 funnel sites (3 CRUD + committed + dry): ' + calls);
ok(/docDot\(CORE\.docLabel\(op, fname\(op\.key\)\) \+ ' \(dry\)', op\)/.test(src), 'dry fallback marks the dot " (dry)" and passes op (§A-GRAIL)');
ok(!/addEventListener\(['"](input|keydown|keyup)['"][\s\S]{0,200}docDot/.test(src), 'no input/key handler reaches docDot (commit boundary only)');
ok(/function docDot\(label, op\) \{ try \{ if \(typeof global\.recordDocMoment === 'function'\)/.test(src), 'docDot(label,op) delegates to the page recordDocMoment (typeof-guarded)');

// 4. glassbowl.html recordDocMoment: page-local §DOC-DOT, no W mirror, docSeq distinctness, scrub-gated
var gb = fs.readFileSync(path.join(__dirname, '../glassbowl.html'), 'utf8');
var rdm = gb.match(/window\.recordDocMoment=function[\s\S]*?\};/);
ok(!!rdm, 'glassbowl.html defines window.recordDocMoment');
ok(rdm && rdm[0].indexOf('§DOC-DOT') >= 0, 'recordDocMoment logs §DOC-DOT');
ok(rdm && rdm[0].indexOf('WholeHistory') < 0, 'recordDocMoment is PAGE-LOCAL (no WholeHistory mirror — detail never crowds W)');
ok(rdm && rdm[0].indexOf('docSeq') >= 0, 'docSeq keeps consecutive same-label commits distinct (two saves = two dots)');
ok(rdm && rdm[0].indexOf('vlRestoring') >= 0, 'recordDocMoment gated by vlRestoring (scrub-restore never mints a dot)');

console.log(fail === 0 ? '§W-DOC-DOTS ALL PASS' : ('§W-DOC-DOTS ' + fail + ' FAILED'));
process.exit(fail === 0 ? 0 : 1);
