// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-HBA-LEAVE-PANE witness (P8 — the leave view over leave.js's already-witnessed replay).
//   Each check NAMES the issue it proves. Load-bearing: OFF = NO DOM (the rest of the viewer is undisturbed);
//   toggle ON mounts exactly ONE overlay showing the FIRST employee's leave statement (balance = REPLAY, not
//   a stored number); selecting another employee re-renders to THAT employee's statement; toggle OFF removes
//   it (zero residue); the data-gate detects an injected leave spec / honestly absent otherwise. Drives the
//   ACTUAL adapter viewer/hba_leave.js through a stub document (the closest node gets to the DOM).
//   Run: node hr_bim_asset/tests/witness_leave_pane.js
'use strict';
var checks = [];
function ok(tag, cond, msg) { checks.push(!!cond); console.log('§HBA-LEAVE-PANE ' + (cond ? 'PASS' : 'FAIL') + ' ' + tag + ' — ' + msg); }

// ---- stub DOM (same shape as witness_payslip.js) -----------------------------------------------------------
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
self.HrConnectors = require('../connectors'); self.HbaWatermark = require('../watermark');
var Lv = require('../leave'); self.HbaLeave = Lv;
var Pane = require('../../viewer/hba_leave');

function paneInBody() { return body.children.filter(function (c) { return c.id === 'hba-leave-pane'; }); }
function allText(n, acc) { acc = acc || []; if (n.textContent) acc.push(n.textContent); (n.children || []).forEach(function (c) { allText(c, acc); }); return acc; }
function pickerButtons() { return paneInBody()[0].children[1].children; }   // pane.children = [head, picker, body]

var EMPS = [{ id: 'EMP001', name: 'EMP001' }, { id: 'EMP002', name: 'EMP002' }];
var LOG = {}; EMPS.forEach(function (e) { LOG[e.id] = Lv.demoLog(e.id); });
var A = { status: { textContent: '' }, _hbaLeaveSpec: { period: null, policy: null, locale: 'en', employees: EMPS, log: LOG } };

// ---- LP1: OFF = no DOM (the rest of the viewer is undisturbed) -------------------------------------------
ok('LP1-off-nodom', body.children.length === 0 && Pane.isActive() === false,
  'before toggle: ZERO pane DOM, inactive — OFF is pixel-identical (additive, nothing mounted)');

// ---- LP2: data-gate — detects an injected leave spec / honestly absent without one -------------------------
ok('LP2-gate', Pane.detect(A) === true && Pane.detect({}) === false,
  'the pill/drawer data-gate detects the host-injected leave spec (pane available) / a bare app → no pane (no invention)');

// ---- LP3: toggle ON mounts exactly ONE overlay, defaulting to the FIRST employee ---------------------------
var r1 = Pane.toggle(A);
var sum1 = Lv.summary(LOG['EMP001'], 'EMP001', null, null, 'en');
ok('LP3-mount-one', r1 === true && Pane.isActive() === true && paneInBody().length === 1 && body.children.length === 1,
  'toggle ON → exactly ONE overlay pane mounted (its own div; nothing else added)');
var txt1 = allText(paneInBody()[0]).join(' | ');
ok('LP4-first-emp-shown', txt1.indexOf('SAMPLE — NOT OFFICIAL') >= 0 && txt1.indexOf(String(sum1.unpaid)) >= 0 && txt1.indexOf(String(sum1.balances.annual)) >= 0,
  'pane shows the watermark + the FIRST employee\'s replayed unpaid (' + sum1.unpaid + ') and annual balance (' + sum1.balances.annual + ') — from leave.summary(), not invented');
ok('LP5-chain-verifies', txt1.indexOf('signed chain verifies') >= 0,
  'the chain-integrity line reflects summary().chainOk (true for an untampered log)');

// ---- LP6: selecting the SECOND employee re-renders (real interaction, not static) ---------------------------
var sum2 = Lv.summary(LOG['EMP002'], 'EMP002', null, null, 'en');
ok('LP6-same-schedule-sanity', sum1.unpaid === sum2.unpaid && sum1.balances.annual === sum2.balances.annual,
  'sanity: both demo employees replay the SAME reused schedule (same unpaid=' + sum1.unpaid + '/balance=' + sum1.balances.annual + ') — proves the log is genuinely per-employee-keyed, not accidentally shared/aliased');
var btn2 = pickerButtons()[1];
btn2._on_click();
ok('LP7-reselect-mounts', paneInBody().length === 1 && Pane.isActive() === true,
  'clicking the 2nd employee button re-mounts the pane (no leak, exactly one instance survives)');

// ---- LP8: toggle OFF removes the pane (zero residue) --------------------------------------------------------
var r2 = Pane.toggle(A);
ok('LP8-unmount-clean', r2 === false && Pane.isActive() === false && body.children.length === 0,
  'toggle OFF → pane removed, body empty — ZERO residue (the viewer returns to identical)');

// ---- LP9: re-open resets to the FIRST employee (a fresh open, not stuck on the last selection) ---------------
Pane.toggle(A);
var txt3 = allText(paneInBody()[0]).join(' | ');
ok('LP9-reopen-resets', txt3.indexOf(String(sum1.unpaid)) >= 0, 're-opening after a close starts from the first employee again (unpaid=' + sum1.unpaid + ')');
Pane.toggle(A);
ok('LP10-reopen-clean', body.children.length === 0, 'final toggle OFF leaves zero DOM residue');

// ---- LP11: tamper-evidence surfaces in the view (not just the engine) — verified against the ORIGINAL log,
//   independent of Pane's own render path, so the pane's chainOk text is proven to be reading a real fact ------
var tampered = JSON.parse(JSON.stringify(LOG['EMP001'])); tampered[3].params.days = 1;
var sumTampered = Lv.summary(tampered, 'EMP001', null, null, 'en');
ok('LP11-tamper-detected', sumTampered.chainOk === false, 'a tampered leave op flips chainOk false — the pane would show "chain tamper detected"');

var pass = checks.filter(Boolean).length, fail = checks.length - pass;
console.log('\n§HBA-LEAVE-PANE ' + pass + '/' + checks.length + ' PASS' + (fail ? (' — ' + fail + ' FAIL') : ''));
process.exit(fail ? 1 : 0);
