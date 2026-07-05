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

ok('I1-catalog', IoT.SENSORS.length === 7 && IoT.SENSORS.map(function (s) { return s.key; }).join(',') === 'temp,pressure,sound,dust,solar,electrical,movement',
  'the 6 sensors named by the user (temp/boiler pressure/sound/dust/solar/electrical) + movement/PIR (§2026-07-05c) are ALL present');
var s1 = IoT.demoSeries('AHU-03', 24), s2 = IoT.demoSeries('AHU-03', 24);
ok('I2-deterministic', JSON.stringify(s1) === JSON.stringify(s2),
  'demoSeries is DETERMINISTIC — same asset+hours -> byte-identical output twice (no Math.random/Date.now)');
ok('I3-shape', s1.series.temp.length === 24 && s1.series.temp.every(function (p) { return typeof p.h === 'number' && typeof p.v === 'number'; }),
  'each sensor emits 24 hourly {h,v} points');
ok('I4-watermark', s1._watermark === 'SAMPLE — NOT OFFICIAL', 'the series is watermarked — an explicit mockup, never claimed as a real read');

var billing = IoT.billingLines('AHU-03', s1.series, 'HHS_Office_Federated', '24h');
ok('I5-native-order', /^IOT-/.test(billing.order.documentno) && billing.order.docstatus === 'DR',
  'toOrderRow compiles onto the real c_order columns (documentno/docstatus/issotrx)');
ok('I6-native-lines', billing.lines.length === 7 && billing.lines.every(function (l) {
  return typeof l.row.c_orderline_id === 'number' && l.row.c_order_id === billing.order.c_order_id
    && typeof l.row.qtyordered === 'number' && typeof l.row.c_uom_id === 'number' && typeof l.row.linenetamt === 'number';
}), 'ONE billable c_orderline PER sensor, real column shape (c_order_id/qtyordered/c_uom_id/linenetamt) — ' + billing.lines.length + ' lines');
ok('I7-uom-per-sensor', billing.lines.every(function (l) { return l.uom.uomsymbol === l.sensor.uom_symbol; }),
  'each line carries a UOM row matching its sensor\'s physical unit (°C/bar/dB/µg/m³/W/m²/kWh — a genuine native dictionary gap, filled on demand)');
ok('I8-latest-reading', billing.lines[0].reading.h === 23 && billing.lines[0].row.qtyordered === billing.lines[0].reading.v,
  'the billed qty is the LATEST hourly reading (h=23), read from the series, not invented');

// §2026-07-05 (RESUME_HR_BIM_ASSET.md §2026-07-04d §BUILD ORDER) — per-device positions, Product/Order
// persistence (§STAGE2 match-or-create), USD/RM currency.
var devGuids = Object.keys(IoT.DEVICES).map(function (k) { return IoT.DEVICES[k].bim_guid; });
ok('I9-devices-distinct', devGuids.length === 7 && new Set(devGuids).size === 7,
  'DEVICES carries 7 DISTINCT real guids (6 original + movement) — sensors no longer all share the single AHU-03 position');
ok('I9b-temp-unchanged', IoT.DEVICES.temp.bim_guid === require('../models').records('Asset')[0].bim_guid,
  'the temp sensor still binds to the pre-existing models.js Asset AHU-03 guid — byte-identical, not renumbered');
var camGuids = IoT.CAMERAS.map(function (c) { return c.bim_guid; });
ok('I10-cameras-distinct', camGuids.length === 6 && new Set(camGuids).size === 6, 'CAMERAS carries 6 distinct real guids (real HHS doors)');

