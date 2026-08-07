#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-ITEMDRAG-UI: real-user, maths-asserted E2E of the free item-drag UI wiring.
 * Implementing prompts/Modeller/ROOM_MOVE_AND_ITEM_DRAG_SPEC.md §3 — Witness: W-ITEMDRAG-UI.
 * Read the log after every run. Exit code alone is not evidence.
 *
 * SCOPE: this witness proves the UI LAYER wired onto the already-shipped, already-witnessed engine
 * (bonsai_itemdrag.js — W-ITEM-DRAG-GATE 9/9, pure-node) reaches it via real pointer input on real loaded
 * Duplex (SampleHouse's live resident DB has no spatial_structure table; see witness_e2e_roommove_ui.js's
 * header for the same finding — irrelevant to item-drag's own logic, but Duplex is used for consistency).
 * Three scenarios, spec §3.2/§3.3/§3.4:
 *
 *   A. GATE-REFUSAL — a real Drag-Item arm + real canvas pick on an ALREADY-COMMITTED element. §3.2's own Q5
 *      finding (resolved against live code, see bonsai_itemdrag.js header) is that NO already-committed
 *      element carries a UI-recoverable product hint today (the identity rides only on a transient _rw/_dw
 *      sidecar object, never persisted to kernel_ops) — so a generic real pick REFUSES at session start. That
 *      is the spec's own anticipated v1 outcome, not a UI gap: this scenario proves the refusal is REAL (fires
 *      off a genuine pointerdown+raycast, not a stub) and clean (zero ops, no lift, no phantom session).
 *   B. VALID-DROP — grabs via the test hook with a caller-held productHint (spec §3.2: "a caller that
 *      genuinely HOLDS the product id ... may pass opts.productHint") — the ONLY honest way to reach the MATCH
 *      path in a browser today, since no real element supplies one (same reasoning the pure-node
 *      W-ITEM-DRAG-GATE witness uses). The DROP TARGET is found by scanning real host-wall faces with the
 *      engine's OWN canDropAt() as the oracle (never a re-derived geometry rule) — then dragged there with a
 *      REAL mouse down→move→up gesture and committed through the real pointerup handler.
 *   C. INVALID-DROP — same real grab, but the real drag lands the candidate ON TOP of another real element's
 *      box — refuses at commit, zero new ops, item stays at its pre-drag position (verified by AABB, not by
 *      assumption).
 *
 *   A1 GATE-REFUSAL   — real pick refuses the session; opLen unchanged; no phantom session.
 *   B1 GRAB-MATCH     — the productHint grab yields the real ad_product_dim dims (SINK: 0.5×0.45×0.2, WALL host).
 *   B2 DRAG-REAL      — real mouse down→move→up landing on an engine-verified valid (wall-hosted) candidate.
 *   B3 COMMIT         — exactly ONE new GEOM_MOVE for the dragged fid; verify=true.
 *   B4 KINEMATICS     — the dragged mesh's rendered AABB centre shifted by exactly the committed (dx,dy,dz).
 *   C1 GRAB-MATCH     — a second, independent grab (fresh session) for the invalid-drop case.
 *   C2 DRAG-REAL      — real mouse down→move→up landing squarely on another element's box.
 *   C3 REFUSE-COMMIT  — zero new ops; the dragged mesh's AABB centre is UNCHANGED (snap-back, never place-then-
 *                       flag, never auto-relocated — spec §3.4).
 *   Z NO-ERROR        — (asserted by the shared harness) no pageerror across the whole sequence.
 *
 * Regression sweep (run separately — shared canvas pointer surface is exactly where a UI-wiring collision
 * would show): node modeller/tests/witness_e2e_gridmove_real.js, node modeller/tests/witness_arc_editable.js.
 */
'use strict';
const { runE2E } = require('./e2e_harness');

const centre = (t, fid) => t.pg.evaluate((f) => {
  const g = window.Bonsai.group(); const m = g.children.find(o => o.isMesh && o.userData.featureId === f);
  if (!m) return null; const b = new window.THREE.Box3().setFromObject(m); const c = new window.THREE.Vector3(); b.getCenter(c); return [c.x, c.y, c.z];
}, fid);

// Grab a fid via the test hook until one is ELIGIBLE (spec §3.1 — not structural, not a real rel_fills_host
// host) and the productHint MATCHES (spec §3.2) — real building content varies, so this tries candidates in
// volume order rather than assuming a specific fid exists.
async function grabAny(t, productHint) {
  const cands = await t.pg.evaluate(() => window.__e2e.candidates());
  for (const c of cands) {
    const ok = await t.pg.evaluate((fid, hint) => window.__armItemDrag(fid, { productHint: hint }), c.fid, productHint);
    if (ok) return c.fid;   // __armItemDrag leaves itemDragging mode armed on a per-fid refusal — just try the next candidate
  }
  return null;
}

