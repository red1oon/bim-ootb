// ⚠ DO NOT REMOVE — W-OCCL-POCA (FLY_TOUR_DLOD_SCALE.md §15 POC-A, REPORT ONLY).
// Issue this test proves/disproves: during a real interior LTU flight (real GPU, headless
// hardware-GL), is frame cost dominated by draw-call/element count or by raw triangle/vertex
// complexity? Samples renderer.info.render.triangles ALONGSIDE .calls per interior (flyPath)
// frame — the sample point §15 says was never measured — then censuses per-element triangle
// counts by ifc_class to see whether complexity is concentrated or spread.
// Shipped state throughout: DLOD-nav ON (pill), roomOcclEnabled left at default false.
// Read the log (witness/w_occl_poca.log) after every run.
const fs = require('fs');
const H = require('./w_occl_harness');
const LOG = [];
const sink = t => { LOG.push(t); };
const INTERIOR_FRAMES = 3000; // same budget as w_perf.js W-ROOM-OCCL-PERF runs

function stats(a) {
  if (!a.length) return { mean: 0, med: 0, p95: 0, max: 0 };
  const s = a.slice().sort((x, y) => x - y);
  return { mean: a.reduce((p, c) => p + c, 0) / a.length,
    med: s[Math.floor(s.length / 2)], p95: s[Math.floor(s.length * 0.95)], max: s[s.length - 1] };
}

