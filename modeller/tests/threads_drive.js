'use strict';
/**
 * threads_drive.js — shared REAL-input drivers for the §THREADS witnesses (witness_history_threads.js,
 * witness_history_scoped_undo.js). bim-compiler prompts/HISTORY_PARALLEL_TIMELINE.md §THREADS-IMPL.
 * Every edit goes through the production path a user takes: real click on the element (the app's own pickAt), the
 * Move pill, a real drag of the gizmo arrow, Esc; the walk through window.discWalk (what the Walk pill calls); the
 * insert through the Insert pill + a real ground click. No engine seams, no synthetic rows.
 */
const D = (a, b) => (a && b) ? Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) : Infinity;

async function openDuplex(t) {
  await t.open('Duplex');
  const pg = t.pg;
  { const t1 = Date.now(); while (Date.now() - t1 < 60000 && !(await pg.evaluate(() => window.Bonsai.group().children.filter(o => o.isMesh).length))) await t.sleep(300); }
  await pg.waitForFunction(() => !!(window.__arcFidByGuid && window.swXEdges && window.swXEdges.fills && window.swXEdges.fills.length && window.SdgCascade), { timeout: 30000 }).catch(() => {});
}

// Axis-aligned walls visible from the fitted camera, with their hosted fillings (asked of the app's own SdgCascade).
async function wallCandidates(t) {
  return t.pg.evaluate(() => {
    const ops = window.Bonsai.oplog._geomOps(), by = new Map(ops.map(o => [o.id, o])), out = [];
    for (const c of window.__e2e.candidates()) {
      const o = by.get(c.fid), P = o && o.parameters; if (!P || !/Wall/i.test(P.ifc_class || '')) continue;
      const pl = P.placement; if (pl && !(Math.abs(pl.rotX || 0) < 1e-6 && Math.abs(pl.rotY || 0) < 1e-6)) continue;
      const r = window.SdgCascade.ridersFor([c.fid], window.__arcGuidByFid, window.__arcFidByGuid, window.swXEdges.fills, new Set([c.fid]));
      out.push({ fid: c.fid, riders: r });
    }
    return out;
  });
}

async function blurAll(pg) { await pg.evaluate(() => { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); }); }

// Real click on fid → true when it alone is selected. Two attempts: the second after Fit (a previous selection-fly can leave
// the camera where fid is occluded/off-screen — measured: B misses on every candidate after A's fly, 2 of 4 runs).
async function clickSelect(t, fid) {
  const pg = t.pg;
  for (let k = 0; k < 2; k++) {
    if (k) { await pg.evaluate(() => window.Bonsai.select(null)); await pg.click('#b-fit'); await t.sleep(1000); }
    const pt = await pg.evaluate(f => window.__e2e.clickPointFor(f), fid);
    if (!pt) continue;
    await pg.mouse.click(pt[0], pt[1]); await t.sleep(250);
    const ss = await pg.evaluate(() => Array.from(window.Bonsai._selSet || []));
    await t.flySettle();
    if (ss.length === 1 && ss[0] === fid) return true;
  }
  await pg.evaluate(() => window.Bonsai.select(null)); await pg.click('#b-fit'); await t.sleep(900);
  return false;
}

async function idle(t, ms) {
  const pg = t.pg, t0 = Date.now(); let last = -1, since = Date.now();
  while (Date.now() - t0 < (ms || 30000)) {
    const n = await pg.evaluate(() => { try { return window.Bonsai.oplog.db.exec('SELECT COUNT(*) FROM kernel_ops')[0].values[0][0]; } catch (e) { return -1; } });
    if (n !== last) { last = n; since = Date.now(); } else if (Date.now() - since >= 1200) break;
    await t.sleep(200);
  }
  await pg.evaluate(async () => { const MH = window.ModellerHistory; await ((MH && MH.pending && MH.pending()) || Promise.resolve()); });
}

// Select `fid` by a real click, Move pill, real drag of the X arrow by `delta` m, Esc. Returns the new rows or null.
async function moveByGizmo(t, fid, delta) {
  const pg = t.pg;
  if (!(await clickSelect(t, fid))) { console.log('  §THREADS-DRIVE select-miss fid=' + fid); return null; }
  const pre = await t.centre(fid);
  await pg.click('#b-move'); await t.sleep(800);
  const giz = await pg.evaluate(() => { const gz = window.A.scene.getObjectByName('MoveGizmo'); if (!gz) return null; let h = null; gz.traverse(o => { if (o.userData && o.userData.moveAxis === 'x' && !h) h = o; }); if (!h) return null; const w = new window.THREE.Vector3(); h.getWorldPosition(w); return [w.x, w.y, w.z]; });
  if (!giz) { console.log('  §THREADS-DRIVE no-gizmo fid=' + fid); return null; }
  const before = await pg.evaluate(() => window.Bonsai.oplog.db.exec('SELECT MAX(id) FROM kernel_ops')[0].values[0][0]);
  const STEPS = 8, pts = [];
  for (let i = 0; i <= STEPS; i++) pts.push(await t.proj(giz[0] + delta * i / STEPS, giz[1], giz[2]));
  await pg.mouse.move(pts[0][0], pts[0][1]); await t.sleep(60); await pg.mouse.down(); await t.sleep(60);
  for (let i = 1; i < pts.length; i++) { await pg.mouse.move(pts[i][0], pts[i][1], { steps: 3 }); await t.sleep(30); }
  await t.sleep(60); await pg.mouse.up(); await t.sleep(1200);
  { const t0 = Date.now(); while (Date.now() - t0 < 20000 && D(await t.centre(fid), pre) < 0.05) await t.sleep(300); }
  await idle(t, 15000);
  await blurAll(pg); await pg.keyboard.press('Escape'); await t.sleep(300);   // leave the Move tool
  await pg.evaluate(() => window.Bonsai.select(null));
  return pg.evaluate(b => { const r = window.Bonsai.oplog.db.exec('SELECT id, op_type, parameters, gid FROM kernel_ops WHERE id>' + b + ' ORDER BY id'); return r.length ? r[0].values.map(v => ({ id: v[0], op_type: v[1], p: JSON.parse(v[2]), gid: v[3] })) : []; }, before);
}

