#!/usr/bin/env node
// WITNESS — film_exposure_unit: LightLaw.adaptEv (viewer/light_law.js), the §FILM_LAW S1 eye-adaptation step a film runs per frame.
// Spec: bim-compiler prompts/ALTC_SHOWSTOPPERS.md "§FILM_LAW — SPEC" S1 (ALT+C ruling R1; §LIGHT_ONE_SCALE L3; §METER_EV).
//
// ISSUE THIS PROVES OR DISPROVES: a film's exposure must follow the metered EV100 like a movie camera — never a jump, never
// an overshoot/oscillation, at the engine adaptation speeds (Unreal speed_up 3 / speed_down 1 EV stops per second; HDRP the
// same; prompts/photoreal_probes/engine_light_laws.md), on the FRAME clock (dt = 1/fps) so a bake is reproducible, and with a
// fixed first frame (no ramp-in from an arbitrary start). Stopper S-LAW-2 was a fixed 0.3825 for the whole film; a naive
// per-frame meter would instead JUMP (R1 forbids). This witness drives step responses (up 4, down 4, a mixed schedule) at
// 30 fps and judges: per-frame |dEV| within 3/30 rising and 1/30 falling, arrival frame = ceil(4*30/3)=40 up and
// ceil(4*30/1)=120 down, no overshoot, first frame = target, bit-identical on a rerun, and that 15 fps and 30 fps reach the
// target in the same film SECONDS. redControl: an uncapped (jump) easer must FAIL.
// It does NOT prove the browser wiring (meterRead per frame, exposure written) — that is the §FILM_LAW GPU witness.
// Prints INCONCLUSIVE (never PASS) when light_law.js / adaptEv cannot be loaded.
//
// Command: node viewer/tests/witness_film_exposure_unit.js
'use strict';
const path = require('path');

let LL = null;
try { LL = require(path.join(__dirname, '..', 'light_law.js')); } catch (e) { LL = null; }
if (!LL || typeof LL.adaptEv !== 'function' || !LL.ADAPT) {
  console.log('§WITNESS_FILM_EXPOSURE_UNIT INCONCLUSIVE LightLaw.adaptEv not loaded (' + path.join(__dirname, '..', 'light_law.js') + ') — nothing judged');
  process.exitCode = 2;
  return;
}
const { Witness } = require('../../witness_kit/contract');
const UP = LL.ADAPT.up, DN = LL.ADAPT.down, EPS = 1e-9;

// run a schedule of targets (one per frame) through an easer; returns the EV series
function drive(ease, targets, fps) {
  const out = []; let ev = null;
  for (const t of targets) { ev = ease(ev, t, 1 / fps).ev; out.push(ev); }
  return out;
}
function arrival(series, target) { for (let i = 0; i < series.length; i++) if (series[i] === target) return i; return -1; }

