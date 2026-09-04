#!/usr/bin/env node
// ⚠ DO NOT REMOVE — WITNESS §SDC (2026-09-04, bim-compiler prompts/PHOTOREAL_STILL_RENDER.md §BME.7)
// Scope: judge the `<out>_tap.json` a `cli_silent_bake.js --tap viewer/tests/tap_staged_draw_census.js`
// run wrote — did every visible, in-frustum element reach the GPU in the staged frame? Read the log
// after every run — the exit code is not evidence.
//
// ISSUE THIS PROVES OR DISPROVES (user, 2026-09-04, Hospital silent bake at Day 310/310, 78 s):
//   "some window glass panels not landed completely, leaving omissions … some chairs but not full
//   table sets". §TM_DRAWN_VS_SCHEDULED scrubs a plain scene and cannot see a loss INSIDE a staged
//   frame; this one reads the draw list of the real bake's own colour pass.
// CAN REPORT ITS OWN FAILURE: INCONCLUSIVE (no tap file / no frame / no colour pass), VACUOUS (a
// class with 0 visible slots in every frame is named, not judged), RED CONTROL (witness_kit).
// Usage: node viewer/tests/witness_staged_draw_census.js /path/to/clip_tap.json
'use strict';
const fs = require('fs');
const { Witness } = require('../../witness_kit/contract');
const file = process.argv[2];
function log(l) { console.log(l); }
if (!file || !fs.existsSync(file)) { log('§SDC_VERDICT INCONCLUSIVE reason=no tap file ' + file); log('§WITNESS_STAGED_DRAW_CENSUS pass=0 fail=0 ran=0 INCONCLUSIVE'); process.exit(2); }
const rep = JSON.parse(fs.readFileSync(file, 'utf8'));
const frames = rep.frames || [], rows = rep.rows || [];
if (!frames.length) { log('§SDC_VERDICT INCONCLUSIVE reason=no frame captured'); log('§WITNESS_STAGED_DRAW_CENSUS pass=0 fail=0 ran=0 INCONCLUSIVE'); process.exit(2); }
if (!frames.some(f => f.colorPasses > 0)) { log('§SDC_VERDICT INCONCLUSIVE reason=no colour pass in any frame'); log('§WITNESS_STAGED_DRAW_CENSUS pass=0 fail=0 ran=0 INCONCLUSIVE'); process.exit(2); }
for (const l of rep.lines || []) log(l);
// per-class aggregate across frames
const agg = {};
for (const r of rows) { const a = agg[r.cls] || (agg[r.cls] = { cls: r.cls, frames: 0, visible: 0, inFrustum: 0, drawn: 0, notDrawn: 0, countShort: 0, imObjs: 0, imDrawn: 0, worst: 0, worstI: -1, sample: [] });
  a.frames++; a.visible += r.visible; a.inFrustum += r.inFrustum; a.drawn += r.drawn; a.notDrawn += r.notDrawn; a.countShort += r.countShort; a.imObjs += r.imObjs; a.imDrawn += r.imDrawn;
  if (r.notDrawn > a.worst) { a.worst = r.notDrawn; a.worstI = r.i; a.sample = r.sample; } }
const pop = [], vac = [];
for (const c in agg) { const a = agg[c]; if (!a.visible && !a.imObjs) { vac.push(c); continue; } pop.push(a);
  if (a.notDrawn || a.countShort) log(`§SDC_AGG cls=${c} frames=${a.frames} inFrustumSum=${a.inFrustum} drawnSum=${a.drawn} notDrawnSum=${a.notDrawn} worst=${a.worst}@i=${a.worstI} countShortSum=${a.countShort} sample=${a.sample.join(',')}`); }
if (vac.length) log('§SDC_VACUOUS classes with 0 visible slots in every frame (not judged): ' + vac.length);
Witness('staged_draw_census')
  .population(() => pop)
  .schema({ type: 'object', required: ['cls', 'inFrustum', 'drawn', 'notDrawn', 'countShort'],
    properties: { cls: { type: 'string', minLength: 1 }, inFrustum: { type: 'integer', minimum: 0 }, drawn: { type: 'integer', minimum: 0 }, notDrawn: { type: 'integer', minimum: 0 }, countShort: { type: 'integer', minimum: 0 } } })
  .invariant('every visible in-frustum batched slot is in the colour pass draw list', rs => rs.every(r => r.notDrawn === 0))
  .invariant('no InstancedMesh draws fewer instances than it holds', rs => rs.every(r => r.countShort === 0))
  .redControl(rs => { const c = rs.map(r => Object.assign({}, r)); if (c[0]) c[0].notDrawn = 1; return c; })
  .run();