// governed match-or-create: a stub erpQuery backed by an in-memory row set proves billingLines resolves the
// REAL ids (not the internal ++counter mint) and _governed flips true — same §STAGE2 idiom as ad_tenancy.js.
var stubRows = { uom: {}, product: {}, order: null, rate: 0.25 };
function stubErpQuery(sql, params) {
  if (/FROM C_UOM/.test(sql)) { var u = stubRows.uom[params[0]]; return u ? [{ id: u }] : []; }
  if (/FROM M_Product/.test(sql)) { var p = stubRows.product[params[0]]; return p ? [{ id: p, name: params[0] }] : []; }
  if (/FROM C_Order /.test(sql)) { return stubRows.order != null ? [{ id: stubRows.order }] : []; }
  if (/C_Conversion_Rate/.test(sql)) { return [{ r: stubRows.rate }]; }
  return [];
}
IoT.SENSORS.forEach(function (s, i) { stubRows.uom[s.uom_name] = 9000 + i; stubRows.product['IOT-' + s.key.toUpperCase() + '-HHS'] = 9100 + i; });
stubRows.order = 9200;
var govBilling = IoT.billingLines('AHU-03', s1.series, 'HHS_Office_Federated', '24h', { erpQuery: stubErpQuery });
ok('I11-governed', govBilling._governed === true, 'billingLines() with a matching erpQuery reports _governed:true');
ok('I12-governed-ids', govBilling.order.c_order_id === 9200 && govBilling.lines.every(function (l, i) { return l.row.m_product_id === 9100 + i; }),
  'governed compile resolves the REAL seeded order/product ids from erpQuery, not a fresh internal mint');
ok('I13-usd-rate', govBilling.lines.every(function (l) { return l.usd === Math.round(l.row.linenetamt * 0.25 * 100) / 100; }),
  'usd is the linenetamt converted via the (stub, standing in for the real seeded) MYR→USD rate');
var ungovBilling = IoT.billingLines('AHU-03', s1.series, 'HHS_Office_Federated', '24h');
ok('I14-usd-honest-null', ungovBilling.lines.every(function (l) { return l.usd === null; }),
  'no erpQuery → usd stays null (honest — no rate to convert with, never a fabricated FX)');
ok('I15-cameras-products', govBilling.cameras.length === 6 && govBilling.cameras.every(function (c) { return typeof c.row.m_product_id === 'number'; }),
  'each of the 6 cameras ALSO compiles a real M_Product row (no billing line — no metered reading to charge)');

// §2026-07-05c — toneFreqFor: pure, deterministic pitch-vs-danger mapping (user: "high pitch indicating danger").
ok('I16-tone-low', IoT.toneFreqFor(10, 10, 20) === IoT.TONE_BASE_HZ, 'the reading AT the range floor -> the calm/low base pitch (220Hz)');
ok('I17-tone-high', IoT.toneFreqFor(20, 10, 20) === IoT.TONE_DANGER_HZ, 'the reading AT the range ceiling -> the high/danger pitch (880Hz)');
ok('I18-tone-mid', IoT.toneFreqFor(15, 10, 20) === Math.round((IoT.TONE_BASE_HZ + IoT.TONE_DANGER_HZ) / 2), 'a mid-range reading -> a mid pitch');
ok('I19-tone-degenerate', IoT.toneFreqFor(5, 5, 5) === Math.round((IoT.TONE_BASE_HZ + IoT.TONE_DANGER_HZ) / 2), 'min===max (degenerate range) -> mid-range tone, no divide-by-zero');

// §FIX 2026-07-06 (user: "the IoT bars animation is not realistic — too linear. Make them cycle around near
// actual values, with a red bar when they exceed") — dangerThresholdFor/jitterFor/isDanger, pure + deterministic,
// same node-witnessable convention as toneFreqFor above.
IoT.SENSORS.forEach(function (s) {
  ok('I21-threshold-past-peak-' + s.key, IoT.dangerThresholdFor(s) > s.baseline + s.amplitude,
    s.key + '\'s danger threshold sits PAST the sensor\'s own normal daily peak (baseline+amplitude) — an honest "just past normal", never a value the base curve alone would ever cross');
});
var jA = IoT.jitterFor(IoT.SENSORS[0], 3, 1), jB = IoT.jitterFor(IoT.SENSORS[0], 3, 1);
ok('I22-jitter-deterministic', jA === jB, 'jitterFor(sensor, hourIdx, tickCounter) is DETERMINISTIC — same inputs -> byte-identical output twice (no Math.random/Date.now)');
ok('I23-jitter-bounded', IoT.SENSORS.every(function (s) {
  for (var h = 0; h < 24; h++) for (var t = 0; t < 4; t++) if (Math.abs(IoT.jitterFor(s, h, t)) > s.amplitude * 0.12 + 1e-9) return false;
  return true;
}), 'jitterFor never exceeds ±12% of the sensor\'s OWN amplitude — a wiggle, not a fabricated spike');
ok('I24-jitter-varies', new Set([0, 1, 2, 3, 4, 5].map(function (t) { return IoT.jitterFor(IoT.SENSORS[0], 5, t); })).size > 1,
  'jitterFor actually varies across ticks (not a constant offset masquerading as "jitter")');
