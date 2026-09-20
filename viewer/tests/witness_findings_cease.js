#!/usr/bin/env node
/**
 * §FINDINGS_CEASE — DO THE MEASURE / SANITY / CLASH OVERLAYS ACTUALLY STOP?
 *
 * red1, 2026-09-20: "cease those overlays during ending orbit, as user has seen enough", from the
 * onset of the storey reveal. And, on this specific check: "WITNESS logging must be present for
 * those big request ie ceasing of M/C/S overlays during storey reveal start."
 *
 * WHY IT IS NOT A LIST CHECK. The first implementation named two layers of nine and was correct
 * only by luck: the stale "Floor area" box red1 chased all morning is `measure.box`, which was not
 * in that list and went quiet only because its source was cleared elsewhere. A list-based witness
 * cannot catch a tenth layer added later — which is exactly how §75 rotted into a half-applied fix.
 * So this witness DISCOVERS the layer names from cinema_maxq.js itself and runs the LIVE predicate
 * over every one of them. A layer added tomorrow is judged the day it is added.
 *
 * And the two flags that drive the gate are exercised, not read: cpe_storey_reveal.js is required
 * and driven across a real tNorm sweep, so "it is true for the rest of the film" is measured frame
 * by frame rather than asserted from the shape of an if.
 *
 * RUN: node viewer/tests/witness_findings_cease.js
 */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const mq = fs.readFileSync(path.join(ROOT, 'viewer/cinema_maxq.js'), 'utf8');

let pass = 0, fail = 0;
const ck = (n, c, x) => { (c ? pass++ : fail++); console.log('  §CEASE ' + (c ? 'ok    ' : 'WRONG ') + n + (x ? '   ' + x : '')); };

// ── 1. THE PREDICATE, READ LIVE, APPLIED TO EVERY LAYER THE FILM ACTUALLY DRAWS ──────────────
const rxSrc = /var ESC_SUPPRESS_RX = (\/[^;]+\/);/.exec(mq);
ck('the gate is a PREDICATE, not a named list — a tenth layer is covered by decision, not accident',
   !!rxSrc, rxSrc ? rxSrc[1] : 'no ESC_SUPPRESS_RX found');
if (!rxSrc) { console.log('§FINDINGS_CEASE INCONCLUSIVE — no predicate to test'); process.exit(2); }
const RX = eval(rxSrc[1]);
const layers = Array.from(new Set(
  (mq.match(/_(?:drawUnlessHold|hudHold)\('([a-z0-9_.]+)'/g) || [])
    .map((m) => /'([a-z0-9_.]+)'/.exec(m)[1])));
ck('every layer the bake draws was discovered from the source, not typed here',
   layers.length >= 12, layers.length + ' layers: ' + layers.join(' '));
const mustCease = layers.filter((n) => /^(measure|clash)\./.test(n));
const mustStay = layers.filter((n) => !/^(measure|clash)\./.test(n));
ck('EVERY measure.* and clash.* layer is ceased — all ' + mustCease.length + ' of them',
   mustCease.length >= 9 && mustCease.every((n) => RX.test(n)),
   mustCease.filter((n) => !RX.test(n)).join(',') || mustCease.join(' '));
ck('…including measure.box, the stale "Floor area" panel red1 chased — it was NOT in the old list',
   mustCease.indexOf('measure.box') >= 0 && RX.test('measure.box'));
ck('and NOTHING else is ceased — the sun clock, the compass, the day counter, the pie, the panels stay',
   mustStay.every((n) => !RX.test(n)),
   mustStay.filter((n) => RX.test(n)).join(',') || mustStay.join(' '));

// ── 2. THE TRIGGER, DRIVEN FRAME BY FRAME ────────────────────────────────────────────────────
global.THREE = { Color: class { constructor(h) { this.h = h >>> 0; } setHex(h) { this.h = h >>> 0; return this; } getHex() { return this.h; } } };
global.window = global.window || {};
const setupCpeStoreyReveal = require(path.join(ROOT, 'viewer/cpe_storey_reveal.js'));
function sweep(storeyOn) {
  const A = { activeBuilding: 'W', _metaGen: 0, dbQuery: () => [], collectMeshes: () => [] };
  setupCpeStoreyReveal(A);
  const plan = { durationSec: 195.8, beats: { rise: 0.9590 },
                 storeyReveal: { on: storeyOn, windowFrac: 0.1245 } };
  const out = [];
  const _log = console.log; console.log = () => {};
  for (let k = 0; k <= 2000; k++) {
    const tn = k / 2000;
    try { A.storeyRevealApplyVisual(plan, tn); } catch (e) { /* tint/markers need a scene; the flag does not */ }
    out.push({ tn, sec: tn * plan.durationSec, on: !!A._findingsHudSuppress });
  }
  console.log = _log;
  return { plan, out };
}
{
  const { plan, out } = sweep(true);
  const first = out.find((r) => r.on);
  const revealStartSec = (plan.beats.rise - plan.storeyReveal.windowFrac) * plan.durationSec;
  ck('WITH the storey reveal on: the cease begins ~2 s BEFORE the reveal opens',
     !!first && Math.abs((revealStartSec - first.sec) - 2) < 0.3,
     first ? 'cease at ' + first.sec.toFixed(1) + 's, reveal opens ' + revealStartSec.toFixed(1) + 's' : 'never ceased');
  // ONE-SIDED: _storeyRevealArmed ends at beats.rise and the escape window does not open until
  // ~0.965, so a two-sided test would let every chip flash back on for the ~1.2 s between beats.
  const gap = out.filter((r) => first && r.tn > first.tn && !r.on);
  ck('…and it NEVER lifts again — no gap between the reveal and the escape beat',
     gap.length === 0, gap.length ? gap.length + ' frames un-ceased, first at ' + gap[0].sec.toFixed(1) + 's' : 'held to the final frame');
}
{
  const { plan, out } = sweep(false);
  const first = out.find((r) => r.on);
  const orbitSec = plan.beats.rise * plan.durationSec;
  ck('WITHOUT a storey reveal: they get a 2 s tail from the closing orbit, and no more',
     !!first && Math.abs((first.sec - orbitSec) - 2) < 0.3,
     first ? 'orbit ' + orbitSec.toFixed(1) + 's, cease at ' + first.sec.toFixed(1) + 's' : 'never ceased');
  ck('…and that bound exists in CODE, not by accident on a film that happens to have the reveal on',
     /FINDINGS_OFF_TAIL_SEC/.test(fs.readFileSync(path.join(ROOT, 'viewer/cpe_storey_reveal.js'), 'utf8')));
}

// ── 3. THE BAKE ITSELF SAYS SO ───────────────────────────────────────────────────────────────
// A gate that is only provable by this file is not provable from the film that shipped.
ck('the bake logs §FINDINGS_CEASE per layer, naming the layer and which trigger fired',
   /§FINDINGS_CEASE layer=/.test(mq) && /trigger=/.test(mq) &&
   /storey-reveal-onset/.test(mq) && /escape-route-window/.test(mq));
ck('…and the CLI relays it, so it reaches out\\/<db>.log and not only the firehose',
   /FINDINGS_CEASE/.test(fs.readFileSync(path.join(ROOT, 'cli_silent_bake.js'), 'utf8')));

console.log('§FINDINGS_CEASE ' + (fail ? 'FAIL' : 'PASS') + ' pass=' + pass + ' fail=' + fail +
  ' layers=' + layers.length);
process.exit(fail ? 1 : 0);
