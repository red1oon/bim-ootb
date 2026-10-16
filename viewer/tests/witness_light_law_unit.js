#!/usr/bin/env node
// WITNESS — light_law_unit: viewer/light_law.js (§LIGHT_LAW_MODULE) holds the photometric chain's formulas and values.
// Spec: bim-compiler prompts/PHOTOREAL_STILL_RENDER.md §LIGHT_ONE_SCALE -> §LIGHT_LAW_MODULE — SPEC, witness part (1).
//
// ISSUE THIS PROVES OR DISPROVES: the refactor that moved the §METER_EV / §SOURCED_LIGHT_CALIB / cove / scene-source values
// out of sourced_light.js, effects.js and scene.js into one module could silently change a number (a different operation
// order changes the last bit of an exposure; a mistyped constant changes a still). This witness asserts
// (a) the formulas against hand-computed values, (b) BIT-identity against the pre-refactor inline expressions
// (fix/lamp-truth @c539f129, sourced_light.js meter()/enApply/luxRows) over a sweep of inputs, (c) the law constants equal the
// literals they replaced, (d) snapshot().lawHash is stable across calls, independent of the live state, and sensitive to a
// changed law value (so a film frame can assert it used the same law as the still).
// It does NOT prove the browser path is unchanged — that is witness part (2), the GPU §-line diff (spec).
// Prints INCONCLUSIVE (never PASS) when light_law.js cannot be loaded.
//
// Command: node viewer/tests/witness_light_law_unit.js
'use strict';
const path = require('path');

let LL = null;
try { LL = require(path.join(__dirname, '..', 'light_law.js')); } catch (e) { LL = null; }
if (!LL || !LL.ev100 || !LL.snapshot) {
  console.log('§WITNESS_LIGHT_LAW_UNIT INCONCLUSIVE light_law.js not loaded (' + path.join(__dirname, '..', 'light_law.js') + ') — nothing judged');
  process.exitCode = 2;
  return;
}
const { Witness } = require('../../witness_kit/contract');

const rows = [];
function row(name, got, want, ok) { rows.push({ name, got: String(got), want: String(want), ok: !!ok }); }
function near(a, b, tol) { return Math.abs(a - b) <= tol; }

// (a) hand-computed values (100 klx sun at the scene sun 4.4; L 1000 cd/m2 -> EV100 = log2(8000))
const lp = LL.luxPer(100000, 4.4);
row('luxPer(100000, 4.4) = 22727.2727', lp, 22727.2727, near(lp, 100000 / 4.4, 1e-9) && near(lp, 22727.2727, 1e-3));
row('luxPer(undefined sunLux) falls back to CALIB.sunLux', LL.luxPer(undefined, 4.4), lp, LL.luxPer(undefined, 4.4) === lp);
row('luxPer(sunI 0) = null (no calibrated sun)', LL.luxPer(100000, 0), null, LL.luxPer(100000, 0) === null);
const ev = LL.ev100(1000);
row('ev100(1000 cd/m2) = log2(8000) = 12.9658', ev, 12.9658, near(ev, Math.log2(8000), 1e-12) && near(ev, 12.9658, 1e-4));
const ex = LL.exposureFromEv(ev, lp, 0.6);
row('exposureFromEv(12.9658, 22727.27, 0.6) = 13636.36 / 9600 = 1.42045', ex, 1.42045, near(ex, 1.420454545, 1e-8));
row('ev100(12.5 cd/m2) = log2(100) (K cancels)', LL.ev100(12.5), Math.log2(100), near(LL.ev100(12.5), Math.log2(100), 1e-12));
const FakeTHREE = { ACESFilmicToneMapping: 4, NoToneMapping: 0 };
// §METER_EV v3 (fix/alts-torch): three's ACESFilmic 1/0.6 pre-scale is NOT cancelled — acesDiv returns 1 for every renderer.
row('acesDiv(ACES renderer) = 1 (pre-scale kept, §METER_EV v3)', LL.acesDiv({ toneMapping: 4 }, FakeTHREE), 1, LL.acesDiv({ toneMapping: 4 }, FakeTHREE) === 1);
row('acesDiv(no tone map) = 1', LL.acesDiv({ toneMapping: 0 }, FakeTHREE), 1, LL.acesDiv({ toneMapping: 0 }, FakeTHREE) === 1);
row('toneConst(THREE) = THREE.ACESFilmicToneMapping', LL.toneConst(FakeTHREE), 4, LL.toneConst(FakeTHREE) === 4);