ok('I25-danger-below', IoT.isDanger(IoT.SENSORS[0], IoT.SENSORS[0].baseline) === false, 'a normal-range reading (at baseline) is NOT flagged danger');
ok('I26-danger-above', IoT.isDanger(IoT.SENSORS[0], IoT.dangerThresholdFor(IoT.SENSORS[0]) + 1) === true, 'a reading past the threshold IS flagged danger');

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

// §2026-07-05 — stub HBALens (recording calls) so the per-device fly/orange-tint wiring (locateAndHighlight)
// is witnessable without a real THREE/camera, same convention as flyToZone's own {flew,guid,center} return.
var flyCalls = [], flyOptsLog = [], tintCalls = [], restoreCount = 0, povCalls = [];
self.HBALens = {
  flyToZone: function (Aarg, guid, opts) { flyCalls.push(guid); flyOptsLog.push(opts); },
  flyToPOV: function (Aarg, fromGuid, atGuid, opts) { povCalls.push({ from: fromGuid, at: atGuid, opts: opts }); },
  buildMeshPort: function () { return { setTint: function (guid, color) { tintCalls.push({ guid: guid, color: color }); }, restoreAll: function () { restoreCount++; } }; },
  erpLink: function (w, r) { return '#w=' + w + '&r=' + r; }, AD_WINDOWS: { ORDER: 143 }
};

var r1 = IotPane.toggle(A);
var pane = body.children.filter(function (c) { return c.id === 'hba-iot-pane'; })[0];
ok('IP4-mount', r1 === true && IotPane.isActive() === true && !!pane, 'toggle ON mounts exactly one IoT pane');
var barsWrap = pane.children[2];
var cctvGrid = pane.children.filter(function (c) { return c.style.cssText.indexOf('grid-template-columns:1fr 1fr 1fr') >= 0; })[0];
ok('IP5-cctv-tiles', cctvGrid && cctvGrid.children.length === 6, '6 CCTV mockup tiles rendered — got ' + (cctvGrid && cctvGrid.children.length));
var billTbl = pane.children[pane.children.length - 1];
ok('IP6-billing-rows', billTbl.children.length === 7, '7 billing rows (one per sensor, incl. movement) rendered in the ERP table — got ' + billTbl.children.length);

// per-device fly target — clicking the "pressure" bar (index 1) must fly to ITS OWN guid, NOT the shared AHU-03
// asset guid every bar used to fly to (the bug §BUILD ORDER point 2 fixed).
barsWrap.children[1]._on_click();
ok('IP7-per-device-fly', flyCalls[0] === self.HbaIot.DEVICES.pressure.bim_guid && flyCalls[0] !== assetGuid,
  'clicking the pressure bar flies to its OWN real guid, distinct from the shared AHU-03 asset guid');
ok('IP8-orange-tint', tintCalls[0] && tintCalls[0].color === 0xff8800 && tintCalls[0].guid === flyCalls[0],
  'the click also holds a distinct 0xff8800 ORANGE tint on the same guid (not flyToZone\'s own 0xffcc00 arrival pulse)');

// CCTV tile click — tile 3 (0-indexed 2) must fly to CAMERAS[2]'s own guid, distinct per tile.
cctvGrid.children[2]._on_click();
ok('IP9-cctv-fly', flyCalls[1] === self.HbaIot.CAMERAS[2].bim_guid, 'clicking CCTV tile 3 locates its OWN real camera guid (CAMERAS[2]), not a shared position');

