// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — HR_BIM_ASSET IoT SENSOR MOCKUP (RESUME_HR_BIM_ASSET.md §P10b, user 2026-07-02). EXPLICITLY
//   A MOCKUP — reference cited: the RiverIoT/Federation pattern in IfcOpenShell/Bonsai (design inspiration for
//   the SHAPE of the idea, not a library/data dependency here). No real IoT hardware, no real telemetry: every
//   series is a DETERMINISTIC synthetic signal (fixed baseline+amplitude+offset table, NEVER Math.random/
//   Date.now — reproducible, watermarked CONTOH/SAMPLE, never claimed as a real read). The ERP-link half stays
//   non-invent on the SHAPE: a reading compiles onto the REAL native c_order/c_orderline/c_uom columns
//   (verified build/erp/ad_full.db PRAGMA table_info — see RESUME_HR_BIM_ASSET.md §P10b-CHECK), same
//   "Compile not Model" discipline as ad_tenancy.js.
//
//   §2026-07-05 (RESUME_HR_BIM_ASSET.md §2026-07-04d §BUILD ORDER) — two follow-on fixes, same non-invent
//   discipline as ad_tenancy.js's §STAGE2:
//   1. **Per-device position** (was: all 6 sensors shared the ONE `models.js Asset` AHU-03 guid — "zoom to the
//      sensor" always landed on the same spot). `DEVICES`/`CAMERAS` below bind EACH sensor/camera to its OWN
//      REAL element guid in `buildings/HHS_Office_Federated_extracted.db` (queried live this session — never a
//      fabricated position): `temp` reuses AHU-03 verbatim (unchanged); `pressure`→the real rooftop "Outdoor
//      AHU" plant unit; `sound`/`dust`→two other real Level-2 supply diffusers (the same IfcFlowTerminal class
//      AHU-03 already used, just distinct instances); `solar`→the real Roof Level sun-shading floor slab;
//      `electrical`→the real Level-1 Main Distribution Panel (MDP-1). `CAMERAS` are 6 real entrance/circulation
//      doors, 2 per storey (Level 1/2/3) — the standard CCTV placement idiom, not a random pick.
//   2. **Product/Order persistence** — `toUomRow`/`toProductRow`/`toOrderRow`/`toOrderLineRow` gain the SAME
//      `_one(erpQuery,...)` match-or-create idiom `ad_tenancy.js` already uses: governed (erpQuery present, a
//      real seeded row matches) → reuse the durable seeded id; ungoverned → the prior deterministic mint,
//      BYTE-IDENTICAL (every existing witness that passes no erpQuery is unaffected).
//   3. **Currency** — `c_currency_id` set to the REAL already-seeded MYR row (301, `scripts/seed_fin_currency.js`)
//      — a sensor's a local-site utility/security cost, MYR is the natural billing currency. USD equivalent is
//      read from the SAME already-seeded `C_Conversion_Rate` (301→100), never a second invented rate; absent
//      erpQuery → usd stays null (honest, no rate to convert with).
//
//   §2026-07-05b (§P10c, user: "just simple tones but goes high pitch indicating danger") — `toneFreqFor` is
//   the PURE, deterministic sonification mapping: a sensor's CURRENT reading position within its OWN observed
//   min/max range (the exact bounds `viewer/hba_iot.js`'s bar already computes for its headroom — never a
//   fabricated "danger threshold") maps to a pitch between TONE_BASE_HZ (calm/low) and TONE_DANGER_HZ (the
//   extreme end of the sensor's own range = "danger", high-pitched). The actual Web Audio playback lives in
//   viewer/hba_iot.js (DOM/browser-only); this stays pure so it is node-witnessable without an AudioContext.
//   Read the log after run.
'use strict';
var W = (typeof require !== 'undefined') ? require('./watermark') : (typeof self !== 'undefined' ? self : this).HbaWatermark;

// §STAGE2 idiom (ad_tenancy.js) — MATCH-OR-CREATE against the REAL seeded AD rows when erpQuery is present;
// absent/no-match → the deterministic mint. `_one` never throws (a missing table/bad db degrades honestly).
function _one(erpQuery, sql, params) {
  if (typeof erpQuery !== 'function') return null;
  try { var r = erpQuery(sql, params || []); return (r && r.length) ? r[0] : null; } catch (e) { return null; }
}
function _num(v) { return (v == null) ? v : Number(v); }