// window.discWalk is what the Walk pill calls; wait for the §WALK-GESTURE node.
async function walk(t, disc) {
  const pg = t.pg;
  const n0 = await pg.evaluate(() => (window.HistoryBar.list() || []).length);
  await pg.evaluate(d => window.discWalk(d, { building: 'Duplex' }), disc);
  const t0 = Date.now();
  while (Date.now() - t0 < 120000) {
    const ok = await pg.evaluate(() => !(window.ModellerHistory.inWalk && window.ModellerHistory.inWalk()));
    const n = await pg.evaluate(() => (window.HistoryBar.list() || []).length);
    if (ok && n > n0) break;
    await t.sleep(500);
  }
  await idle(t, 20000);
  return t.slog.filter(l => /§WALK-GESTURE recorded/.test(l)).slice(-1)[0] || null;
}

// Insert pill → first catalog leaf → real ground click a few metres off a real element. Returns the new row id.
async function insertOne(t) {
  const pg = t.pg;
  await pg.evaluate(() => window.Bonsai.select(null)); await pg.click('#b-fit'); await t.sleep(1000); await t.flySettle();   // a selection-fly can leave no ground in view
  await pg.click('#b-insert'); await t.sleep(300);
  await pg.evaluate(() => { const leaf = document.querySelector('#ins-panel .ins-c[data-hash]'); if (leaf) leaf.click(); });
  // a canvas pixel whose camera ray hits the ground plane z=0 in front of the camera (the plane the place handler
  // intersects) — scanned over a grid of real canvas pixels, so it works from wherever the camera was left
  const px = await pg.evaluate(() => {
    const cv = window.A.renderer.domElement, r = cv.getBoundingClientRect(), T = window.THREE, rc = new T.Raycaster(), hit = new T.Vector3();
    const plane = new T.Plane(new T.Vector3(0, 0, 1), 0);
    for (const fy of [0.55, 0.65, 0.45, 0.75, 0.35]) for (const fx of [0.5, 0.4, 0.6, 0.3, 0.7]) {
      const x = r.left + r.width * fx, y = r.top + r.height * fy, e = document.elementFromPoint(x, y);
      if (!e || e !== cv) continue;
      rc.setFromCamera(new T.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1), window.A.camera);
      if (rc.ray.intersectPlane(plane, hit) && hit.distanceTo(window.A.camera.position) < 200) return [x, y, 0];
    }
    return null;
  });
  if (!px) { console.log('  §THREADS-DRIVE insert no ground point on the canvas' + ' cam=' + JSON.stringify(await pg.evaluate(() => { const c = window.A.camera, b = new window.THREE.Box3().setFromObject(window.Bonsai.group()); return { p: c.position.toArray().map(v => +v.toFixed(2)), near: c.near, fov: c.fov, grp: [b.min.toArray().map(v => +v.toFixed(1)), b.max.toArray().map(v => +v.toFixed(1))], stat: document.getElementById('stat').textContent, sel: Array.from(window.Bonsai._selSet || []) }; }))); return null; }
  const before = await pg.evaluate(() => window.Bonsai.oplog.db.exec('SELECT MAX(id) FROM kernel_ops')[0].values[0][0]);
  await pg.mouse.move(px[0], px[1]); await t.sleep(120);
  await pg.mouse.down(); await t.sleep(80); await pg.mouse.up(); await t.sleep(1400);
  await idle(t, 15000);
  console.log('  §THREADS-DRIVE insert px=' + px.map(v => Math.round(v)));
  await pg.click('#b-insert'); await t.sleep(200);   // real toggle-off
  return pg.evaluate(b => { const r = window.Bonsai.oplog.db.exec("SELECT id FROM kernel_ops WHERE op_type='GEOM_INSERT' AND id>" + b + ' ORDER BY id DESC LIMIT 1'); return r.length ? r[0].values[0][0] : null; }, before);
}

// The bar's own line, compact: [{seq, label, type, idx, cats, els, ids}] — read from the live HistoryBar.
async function line(t) {
  return t.pg.evaluate(() => {
    const HB = window.HistoryBar, MH = window.ModellerHistory, th = HB.threads(), seqCats = {};
    Object.keys(th).forEach(c => th[c].forEach(s => { (seqCats[s] = seqCats[s] || []).push(c); }));
    const all = []; Object.keys(th).forEach(c => HB.threadEntries(c).forEach(e => { if (!all.some(a => a.seq === e.seq)) all.push(e); }));
    // along one path of the tree seq strictly increases (a child is always pushed after its parent) ⇒ seq order = log order
    return all.sort((a, b) => a.seq - b.seq).map(e => ({ seq: e.seq, label: e.label, type: e.type, cats: seqCats[e.seq] || [], els: MH.elementOf(e), ids: e.ids || e.rows || null, revertOf: e.revertOf || null }));
  });
}

module.exports = { D, openDuplex, wallCandidates, clickSelect, moveByGizmo, walk, insertOne, idle, line, blurAll };
