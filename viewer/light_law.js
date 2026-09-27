// light_law.js — §LIGHT_LAW_MODULE (bim-compiler prompts/PHOTOREAL_STILL_RENDER.md §LIGHT_ONE_SCALE -> §LIGHT_LAW_MODULE).
// Implementing §LIGHT_LAW_MODULE — Witness: viewer/tests/witness_light_law_unit.js (node) + the GPU §-line diff (spec part 2).
// ONE file holding the photometric chain's values and formulas (§LIGHT_ONE_SCALE L1 sources, L1a cove, L3 eye) so Alt+S reads
// them now and Alt+C can later read the SAME values. PURE REFACTOR: every number here was a literal in scene.js /
// effects.js / sourced_light.js at fix/lamp-truth @c539f129 and is unchanged. Moving a value here is not endorsing it — the
// §LIGHT_TRUTH_AUDIT verdicts (row numbers below) still stand.
// Loaded before sourced_light.js / effects.js / scene.js (viewer.html). Also a CommonJS module for node witnesses.
(function (global) {
  'use strict';
  function freeze(o) { Object.keys(o).forEach(function (k) { if (o[k] && typeof o[k] === 'object') freeze(o[k]); }); return Object.freeze(o); }

  var LAW = freeze({
    version: 2,   // 2 = §FILM_LAW: ADAPT added (films)
    // L1 — the ONE calibration (§SOURCED_LIGHT_CALIB, effects.js; audit #14/#15): the scene sun = sunLux lx; one fixture at
    // refH m above a floor point gives lampLux (EN 12464-1 office; Wikipedia "Lux" after Schlyter).
    CALIB: { sunLux: 100000, lampLux: 500, refH: 2.5 },
    // L1 — scene source values (scene.js; audit #1 tone, #2 base exposure, #12 sun, #19 hemi, #24 ambient). Colours are hex
    // used as linear (ColorManagement off, audit #48).
    SCENE: {
      toneMapping: 'ACESFilmic', exposure: 0.45,
      sun: { color: 0xfff0dd, intensity: 4.4 },
      hemi: { sky: 0xb0c4de, ground: 0x8b7355, intensity: 0.617 },
      ambient: { color: 0xffffff, intensity: 0.386 }
    },
    // L3 — §METER_EV: EV100 = log2(L x iso / K), exposure = 1 / (q x 2^EV100) (Frostbite 2014 Listing 28 / Filament / HDRP
    // ColorUtils; ISO 2720 K); histogram band 70/95 (Unreal auto_exposure_low/high_percent); readback W x H.
    METER: { K: 12.5, iso: 100, q: 1.2, histLo: 0.70, histHi: 0.95, W: 160, H: 90 },
    // L3 — the one tone curve; three.js ACESFilmic multiplies exposure by 1/acesDiv, so the meter takes acesDiv back out.
    TONE: { curve: 'ACESFilmic', acesDiv: 0.6 },
    // L3 — §FILM_LAW temporal adaptation (films, ALT+C R1): EV100 stops per second toward the metered target. up = target
    // above current (scene brighter, eye dark->light), down = below. Unreal speed_up 3.0 / speed_down 1.0; HDRP dark->light 3 /
    // light->dark 1 (prompts/photoreal_probes/engine_light_laws.md [UE-CES] [HDRP-EXP]).
    ADAPT: { up: 3, down: 1 },
    // L1a — §COVE_LIGHT levels (audit #46, red1 exception §COVE_NO_STRIP "need not be accurate").
    COVE: { trimLuxVoid: 100, unknownLux: 100, color: 0xffe4b5 }
  });

  // scene units -> lux (x luxPer) and -> cd/m2 for a luminance in scene units. null when there is no calibrated sun.
  function luxPer(sunLux, sunI) { return sunI > 0 ? (sunLux || LAW.CALIB.sunLux) / sunI : null; }
  // EV100 from a luminance in cd/m2 — same expression order as sourced_light.js meter() @c539f129 (bit-identical).
  function ev100(Lcd) { return Math.log2(Lcd * LAW.METER.iso / LAW.METER.K); }
  // exposure (three.js toneMappingExposure) for an EV100 — same expression order as meter() @c539f129.
  function exposureFromEv(ev, lp, acesDiv) { return lp * acesDiv / (LAW.METER.q * Math.pow(2, ev)); }
  // §FILM_LAW: one frame of eye adaptation. First frame (evPrev null) = its target (no ramp-in); after that the EV moves toward
  // the target by at most ADAPT.up x dt (rising) / ADAPT.down x dt (falling) — linear capped, so it cannot overshoot.
  // dt = 1 / film fps (frame clock, never the wall clock). Returns { ev, capped: 'up'|'down'|null, first }.
  function adaptEv(evPrev, evTarget, dt) {
    if (evPrev == null || !isFinite(evPrev)) return { ev: evTarget, capped: null, first: true };
    // TOL 1e-9 EV: summing k capped steps in floating point leaves the EV ~1e-14 short of the target, which would cost one
    // extra frame (witness_film_exposure_unit caught 41 vs 40 frames); a billionth of a stop is below any visible change.
    var TOL = 1e-9, d = evTarget - evPrev, upMax = LAW.ADAPT.up * dt, dnMax = LAW.ADAPT.down * dt;
    if (d > upMax + TOL) return { ev: evPrev + upMax, capped: 'up', first: false };
    if (d < -dnMax - TOL) return { ev: evPrev - dnMax, capped: 'down', first: false };
    return { ev: evTarget, capped: null, first: false };
  }
  function acesDiv(renderer, THREE) { return (renderer && THREE && renderer.toneMapping === THREE.ACESFilmicToneMapping) ? LAW.TONE.acesDiv : 1; }
  function toneConst(THREE) { return THREE[LAW.SCENE.toneMapping + 'ToneMapping']; }

  // canonical JSON (keys sorted, recursively) + FNV-1a 32 — the same string and hash in node and every browser.
  function canon(v) {
    if (v === null || typeof v !== 'object') return JSON.stringify(v === undefined ? null : v);
    if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
    return '{' + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ':' + canon(v[k]); }).join(',') + '}';
  }
  function fnv1a(s) { var h = 0x811c9dc5; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return ('0000000' + h.toString(16)).slice(-8); }
  function hash(o) { return fnv1a(canon(o)); }

  function hex(c) { return c && c.getHex ? c.getHex() : null; }
  // every law value + the live state the frame is rendered with (A optional; node: live = {}).
  function snapshot(A) {
    var live = {};
    if (A) {
      var R = A.renderer, m = A._meterLast;
      live = {
        calibSunI: A._stillCalibSunI != null ? A._stillCalibSunI : null,
        calibSunLux: A._stillCalibSunLux != null ? A._stillCalibSunLux : null,
        luxPer: luxPer(A._stillCalibSunLux, A._stillCalibSunI),
        exposure: R ? R.toneMappingExposure : null,
        toneMapping: R ? R.toneMapping : null,
        sunI: A.sun ? A.sun.intensity : null, sunColor: A.sun ? hex(A.sun.color) : null,
        hemiI: A.hemi ? A.hemi.intensity : null, hemiSky: A.hemi ? hex(A.hemi.color) : null, hemiGround: A.hemi ? hex(A.hemi.groundColor) : null,
        ambientI: A.ambient ? A.ambient.intensity : null,
        meterEv100: m && m.ev100 != null ? m.ev100 : null, meterExposure: m && m.exposure != null ? m.exposure : null
      };
    }
    var lawHash = hash(LAW);
    return { law: LAW, lawHash: lawHash, live: live, liveHash: hash({ law: LAW, live: live }) };
  }
  function fx(v, d) { return v == null ? 'null' : (+v).toFixed(d); }
  function log(A, tag) {
    var s = snapshot(A), L = s.live;
    console.log('§LIGHT_LAW tag=' + (tag || '-') + ' v=' + LAW.version + ' lawHash=' + s.lawHash + ' liveHash=' + s.liveHash + ' luxPer=' + fx(L.luxPer, 3) +
      ' exposure=' + fx(L.exposure, 4) + ' ev100=' + fx(L.meterEv100, 3) + ' sunI=' + fx(L.sunI, 3) + ' hemiI=' + fx(L.hemiI, 3));
    return s;
  }

  var LightLaw = { LAW: LAW, CALIB: LAW.CALIB, SCENE: LAW.SCENE, METER: LAW.METER, TONE: LAW.TONE, COVE: LAW.COVE, ADAPT: LAW.ADAPT, adaptEv: adaptEv,
    luxPer: luxPer, ev100: ev100, exposureFromEv: exposureFromEv, acesDiv: acesDiv, toneConst: toneConst,
    snapshot: snapshot, log: log, hash: hash, canon: canon };
  global.LightLaw = Object.freeze(LightLaw);
  if (typeof module !== 'undefined' && module.exports) module.exports = global.LightLaw;
})(typeof window !== 'undefined' ? window : globalThis);