// RM/USD display — ungoverned (no A.erpQuery) mount shows RM only; a governed remount (A.erpQuery present) also
// shows the ≈USD sub-line.
var rmRow = billTbl.children[0];
var amtTd = rmRow.children[2];
ok('IP10-rm-shown', amtTd.textContent.indexOf('RM ') === 0, 'the billing amount is labelled RM (the real seeded MYR currency), not a bare number — got "' + amtTd.textContent + '"');
ok('IP11-usd-honest-absent', amtTd.children.length === 0, 'ungoverned (no erpQuery): no ≈USD sub-line — honest, no rate to convert with');

IotPane.toggle(A);   // unmount
A.erpQuery = stubErpQuery;
IotPane.toggle(A);   // remount, governed
var pane2 = body.children.filter(function (c) { return c.id === 'hba-iot-pane'; })[0];
var billTbl2 = pane2.children[pane2.children.length - 1];
var amtTd2 = billTbl2.children[0].children[2];
ok('IP12-usd-governed', amtTd2.children.length === 1 && amtTd2.children[0].textContent.indexOf('≈ USD') === 0,
  'governed (A.erpQuery present, a real conversion rate resolves): the ≈USD sub-line renders — got "' + (amtTd2.children[0] && amtTd2.children[0].textContent) + '"');

IotPane.toggle(A);
ok('IP13-unmount', IotPane.isActive() === false && body.children.length === 0, 'toggle OFF removes the pane, destroys charts, stops the CCTV loop (zero residue)');

// §2026-07-05c — zoom distance (locateAndHighlight passes {dist:18} to flyToZone, wider than the shared
// default of 8, per user: "zooms to the device, not too near, surrounding") + per-sensor siren audio, OFF by
// default, ON only after the mute button is clicked (the required user-gesture to start an AudioContext).
var flyOpts = null;
self.HBALens.flyToZone = function (Aarg, guid, opts) { flyCalls.push(guid); flyOptsLog.push(opts); flyOpts = opts; };
function FakeAudioNode() { this.frequency = { setValueAtTime: function () {}, exponentialRampToValueAtTime: function () {} };
  this.gain = { setValueAtTime: function () {}, exponentialRampToValueAtTime: function () {} }; this.type = null; }
FakeAudioNode.prototype.connect = function () {}; FakeAudioNode.prototype.start = function () {}; FakeAudioNode.prototype.stop = function () {};
var oscLog = [];
function FakeAudioContext() { this.currentTime = 0; this.state = 'running'; this.destination = {}; }
FakeAudioContext.prototype.createOscillator = function () { var o = new FakeAudioNode(); oscLog.push(o); return o; };
FakeAudioContext.prototype.createGain = function () { return new FakeAudioNode(); };
FakeAudioContext.prototype.resume = function () {};
global.AudioContext = FakeAudioContext;
var capturedTick = null;
global.setInterval = function (fn) { capturedTick = fn; return 999; };
global.clearInterval = function () {};

IotPane.toggle(A);   // mount — captures the tick callback, does NOT invoke it yet
var pane3 = body.children.filter(function (c) { return c.id === 'hba-iot-pane'; })[0];
var barsWrap3 = pane3.children[2];
barsWrap3.children[1]._on_click();   // pressure bar, same as IP7
ok('IP14-zoom-dist', flyOpts && flyOpts.dist === 18 && flyOpts.dist > 8, 'clicking a device passes a WIDER zoom distance (18) than flyToZone\'s shared default (8) — "not too near", surrounding stays visible');

ok('IP15-audio-off-default', capturedTick && (capturedTick(), oscLog.length === 0), 'a bar tick with audio OFF (default) plays ZERO tones — opt-in, zero-impact by default');

