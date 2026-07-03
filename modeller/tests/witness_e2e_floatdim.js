#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-E2E-FLOATDIM scope (read this block first)
 * SCOPE: real-user witness for §POLISH3 §V7 (prompts/RESUME_MODELLER_POLISH3.md) — the in-scene floating
 *   dimension readout during a drag. Real production path: open Duplex, pick, Move pill, HOLD a real X-handle
 *   drag mid-gesture and read the sprite + status bar; then a real yaw-ring drag. Claims compare the label's
 *   NUMBER against the status bar's number (same source, maths-compared) — never eyes.
 *   Read the log after every run; exit code is not evidence.
 *
 * Issues under test (research spec item 8: feedback was a DOM status-bar line only):
 *   D1 MID-DRAG-SHOWS — while the X drag is HELD, a dimLabel sprite is visible in the scene and
 *                       window.__dimLabel.text matches ΔX ±N.NNm.
 *   D2 SAME-NUMBER    — the label's delta EQUALS the status bar's Δ(dx,…) first component (one math path).
 *   D3 AT-THE-GHOST   — the label sits at the element centre + the snapped delta (≤5cm), i.e. it floats where
 *                       the element is going, not at a stale anchor.
 *   D4 ROT-READS-DEGREES — a real yaw-ring drag held mid-gesture shows the snapped ±N° text.
 *   D5 HIDES-ON-RELEASE — after mouse-up the oracle is null and the sprite is invisible (drag-only lens).
 *   D6 NO-ERROR       — no pageerror across the whole sequence.
 */
'use strict';
const { runE2E } = require('./e2e_harness');
runE2E('W-E2E-FLOATDIM', async (t) => {
  await t.open('Duplex');
  const sel = await t.pick({ prefer: 'wall' });
  if (!sel) { t.assert('D1 MID-DRAG-SHOWS', false, 'no pickable element'); return; }
  const c0 = await t.pg.evaluate(f => {
    const g = window.Bonsai.group(); const m = g.children.find(o => o.isMesh && o.userData.featureId === f);
    m.geometry.computeBoundingBox(); const b = m.geometry.boundingBox;
    return [(b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, (b.min.z + b.max.z) / 2];
  }, sel.fid);

  await t.clickSel('#b-move'); await t.sleep(500);
  const hw = await t.pg.evaluate(() => {
    const giz = window.A.scene.getObjectByName('MoveGizmo'); if (!giz) return null;
    giz.updateMatrixWorld(true); let h = null;
    giz.traverse(o => { if (o.isMesh && o.userData.moveAxis === 'x' && !h) h = o; });
    if (!h) return null; const w = h.getWorldPosition(new window.THREE.Vector3()); return [w.x, w.y, w.z];
  });

  // ── D1/D2/D3 — HELD X drag: down, move ~+1m, evaluate MID-GESTURE, then release ────────────────
  let mid = null, gone = null;
  if (hw) {
    const down = await t.proj(hw[0], hw[1], hw[2]);
    const up = await t.proj(hw[0] + 1.0, hw[1], hw[2]);
    await t.pg.mouse.move(down[0], down[1]); await t.sleep(40);
    await t.pg.mouse.down(); await t.sleep(40);
    await t.pg.mouse.move(up[0], up[1], { steps: 8 }); await t.sleep(200);
    mid = await t.pg.evaluate(() => {
      const o = window.__dimLabel;
      const sp = window.A.scene.children.find(x => x.userData && x.userData.dimLabel);
      const stat = document.getElementById('stat') ? document.getElementById('stat').textContent : '';
      return { oracle: o, visible: !!(sp && sp.visible), stat };
    });
    await t.pg.mouse.up(); await t.sleep(500);
    gone = await t.pg.evaluate(() => {
      const sp = window.A.scene.children.find(x => x.userData && x.userData.dimLabel);
      return { oracle: window.__dimLabel || null, visible: !!(sp && sp.visible) };
    });
  }
  const labelNum = mid && mid.oracle && /Δ?X ([+-]\d+\.\d\d)m/.test(mid.oracle.text) ? +RegExp.$1 : null;
  const statNum = mid && /Δ\((-?\d+\.\d\d),/.test(mid.stat) ? +RegExp.$1 : null;
  t.assert('D1 MID-DRAG-SHOWS sprite visible + ΔX text while held',
    !!mid && mid.visible && !!mid.oracle && /ΔX [+-]\d+\.\d\dm/.test(mid.oracle.text),
    JSON.stringify(mid && mid.oracle));
  t.assert('D2 SAME-NUMBER label delta == status-bar delta (one math path)',
    labelNum != null && statNum != null && Math.abs(labelNum - statNum) < 1e-9,
    'label=' + labelNum + ' stat=' + statNum);
  t.assert('D3 AT-THE-GHOST label sits at centre+snapped Δ (≤5cm)',
    !!mid && mid.oracle && labelNum != null &&
    Math.abs(mid.oracle.x - (c0[0] + labelNum)) < 0.05 && Math.abs(mid.oracle.y - c0[1]) < 0.05,
    mid && mid.oracle ? 'label.x=' + mid.oracle.x.toFixed(3) + ' want=' + (c0[0] + labelNum).toFixed(3) : '');

  // ── D4 — HELD yaw-ring drag reads degrees ──────────────────────────────────────────────────────
  const giz = await t.pg.evaluate(() => {
    const gz = window.A.scene.getObjectByName('MoveGizmo'); if (!gz) return null;
    let ring = null; gz.traverse(o => { if (o.userData && o.userData.moveAxis === 'rotZ') ring = o; });
    if (!ring) return null;
    const c = new window.THREE.Vector3(); gz.getWorldPosition(c);
    return { c: [c.x, c.y, c.z], R: (ring.geometry && ring.geometry.parameters && ring.geometry.parameters.radius) || 0.9 };
  });
  let rot = null;
  if (giz) {
    const th = 30 * Math.PI / 180;
    const down = await t.proj(giz.c[0] + giz.R, giz.c[1], giz.c[2]);
    const up = await t.proj(giz.c[0] + giz.R * Math.cos(th), giz.c[1] + giz.R * Math.sin(th), giz.c[2]);
    await t.pg.mouse.move(down[0], down[1]); await t.sleep(40);
    await t.pg.mouse.down(); await t.sleep(40);
    await t.pg.mouse.move(up[0], up[1], { steps: 10 }); await t.sleep(200);
    rot = await t.pg.evaluate(() => window.__dimLabel || null);
    await t.pg.mouse.up(); await t.sleep(500);
  }
  t.assert('D4 ROT-READS-DEGREES held ring drag shows snapped ±N°',
    !!rot && /^[+-]\d+°$/.test(rot.text), JSON.stringify(rot));

  t.assert('D5 HIDES-ON-RELEASE oracle null + sprite invisible after mouse-up',
    !!gone && gone.oracle === null && gone.visible === false, JSON.stringify(gone));
}, { width: 1200, height: 850, dpr: 1 });
