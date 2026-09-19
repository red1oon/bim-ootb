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
// cpe_day_counter.js and cpe_resource_panel.js are browser modules with no module.exports, and the
// layout claims below need their REAL box geometry — a re-typed copy would test the copy. Sliced
// and evaluated, the same technique witness_sun_compass_wiring.js already uses on panels.js. If
// either cannot be loaded, W-ESC-8a fails loudly rather than silently measuring an empty reserve.
function loadHudGeometry(A) {
  ['cpe_day_counter.js', 'cpe_resource_panel.js'].forEach(function (f) {
    const src = fs.readFileSync(path.join(__dirname, 'viewer', f), 'utf8');
    const name = 'setup' + f.replace(/\.js$/, '').replace(/(^|_)([a-z])/g, (m, a, b) => b.toUpperCase());
    try { eval(src + '\n' + name + '(A);'); }
    catch (e) { console.log('  §WER note ' + f + ' setup threw (' + e.message + ') — geometry may be partial'); }
  });
}
function makeApp(graph, volumes) {
  const A = { activeBuilding: 'Hospital_meta' };
  A.getRoomGraph = () => graph;
  // scene.js's own convention, verbatim (IFC X=east/Y=north/Z=up → three X=east/Y=up/Z=south).
  // A pure rotation, so every arc length below is the real walked length in metres.
  A.ifc2three = (ix, iy, iz) => ({ x: ix, y: iz, z: -iy });
  A.allRoomVolumes = () => volumes;
  loadHudGeometry(A);
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

  // ══ W-ESC-1 — §SELECTION. ISSUE: a film captioned "longest walk out" must show the room that
  // really walks furthest. The Egress panel ranks by escapeRoute().distance, a penalty-weighted
  // COST — so "reuse the panel's selection" (the spec's §1 instinct) picks the wrong room. This
  // block proves three separate things: that the panel's ranking IS the cost, that the cost and the
  // walk name DIFFERENT rooms on real data, and that the film takes the walk.
  // Disproved if the module ever picks the cost-ranked room while a longer real walk exists.
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  const rules = JSON.parse(fs.readFileSync(path.join(__dirname, 'viewer/rates/egress_rules.json'), 'utf8'));
  const rows = EgressSanity.evaluate(q, rules, { log: () => {} });
  const circ = rows.filter(r => r.rule === 'circulation_distance' && r.ratio != null);
  const ruleMax = circ.reduce((m, r) => (m === null || r.ratio > m ? r.ratio : m), null);
  const ruleSteps = ruleMax === null ? null : Math.round(ruleMax / 0.75);   // _rcLongestExitSteps, verbatim
  // Both rankings, computed here independently of the module.
  let byCost = null, byWalk = null;
  graph.nodes.forEach(n => {
    const e = RoomGraph.escapeRoute(graph, n.guid, { log: () => {} });
    if (!e || e.distance == null || !isFinite(e.distance)) return;
    if (!byCost || e.distance > byCost.cost) byCost = { cost: e.distance, guid: n.guid, name: n.name };
    const sp = RoomGraph.shortestPath(graph, n.guid, e.exitGuid);
    if (!sp || !sp.polyline || sp.polyline.length < 2) return;
    let L = 0;
    for (let i = 1; i < sp.polyline.length; i++) {
      const a = sp.polyline[i - 1], b = sp.polyline[i];
      L += Math.hypot(b.x - a.x, b.y - a.y, (b.z || 0) - (a.z || 0));
    }
    if (!byWalk || L > byWalk.walk) byWalk = { walk: L, cost: e.distance, guid: n.guid, name: n.name, storey: n.storey };
  });
  ck('W-ESC-1a the evaluator produced a headline number at all', ruleMax !== null,
     'rows=' + circ.length + ' max=' + (ruleMax === null ? 'null' : ruleMax.toFixed(3)));
  ck('W-ESC-1b the Egress panel\'s headline IS the cost — max over its rows == argmax of escapeRoute().distance',
     byCost !== null && near(byCost.cost, ruleMax, 1e-9) && Math.round(byCost.cost / 0.75) === ruleSteps,
     'panel ranks "' + (byCost && byCost.name) + '" at ' + (byCost ? byCost.cost.toFixed(3) : '-') +
     ' → ~' + ruleSteps + ' steps');
  ck('W-ESC-1c the cost and the real walk name DIFFERENT rooms — this is why the panel\'s selection is not reused',
     byCost !== null && byWalk !== null && byCost.guid !== byWalk.guid,
     'cost→"' + (byCost && byCost.name) + '" (walk would be much shorter)  vs  walk→"' +
     (byWalk && byWalk.name) + '" ' + (byWalk ? byWalk.walk.toFixed(1) : '-') + 'm on ' + (byWalk && byWalk.storey));

  // The record the rest of the claims run against, built by the real code path.
  const A = makeApp(graph, []);
  const rec = A.escapeRouteBuild();
  if (rec) console.log('  (selection scan over ' + rec.roomsScanned + ' rooms took ' +
    rec.scanMs.toFixed(0) + ' ms — once per bake, before the frame loop)');
  ck('W-ESC-1d the module picks the LONGEST REAL WALK, not the cost-ranked room (red1: "Get the longest of course")',
     !!rec && byWalk !== null && rec.roomGuid === byWalk.guid && rec.roomGuid !== byCost.guid,
     rec ? 'room="' + rec.roomName + '" walk=' + rec.walkM.toFixed(2) + 'm cost=' + rec.graphCostM.toFixed(2) : 'build returned null');
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
  ck('W-ESC-1f2 the drawn length is the one that WON the selection, not a re-derivation',
     !!rec && byWalk !== null && near(rec.walkM, byWalk.walk, 1e-9),
     'module=' + rec.walkM.toFixed(6) + 'm independent=' + byWalk.walk.toFixed(6) + 'm');
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
  // The flag no longer hides anything (red1 retired that — see W-ESC-8f). It is still maintained
  // as the module's own "the window is open" record, and these four still prove the window
  // lifecycle: it opens where it should, and the forced restore really does close it.
  ck('W-ESC-5a the window flag is true inside the window only', JSON.stringify(got) === JSON.stringify(
     [false, false, false, false, true, false, false]), JSON.stringify(got));
  A.escapeRouteApplyVisual(plan, (win.start + win.end) / 2);
  ck('W-ESC-5b it is genuinely engaged before the restore is tested', A._escRouteHudSuppress === true);
  A.escapeRouteApplyVisual(null, 0);                       // the forced restore every bake exit path makes
  ck('W-ESC-5c the forced restore clears it', A._escRouteHudSuppress === false);
  ck('W-ESC-5d the §129.1 freeze mechanism is never touched — not then, and not now that the flag gates nothing',
     fs.readFileSync(path.join(__dirname, 'viewer/cpe_escape_route.js'), 'utf8').indexOf('__drawUnlessHold') < 0 &&
     /_escRouteHudSuppress/.test(mq));

  // ══ W-ESC-6 — the honesty asymmetry reaches the SCREEN, not just the comments (§3's own ruling:
  // the panel showing the speed itself is what keeps this honest). ═════════════════════════════
  const card = A.escapeRouteStatCardAt(plan, (win.start + win.end) / 2);
  ck('W-ESC-6a the card is titled "Escape Route" — unambiguous, red1\'s own word',
     !!card && card.card.label === 'Escape Route', card ? JSON.stringify(card.card) : 'null');
  ck('W-ESC-6b the uncited number keeps its ~ and the cited one does not', !!card &&
     /^~\d+ steps/.test(card.card.sub) && /^(\d+ secs|\d+:\d\d mins)$/.test(card.card.big),
     card ? card.card.big : '');
  // red1, 2026-09-20: "It be good to indicate so with 'secs'". A bare mm:ss reads as a clock.
  ck('W-ESC-6e the headline names its unit at both scales, and never shows a bare mm:ss',
     A.escapeRouteFmtWalk(28) === '28 secs' && A.escapeRouteFmtWalk(59) === '59 secs' &&
     A.escapeRouteFmtWalk(60) === '1:00 mins' && A.escapeRouteFmtWalk(263) === '4:23 mins',
     [28, 59, 60, 263].map(A.escapeRouteFmtWalk).join(' | '));
  ck('W-ESC-6c the walking SPEED itself is on the card, with its source named', !!card &&
     card.card.sub.indexOf('1.19 m/s (SFPE)') >= 0 && card.card.sub.indexOf('0.75 m stride assumed') >= 0,
     card ? card.card.sub : '');
  ck('W-ESC-6d the card also prints the metres, so neither derived number stands alone', !!card &&
     / \d+ m walked /.test(card.card.sub));

  // ══ W-ESC-8 — §ESCAPE_ROUTE_HUD_RESERVE. red1, 2026-09-20: "this added HUD panel also must find
  // an empty spot to display to avoid overlapping the others". ISSUE: the two scene-anchored plates
  // wander with the orbit, so they can land on each other and on the corner HUD column. Disproved
  // by any anchor position that leaves a plate overlapping when a free corner existed.
  // No canvas, no camera: the placement predicate is exercised directly.
  const W = 1920, H = 1080;
  // The column's real measured depth, as cinema_maxq.js stashes it: day counter + sun clock +
  // compass readout + path box + card. 620 px is a realistic full column at h=1080.
  const reserved = A.escapeRouteReservedRects(W, H, 'tr', 620);
  ck('W-ESC-8a the reserve is ONE strip covering the whole corner column, not a box or two',
     reserved.length === 1 && reserved[0].h === 620 && reserved[0].w > 0,
     reserved.map(r => r.x + ',' + r.y + ' ' + r.w + 'x' + r.h).join('  |  '));
  ck('W-ESC-8b with no measurement yet (frame 1) it still reserves the card, never nothing',
     (() => { const r0 = A.escapeRouteReservedRects(W, H, 'tr', 0);
              return r0.length === 1 && r0[0].h > 0; })(),
     JSON.stringify(A.escapeRouteReservedRects(W, H, 'tr', 0)[0]));
  ck('W-ESC-8b2 a bottom-anchored column reserves upward from the bottom margin, not downward',
     (() => { const rb = A.escapeRouteReservedRects(W, H, 'br', 620)[0];
              return rb.y + rb.h <= H && rb.y < H - 620 + 1; })(),
     JSON.stringify(A.escapeRouteReservedRects(W, H, 'br', 620)[0]));

  // Sweep anchor pairs across the whole frame, including deliberately hostile ones: both anchors
  // inside the corner column, and both on the same point.
  let worst = 0, cases = 0, hostile = 0, hostileClean = 0;
  for (let ax = 0.02; ax <= 0.98; ax += 0.04) {
    for (let ay = 0.02; ay <= 0.98; ay += 0.08) {
      const labels = [
        { key: 'Start', rows: ['Start', '≈ Level 4 R1'], sx: ax * W, sy: ay * H },
        { key: 'Exit', rows: ['Exit', 'M_Single-Flush:0915'], sx: ax * W + 24, sy: ay * H + 12 }
      ];
      A.escapeRoutePlaceLabels(labels, W, H, reserved);
      cases++;
      // the two plates must never overlap EACH OTHER — there is always room for two on a 1920x1080
      const pairHit = A.escapeRouteRectsHit(labels[0], labels[1]) ? 1 : 0;
      worst = Math.max(worst, pairHit);
      const inColumn = reserved.some(r => A.escapeRouteRectsHit(
        { x: ax * W - 4, y: ay * H - 4, w: 8, h: 8 }, r));
      if (inColumn) { hostile++; if (!labels.some(l => reserved.some(r => A.escapeRouteRectsHit(l, r)))) hostileClean++; }
      labels.forEach(l => { if (l.x < 0 || l.y < 0 || l.x + l.w > W || l.y + l.h > H) worst = 9; });
    }
  }
  ck('W-ESC-8c across ' + cases + ' anchor positions the two plates never overlap each other, and never leave the frame',
     worst === 0, 'worstCode=' + worst);
  ck('W-ESC-8d anchors landing UNDER the corner column still place clear of it',
     hostile > 0 && hostileClean === hostile,
     hostileClean + '/' + hostile + ' hostile anchors placed clear');
  ck('W-ESC-8e the card itself needs no spot — it REPLACES a bigStats card rather than adding a box',
     /_statInfo = \{ shown: _ec, pos: _ovPos, held: null \};/.test(mq) &&
     (mq.match(/escapeRouteStatCardAt/g) || []).length === 2);   // the guard and the call, nothing more
  // red1, 2026-09-20, overriding the spec's own §2 item 7: "the new HUD should not make the other
  // HUDs go away." ISSUE: the suppression is retired — is it really gone, or just defaulted off
  // somewhere it could creep back? Disproved by ANY draw call still reading the flag.
  ck('W-ESC-8f NOTHING is suppressed any more — no draw call reads the flag, and _hudGate is gone',
     mq.indexOf('function _hudGate') < 0 &&
     !/!A\._escRouteHudSuppress &&/.test(mq) &&
     (mq.match(/_hudHold\('suncompass\.(clock|readout)'/g) || []).length === 2 &&
     /if \(ovInfo && ovInfo\.ov && A\.pathOverviewCompositeOntoCanvas\)/.test(mq) &&
     /if \(resInfo && resInfo\.info && A\.resourcePanelCompositeOntoCanvas\)/.test(mq));
  ck('W-ESC-8g the column depth the reserve uses is MEASURED by the compositor, not guessed here',
     /A\._hudStackBottom = _stackY \+/.test(mq) &&
     /escapeRouteReservedRects\(w, h, _ovPos, A\._hudStackBottom\)/.test(mq));

  // ══ W-ESC-9 — §ESCAPE_ROUTE_NOT_A_CORRIDOR. red1's clip picked "Level 4 Hall/Corridor 3" on
  // Hospital_silent: a CORRIDOR_ROOM:: pseudo-room injected by §CORRIDOR-ROOM-BACKPROP. Nobody
  // starts an escape in a corridor — the corridor IS the route — and it carries no room box, so
  // the film had nothing to light either. ISSUE: does the candidate set exclude them?
  const corridorNodes = graph.nodes.filter(n => String(n.guid).indexOf('CORRIDOR_ROOM::') === 0);
  ck('W-ESC-9a this building actually has corridor pseudo-rooms to exclude (else the claim is vacuous)',
     corridorNodes.length > 0, corridorNodes.length + ' of ' + graph.nodes.length + ' nodes');
  ck('W-ESC-9b the chosen room is not one of them', String(rec.roomGuid).indexOf('CORRIDOR_ROOM::') !== 0,
     '"' + rec.roomName + '" (' + rec.roomGuid + ')');
  ck('W-ESC-9c and the count skipped is reported, not silently dropped',
     rec.corridorsSkipped === corridorNodes.length,
     'skipped=' + rec.corridorsSkipped + ' present=' + corridorNodes.length);
  // A corridor DOES sometimes win on length — prove the exclusion is load-bearing, not decorative.
  let corridorLonger = 0;
  corridorNodes.forEach(n => {
    const e = RoomGraph.escapeRoute(graph, n.guid, { log: () => {} });
    if (!e || e.distance == null) return;
    const sp = RoomGraph.shortestPath(graph, n.guid, e.exitGuid);
    if (!sp || !sp.polyline || sp.polyline.length < 2) return;
    let L = 0;
    for (let i = 1; i < sp.polyline.length; i++) {
      const a = sp.polyline[i - 1], b = sp.polyline[i];
      L += Math.hypot(b.x - a.x, b.y - a.y, (b.z || 0) - (a.z || 0));
    }
    if (L > rec.walkM) corridorLonger++;
  });
  console.log('  (corridor pseudo-rooms whose route is LONGER than the chosen real room: ' +
    corridorLonger + ' — each one would have been picked without the exclusion)');

  // ══ W-ESC-10 — §ESCAPE_ROUTE_BREACH. red1: "is that breaking any fire dept conditions? If so,
  // it be good to flag in the HUD". ISSUE: is the limit the rulebook's own, and does the flag
  // reach the card? Disproved by a threshold typed into this feature instead of read from
  // rates/egress_rules.json / EgressSanity.FALLBACK_RULES.
  // COMMENTS STRIPPED FIRST. The file's own header explains the IBC limit and therefore contains
  // the number; a raw grep flags that and says the threshold is hardcoded, which is false. The
  // claim is about CODE, so the test must be about code. (First cut got this wrong — same
  // self-referential trap as W-ESC-7.)
  const esrc = fs.readFileSync(path.join(__dirname, 'viewer/cpe_escape_route.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n');
  ck('W-ESC-10a no threshold is typed into this feature\'s CODE — the limits come from the rulebook alone',
     esrc.indexOf('60.96') < 0 && esrc.indexOf('45.7') < 0 && /_rules\.critical_m/.test(esrc),
     'reads _rules.critical_m from A.escapeRouteSetRules()');
  ck('W-ESC-10b with no rulebook loaded there is NO flag rather than a guessed limit',
     A.escapeRouteBreach() === null);
  A.escapeRouteSetRules(rules, 'rates/egress_rules.json');
  const br = A.escapeRouteBreach();
  const critM = rules.egress_rules.filter(r => r.name === 'circulation_distance')[0].critical_m;
  ck('W-ESC-10c the limit it uses IS the rulebook\'s own number', !!br && br.limitM === critM,
     'rule=' + critM + 'm feature=' + (br ? br.limitM : '-') + 'm');
  ck('W-ESC-10d a ' + rec.walkM.toFixed(0) + ' m route against a ' + critM + ' m limit reads CRITICAL',
     !!br && br.level === 'critical' && br.overBy > 1,
     br ? br.level + ' ' + br.overBy.toFixed(1) + 'x over' : 'null');
  const bcard = A.escapeRouteStatCardAt(plan, (win.start + win.end) / 2);
  ck('W-ESC-10e the flag reaches the CARD, names the limit and names the rule',
     !!bcard && /OVER LIMIT/.test(bcard.card.label) &&
     bcard.card.sub.indexOf(String(critM) + ' m limit') >= 0 &&
     bcard.card.sub.indexOf('IBC 2021 T1017.2') >= 0,
     bcard ? bcard.card.label + '  ||  ' + bcard.card.sub : 'null');
  ck('W-ESC-10f the cited walking speed survives the flag (§3: the speed is always shown)',
     !!bcard && bcard.card.sub.indexOf('1.19 m/s (SFPE)') >= 0);
  ck('W-ESC-10g the flag does NOT claim a code violation — no "violation"/"illegal"/"fail" wording',
     !!bcard && !/violat|illegal|non-?compl|fail/i.test(bcard.card.label + ' ' + bcard.card.sub),
     'wording is "over limit", because the route is measured to an exterior door, not the protected stair T1017.2 regulates');
  ck('W-ESC-10h rooms with NO route at all are counted and reported — a worse finding this film cannot draw',
     typeof rec.roomsWithNoExit === 'number' && rec.roomsWithNoExit === (graph.nodes.length - corridorNodes.length - rec.roomsReachingAnExit),
     rec.roomsWithNoExit + ' room(s) reach no exit; egress_sanity.js calls those isolated_room CRITICAL');

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
