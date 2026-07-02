// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — HR_BIM_ASSET IoT SENSOR MOCKUP (RESUME_HR_BIM_ASSET.md §P10b, user 2026-07-02). EXPLICITLY
//   A MOCKUP — reference cited: the RiverIoT/Federation pattern in IfcOpenShell/Bonsai (design inspiration for
//   the SHAPE of the idea, not a library/data dependency here). No real IoT hardware, no real telemetry: every
//   series is a DETERMINISTIC synthetic signal (fixed baseline+amplitude+offset table, NEVER Math.random/
//   Date.now — reproducible, watermarked CONTOH/SAMPLE, never claimed as a real read). The ERP-link half stays
//   non-invent on the SHAPE: a reading compiles onto the REAL native c_order/c_orderline/c_uom columns
//   (verified build/erp/ad_full.db PRAGMA table_info — see RESUME_HR_BIM_ASSET.md §P10b-CHECK), same
//   "Compile not Model" discipline as ad_tenancy.js. Read the log after run.
'use strict';
var W = (typeof require !== 'undefined') ? require('./watermark') : (typeof self !== 'undefined' ? self : this).HbaWatermark;

// 6 sensors, one mockup monitoring point per bound asset. uom_name/uom_symbol seed a NEW C_UOM row (a genuine
// native dictionary gap — °C/bar/dB/µg/m³/W/m²/kWh don't exist in this repo's ad_full.db c_uom set; same
// on-demand-dictionary-row precedent as ad_tenancy.js's toWarehouseRow/SUBSCRIPTION_TYPES).
var SENSORS = [
  { key: 'temp',       label: 'Temperature',    uom_name: 'Celsius',      uom_symbol: '°C',  baseline: 24,  amplitude: 3,   rate: 0 },
  { key: 'pressure',   label: 'Boiler Pressure', uom_name: 'Bar',         uom_symbol: 'bar',       baseline: 2.4, amplitude: 0.3, rate: 0 },
  { key: 'sound',      label: 'Sound Level',     uom_name: 'Decibel',     uom_symbol: 'dB',        baseline: 42,  amplitude: 8,   rate: 0 },
  { key: 'dust',       label: 'Dust (PM2.5)',    uom_name: 'Microgram/m3', uom_symbol: 'µg/m³', baseline: 18, amplitude: 10, rate: 0.05 },
  { key: 'solar',      label: 'Solar Output',    uom_name: 'Watt/m2',     uom_symbol: 'W/m²', baseline: 300, amplitude: 300, rate: 0 },
  { key: 'electrical', label: 'Electrical Load', uom_name: 'Kilowatt-hour', uom_symbol: 'kWh',     baseline: 12,  amplitude: 5,   rate: 0.02 }
];

// deterministic 24-hourly-point curve: baseline + amplitude*sin (a plausible daily shape, trough near
// midnight/peak near midday) + a tiny FIXED per-hour offset table — NOT Math.random/Date.now, so the same
// input always produces the same output (reproducible, witnessable).
var OFFSET = [0.1, -0.2, 0.3, 0, -0.1, 0.2, -0.3, 0.1, 0.4, -0.2, 0.1, 0, 0.2, -0.1, 0.3, -0.2, 0.1, 0, -0.1, 0.2, 0.1, -0.2, 0.3, 0];
function seriesFor(sensor, hours) {
  hours = hours || 24;
  var pts = [];
  for (var h = 0; h < hours; h++) {
    var phase = (h / 24) * Math.PI * 2 - Math.PI / 2;
    var v = sensor.baseline + sensor.amplitude * Math.sin(phase) + OFFSET[h % OFFSET.length] * sensor.amplitude * 0.1;
    pts.push({ h: h, v: Math.round(v * 100) / 100 });
  }
  return pts;
}

// one 24h series per sensor for a given asset (assetId is a trace label only — the curve shape is per-sensor,
// not per-asset; multiple assets would repeat the SAME deterministic curve, honestly, not fabricate per-asset
// variation there is no data for).
function demoSeries(assetId, hours) {
  var out = {};
  SENSORS.forEach(function (s) { out[s.key] = seriesFor(s, hours); });
  return W.stamp({ asset: assetId, hours: hours || 24, series: out }, 'en');
}

// ---- native C_UOM row — a new dictionary entry for a physical unit this repo's ad_full.db doesn't carry yet
// (verified — see file header). ONE row per sensor kind, created on demand (same precedent as ad_tenancy.js
// toWarehouseRow / SUBSCRIPTION_TYPES).
function toUomRow(sensor, seedId) {
  return { c_uom_id: seedId ? seedId() : 1, name: sensor.uom_name, uomsymbol: sensor.uom_symbol };
}

// ---- native C_Order header — ONE order per building+period grouping the sensor billing lines (mirrors
// ad_tenancy.toWarehouseRow's "one row per building, created since none exists yet for a demo building").
function toOrderRow(buildingName, period, seedId) {
  return { c_order_id: seedId ? seedId() : 1, documentno: 'IOT-' + buildingName + '-' + period, docstatus: 'DR', issotrx: 'Y' };
}

// ---- native C_OrderLine — the reading AT THE LATEST hour, billed as qty(reading) x uom(the sensor's physical
// unit). priceactual is a nominal CONTOH/SAMPLE rate per unit — no sourced tariff exists for a mockup sensor.
function toOrderLineRow(sensor, reading, c_order_id, m_product_id, c_uom_id, line, seedId) {
  var price = 0.5;
  return { c_orderline_id: seedId ? seedId() : 1, c_order_id: c_order_id, line: line, m_product_id: m_product_id,
    c_uom_id: c_uom_id, qtyordered: reading.v, priceactual: price, linenetamt: Math.round(reading.v * price * 100) / 100 };
}

// compile ONE asset's latest readings into a billable order — {order, lines:[{row, sensor, reading, uom}],
// _watermark}. m_product_id per sensor is a SEQUENTIAL demo id — a sensor has no real M_Product row anywhere
// in this repo yet (same honest new-row precedent as the other compile functions, not a catalog lookup).
function billingLines(assetId, series, buildingName, period) {
  var order = toOrderRow(buildingName || 'This Building', period || 'latest');
  var lines = [], line = 0, uomSeq = 0, prodSeq = 0;
  SENSORS.forEach(function (s) {
    var pts = series[s.key] || [];
    var reading = pts[pts.length - 1]; if (!reading) return;
    var uom = toUomRow(s, function () { return ++uomSeq; });
    var m_product_id = ++prodSeq;
    line += 10;
    var row = toOrderLineRow(s, reading, order.c_order_id, m_product_id, uom.c_uom_id, line);
    lines.push({ row: row, sensor: s, reading: reading, uom: uom });
  });
  return W.stamp({ order: order, lines: lines }, 'en');
}

var IoT = { SENSORS: SENSORS, seriesFor: seriesFor, demoSeries: demoSeries, toUomRow: toUomRow,
  toOrderRow: toOrderRow, toOrderLineRow: toOrderLineRow, billingLines: billingLines };
if (typeof module === 'object' && module.exports) module.exports = IoT;
else (typeof self !== 'undefined' ? self : this).HbaIot = IoT;
