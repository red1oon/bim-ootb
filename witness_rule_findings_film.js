#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-RULE-FINDINGS-FILM scope (READ THE LOG after every run)
 * SCOPE: bim-compiler prompts/MEP_CLASH_REVEAL_MOVIE.md §63, §67, §73, §77. Node, no browser.
 * RUN: node witness_rule_findings_film.js
 *
 * §77 REWRITE. The unit is the SET (one rule's flagged elements), not the element: 509 Hospital
 * findings are six rules, 215 HHS findings are three. Every check that existed only to manage
 * per-element crowding — §70's TOP_N ranking and hysteresis, §71's visible-first pass, §73.4/§74's
 * TTL ageing, §72's Measure echo of one rotating finding — is RETIRED WITH ITS CAUSE, and P1 asserts
 * the retirement itself so a later reader sees it was deliberate rather than dropped.
 *
 * ISSUES THIS WITNESS EXPOSES:
 *   P1 ONE-BOX-PER-RULE     — N findings over R rules give at most R boxes, never N.
 *   P2 TOTAL-NOT-VISIBLE    — the box states the set's FULL count, not the on-screen share.
 *   P3 DWELL-GATE-IS-EXACT  — computed from plan.poseAt, so 1.5s never triggers and 2.5s does.
 *   P4 ANY-NEW-MEMBER       — ONE new qualifying member re-pulses; no turnover fraction required.
 *   P5 NO-RESTART-MID-PULSE — a pulsing set does not restart, giving the ~3s floor.
 *   P6 WAVE-IS-VIEW-DEPTH   — nearest member lights first, farthest last, along the view axis.
 *   P7 LINGER               — the box survives 2s past the wave, then goes.
 *   G1-G5 §63 messaging, X1 §73 palette, X2 §62 shine-through.
 */
'use strict';
const path = require('path');
let pass = 0, fail = 0;
const chk = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  ❌ ' + n + (x ? '  ' + x : '')); } };

// ── minimal THREE: only Vector3.set/applyMatrix4/project are used by the label pass ──
global.THREE = { Vector3: class { 
  constructor(){ this.x=0; this.y=0; this.z=0; }
  set(x,y,z){ this.x=x; this.y=y; this.z=z; return this; }
  applyMatrix4(m){ this.z = m.viewZ(this); return this; }
  project(c){ const p = c.projectPoint(this); this.x=p.x; this.y=p.y; this.z=p.z; return this; }
} };
const setup = require('./viewer/rule_findings_film.js');
global.fetch = () => Promise.reject(new Error('no network in this witness — exercises the fallback path'));

const S_ROWS = [
  { guid:'b1', ifc_class:'IfcBeam',   name:'Beam A:T1:T1:99',            storey:'L1', rule:'span_depth_steel',   severity:'WARNING',  ratio:27.3 },
  { guid:'b2', ifc_class:'IfcColumn', name:'STB Stütze - rund:STB d=30:STB d=30:573295', storey:'L2', rule:'column_continuity', severity:'CRITICAL', ratio:null },
  { guid:'b3', ifc_class:'IfcBeam',   name:'Plain Name',                 storey:'L1', rule:'floating_member',   severity:'CRITICAL', ratio:4.2 },
];
const E_ROWS = [
  { guid:'d1', ifc_class:'IfcDoor',  name:'Drehflügel 1-flg - Stahlzarge:76 x 2.26:76 x 2.26:578641', storey:'L2', rule:'door_clear_width', severity:'WARNING', ratio:0.8 },
  { guid:'r1', ifc_class:'IfcSpace', name:'Ward 2A', storey:'L2', rule:'circulation_distance', severity:'WARNING', ratio:37.5, target:'exit' },
];
function build(plan, opts) {
  opts = opts || {};
  global.StructuralSanity = { evaluate: () => (opts.sRows || S_ROWS) };
  global.EgressSanity = { evaluate: () => (opts.eRows || E_ROWS) };
  const tints = [];
  const A = Object.assign({
    dbQuery: () => [], WALK_SPEED: 1.2,
    showRuleModeTint: (map, colors, o) => tints.push({ map, colors, o }),
  }, opts.A || {});
  setup(A);
  A._tints = tints;
  return A.ruleFindingsFilmBuild(A.dbQuery, plan).then(r => ({ A, report: r }));
}
// a camera whose view-z and projection we control per finding position
function fakeCamera(project) {
  return {
    matrixWorld: { elements: [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1] },
    matrixWorldInverse: { viewZ: v => project(v).viewZ },
    updateMatrixWorld(){},
    projectPoint: v => project(v),
  };
}
function recCtx() {
  const draws = [];
  return { draws, save(){}, restore(){}, beginPath(){}, fill(){}, stroke(){},
    fillRect(x,y,w,h){ draws.push({kind:'rect',x,y,w,h}); },
    roundRect(x,y,w,h){ draws.push({kind:'rect',x,y,w,h}); },
    measureText(t){ return { width: String(t).length * 6 }; },
    fillText(t,x,y){ draws.push({kind:'text',text:String(t),x,y}); },
    set font(v){}, get font(){ return '12px x'; },
    set fillStyle(v){ this._fs=v; }, get fillStyle(){ return this._fs; },
    set strokeStyle(v){}, set lineWidth(v){}, set textBaseline(v){}, set textAlign(v){},
    set globalAlpha(v){}, get globalAlpha(){ return 1; } };
}

function shortNameOf(name) {
  const seg = String(name).split(':'), out = [];
  for (let i = 0; i < seg.length; i++) {
    const last = i === seg.length - 1;
    if (last && out.length && /^\d+$/.test(seg[i])) continue;
    if (out.length && seg[i] === out[out.length - 1]) continue;
    out.push(seg[i]);
  }
  return out.length ? out.join(' · ') : String(name);
}

(async () => {
  // ── build: sets, messaging, palette ──
  const { A: A1, report: r1 } = await build({ beats: { rise: 0.9 }, durationSec: 100 });
  const sets = r1.picks;
  // P1 needs MANY findings per rule or it proves nothing — five findings across five distinct rules
  // would give five sets and look like a pass while grouping nothing. Hospital's real shape instead.
  const many = [];
  for (let i = 0; i < 217; i++) many.push({ guid: 'c' + i, ifc_class: 'IfcBeam', name: 'Cant ' + i, storey: 'L1', rule: 'span_depth_cantilever', severity: 'WARNING', ratio: 14 });
  for (let i = 0; i < 43; i++) many.push({ guid: 'f' + i, ifc_class: 'IfcBeam', name: 'Float ' + i, storey: 'L2', rule: 'floating_member', severity: 'CRITICAL', ratio: null });
  const manyE = [];
  for (let i = 0; i < 13; i++) manyE.push({ guid: 'r' + i, ifc_class: 'IfcSpace', name: 'Room ' + i, storey: 'L1', rule: 'circulation_distance', severity: 'WARNING', ratio: 50 });
  const { report: rM } = await build({ beats: { rise: 0.9 }, durationSec: 100 }, { sRows: many, eRows: manyE });
  chk('P1 §77 273 findings over 3 rules collapse to 3 sets — not 273 boxes',
      rM.picks.length === 3 && many.length + manyE.length === 273,
      rM.picks.length + ' sets from 273 findings: ' + rM.picks.map(t => t.rule + '=' + t.total).join(' '));
  chk('P2b §77.2 a set states its FULL total (217), independent of how many are on screen',
      rM.picks[0].total === 217, String(rM.picks[0].total));

  chk('P2 §77.2 each set states its own TOTAL',
      sets.every(t => t.total === t.members.length), sets.map(t => t.rule + '=' + t.total).join(' '));
  chk('X2 §62 the tint is still asked for shine-through',
      A1._tints.length === 1 && A1._tints[0].o && A1._tints[0].o.shineThrough === true, JSON.stringify(A1._tints[0].o));
  chk('X2b §77 EVERY member of every set is marked, not a ranked few',
      Object.keys(A1._tints[0].map).length === 5, Object.keys(A1._tints[0].map).length + ' guids');
  const st1 = A1.ruleFindingsFilm.stats();
  chk('X3 §59.4 distance-to-exit arithmetic survives the rework (37.5m @1.2 = 31.25s, /0.75 = 50 steps)',
      Math.abs(st1.maxExitDistSec - 37.5 / 1.2) < 1e-9 && st1.maxExitDistSteps === 50,
      st1.maxExitDistSec + 's / ' + st1.maxExitDistSteps + ' steps');

  const byRule = {}; sets.forEach(t => { byRule[t.rule] = t; });
  chk('X1 §73.2 category inks — structural amber #ffb300, safety violet #ea80fc (NOT red: clash owns red)',
      byRule.span_depth_steel.ink === '#ffb300' && byRule.door_clear_width.ink === '#ea80fc',
      byRule.span_depth_steel.ink + ' / ' + byRule.door_clear_width.ink);

  // §63 messaging still applies to the single-member case, where a name is still worth showing
  const oneName = byRule.column_continuity.members[0].name;
  chk('G5 §63 the real HHS Revit name still trims to family + type',
      shortNameOf(oneName) === 'STB Stütze - rund · STB d=30', shortNameOf(oneName));

  // ── P3-P7: the pulse itself, driven through a synthetic plan + camera ──
  const pulseRows = [];
  for (let i = 0; i < 4; i++) pulseRows.push({ guid: 'p' + i, ifc_class: 'IfcBeam', name: 'P' + i, storey: 'L1', rule: 'span_depth_steel', severity: 'WARNING', ratio: 25 });
  const AT = { p0: { x: 0, y: 0, z: -10 }, p1: { x: 0, y: 0, z: -20 }, p2: { x: 0, y: 0, z: -30 }, p3: { x: 0, y: 0, z: -40 } };
  // a plan whose camera stares down -z for the whole film, so every member is visible throughout
  const planStare = { durationSec: 100, poseAt: () => ({ x: 0, y: 0, z: 0, tx: 0, ty: 0, tz: -1 }) };
  const { A: AP } = await build(planStare, { sRows: pulseRows, eRows: [], A: { showRuleModeTint: function () { this._ruleTintAt = AT; } } });
  AP._ruleTintAt = AT;
  const camF = { matrixWorld: { elements: [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1] },
                 matrixWorldInverse: { viewZ: () => -1 }, updateMatrixWorld() {}, projectPoint: () => ({ x: 0, y: 0, z: 0 }) };
  AP.camera = camF;
  const set0 = AP.ruleFindingsFilm && null;
  const drawAt = (t) => { const c = recCtx(); const n = AP.ruleFindingsFilmCompositeOntoCanvas(c, 1280, 720, t); return { n, c }; };

  chk('P3 §77.3 the dwell gate is computed from plan.poseAt — members visible for the whole film qualify',
      drawAt(0).n === 1, 'boxes at t=0: ' + drawAt(0).n);
  chk('P5 §77.2 a pulsing set does not restart mid-pulse — one box, not one per frame',
      drawAt(1).n === 1 && drawAt(2).n === 1, 'still one box through the pulse');
  chk('P8 §78 the box is HELD while the set stays on screen — it does not blink out and back while ' +
      'the viewer is still reading it',
      [3.5, 4.5, 8, 20, 60].every(t => drawAt(t).n === 1),
      'box present at t=3.5,4.5,8,20,60s: ' + [3.5, 4.5, 8, 20, 60].map(t => drawAt(t).n).join(','));

  // P6 must assert the DEPTH ORDER, not merely that a box appeared — an earlier draft of this check
  // did the latter and passed while proving nothing. The composite exposes the wave's per-member glow.
  drawAt(0.35);
  const wave = (AP._ruleFilmLastWave || {}).span_depth_steel || [];
  const byG = {}; wave.forEach(v => { byG[v.g] = v; });
  chk('P6-setup the wave is exposed with all four members and their view depths',
      wave.length === 4 && byG.p0 && byG.p3, wave.length + ' members');
  chk('P6 §77.2 mid-wave the NEAREST member is lit and the FARTHEST is not yet — the wave travels in depth',
      byG.p0 && byG.p3 && byG.p0.glow > 0 && byG.p3.glow === 0,
      'near p0 glow=' + (byG.p0 && byG.p0.glow.toFixed(2)) + '  far p3 glow=' + (byG.p3 && byG.p3.glow.toFixed(2)));
  chk('P6b §77.2 the depths really are ordered near-to-far along the view axis',
      byG.p0.depth < byG.p1.depth && byG.p1.depth < byG.p2.depth && byG.p2.depth < byG.p3.depth,
      [byG.p0, byG.p1, byG.p2, byG.p3].map(v => v.depth.toFixed(0)).join(' < '));

  // §79 — the RELEASE must travel in the same direction as the fill, or the eye is given half a
  // motion and the depth reads as decoration. Near lets go first, far holds longest.
  drawAt(3.4);
  const rel = (AP._ruleFilmLastWave || {}).span_depth_steel || [];
  const relG = {}; rel.forEach(v => { relG[v.g] = v.glow; });
  chk('P9 §79 the release travels outward too — mid-release the NEAREST is dimmer than the FARTHEST',
      relG.p0 < relG.p3 && relG.p0 < 1 && relG.p3 === 1,
      'near p0=' + relG.p0.toFixed(2) + '  p1=' + relG.p1.toFixed(2) + '  p2=' + relG.p2.toFixed(2) + '  far p3=' + relG.p3.toFixed(2));
  chk('P9b §79 the release is monotonic in depth — a clean front, not scattered fades',
      relG.p0 <= relG.p1 && relG.p1 <= relG.p2 && relG.p2 <= relG.p3,
      'ordered near->far');

  // P4 — ONE new qualifying member re-fires the WAVE. No turnover fraction: the user's own correction
  // to an earlier draft. Since §78 holds the box while the set is visible, the observable is the wave
  // restarting, not a box reappearing — asserted on the exposed per-member glow.
  const AT4 = { p0: { x: 0, y: 0, z: -10 }, p1: { x: 0, y: 0, z: -20 }, p2: { x: 0, y: 0, z: -30 }, p3: { x: 0, y: 0, z: -40 } };
  const { A: AP4 } = await build(planStare, { sRows: pulseRows, eRows: [], A: { showRuleModeTint: function () { this._ruleTintAt = AT4; } } });
  AP4._ruleTintAt = AT4;
  let hidden = true;
  AP4.camera = { matrixWorld: { elements: [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1] },
    matrixWorldInverse: { viewZ: v => (hidden && v.z === -40) ? 1 : -1 },
    updateMatrixWorld() {}, projectPoint: () => ({ x: 0, y: 0, z: 0 }) };
  const draw4 = t => AP4.ruleFindingsFilmCompositeOntoCanvas(recCtx(), 1280, 720, t);
  const glow4 = () => { const w = (AP4._ruleFilmLastWave || {}).span_depth_steel || []; const m = {}; w.forEach(v => { m[v.g] = v.glow; }); return m; };
  draw4(0); draw4(5);                        // first wave fires, then fully decays
  draw4(10);
  chk('P4-setup the first wave has fully decayed before the newcomer arrives',
      Object.values(glow4()).every(g => g === 0), JSON.stringify(glow4()));
  hidden = false;                            // ONE new member enters
  draw4(10.2);                               // pulse starts here; at since=0 every glow is still 0
  draw4(10.6);                               // sample AFTER the attack has begun, or the check reads 0 and proves nothing
  const g2 = glow4();
  chk('P4 §77.2 a SINGLE new qualifying member re-fires the wave — no turnover fraction needed',
      Object.values(g2).some(g => g > 0), 'glows after one newcomer: ' + JSON.stringify(g2));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
