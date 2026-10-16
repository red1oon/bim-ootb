#!/usr/bin/env node
/**
 * capture_probe_candidates.js — NUMERIC candidate selection for cut-select.png/cut-open.png recapture
 * (RESUME_MODELLER_GUIDE_SCREENSHOT_FIX.md round-5 handoff: "pick a better wall/camera using the harness's
 * OWN logged bbox numbers (bboxScreen coverage % of frame) — log it, choose numerically, not by visual
 * trial-and-error"). Reuses capture_guide_cut.js's exact candidate-pool logic (real-layer-seedable wallish
 * IfcWall-class GEOM_INSERTs, box candidates excluded), but instead of always taking report[0] (highest
 * nLayers, which is fid=87 — the one round 5 found composes badly), runs the SAME select->#b-fit->
 * frameElement(fid,0.22) sequence capture_guide_cut.js uses for EVERY candidate in the pool and measures
 * bboxScreen's actual on-screen coverage numerically. No visual judgement here — pure numbers, logged.
 */
'use strict';
const { runE2E } = require('./e2e_harness');
runE2E('CANDIDATE-PROBE', async (t) => {
  await t.open('Duplex');

  const report = await t.pg.evaluate(() => {
    const ops = window.Bonsai.oplog._geomOps();
    const wallish = c => c.sz && c.sz[2] >= 1.2 && Math.min(c.sz[0], c.sz[1]) <= 0.6 && Math.max(c.sz[0], c.sz[1]) >= 1.0 && Math.max(c.sz[0], c.sz[1]) <= 8;
    const out = [];
    ops.forEach(op => {
      if (op.op_type !== 'GEOM_INSERT') return;
      const P = op.parameters; if (!P || !P.ifc_class || !/^IfcWall/.test(P.ifc_class)) return;
      let boxOk = false, layerSeed = null;
      try { boxOk = !!window.Bonsai._insertCutBox(op); } catch (e) {}
      if (boxOk) return;
      try { layerSeed = window.Bonsai._insertCutLayerSeed(op); } catch (e) {}
      if (!layerSeed) return;
      const bb = P.bbox, sz = [bb[1] - bb[0], bb[3] - bb[2], bb[5] - bb[4]];
      if (!wallish({ sz })) return;
      out.push({ fid: op.id, nLayers: layerSeed.layers.length, sz, vol: sz[0] * sz[1] * sz[2] });
    });
    out.sort((a, b) => b.nLayers - a.nLayers);
    return out;
  });
  console.log('  §CAPTURE-POOL n=' + report.length);

  const vw = t.pg.viewport().width, vh = t.pg.viewport().height;
  const results = [];
  const FILL = 0.22; // same fill capture_guide_cut.js settled on
  for (const cand of report) {
    await t.pg.evaluate((f) => window.Bonsai.select(f), cand.fid);
    await t.flySettle();
    const fitBtn = await t.pg.$('#b-fit'); if (fitBtn) { await fitBtn.click(); await t.sleep(400); }
    await t.frameElement(cand.fid, FILL);
    const b = await t.bboxScreen(cand.fid);
    let coverage = 0, onscreenFrac = 0;
    if (b) {
      const rawArea = Math.max(0, b.width) * Math.max(0, b.height);
      const x0 = Math.max(0, b.x), y0 = Math.max(0, b.y);
      const x1 = Math.min(vw, b.x + b.width), y1 = Math.min(vh, b.y + b.height);
      const overlapW = Math.max(0, x1 - x0), overlapH = Math.max(0, y1 - y0);
      const overlapArea = overlapW * overlapH;
      coverage = (overlapArea / (vw * vh)) * 100;
      onscreenFrac = rawArea > 0 ? (overlapArea / rawArea) : 0;
    }
    console.log('  §CAPTURE-CANDIDATE fid=' + cand.fid + ' nLayers=' + cand.nLayers + ' sz=' + JSON.stringify(cand.sz.map(v => +v.toFixed(2))) +
      ' bbox=' + JSON.stringify(b) + ' coverage=' + coverage.toFixed(1) + '% onscreenFrac=' + onscreenFrac.toFixed(2));
    results.push({ fid: cand.fid, nLayers: cand.nLayers, sz: cand.sz, coverage, onscreenFrac });
  }

  results.sort((a, b) => b.coverage - a.coverage);
  console.log('  §CAPTURE-WINNER ' + JSON.stringify(results[0]));
  console.log('  §CAPTURE-RANKED-TOP5 ' + JSON.stringify(results.slice(0, 5)));
  t.assert('PROBE-DONE (candidates measured)', results.length > 0, 'n=' + results.length);
}, { width: 1200, height: 850, dpr: 2 });
