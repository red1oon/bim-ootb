#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-RULE-FINDINGS-FILM scope (READ THE LOG after every run)
 * SCOPE: bim-compiler prompts/MEP_CLASH_REVEAL_MOVIE.md §59 + §63 + §68 + §70. Node, no browser.
 * RUN: node witness_rule_findings_film.js
 *
 * §70 REWRITE: findings are no longer tied to the storey-reveal window. They are world content for
 * the whole film with labels ranked per frame, exactly as clash does it. Every check that existed
 * only to test the storey window (the old scenarios 1-5: window-fits, NOFIT, INCONCLUSIVE-on-no-
 * storeyReveal, linger-fit, HHS slot arithmetic) is RETIRED WITH ITS CAUSE, not silently deleted —
 * K2 and K6 below assert the retirement itself so a reader can see it was deliberate.
 *
 * ISSUES THIS WITNESS EXPOSES:
 *   K1 ALL-FINDINGS-MARKED      — every finding's guid reaches showRuleModeTint, not 1-2 picks.
 *   K2 NO-STOREY-DEPENDENCY     — a plan with NO storeyReveal still reaches BEAT and marks all.
 *   K3 TOP-N-NEAREST-WINS       — the nearest findings are labelled; at most TOP_N in a frame.
 *   K4 FRUSTUM-SKIP             — a finding behind the camera carries no label, and is counted.
 *   K5 OVERLAP-SKIP             — two findings on the same screen point yield one label, one skip.
 *   K6 NOFIT-IS-GONE            — no NOFIT state exists any more; a short window is not a failure.
 *   G1-G5 §63 MESSAGING         — unit from the rule definition, Revit name trimmed.
 *   X1-X3 §59/§68               — category inks, shine-through opt-in, distance-to-exit arithmetic.
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

