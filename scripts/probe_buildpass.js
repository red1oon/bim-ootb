// §FLYTHRU_BUILDPASS — the whole selection pipeline on the real model, headless, no bake.
// Runs every stage built today, in the measured-cheapest order, and reports the SCHEDULE the film
// would get: what is measured, when it appears, how long it holds, and what it would be called.
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PORT = process.env.PORT || '8477';
(async () => {
  const b = await puppeteer.launch({ headless:'new', protocolTimeout:1800000,
    args:['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader'] });
  const p = await b.newPage(); await p.setViewport({ width: 1280, height: 720 });
  const logs=[]; p.on('console',m=>logs.push(m.text())); p.on('pageerror',e=>logs.push('PAGEERROR '+e.message));
  await p.goto(`http://localhost:${PORT}/viewer/viewer.html?db=/buildings/Hospital_silent_local.db`,{waitUntil:'domcontentloaded',timeout:90000});
  await p.waitForFunction(()=>window.APP&&window.APP.flythruPathWindows&&window.APP.flythruEaseScore,{timeout:240000});
  const parts = await p.evaluate(()=> (window.APP.dbQuery('SELECT DISTINCT building FROM elements_meta')||[]).map(r=>r[0]));
  for (const bb of parts) await p.evaluate(x=>{try{window.APP.streamBuilding(x);}catch(e){}},bb);
  let stable=0;
  for (let i=0;i<400;i++){ const st=await p.evaluate(()=> (window.APP.status&&window.APP.status.textContent)||'');
    const m=st.match(/([\d,]+)\s*\/\s*([\d,]+)/);
    if(!m||m[1].replace(/,/g,'')===m[2].replace(/,/g,'')){ if(++stable>=4) break; } else stable=0; await sleep(3000); }
  await sleep(5000);

  const out = await p.evaluate(() => {
    const A = window.APP, T = window.THREE, R = {}, t00 = performance.now();
    const DUR = 195.8, plan = A.cinemaPathPlan(DUR);
    // The DIVE is in scope now: the user sights the 3rd-storey slab at second 9, which is inside
    // [0, beats.spin] — the first build pass started at beats.spin (18.4s) and could never see it.
    const b0 = 0, b1 = plan.beats.out;   // from frame zero — the opening wide shot is a measure too
    R.walkSec = [ +(b0*DUR).toFixed(1), +(b1*DUR).toFixed(1) ];

    // Path samples once, reused by every candidate (4 Hz).
    const path = [];
    for (let t = b0*DUR; t <= b1*DUR; t += 0.25) {
      const q = plan.poseAt(t/DUR);
      const f = new T.Vector3(q.tx-q.x, q.ty-q.y, q.tz-q.z).normalize();
      path.push({ t, pos:{x:q.x,y:q.y,z:q.z}, fwd:{x:f.x,y:f.y,z:f.z} });
    }
    R.samples = path.length;

    // Candidates: every element's longest HORIZONTAL extent and its VERTICAL extent (§FLYTHRU_NOUN).
    const t0 = performance.now();
    const cands = [];
    const m4=new T.Matrix4(), pos=new T.Vector3(), qq=new T.Quaternion(), sc=new T.Vector3();
    const AX=[new T.Vector3(1,0,0),new T.Vector3(0,1,0),new T.Vector3(0,0,1)];
    const add = (map, idxOf) => { for (const id in (map||{})) {
      const mesh=A.scene.getObjectById(+id); if(!mesh||!mesh.visible||!mesh.getMatrixAt) continue;
      mesh.updateMatrixWorld(); const mq=new T.Quaternion().setFromRotationMatrix(mesh.matrixWorld);
      const arr=map[id];
      for(let i=0;i<arr.length;i++){ const md=arr[i]; if(!md) continue;
        const e=[+md.bx||0,+md.by||0,+md.bz||0];
        if(Math.max(e[0],e[1],e[2])<0.5) continue;
        try{ mesh.getMatrixAt(idxOf(md,i),m4); }catch(err){ continue; }
        m4.decompose(pos,qq,sc);
        const w=pos.clone().applyMatrix4(mesh.matrixWorld);
        for(let k=0;k<3;k++){ if(!(e[k]>0.5)) continue;
          const d=AX[k].clone().applyQuaternion(qq).applyQuaternion(mq).normalize();
          const vertical=Math.abs(d.y)>0.8;
          cands.push({ mid:w, dir:d, span:e[k], vertical, ifcClass:md.ifcClass||'', extents:e }); }
      } } };
    add(A._instanceMeta,(md,i)=>md.instanceIndex!=null?md.instanceIndex:i);
    add(A._batchMeta,(md,i)=>md.slotId!=null?md.slotId:i);
    // §FLYTHRU_ENVELOPE (2026-09-07, user: "Even at zero second, we could have picked out the nearest
    // 'building perimeter'."). The opening wide shot frames the WHOLE building, so the building's own
    // envelope is a measure — and the largest, most legible one in the film. It costs one query and no
    // per-element work, its dMax is enormous (5.77 x ~165m), and the box cue makes it honest by
    // display: the viewer sees the bounding box being measured, so nothing is claimed about the real
    // footprint outline. Derived from the scene's own bounds, not the DB frame (§FLYTHRU_FRAME_MAP).
    (function envelope() {
      // ⚠ NO `.visible` FILTER HERE, deliberately. (User: "even though the building has not taken
      // shape, the user right away knows the opening dimensions.") At second zero the buildup schedule
      // has nearly every element hidden, so measuring only what is VISIBLE would collapse the envelope
      // to a few footings. The opener states the FINISHED dimensions — that is the whole point of it:
      // the film says what it is about to build before it builds it. Every other candidate is judged
      // on what can be seen; this one deliberately is not.
      const sb = new T.Box3(), _tb = new T.Box3();
      A.scene.traverse(o => { if (o.isMesh && o !== A.ground) {
        try { _tb.setFromObject(o); if (isFinite(_tb.min.x)) sb.union(_tb); } catch (e) {} } });
      if (!isFinite(sb.min.x)) { console.log('§FLYTHRU_ENVELOPE INCONCLUSIVE — no scene bounds'); return; }
      const c = sb.getCenter(new T.Vector3()), sz = sb.getSize(new T.Vector3());
      const mk = (dir, len) => cands.push({ mid: c.clone(), dir, span: len, vertical: Math.abs(dir.y) > 0.8,
                                            ifcClass: '', extents: [sz.x, sz.y, sz.z], envelope: true });
      mk(new T.Vector3(1,0,0), sz.x);
      mk(new T.Vector3(0,0,1), sz.z);
      mk(new T.Vector3(0,1,0), sz.y);
      console.log('§FLYTHRU_ENVELOPE ' + sz.x.toFixed(1) + ' x ' + sz.z.toFixed(1) + ' x ' + sz.y.toFixed(1) +
        'm  perimeter=' + (2*(sz.x+sz.z)).toFixed(1) + 'm (bounding box, drawn as a box)');
    })();
    R.candidates = cands.length;
    R.candMs = +(performance.now()-t0).toFixed(0);

    // STAGE 1 — path windows (free arithmetic).
    const t1 = performance.now();
    const withWin = [];
    for (const c of cands) {
      const wins = A.flythruPathWindows(path, c.mid, c.span);
      if (wins.length) withWin.push({ c, win: wins.sort((x,y)=>y.durSec-x.durSec)[0] });
    }
    R.pathWinMs = +(performance.now()-t1).toFixed(0);
    R.survivedPathWindow = withWin.length;

    // STAGE 2 — the gate at the window's midpoint pose (projection only; occlusion is now cosmetic
    // thanks to §FLYTHRU_DRAW_CONTRACT shine-through, so it is not sampled here).
    const t2 = performance.now();
    const passed = [];
    for (const it of withWin) {
      const tm = (it.win.startSec + it.win.endSec)/2;
      const q = plan.poseAt(tm/DUR);
      A.camera.position.set(q.x,q.y,q.z); A.controls.target.set(q.tx,q.ty,q.tz);
      A.controls.update(); A.camera.updateMatrixWorld();
      const half = it.c.dir.clone().multiplyScalar(it.c.span/2);
      const pa = it.c.mid.clone().sub(half).project(A.camera);
      const pb = it.c.mid.clone().add(half).project(A.camera);
      const fwd = new T.Vector3(); A.camera.getWorldDirection(fwd);
      const g = A.flythruGate({ a:{x:pa.x,y:pa.y,z:pa.z}, b:{x:pb.x,y:pb.y,z:pb.z},
        lengthM: it.c.span, kind:'element', alignToView: it.c.dir.dot(fwd),
        occludedA:false, occludedB:false });
      if (g.pass) {
        const ease = A.flythruEaseScore(path, it.win.startSec, it.win.endSec);
        passed.push({ span:it.c.span, score:g.score, a:it.c.mid.clone().sub(half), b:it.c.mid.clone().add(half),
          startSec:it.win.startSec, endSec:it.win.endSec, durSec:it.win.durSec,
          ease: ease ? ease.ease : 0, ifcClass: it.c.ifcClass, vertical: it.c.vertical, extents: it.c.extents,
          envelope: !!it.c.envelope,
          dirWorld: { x: it.c.dir.x, y: it.c.dir.y, z: it.c.dir.z } });
      }
    }
    R.gateMs = +(performance.now()-t2).toFixed(0);
    R.passedGate = passed.length;

    // STAGE 3 — dedupe to unique measures, then rank by score blended with camera easing.
    const uniq = A.flythruDedupe(passed.map(x => ({ ...x, score: x.score * 0.7 + x.ease * 0.3 })));
    R.unique = uniq.length;

    // STAGE 4 — semantics, second pass, on survivors only.
    const scored = uniq.map(x => {
      const sem = x.envelope
        ? { label: 'Building ' + (Math.abs(x.dirWorld.y) > 0.8 ? 'height' : 'length') }
        : A.flythruSemantics({ ifcClass: x.ifcClass, dirWorld: x.dirWorld, spanM: x.span, extents: x.extents });
      return { label: sem ? sem.label : '(number only)', mm: Math.round(x.span*1000),
               startSec: +x.startSec.toFixed(1), holdSec: +x.durSec.toFixed(1),
               ease: +x.ease.toFixed(2), score: +x.score.toFixed(3) };
    });
    R.allQualified = scored.slice().sort((a,b)=>a.startSec-b.startSec);
    const sch = A.flythruSchedule(scored, { minCount: 30, maxCount: 50 });
    R.tuned = { gapSec: +(sch.gapSec||0).toFixed(2), count: sch.picked.length, picked: sch.picked };
    R.schedule = uniq.slice(0, 0).map(x => {
      const sem = A.flythruSemantics({ ifcClass: x.ifcClass, dirWorld: x.dirWorld,
                                       spanM: x.span, extents: x.extents });
      return { label: sem ? sem.label : '(number only)', mm: Math.round(x.span*1000).toLocaleString()+' mm',
               atSec: +x.startSec.toFixed(1), holdSec: +x.durSec.toFixed(1),
               ease: +x.ease.toFixed(2), score: +x.score.toFixed(3) };
    });
    R.totalMs = +(performance.now()-t00).toFixed(0);
    console.log('§BUILDPASS ' + JSON.stringify(R));
    return R;
  });
  await b.close();
  console.log(JSON.stringify(out, null, 1));
})();
