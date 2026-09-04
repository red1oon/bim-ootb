#!/usr/bin/env node
/* W-ARCH-HOLD — §CPE_REVEAL_ARCH_HOLD (2026-09-03, user ask)
 *
 * CLAIM: the discipline ghost (ARC/STR hidden) must NOT begin when the fly-back begins.
 * It must begin at b.flyback — the instant the camera is back on the FIRST STICK, where
 * round 2 properly commences. Reason on record: on the retrace everything is built AND lit,
 * and that fully-lit read is the payoff against the gloomy first pass.
 *
 * Slices A.cpeRevealVisualAt out of the shipped viewer/effects.js and runs it standalone —
 * no browser, no bake. Same text-slice technique the 4D witnesses in this folder use.
 *
 * RED CONTROL: W_ARCH_HOLD_RED=1 restores the pre-fix gate (ghost from b.pullout). Every
 * gate that can detect the fix MUST fail under it, or the gate proves nothing.
 */
'use strict';
const fs = require('fs'), path = require('path');
const RED = process.env.W_ARCH_HOLD_RED === '1';
const SRC = path.join(__dirname, '..', 'effects.js');

// ── slice the pure function out of the shipped file ──────────────────────────
const src = fs.readFileSync(SRC, 'utf8');
const start = src.indexOf('A.cpeRevealVisualAt = function');
if (start < 0) { console.log('§W_ARCH_HOLD INCONCLUSIVE — cpeRevealVisualAt not found in effects.js'); process.exit(2); }
// take to the end of the function: first line that is exactly "  };" after start
const end = src.indexOf('\n  };', start);
if (end < 0) { console.log('§W_ARCH_HOLD INCONCLUSIVE — function end not found'); process.exit(2); }
let body = src.slice(start, end + 5);
if (RED) {
  // restore the pre-fix behaviour: ghost starts at the pull-out boundary
  body = body.replace('var tF = (b.flyback != null && b.flyback > tP) ? b.flyback : tP;', 'var tF = tP;');
}
const A = {};
// eslint-disable-next-line no-new-func
new Function('A', body)(A);
if (typeof A.cpeRevealVisualAt !== 'function') { console.log('§W_ARCH_HOLD INCONCLUSIVE — slice did not define the function'); process.exit(2); }

// ── a plan shaped like the real one (beats are normalized 0..1) ──────────────
const plan = {
  beats: { dive: 0.05, spin: 0.10, out: 0.50, pullout: 0.55, flyback: 0.70, reveal: 0.90, rise: 1.00 },
  reveal: { discs: ['PLB', 'MEP'], riseSec: 4, tailSec: 6 }
};
const b = plan.beats;
const mid = (a, z) => a + (z - a) / 2;
const phaseAt = t => { const v = A.cpeRevealVisualAt(plan, t); return v ? v.phase : null; };

let pass = 0, fail = 0, judged = 0;
function gate(id, ok, detail) {
  judged++;
  if (ok) { pass++; console.log(`§W_ARCH_HOLD ${id} PASS ${detail}`); }
  else { fail++; console.log(`§W_ARCH_HOLD ${id} FAIL ${detail}`); }
}

// G1 — the whole fly-back span keeps ARC/STR solid (this is the user's ask)
const flybackSamples = [];
for (let i = 1; i < 20; i++) flybackSamples.push(b.pullout + (b.flyback - b.pullout) * (i / 20));
const ghostedInFlyback = flybackSamples.filter(t => phaseAt(t) === 'ghost').length;
gate('G1-flyback-solid', ghostedInFlyback === 0,
  `ghostFrames=${ghostedInFlyback}/${flybackSamples.length} across b.pullout(${b.pullout})..b.flyback(${b.flyback})`);

// G2 — round 2 still ghosts, immediately after the first stick
const roundSamples = [];
for (let i = 1; i < 20; i++) roundSamples.push(b.flyback + (b.reveal - b.flyback) * (i / 20));
const ghostedInRound = roundSamples.filter(t => phaseAt(t) === 'ghost').length;
gate('G2-round2-ghosts', ghostedInRound === roundSamples.length,
  `ghostFrames=${ghostedInRound}/${roundSamples.length} across b.flyback..b.reveal`);

// G3 — the transition is exactly at b.flyback, not before
const justBefore = phaseAt(b.flyback - 1e-6), justAfter = phaseAt(b.flyback + 1e-6);
gate('G3-boundary-at-flyback', justBefore === null && justAfter === 'ghost',
  `justBefore=${justBefore} justAfter=${justAfter}`);

// G4 — pull-out unchanged: still plain
gate('G4-pullout-plain', phaseAt(mid(b.out, b.pullout)) === null,
  `phase=${phaseAt(mid(b.out, b.pullout))}`);

// G5 — DEGRADE, DON'T DISABLE: a plan with no b.flyback behaves exactly as before the fix
const legacy = { beats: { out: 0.50, pullout: 0.55, reveal: 0.90, rise: 1.00 }, reveal: plan.reveal };
const legacyPhase = A.cpeRevealVisualAt(legacy, mid(legacy.beats.pullout, legacy.beats.reveal));
gate('G5-degrade-no-flyback', legacyPhase && legacyPhase.phase === 'ghost',
  `legacy plan (no b.flyback) phase=${legacyPhase && legacyPhase.phase}`);

// G6 — NO-OP guard: the fix must actually change something. Compare the fly-back span
// under both gates; identical output means the change did nothing.
const tMid = mid(b.pullout, b.flyback);
const fixedMid = phaseAt(tMid);
gate('G6-not-a-noop', RED ? fixedMid === 'ghost' : fixedMid === null,
  `mid-flyback phase=${fixedMid} (RED=${RED ? 1 : 0}; the two arms MUST differ)`);

const verdict = judged === 0 ? 'INCONCLUSIVE' : (fail === 0 ? 'GREEN' : 'RED');
console.log(`§W_ARCH_HOLD_VERDICT claims=${judged} PASS=${pass} FAIL=${fail} ${verdict}` +
  (RED ? '  [RED CONTROL — failures here are REQUIRED]' : ''));
process.exit(fail === 0 ? 0 : 1);
