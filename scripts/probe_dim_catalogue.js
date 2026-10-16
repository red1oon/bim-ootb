// §FLYTHRU_DIM_CATALOGUE — what measures can this code actually pick up on the real fly-through?
// User, 2026-09-07: "first identify what kind of measures we may get that are clear ... I can pick out
// for example during the hallway, the breadth of the whole hall across. Its height from the cable tray
// on one side. During outside midflight are many opportunities, the distance between block wings ...
// The window spines, we can do for one. And another its height. See how many our code might pick up."
// Camera comes ONLY from the film's own plan.poseAt() across the walk beat — nothing is staged.
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const path = require('path');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const OUT = process.env.OUT_DIR || '/tmp/wt-storey-reveal/out';
const PORT = process.env.PORT || '8477';
(async () => {
  const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 1800000,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] });
  const p = await b.newPage(); await p.setViewport({ width: 1600, height: 900 });
  const logs = []; p.on('console', m => logs.push(m.text())); p.on('pageerror', e => logs.push('PAGEERROR ' + e.message));
  await p.goto(`http://localhost:${PORT}/viewer/viewer.html?db=/buildings/Hospital_silent_local.db`,
    { waitUntil: 'domcontentloaded', timeout: 90000 });
  await p.waitForFunction(() => window.APP && window.APP.dbQuery && window.APP.flythruGate, { timeout: 240000 });
  const parts = await p.evaluate(() => (window.APP.dbQuery('SELECT DISTINCT building FROM elements_meta') || []).map(r => r[0]));
  for (const bb of parts) await p.evaluate(x => { try { window.APP.streamBuilding(x); } catch (e) {} }, bb);
  let stable = 0;
  for (let i = 0; i < 400; i++) {
    const st = await p.evaluate(() => (window.APP.status && window.APP.status.textContent) || '');
    const m = st.match(/([\d,]+)\s*\/\s*([\d,]+)/);
    if (!m || m[1].replace(/,/g, '') === m[2].replace(/,/g, '')) { if (++stable >= 4) break; } else stable = 0;
    await sleep(3000);
  }
  await sleep(6000);

  const result = await p.evaluate(() => {
    const A = window.APP, T = window.THREE;
    const plan = A.cinemaPathPlan(195.8);
    const b0 = plan.beats.spin, b1 = plan.beats.out;
    const meshes = []; A.scene.traverse(o => { if (o.isMesh && o !== A.ground && o.visible) meshes.push(o); });
    const env = A.dbQuery('SELECT MIN(center_x-bbox_x/2),MAX(center_x+bbox_x/2),MIN(center_y-bbox_y/2),' +
      'MAX(center_y+bbox_y/2),MIN(center_z-bbox_z/2),MAX(center_z+bbox_z/2) FROM element_transforms')[0];
    A.flythruSetScale(+env[1]-+env[0], +env[3]-+env[2], +env[5]-+env[4]);
    const sbox = new T.Box3(), _t = new T.Box3();
    meshes.forEach(m => { try { _t.setFromObject(m); if (isFinite(_t.min.x)) sbox.union(_t); } catch(e){} });
    const sdiag = sbox.getSize(new T.Vector3()).length();
    const rc = new T.Raycaster();
    const up = new T.Vector3(0,1,0);

    // ── FAMILY 1: ELEMENT EXTENTS. Exact, no cast — _instanceMeta already carries bx/by/bz.
    //    Covers the user's "window spines ... for one. And another its height", plus doors.
    const elemCands = [];
    // Walk the metadata maps DIRECTLY instead of looking guids up one at a time. The previous run
    // reached only 18/131 windows, 15/440 doors and 0/61 stairs because A._instanceGuids covers
    // INSTANCED elements only — the rest live in BatchedMesh slots (A._batchMeta). Those cues were
    // never rejected by the gate; they were never offered to it. Walking both maps needs no lookup
    // at all: every entry already carries { guid, ifcClass, bx, by, bz }.
    const WANT = { IfcWindow: 'Window', IfcDoor: 'Door', IfcStair: 'Stair', IfcStairFlight: 'Stair' };
    const counts = {};
    const m4 = new T.Matrix4(), pos = new T.Vector3(), qq = new T.Quaternion(), sc = new T.Vector3();
    const addFrom = (map, getMatrix, idxOf) => {
      for (const id in (map || {})) {
        const mesh = A.scene.getObjectById(+id);
        if (!mesh || !mesh.visible) continue;
        mesh.updateMatrixWorld();
        const mq = new T.Quaternion().setFromRotationMatrix(mesh.matrixWorld);
        const arr = map[id];
        for (let i = 0; i < arr.length; i++) {
          const md = arr[i];
          const label = WANT[md && md.ifcClass];
          if (!label) continue;
          const bx = +md.bx || 0, by = +md.by || 0, bz = +md.bz || 0;
          const w = Math.max(bx, by);
          if (!(w > 0.4 && bz > 0.4)) continue;
          let ok = true;
          try { getMatrix(mesh, idxOf(md, i), m4); } catch (e) { ok = false; }
          if (!ok) continue;
          m4.decompose(pos, qq, sc);
          const world = pos.clone().applyMatrix4(mesh.matrixWorld);
          const wdir = ((bx >= by) ? new T.Vector3(1,0,0) : new T.Vector3(0,1,0))
            .applyQuaternion(qq).applyQuaternion(mq).normalize();
          elemCands.push({ type: label + ' width',  p: world, dir: wdir, span: w });
          elemCands.push({ type: label + ' height', p: world, dir: up.clone(), span: bz });
          counts[label] = (counts[label] || 0) + 1;
        }
      }
    };
    addFrom(A._instanceMeta, (m, i, o) => m.getMatrixAt(i, o), (md, i) => (md.instanceIndex != null ? md.instanceIndex : i));
    addFrom(A._batchMeta,    (m, i, o) => m.getMatrixAt(i, o), (md, i) => (md.slotId != null ? md.slotId : i));
    console.log('§CAT_ELEMENTS ' + JSON.stringify(counts) + ' -> ' + elemCands.length + ' element-extent candidates');

    // Which ifc_class does a hit belong to? Needed to name "height from the cable tray".
    const classOfHit = (h) => {
      if (!h || !h.object) return '';
      const o = h.object;
      if (o.userData && (o.userData.ifcClass || o.userData.ifc_class)) return o.userData.ifcClass || o.userData.ifc_class;
      const meta = A._instanceMeta && A._instanceMeta[o.id];
      if (meta && h.instanceId != null && meta[h.instanceId]) return meta[h.instanceId].ifcClass || '';
      const bm = A._batchMeta && A._batchMeta[o.id];
      if (bm && h.batchId != null) { const e = bm.find(x => x.slotId === h.batchId); if (e) return e.ifcClass || ''; }
      return '';
    };
    // "Clear background" behind the label: probe a few rays around the midpoint. If they all land on
    // the same object, or all miss (sky), the backdrop is plain and a BLACK cue will read on it.
    const bgIsClear = (mid, cam) => {
      const base = mid.clone().sub(cam);
      const ids = new Set(); let miss = 0;
      const rt = new T.Vector3().crossVectors(base, up).normalize();
      for (const dx of [-0.6, 0, 0.6]) for (const dy of [-0.4, 0.4]) {
        const tgt = mid.clone().addScaledVector(rt, dx).addScaledVector(up, dy);
        rc.far = sdiag * 3; rc.set(cam, tgt.sub(cam).normalize());
        const h = rc.intersectObjects(meshes, false);
        if (!h.length) miss++; else ids.add(h[0].object.id + ':' + (h[0].instanceId != null ? h[0].instanceId : ''));
      }
      return (miss === 6) || (ids.size <= 1);
    };

    const byType = {}, samples = {}, whyBy = {};
    const bump = (t, ok, span, why) => { if (!byType[t]) byType[t] = { seen: 0, passed: 0 };
      byType[t].seen++;
      if (ok) { byType[t].passed++; if (!samples[t] || span > samples[t]) samples[t] = span; }
      else { const k = (why || '?').split(':')[0]; if (!whyBy[t]) whyBy[t] = {}; whyBy[t][k] = (whyBy[t][k] || 0) + 1; } };
    let bestShot = null;
    // §CAT_FIRST_OCCURRENCE (user: "just pick the first occurence of them. In runtime they will run on
    // for some frames. We just want the first frame to indicate where they are.") — so keep, per TYPE,
    // the EARLIEST pose on the walk at which it passes, not the globally best-scoring one. That is the
    // frame a viewer would first see the cue appear, which is what marks WHERE each measure lives.
    const firstOf = {};

    for (let k = 0; k <= 24; k++) {
      const tn = b0 + (b1 - b0) * (k / 24);
      const q2 = plan.poseAt(tn);
      A.camera.position.set(q2.x, q2.y, q2.z);
      A.controls.target.set(q2.tx, q2.ty, q2.tz);
      A.controls.update(); A.camera.updateMatrixWorld();
      const fwd = new T.Vector3(); A.camera.getWorldDirection(fwd);
      const right = new T.Vector3().crossVectors(fwd, up).normalize();
      const origin = A.camera.position.clone();
      const poseHits = [];

      const judge = (type, pA, pB, span, extra) => {
        const pa = pA.clone().project(A.camera), pb = pB.clone().project(A.camera);
        const mid = pA.clone().add(pB).multiplyScalar(0.5);
        const occ = (pt) => { const d = pt.clone().sub(origin), L = d.length();
          rc.far = sdiag*3; rc.set(origin, d.clone().normalize());
          const h = rc.intersectObjects(meshes, false);
          return !!(h.length && h[0].distance < L - 0.3); };
        const c = { a:{x:pa.x,y:pa.y,z:pa.z}, b:{x:pb.x,y:pb.y,z:pb.z}, lengthM: span,
          alignToView: pB.clone().sub(pA).normalize().dot(fwd),
          occludedA: occ(pA), occludedB: occ(pB), ...(extra||{}) };
        const g = A.flythruGate(c);
        if (g.pass) { c.bgClear = bgIsClear(mid, origin); const g2 = A.flythruGate(c);
          bump(type, true, span);
          if (!firstOf[type]) firstOf[type] = { tn, type, span, g: g2, pA: pA.clone(), pB: pB.clone() };
          poseHits.push({ type, span, g: g2, pA: pA.clone(), pB: pB.clone() }); }
        else bump(type, false, span, g.why);
      };

      // element extents near this pose
      for (const e of elemCands) {
        if (e.p.distanceTo(origin) > 35) continue;
        judge(e.type, e.p.clone().addScaledVector(e.dir, -e.span/2), e.p.clone().addScaledVector(e.dir, e.span/2), e.span);
      }
      // ── FAMILY 2: VOIDS. Horizontal cross-cast = hall breadth / wing gap. Vertical = clearance,
      //    and when the first thing overhead is a cable tray or duct, that IS the user's
      //    "height from the cable tray on one side".
      const LEAD = Math.min(60, sdiag * 0.35);
      for (const dh of [-1.0, 0.6, 2.5]) {
        const o2 = origin.clone().addScaledVector(right, -LEAD); o2.y += dh;
        rc.far = sdiag*3; rc.set(o2, right);
        const hits = rc.intersectObjects(meshes, false);
        if (!hits.length) continue;
        const ds = hits.map(h => h.distance);
        for (const g of A.flythruGapsAlong(ds, false)) {
          const pA = o2.clone().addScaledVector(right, g.from), pB = o2.clone().addScaledVector(right, g.to);
          const mid = pA.clone().add(pB).multiplyScalar(0.5);
          const md = mid.clone().sub(origin); const mL = md.length();
          rc.far = sdiag*3; rc.set(origin, md.clone().normalize());
          const sky = rc.intersectObjects(meshes, false).filter(h => h.distance > mL + 0.5).length === 0;
          judge(sky ? 'Wing / open span' : 'Hall breadth across', pA, pB, g.lengthM, { skyBehind: sky });
        }
      }
      for (const df of [0, 5, -5]) {
        const o2 = origin.clone().addScaledVector(fwd, df); o2.y -= 1.6;
        rc.far = sdiag*3; rc.set(o2, up);
        const hits = rc.intersectObjects(meshes, false);
        if (!hits.length) continue;
        const cls = classOfHit(hits[0]);
        const isTray = /CableCarrier|Duct|Pipe/i.test(cls);
        const gaps = A.flythruGapsAlong(hits.map(h => h.distance), true);
        for (const g of gaps) {
          const pA = o2.clone().addScaledVector(up, g.from), pB = o2.clone().addScaledVector(up, g.to);
          judge(g.kind === 'origin' ? (isTray ? 'Clearance under ' + cls.replace('Ifc','') : 'Head clearance')
                                    : 'Floor to floor', pA, pB, g.lengthM);
        }
      }
      if (poseHits.length) {
        poseHits.sort((x, y) => y.g.score - x.g.score);
        if (!bestShot || poseHits[0].g.score > bestShot.hits[0].g.score) bestShot = { tn, hits: poseHits };
      }
    }
    const table = Object.keys(byType).sort((a,b) => byType[b].passed - byType[a].passed)
      .map(t => t + ': ' + byType[t].passed + '/' + byType[t].seen + (samples[t] ? ' (max ' + samples[t].toFixed(2) + 'm)' : ''));
    console.log('§CAT_TABLE ' + JSON.stringify(table));
    console.log('§CAT_WHY ' + JSON.stringify(whyBy));
    const firsts = Object.keys(firstOf).sort((x, y) => firstOf[x].tn - firstOf[y].tn)
      .map(t => ({ type: t, tn: +firstOf[t].tn.toFixed(4), span: +firstOf[t].span.toFixed(3),
                   score: +firstOf[t].g.score.toFixed(3), bgClear: !!firstOf[t].g.bgClear,
                   oneEndOff: !!firstOf[t].g.oneEndOff }));
    console.log('§CAT_FIRSTS ' + JSON.stringify(firsts));
    A._catFirst = firstOf;
    return { table, firsts };
  });

  // One still per measure TYPE, at the FIRST pose it appears. Camera from the film's own path only.
  const shots = [];
  for (const f of (result.firsts || [])) {
    const drew = await p.evaluate((ty) => {
      const A = window.APP, T = window.THREE;
      const old = document.getElementById('cuesvg'); if (old) old.remove();
      const h = A._catFirst[ty]; if (!h) return null;
      const plan = A.cinemaPathPlan(195.8);
      const q = plan.poseAt(h.tn);
      A.camera.position.set(q.x, q.y, q.z); A.controls.target.set(q.tx, q.ty, q.tz);
      A.controls.update(); A.camera.updateMatrixWorld();
      const NS='http://www.w3.org/2000/svg';
      const svg=document.createElementNS(NS,'svg'); svg.id='cuesvg';
      svg.setAttribute('style','position:fixed;left:0;top:0;width:100vw;height:100vh;z-index:600;pointer-events:none');
      const W=innerWidth,H=innerHeight,CUE='#000';
      const mk=(t,at)=>{const e=document.createElementNS(NS,t);for(const k in at)e.setAttribute(k,at[k]);return e;};
      const pa=h.pA.clone().project(A.camera), pb=h.pB.clone().project(A.camera);
      const cl=v=>Math.max(-0.97,Math.min(0.97,v));
      const ax=(cl(pa.x)*.5+.5)*W, ay=(-cl(pa.y)*.5+.5)*H;
      const bx=(cl(pb.x)*.5+.5)*W, by=(-cl(pb.y)*.5+.5)*H;
      const dx=bx-ax,dy=by-ay,L=Math.hypot(dx,dy); if(L<2) return null;
      const ux=dx/L,uy=dy/L,nx=-uy,ny=ux,EXT=14,AR=12,ARW=5;
      svg.appendChild(mk('line',{x1:ax+nx*EXT,y1:ay+ny*EXT,x2:ax-nx*EXT,y2:ay-ny*EXT,stroke:CUE,'stroke-width':2}));
      svg.appendChild(mk('line',{x1:bx+nx*EXT,y1:by+ny*EXT,x2:bx-nx*EXT,y2:by-ny*EXT,stroke:CUE,'stroke-width':2}));
      const mm=Math.round(h.span*1000).toLocaleString()+' mm';
      const tw=mm.length*10+14,gap=tw/2+8,mx=(ax+bx)/2,my=(ay+by)/2;
      svg.appendChild(mk('line',{x1:ax,y1:ay,x2:mx-ux*gap,y2:my-uy*gap,stroke:CUE,'stroke-width':2}));
      svg.appendChild(mk('line',{x1:mx+ux*gap,y1:my+uy*gap,x2:bx,y2:by,stroke:CUE,'stroke-width':2}));
      svg.appendChild(mk('polygon',{points:[ax,ay,ax+ux*AR+nx*ARW,ay+uy*AR+ny*ARW,ax+ux*AR-nx*ARW,ay+uy*AR-ny*ARW].join(' '),fill:CUE}));
      svg.appendChild(mk('polygon',{points:[bx,by,bx-ux*AR+nx*ARW,by-uy*AR+ny*ARW,bx-ux*AR-nx*ARW,by-uy*AR-ny*ARW].join(' '),fill:CUE}));
      const tx=mk('text',{x:mx,y:my+6,fill:CUE,'text-anchor':'middle','font-family':'Segoe UI,sans-serif','font-size':16,'font-weight':700,stroke:'#fff','stroke-width':3.2,'paint-order':'stroke'});
      tx.textContent=mm; svg.appendChild(tx);
      document.body.appendChild(svg); A.markDirty && A.markDirty();
      return { mm, tn: h.tn };
    }, f.type);
    if (!drew) continue;
    await sleep(3000);
    const fn = path.join(OUT, 'cue_' + String(shots.length + 1).padStart(2, '0') + '_' +
      f.type.replace(/\W+/g, '_') + '.png');
    await p.screenshot({ path: fn });
    shots.push({ ...f, mm: drew.mm, file: fn });
    console.log('§CAT_SHOT ' + JSON.stringify({ type: f.type, tn: f.tn, mm: drew.mm }));
  }
  await b.close();
  console.log(JSON.stringify({ table: result.table, shots }, null, 1));
  console.log(logs.filter(l => /§CAT_/.test(l)).join('\n'));
})();
