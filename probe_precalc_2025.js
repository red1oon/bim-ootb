// §FLYTHRU_PRECALC — will seconds 20-25 of the film pick out ANY measure?
// User: "Why not bake seconds 20-25 first but precalc if it will pick out any measure."
// This is the real BUILD PASS, scoped to that window: discover spans once, then test each across the
// window (project + occlude only, never re-cast) and keep those holding >= 2s. It also times itself,
// which is the number that decides whether this can live in a bake at all (budget: clash_film's 4.5s).
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PORT = process.env.PORT || '8477';
const T0 = +(process.env.T0 || 20), T1 = +(process.env.T1 || 25);
(async () => {
  const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 1800000,
    args: ['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader'] });
  const p = await b.newPage(); await p.setViewport({ width: 1600, height: 900 });
  const logs = []; p.on('console', m => logs.push(m.text())); p.on('pageerror', e => logs.push('PAGEERROR ' + e.message));
  await p.goto(`http://localhost:${PORT}/viewer/viewer.html?db=/buildings/Hospital_silent_local.db`, { waitUntil:'domcontentloaded', timeout:90000 });
  await p.waitForFunction(() => window.APP && window.APP.flythruHoldWindow, { timeout: 240000 });
  const parts = await p.evaluate(() => (window.APP.dbQuery('SELECT DISTINCT building FROM elements_meta')||[]).map(r=>r[0]));
  for (const bb of parts) await p.evaluate(x => { try { window.APP.streamBuilding(x); } catch(e){} }, bb);
  let stable = 0;
  for (let i = 0; i < 400; i++) {
    const st = await p.evaluate(() => (window.APP.status && window.APP.status.textContent) || '');
    const m = st.match(/([\d,]+)\s*\/\s*([\d,]+)/);
    if (!m || m[1].replace(/,/g,'') === m[2].replace(/,/g,'')) { if (++stable >= 4) break; } else stable = 0;
    await sleep(3000);
  }
  await sleep(5000);
  const out = await p.evaluate((T0, T1) => {
    const A = window.APP, T = window.THREE, t0 = performance.now();
    const DUR = 195.8, plan = A.cinemaPathPlan(DUR);
    const meshes = []; A.scene.traverse(o => { if (o.isMesh && o !== A.ground && o.visible) meshes.push(o); });
    const env = A.dbQuery('SELECT MIN(center_x-bbox_x/2),MAX(center_x+bbox_x/2),MIN(center_y-bbox_y/2),MAX(center_y+bbox_y/2),MIN(center_z-bbox_z/2),MAX(center_z+bbox_z/2) FROM element_transforms')[0];
    A.flythruSetScale(+env[1]-+env[0], +env[3]-+env[2], +env[5]-+env[4]);
    const sb = new T.Box3(), _t = new T.Box3();
    meshes.forEach(m => { try { _t.setFromObject(m); if (isFinite(_t.min.x)) sb.union(_t); } catch(e){} });
    const sdiag = sb.getSize(new T.Vector3()).length();
    const rc = new T.Raycaster(); const up = new T.Vector3(0,1,0);

    // Element candidates from BOTH metadata maps (instanced + batched).
    // §FLYTHRU_SLAB (2026-09-07, user: "At 10th second, i see a good early opportunity, ie the wing
    // floor slab length"). Slabs were missing from the candidate set entirely. They are the biggest
    // single-element measure in the model — Hospital's own footprint proxy runs ~98 x 90 m — so a wing
    // slab reads at almost any distance and against open sky, which is the ideal backdrop.
    // §FLYTHRU_GEOMETRY_ONLY (2026-09-07, user: "Thus abstract to geometry as the measure is not
    // saying what but how long"). THE CLASS ALLOWLIST IS GONE. A cue draws a LENGTH; it never names
    // the thing. So an IFC class was never needed to DECIDE anything — it was only ever a convenient
    // way to FIND candidate spans, and using it as a filter created the exact failures this session
    // hit: slabs omitted because I did not list them, and elevators unreachable because this model has
    // no IfcTransportElement and no element named "lift" at all.
    //
    // Now: ANY element with a usable extent is a candidate, and the gate decides on geometry alone.
    // Nothing here knows what a door or a duct is, so it behaves identically on a duplex, a hospital
    // or a terminal — and a class this repo has never seen still yields measures. `ifcClass` is kept
    // ONLY as a diagnostic tag in the log; it drives no decision.
    const cands = [];
    const m4 = new T.Matrix4(), pos = new T.Vector3(), qq = new T.Quaternion(), sc = new T.Vector3();
    const axes = [new T.Vector3(1,0,0), new T.Vector3(0,1,0), new T.Vector3(0,0,1)];
    const addFrom = (map, idxOf) => { for (const id in (map||{})) {
      const mesh = A.scene.getObjectById(+id); if (!mesh || !mesh.visible || !mesh.getMatrixAt) continue;
      mesh.updateMatrixWorld(); const mq = new T.Quaternion().setFromRotationMatrix(mesh.matrixWorld);
      const arr = map[id];
      for (let i=0;i<arr.length;i++) {
        const md = arr[i]; if (!md) continue;
        const e = [+md.bx||0, +md.by||0, +md.bz||0];
        // Rank the element's own extents. The LONGEST is its length; the MIDDLE is the span "across"
        // it. Both are real measures of the same object, and which one reads is the gate's business,
        // not ours. The shortest is skipped — that is a thickness, and it is what the element is made
        // of rather than a dimension anyone reads off a drawing.
        const ord = [0,1,2].sort((u,v) => e[v] - e[u]);
        if (!(e[ord[0]] > 0.5)) continue;
        try { mesh.getMatrixAt(idxOf(md,i), m4); } catch (err) { continue; }
        m4.decompose(pos, qq, sc);
        const world = pos.clone().applyMatrix4(mesh.matrixWorld);
        const tag = (md.ifcClass || '?').replace('Ifc','');   // diagnostics only — drives nothing
        for (const which of [0, 1]) {
          const len = e[ord[which]];
          if (!(len > 0.5)) continue;
          const d = axes[ord[which]].clone().applyQuaternion(qq).applyQuaternion(mq).normalize();
          cands.push({ type: (which === 0 ? 'long' : 'across') + ' [' + tag + ']', kind: 'element',
                       a: world.clone().addScaledVector(d, -len/2), b: world.clone().addScaledVector(d, len/2), span: len });
        }
      } } };
    addFrom(A._instanceMeta, (md,i)=> md.instanceIndex!=null?md.instanceIndex:i);
    addFrom(A._batchMeta,    (md,i)=> md.slotId!=null?md.slotId:i);

    // §FLYTHRU_WINDOW_PITCH (2026-09-07, user: "between windows outer frames to each other") — an
    // ELEMENT-TO-ELEMENT measure, which is neither an extent nor a discovered void: the clear gap
    // between two ADJACENT windows' outer frames on the same facade run. This is the measure an
    // architect actually reads off a facade, and the user named it after watching the film.
    // Pair windows that sit at the SAME height (same band) and are near each other, then measure
    // edge-to-edge, not centre-to-centre — "outer frames to each other" is the clear gap.
    (function windowPitch() {
      const wins = [];
      const addW = (map, idxOf) => { for (const id in (map||{})) {
        const mesh = A.scene.getObjectById(+id); if (!mesh || !mesh.visible || !mesh.getMatrixAt) continue;
        mesh.updateMatrixWorld(); const arr = map[id];
        for (let i=0;i<arr.length;i++) { const md=arr[i]; if (!md || md.ifcClass !== 'IfcWindow') continue;
          const bx=+md.bx||0, by=+md.by||0, w=Math.max(bx,by); if (!(w>0.3)) continue;
          try { mesh.getMatrixAt(idxOf(md,i), m4); } catch(e){ continue; }
          m4.decompose(pos,qq,sc);
          wins.push({ p: pos.clone().applyMatrix4(mesh.matrixWorld), w: w });
        } } };
      addW(A._instanceMeta, (md,i)=> md.instanceIndex!=null?md.instanceIndex:i);
      addW(A._batchMeta,    (md,i)=> md.slotId!=null?md.slotId:i);
      // Band by height, then pair nearest neighbours within the band.
      const bands = {};
      wins.forEach(x => { const k = Math.round(x.p.y / 0.5); (bands[k] = bands[k] || []).push(x); });
      let made = 0;
      for (const k in bands) {
        const row = bands[k]; if (row.length < 2) continue;
        for (let i=0;i<row.length;i++) {
          let best = null;
          for (let j=0;j<row.length;j++) { if (i===j) continue;
            const d = row[i].p.distanceTo(row[j].p);
            if (d > 0.2 && d < 12 && (!best || d < best.d)) best = { d, o: row[j] }; }
          if (!best) continue;
          // edge-to-edge: centre distance minus the two half-widths facing each other
          const clear = best.d - (row[i].w/2 + best.o.w/2);
          if (!(clear > 0.4 && clear < 10)) continue;
          const dir = best.o.p.clone().sub(row[i].p).normalize();
          const a = row[i].p.clone().addScaledVector(dir, row[i].w/2);
          const bb = best.o.p.clone().addScaledVector(dir, -best.o.w/2);
          cands.push({ type:'Window to window', kind:'element', a, b: bb, span: clear });
          if (++made > 400) return;
        }
      }
      console.log('§PRECALC_WINPITCH windows=' + wins.length + ' pairs=' + made);
    })();

    // Void candidates, discovered ONCE at a few poses inside the window. Cast from NEAR the camera —
    // the catalogue's 60m stand-off put every hall span off-screen (both-ends-off-screen 747/983).
    const discoverAt = (tn) => {
      const q = plan.poseAt(tn);
      const cam = new T.Vector3(q.x,q.y,q.z), tgt = new T.Vector3(q.tx,q.ty,q.tz);
      const fwd = tgt.clone().sub(cam).normalize();
      const right = new T.Vector3().crossVectors(fwd,up).normalize();
      for (const dh of [-1.0, 0.8]) {
        const o2 = cam.clone().addScaledVector(right,-8).addScaledVector(up,dh);
        rc.far = sdiag*3; rc.set(o2, right);
        const hs = rc.intersectObjects(meshes,false); if (!hs.length) continue;
        for (const g of A.flythruGapsAlong(hs.map(h=>h.distance), false))
          cands.push({ type:'Hall breadth across', kind:'void', a:o2.clone().addScaledVector(right,g.from), b:o2.clone().addScaledVector(right,g.to), span:g.lengthM });
      }
      const o3 = cam.clone().addScaledVector(up,-1.6);
      rc.far = sdiag*3; rc.set(o3, up);
      const hs2 = rc.intersectObjects(meshes,false);
      if (hs2.length) for (const g of A.flythruGapsAlong(hs2.map(h=>h.distance), true))
        cands.push({ type: g.kind==='origin'?'Head clearance':'Floor to floor', kind:'void', a:o3.clone().addScaledVector(up,g.from), b:o3.clone().addScaledVector(up,g.to), span:g.lengthM });
    };
    for (let t=T0; t<=T1; t+=1.0) discoverAt(t/DUR);
    const nDiscovered = cands.length;

    // Persistence: test each fixed span across the window. Project + occlude only — no re-casting.
    const STEP = 0.25, samples = []; for (let t=T0; t<=T1+1e-6; t+=STEP) samples.push(t);
    const W=1600,H=900, results=[];
    for (const c of cands) {
      const passed = [];
      for (const t of samples) {
        const q = plan.poseAt(t/DUR);
        A.camera.position.set(q.x,q.y,q.z); A.controls.target.set(q.tx,q.ty,q.tz);
        A.controls.update(); A.camera.updateMatrixWorld();
        const cam = A.camera.position.clone();
        // Proximity cull scales with the span: a 90m slab is meant to be seen from far away, and a
        // fixed 60m cutoff would discard exactly the showpiece. Apparent size is judged by the gate.
        const cull = Math.max(60, c.span * 2.5);
        if (c.a.distanceTo(cam) > cull && c.b.distanceTo(cam) > cull) { passed.push(false); continue; }
        const pa=c.a.clone().project(A.camera), pb=c.b.clone().project(A.camera);
        const occ=(pt)=>{ const d=pt.clone().sub(cam), L=d.length(); rc.far=sdiag*3; rc.set(cam,d.clone().normalize());
          const h=rc.intersectObjects(meshes,false); return !!(h.length && h[0].distance < L-0.3); };
        const g = A.flythruGate({ a:{x:pa.x,y:pa.y,z:pa.z}, b:{x:pb.x,y:pb.y,z:pb.z}, lengthM:c.span, kind:c.kind,
          alignToView: c.b.clone().sub(c.a).normalize().dot(new T.Vector3().subVectors(new T.Vector3(q.tx,q.ty,q.tz),cam).normalize()),
          occludedA: occ(c.a), occludedB: occ(c.b) });
        passed.push(!!g.pass);
      }
      const win = A.flythruHoldWindow(samples, passed);
      if (win) results.push({ type:c.type, span:+c.span.toFixed(3), startSec:+win.startSec.toFixed(2),
                              endSec:+win.endSec.toFixed(2), durSec:+win.durSec.toFixed(2) });
    }
    results.sort((x,y)=> y.durSec - x.durSec);
    const ms = performance.now()-t0;
    console.log('§PRECALC window=' + T0 + '-' + T1 + 's discovered=' + nDiscovered + ' samples=' + samples.length +
      ' held>=2s=' + results.length + ' buildMs=' + ms.toFixed(0));
    console.log('§PRECALC_HITS ' + JSON.stringify(results.slice(0,12)));
    return { discovered:nDiscovered, held:results.length, buildMs:+ms.toFixed(0), results:results.slice(0,12) };
  }, T0, T1);
  await b.close();
  console.log(JSON.stringify(out,null,1));
  console.log(logs.filter(l=>/§PRECALC/.test(l)).join('\n'));
})();