// one real bound element per sensor (guid/ifc_class/storey verified live against
// buildings/HHS_Office_Federated_extracted.db, 2026-07-05 — see file header point 1). `temp` is the pre-existing
// AHU-03 binding (models.js Asset), kept identical so every pre-existing witness/flyToZone target is unchanged.
var DEVICES = {
  temp:       { bim_guid: '04i7IlvuLBuOmBXGMxmbgo', element: 'Supply Diffuser (AHU-03)', storey: 'Level 3' },
  pressure:   { bim_guid: '39q4vWPDPE3QeBugdA373d', element: 'Outdoor AHU — rooftop mechanical plant', storey: 'Roof Level' },
  sound:      { bim_guid: '07A8OFMrj5IeMQd6aflvMZ', element: 'Supply Diffuser (Level 2)', storey: 'Level 2' },
  dust:       { bim_guid: '0B2Nysi4bEIBgg6BXJzBCa', element: 'Supply Diffuser (Level 2)', storey: 'Level 2' },
  solar:      { bim_guid: '3XrBtx9eX7mQE6EqWHPey$', element: 'Roof sun-shading floor', storey: 'Roof Level' },
  electrical: { bim_guid: '1Atj4lkpv3qwTaPKeAZIaj', element: 'Main Distribution Panel MDP-1', storey: 'Level 1' },
  movement:   { bim_guid: '3XrBtx9eX7mQE6EqWHPfzR', element: 'Entrance door (motion/PIR)', storey: 'Level 1' }
};
// 6 real entrance/circulation doors, 2 per storey — CCTV placement idiom, not a random pick.
// §2026-07-06 `facing` — declared via maths (structural-centroid direction heuristic), NOT an extracted fact:
// `rotation_x/y/z` is uniformly (0,0,0) across all 6830 elements in this extraction, so a real facing direction
// can never be read off the data directly (RESUME_HR_BIM_ASSET.md §2026-07-06). The facing AXIS comes from each
// door's own bbox (one unambiguously-thin dimension = the wall-normal); the SIGN comes from computing, per
// storey, the mean (x,y) of every real IfcWallStandardCase/IfcWall/IfcSlab/IfcColumn/IfcCurtainWall element on
// that floor (the building's actual structural/enclosure mass — hundreds of elements, not the ~14 sparse
// IfcSpace rooms an earlier attempt tried and found inconclusive) and picking the side of the door's thin-axis
// that mass sits on — a door should face INTO the building it serves, not out into the void. Every door's
// answer was unambiguous (centroid 19.7-47.2m to one clear side); the two same-(x,y) door pairs at different
// floors (doors 3&5) gave identical answers, an internal-consistency check this heuristic passes.
var CAMERAS = [
  { bim_guid: '0LmR_Oafz6LvpHnBLJOGi$', element: 'Entrance door', storey: 'Level 1', facing: [0, -1, 0] },
  { bim_guid: '1UDlgEuSLAZ9OyOKOB0RyW', element: 'Entrance door', storey: 'Level 1', facing: [1, 0, 0] },
  { bim_guid: '0Z1xu3E5b8zPJTx3GNZg8Y', element: 'Corridor door', storey: 'Level 2', facing: [0, -1, 0] },
  { bim_guid: '0lKZdaAjTCjBh_cVCMRZrh', element: 'Corridor door', storey: 'Level 2', facing: [0, 1, 0] },
  { bim_guid: '0TgQK$gCn8wu43pHf2VHup', element: 'Corridor door', storey: 'Level 3', facing: [0, -1, 0] },
  { bim_guid: '1Jil894uX328zr$s_sQLvj', element: 'Corridor door', storey: 'Level 3', facing: [0, 1, 0] }
];

// §2026-07-05d (user: "ready utils that talk or connects between them") — a TRIVIAL connector: every DEVICES/
// CAMERAS entry already carries a real `storey`, so "which camera(s) cover this sensor's floor" is a plain
// filter over data already present — no new geometry/distance work, no invented "coverage radius". Devs can
// call `camerasNearDevice(key)` to go from an alarming sensor straight to the camera(s) that can see its floor.
function camerasOnStorey(storey) {
  return CAMERAS.filter(function (c) { return c.storey === storey; });
}
function camerasNearDevice(deviceKey) {
  var d = DEVICES[deviceKey];
  return d ? camerasOnStorey(d.storey) : [];
}

// MYR 301 / USD 100 / conversion type 114 — the REAL rows scripts/seed_fin_currency.js already seeded
// (verified erp/ad_seed.db, 2026-07-05); never a second invented rate.
var MYR_CURRENCY_ID = 301, USD_CURRENCY_ID = 100;
function usdRate(erpQuery) {
  var hit = _one(erpQuery, "SELECT multiplyrate AS r FROM C_Conversion_Rate WHERE c_currency_id=? AND c_currency_id_to=? AND isactive='Y'", [MYR_CURRENCY_ID, USD_CURRENCY_ID]);
  return hit ? Number(hit.r) : null;
}

