// §FLYTHRU_DIM_CUE demo — EASY TARGETS, demonstrative only.
// User: "just find easy targets to test out - this is not meant to be a quantitative effort, again,
// it is just for demonstrative purpose." So no search, no gate sweep: take REAL elements whose
// dimension is obvious (a door, a stair, a storey slab), point the camera squarely at each, and draw
// the standard dimension cue. Every number is still measured off the real mesh bounding box in SCENE
// space (via A.guidMap — never element_transforms, which is the DB frame ~169m off the scene's Y).
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
  await p.waitForFunction(() => window.APP && window.APP.dbQuery && window.APP.guidMap, { timeout: 240000 });
  const parts = await p.evaluate(() => (window.APP.dbQuery('SELECT DISTINCT building FROM elements_meta') || []).map(r => r[0]));
  for (const bb of parts) await p.evaluate(x => { try { window.APP.streamBuilding(x); } catch (e) {} }, bb);
  let stable = 0;
  for (let i = 0; i < 400; i++) {
    const st = await p.evaluate(() => (window.APP.status && window.APP.status.textContent) || '');
    const m = st.match(/([\d,]+)\s*\/\s*([\d,]+)/);
    if (!m || m[1].replace(/,/g, '') === m[2].replace(/,/g, '')) { if (++stable >= 4) break; } else stable = 0;
    await sleep(3000);
  }
  await sleep(5000);

  // Install the cue drawer + the target picker in the page.
  await p.evaluate(() => {
    const A = window.APP, T = window.THREE;
    // EASY TARGETS, no search. streaming.js:2107 already keeps everything needed:
    //   A._instanceGuids[guid]        -> { meshId, instanceIndex }
    //   A._instanceMeta[meshId][i]    -> { guid, storey, disc, ifcClass, bx, by, bz }
    // bx/by/bz are the element's OWN measured extents, so the number needs no raycast and no Box3.
    // The instance matrix gives the world placement and orientation, so the cue can be drawn along
    // the element's real width axis rather than an arbitrary screen direction.
    // (Earlier attempts failed because guidMap is meshId->guid, the REVERSE of a lookup, and because
    //  no plain mesh carries an ifcClass here — this model is entirely instanced.)
    A._dimTargetFor = function (ifcClass, want) {
      const rows = A.dbQuery("SELECT guid FROM elements_meta WHERE ifc_class='" + ifcClass + "' LIMIT 800") || [];
      const m4 = new T.Matrix4(), pos = new T.Vector3(), quat = new T.Quaternion(), scl = new T.Vector3();
      let best = null;
      for (const r of rows) {
        const ref = A._instanceGuids && A._instanceGuids[r[0]];
        if (!ref) continue;
        const meta = A._instanceMeta && A._instanceMeta[ref.meshId];
        const mesh = A.scene.getObjectById(ref.meshId);
        if (!meta || !mesh || !mesh.getMatrixAt) continue;
        const md = meta[ref.instanceIndex];
        if (!md) continue;
        const bx = +md.bx || 0, by = +md.by || 0, bz = +md.bz || 0;
        const w = Math.max(bx, by);                 // rotation-safe width (naive bx alone gives leaf thickness)
        const v = (want === 'v') ? bz : w;
        if (!(v > 0.5 && v < 15)) continue;
        if (best && v <= best.v) continue;
        mesh.getMatrixAt(ref.instanceIndex, m4);
        m4.decompose(pos, quat, scl);
        mesh.updateMatrixWorld();
        const world = pos.clone().applyMatrix4(mesh.matrixWorld);
        // width axis in the element's own local frame -> world
        const local = (bx >= by) ? new T.Vector3(1, 0, 0) : new T.Vector3(0, 1, 0);
        const dir = local.applyQuaternion(quat).applyQuaternion(
          new T.Quaternion().setFromRotationMatrix(mesh.matrixWorld)).normalize();
        // Height is WORLD UP, full stop. Composing local-Z through two quaternions produced a
        // HORIZONTAL cue labelled "Door height" in the first demo — the instance matrix already
        // carries the Z-up -> Y-up conversion, so re-applying it rotated the axis into the floor plane.
        const upW = new T.Vector3(0, 1, 0);
        best = { v, w, bz, world, dir, upW, guid: r[0] };
      }
      return best;
    };
    A._dimPickTargets = function () {
      const out = [];
      const d = A._dimTargetFor('IfcDoor', 'h');
      if (d) out.push({ kind: 'Door width', p: [d.world.x, d.world.y, d.world.z],
        dir: [d.dir.x, d.dir.y, d.dir.z], span: d.w, view: 'perp' });
      const dh = A._dimTargetFor('IfcDoor', 'v');
      if (dh) out.push({ kind: 'Door height', p: [dh.world.x, dh.world.y, dh.world.z],
        dir: [dh.upW.x, dh.upW.y, dh.upW.z], span: dh.bz, view: 'perp' });
      const st = A._dimTargetFor('IfcStair', 'v');
      if (st) out.push({ kind: 'Stair rise', p: [st.world.x, st.world.y, st.world.z],
        dir: [st.upW.x, st.upW.y, st.upW.z], span: st.bz, view: 'perp' });
      console.log('§DIM_TARGETS_FOUND ' + JSON.stringify(out.map(o => o.kind + '=' + o.span.toFixed(2) + 'm')));
      return out;
    };
    // The standard cue, screen space: extension lines, inward arrow heads, value in mm between.
    A._dimDrawCue = function (pA, pB, labelText) {
      const NS = 'http://www.w3.org/2000/svg';
      let svg = document.getElementById('dimcue');
      if (!svg) { svg = document.createElementNS(NS, 'svg'); svg.id = 'dimcue';
        svg.setAttribute('style', 'position:fixed;left:0;top:0;width:100vw;height:100vh;z-index:600;pointer-events:none');
        document.body.appendChild(svg); }
      const W = window.innerWidth, H = window.innerHeight, CUE = '#4fc3f7';
      const mk = (t, at) => { const e = document.createElementNS(NS, t); for (const k in at) e.setAttribute(k, at[k]); return e; };
      const qa = pA.clone().project(A.camera), qb = pB.clone().project(A.camera);
      const ax = (qa.x * .5 + .5) * W, ay = (-qa.y * .5 + .5) * H;
      const bx = (qb.x * .5 + .5) * W, by = (-qb.y * .5 + .5) * H;
      const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy); if (L < 2) return null;
      const ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
      const EXT = 15, AR = 13, ARW = 5;
      svg.appendChild(mk('line', { x1: ax + nx * EXT, y1: ay + ny * EXT, x2: ax - nx * EXT, y2: ay - ny * EXT, stroke: CUE, 'stroke-width': 2 }));
      svg.appendChild(mk('line', { x1: bx + nx * EXT, y1: by + ny * EXT, x2: bx - nx * EXT, y2: by - ny * EXT, stroke: CUE, 'stroke-width': 2 }));
      const tw = labelText.length * 10.5 + 16, gap = tw / 2 + 8, mx = (ax + bx) / 2, my = (ay + by) / 2;
      svg.appendChild(mk('line', { x1: ax, y1: ay, x2: mx - ux * gap, y2: my - uy * gap, stroke: CUE, 'stroke-width': 2 }));
      svg.appendChild(mk('line', { x1: mx + ux * gap, y1: my + uy * gap, x2: bx, y2: by, stroke: CUE, 'stroke-width': 2 }));
      svg.appendChild(mk('polygon', { points: [ax, ay, ax + ux * AR + nx * ARW, ay + uy * AR + ny * ARW, ax + ux * AR - nx * ARW, ay + uy * AR - ny * ARW].join(' '), fill: CUE }));
      svg.appendChild(mk('polygon', { points: [bx, by, bx - ux * AR + nx * ARW, by - uy * AR + ny * ARW, bx - ux * AR - nx * ARW, by - uy * AR - ny * ARW].join(' '), fill: CUE }));
      svg.appendChild(mk('rect', { x: mx - tw / 2, y: my - 13, width: tw, height: 26, rx: 4, fill: 'rgba(14,20,28,0.85)', stroke: 'rgba(79,195,247,0.5)' }));
      const tx = mk('text', { x: mx, y: my + 7, fill: CUE, 'text-anchor': 'middle', 'font-family': 'Segoe UI,sans-serif', 'font-size': 17, 'font-weight': 700 });
      tx.textContent = labelText; svg.appendChild(tx);
      return true;
    };
    A._dimClear = function () { const s = document.getElementById('dimcue'); if (s) s.remove(); };
  });

  const targets = await p.evaluate(() => window.APP._dimPickTargets());
  console.log('§DIM_TARGETS ' + JSON.stringify(targets.map(t => t.kind)));
  const shots = [];
  for (let i = 0; i < targets.length; i++) {
    const info = await p.evaluate((t) => {
      const A = window.APP, T = window.THREE;
      A._dimClear();
      const c = new T.Vector3(...t.p), dir = new T.Vector3(...t.dir).normalize();
      const pA = c.clone().addScaledVector(dir, -t.span / 2);
      const pB = c.clone().addScaledVector(dir, t.span / 2);
      // Stand off PERPENDICULAR to the span so it reads across the frame, never end-on.
      let off = new T.Vector3(0, 1, 0).cross(dir);
      if (off.lengthSq() < 1e-4) off = new T.Vector3(1, 0, 0).cross(dir);
      off.normalize();
      // LINE OF SIGHT. The first demo stood off perpendicular at 3x the span and landed INSIDE the
      // adjacent wall — a flat grey frame with no door in it. Try both sides at a few distances and
      // take the first camera position that can actually SEE the target.
      const meshes2 = []; A.scene.traverse(o => { if (o.isMesh && o !== A.ground && o.visible) meshes2.push(o); });
      const rc2 = new T.Raycaster(); rc2.far = 400;
      let bestCam = null;
      for (const sgn of [1, -1]) {
        for (const mult of [2.2, 3.2, 4.5, 6.5]) {
          const d = Math.max(3.0, t.span * mult);
          const cam = c.clone().addScaledVector(off, sgn * d); cam.y = c.y + t.span * 0.25;
          const v = c.clone().sub(cam); const L = v.length();
          rc2.set(cam, v.clone().normalize());
          const blocked = rc2.intersectObjects(meshes2, false).filter(h => h.distance < L - 0.35).length;
          if (!bestCam || blocked < bestCam.blocked) bestCam = { cam, blocked, d, sgn };
          if (blocked === 0) break;
        }
        if (bestCam && bestCam.blocked === 0) break;
      }
      console.log('§DIM_CAM sightBlockedBy=' + (bestCam ? bestCam.blocked : -1) + ' side=' + (bestCam ? bestCam.sgn : 0));
      A.camera.position.copy(bestCam.cam);
      A.controls.target.copy(c); A.controls.update(); A.camera.updateMatrixWorld();
      const mm = Math.round(t.span * 1000).toLocaleString() + ' mm';
      const ok = A._dimDrawCue(pA, pB, mm);
      A.markDirty && A.markDirty();
      return { kind: t.kind, mm, m: +t.span.toFixed(3), drawn: !!ok };
    }, targets[i]);
    await sleep(3500);
    const f = path.join(OUT, 'dimcue_' + i + '_' + info.kind.replace(/\W+/g, '_') + '.png');
    await p.screenshot({ path: f });
    shots.push({ ...info, file: f });
    console.log('§DIM_SHOT ' + JSON.stringify(info));
  }
  await b.close();
  console.log(JSON.stringify(shots, null, 1));
  console.log(logs.filter(l => /§DIM|§FLYTHRU/.test(l)).join('\n'));
})();