function judge(ease) {
  const rows = [];
  function row(name, got, want, ok) { rows.push({ name, got: String(got), want: String(want), ok: !!ok }); }
  const fps = 30;
  // first frame takes its target (no ramp-in)
  const f0 = ease(null, 11.25, 1 / fps);
  row('first frame = its target (no ramp-in)', f0.ev, 11.25, f0.ev === 11.25);
  // step UP 4 stops: frame 0 at 10, then target 14 for 200 frames
  const upT = [10].concat(Array(200).fill(14)), up = drive(ease, upT, fps);
  let upMaxD = 0, upOver = 0; for (let i = 1; i < up.length; i++) { upMaxD = Math.max(upMaxD, up[i] - up[i - 1]); if (up[i] > 14 + EPS || up[i] < up[i - 1] - EPS) upOver++; }
  row('step up: max per-frame rise <= up/fps = ' + (UP / fps).toFixed(4), upMaxD.toFixed(6), '<= ' + (UP / fps).toFixed(6), upMaxD <= UP / fps + EPS && upMaxD > 0);
  row('step up: no overshoot, monotone', upOver + ' bad frames', '0', upOver === 0);
  const upArr = arrival(up, 14), upWant = 1 + Math.ceil(4 * fps / UP - EPS) - 1;   // frame index where EV == 14 (frame 0 = 10)
  row('step up: reaches 14 at frame ' + upWant + ' (4 stops at 3/s, 30 fps = 40 frames)', upArr, upWant, upArr === upWant);
  // step DOWN 4 stops
  const dnT = [14].concat(Array(200).fill(10)), dn = drive(ease, dnT, fps);
  let dnMaxD = 0, dnOver = 0; for (let i = 1; i < dn.length; i++) { dnMaxD = Math.max(dnMaxD, dn[i - 1] - dn[i]); if (dn[i] < 10 - EPS || dn[i] > dn[i - 1] + EPS) dnOver++; }
  row('step down: max per-frame fall <= down/fps = ' + (DN / fps).toFixed(4), dnMaxD.toFixed(6), '<= ' + (DN / fps).toFixed(6), dnMaxD <= DN / fps + EPS && dnMaxD > 0);
  row('step down: no overshoot, monotone', dnOver + ' bad frames', '0', dnOver === 0);
  const dnArr = arrival(dn, 10), dnWant = Math.ceil(4 * fps / DN - EPS);
  row('step down: reaches 10 at frame ' + dnWant + ' (4 stops at 1/s, 30 fps = 120 frames)', dnArr, dnWant, dnArr === dnWant);
  // small change inside one frame's budget lands exactly (no creep)
  const sm = ease(10, 10.05, 1 / fps);
  row('a change within one frame budget lands exactly', sm.ev, 10.05, sm.ev === 10.05 && sm.capped === null);
  // mixed schedule: never exceeds either limit, never crosses the target it moves toward
  const mixT = []; for (let i = 0; i < 400; i++) mixT.push(9 + 3 * Math.sin(i / 17) + (i % 97 < 5 ? 2 : 0));
  const mix = drive(ease, mixT, fps); let mixBad = 0;
  for (let i = 1; i < mix.length; i++) { const d = mix[i] - mix[i - 1], gap = mixT[i] - mix[i - 1];
    if (d > UP / fps + EPS || -d > DN / fps + EPS) mixBad++;
    if ((gap >= 0 && mix[i] > mixT[i] + EPS) || (gap < 0 && mix[i] < mixT[i] - EPS)) mixBad++; }
  row('mixed 400-frame schedule: within limits, no crossing', mixBad + ' violations', '0', mixBad === 0);
  // determinism: bit-identical rerun
  const mix2 = drive(ease, mixT, fps); let diff = 0; for (let i = 0; i < mix.length; i++) if (!Object.is(mix[i], mix2[i])) diff++;
  row('deterministic: rerun bit-identical (400 frames)', diff + ' differ', '0', diff === 0);
  // frame clock: 15 fps and 30 fps arrive in the same film seconds (step up 4)
  const up15 = drive(ease, [10].concat(Array(100).fill(14)), 15), a15 = arrival(up15, 14) / 15, a30 = upArr / 30;
  row('15 fps vs 30 fps: same arrival in seconds (4/3 s)', a15.toFixed(4) + ' / ' + a30.toFixed(4), (4 / 3).toFixed(4), Math.abs(a15 - 4 / 3) < 1e-9 && Math.abs(a30 - 4 / 3) < 1e-9);
  row('law speeds are the cited engine defaults (up 3, down 1)', UP + '/' + DN, '3/1', UP === 3 && DN === 1);
  return rows;
}

const real = judge(LL.adaptEv);
const jump = function (evPrev, t) { return { ev: t, capped: null, first: evPrev == null }; };   // the per-frame JUMP R1 forbids
real.forEach(r => console.log('  ' + (r.ok ? 'ok  ' : 'FAIL') + ' ' + r.name + ' got=' + r.got + ' want=' + r.want));
console.log('§FILM_EXPOSURE_UNIT up=' + UP + ' down=' + DN + ' rows=' + real.length + ' pass=' + real.filter(r => r.ok).length + ' lawHash=' + LL.snapshot().lawHash + ' v=' + LL.LAW.version);
Witness('film_exposure_unit')
  .population(() => real)
  .schema({ type: 'object', required: ['name', 'got', 'want', 'ok'], properties: { name: { type: 'string' }, got: { type: 'string' }, want: { type: 'string' }, ok: { type: 'boolean' } } })
  .invariant('every step-response row holds', rs => rs.every(r => r.ok))
  .redControl(() => judge(jump))   // an uncapped per-frame jump must fail the witness
  .run();
