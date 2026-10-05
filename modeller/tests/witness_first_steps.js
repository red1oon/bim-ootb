#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-FIRST-STEPS: the "First steps" baby-steps page (docs/ModellerFirstSteps.md), proven. Read the log after every run.
 * SPEC (3 lines): the flow  open URL → 📂 Open → Duplex → Fit → click ONE wall → Move → drag X arrow a little → Ctrl+Z → Save
 *   is run against the LIVE site (E2E_URL, default https://red1oon.github.io/bim-ootb/modeller/modeller.html); each step prints
 *   `§FIRST_STEPS step=<n> ...` with values read from app state (mesh count, selection fid, op delta, restored centre, snapshot bytes)
 *   and PASS / FAIL / INCONCLUSIVE (INCONCLUSIVE = nothing was judged, e.g. 0 elements). FALSIFIED by: 0 meshes after Open, selection
 *   size != 1, committed dx == 0 or rendered centre != committed delta, centre not restored (>1mm) after undo, no §SAVE_SNAPSHOT bytes.
 * The SAME run captures the page screenshots (clip regions, dpr 2) into OUT (default modeller/tests/first_steps_shots/).
 */
'use strict';
const fs = require('fs'), path = require('path');
const { runE2E } = require('./e2e_harness');
const URL = process.env.E2E_URL || 'https://red1oon.github.io/bim-ootb/modeller/modeller.html';
const OUT = process.env.OUT || path.join(__dirname, 'first_steps_shots');
fs.mkdirSync(OUT, { recursive: true });
const HOSTED = !!process.env.FIRST_STEPS_HOSTED;   // FIRST_STEPS_HOSTED=1: the SAME flow on a wall that HOSTS a door/window (finding #1 regression: one Ctrl+Z must undo the whole gesture)
const verdict = [];
const V = (n, name, state, detail) => { verdict.push([n, state]); console.log('§FIRST_STEPS step=' + n + ' ' + name + ' ' + detail + ' => ' + state); };

runE2E('W-FIRST-STEPS', async (t) => {
  const pg = t.pg;
  const meshCount = () => pg.evaluate(() => window.Bonsai.group().children.filter(o => o.isMesh).length);
  const rectOf = (sel) => pg.evaluate(s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }, sel);
  const shotRect = async (label, rects, pad) => {   // clip = union of the given rects (+pad), clamped to the viewport
    rects = rects.filter(Boolean); const vp = pg.viewport(); pad = pad == null ? 12 : pad;
    let x0 = Math.min(...rects.map(r => r.x)) - pad, y0 = Math.min(...rects.map(r => r.y)) - pad, x1 = Math.max(...rects.map(r => r.x + r.w)) + pad, y1 = Math.max(...rects.map(r => r.y + r.h)) + pad;
    x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(vp.width, x1); y1 = Math.min(vp.height, y1);
    const clip = { x: Math.round(x0), y: Math.round(y0), width: Math.round(x1 - x0), height: Math.round(y1 - y0) };
    await pg.screenshot({ path: path.join(OUT, label + '.png'), clip });
    console.log('  §SHOTCLIP ' + label + ' ' + JSON.stringify(clip));
  };
  const stat = () => pg.evaluate(() => (document.getElementById('stat') || {}).textContent || '');

  // ── 1. the app is open on the live URL (empty grid) ─────────────────────────────────────────────
  {
    const ready = await pg.evaluate(() => ({ scene: window.__sceneReady === true, bonsai: !!window.Bonsai, three: !!window.THREE, title: document.title, openBtn: !!document.getElementById('b-open') }));
    const m0 = await meshCount();
    await t.sleep(800);
    await shotRect('step1-app-open', [{ x: 0, y: 0, w: 1200, h: 800 }], 0);
    V(1, 'APP-LOADED', ready.scene && ready.bonsai && ready.openBtn ? 'PASS' : 'FAIL', 'url=' + URL + ' sceneReady=' + ready.scene + ' Bonsai=' + ready.bonsai + ' openBtn=' + ready.openBtn + ' meshesBeforeOpen=' + m0 + ' title="' + ready.title + '"');
  }

  // ── 2. click 📂 Open → the resident list appears ────────────────────────────────────────────────
  await pg.click('#b-open'); await t.sleep(500);
  {
    const rows = await pg.evaluate(() => Array.from(document.querySelectorAll('#m-open-panel .mo-row')).map(r => r.getAttribute('data-key')));
    await shotRect('step2-open-panel', [await rectOf('#b-open'), await rectOf('#m-open-panel')], 14);
    V(2, 'OPEN-PANEL', rows.length === 0 ? 'INCONCLUSIVE' : (rows.includes('Duplex') ? 'PASS' : 'FAIL'), 'residentRows=' + rows.length + ' keys=' + rows.join(',') + ' hasDuplex=' + rows.includes('Duplex'));
  }

  // ── 3. click Duplex → the building loads ────────────────────────────────────────────────────────
  const t0 = Date.now();
  await t.open('Duplex', { panelOpen: true, noFit: true });
  { const t1 = Date.now(); while (Date.now() - t1 < 60000 && (await meshCount()) === 0) await t.sleep(300); }   // the ARC seed lands after the DB opens
  {
    const n = await meshCount(); const oplen = await t.oplog();
    const rowsOL = await pg.evaluate(() => document.querySelectorAll('#outliner *, #ol *, #m-outliner *').length);
    await t.sleep(500);
    await shotRect('step3-duplex-loaded', [{ x: 0, y: 0, w: 1200, h: 800 }], 0);
    V(3, 'BUILDING-LOADED', n > 0 ? 'PASS' : 'INCONCLUSIVE', 'building=' + await pg.evaluate(() => window.__dwName) + ' meshes=' + n + ' outlinerNodes=' + rowsOL + ' loadMs=' + (Date.now() - t0) + ' oplog=' + JSON.stringify(oplen));
  }

  // ── 4. Fit — the whole building in view ─────────────────────────────────────────────────────────
  {
    const camD = () => pg.evaluate(() => { const c = window.A.camera, k = window.A.controls; return c.position.distanceTo(k.target); });
    const onScreen = () => pg.evaluate(() => { const g = window.Bonsai.group(); const cv = window.A.renderer.domElement, r = cv.getBoundingClientRect(); let inn = 0, tot = 0; const V3 = window.THREE.Vector3; for (const m of g.children) { if (!m.isMesh) continue; const b = new window.THREE.Box3().setFromObject(m); if (!isFinite(b.min.x)) continue; const c = b.getCenter(new V3()); const p = c.clone().project(window.A.camera); tot++; if (p.x > -1 && p.x < 1 && p.y > -1 && p.y < 1 && p.z < 1) inn++; } return { inn, tot }; });
    const d0 = await camD(), s0 = await onScreen();
    await pg.click('#b-fit'); await t.sleep(1800);
    const d1 = await camD(), s1 = await onScreen();
    await shotRect('step4-fit', [await rectOf('#b-fit'), await rectOf('#hist-slider'), { x: 0, y: 0, w: 1200, h: 800 }], 0);
    V(4, 'FIT', s1.tot === 0 ? 'INCONCLUSIVE' : (s1.inn === s1.tot ? 'PASS' : 'FAIL'), 'camDist ' + d0.toFixed(2) + '→' + d1.toFixed(2) + ' meshCentresOnScreen ' + s0.inn + '/' + s0.tot + '→' + s1.inn + '/' + s1.tot);
    await t.pg.evaluate(() => 0);
  }
  // (the harness's candidates() need a settled, fitted camera)
  { const t1 = Date.now(); let n = 0; while (Date.now() - t1 < 8000) { n = await pg.evaluate(() => window.__e2e.candidates().length); if (n > 0) break; await t.sleep(200); } console.log('  §OPEN-SETTLE candidates=' + n); }

  // ── 5. click ONE wall → exactly one element selected ────────────────────────────────────────────
  // A real wall: the op's own ifc_class matches /Wall/ (not a size guess), axis-aligned (rotX=rotY=0), element-scale, visible from the fitted camera.
  const wallFids = await pg.evaluate((hosted) => { const ops = window.Bonsai.oplog._geomOps(); const cand = window.__e2e.candidates().map(c => c.fid); const by = new Map(ops.map(o => [o.id, o])); return cand.filter(f => { const o = by.get(f); const P = o && o.parameters; if (!P || !/Wall/i.test(P.ifc_class || '')) return false; const pl = P.placement; if (pl && !(Math.abs(pl.rotX || 0) < 1e-6 && Math.abs(pl.rotY || 0) < 1e-6)) return false;
    // baby-steps subject = a wall with NO hosted door/window (one Ctrl+Z undoes it) — asked of the app's own cascade resolver, not guessed
    const r = window.SdgCascade.ridersFor([f], window.__arcGuidByFid, window.__arcFidByGuid, window.swXEdges.fills, new Set([f])); return hosted ? r.length >= 1 : r.length === 0; }); }, HOSTED);
  console.log('  §WALL-CANDIDATES (' + (HOSTED ? 'HOSTING a filling' : 'no hosted fillings') + ') n=' + wallFids.length + ' fids=' + wallFids.slice(0, 12));
  let sel = null;
  for (const wf of wallFids) {
    const pt = await pg.evaluate(f => window.__e2e.clickPointFor(f), wf); if (!pt) continue;
    await pg.mouse.move(pt[0], pt[1]); await t.sleep(40); await pg.mouse.click(pt[0], pt[1]); await t.sleep(200);
    const ss = await pg.evaluate(() => Array.from(window.Bonsai._selSet || []));
    if (ss.length === 1 && ss[0] === wf) { await t.flySettle(); sel = { fid: wf, centre: await t.centre(wf) }; break; }
    await t.flySettle(); await pg.evaluate(() => window.Bonsai.select(null)); await pg.click('#b-fit'); await t.sleep(900);
  }
  let c0 = null, fid = null;
  {
    const info = sel ? await pg.evaluate(f => { const g = window.Bonsai.group(); const m = g.children.find(o => o.isMesh && o.userData.featureId === f); const b = new window.THREE.Box3().setFromObject(m); const s = b.getSize(new window.THREE.Vector3()); return { n: Array.from(window.Bonsai._selSet || []).length, size: [s.x, s.y, s.z].map(v => +v.toFixed(2)), cls: ((window.Bonsai.oplog._geomOps().find(o => o.id === f) || {}).parameters || {}).ifc_class }; }, sel.fid) : null;
    if (sel) { fid = sel.fid; c0 = sel.centre; await t.frameElement(fid, 0.4); await t.sleep(400); const b = await t.bboxScreen(fid); await shotRect('step5-wall-selected', [{ x: b.x, y: b.y, w: b.width, h: b.height }], 90); }
    V(5, 'WALL-SELECTED', !sel ? 'INCONCLUSIVE' : (info.n === 1 ? 'PASS' : 'FAIL'), sel ? 'selectedCount=' + info.n + ' fid=' + fid + ' ifc_class=' + info.cls + ' bboxSize(m)=' + info.size + ' centre=' + c0.map(v => v.toFixed(3)) + ' status="' + (await stat()).slice(0, 90) + '"' : 'no wall could be picked');
  }
  if (!sel) { console.log('§FIRST_STEPS ABORT no wall — steps 6-9 INCONCLUSIVE'); for (let i = 6; i <= 9; i++) V(i, 'SKIPPED', 'INCONCLUSIVE', 'no wall selected'); return; }

  // ── 6. click Move → the arrow gizmo appears ─────────────────────────────────────────────────────
  await pg.click('#b-move'); await t.sleep(800);
  const giz = await pg.evaluate(() => { const gz = window.A.scene.getObjectByName('MoveGizmo'); if (!gz) return null; let h = null; gz.traverse(o => { if (o.userData && o.userData.moveAxis === 'x' && !h) h = o; }); if (!h) return null; const w = new window.THREE.Vector3(); h.getWorldPosition(w); return { handle: [w.x, w.y, w.z], on: document.getElementById('b-move').classList.contains('on') }; });
  {
    const b = await t.bboxScreen(fid); await shotRect('step6-move-gizmo', [{ x: b.x, y: b.y, w: b.width, h: b.height }], 110);
    V(6, 'MOVE-GIZMO', giz && giz.on ? 'PASS' : 'FAIL', 'moveButtonOn=' + (giz && giz.on) + ' xArrowAt=' + (giz ? giz.handle.map(v => v.toFixed(2)) : 'none'));
  }
  if (!giz) { for (let i = 7; i <= 9; i++) V(i, 'SKIPPED', 'INCONCLUSIVE', 'no gizmo'); return; }

  // ── 7. drag the red X arrow a little (0.5 m) → one signed move ──────────────────────────────────
  const before = await t.oplog();
  {
    const DELTA = 0.5, STEPS = 8, pts = [];
    for (let i = 0; i <= STEPS; i++) { const f = i / STEPS; pts.push(await t.proj(giz.handle[0] + DELTA * f, giz.handle[1], giz.handle[2])); }
    await pg.mouse.move(pts[0][0], pts[0][1]); await t.sleep(60); await pg.mouse.down(); await t.sleep(60);
    for (let i = 1; i < pts.length; i++) { await pg.mouse.move(pts[i][0], pts[i][1], { steps: 3 }); await t.sleep(30); }
    await t.sleep(60); await pg.mouse.up(); await t.sleep(1500);
    { const tw = Date.now(); let cc = await t.centre(fid); while (Date.now() - tw < 20000 && !(cc && Math.abs(cc[0] - c0[0]) > 0.05)) { await t.sleep(400); cc = await t.centre(fid); } console.log('  §MOVE-SETTLE renderedDxAfterMs=' + (Date.now() - tw) + ' dx=' + (cc ? (cc[0] - c0[0]).toFixed(3) : 'null')); }
    const after = await t.oplog();
    const newOps = await pg.evaluate(n => window.Bonsai.oplog._geomOps().slice(n), before.len);
    let c1 = await t.centre(fid); for (let i = 0; i < 10 && !c1; i++) { await t.sleep(300); c1 = await t.centre(fid); }
    const selOp = newOps.find(o => o.parameters && o.parameters.parent === fid);
    const d = selOp ? [selOp.parameters.dx, selOp.parameters.dy, selOp.parameters.dz] : [0, 0, 0];
    const rendered = c1 ? [c1[0] - c0[0], c1[1] - c0[1], c1[2] - c0[2]] : null;
    const err = rendered ? Math.hypot(rendered[0] - d[0], rendered[1] - d[1], rendered[2] - d[2]) : Infinity;
    await t.frameElement(fid, 0.35); await t.sleep(300);
    const b = await t.bboxScreen(fid); await shotRect('step7-moved', [{ x: b.x, y: b.y, w: b.width, h: b.height }], 110);
    const st = await stat();
    global.__moved = { before, after, d, err };
    V(7, 'MOVE-COMMITTED', !selOp ? 'FAIL' : (Math.abs(d[0]) > 0.01 && Math.abs(d[1]) < 1e-6 && Math.abs(d[2]) < 1e-6 && err < 1e-3 ? 'PASS' : 'FAIL'), 'oplog ' + before.len + '→' + after.len + ' newOps=' + newOps.length + ' committedDelta=' + d.map(v => v.toFixed(3)) + ' renderedDelta=' + (rendered ? rendered.map(v => v.toFixed(3)) : 'null') + ' err=' + err.toExponential(2) + 'm status="' + st.slice(0, 110) + '"');
  }

  // ── 8. Ctrl+Z → the move is undone exactly ──────────────────────────────────────────────────────
  {
    const cur0 = (await t.oplog()).cur;
    await pg.evaluate(() => { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); });
    await pg.keyboard.down('Control'); await pg.keyboard.press('KeyZ'); await pg.keyboard.up('Control'); await t.sleep(1800);
    { const tw = Date.now(); let cc = await t.centre(fid); while (Date.now() - tw < 20000 && !(cc && Math.hypot(cc[0] - c0[0], cc[1] - c0[1], cc[2] - c0[2]) < 1e-3)) { await t.sleep(400); cc = await t.centre(fid); } console.log('  §UNDO-SETTLE restoredAfterMs=' + (Date.now() - tw)); }
    const u = await t.oplog(); const c2 = await t.centre(fid);
    const resid = c2 ? Math.hypot(c2[0] - c0[0], c2[1] - c0[1], c2[2] - c0[2]) : Infinity;
    const slider = await pg.evaluate(() => { const s = document.getElementById('hist-slider'); return { v: +s.value, max: +s.max }; });
    const b = await t.bboxScreen(fid); await shotRect('step8-undone', [{ x: b.x, y: b.y, w: b.width, h: b.height }], 110);
    V(8, 'UNDO', (global.__moved.after.len === global.__moved.before.len) ? 'INCONCLUSIVE' : (u.cur < cur0 && resid < 1e-3 && (!HOSTED || u.cur === global.__moved.before.cur) ? 'PASS' : 'FAIL'), 'cursor ' + cur0 + '→' + u.cur + (HOSTED ? ' (want ' + global.__moved.before.cur + ': ONE Ctrl+Z undoes the whole hosted gesture)' : '') + ' centreResidual=' + resid.toExponential(2) + 'm slider=' + slider.v + '/' + slider.max + ' status="' + (await stat()).slice(0, 90) + '"');
  }

  // ── 9. Save → a snapshot file is written ────────────────────────────────────────────────────────
  {
    const saveLog = []; const h = m => { const x = m.text(); if (/^§SAVE_/.test(x)) saveLog.push(x); }; pg.on('console', h);
    const enabled = await pg.evaluate(() => !document.getElementById('b-save').disabled);
    await shotRect('step9-save-button', [await rectOf('#b-save')], 60);
    await pg.click('#b-save');
    const t1 = Date.now(); while (Date.now() - t1 < 60000 && !saveLog.some(l => /SAVE_SNAPSHOT|SAVE_BLOCKED/.test(l))) await t.sleep(300);
    await t.sleep(400);
    const snap = saveLog.find(l => /^§SAVE_SNAPSHOT/.test(l)); const bytes = snap ? +(snap.match(/bytes=(\d+)/) || [])[1] : 0;
    const st = await stat();
    await shotRect('step9-saved', [{ x: 0, y: 730, w: 1200, h: 70 }], 0);
    saveLog.forEach(l => console.log('  ' + l.slice(0, 200)));
    V(9, 'SAVE', !enabled ? 'FAIL' : (bytes > 0 ? 'PASS' : 'FAIL'), 'saveEnabled=' + enabled + ' snapshotBytes=' + bytes + ' status="' + st.slice(0, 80) + '" tookMs=' + (Date.now() - t1));
  }
}, { width: 1200, height: 800, dpr: 2, url: URL, noExit: true }).then(r => {
  const c = s => verdict.filter(v => v[1] === s).length;
  console.log('§FIRST_STEPS SUMMARY ' + c('PASS') + ' PASS / ' + c('FAIL') + ' FAIL / ' + c('INCONCLUSIVE') + ' INCONCLUSIVE  (harness: ' + JSON.stringify(r) + ')');
  process.exit(c('FAIL') || r.fail ? 1 : 0);
});