// 7 sensors, one mockup monitoring point per bound asset. uom_name/uom_symbol seed a NEW C_UOM row (a genuine
// native dictionary gap — °C/bar/dB/µg/m³/W/m²/kWh/% don't exist in this repo's ad_full.db c_uom set; same
// on-demand-dictionary-row precedent as ad_tenancy.js's toWarehouseRow/SUBSCRIPTION_TYPES). `icon` (§2026-07-05d,
// user: "using their icons") is a plain-text emoji glyph — purely a UI/docs label, never read by any compile
// function; reused verbatim by viewer/hba_iot.js's bar labels AND docs/HRBIMAssetGuide.md so the running app and
// the guide show the SAME identifier per sensor.
var SENSORS = [
  { key: 'temp',       label: 'Temperature',    icon: '🌡️', uom_name: 'Celsius',      uom_symbol: '°C',  baseline: 24,  amplitude: 3,   rate: 0 },
  { key: 'pressure',   label: 'Boiler Pressure', icon: '🔧', uom_name: 'Bar',         uom_symbol: 'bar',       baseline: 2.4, amplitude: 0.3, rate: 0 },
  { key: 'sound',      label: 'Sound Level',     icon: '🔊', uom_name: 'Decibel',     uom_symbol: 'dB',        baseline: 42,  amplitude: 8,   rate: 0 },
  { key: 'dust',       label: 'Dust (PM2.5)',    icon: '🌫️', uom_name: 'Microgram/m3', uom_symbol: 'µg/m³', baseline: 18, amplitude: 10, rate: 0.05 },
  { key: 'solar',      label: 'Solar Output',    icon: '☀️', uom_name: 'Watt/m2',     uom_symbol: 'W/m²', baseline: 300, amplitude: 300, rate: 0 },
  { key: 'electrical', label: 'Electrical Load', icon: '⚡', uom_name: 'Kilowatt-hour', uom_symbol: 'kWh',     baseline: 12,  amplitude: 5,   rate: 0.02 },
  // §2026-07-05c (user: "there can also be a sensor for movement") — a 7th, PIR/motion-style security sensor.
  // Reuses the SAME deterministic sine generator, no special-casing: baseline+amplitude puts it near-zero at
  // night and peaking at midday — a genuinely plausible real motion-level pattern for an occupied office
  // building, not a fabricated waveform shape.
  { key: 'movement',   label: 'Motion (PIR)',    icon: '🚶', uom_name: 'Motion Level', uom_symbol: '%',  baseline: 15,  amplitude: 15,  rate: 0 }
];
var CAMERA_ICON = '📷';

