#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-E2E-STRETCH-RIDE: real-user, maths-asserted E2E of §STRETCH-RIDE (grid-stretch a wall must
 * NOT divorce or scale its hosted door/window). Implementing RESUME_CASCADE_INTO_STRETCH.md §STRETCH-RIDE —
 * Witness: W-STRETCH-RIDE. Read the log after every run.
 *
 * Real production path (real toolbar + real drag hook), REAL SampleHouse (7 rel_fills_host rows, §ARC-1 substrate
 * auto-seeded on Open — see str_walker_outliner.js _seedArcEditable). No hardcoded featureIds: the host/gridline/
 * delta/rider are DISCOVERED live from the app's own engine (window.Bonsai.gridmove.computeCommands) cross-checked
 * against the REAL rel_fills_host edges (window.swXEdges.fills) through the §ARC-1 bridge — a resident can drift
 * (extraction re-run, id renumber) without invalidating this witness.
 *
 *   E1 DISCOVER  — sweep the REAL grid lines × a few deltas via computeCommands (no commit) for a SCALE command on
 *                  a featureId that IS a real rel_fills_host HOST, whose filling is genuinely hosted pre-stretch
 *                  (mirrors sdg_gate.js's own withinXY pre-check, tol=0.05 — same discipline as the T2c node-witness
 *                  fix, so this picks the SAME kind of honest pair, not door=13's known-unhosted outlier).
 *   E2 RIDE      — window.__gridStretch(id, delta) (the real production hook, modeller.html) commits the drag.
 *                  Read back the LIVE scene: the rider door's mesh geometry EXTENT is unchanged (no scale reached
 *                  it), its centre moved (the ride fired), and window.__lastGate shows no NEW door-out RED.
 *   E3 OP-LOG    — exactly one induced GEOM_MOVE with parameters.induced==='hosted-by' for the rider is in the REAL
 *                  op-log after the commit, and the committed GEOM_GRID_MOVE's parameters.commands contains NO
 *                  entry for the rider's featureId (its own command was stripped, not merely overridden).
 *   E4 VISIBLE   — pixel-readback (the spec's explicit open rigor item, not an eyeball check): project the rider
 *                  door mesh's world bbox centre to screen space and gl.readPixels a small rect around it POST-ride;
 *                  assert non-background colour, mesh.visible===true, material.opacity>0, in-frustum.
 */
'use strict';
const { runE2E } = require('./e2e_harness');

runE2E('W-E2E-STRETCH-RIDE', async (t) => {
  await t.open('SampleHouse'); await t.shot('01-open');

  // §ARC-1 substrate seeds ASYNC on Open (str_walker_outliner.js _forkEditable → _fetchGeoDb → _seedArcEditable) —
  // wait for the bridge + REAL cross-edges to be live before discovering a pair (non-invent: never race the seed).
  await t.pg.waitForFunction(() => !!(window.__arcFidByGuid && window.__arcGuidByFid && window.swXEdges && window.swXEdges.fills && window.swXEdges.fills.length), { timeout: 20000 }).catch(() => {});

  // in-page helpers: discovery (E1), live-scene readback (E2/E4). No hardcoded featureIds anywhere below.
  const disc = await t.pg.evaluate(() => {
    function withinXY(box, pt, tol) { tol = tol || 0; return pt[0] >= box[0] - tol && pt[0] <= box[1] + tol && pt[1] >= box[2] - tol && pt[1] <= box[3] + tol; }
    function boxOf(fid) {
      const g = window.Bonsai.group(); const m = g.children.find(o => o.isMesh && o.userData.featureId === fid);
      if (!m) return null; m.geometry.computeBoundingBox(); const b = m.geometry.boundingBox;
      return [b.min.x, b.max.x, b.min.y, b.max.y, b.min.z, b.max.z];
    }
    function centreOf(b) { return [(b[0] + b[1]) / 2, (b[2] + b[3]) / 2, (b[4] + b[5]) / 2]; }
    const fbg = window.__arcFidByGuid, gbf = window.__arcGuidByFid, fills = window.swXEdges.fills;
    const lines = window.Bonsai.gridmove.gridLines();      // REAL authoring grid, current state
    const deltas = [1, -1, 2, -2, 0.5, -0.5, 1.5, -1.5, 3, -3, 4, -4];
    for (const line of lines) {
      for (const d of deltas) {
        let cmds; try { cmds = window.Bonsai.gridmove.computeCommands(line.id, d); } catch (e) { continue; }
        for (const c of cmds) {
          if (c.action !== 'SCALE') continue;
          const hostGuid = gbf[c.featureId]; if (hostGuid == null) continue;
          // a host can have MULTIPLE filling rows (SampleHouse host=3 has 2: door=7 hosted, door=13 NOT — the
          // T2c node-witness finding). Try each candidate edge and take the FIRST that genuinely qualifies,
          // don't stop at fills.find()'s first row blindly (that was the T2c bug in the node witness too).
          const edges = fills.filter(e => e.host_guid === hostGuid && fbg[e.filling_guid] != null);
          const hb = boxOf(c.featureId); if (!hb) continue;
          for (const edge of edges) {
            const doorFid = fbg[edge.filling_guid];
            const rb = boxOf(doorFid); if (!rb) continue;
            if (!withinXY(hb, centreOf(rb), 0.05)) continue;    // the SAME honest pre-check the production gate uses
            return { gridId: line.id, delta: d, hostFid: c.featureId, doorFid: doorFid, hostGuid, doorGuid: edge.filling_guid };
          }
        }
      }
    }
    return null;
  });
  console.log('  §STRETCH-RIDE E1 discovered ' + JSON.stringify(disc));
  t.assert('E1 DISCOVER (real gridline+delta yields a SCALE on a genuinely-hosted rel_fills_host HOST)', !!disc, JSON.stringify(disc));
  await t.shot('02-discovered');

  if (!disc) { console.log('  §STRETCH-RIDE E1 FAILED — no qualifying pair found, skipping E2-E4'); return; }

  // pre-ride live-scene snapshot of the RIDER (door/window) — extent + centre, and the op-log length.
  const pre = await t.pg.evaluate((fid) => {
    const g = window.Bonsai.group(); const m = g.children.find(o => o.isMesh && o.userData.featureId === fid);
    if (!m) return null;
    m.geometry.computeBoundingBox(); const b = m.geometry.boundingBox;
    return { dims: [b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z], centre: [(b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, (b.min.z + b.max.z) / 2] };
  }, disc.doorFid);
  const before = await t.oplog();

  // E2 — RIDE: the real production hook (modeller.html window.__gridStretch → commitGridMove → Bonsai.gridmove.commit).
  await t.pg.evaluate((id, d) => window.__gridStretch(id, d), disc.gridId, disc.delta);
  await t.sleep(900);

  const post = await t.pg.evaluate((fid) => {
    const g = window.Bonsai.group(); const m = g.children.find(o => o.isMesh && o.userData.featureId === fid);
    if (!m) return null;
    m.geometry.computeBoundingBox(); const b = m.geometry.boundingBox;
    return { dims: [b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z], centre: [(b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, (b.min.z + b.max.z) / 2] };
  }, disc.doorFid);
  const lastGate = await t.pg.evaluate(() => window.__lastGate || '');
  const after = await t.oplog();

  const dimDelta = pre && post ? Math.max(...pre.dims.map((v, i) => Math.abs(v - post.dims[i]))) : Infinity;
  const centreShift = pre && post ? Math.hypot(...pre.centre.map((v, i) => v - post.centre[i])) : 0;
  console.log('  §STRETCH-RIDE E2 pre.dims=' + JSON.stringify(pre && pre.dims) + ' post.dims=' + JSON.stringify(post && post.dims) + ' dimDelta=' + dimDelta.toExponential(2));
  console.log('  §STRETCH-RIDE E2 pre.centre=' + JSON.stringify(pre && pre.centre) + ' post.centre=' + JSON.stringify(post && post.centre) + ' centreShift=' + centreShift.toFixed(4) + 'm');
  console.log('  §STRETCH-RIDE E2 lastGate="' + lastGate + '" oplog ' + before.len + '→' + after.len);
  await t.shot('03-post-ride');

  t.assert('E2a RIDE — rider mesh extent UNCHANGED (no scale reached it, tol 1e-4)', dimDelta < 1e-4, 'dimDelta=' + dimDelta.toExponential(2));
  t.assert('E2b RIDE — rider mesh centre MOVED (the ride fired)', centreShift > 0.01, 'centreShift=' + centreShift.toFixed(4) + 'm');
  t.assert('E2c RIDE — gate shows no door-out RED (legitimate stretch)', !/RED/.test(lastGate) || !/door-out/.test(lastGate), 'lastGate="' + lastGate + '"');

  // E3 — real op-log: exactly one induced GEOM_MOVE {induced:'hosted-by', parent:doorFid} for the rider, and the
  // committed GEOM_GRID_MOVE's own parameters.commands has NO entry for the rider (stripped, not just overridden).
  const opCheck = await t.pg.evaluate((doorFid, beforeLen) => {
    const ops = window.Bonsai.oplog._geomOps();
    const added = ops.slice(beforeLen);
    const gridMove = added.find(o => o.op_type === 'GEOM_GRID_MOVE');
    const inducedMoves = added.filter(o => o.op_type === 'GEOM_MOVE' && o.parameters && o.parameters.induced === 'hosted-by' && o.parameters.parent === doorFid);
    const strippedOk = !gridMove || !(gridMove.parameters.commands || []).some(c => c.featureId === doorFid);
    return { addedTypes: added.map(o => o.op_type), inducedCount: inducedMoves.length, strippedOk, gridMoveCmds: gridMove ? gridMove.parameters.commands.length : null };
  }, disc.doorFid, before.len);
  console.log('  §STRETCH-RIDE E3 ' + JSON.stringify(opCheck));
  t.assert('E3a OP-LOG — exactly ONE induced GEOM_MOVE {induced:hosted-by, parent:rider} for the rider', opCheck.inducedCount === 1, JSON.stringify(opCheck));
  t.assert('E3b OP-LOG — the committed GEOM_GRID_MOVE carries NO entry for the rider (stripped)', opCheck.strippedOk, JSON.stringify(opCheck));

  // E4 — pixel-readback visibility (open rigor item): project the rider's post-ride world bbox centre to screen
  // space and readPixels a small rect around it; assert non-background colour + visible + opaque + in-frustum.
  const vis = await t.pg.evaluate((fid) => {
    const g = window.Bonsai.group(); const m = g.children.find(o => o.isMesh && o.userData.featureId === fid);
    if (!m) return { ok: false, reason: 'no mesh' };
    const box = new window.THREE.Box3().setFromObject(m);
    if (!isFinite(box.min.x)) return { ok: false, reason: 'no bbox' };
    const c = new window.THREE.Vector3(); box.getCenter(c);
    const r = window.A.renderer, cam = window.A.camera;
    r.render(window.A.scene, cam);
    const v = c.clone().project(cam);
    const cv = r.domElement, rect = cv.getBoundingClientRect();
    const clientX = (v.x * 0.5 + 0.5) * rect.width + rect.left, clientY = (-v.y * 0.5 + 0.5) * rect.height + rect.top;
    const inFrustum = v.z >= -1 && v.z <= 1 && clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
    const gl = r.getContext();
    const bw = gl.drawingBufferWidth, bh = gl.drawingBufferHeight;
    const sx = bw / rect.width, sy = bh / rect.height;
    const bx = Math.round((clientX - rect.left) * sx), byTop = Math.round((clientY - rect.top) * sy);
    const half = 10;
    const x0 = Math.max(0, bx - half), w = Math.min(half * 2, bw - x0);
    const yTop0 = Math.max(0, byTop - half), h = Math.min(half * 2, bh - yTop0);
    const y0 = Math.max(0, bh - yTop0 - h);            // WebGL readPixels is bottom-left origin
    let nonBg = 0, total = 0;
    const bg = window.A.scene.background;              // the REAL clear colour, read live (non-invent)
    const bgArr = bg ? [Math.round(bg.r * 255), Math.round(bg.g * 255), Math.round(bg.b * 255)] : [0, 0, 0];
    if (w > 0 && h > 0) {
      const px = new Uint8Array(w * h * 4);
      gl.readPixels(x0, y0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      for (let i = 0; i < px.length; i += 4) {
        total++;
        const dist = Math.abs(px[i] - bgArr[0]) + Math.abs(px[i + 1] - bgArr[1]) + Math.abs(px[i + 2] - bgArr[2]);
        if (dist > 20) nonBg++;
      }
    }
    return { ok: true, inFrustum, visible: m.visible, opacity: m.material ? m.material.opacity : null,
      nonBg, total, bg: bgArr, rectPx: { x0, y0, w, h }, clientXY: [Math.round(clientX), Math.round(clientY)] };
  }, disc.doorFid);
  console.log('  §STRETCH-RIDE E4 ' + JSON.stringify(vis));
  await t.shotClip('04-rider-visible', disc.doorFid, 60);
  t.assert('E4a VISIBLE — rider is in-frustum, mesh.visible, opacity>0', vis.ok && vis.inFrustum && vis.visible === true && (vis.opacity == null || vis.opacity > 0), JSON.stringify(vis));
  t.assert('E4b VISIBLE — readPixels around the rider finds non-background pixels (rasterized, not just data-visible)', vis.ok && vis.total > 0 && vis.nonBg > 0, 'nonBg=' + vis.nonBg + '/' + vis.total);
}, { width: 1280, height: 860, dpr: 2 });
