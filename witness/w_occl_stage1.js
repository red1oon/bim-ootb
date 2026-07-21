// ⚠ DO NOT REMOVE — W-OCCL-STAGE1 (FLY_TOUR_DLOD_SCALE.md §15 POC-B Stage 1, REPORT ONLY).
// Issue this test proves/disproves: of the elements DLOD-nav calls "active" (real, non-boxed)
// during a real interior LTU flight, what fraction is ACTUALLY occluded (no clear line of sight
// from the camera) — replacing CINEMATIC_RENDERING.md's unmeasured May-2026 "60-70%" estimate
// with a measured number — and what is the HONEST bucket-level draw-call ceiling (objects whose
// EVERY active element is occluded, the only ones perfect culling could actually un-draw)?
// GATE: runs the EXACT classifier proven by w_occl_stage0.mjs (witness/occl_classify.js,
// §OCCL0_RESULT mismatch=0) — do not run this before Stage 0 passes.
// Method per §15: poses are CAPTURED during the live tour at a sampled cadence, then classified
// at those frozen poses AFTER the tour (full-active-set raycast per pose; keeps the POC's own
// cost out of any frame-time numbers — POC-A owns frame timing, this script owns geometry truth).
// Shipped state: DLOD-nav ON, roomOcclEnabled default false. Real GPU, headless hardware-GL.
// Read the log (witness/w_occl_stage1.log) after every run.
const fs = require('fs');
const path = require('path');
const H = require('./w_occl_harness');
const LOG = [];
const sink = t => { LOG.push(t); };
const POSE_CADENCE = 350;   // capture a pose every N interior frames
const MAX_POSES = 8;
const INTERIOR_FRAMES = 3000;
const EPS = 0.01;           // metres — real-building tolerance for "blocker strictly before center"

