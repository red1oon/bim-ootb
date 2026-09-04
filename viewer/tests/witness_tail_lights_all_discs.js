#!/usr/bin/env node
// witness_tail_lights_all_discs.js — W-TAIL-LIGHTS
//
// ⚠ DO NOT REMOVE — SCOPE (bim-compiler prompts/CINEMA_DISCIPLINE_REVEAL.md §CPE_TAIL_LIGHTS_ALL_ONLY).
// USER, 2026-09-04, on a real bake: "during last part each DISCipline reveal, the lights are all
// turned ON that obscures the delicate items scene. Should turn on only during ALL DISCs."
// Read the log after every run.
//
// THE ISSUE THIS PROVES OR DISPROVES: the disc parade's one-at-a-time slots ('tail-one') exist to
// read a single trade's delicate geometry on its own, but the staged luminaires burned through all
// of them — and filterDiscs hides the very fixtures doing the lighting on every slot that is not
// their own, so the room was washed out by lamps that were not even on screen. Lights belong to the
// final all-together slot ('tail-all'). This witness asserts exactly that mapping, over every phase
// the reveal produces, and that the bake actually honours it.
//
// Whitebox, no browser, no bake: `cpeRevealLightsOffAt` and `cpeRevealVisualAt` are SLICED OUT of
// the shipped effects.js by brace matching and driven against a real plan shape; the three wiring
// facts are read out of the shipped sources rather than restated here.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const { Witness } = require(path.join(__dirname, '..', '..', 'witness_kit', 'contract.js'));
const fx = fs.readFileSync(path.join(__dirname, '..', 'effects.js'), 'utf8');
const mq = fs.readFileSync(path.join(__dirname, '..', 'cinema_maxq.js'), 'utf8');

function sliceAssign(src, marker) {
  const i = src.indexOf(marker);
  if (i < 0) return null;
  let d = 0, open = false;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') { d++; open = true; }
    else if (src[j] === '}') { d--; if (open && d === 0) return src.slice(i, j + 1) + ';'; }
  }
  return null;
}
const visSrc = sliceAssign(fx, 'A.cpeRevealVisualAt = function');
const offSrc = sliceAssign(fx, 'A.cpeRevealLightsOffAt = function');
const fadeSec = Number((fx.match(/CPE_REVEAL_FADE_SEC\s*=\s*([0-9.]+)/) || [])[1]) || 0;