// (b) bit-identity vs the pre-refactor inline expressions (c539f129), sweep of luminances / sun intensities
let bitBad = 0, n = 0;
for (let k = -6; k <= 10; k += 0.37) for (const sunI of [0.15, 1, 3.3, 4.4, 7.9]) for (const aces of [0.6, 1]) {
  const L = Math.pow(10, k) * 1.2345, sunLux = 100000;
  const lpOld = sunI > 0 ? (sunLux || 100000) / sunI : null, lpNew = LL.luxPer(sunLux, sunI);
  const Lcd = L * lpOld, evOld = Math.log2(Lcd * 100 / 12.5), evNew = LL.ev100(Lcd);
  const exOld = lpOld * aces / (1.2 * Math.pow(2, evOld)), exNew = LL.exposureFromEv(evNew, lpNew, aces);
  n++; if (!(Object.is(lpOld, lpNew) && Object.is(evOld, evNew) && Object.is(exOld, exNew))) bitBad++;
}
row('bit-identical luxPer/ev100/exposure vs c539f129 inline (' + n + ' inputs)', bitBad + ' differ', '0 differ', bitBad === 0 && n > 100);

// (c) constants = the literals they replaced (c539f129: effects.js:4274, sourced_light.js:896/1148/1233, scene.js:125-213)
const want = { 'CALIB.sunLux': 100000, 'CALIB.lampLux': 500, 'CALIB.refH': 2.5, 'METER.K': 12.5, 'METER.iso': 100, 'METER.q': 1.2,
  'METER.histLo': 0.40, 'METER.histHi': 0.90, 'METER.W': 160, 'METER.H': 90, 'TONE.acesDiv': 0.6, 'TONE.curve': 'ACESFilmic',
  'COVE.trimLuxVoid': 100, 'COVE.unknownLux': 100, 'COVE.color': 0xffe4b5, 'SCENE.toneMapping': 'ACESFilmic', 'SCENE.exposure': 0.45,
  'SCENE.sun.color': 0xfff0dd, 'SCENE.sun.intensity': 4.4, 'SCENE.hemi.sky': 0xb0c4de, 'SCENE.hemi.ground': 0x8b7355,
  'SCENE.hemi.intensity': 0.617, 'SCENE.ambient.color': 0xffffff, 'SCENE.ambient.intensity': 0.386 };
Object.keys(want).forEach(function (k) { const v = k.split('.').reduce(function (o, p) { return o && o[p]; }, LL.LAW);
  row('LAW.' + k + ' = ' + want[k], v, want[k], v === want[k]); });
row('LAW is frozen (no runtime tuning)', Object.isFrozen(LL.LAW) && Object.isFrozen(LL.LAW.METER), true, Object.isFrozen(LL.LAW) && Object.isFrozen(LL.LAW.METER));

// (d) snapshot hash: stable, independent of live state, sensitive to a law change
const s1 = LL.snapshot(), s2 = LL.snapshot();
const col = function (hex) { return { getHex: function () { return hex; } }; };
const A = { renderer: { toneMappingExposure: 1.4204, toneMapping: 4 }, _stillCalibSunI: 4.4, _stillCalibSunLux: 100000,
  sun: { intensity: 4.4, color: col(0xfff0dd) }, hemi: { intensity: 1.234, color: col(0xb0c4de), groundColor: col(0x8b7355) },
  ambient: { intensity: 0 }, _meterLast: { ev100: 12.9658, exposure: 1.4204 } };
const s3 = LL.snapshot(A);
row('lawHash stable across calls', s1.lawHash + ' / ' + s2.lawHash, 'equal', s1.lawHash === s2.lawHash && /^[0-9a-f]{8}$/.test(s1.lawHash));
row('lawHash independent of live state', s3.lawHash, s1.lawHash, s3.lawHash === s1.lawHash);
row('liveHash changes with live state', s3.liveHash + ' vs ' + s1.liveHash, 'differ', s3.liveHash !== s1.liveHash);
row('snapshot(A).live.luxPer = luxPer(A)', s3.live.luxPer, lp, s3.live.luxPer === lp);
const bent = JSON.parse(JSON.stringify(LL.LAW)); bent.CALIB.sunLux = 100001;
row('hash sensitive to one law value (sunLux 100001)', LL.hash(bent), '!= ' + s1.lawHash, LL.hash(bent) !== s1.lawHash);
row('hash key-order independent', LL.hash({ b: 1, a: 2 }), LL.hash({ a: 2, b: 1 }), LL.hash({ b: 1, a: 2 }) === LL.hash({ a: 2, b: 1 }));
console.log('§LIGHT_LAW_UNIT lawHash=' + s1.lawHash + ' v=' + LL.LAW.version + ' luxPer(4.4)=' + lp.toFixed(4) + ' ev100(1000)=' + ev.toFixed(4) + ' exposure=' + ex.toFixed(6) + ' bitInputs=' + n);

rows.forEach(r => { if (!r.ok) console.log('    FAILED ROW: ' + r.name + ' got=' + r.got + ' want=' + r.want); });
Witness('light_law_unit')
  .population(() => rows)
  .schema({ type: 'object', required: ['name', 'got', 'want', 'ok'], properties: { name: { type: 'string' }, got: { type: 'string' }, want: { type: 'string' }, ok: { type: 'boolean' } } })
  .invariant('every formula / constant / hash row holds', rs => rs.every(r => r.ok))
  .redControl(rs => { rs[0].ok = false; return rs; })   // a wrong luxPer must fail the witness
  .run();