var muteBtn = pane3.children[0].children[1];   // head: [title, mute, close]
muteBtn._on_click();
capturedTick();
var expectBlips = self.HbaIot.SENSORS.reduce(function (n, s) { return n + (({ temp: 1, pressure: 1, sound: 1, dust: 1, solar: 2, electrical: 2, movement: 3 })[s.key] || 1); }, 0);
ok('IP16-audio-on-plays', oscLog.length === expectBlips, 'once muted->on, a tick plays the expected total blip count across all 7 sensors (1+1+1+1+2+2+3=' + expectBlips + ') — got ' + oscLog.length);
ok('IP17-distinct-waveforms', new Set(oscLog.map(function (o) { return o.type; })).size >= 3, 'multiple DISTINCT waveforms are used across sensors — "identify by the sound right away", not one uniform beep — got types ' + JSON.stringify(oscLog.map(function (o) { return o.type; })));

// §2026-07-05d — icons: every bar label leads with its sensor's icon (the SAME glyph the docs guide reuses).
ok('IP18-bar-icons', bars_ok(), 'every bar row label leads with the sensor\'s icon (7 sensors, incl. 🚶 movement)');
function bars_ok() {
  return barsWrap3.children.length === 7 && Array.prototype.every.call(barsWrap3.children, function (row, i) {
    var icon = self.HbaIot.SENSORS[i].icon;
    return row.children[0].textContent.indexOf(icon) === 0;
  });
}

// §2026-07-05d — "ready utils that talk or connects between them": clicking 'electrical' (bound to the real
// Level-1 MDP-1 panel) must ring the CCTV tile(s) ALSO on Level 1 (iot.js camerasNearDevice), and leave the
// Level-2/3 tiles untouched — the connector is storey-scoped, not "ring everything".
ok('I20-cameras-near-device', self.HbaIot.camerasNearDevice('electrical').length === 2
  && self.HbaIot.camerasNearDevice('electrical').every(function (c) { return c.storey === 'Level 1'; })
  && self.HbaIot.camerasNearDevice('pressure').length === 0,
  'camerasNearDevice: electrical(Level 1) -> 2 real Level-1 cameras; pressure(Roof Level) -> 0 (honest, no camera up there) — a plain storey filter, no invented coverage radius');

var cctvGrid3 = pane3.children[4];
barsWrap3.children[5]._on_click();   // electrical bar (index 5) — Level 1, same floor as CAMERAS[0]/[1]
ok('IP19-connect-flash', cctvGrid3.children[0].style.boxShadow.indexOf('ff8800') >= 0 && cctvGrid3.children[1].style.boxShadow.indexOf('ff8800') >= 0
  && !cctvGrid3.children[2].style.boxShadow && !cctvGrid3.children[4].style.boxShadow,
  'clicking a Level-1 sensor rings ONLY the Level-1 CCTV tiles (0,1), leaving Level-2/3 tiles (2,4) untouched — the two stubs genuinely "talk" via a real shared fact (storey), not just a coincidence');

// §FIX 2026-07-06 (user: "when a sensor is pressed, scene zooms to the sensor... pressing the sensor again,
// scene zoom to the nearest cam POV that has the sensor in sight, or best effort") — a per-sensor 2-state
// toggle. The 'electrical' bar was ALREADY clicked once above (IP19, the "device view" state) — clicking it
// AGAIN must swap to flyToPOV(nearestCamera, device) instead of a 2nd locateAndHighlight; a 3rd click reverts.
var flyCallsBeforePov = flyCalls.length;
barsWrap3.children[5]._on_click();   // electrical, 2nd click -> camera POV
ok('IP20-pov-on-2nd-click', povCalls.length === 1 && flyCalls.length === flyCallsBeforePov,
  '2nd click of the SAME sensor calls flyToPOV (not another flyToZone/locateAndHighlight) — povCalls=' + povCalls.length);
ok('IP21-pov-targets', povCalls[0].from === self.HbaIot.CAMERAS[0].bim_guid && povCalls[0].at === self.HbaIot.DEVICES.electrical.bim_guid,
  'flyToPOV stands the camera AT the nearest REAL camera on electrical\'s floor (CAMERAS[0], Level 1) and looks AT the electrical device\'s own guid — got from=' + JSON.stringify(povCalls[0]));