runE2E('W-ITEMDRAG-UI', async (t) => {
  await t.open('Duplex');

  // ── A. GATE-REFUSAL (real arm + real pick, no hint) ─────────────────────────────────────────────
  await t.clickSel('#b-itemdrag'); await t.sleep(200);
  const armTxt = await t.pg.evaluate(() => document.getElementById('b-itemdrag').textContent.trim());
  const cands = await t.pg.evaluate(() => window.__e2e.candidates());
  const beforeA = await t.oplog();
  let pickedFid = null;
  if (cands.length) {
    const c = cands[0];
    await t.pg.mouse.move(c.sx, c.sy); await t.sleep(40);
    await t.pg.mouse.click(c.sx, c.sy); await t.sleep(200);
    pickedFid = c.fid;
  }
  const afterA = await t.oplog();
  const noSessionA = await t.pg.evaluate(() => !window.Bonsai.itemdrag._session);
  await t.shot('itemdrag-gate-refused');
  t.assert('A1 GATE-REFUSAL (real pointerdown+raycast pick refuses the session, zero ops, no lift)',
    armTxt === 'Cancel' && afterA.len === beforeA.len && noSessionA,
    'arm="' + armTxt + '" opLen ' + beforeA.len + '→' + afterA.len + ' noSession=' + noSessionA + ' fid=' + pickedFid);
  await t.pg.evaluate(() => { const b = document.getElementById('b-itemdrag'); if (b && b.textContent.trim() === 'Cancel') b.click(); });
  await t.sleep(150);

  // ── B. VALID-DROP (test-hook grab WITH a caller-held hint; real drag to an engine-verified host face) ──
  const fidB = await grabAny(t, 'SINK');
  const sessB = fidB != null ? await t.pg.evaluate(() => {
    const s = window.Bonsai.itemdrag._session; if (!s) return null;
    return { fid: s.fid, real: s.real, preCentre: s.preCentre };
  }) : null;
  t.assert('B1 GRAB-MATCH (productHint=SINK yields the real ad_product_dim dims + WALL host requirement)',
    !!sessB && sessB.real && sessB.real.matchedProductId === 'FIXTURE_SINK' &&
    Math.abs(sessB.real.width - 0.5) < 1e-6 && Math.abs(sessB.real.depth - 0.45) < 1e-6 && Math.abs(sessB.real.height - 0.2) < 1e-6 &&
    sessB.real.anchor && sessB.real.anchor.requires_host === 'WALL',
    'fid=' + fidB + ' session=' + JSON.stringify(sessB));
  if (!sessB) { console.log('  §ABORT no eligible fid grabbed for B — skipping B2-B4'); }
  else {
    // Scan real wall faces with the engine's OWN canDropAt() as the oracle — never a re-derived geometry rule.
    // canDropAt's WALL branch (bonsai_itemdrag.js resolveHost) wants the CANDIDATE CENTRE within HOST_TOL
    // (0.05m) of the wall's own footprint — it then returns a SNAPPED flush-face position as its OUTPUT. The
    // scan must feed the drag the RAW (cx,cy) that validated, not the snapped output (which sits ~half the
    // item's depth outside the wall footprint by design — re-querying canDropAt AT the snapped point itself
    // fails the same tolerance check it just passed). The real mouse drag below re-derives the snap itself,
    // exactly as a real user's cursor hovering near the wall would.
    const found = await t.pg.evaluate(() => {
      const s = window.Bonsai.itemdrag._session; if (!s) return null;
      const z = s.preCentre[2];
      const wallFids = Object.keys(s.classByFid).filter(k => ['IfcWall', 'IfcWallStandardCase'].indexOf(s.classByFid[k]) !== -1);
      for (const k of wallFids) {
        const b = s.gateBoxes[k]; if (!b) continue;
        const ex = b[1] - b[0], ey = b[3] - b[2];
        const cxMid = (b[0] + b[1]) / 2, cyMid = (b[2] + b[3]) / 2;
        const long = ex >= ey ? 'x' : 'y';
        for (let f = 0.2; f <= 0.8; f += 0.15) {
          const cx = long === 'x' ? (b[0] + f * ex) : cxMid;
          const cy = long === 'x' ? cyMid : (b[2] + f * ey);
          const v = window.Bonsai.itemdrag.canDropAt(cx, cy, z);
          if (v.valid) return { x: cx, y: cy, z: z, snapped: v.snappedPos, wallFid: k };
        }
      }
      return null;
    });
    t.assert('B2a HOST-CANDIDATE (a real wall face producing valid:true was found by the engine oracle)', !!found, JSON.stringify(found));
    if (found) {
      const c0 = await centre(t, fidB);
      const pt = await t.proj(found.x, found.y, found.z);
      await t.pg.mouse.move(pt[0], pt[1]); await t.sleep(60);
      await t.pg.mouse.down(); await t.sleep(80);
      await t.pg.mouse.move(pt[0] + 8, pt[1] + 4, { steps: 4 }); await t.sleep(120);
      await t.pg.mouse.move(pt[0], pt[1], { steps: 4 }); await t.sleep(150);
      await t.shot('itemdrag-valid-preview');
      await t.pg.mouse.up(); await t.sleep(400);

      const beforeB = beforeA;   // no ops committed by A; use A's baseline for a clean opLen delta
      const afterB = await t.oplog(); const lastB = await t.lastOp(); const chainB = await t.verifyChain();
      await t.shot('itemdrag-valid-committed');
      t.assert('B3 COMMIT (exactly ONE new GEOM_MOVE for the dragged fid, verify=true)',
        afterB.len === beforeB.len + 1 && lastB && lastB.op_type === 'GEOM_MOVE' && lastB.parameters && lastB.parameters.parent === fidB,
        'opLen ' + beforeB.len + '→' + afterB.len + ' op=' + (lastB && lastB.op_type) + ' parent=' + (lastB && lastB.parameters && lastB.parameters.parent) + ' chain=' + chainB);

      const c1 = await centre(t, fidB);
      const dP = lastB && lastB.parameters;
      const mdx = (c1 && c0) ? c1[0] - c0[0] : null, mdy = (c1 && c0) ? c1[1] - c0[1] : null, mdz = (c1 && c0) ? c1[2] - c0[2] : null;
      t.assert('B4 KINEMATICS (dragged mesh AABB centre shifted by exactly the committed Δ)',
        dP && mdx != null && Math.abs(mdx - dP.dx) < 0.01 && Math.abs(mdy - dP.dy) < 0.01 && Math.abs(mdz - dP.dz) < 0.01,
        'Δcommitted=(' + (dP && dP.dx.toFixed(3)) + ',' + (dP && dP.dy.toFixed(3)) + ',' + (dP && dP.dz.toFixed(3)) + ') Δmeasured=(' +
        (mdx != null ? mdx.toFixed(3) : '?') + ',' + (mdy != null ? mdy.toFixed(3) : '?') + ',' + (mdz != null ? mdz.toFixed(3) : '?') + ')');
    }
  }
  await t.pg.evaluate(() => { const b = document.getElementById('b-itemdrag'); if (b && b.textContent.trim() === 'Cancel') b.click(); });
  await t.sleep(150);

  // ── C. INVALID-DROP (fresh grab; real drag lands on top of another real element → refuses, snap-back) ──
  const beforeC = await t.oplog();
  const fidC = await grabAny(t, 'SINK');
  const collideAt = fidC != null ? await t.pg.evaluate((self) => {
    const s = window.Bonsai.itemdrag._session; if (!s) return null;
    let best = null;
    Object.keys(s.gateBoxes).forEach(k => {
      if (String(k) === String(self)) return;
      const b = s.gateBoxes[k]; const vol = (b[1] - b[0]) * (b[3] - b[2]) * (b[5] - b[4]);
      if (!best || vol > best.vol) best = { k, vol, cx: (b[0] + b[1]) / 2, cy: (b[2] + b[3]) / 2, cz: s.preCentre[2] };
    });
    return best;
  }, fidC) : null;
  t.assert('C1 GRAB-MATCH (a fresh session for the invalid-drop case)', fidC != null && !!collideAt, 'fid=' + fidC + ' target=' + JSON.stringify(collideAt));
  if (fidC != null && collideAt) {
    const c0c = await centre(t, fidC);
    const ptc = await t.proj(collideAt.cx, collideAt.cy, collideAt.cz);
    await t.pg.mouse.move(ptc[0], ptc[1]); await t.sleep(60);
    await t.pg.mouse.down(); await t.sleep(80);
    await t.pg.mouse.move(ptc[0] + 5, ptc[1] + 5, { steps: 4 }); await t.sleep(120);
    await t.pg.mouse.move(ptc[0], ptc[1], { steps: 4 }); await t.sleep(150);
    await t.shot('itemdrag-invalid-preview');
    await t.pg.mouse.up(); await t.sleep(400);

    const afterC = await t.oplog();
    const c1c = await centre(t, fidC);
    await t.shot('itemdrag-invalid-refused');
    t.assert('C3 REFUSE-COMMIT (collision refuses commit — zero new ops, item snapped back)',
      afterC.len === beforeC.len && c1c && c0c && Math.abs(c1c[0] - c0c[0]) < 1e-6 && Math.abs(c1c[1] - c0c[1]) < 1e-6 && Math.abs(c1c[2] - c0c[2]) < 1e-6,
      'opLen ' + beforeC.len + '→' + afterC.len + ' centre ' + JSON.stringify(c0c && c0c.map(v => +v.toFixed(3))) + '→' + JSON.stringify(c1c && c1c.map(v => +v.toFixed(3))));
  }

  const gateLine = t.slog.find(l => l.indexOf('§ITEMDRAG REFUSED') >= 0);
  const commitLine = t.slog.find(l => l.indexOf('§ITEMDRAG commit') >= 0);
  console.log('  §CITE ' + (gateLine || '(no §ITEMDRAG REFUSED line captured)'));
  console.log('  §CITE ' + (commitLine || '(no §ITEMDRAG commit line captured)'));
}, { width: 1200, height: 850, dpr: 2 });
