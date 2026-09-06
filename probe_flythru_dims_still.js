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
    // Pull-back pose: far enough out that both wings are in frame — the shot the user named.
    const plan = A.cinemaPathPlan(195.8);
    const q = plan.poseAt(0.90);
    A.camera.position.set(q.x, q.y, q.z);
    A.controls.target.set(q.tx, q.ty, q.tz);
    A.controls.update(); A.camera.updateMatrixWorld();

    const meshes = []; A.scene.traverse(o => { if (o.isMesh && o !== A.ground && o.visible) meshes.push(o); });
    const fwd = new T.Vector3(); A.camera.getWorldDirection(fwd);
    const up = new T.Vector3(0, 1, 0);
    const right = new T.Vector3().crossVectors(fwd, up).normalize();
    const rc = new T.Raycaster(); rc.far = 400;
    const origin = A.camera.position.clone();

    // Sweep horizontal rays across the view at a few heights: each ray's hit list gives every void
    // it crosses. A ray that leaves one wing, crosses open air and enters the other IS the wing gap.
    const cands = [];
    for (let s = -0.5; s <= 0.5001; s += 0.1) {
      for (const hStep of [-18, -8, 2]) {
        const dir = fwd.clone().addScaledVector(right, s).normalize();
        const o2 = origin.clone().addScaledVector(up, hStep);
        rc.set(o2, dir);
        const hits = rc.intersectObjects(meshes, false);
        if (hits.length < 2) continue;
        const ds = hits.map(h => h.distance);
        for (const g of A.flythruGapsAlong(ds, false)) {
          const a = o2.clone().addScaledVector(dir, g.from);
          const bb = o2.clone().addScaledVector(dir, g.to);
          const spanDir = bb.clone().sub(a).normalize();
          const pa = a.clone().project(A.camera), pb = bb.clone().project(A.camera);
          // occlusion: does anything sit in front of each endpoint from the CAMERA's eye?
          const occ = (pt) => { rc.set(origin, pt.clone().sub(origin).normalize());
            const h = rc.intersectObjects(meshes, false);
            return !!(h.length && h[0].distance < origin.distanceTo(pt) - 0.25); };
          cands.push({ a: { x: pa.x, y: pa.y, z: pa.z }, b: { x: pb.x, y: pb.y, z: pb.z },
            lengthM: g.lengthM, alignToView: spanDir.dot(fwd),
            occludedA: occ(a), occludedB: occ(bb),
            _wa: [a.x, a.y, a.z], _wb: [bb.x, bb.y, bb.z] });
        }
      }
    }
    const scored = cands.map(c => ({ c, g: A.flythruGate(c) }));
    const passed = scored.filter(x => x.g.pass).sort((x, y) => y.g.score - x.g.score);
    const why = {}; scored.filter(x => !x.g.pass).forEach(x => { const k = (x.g.why || '?').split(':')[0]; why[k] = (why[k] || 0) + 1; });

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
    console.log('§FDS_RESULT candidates=' + cands.length + ' passed=' + passed.length +
      ' shown=[' + shown.map(s => s.m + 'm').join(', ') + '] rejects=' + JSON.stringify(why));
    return { candidates: cands.length, passed: passed.length, shown, why };
  });
  await sleep(4000);
  await p.screenshot({ path: path.join(OUT, 'flythru_dims_still.png') });
  await b.close();
  console.log(JSON.stringify(result, null, 1));
  console.log(logs.filter(l => /§FDS_|§FLYTHRU/.test(l)).join('\n'));
})();