(async () => {
  // ── K1 / K2: no storeyReveal anywhere on the plan ──
  const { A: A1, report: r1 } = await build({ beats: { rise: 0.9 }, durationSec: 100 });
  chk('K2 §70 a plan with NO storeyReveal still reaches BEAT (the old INCONCLUSIVE is retired with its cause)',
      r1.state === 'BEAT', r1.state);
  chk('K1 §70 EVERY finding is marked — all 5, not 1-2 picks',
      A1._tints.length === 1 && Object.keys(A1._tints[0].map).length === 5,
      'tinted=' + (A1._tints[0] && Object.keys(A1._tints[0].map).length));
  chk('X2 §62 the tint is still asked for shine-through',
      A1._tints[0] && A1._tints[0].o && A1._tints[0].o.shineThrough === true, JSON.stringify(A1._tints[0].o));
  const st1 = A1.ruleFindingsFilm.stats();
  chk('K6 §70 there is no NOFIT state any more — a short/absent window is not a failure',
      r1.state !== 'NOFIT' && st1.built === true, r1.state);
  chk('X3 §59.4 distance-to-exit arithmetic survives the rework (37.5m @1.2 = 31.25s, /0.75 = 50 steps)',
      Math.abs(st1.maxExitDistSec - 37.5 / 1.2) < 1e-9 && st1.maxExitDistSteps === 50,
      st1.maxExitDistSec + 's / ' + st1.maxExitDistSteps + ' steps');

  const byRule = {}; r1.picks.forEach(p => { byRule[p.row.rule] = p; });
  chk('X1 §68 category inks — structural #ffaa33, safety #e57373',
      byRule.span_depth_steel.ink === '#ffaa33' && byRule.door_clear_width.ink === '#e57373',
      byRule.span_depth_steel.ink + ' / ' + byRule.door_clear_width.ink);
  chk('G1 §63 a metre rule says "0.80 m", not "ratio 0.8"', byRule.door_clear_width.rows[2] === '0.80 m', byRule.door_clear_width.rows[2]);
  chk('G2 §63 a ratio rule still says "ratio 27.3"', byRule.span_depth_steel.rows[2] === 'ratio 27.3', byRule.span_depth_steel.rows[2]);
  chk('G3 §63 a rule declaring neither unit gets the bare number, no unit word', byRule.floating_member.rows[2] === '4.2', byRule.floating_member.rows[2]);
  chk('G4 §63 ratio==null still shows the severity word', byRule.column_continuity.rows[2] === 'CRITICAL', byRule.column_continuity.rows[2]);
  chk('G5 §63 the real HHS Revit name trims to family + type', byRule.column_continuity.rows[0] === 'STB Stütze - rund · STB d=30', byRule.column_continuity.rows[0]);
  chk('G5b §63 a name with no ":" is unchanged', byRule.floating_member.rows[0] === 'Plain Name', byRule.floating_member.rows[0]);

  // ── K3/K4/K5: the per-frame label pass ──
  // Positions: b1 near, b2 far, b3 behind camera, d1+r1 on the SAME screen point as each other.
  const AT = { b1:{x:0,y:0,z:-10}, b2:{x:0,y:0,z:-500}, b3:{x:0,y:0,z:10}, d1:{x:5,y:0,z:-20}, r1:{x:5,y:0,z:-20} };
  A1._ruleTintAt = AT;
  A1.camera = fakeCamera(v => {
    const behind = v.z > 0;
    // everything maps inside NDC except the behind-camera one
    const key = Object.keys(AT).find(k => AT[k].x === v.x && AT[k].z === v.z);
    const sameSpot = (v.x === 5);
    return { viewZ: behind ? 1 : -1, x: sameSpot ? 0.2 : (v.z === -10 ? -0.5 : 0.6), y: 0, z: 0 };
  });
  let shownGuids = null;
  A1.ruleTintShowOnly = (set) => { shownGuids = Object.keys(set || {}); return shownGuids.length; };
  const ctx = recCtx();
  const labelled = A1.ruleFindingsFilmCompositeOntoCanvas(ctx, 1280, 720, 1.0);
  chk('K3 §70 labels are drawn from the ranked nearest set, capped at TOP_N',
      labelled > 0 && labelled <= 8, 'labelled=' + labelled);
  chk('K4 §70 the finding BEHIND the camera carries no label',
      ctx.draws.filter(d => d.kind === 'text' && /floating member/.test(d.text)).length === 0, 'b3 absent');
  chk('K5 §70 two findings on the same screen point yield ONE label, not two',
      labelled < 4, 'labelled=' + labelled + ' of 4 in-frustum marks (one rejected by overlap)');
  chk('K7b §70.6 markers are handed a ranked visibility set every frame (not left all-on)',
      shownGuids !== null, shownGuids ? 'ruleTintShowOnly called with ' + shownGuids.length : 'never called');
  chk('K5b §70 something really was drawn — the pass is not vacuously empty',
      ctx.draws.filter(d => d.kind === 'text').length > 0, ctx.draws.filter(d => d.kind==='text').length + ' text draws');

  // ── K7: narrowing only bites when there are MORE findings than TOP_N (8). The fixture above has 5,
  // so it proves nothing about the cap — this one uses 20. That is the same vacuous-pass trap §66's C3
  // fell into: a check must reach the behaviour it names.
  const many = [];
  for (let i = 0; i < 20; i++) many.push({ guid: 'm' + i, ifc_class: 'IfcBeam', name: 'Beam ' + i, storey: 'L1', rule: 'span_depth_steel', severity: 'WARNING', ratio: 25 + i });
  const { A: A2 } = await build({ beats: { rise: 0.9 }, durationSec: 100 }, { sRows: many, eRows: [] });
  const AT2 = {}; many.forEach((m, i) => { AT2[m.guid] = { x: 0, y: 0, z: -(10 + i * 10) }; });
  A2._ruleTintAt = AT2;
  A2.camera = fakeCamera(v => ({ viewZ: -1, x: 0, y: 0, z: 0 }));
  let shown2 = null;
  A2.ruleTintShowOnly = (set) => { shown2 = Object.keys(set || {}); return shown2.length; };
  A2.ruleFindingsFilmCompositeOntoCanvas(recCtx(), 1280, 720, 1.0);
  chk('K7 §70.6 with 20 findings and TOP_N=8, markers are narrowed to the ranked few — not all 20',
      shown2 !== null && shown2.length <= 8 && shown2.length > 0, 'shown=' + (shown2 ? shown2.length : 'never') + ' of 20');
  chk('K7c §70.6 the NEAREST findings are the ones kept visible',
      shown2 !== null && shown2.indexOf('m0') >= 0 && shown2.indexOf('m19') < 0,
      'nearest m0 in=' + (shown2 && shown2.indexOf('m0') >= 0) + ', farthest m19 in=' + (shown2 && shown2.indexOf('m19') >= 0));

  // ── §71 V1/V2: rank by what is ON SCREEN, then distance. The old order spent all 8 slots on the
  // nearest findings even when every one was behind the camera — 75 of 131 film seconds silent.
  // Fixture: 3 findings very near but BEHIND the camera, 3 far but in front. The far ones must win.
  const vRows = [];
  for (let i = 0; i < 3; i++) vRows.push({ guid: 'near' + i, ifc_class: 'IfcBeam', name: 'Near ' + i, storey: 'L1', rule: 'span_depth_steel', severity: 'WARNING', ratio: 25 });
  for (let i = 0; i < 3; i++) vRows.push({ guid: 'far' + i, ifc_class: 'IfcBeam', name: 'Far ' + i, storey: 'L1', rule: 'span_depth_steel', severity: 'WARNING', ratio: 25 });
  const { A: A3 } = await build({ beats: { rise: 0.9 }, durationSec: 100 }, { sRows: vRows, eRows: [] });
  const AT3 = {};
  vRows.forEach((r, i) => { AT3[r.guid] = i < 3 ? { x: 0, y: 0, z: 2 + i } : { x: 0, y: 0, z: -(100 + i) }; });
  A3._ruleTintAt = AT3;
  A3.camera = fakeCamera(v => ({ viewZ: v.z > 0 ? 1 : -1, x: 0, y: 0, z: 0 }));
  let shown3 = null;
  A3.ruleTintShowOnly = (set) => { shown3 = Object.keys(set || {}); };
  const ctx3 = recCtx();
  const lab3 = A3.ruleFindingsFilmCompositeOntoCanvas(ctx3, 1280, 720, 1.0);
  chk('V1 §71 findings BEHIND the camera never take a slot, even though they are nearest',
      shown3 !== null && shown3.every(g => g.indexOf('near') !== 0),
      'shown=' + JSON.stringify(shown3));
  chk('V2 §71 the FAR but visible findings get the slots, and are labelled',
      lab3 > 0 && shown3.length === 3, 'labelled=' + lab3 + ' shown=' + shown3.length + ' of 3 visible');

  // ── §72 M1/M2: the Measure box must still receive a Sanity entry. The user's standing instruction
  // was "Sanity messages are to append to that"; §70's rewrite silently dropped the call.
  const posts = [];
  const { A: A4 } = await build({ beats: { rise: 0.9 }, durationSec: 100 },
    { A: { filmBoxesMeasurePost: (t, r, ink) => { posts.push({ t, r, ink }); return true; } } });
  const AT4 = {}; S_ROWS.concat(E_ROWS).forEach((r, i) => { AT4[r.guid] = { x: 0, y: 0, z: -(10 + i * 40) }; });
  A4._ruleTintAt = AT4;
  A4.camera = fakeCamera(() => ({ viewZ: -1, x: 0, y: 0, z: 0 }));
  A4.ruleFindingsFilmCompositeOntoCanvas(recCtx(), 1280, 720, 1.0);
  chk('M1 §72 the Measure box still receives a Sanity entry when one is on screen',
      posts.length > 0, posts.length ? JSON.stringify(posts[0].t) : 'NO POST — §70 regression');
  chk('M2 §72 exactly ONE entry is posted per frame (the box shows one at a time), and it is the NEAREST',
      posts.length === 1 && posts[0].r[0] === 'Beam A · T1',
      'posts=' + posts.length + ' first=' + (posts[0] && posts[0].r[0]));
  chk('M3 §72 the echoed entry carries its category ink, so §68 colouring still applies',
      posts[0] && /^#(ffaa33|e57373)$/.test(posts[0].ink), posts[0] && posts[0].ink);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