// deterministic 24-hourly-point curve: baseline + amplitude*sin (a plausible daily shape, trough near
// midnight/peak near midday) + a tiny FIXED per-hour offset table — NOT Math.random/Date.now, so the same
// input always produces the same output (reproducible, witnessable).
var OFFSET = [0.1, -0.2, 0.3, 0, -0.1, 0.2, -0.3, 0.1, 0.4, -0.2, 0.1, 0, 0.2, -0.1, 0.3, -0.2, 0.1, 0, -0.1, 0.2, 0.1, -0.2, 0.3, 0];
// §FIX 2026-07-06c item C (user: bars still "grow long/short in lockstep" even after PR #671's jitter — root
// cause was every sensor sharing the literal SAME sine phase, so all 7 peak/trough at the identical hour; the
// small jitter on top wasn't enough to hide that). A FIXED (never random) per-sensor hour-offset shifts each
// sensor's peak to a different time of day — a genuinely independent-looking real-world sensor shape — while
// keeping the exact same deterministic sine+jitter machinery untouched.
var PHASE_OFFSET_HOURS = { temp: 0, pressure: -3, sound: 5, dust: 2, solar: -6, electrical: 4, movement: -2 };
function seriesFor(sensor, hours) {
  hours = hours || 24;
  var pts = [];
  var offsetH = PHASE_OFFSET_HOURS[sensor.key] || 0;
  for (var h = 0; h < hours; h++) {
    var phase = ((h - offsetH) / 24) * Math.PI * 2 - Math.PI / 2;
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
// (verified — see file header). §STAGE2 — match-or-create by Name; else mint (same precedent as ad_tenancy.js
// toWarehouseRow / SUBSCRIPTION_TYPES).
function toUomRow(sensor, seedId, erpQuery) {
  var hit = _one(erpQuery, 'SELECT C_UOM_ID AS id FROM C_UOM WHERE Name=?', [sensor.uom_name]);
  if (hit) return { c_uom_id: _num(hit.id), name: sensor.uom_name, uomsymbol: sensor.uom_symbol };
  return { c_uom_id: seedId ? seedId() : 1, name: sensor.uom_name, uomsymbol: sensor.uom_symbol };
}

// ---- native C_Order header — ONE order per building+period grouping the sensor billing lines (mirrors
// ad_tenancy.toWarehouseRow's "one row per building, created since none exists yet for a demo building").
// §STAGE2 — match-or-create by DocumentNo (deterministic per building+period, so a re-run resolves the SAME order).
function toOrderRow(buildingName, period, seedId, erpQuery) {
  var documentno = 'IOT-' + buildingName + '-' + period;
  var hit = _one(erpQuery, 'SELECT C_Order_ID AS id FROM C_Order WHERE DocumentNo=?', [documentno]);
  if (hit) return { c_order_id: _num(hit.id), documentno: documentno, docstatus: 'DR', issotrx: 'Y' };
  return { c_order_id: seedId ? seedId() : 1, documentno: documentno, docstatus: 'DR', issotrx: 'Y' };
}

// ---- native M_Product row — ONE per device (sensor or camera), Value=a stable device id (matches
// models.js Asset.iot_device's own naming, e.g. 'IOT-TEMP-HHS') so the SAME device always resolves to the SAME
// product. §STAGE2 — match-or-create by Value; else mint. m_locator_id stays honestly null — this building's
// rel_contained_in_space table (queried live, 2026-07-05) does not cover these specific elements, so there is no
// real per-room containment fact to attach (never fabricate one), unlike ad_tenancy.js's room Products.
function toProductRow(deviceKey, label, seedId, erpQuery) {
  var value = 'IOT-' + deviceKey.toUpperCase() + '-HHS';
  var hit = _one(erpQuery, 'SELECT M_Product_ID AS id, Name AS name FROM M_Product WHERE Value=?', [value]);
  if (hit) return { m_product_id: _num(hit.id), value: value, name: hit.name || label, m_locator_id: null };
  return { m_product_id: seedId ? seedId() : 1, value: value, name: label, m_locator_id: null };
}

// ---- native C_OrderLine — the reading AT THE LATEST hour, billed as qty(reading) x uom(the sensor's physical
// unit). priceactual is a nominal CONTOH/SAMPLE rate per unit — no sourced tariff exists for a mockup sensor.
// c_currency_id = the REAL already-seeded MYR row (301) — a site utility/security cost bills in the local
// currency (see file header point 3).
function toOrderLineRow(sensor, reading, c_order_id, m_product_id, c_uom_id, line, seedId) {
  var price = 0.5;
  var linenetamt = Math.round(reading.v * price * 100) / 100;
  return { c_orderline_id: seedId ? seedId() : 1, c_order_id: c_order_id, line: line, m_product_id: m_product_id,
    c_uom_id: c_uom_id, qtyordered: reading.v, priceactual: price, linenetamt: linenetamt, c_currency_id: MYR_CURRENCY_ID };
}

// compile ONE asset's latest readings into a billable order — {order, lines:[{row, sensor, reading, uom, usd}],
// cameras:[{row, camera}], _watermark}. opts.erpQuery (optional, §STAGE2) governs every compile function above —
// absent → the prior deterministic mint, byte-identical to every existing (no-erpQuery) witness/caller.
// `usd` per line is the REAL seeded MYR→USD C_Conversion_Rate applied to linenetamt — null when ungoverned
// (no rate to convert with, never a fabricated one). Cameras get a M_Product row too (no billing line — a
// camera has no metered "reading" to charge for), per §BUILD ORDER point "cameras...compile as real M_Product".
function billingLines(assetId, series, buildingName, period, opts) {
  opts = opts || {};
  var erpQuery = opts.erpQuery;
  var order = toOrderRow(buildingName || 'This Building', period || 'latest', null, erpQuery);
  var rate = usdRate(erpQuery);
  var lines = [], line = 0, uomSeq = 0, prodSeq = 0;
  SENSORS.forEach(function (s) {
    var pts = series[s.key] || [];
    var reading = pts[pts.length - 1]; if (!reading) return;
    var uom = toUomRow(s, function () { return ++uomSeq; }, erpQuery);
    var device = DEVICES[s.key];
    var prod = toProductRow(s.key, s.label + ' (' + (device ? device.element : assetId) + ')', function () { return ++prodSeq; }, erpQuery);
    line += 10;
    var row = toOrderLineRow(s, reading, order.c_order_id, prod.m_product_id, uom.c_uom_id, line, function () { return line; });
    var usd = (rate != null) ? Math.round(row.linenetamt * rate * 100) / 100 : null;
    lines.push({ row: row, sensor: s, reading: reading, uom: uom, product: prod, usd: usd });
  });
  var cameras = CAMERAS.map(function (c, i) {
    var prod = toProductRow('cam' + (i + 1), 'CCTV Camera ' + (i + 1) + ' (' + c.element + ', ' + c.storey + ')',
      function () { return ++prodSeq; }, erpQuery);
    return { row: prod, camera: c };
  });
  return W.stamp({ order: order, lines: lines, cameras: cameras, _governed: !!erpQuery }, 'en');
}

// §2026-07-05b — pitch = the reading's position within [min,max] (its own observed range), never a fabricated
// threshold. min===max (degenerate) → mid-range tone, not a divide-by-zero.
var TONE_BASE_HZ = 220, TONE_DANGER_HZ = 880;
function toneFreqFor(value, min, max) {
  var span = max - min;
  var norm = span ? Math.max(0, Math.min(1, (value - min) / span)) : 0.5;
  return Math.round(TONE_BASE_HZ + norm * (TONE_DANGER_HZ - TONE_BASE_HZ));
}

// §FIX 2026-07-06 (user: "the IoT bars animation is not realistic — too linear. Make them cycle around near
// actual values, with a red bar when they exceed" — citing the RiverIoT/Federation panel in IfcOpenShell/Bonsai
// as the SHAPE reference: equipment_operators.py's draw_callback_px splits each bar at a `threshold_max`,
// falling back to an honest data-derived default (`max(day_values)*0.9`) when no real declared limit exists,
// and colours the portion above it differently). Same shape here, same non-invent discipline:
//
// - `dangerThresholdFor` — an HONEST MOCKUP default (baseline + amplitude*1.15, i.e. just past the sensor's own
//   normal daily peak) since no sourced regulatory/manufacturer limit exists for these demo sensors — never a
//   silently-fabricated "safety limit". Pure + deterministic, same convention as toneFreqFor.
// - `jitterFor` — a small, FIXED (never Math.random/Date.now) wiggle added on top of the smooth hourly sine
//   curve, so consecutive displayed ticks vary a little instead of sweeping in one perfectly monotonic line —
//   "cycle around near actual values". Bounded to ±12% of the sensor's own amplitude.
// - `isDanger` — true when a (possibly jittered) reading exceeds dangerThresholdFor — the bar-colour decision,
//   kept pure so it's node-witnessable without a DOM.
var DANGER_THRESHOLD_FACTOR = 1.15;
function dangerThresholdFor(sensor) {
  return Math.round((sensor.baseline + sensor.amplitude * DANGER_THRESHOLD_FACTOR) * 100) / 100;
}
var JITTER_TABLE = [0.6, -0.4, 0.9, -0.8, 0.3, -0.6, 0.7, -0.9, 0.2, -0.3, 0.5, -0.7];
function jitterFor(sensor, hourIdx, tickCounter) {
  var idx = ((hourIdx || 0) * 3 + (tickCounter || 0)) % JITTER_TABLE.length;
  return Math.round(JITTER_TABLE[idx] * sensor.amplitude * 0.12 * 100) / 100;
}
function isDanger(sensor, value) {
  return value > dangerThresholdFor(sensor);
}

var IoT = { SENSORS: SENSORS, DEVICES: DEVICES, CAMERAS: CAMERAS, CAMERA_ICON: CAMERA_ICON,
  MYR_CURRENCY_ID: MYR_CURRENCY_ID, USD_CURRENCY_ID: USD_CURRENCY_ID, TONE_BASE_HZ: TONE_BASE_HZ,
  TONE_DANGER_HZ: TONE_DANGER_HZ, seriesFor: seriesFor, demoSeries: demoSeries, toUomRow: toUomRow,
  toneFreqFor: toneFreqFor, camerasOnStorey: camerasOnStorey, camerasNearDevice: camerasNearDevice,
  toOrderRow: toOrderRow, toProductRow: toProductRow, toOrderLineRow: toOrderLineRow, usdRate: usdRate,
  billingLines: billingLines, dangerThresholdFor: dangerThresholdFor, jitterFor: jitterFor, isDanger: isDanger };
if (typeof module === 'object' && module.exports) module.exports = IoT;
else (typeof self !== 'undefined' ? self : this).HbaIot = IoT;
