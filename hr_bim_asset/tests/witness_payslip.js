// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-HBA-PAYSLIP witness (P7 — the payslip view over ad_payroll.js's native compile). Each
//   check NAMES the issue it proves. Load-bearing: OFF = NO DOM (the rest of the viewer is undisturbed); toggle
//   ON mounts exactly ONE overlay showing the FIRST employee's payslip; selecting another employee re-renders
//   to THAT employee's numbers (not a static screen); toggle OFF removes it (zero residue); the data-gate
//   detects an injected payroll spec / honestly absent otherwise. Drives the ACTUAL adapter
//   viewer/hba_payslip.js through a stub document (the closest node gets to the DOM).
//   Run: node hr_bim_asset/tests/witness_payslip.js
'use strict';
var checks = [];
function ok(tag, cond, msg) { checks.push(!!cond); console.log('§HBA-PAYSLIP ' + (cond ? 'PASS' : 'FAIL') + ' ' + tag + ' — ' + msg); }

// ---- stub DOM (same shape as witness_dashpane.js) ----------------------------------------------------------
function node(tag) {
  return { tagName: tag, style: { cssText: '' }, children: [], textContent: '', title: '', id: '',
    setAttribute: function (k, v) { this['attr_' + k] = v; },
    appendChild: function (c) { c.parentNode = this; this.children.push(c); return c; },
    removeChild: function (c) { var i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); c.parentNode = null; return c; },
    remove: function () { if (this.parentNode) this.parentNode.removeChild(this); },
    addEventListener: function (ev, fn) { this['_on_' + ev] = fn; } };
}
var body = node('body');
global.document = { createElement: function (t) { return node(t); }, body: body, documentElement: node('html') };

// ---- engines (browser globals) -------------------------------------------------------------------------
global.self = global;
self.HrConnectors = require('../connectors'); self.HrRules = require('../rules'); self.HbaWatermark = require('../watermark');
var AD = require('../ad_payroll'); self.HbaAdPayroll = AD;
var Pane = require('../../viewer/hba_payslip');

function paneInBody() { return body.children.filter(function (c) { return c.id === 'hba-payslip-pane'; }); }
function allText(n, acc) { acc = acc || []; if (n.textContent) acc.push(n.textContent); (n.children || []).forEach(function (c) { allText(c, acc); }); return acc; }
function pickerButtons() { return paneInBody()[0].children[1].children; }   // pane.children = [head, picker, body]

var A = { status: { textContent: '' }, _hbaPayrollSpec: AD.demoSpec() };

// ---- P1: OFF = no DOM (the rest of the viewer is undisturbed) -------------------------------------------
ok('P1-off-nodom', body.children.length === 0 && Pane.isActive() === false,
  'before toggle: ZERO pane DOM, inactive — OFF is pixel-identical (additive, nothing mounted)');

// ---- P2: data-gate — detects an injected payroll spec / honestly absent without one ----------------------
ok('P2-gate', Pane.detect(A) === true && Pane.detect({}) === false,
  'the pill/drawer data-gate detects the host-injected payroll spec (pane available) / a bare app → no pane (no invention)');

// ---- P3: toggle ON mounts exactly ONE overlay, defaulting to the FIRST employee ----------------------------
var r1 = Pane.toggle(A);
var run = AD.runPeriod(A._hbaPayrollSpec);
var slip1 = AD.payslip(run.hr_movement, A._hbaPayrollSpec.employees[0].c_bpartner_id, 'en');
ok('P3-mount-one', r1 === true && Pane.isActive() === true && paneInBody().length === 1 && body.children.length === 1,
  'toggle ON → exactly ONE overlay pane mounted (its own div; nothing else added)');
var txt1 = allText(paneInBody()[0]).join(' | ');
ok('P4-first-emp-shown', txt1.indexOf('SAMPLE — NOT OFFICIAL') >= 0 && txt1.indexOf(String(slip1.net)) >= 0,
  'pane shows the watermark + the FIRST employee\'s net (' + slip1.net + ') — read from ad_payroll.payslip(), not invented');

// ---- P5: selecting the SECOND employee re-renders to THAT employee's numbers (real interaction, not static) -
var slip2 = AD.payslip(run.hr_movement, A._hbaPayrollSpec.employees[1].c_bpartner_id, 'en');
ok('P5-two-employees-differ', slip1.net !== slip2.net, 'sanity: the two demo employees have DIFFERENT net pay, so re-selection is an observable change');
var btn2 = pickerButtons()[1];
btn2._on_click();   // fire the SAME handler the real UI wires — no shortcut into internals
var txt2 = allText(paneInBody()[0]).join(' | ');
ok('P6-reselect-updates', paneInBody().length === 1 && txt2.indexOf(String(slip2.net)) >= 0 && txt2.indexOf(String(slip1.net)) === -1,
  'clicking the 2nd employee button re-renders the pane to their payslip (net=' + slip2.net + '), the 1st employee\'s net is no longer shown');

// ---- P7: toggle OFF removes the pane (zero residue) --------------------------------------------------------
var r2 = Pane.toggle(A);
ok('P7-unmount-clean', r2 === false && Pane.isActive() === false && body.children.length === 0,
  'toggle OFF → pane removed, body empty — ZERO residue (the viewer returns to identical)');

// ---- P8: re-open resets to the FIRST employee (a fresh open, not stuck on the last selection) ---------------
Pane.toggle(A);
var txt3 = allText(paneInBody()[0]).join(' | ');
ok('P8-reopen-resets', txt3.indexOf(String(slip1.net)) >= 0, 're-opening after a close starts from the first employee again (net=' + slip1.net + ')');
Pane.toggle(A);
ok('P9-reopen-clean', body.children.length === 0, 'final toggle OFF leaves zero DOM residue');

var pass = checks.filter(Boolean).length, fail = checks.length - pass;
console.log('\n§HBA-PAYSLIP ' + pass + '/' + checks.length + ' PASS' + (fail ? (' — ' + fail + ' FAIL') : ''));
process.exit(fail ? 1 : 0);