(async () => {
  const { browser, page } = await H.launch(sink);
  try {
    await H.loadLTU(page, sink);
    await H.engageDlod(page, LOG);
    await H.ensureRooms(page, sink);
    await page.addScriptTag({ path: path.join(__dirname, 'occl_classify.js') }); // the Stage-0-proven classifier, verbatim
    const hasClassify = await page.evaluate(() => typeof window.__occlClassify === 'function');
    if (!hasClassify) throw new Error('occl_classify.js did not load in page');
    sink('§POCB_CLASSIFIER loaded=true (same file Stage 0 proved, mismatch=0)');

    // element centers + bounding radius once — SAME source dlod_nav's own distance/frustum test
    // uses (element_transforms center_* + bbox_*; radius = half-diagonal, dlod_nav.js _buildBoxes)
    const nCenters = await page.evaluate(() => {
      const A = window.APP || window.A;
      const rows = A.dbQuery("SELECT guid, center_x, center_y, center_z, bbox_x, bbox_y, bbox_z FROM element_transforms WHERE center_x IS NOT NULL") || [];
      const m = {};
      rows.forEach(r => {
        const p = A.ifc2three(r[1], r[2], r[3]);
        const bx = r[4] || 0.3, by = r[5] || 0.3, bz = r[6] || 0.3;
        m[r[0]] = { x: p.x, y: p.y, z: p.z, r: Math.sqrt(bx * bx + by * by + bz * bz) * 0.5 };
      });
      window.__occlCenters = m;
      return rows.length;
    });
    sink('§POCB_CENTERS rows=' + nCenters);

    // ── live tour: capture poses at cadence on interior (flyPath) frames ──
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
    const poses = await page.evaluate(async ({ NEED, CADENCE, MAXP }) => {
      const A = window.APP || window.A;
      const poses = [];
      let interior = 0, total = 0;
      while (interior < NEED && total < 40000 && poses.length < MAXP) {
        await new Promise(r => requestAnimationFrame(r));
        total++;
        if (!A.flyActive) break;
        const act = A.walkActions[A.walkActionIdx];
        if (act && act.type === 'flyPath') {
          interior++;
          if (interior % CADENCE === 1) {
            poses.push({
              px: A.camera.position.x, py: A.camera.position.y, pz: A.camera.position.z,
              qx: A.camera.quaternion.x, qy: A.camera.quaternion.y, qz: A.camera.quaternion.z, qw: A.camera.quaternion.w,
              actIdx: A.walkActionIdx, interiorFrame: interior,
            });
          }
        }
      }
      return { poses, interior, total };
    }, { NEED: INTERIOR_FRAMES, CADENCE: POSE_CADENCE, MAXP: MAX_POSES });
    await page.evaluate(() => {
      const A = window.APP || window.A;
      A.flyActive = false; A.walkMode = false; A.walkActions = []; A.walkActionIdx = 0; A.walkActionT = 0;
    });
    sink('§POCB_POSES captured=' + poses.poses.length + ' interiorFrames=' + poses.interior +
      ' totalFrames=' + poses.total + ' cadence=' + POSE_CADENCE);
    if (!poses.poses.length) throw new Error('no interior poses captured — tour had no flyPath frames?');

    // ── per pose: freeze camera, settle dlod, classify FULL active set ──
    const perPose = [];
    for (let pi = 0; pi < poses.poses.length; pi++) {
      const P = poses.poses[pi];
      await page.evaluate((P) => {
        const A = window.APP || window.A;
        A.camera.position.set(P.px, P.py, P.pz);
        A.camera.quaternion.set(P.qx, P.qy, P.qz, P.qw);
        A.camera.updateMatrixWorld(true);
        if (A.markDirty) A.markDirty();
      }, P);
      // settle WITH markDirty each frame — first run showed the idle gate parks the render loop
      // after the tour stops, so dlod's chunked eval never converges (mismatch stayed 726-7169);
      // forcing dirty keeps eval chunks running until the scan catches up at the frozen pose.
      const audit = await page.evaluate(async (maxMs) => {
        const A = window.APP || window.A;
        const t0 = performance.now();
        let stable = 0, a;
        while (performance.now() - t0 < maxMs) {
          if (A.markDirty) A.markDirty();
          await new Promise(r => requestAnimationFrame(r));
          a = window.__dlodNavAudit();
          if (a.engaged && a.mismatch === 0 && a.fades === 0) { if (++stable >= 3) return a; }
          else stable = 0;
        }
        return window.__dlodNavAudit();
      }, 60000);
      sink('§POCB_SETTLE pose=' + pi + ' audit real=' + audit.real + ' boxed=' + audit.boxed +
        ' mismatch=' + audit.mismatch + ' fades=' + audit.fades);
      const res = await page.evaluate(async ({ pi, EPS }) => {
        const A = window.APP || window.A;
        const centers = window.__occlCenters;
        // occluder set + hit→guid maps (rebuilt per pose — visibility state changed with the pose)
        const occluders = [];
        const batchMap = {};
        const guidOf = o => (o.userData && o.userData.guid) || A.guidMap[o.id] || null;
        A.scene.traverse(o => {
          if (!o.visible || !o.userData || o.userData.isBboxPlaceholder || o.userData._isOutline) return;
          if (o.isBatchedMesh && A._batchMeta && A._batchMeta[o.id]) {
            occluders.push(o);
            const m = {}; A._batchMeta[o.id].forEach(e => { m[e.slotId] = e.guid; });
            batchMap[o.id] = m;
            return;
          }
          if (o.isInstancedMesh && A._instanceMeta && A._instanceMeta[o.id]) { occluders.push(o); return; }
          if (o.isMesh && guidOf(o)) occluders.push(o);
        });
        const resolveHitGuid = h => {
          const o = h.object;
          if (o.isBatchedMesh) { const m = batchMap[o.id]; return (m && h.batchId !== undefined) ? (m[h.batchId] || null) : null; }
          if (o.isInstancedMesh) {
            const mm = A._instanceMeta[o.id];
            return (mm && h.instanceId !== undefined && mm[h.instanceId]) ? mm[h.instanceId].guid : null;
          }
          return guidOf(o);
        };
        // active (real, non-boxed, actually-rendered) element enumeration, with container object id
        const active = [];
        A.scene.traverse(o => {
          if (!o.visible || !o.userData || o.userData.isBboxPlaceholder) return;
          if (o.isInstancedMesh && A._instanceMeta && A._instanceMeta[o.id]) {
            const arr = o.instanceMatrix.array;
            const mm = A._instanceMeta[o.id];
            for (let i = 0; i < mm.length; i++) {
              const b = i * 16;
              if (arr[b] === 0 && arr[b + 5] === 0 && arr[b + 10] === 0) continue; // zero-scaled = dlod-hidden
              active.push({ guid: mm[i].guid, obj: o.id });
            }
            return;
          }
          if (o.isBatchedMesh && A._batchMeta && A._batchMeta[o.id]) {
            const bm = A._batchMeta[o.id];
            for (let i = 0; i < bm.length; i++) {
              try { if (o.getVisibleAt(bm[i].slotId)) active.push({ guid: bm[i].guid, obj: o.id }); } catch (e) {}
            }
            return;
          }
          if (o.isMesh && guidOf(o)) active.push({ guid: guidOf(o), obj: o.id });
        });
        const ray = new (A.raycaster.constructor)();
        const camPos = { x: A.camera.position.x, y: A.camera.position.y, z: A.camera.position.z };
        // in-frustum test — same sphere-vs-frustum shape as dlod_nav's own _inFrustum (no margin):
        // the May-2026 estimate this POC checks was phrased "of IN-FRUSTUM geometry", so tally the
        // in-frustum subset separately from the whole active set.
        const THREE = window.THREE;
        const frustum = new THREE.Frustum().setFromProjectionMatrix(
          new THREE.Matrix4().multiplyMatrices(A.camera.projectionMatrix, A.camera.matrixWorldInverse));
        const sph = new THREE.Sphere();
        let occluded = 0, clear = 0, selfFirst = 0, noHit = 0, noCenter = 0;
        let fActive = 0, fOccluded = 0, fClear = 0;
        const byObj = {};
        const t0 = performance.now();
        for (let i = 0; i < active.length; i++) {
          const a = active[i];
          const c = centers[a.guid];
          if (!c) { noCenter++; continue; }
          sph.center.set(c.x, c.y, c.z); sph.radius = c.r;
          const inF = frustum.intersectsSphere(sph);
          const bo = byObj[a.obj] = byObj[a.obj] || { act: 0, occ: 0, fAct: 0, fOcc: 0 };
          bo.act++;
          if (inF) { fActive++; bo.fAct++; }
          const r = window.__occlClassify(ray, occluders, camPos, a.guid, c, resolveHitGuid, EPS);
          if (r.verdict === 'occluded') { occluded++; bo.occ++; if (inF) { fOccluded++; bo.fOcc++; } }
          else { clear++; if (inF) fClear++; if (r.via === 'self-first') selfFirst++; else noHit++; }
          if (i % 2000 === 1999) {
            console.log('§POCB_PROGRESS pose=' + pi + ' done=' + (i + 1) + '/' + active.length +
              ' ms=' + (performance.now() - t0).toFixed(0));
            await new Promise(rr => setTimeout(rr, 0));
          }
        }
        // bucket rollups. Whole-active rule: object saves its draw call only if EVERY active
        // element in it is occluded. In-frustum rule: only if every IN-FRUSTUM active element is
        // occluded (out-of-frustum BatchedMesh slots are already CPU-culled per instance —
        // r184 perObjectFrustumCulled default true — and plain meshes by object frustum cull;
        // InstancedMesh is the frustumCulled=false exception, noted in findings).
        let objWithActive = 0, objFullyOccl = 0, objMixed = 0, objAllClear = 0, elsInFullyOccl = 0;
        let objWithF = 0, objFFullyOccl = 0, objFMixed = 0, objFAllClear = 0;
        for (const k in byObj) {
          const b = byObj[k];
          if (!b.act) continue;
          objWithActive++;
          if (b.occ === b.act) { objFullyOccl++; elsInFullyOccl += b.act; }
          else if (b.occ === 0) objAllClear++;
          else objMixed++;
          if (b.fAct > 0) {
            objWithF++;
            if (b.fOcc === b.fAct) objFFullyOccl++;
            else if (b.fOcc === 0) objFAllClear++;
            else objFMixed++;
          }
        }
        // one rendered frame at this pose for renderer.info reference
        if (A.markDirty) A.markDirty();
        await new Promise(r => requestAnimationFrame(r));
        await new Promise(r => requestAnimationFrame(r));
        return {
          activeTotal: active.length, classified: occluded + clear, occluded, clear, selfFirst, noHit,
          noCenter, ms: Math.round(performance.now() - t0),
          fActive, fOccluded, fClear,
          objWithActive, objFullyOccl, objMixed, objAllClear, elsInFullyOccl,
          objWithF, objFFullyOccl, objFMixed, objFAllClear,
          drawCalls: A.renderer.info.render.calls, triangles: A.renderer.info.render.triangles,
        };
      }, { pi, EPS });
      const pct = 100 * res.occluded / Math.max(1, res.classified);
      const fPct = 100 * res.fOccluded / Math.max(1, res.fActive);
      const ceilPct = 100 * res.objFullyOccl / Math.max(1, res.objWithActive);
      const fCeilPct = 100 * res.objFFullyOccl / Math.max(1, res.objWithF);
      sink('§POCB_POSE pose=' + pi + ' actIdx=' + P.actIdx + ' interiorFrame=' + P.interiorFrame +
        ' cam=(' + P.px.toFixed(1) + ',' + P.py.toFixed(1) + ',' + P.pz.toFixed(1) + ')' +
        ' active=' + res.activeTotal + ' classified=' + res.classified +
        ' occluded=' + res.occluded + ' clear=' + res.clear + ' occludedPct=' + pct.toFixed(1) + '%' +
        ' selfFirst=' + res.selfFirst + ' noHit=' + res.noHit + ' noCenter=' + res.noCenter +
        ' ms=' + res.ms);
      sink('§POCB_FRUSTUM pose=' + pi + ' inFrustumActive=' + res.fActive +
        ' fOccluded=' + res.fOccluded + ' fClear=' + res.fClear +
        ' fOccludedPct=' + fPct.toFixed(1) + '% (the May-2026 "60-70%" was phrased over IN-FRUSTUM geometry)');
      sink('§POCB_BUCKET pose=' + pi + ' objWithActive=' + res.objWithActive +
        ' objFullyOccl=' + res.objFullyOccl + ' (' + ceilPct.toFixed(1) + '%)' +
        ' objMixed=' + res.objMixed + ' objAllClear=' + res.objAllClear +
        ' elsInFullyOccl=' + res.elsInFullyOccl +
        ' | inFrustum: objWithF=' + res.objWithF + ' objFFullyOccl=' + res.objFFullyOccl +
        ' (' + fCeilPct.toFixed(1) + '%) objFMixed=' + res.objFMixed + ' objFAllClear=' + res.objFAllClear +
        ' | rendererCalls=' + res.drawCalls + ' triangles=' + res.triangles);
      perPose.push({ P, res, pct, fPct, ceilPct, fCeilPct });
    }

    const mean = a => a.reduce((p, c) => p + c, 0) / Math.max(1, a.length);
    const pcts = perPose.map(p => p.pct), fPcts = perPose.map(p => p.fPct),
      ceils = perPose.map(p => p.ceilPct), fCeils = perPose.map(p => p.fCeilPct);
    const sortedP = pcts.slice().sort((a, b) => a - b);
    sink('§POCB_SUMMARY poses=' + perPose.length +
      ' occludedPct(all-active) mean=' + mean(pcts).toFixed(1) + '% median=' + (sortedP[Math.floor(sortedP.length / 2)] || 0).toFixed(1) +
      '% min=' + Math.min(...pcts).toFixed(1) + '% max=' + Math.max(...pcts).toFixed(1) + '%' +
      ' | occludedPct(IN-FRUSTUM) mean=' + mean(fPcts).toFixed(1) + '% min=' + Math.min(...fPcts).toFixed(1) +
      '% max=' + Math.max(...fPcts).toFixed(1) + '%' +
      ' | bucketCeiling(all) mean=' + mean(ceils).toFixed(1) + '%' +
      ' | bucketCeiling(inFrustum) mean=' + mean(fCeils).toFixed(1) + '%' +
      ' | may2026Estimate=60-70% of in-frustum (CINEMATIC_RENDERING.md, unmeasured)');
    fs.writeFileSync(__dirname + '/w_occl_stage1_poses.json', JSON.stringify(perPose, null, 1));
  } finally {
    fs.writeFileSync(__dirname + '/w_occl_stage1.log', LOG.join('\n') + '\n');
    await browser.close();
  }
})().catch(e => { LOG.push('ERR ' + e.stack); fs.writeFileSync(__dirname + '/w_occl_stage1.log', LOG.join('\n') + '\n'); process.exit(1); });