(async () => {
  const { browser, page } = await H.launch(sink);
  try {
    await H.loadLTU(page, sink);
    await H.engageDlod(page, LOG);
    await H.ensureRooms(page, sink);

    // ── interior flight, per-frame dt + calls + triangles + dlod active/boxed ──
    await page.evaluate(() => {
      const A = window.APP || window.A;
      A.flyActive = false; A.walkMode = false; A.walkActions = []; A.walkActionIdx = 0; A.walkActionT = 0;
      if (A.markDirty) A.markDirty();
    });
    await page.evaluate(() => (window.APP || window.A).toggleFlyAround());
    await page.waitForFunction(() => {
      const A = window.APP || window.A;
      return A.flyActive && A.walkActions && A.walkActions.length > 0;
    }, null, { timeout: 180000, polling: 500 });
    const samples = await page.evaluate(async (NEED) => {
      const A = window.APP || window.A;
      const S = window.__dlodNav;
      const dts = [], calls = [], tris = [], active = [], boxed = [];
      let last = performance.now(), interior = 0, total = 0;
      while (interior < NEED && total < 40000) {
        await new Promise(r => requestAnimationFrame(r));
        const now = performance.now();
        const dt = now - last; last = now;
        total++;
        if (!A.flyActive) break;
        const act = A.walkActions[A.walkActionIdx];
        if (act && act.type === 'flyPath') {
          interior++;
          dts.push(dt);
          calls.push(A.renderer.info.render.calls);
          tris.push(A.renderer.info.render.triangles);
          active.push(S.active); boxed.push(S.boxed);
        }
      }
      return { dts, calls, tris, active, boxed, total, interior };
    }, INTERIOR_FRAMES);
    await page.evaluate(() => {
      const A = window.APP || window.A;
      A.flyActive = false; A.walkMode = false; A.walkActions = []; A.walkActionIdx = 0; A.walkActionT = 0;
    });
    fs.writeFileSync(__dirname + '/w_occl_poca_frames.json', JSON.stringify(samples));
    const st = stats(samples.dts), cs = stats(samples.calls), ts = stats(samples.tris),
      as = stats(samples.active), bs = stats(samples.boxed);
    sink('§POCA_FRAMES interiorFrames=' + samples.interior + ' totalFrames=' + samples.total +
      ' frame_ms mean=' + st.mean.toFixed(2) + ' median=' + st.med.toFixed(2) + ' p95=' + st.p95.toFixed(2));
    sink('§POCA_TRIS triangles mean=' + ts.mean.toFixed(0) + ' median=' + ts.med + ' p95=' + ts.p95 +
      ' max=' + ts.max + ' | drawCalls mean=' + cs.mean.toFixed(0) + ' median=' + cs.med +
      ' p95=' + cs.p95 + ' | dlodActive mean=' + as.mean.toFixed(0) + ' boxed mean=' + bs.mean.toFixed(0));
    sink('§POCA_PER_ELEMENT trisPerActiveElement mean=' + (ts.mean / Math.max(1, as.mean)).toFixed(1) +
      ' trisPerDrawCall mean=' + (ts.mean / Math.max(1, cs.mean)).toFixed(0));
    // frame-cost correlation: Pearson r of dt vs triangles and dt vs calls over interior frames
    const pearson = (x, y) => {
      const n = x.length, mx = x.reduce((p, c) => p + c, 0) / n, my = y.reduce((p, c) => p + c, 0) / n;
      let sxy = 0, sxx = 0, syy = 0;
      for (let i = 0; i < n; i++) { const a = x[i] - mx, b = y[i] - my; sxy += a * b; sxx += a * a; syy += b * b; }
      return sxy / Math.sqrt(sxx * syy || 1);
    };
    sink('§POCA_CORR r(frame_ms,triangles)=' + pearson(samples.dts, samples.tris).toFixed(3) +
      ' r(frame_ms,drawCalls)=' + pearson(samples.dts, samples.calls).toFixed(3) +
      ' r(triangles,drawCalls)=' + pearson(samples.tris, samples.calls).toFixed(3));

    // ── static per-element triangle census by ifc_class (whole resident scene) ──
    const census = await page.evaluate(() => {
      const A = window.APP || window.A;
      const cls = {};
      (A.dbQuery("SELECT guid, ifc_class FROM elements_meta") || []).forEach(r => { cls[r[0]] = r[1]; });
      const perClass = {}; let totalTris = 0, totalEls = 0, batchFallback = 0, batchNoGeo = 0;
      const trisArr = [];
      const geoTris = g => {
        if (!g) return 0;
        return Math.round((g.index ? g.index.count : (g.attributes && g.attributes.position ? g.attributes.position.count : 0)) / 3);
      };
      const add = (guid, t) => {
        const c = cls[guid] || '?';
        const o = perClass[c] = perClass[c] || { els: 0, tris: 0 };
        o.els++; o.tris += t; totalTris += t; totalEls++; trisArr.push(t);
      };
      A.scene.traverse(o => {
        if (!o.userData || o.userData.isBboxPlaceholder) return;
        if (o.isInstancedMesh && A._instanceMeta && A._instanceMeta[o.id]) {
          const t = geoTris(o.geometry);
          A._instanceMeta[o.id].forEach(m => add(m.guid, t));
          return;
        }
        if (o.isBatchedMesh && A._batchMeta && A._batchMeta[o.id]) {
          const sg = o.userData.slotGeo || {};
          A._batchMeta[o.id].forEach(m => {
            let t = 0;
            const g = sg[m.slotId];
            if (g) t = geoTris(g);
            else if (o._instanceInfo && o._instanceInfo[m.slotId] && o._geometryInfo) {
              const gi = o._geometryInfo[o._instanceInfo[m.slotId].geometryIndex];
              if (gi) { t = Math.round(gi.count / 3); batchFallback++; } else batchNoGeo++;
            } else batchNoGeo++;
            add(m.guid, t);
          });
          return;
        }
        if (o.isMesh && (o.userData.guid || A.guidMap[o.id])) add(o.userData.guid || A.guidMap[o.id], geoTris(o.geometry));
      });
      trisArr.sort((a, b) => a - b);
      const top = Object.keys(perClass).map(c => ({ c, els: perClass[c].els, tris: perClass[c].tris }))
        .sort((a, b) => b.tris - a.tris).slice(0, 15);
      return { totalEls, totalTris, batchFallback, batchNoGeo,
        med: trisArr[Math.floor(trisArr.length / 2)] || 0,
        p95: trisArr[Math.floor(trisArr.length * 0.95)] || 0,
        p99: trisArr[Math.floor(trisArr.length * 0.99)] || 0,
        max: trisArr[trisArr.length - 1] || 0, top };
    });
    sink('§POCA_CENSUS elements=' + census.totalEls + ' totalTris=' + census.totalTris +
      ' meanTris/el=' + (census.totalTris / Math.max(1, census.totalEls)).toFixed(1) +
      ' median=' + census.med + ' p95=' + census.p95 + ' p99=' + census.p99 + ' max=' + census.max +
      ' batchFallback=' + census.batchFallback + ' batchNoGeo=' + census.batchNoGeo);
    census.top.forEach(t => sink('§POCA_CLASS class=' + t.c + ' els=' + t.els + ' tris=' + t.tris +
      ' avg=' + (t.tris / t.els).toFixed(1) + ' shareOfTris=' + (100 * t.tris / census.totalTris).toFixed(1) + '%'));
  } finally {
    fs.writeFileSync(__dirname + '/w_occl_poca.log', LOG.join('\n') + '\n');
    await browser.close();
  }
})().catch(e => { LOG.push('ERR ' + e.stack); fs.writeFileSync(__dirname + '/w_occl_poca.log', LOG.join('\n') + '\n'); process.exit(1); });