ok('IP22-pov-close-dist', povCalls[0].opts && povCalls[0].opts.dist === 4 && povCalls[0].opts.dist < 18,
  'the POV shot uses the CLOSE camera-distance (4), not the wider sensor establishing shot (18)');
barsWrap3.children[5]._on_click();   // electrical, 3rd click -> back to device view
ok('IP23-toggle-reverts', flyCalls.length === flyCallsBeforePov + 1 && povCalls.length === 1,
  '3rd click reverts to the device establishing shot (flyToZone), not a 2nd POV call — flyCalls=' + flyCalls.length + ' povCalls=' + povCalls.length);

// pressure is Roof Level — camerasNearDevice('pressure') is honestly EMPTY (no camera up there); the 2nd click
// must NEVER invent a camera to stand at — honest fallback to the device shot again, not a crash/no-op-silence.
var povCallsBefore = povCalls.length, flyCallsBefore2 = flyCalls.length;
barsWrap3.children[1]._on_click();   // pressure, 1st click (device view)
barsWrap3.children[1]._on_click();   // pressure, 2nd click — no real camera anywhere near it
ok('IP24-pov-honest-fallback', povCalls.length === povCallsBefore && flyCalls.length === flyCallsBefore2 + 2,
  'a sensor with NO camera on its floor (Roof Level) never fabricates a POV target — both clicks fall back to the honest device shot');

// §FIX 2026-07-06 — CCTV tile click uses the CLOSE camera distance (4), distinct from a sensor's wider shot (18).
var cctvFlyIdx = flyCalls.length;
cctvGrid3.children[0]._on_click();
ok('IP25-cctv-close-dist', flyOptsLog[cctvFlyIdx] && flyOptsLog[cctvFlyIdx].dist === 4,
  'clicking a CCTV tile zooms in CLOSE to the camera device (dist=4), "right to the device position" — got ' + JSON.stringify(flyOptsLog[cctvFlyIdx]));

// §FIX 2026-07-06 — bar realism: the displayed value is the raw stored point PLUS IoT.jitterFor (never the raw
// value verbatim) — computed via the SAME pure function the pane itself calls, so this proves the wiring, not
// just the math (already separately proven pure in I21-I26 above). Two 900ms ticks have already fired by this
// point (IP15's capturedTick() + IP16's mute-then-tick) — hourIdx=2, tickCounter=2 for every bar.
var assetRec = self.HbaModels.records('Asset')[0];
var seriesCheck = self.HbaIot.demoSeries(assetRec.asset, 24);
var tempSensor = self.HbaIot.SENSORS[0];
var expPt = seriesCheck.series[tempSensor.key][2];
var expJitter = self.HbaIot.jitterFor(tempSensor, 2, 2);
var expDisplay = Math.round((expPt.v + expJitter) * 100) / 100;
var tempVal = barsWrap3.children[0].children[1].children[1];
ok('IP26-jitter-applied', expJitter !== 0 && tempVal.textContent.indexOf(String(expDisplay)) === 0 && expDisplay !== expPt.v,
  'the rendered bar shows the JITTERED display value (' + expDisplay + '), not the raw stored point verbatim (' + expPt.v + ') — got "' + tempVal.textContent + '"');

// force IoT.isDanger() to true (same object reference the pane's deps_.IoT reads live) to directly prove the
// red-fill wiring, independent of whether today's demo series happens to cross the mockup threshold on its own.
var realIsDanger = self.HbaIot.isDanger;
self.HbaIot.isDanger = function () { return true; };
IotPane.toggle(A);   // unmount pane3
IotPane.toggle(A);   // remount — captures a FRESH tick callback under the forced-danger stub
var paneD = body.children.filter(function (c) { return c.id === 'hba-iot-pane'; })[0];
var fillD = paneD.children[2].children[0].children[1].children[0];
capturedTick();
ok('IP27-danger-red', fillD.style.background === '#e53935', 'when IoT.isDanger() reports a reading past the threshold, the bar fill turns the DANGER red — got "' + fillD.style.background + '"');
self.HbaIot.isDanger = realIsDanger;

IotPane.toggle(A);   // unmount

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
