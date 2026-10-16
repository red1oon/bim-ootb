// §FLYTHRU_DIMS_STILL — concept still for the fly-through blue-dot measures.
// User: "If u got some sample blue dots measures, just snap a still image will do to confirm the
// concept is good." So this is a CONCEPT PROOF, not a bake: cast real rays into the real Hospital
// mesh, run the real A.flythruGapsAlong / A.flythruGate from cpe_flythru_dims.js, and draw whatever
// survives with measure.js's own blue dot + dashed line. Every number on screen is measured off
// geometry — nothing here is authored.
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const path = require('path');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const OUT = process.env.OUT_DIR || '/tmp/wt-storey-reveal/out';
const PORT = process.env.PORT || '8477';
(async () => {
  const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 900000,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] });
  const p = await b.newPage(); await p.setViewport({ width: 1600, height: 900 });
  const logs = []; p.on('console', m => logs.push(m.text())); p.on('pageerror', e => logs.push('PAGEERROR ' + e.message));
  await p.goto(`http://localhost:${PORT}/viewer/viewer.html?db=/buildings/Hospital_silent_local.db`,
    { waitUntil: 'domcontentloaded', timeout: 90000 });
  await p.waitForFunction(() => window.APP && window.APP.dbQuery && window.APP.cinemaPathPlan, { timeout: 240000 });
  await p.waitForFunction(() => { try { const r = window.APP.dbQuery('SELECT COUNT(*) FROM element_transforms'); return r && r[0][0] > 0; } catch (e) { return false; } }, { timeout: 180000, polling: 2000 });
  // stream every building part in, then wait for the mesh count to settle
  const parts = await p.evaluate(() => (window.APP.dbQuery('SELECT DISTINCT building FROM elements_meta') || []).map(r => r[0]));
  for (const bb of parts) { await p.evaluate(x => { try { window.APP.streamBuilding(x); } catch (e) {} }, bb); }
  // Wait for the model to actually FINISH streaming. The first run of this probe read
  // Object.keys(guidMap).length, which plateaued at 500 while the real loader was only at 26%
  // (status read "Hospital — 16,500/63,182"), so the still was taken against DLOD wireframe bbox
  // placeholders and every candidate was correctly rejected as too-small-on-screen. Poll the loader's
  // OWN progress text instead, and require it to be gone (or complete) and then stable.
  let progress = '', stable = 0;
  for (let i = 0; i < 400; i++) {
    const st = await p.evaluate(() => (window.APP.status && window.APP.status.textContent) || '');
    const m = st.match(/([\d,]+)\s*\/\s*([\d,]+)/);
    const done = !m || m[1].replace(/,/g, '') === m[2].replace(/,/g, '');
    if (done) { stable++; if (stable >= 4) { progress = st; break; } } else { stable = 0; progress = st; }
    await sleep(3000);
  }
  const meshCount = await p.evaluate(() => { let n = 0; window.APP.scene.traverse(o => { if (o.isMesh || o.isInstancedMesh || o.isBatchedMesh) n++; }); return n; });
  console.log('§FDS_MESHES sceneMeshes=' + meshCount + ' lastStatus="' + progress + '"');
  await sleep(6000);

  const result = await p.evaluate(() => {
    const A = window.APP, T = window.THREE;
    if (!A.flythruGate || !A.flythruGapsAlong) return { err: 'cpe_flythru_dims.js not loaded' };
    // §FLYTHRU_BEAT — INDOORS, during the fly-through ONLY. (User: "during the pullout should be
    // avoided as it has its focus already meted out for it. The blue dots should be only during the
    // fly thru" ... "in doors" ... "the wing length is due to it exiting momentarily is what i meant".)
    // So the wing-to-wing span was never a pull-back shot: it is the moment the walk path briefly
    // EXITS the building and both wings come into view. That needs no special case — the gate already
    // fires whatever reads at that instant, so an interior corridor width and a momentary outdoor wing
    // span come from exactly the same cast.
    // The walk runs [beats.spin, beats.out] = [0.094, 0.353] on the shipped Hospital path (§CINEMA_BEATS).
    const plan = A.cinemaPathPlan(195.8);
    const b0 = plan.beats.spin, b1 = plan.beats.out;
    const meshes = []; A.scene.traverse(o => { if (o.isMesh && o !== A.ground && o.visible) meshes.push(o); });
    const env = A.dbQuery('SELECT MIN(center_x - bbox_x/2), MAX(center_x + bbox_x/2),' +
      ' MIN(center_y - bbox_y/2), MAX(center_y + bbox_y/2),' +
      ' MIN(center_z - bbox_z/2), MAX(center_z + bbox_z/2) FROM element_transforms')[0];
    A.flythruSetScale(+env[1] - +env[0], +env[3] - +env[2], +env[5] - +env[4]);
    const rc = new T.Raycaster();
    const up = new T.Vector3(0, 1, 0);
    const sbox = new T.Box3(), _t = new T.Box3();
    meshes.forEach(m => { try { _t.setFromObject(m); if (isFinite(_t.min.x)) sbox.union(_t); } catch (e) {} });
    const sdiag = sbox.getSize(new T.Vector3()).length();

    // Real stair elements -> their SCENE positions, resolved through the mesh, not the DB frame.
    const stairPts = [];
    try {
      const rows = A.dbQuery("SELECT guid FROM elements_meta WHERE ifc_class IN ('IfcStair','IfcStairFlight')") || [];
      const box = new T.Box3();
      for (const r of rows) {
        const e = A.guidMap && A.guidMap[r[0]];
        const mesh = e && (e.isObject3D ? e : (e.mesh || e.object || null));
        if (!mesh) continue;
        try {
          box.setFromObject(mesh);
          if (!isFinite(box.min.x)) continue;
          const c = box.getCenter(new T.Vector3());
          c.y = box.max.y - 0.05;          // just under the stair's top surface, cast DOWN from there
          stairPts.push(c);
        } catch (e2) {}
      }
    } catch (eS) {}
    console.log('§FDS_STAIRS resolved=' + stairPts.length + ' (scene positions via guidMap, not the DB frame)');

    // Sweep the WHOLE walk, score every pose, keep the best — rather than guessing one instant.
    let best = null; const perPose = [];
    for (let k = 0; k <= 24; k++) {
      const tn = b0 + (b1 - b0) * (k / 24);
      const q = plan.poseAt(tn);
      A.camera.position.set(q.x, q.y, q.z);
      A.controls.target.set(q.tx, q.ty, q.tz);
      A.controls.update(); A.camera.updateMatrixWorld();
      const fwd = new T.Vector3(); A.camera.getWorldDirection(fwd);
      const right = new T.Vector3().crossVectors(fwd, up).normalize();
      const origin = A.camera.position.clone();
      const cands = [];
      const castFrom = (o2, dir, fromOrigin) => {
        rc.far = sdiag * 3; rc.set(o2, dir);
        const hits = rc.intersectObjects(meshes, false);
        if (!hits.length) return;
        for (const g of A.flythruGapsAlong(hits.map(h => h.distance), fromOrigin)) {
          const aa = o2.clone().addScaledVector(dir, g.from);
          const bb = o2.clone().addScaledVector(dir, g.to);
          const sd = bb.clone().sub(aa).normalize();
          const pa = aa.clone().project(A.camera), pb = bb.clone().project(A.camera);
          const occ = (pt) => { const d = pt.clone().sub(origin); const L = d.length();
            rc.far = sdiag * 3; rc.set(origin, d.clone().normalize());
            const h = rc.intersectObjects(meshes, false);
            return !!(h.length && h[0].distance < L - 0.25); };
          // §FLYTHRU_SKY_BACKDROP — is there open sky behind this span? Ray from the camera THROUGH
          // the midpoint: nothing hit => we are looking through the gap at sky, which is what makes
          // the wing sighting the showpiece rather than just another empty interval.
          const mid = aa.clone().add(bb).multiplyScalar(0.5);
          const md = mid.clone().sub(origin); const mL = md.length();
          rc.far = sdiag * 3; rc.set(origin, md.clone().normalize());
          const beyond = rc.intersectObjects(meshes, false).filter(h => h.distance > mL + 0.5);
          cands.push({ a: { x: pa.x, y: pa.y, z: pa.z }, b: { x: pb.x, y: pb.y, z: pb.z },
            lengthM: g.lengthM, alignToView: sd.dot(fwd), occludedA: occ(aa), occludedB: occ(bb),
            skyBehind: beyond.length === 0,
            _wa: [aa.x, aa.y, aa.z], _wb: [bb.x, bb.y, bb.z], _tn: tn });
        }
      };
      // HORIZONTAL, perpendicular to the view: start off to the left of the camera and cast across.
      // Indoors this crosses the corridor/room the camera is in; at the momentary exit it crosses the
      // gap between the wings. Same cast, the gate decides which one reads.
      const LEAD = Math.min(60, sdiag * 0.35);
      for (const dh of [-1.2, 0, 2.0, 5.0]) {
        const o2 = origin.clone().addScaledVector(right, -LEAD); o2.y += dh;
        castFrom(o2, right.clone(), false);
      }
      // VERTICAL: HEAD CLEARANCE — from just above the floor beneath the camera, straight up. The
      // origin->first-hit interval IS the clearance (the camera stands in the void; the first thing
      // above is the ceiling, a duct or a beam). This is the cue the user named first.
      for (const df of [0, 4, -4]) {
        const o2 = origin.clone().addScaledVector(fwd, df); o2.y -= 1.6;
        castFrom(o2, up.clone(), true);
      }
      // STAIRS — the other cue the user named ("height of a part of the stairs to the floor"). Do not
      // wait for the blind sweep to stumble onto one: go to the real IfcStair elements and cast DOWN
      // from each to whatever is beneath it. Scene positions come from the MESH (A.guidMap), never
      // from element_transforms — those are in the DB's own frame, ~169m off the scene's Y, the trap
      // that returned candidates=0 on an earlier run.
      if (stairPts.length) {
        for (const sp of stairPts) {
          if (sp.distanceTo(origin) > sdiag * 0.35) continue;   // only stairs near this instant
          castFrom(sp.clone(), up.clone().negate(), true);
        }
      }
      const sc = cands.map(c => ({ c, g: A.flythruGate(c) }));
      const ps = sc.filter(x => x.g.pass).sort((x, y) => y.g.score - x.g.score);
      const top = sc.slice().sort((x, y) => (y.g.screenFrac || 0) - (x.g.screenFrac || 0))[0];
      perPose.push({ tn: +tn.toFixed(3), cands: cands.length, passed: ps.length,
                     bestFrac: +((top && top.g.screenFrac) || 0).toFixed(3) });
      if (ps.length && (!best || ps[0].g.score > best.scored[0].g.score)) best = { tn, scored: ps, all: sc };
    }
    console.log('§FDS_WALK_SWEEP ' + perPose.map(x => x.tn + ':' + x.passed + '/' + x.cands + '@' + x.bestFrac).join(' '));
    if (!best) {
      const flat = perPose.reduce((m, x) => Math.max(m, x.bestFrac), 0);
      console.log('§FDS_RESULT INCONCLUSIVE — no pose in the walk produced a passing span; bestScreenFrac=' + flat);
      return { candidates: perPose.reduce((n, x) => n + x.cands, 0), passed: 0, shown: [], perPose };
    }
    // Park the camera at the winning instant and draw there.
    const qb = plan.poseAt(best.tn);
    A.camera.position.set(qb.x, qb.y, qb.z);
    A.controls.target.set(qb.tx, qb.ty, qb.tz);
    A.controls.update(); A.camera.updateMatrixWorld();
    const scored = best.all, passed = best.scored;
    console.log('§FDS_BEST_POSE tn=' + best.tn.toFixed(3) + ' passed=' + passed.length +
      ' top=' + passed.slice(0, 4).map(x => x.c.lengthM.toFixed(1) + 'm' +
      (x.g.skyBehind ? '/SKY' : '/solid') + '/score' + x.g.score.toFixed(2)).join(' '));
    const why = {}; scored.filter(x => !x.g.pass).forEach(x => { const k = (x.g.why || '?').split(':')[0]; why[k] = (why[k] || 0) + 1; });
    // Distribution of the measured screen fraction — so a threshold decision is made on data, not feel.
    const byFrac = scored.slice().sort((x, y) => (y.g.screenFrac || 0) - (x.g.screenFrac || 0)).slice(0, 12);
    console.log('§FDS_SCREENFRAC_TOP ' + byFrac.map(x =>
      (x.g.screenFrac || 0).toFixed(3) + '@' + (x.g.lengthM || 0).toFixed(1) + 'm/align' +
      (x.g.align || 0).toFixed(2) + (x.g.pass ? '/PASS' : '/' + (x.g.why || '').split(':')[0])).join('  '));

    // §FLYTHRU_DIM_CUE (user: "the measure visual impose should be the std cue lines with arrow heads
    // to lines with ##mm in between") — the STANDARD architectural dimension cue, not the Measure
    // tool's blue dots: a short extension (witness) line at each end, a dimension line between them
    // with arrow heads turned inward, and the value in MILLIMETRES breaking the line at its midpoint.
    // Drawn in SCREEN space as one SVG overlay. That is not a shortcut for the still: the shipped
    // version has to live in the bake's 2D canvas pass anyway (a bake captures the canvas, so DOM and
    // 3D-billboard text are both wrong there), and screen-space projection is exactly what that pass
    // consumes — so this geometry ports over unchanged.
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('style', 'position:fixed;left:0;top:0;width:100vw;height:100vh;z-index:500;pointer-events:none');
    const W = window.innerWidth, H = window.innerHeight;
    const CUE = '#4fc3f7';
    const mk = (t, at) => { const e = document.createElementNS(NS, t); for (const k in at) e.setAttribute(k, at[k]); return e; };
    const shown = [];
    for (const x of passed.slice(0, 3)) {
      const a = new T.Vector3(...x.c._wa), bb = new T.Vector3(...x.c._wb);
      const pa = a.clone().project(A.camera), pb = bb.clone().project(A.camera);
      const ax = (pa.x * 0.5 + 0.5) * W, ay = (-pa.y * 0.5 + 0.5) * H;
      const bx = (pb.x * 0.5 + 0.5) * W, by = (-pb.y * 0.5 + 0.5) * H;
      const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy);
      if (L < 1) continue;
      const ux = dx / L, uy = dy / L;          // along the dimension line
      const nx = -uy, ny = ux;                 // perpendicular: extension ticks
      const EXT = 13, AR = 11, ARW = 4.5;
      // extension (witness) lines, straddling each endpoint
      svg.appendChild(mk('line', { x1: ax + nx * EXT, y1: ay + ny * EXT, x2: ax - nx * EXT, y2: ay - ny * EXT, stroke: CUE, 'stroke-width': 1.6 }));
      svg.appendChild(mk('line', { x1: bx + nx * EXT, y1: by + ny * EXT, x2: bx - nx * EXT, y2: by - ny * EXT, stroke: CUE, 'stroke-width': 1.6 }));
      // value in MILLIMETRES, breaking the dimension line at its midpoint
      const mm = Math.round(x.c.lengthM * 1000).toLocaleString() + ' mm';
      const tw = mm.length * 9.6 + 14, gap = tw / 2 + 6;
      const mx = (ax + bx) / 2, my = (ay + by) / 2;
      svg.appendChild(mk('line', { x1: ax, y1: ay, x2: mx - ux * gap, y2: my - uy * gap, stroke: CUE, 'stroke-width': 1.6 }));
      svg.appendChild(mk('line', { x1: mx + ux * gap, y1: my + uy * gap, x2: bx, y2: by, stroke: CUE, 'stroke-width': 1.6 }));
      // arrow heads, turned INWARD at each end (standard cue)
      svg.appendChild(mk('polygon', { points: [ax, ay, ax + ux * AR + nx * ARW, ay + uy * AR + ny * ARW, ax + ux * AR - nx * ARW, ay + uy * AR - ny * ARW].join(' '), fill: CUE }));
      svg.appendChild(mk('polygon', { points: [bx, by, bx - ux * AR + nx * ARW, by - uy * AR + ny * ARW, bx - ux * AR - nx * ARW, by - uy * AR - ny * ARW].join(' '), fill: CUE }));
      const th = 21;
      svg.appendChild(mk('rect', { x: mx - tw / 2, y: my - th / 2, width: tw, height: th, rx: 3, fill: 'rgba(16,22,30,0.80)' }));
      const tx = mk('text', { x: mx, y: my + 6, fill: CUE, 'text-anchor': 'middle', 'font-family': 'Segoe UI,sans-serif', 'font-size': 15, 'font-weight': 700 });
      tx.textContent = mm; svg.appendChild(tx);
      shown.push({ mm: mm, m: x.c.lengthM.toFixed(2), score: +x.g.score.toFixed(3) });
    }
    document.body.appendChild(svg);
    A.markDirty && A.markDirty();
    console.log('§FDS_RESULT candidates=' + scored.length + ' passed=' + passed.length +
      ' shown=[' + shown.map(s => s.m + 'm').join(', ') + '] rejects=' + JSON.stringify(why));
    return { candidates: scored.length, passed: passed.length, shown, why, tn: +best.tn.toFixed(4) };
  });
  await sleep(4000);
  await p.screenshot({ path: path.join(OUT, 'flythru_dims_still.png') });
  await b.close();
  console.log(JSON.stringify(result, null, 1));
  console.log(logs.filter(l => /§FDS_|§FLYTHRU/.test(l)).join('\n'));
})();