// WIRING, read from the shipped files — the mapping is worthless if nothing acts on it.
const wirePL = /if \(A\._cpeRevealLightsOff\) A\._nightPLScale = 0;/.test(fx);
const wireGlow = /function _glowOn\(filterFn\)[\s\S]{0,900}?if \(A\._cpeRevealLightsOff\) \{/.test(fx);
const iFlag = mq.indexOf('A._cpeRevealLightsOff = A.cpeRevealLightsOffAt');
const iStage = mq.indexOf('A.startStillRefine();', iFlag > 0 ? iFlag : 0);
const wireOrder = iFlag > 0 && iStage > iFlag;   // the flag must be set BEFORE staging rebuilds lights

const PLAN = {
  beats: { dive: 0.05, spin: 0.1, out: 0.40, pullout: 0.45, flyback: 0.55, reveal: 0.80, rise: 0.95 },
  reveal: { discs: ['MEP', 'PLUMBING', 'FIRE'], pulloutSec: 1.5, roundSec: 36.1,
            tailSec: 8, riseSec: 4, qtyCost: {} }
};

function ctx() {
  const A = {};
  const sb = { A, Math, console: { log() {} } };
  sb.CPE_REVEAL_FADE_SEC = fadeSec;
  vm.createContext(sb);
  vm.runInContext('var CPE_REVEAL_FADE_SEC = ' + fadeSec + ';\n' + visSrc + '\n' + offSrc, sb);
  return A;
}

function population() {
  if (!visSrc || !offSrc) return [];
  const A = ctx();
  const rows = [];
  for (let t = 0; t <= 1.0001; t += 0.005) {
    const tn = +t.toFixed(4);
    const st = A.cpeRevealVisualAt(PLAN, tn);
    rows.push({
      t: tn,
      phase: st ? st.phase : 'none',
      nDiscs: st && st.discs ? st.discs.length : 0,
      lightsOff: !!A.cpeRevealLightsOffAt(PLAN, tn),
      wirePL, wireGlow, wireOrder
    });
  }
  return rows;
}

const schema = {
  type: 'object', required: ['t', 'phase', 'nDiscs', 'lightsOff', 'wirePL', 'wireGlow', 'wireOrder'],
  properties: {
    t: { type: 'number' }, phase: { type: 'string' }, nDiscs: { type: 'integer' },
    lightsOff: { type: 'boolean' }, wirePL: { type: 'boolean' },
    wireGlow: { type: 'boolean' }, wireOrder: { type: 'boolean' }
  }
};

if (!visSrc || !offSrc) {
  console.log('§WITNESS_TAIL_LIGHTS_VERDICT INCONCLUSIVE — could not slice ' +
    (!visSrc ? 'cpeRevealVisualAt' : 'cpeRevealLightsOffAt') + ' out of effects.js; nothing judged');
  process.exit(1);
}

const w = Witness('TAIL_LIGHTS_ALL_ONLY')
  .population(population)
  .schema(schema)
  // G1 — the ruling, exactly: dark for a one-discipline slot, lit everywhere else.
  .invariant('off-iff-tail-one', rows => rows.every(r => r.lightsOff === (r.phase === 'tail-one')))
  // G2 — the all-together slot KEEPS its lights; that is the slot a lit building is the point of.
  .invariant('tail-all-stays-lit', rows => {
    const all = rows.filter(r => r.phase === 'tail-all');
    return all.length > 0 && all.every(r => r.lightsOff === false);
  })
  // G3 — nothing outside the parade changed: round 1, pull-out, fly-back, round 2 and rise proper
  // are all still lit, so this cannot have darkened the film at large.
  .invariant('outside-parade-untouched', rows =>
    rows.filter(r => r.phase !== 'tail-one').every(r => r.lightsOff === false))
  // G4 — the parade actually happened in this population, so G1-G3 are not passing over nothing.
  .invariant('parade-was-exercised', rows =>
    rows.some(r => r.phase === 'tail-one') && rows.some(r => r.phase === 'tail-all'))
  // G5 — the mapping is HONOURED: illumination and glow both read the flag, and the bake sets it
  // before staging rebuilds the lights. A pure function nothing acts on would pass G1 and change
  // nothing on screen.
  .invariant('wired-into-the-bake', rows => rows.every(r => r.wirePL && r.wireGlow && r.wireOrder))
  // RED — the pre-fix behaviour: the lamps burn through every slot.
  .redControl(rows => rows.map(r => Object.assign({}, r, { lightsOff: false })));

const res = w.run();
const rows = population();
const byPhase = {};
rows.forEach(r => { byPhase[r.phase] = byPhase[r.phase] || { n: 0, off: 0 };
  byPhase[r.phase].n++; if (r.lightsOff) byPhase[r.phase].off++; });
Object.keys(byPhase).forEach(k => console.log('§TAIL_LIGHTS_PHASE phase=' + k +
  ' samples=' + byPhase[k].n + ' lightsOff=' + byPhase[k].off));
console.log('§TAIL_LIGHTS_WIRING plScaleZeroed=' + wirePL + ' glowSuppressed=' + wireGlow +
  ' flagSetBeforeStaging=' + wireOrder);
const vacuous = rows.length === 0;
const noop = rows.every(r => !r.lightsOff);
console.log('§WITNESS_TAIL_LIGHTS_VERDICT ' +
  (vacuous ? 'VACUOUS — no phase sampled'
   : noop ? 'NO-OP — no slot ever turns the lights off; the rule is not in force'
   : res.fail === 0 ? 'PASS' : 'FAIL') +
  ' rows=' + rows.length + ' pass=' + res.pass + ' fail=' + res.fail);
process.exit(res.fail === 0 && !vacuous && !noop ? 0 : 1);
