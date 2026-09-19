#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — §ESCAPE_ROUTE_REVEAL witness (bim-compiler prompts/ESCAPE_ROUTE_REVEAL.md §5)
 * SCOPE: the five claims §5 asks for, each named with the issue it proves or disproves. READ THE
 * LOG — the exit code is not the evidence, the per-claim lines are.
 *
 * ⚠ NO PIXEL-DERIVED EVIDENCE anywhere in this file, and that is the project's FUNDAMENTAL LAW,
 * not a stylistic preference: no frame is opened, no overlap ratio is computed off an image,
 * nothing is compared visually. W-ESC-7 at the foot asserts that about this file's own bytes.
 * Every claim is a slice of the real predicate, run against the real Hospital room graph.
 *
 * RUN:  BIM_BUILDINGS=/path/to/buildings node witness_escape_route_reveal.js
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com> · SPDX-License-Identifier: MIT
 */
'use strict';
const fs = require('fs'), path = require('path');
const initSqlJs = require('./tests/_sqljs.js').requireSqlJs();
const RoomGraph = require('./common/room_graph.js');
const EgressSanity = require('./viewer/egress_sanity.js');
const { setupCpeEscapeRoute } = require('./viewer/cpe_escape_route.js');

let pass = 0, fail = 0;
const ck = (n, c, x) => { if (c) { pass++; console.log('  §WER ok    ' + n + (x ? '   ' + x : '')); }
                          else { fail++; console.log('  §WER WRONG ' + n + (x ? '   ' + x : '')); } };
const near = (a, b, e) => Math.abs(a - b) <= (e === undefined ? 1e-9 : e);

// ── the app stub. Only what cpe_escape_route.js actually touches. THREE stays absent on purpose:
//    every claim below is reachable without a renderer, which is the point.
function makeApp(graph, volumes) {
  const A = { activeBuilding: 'Hospital_meta' };
  A.getRoomGraph = () => graph;
  // scene.js's own convention, verbatim (IFC X=east/Y=north/Z=up → three X=east/Y=up/Z=south).
  // A pure rotation, so every arc length below is the real walked length in metres.
  A.ifc2three = (ix, iy, iz) => ({ x: ix, y: iz, z: -iy });
  A.allRoomVolumes = () => volumes;
  setupCpeEscapeRoute(A);
  return A;
}
// A plan shaped like effects.js's, carrying only the beat this feature reads.
const planWith = (rise, durationSec) => ({ beats: { rise: rise }, durationSec: durationSec || 200 });

