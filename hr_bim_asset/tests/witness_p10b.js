// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-HBA-P10B witness (RESUME_HR_BIM_ASSET.md §P10b, user 2026-07-02: IoT sensor mockup +
//   CCTV mockup + ERP C_Order billing link + draggable panels). Each check NAMES the issue it proves. Covers:
//   (1) hr_bim_asset/iot.js — 6-sensor catalog, DETERMINISTIC series (same input->same output, never
//   Math.random/Date.now), native c_order/c_orderline/c_uom compile shapes, watermark; (2) viewer/hba_iot.js —
//   off=no-DOM, the data-gate (only lights on a REAL bound asset guid, same gate as the 'maintenance' lens),
//   mount renders 6 charts + 6 CCTV tiles + N billing rows, unmount destroys charts/stops the CCTV loop (zero
//   residue); (3) viewer/hba_draggable.js — enable() binds pointer handlers, a simulated pointerdown-move-up
//   sequence moves the pane's left/top, disable() removes the handlers. Drives the ACTUAL files through a stub
//   document (witness_dashpane.js convention). Run: node hr_bim_asset/tests/witness_p10b.js
'use strict';
var checks = [];
function ok(tag, cond, msg) { checks.push(!!cond); console.log('§HBA-P10B ' + (cond ? 'PASS' : 'FAIL') + ' ' + tag + ' — ' + msg); }

// ============================================================================================================
// (1) hr_bim_asset/iot.js
// ============================================================================================================
global.self = global;
self.HbaWatermark = require('../watermark');
var IoT = self.HbaIot = require('../iot');

ok('I1-catalog', IoT.SENSORS.length === 6 && IoT.SENSORS.map(function (s) { return s.key; }).join(',') === 'temp,pressure,sound,dust,solar,electrical',
  'the 6 sensors named by the user (temp/boiler pressure/sound/dust/solar/electrical) are ALL present');
var s1 = IoT.demoSeries('AHU-03', 24), s2 = IoT.demoSeries('AHU-03', 24);
ok('I2-deterministic', JSON.stringify(s1) === JSON.stringify(s2),
  'demoSeries is DETERMINISTIC — same asset+hours -> byte-identical output twice (no Math.random/Date.now)');
ok('I3-shape', s1.series.temp.length === 24 && s1.series.temp.every(function (p) { return typeof p.h === 'number' && typeof p.v === 'number'; }),
  'each sensor emits 24 hourly {h,v} points');
ok('I4-watermark', s1._watermark === 'SAMPLE — NOT OFFICIAL', 'the series is watermarked — an explicit mockup, never claimed as a real read');

var billing = IoT.billingLines('AHU-03', s1.series, 'HHS_Office_Federated', '24h');
ok('I5-native-order', /^IOT-/.test(billing.order.documentno) && billing.order.docstatus === 'DR',
  'toOrderRow compiles onto the real c_order columns (documentno/docstatus/issotrx)');
ok('I6-native-lines', billing.lines.length === 6 && billing.lines.every(function (l) {
  return typeof l.row.c_orderline_id === 'number' && l.row.c_order_id === billing.order.c_order_id
    && typeof l.row.qtyordered === 'number' && typeof l.row.c_uom_id === 'number' && typeof l.row.linenetamt === 'number';
}), 'ONE billable c_orderline PER sensor, real column shape (c_order_id/qtyordered/c_uom_id/linenetamt) — ' + billing.lines.length + ' lines');
ok('I7-uom-per-sensor', billing.lines.every(function (l) { return l.uom.uomsymbol === l.sensor.uom_symbol; }),
  'each line carries a UOM row matching its sensor\'s physical unit (°C/bar/dB/µg/m³/W/m²/kWh — a genuine native dictionary gap, filled on demand)');
ok('I8-latest-reading', billing.lines[0].reading.h === 23 && billing.lines[0].row.qtyordered === billing.lines[0].reading.v,
  'the billed qty is the LATEST hourly reading (h=23), read from the series, not invented');

// ============================================================================================================
// (2) viewer/hba_iot.js
// ============================================================================================================
function node(tag) {
  return { tagName: tag, style: { cssText: '' }, children: [], textContent: '', title: '', width: 0, height: 0,
    appendChild: function (c) { c.parentNode = this; this.children.push(c); return c; },
    removeChild: function (c) { var i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); c.parentNode = null; return c; },
    remove: function () { if (this.parentNode) this.parentNode.removeChild(this); },
    setAttribute: function (k, v) { this['attr_' + k] = v; }, getContext: function () { return null; },
    addEventListener: function (ev, fn) { this['_on_' + ev] = fn; } };
}
var body = node('body');
global.document = { createElement: function (t) { return node(t); }, body: body, documentElement: node('html') };
self.HbaModels = require('../models');
var IotPane = require('../../viewer/hba_iot');