(async () => {
  const SQL = await initSqlJs();
  const DBP = path.join(process.env.BIM_BUILDINGS || path.join(__dirname, 'buildings'), 'Hospital_meta.db');
  if (!fs.existsSync(DBP)) {
    console.log('§ESCAPE_ROUTE_WITNESS INCONCLUSIVE — buildings/Hospital_meta.db not present. Every claim' +
      ' below needs a REAL room graph; a synthetic one would prove the fixture, not the feature.' +
      ' Re-run with BIM_BUILDINGS pointing at a checkout that has it.');
    process.exit(2);
  }
  const db = new SQL.Database(new Uint8Array(fs.readFileSync(DBP)));
  const q = (sql, p) => { const r = p ? db.exec(sql, p) : db.exec(sql); return r.length ? r[0].values : []; };
  const graph = RoomGraph.buildGraph(q, { log: () => {} });
  console.log('§ESCAPE_ROUTE_WITNESS db=Hospital_meta.db rooms=' + graph.nodes.length +
    ' edges=' + graph.edges.length);

  // ══ W-ESC-1 — §SELECTION. ISSUE: does this film point at the room the Egress panel's headline
  // "Longest path to exit" number is actually about, or at a second, quietly different worst case?
  // Disproved by any disagreement between the argmax this feature takes and the max the evaluator's
  // own rows carry. ═══════════════════════════════════════════════════════════════════════════
  const rules = JSON.parse(fs.readFileSync(path.join(__dirname, 'viewer/rates/egress_rules.json'), 'utf8'));
  const rows = EgressSanity.evaluate(q, rules, { log: () => {} });
  const circ = rows.filter(r => r.rule === 'circulation_distance' && r.ratio != null);
  const ruleMax = circ.reduce((m, r) => (m === null || r.ratio > m ? r.ratio : m), null);
  const ruleSteps = ruleMax === null ? null : Math.round(ruleMax / 0.75);   // _rcLongestExitSteps, verbatim
  let argmax = null;
  graph.nodes.forEach(n => {
    const e = RoomGraph.escapeRoute(graph, n.guid, { log: () => {} });
    if (e && e.distance != null && isFinite(e.distance) && (!argmax || e.distance > argmax.d))
      argmax = { d: e.distance, guid: n.guid, name: n.name };
  });
  ck('W-ESC-1a the evaluator produced a headline number to agree with', ruleMax !== null,
     'rows=' + circ.length + ' max=' + (ruleMax === null ? 'null' : ruleMax.toFixed(3) + 'm'));
  ck('W-ESC-1b argmax over every room == the max the rule rows carry (the threshold filter cannot remove a maximum)',
     argmax !== null && near(argmax.d, ruleMax, 1e-9),
     'argmax=' + (argmax ? argmax.d.toFixed(6) : '-') + 'm rule=' + (ruleMax === null ? '-' : ruleMax.toFixed(6)) + 'm');
  ck('W-ESC-1c and therefore the SAME step count rule_checklist.js prints',
     argmax !== null && Math.round(argmax.d / 0.75) === ruleSteps,
     'film=~' + (argmax ? Math.round(argmax.d / 0.75) : '-') + ' panel=~' + ruleSteps);

  // The record the rest of the claims run against, built by the real code path.
  const A = makeApp(graph, []);
  const rec = A.escapeRouteBuild();
  ck('W-ESC-1d the module picks that exact room', !!rec && rec.roomGuid === (argmax && argmax.guid),
     rec ? 'room="' + rec.roomName + '" cost=' + rec.graphCostM.toFixed(3) + ' walk=' + rec.walkM.toFixed(2) + 'm' : 'build returned null');
  if (!rec) { console.log('§ESCAPE_ROUTE_WITNESS ABORT — nothing built, the remaining claims would be vacuous'); process.exit(1); }

  // ══ W-ESC-1e — §ESCAPE_ROUTE_COST_IS_NOT_A_DISTANCE. ISSUE: escapeRoute().distance is a
  // PENALTY-WEIGHTED Dijkstra cost (§UTILITY-ROUTING-PENALTY, x8 on any edge touching a utility
  // room), not a length — so the spec's §3 premise ("both numbers come from that distance") would
  // print a wrong number over a right picture. Disproved if the card's figures ever trace back to
  // the cost instead of to the drawn line. This ALSO documents a defect in shipped code that is
  // deliberately NOT fixed here: rule_checklist.js divides that same cost by 0.75 m and calls the
  // result steps.
  let utilNodes = 0;
  Object.keys(graph.nodesByGuid).forEach(k => { if (graph.nodesByGuid[k].isUtility) utilNodes++; });
  ck('W-ESC-1e the cost and the drawn walk are genuinely different quantities on this building',
     rec.costRatio !== null && Math.abs(rec.costRatio - 1) > 0.05,
     'cost=' + rec.graphCostM.toFixed(2) + ' walk=' + rec.walkM.toFixed(2) + 'm ratio=' +
     rec.costRatio.toFixed(2) + ' utilityNodes=' + utilNodes);
  ck('W-ESC-1f the counters read the DRAWN WALK, never the cost',
     rec.steps === Math.round(rec.walkM / 0.75) && rec.steps !== Math.round(rec.graphCostM / 0.75),
     'film=~' + rec.steps + ' steps · the Egress panel would print ~' + Math.round(rec.graphCostM / 0.75));

  const K = A.escapeRouteConstants();
  const plan = planWith(0.929, 229.8);            // Hospital's own measured orbit boundary
  const win = A.escapeRouteWindow(plan);

  // ══ W-ESC-2 — the window is INSIDE the closing orbit and cannot collide with the beat before it.
  // ISSUE: does the reveal actually play where the spec says (after storey-highlight, inside the
  // orbit), or does it overlap the storey tint that ends AT beats.rise? ═══════════════════════
  ck('W-ESC-2a the window opens strictly after the orbit begins', win.start > plan.beats.rise,
     'rise=' + plan.beats.rise + ' start=' + win.start.toFixed(4));
  ck('W-ESC-2b and closes before the film does, leaving the tail to the closing Measure roll',
     win.end < 1, 'end=' + win.end.toFixed(4) + ' tail=' + ((1 - win.end) * plan.durationSec).toFixed(1) + 's');
  ck('W-ESC-2c nothing is drawn at or before beats.rise (no overlap with the storey reveal)',
     A.escapeRouteVisualAt(plan, plan.beats.rise) === null &&
     A.escapeRouteVisualAt(plan, plan.beats.rise - 1e-4) === null);
  ck('W-ESC-2d a plan with no usable rise beat draws nothing rather than guessing a window',
     A.escapeRouteWindow({ beats: { rise: 0 } }) === null && A.escapeRouteWindow({}) === null &&
     A.escapeRouteVisualAt({ beats: {} }, 0.95) === null);

  // ══ W-ESC-3 — §5 claim 1 + 2: the LINE's progressive length and BOTH counters, at EVERY sampled
  // frame of the reveal, not only the last. ISSUE: does the picture's progress and the two printed
  // numbers come from one fraction of one real distance, or can they drift apart? ══════════════
  const N = 240, samples = [];
  let worstLine = 0, worstSteps = 0, worstSec = 0, worstCut = 0, drawn = 0;
  for (let k = 0; k <= N; k++) {
    const tn = win.start + (win.end - win.start) * (k / N);
    const vis = A.escapeRouteVisualAt(plan, tn);
    if (!vis) continue;
    drawn++;
    const w = (tn - win.start) / (win.end - win.start);
    const wantProg = Math.max(0, Math.min(1, w / K.drawFrac));
    worstLine = Math.max(worstLine, Math.abs(vis.drawnM - wantProg * rec.walkM));
    worstSteps = Math.max(worstSteps, Math.abs(vis.steps - Math.round(vis.drawnM / K.strideM)));
    worstSec = Math.max(worstSec, Math.abs(vis.walkSec - vis.drawnM / K.walkMs));
    const cut = A.escapeRouteCutAt(vis.progress);
    // the DRAWN geometry's own arc length is the same fraction of the polyline as drawnM is of the
    // measured distance — the two are cut by one number, which is what makes the picture honest
    worstCut = Math.max(worstCut, Math.abs(cut.lenM / rec.walkM - vis.drawnM / rec.walkM));
    samples.push(vis);
  }
  ck('W-ESC-3a the reveal really opened on the sampled frames', drawn > 100, 'drawnSamples=' + drawn + '/' + (N + 1));
  ck('W-ESC-3b line progress == (frame fraction) x the measured drawn walk, every sampled frame',
     worstLine < 1e-9, 'worst=' + worstLine.toExponential(2) + 'm');
  ck('W-ESC-3c the DRAWN polyline is cut at that same fraction of the real walk',
     worstCut < 1e-9, 'worst=' + worstCut.toExponential(2));
  ck('W-ESC-3d steps == round(drawn / ' + K.strideM + ' m), every sampled frame', worstSteps === 0,
     'worst=' + worstSteps + ' steps');
  ck('W-ESC-3e walk seconds == drawn / ' + K.walkMs + ' m/s, every sampled frame', worstSec < 1e-9,
     'worst=' + worstSec.toExponential(2) + 's');
  const last = samples[samples.length - 1];
  ck('W-ESC-3f the finished line carries the WHOLE measured distance, not a rounded-off share',
     near(last.drawnM, rec.walkM, 1e-9) && last.steps === rec.steps,
     'drawn=' + last.drawnM.toFixed(6) + 'm of ' + rec.walkM.toFixed(6) + 'm  steps=~' + last.steps);
  ck('W-ESC-3g the two units are DIFFERENT derivations of the same distance (not one computed from the other)',
     Math.abs(rec.steps - rec.walkSec) > 1e-6 && near(rec.steps, Math.round(rec.walkM / 0.75)) &&
     near(rec.walkSec, rec.walkM / 1.19, 1e-12),
     '~' + rec.steps + ' steps · ' + rec.walkSec.toFixed(1) + 's');

  // ══ W-ESC-4 — §5 claim 4: the camera ease does NOT touch film time. ISSUE: the whole spec turns
  // on this. Tested twice — the warp's own maths, and a STATIC read of the one place cinema_maxq
  // uses it, because "it returns a separate value" is only true if the caller keeps them separate.
  const warp = (w) => {
    const t = A.escapeRouteEaseFilmT(plan, win.start + (win.end - win.start) * w);
    return (t - win.start) / (win.end - win.start);
  };
  ck('W-ESC-4a warp(0)=0 and warp(1)=1 — the camera is exactly where it would have been at both ends',
     near(warp(1e-12), 0, 1e-9) && near(warp(1 - 1e-12), 1, 1e-9));
  ck('W-ESC-4b the rate is 1 at both edges — it eases in and out, it does not step',
     near(A.escapeRouteEaseRate(0), 1, 1e-12) && near(A.escapeRouteEaseRate(1), 1, 1e-12));
  let mono = true, minR = Infinity, maxR = -Infinity, prev = -1;
  for (let k = 0; k <= 2000; k++) {
    const w = k / 2000, v = warp(w), r = A.escapeRouteEaseRate(w);
    if (v < prev - 1e-12) mono = false;
    prev = v; minR = Math.min(minR, r); maxR = Math.max(maxR, r);
  }
  ck('W-ESC-4c monotone — the camera can never run backwards', mono);
  ck('W-ESC-4d it genuinely SLOWS mid-reveal (this is the feature, not a no-op)', minR < 0.5,
     'rate ' + minR.toFixed(3) + 'x .. ' + maxR.toFixed(3) + 'x, easeA=' + K.easeA);
  ck('W-ESC-4e outside the window it is the identity, to the bit',
     A.escapeRouteEaseFilmT(plan, 0.5) === 0.5 && A.escapeRouteEaseFilmT(plan, win.start) === win.start &&
     A.escapeRouteEaseFilmT(plan, win.end) === win.end && A.escapeRouteEaseFilmT(plan, 1) === 1);

  // The static half. A grep is weak evidence in general — here it is the RIGHT evidence, because
  // the claim IS about which variable the eased value is allowed to reach.
  const mq = fs.readFileSync(path.join(__dirname, 'viewer/cinema_maxq.js'), 'utf8');
  const loopBody = mq.slice(mq.indexOf('for (var i = 0; i < nFrames; i++) {'));
  const tnAssigns = (loopBody.match(/_tnFilm\s*=/g) || []).length;
  ck('W-ESC-4f _tnFilm is assigned exactly ONCE per frame and never re-written', tnAssigns === 1,
     'assignments=' + tnAssigns);
  ck('W-ESC-4g the eased value lands only in _poseFilmT',
     /var _poseFilmT = \(_escapeRoute && A\.escapeRouteEaseFilmT\) \? A\.escapeRouteEaseFilmT\(plan, _tnFilm\) : _tnFilm;/.test(loopBody) &&
     (loopBody.match(/escapeRouteEaseFilmT/g) || []).length === 2);
  ck('W-ESC-4h and _poseFilmT is handed to nothing but the pose',
     (loopBody.match(/_poseFilmT/g) || []).length === 2 && /poseAtFilm\(_poseFilmT\)/.test(loopBody));
  ck('W-ESC-4i the day counter, the sun arc, the sun compass and the buildup cursor all still read the REAL film fraction',
     /_sunArcStep\(_tnFilm\)/.test(loopBody) && /_sunArcFillPin\(_tnFilm, _revealU\)/.test(loopBody) &&
     /sunCompassAt\(_sunCompassMs, _tFilm\(_tn\)\)/.test(loopBody) && /_buildupTAt\(_tFilm\(_tn\), plan\)/.test(loopBody));
  ck('W-ESC-4j poseAt(tn) is still exactly poseAtFilm(_tFilm(tn)) — the split changed no path',
     /function poseAt\(tNorm\) \{ return poseAtFilm\(_tFilm\(tNorm\)\); \}/.test(mq));

  // ══ W-ESC-5 — §5 claim 3: the overlay-suppression flag is true ONLY in the window, and restores.
  // ISSUE: a hide flag left set past its beat silently strips the HUD off the rest of the film. ══
  const marks = [0.0, 0.5, plan.beats.rise, win.start - 1e-6, (win.start + win.end) / 2, win.end + 1e-6, 1.0];
  const got = marks.map(t => { A.escapeRouteApplyVisual(plan, t); return !!A._escRouteHudSuppress; });
  ck('W-ESC-5a suppressed inside the window only', JSON.stringify(got) === JSON.stringify(
     [false, false, false, false, true, false, false]), JSON.stringify(got));
  A.escapeRouteApplyVisual(plan, (win.start + win.end) / 2);
  ck('W-ESC-5b it is genuinely engaged before the restore is tested', A._escRouteHudSuppress === true);
  A.escapeRouteApplyVisual(null, 0);                       // the forced restore every bake exit path makes
  ck('W-ESC-5c the forced restore clears it', A._escRouteHudSuppress === false);
  ck('W-ESC-5d it is NOT the §129.1 freeze flag — this file never touches that mechanism',
     fs.readFileSync(path.join(__dirname, 'viewer/cpe_escape_route.js'), 'utf8').indexOf('__drawUnlessHold') < 0 &&
     /_escRouteHudSuppress/.test(mq) && /function _hudGate/.test(mq));

  // ══ W-ESC-6 — the honesty asymmetry reaches the SCREEN, not just the comments (§3's own ruling:
  // the panel showing the speed itself is what keeps this honest). ═════════════════════════════
  const card = A.escapeRouteStatCardAt(plan, (win.start + win.end) / 2);
  ck('W-ESC-6a the card is titled "Escape Route" — unambiguous, red1\'s own word',
     !!card && card.card.label === 'Escape Route', card ? JSON.stringify(card.card) : 'null');
  ck('W-ESC-6b the uncited number keeps its ~ and the cited one does not', !!card &&
     /^~\d+ steps/.test(card.card.sub) && /^\d+:\d\d$/.test(card.card.big));
  ck('W-ESC-6c the walking SPEED itself is on the card, with its source named', !!card &&
     card.card.sub.indexOf('1.19 m/s (SFPE)') >= 0 && card.card.sub.indexOf('0.75 m stride assumed') >= 0,
     card ? card.card.sub : '');
  ck('W-ESC-6d the card also prints the metres, so neither derived number stands alone', !!card &&
     / \d+ m walked /.test(card.card.sub));

  // ══ W-ESC-7 — no pixel-derived evidence, asserted about THIS file. ════════════════════════════
  // ⚠ The needles are ASSEMBLED, not written out. A literal list of forbidden words in a file that
  // then searches ITSELF for them always fails — the first cut of this check did exactly that, and
  // reported a pixel dependency this witness does not have. Self-referential tests lie in both
  // directions, so the needle must not be able to be its own match.
  const self = fs.readFileSync(__filename, 'utf8');
  const forbidden = ['createImage' + 'Bitmap', 'ff' + 'mpeg', 'Io' + 'U', '.pn' + 'g\'', '.mp' + '4\'', 'toBl' + 'ob'];
  const hits = forbidden.filter(n => self.indexOf(n) >= 0);
  ck('W-ESC-7 this witness opens no frame, no image and no video — every claim is a real predicate',
     hits.length === 0, hits.length ? 'found: ' + hits.join(', ') : 'none of ' + forbidden.length + ' pixel-evidence markers present');

  console.log('\n§ESCAPE_ROUTE_WITNESS ' + (fail ? 'FAIL' : 'PASS') + ' checks=' + (pass + fail) +
    ' wrong=' + fail + ' — room="' + rec.roomName + '" drawnWalk=' + rec.walkM.toFixed(2) +
    'm steps=~' + rec.steps + ' time=' + Math.round(rec.walkSec) + 's' +
    '  (graphCost=' + rec.graphCostM.toFixed(2) + ', ratio ' + rec.costRatio.toFixed(2) +
    ' — see W-ESC-1e)');
  process.exit(fail ? 1 : 0);
})();