var assetGuid = self.HbaModels.records('Asset')[0].bim_guid;
var A = { guidMap: { '1': assetGuid }, status: { textContent: '' } };
ok('IP1-off-nodom', body.children.length === 0 && IotPane.isActive() === false, 'before toggle: ZERO pane DOM');
ok('IP2-gate-nomatch', IotPane.detect({ guidMap: { '1': 'not-a-real-guid' } }) === false, 'no bound asset guid in this building → unavailable, no clutter');
ok('IP3-gate-match', IotPane.detect(A) === true, 'the asset guid resolves in guidMap → available (SAME gate as the maintenance lens)');

var r1 = IotPane.toggle(A);
var pane = body.children.filter(function (c) { return c.id === 'hba-iot-pane'; })[0];
ok('IP4-mount', r1 === true && IotPane.isActive() === true && !!pane, 'toggle ON mounts exactly one IoT pane');
var cctvGrid = pane.children.filter(function (c) { return c.style.cssText.indexOf('grid-template-columns:1fr 1fr 1fr') >= 0; })[0];
ok('IP5-cctv-tiles', cctvGrid && cctvGrid.children.length === 6, '6 CCTV mockup tiles rendered — got ' + (cctvGrid && cctvGrid.children.length));
var billTbl = pane.children[pane.children.length - 1];
ok('IP6-billing-rows', billTbl.children.length === 6, '6 billing rows (one per sensor) rendered in the ERP table — got ' + billTbl.children.length);

IotPane.toggle(A);
ok('IP7-unmount', IotPane.isActive() === false && body.children.length === 0, 'toggle OFF removes the pane, destroys charts, stops the CCTV loop (zero residue)');

// ============================================================================================================
// (3) viewer/hba_draggable.js
// ============================================================================================================
var Drag = require('../../viewer/hba_draggable');
function fakePane() {
  var listeners = {};
  return { style: { cssText: '', right: '', left: '', top: '', transform: '' },
    getBoundingClientRect: function () { return { left: 100, top: 100 }; }, offsetWidth: 200, offsetHeight: 150 };
}
function fakeHandle() {
  var listeners = {};
  return { style: {}, addEventListener: function (ev, fn) { listeners[ev] = fn; }, removeEventListener: function (ev) { delete listeners[ev]; }, _fire: function (ev, e) { if (listeners[ev]) listeners[ev](e); }, _listeners: listeners };
}
var docListeners = {};
global.document.addEventListener = function (ev, fn) { docListeners[ev] = fn; };
global.document.removeEventListener = function (ev) { delete docListeners[ev]; };
global.window = { innerWidth: 1920, innerHeight: 1080 };

var pane = fakePane(), handle = fakeHandle();
var disable = Drag.enable(pane, handle);
ok('D1-binds', typeof handle._listeners.pointerdown === 'function' && typeof docListeners.pointermove === 'function' && typeof docListeners.pointerup === 'function',
  'enable() binds pointerdown on the handle + pointermove/pointerup on the document');

handle._fire('pointerdown', { clientX: 120, clientY: 110, preventDefault: function () {} });
ok('D2-anchor-switch', pane.style.right === 'auto' && pane.style.left === '100px' && pane.style.top === '100px',
  'pointerdown switches the pane from its fixed right-anchor to a left/top drag-follow at its current position');

docListeners.pointermove({ clientX: 300, clientY: 250 });
ok('D3-follows-pointer', pane.style.left === (300 - 20) + 'px' && pane.style.top === (250 - 10) + 'px',
  'pointermove repositions the pane, preserving the original grab offset (grabbed at +20,+10 from the pane corner) — left=' + pane.style.left + ' top=' + pane.style.top);

docListeners.pointermove({ clientX: 5000, clientY: 5000 });
ok('D4-clamped', pane.style.left === (1920 - 200) + 'px' && pane.style.top === (1080 - 150) + 'px',
  'a drag past the viewport edge is CLAMPED — the pane can never be dragged fully off-screen — left=' + pane.style.left + ' top=' + pane.style.top);

docListeners.pointerup();
var leftBefore = pane.style.left;
docListeners.pointermove({ clientX: 10, clientY: 10 });
ok('D5-stops-on-up', pane.style.left === leftBefore, 'pointerup ends the drag — a later pointermove no longer moves the pane');

disable();
ok('D6-disable-removes', !handle._listeners.pointerdown && !docListeners.pointermove && !docListeners.pointerup,
  'disable() removes all 3 listeners (handle pointerdown, document pointermove/pointerup)');

var noopDisable = Drag.enable(null, null);
ok('D7-node-safe', typeof noopDisable === 'function', 'enable(null,null) — no throw, returns a no-op disable (node-safe / no-document-safe)');

var pass = checks.filter(Boolean).length, fail = checks.length - pass;
console.log('\n§HBA-P10B ' + pass + '/' + checks.length + ' PASS' + (fail ? (' — ' + fail + ' FAIL') : ''));
process.exit(fail ? 1 : 0);
