// §FLYTHRU_BUILDPASS_V2 — candidates from element_transforms (TRUE per-element extents), tiered by
// semantic value. Replaces the v1 pass whose source was _instanceMeta/_batchMeta — batch-group boxes
// that produced true numbers with false nouns (IfcCovering's real max height is 0.20m; v1 scheduled
// one at 22.9m).
//
// STRATEGY — what deserves to be caught, in priority order. Ranking by size alone floods the film with
// whichever class happens to be biggest; ranking by SEMANTIC VALUE puts the unobvious capabilities
// first, which is the point of the exercise:
//   T1 STATEMENT  envelope, storey footprint, total height to ceiling — says what the model IS
//   T2 SPATIAL    room volume/area, hall breadth/length, clear height — derived space, the differentiator
//   T3 SERVICE    duct/pipe/tray section and run — MEP comprehension, ties to the clash story
//   T4 OPENING    door/window/opening — human-scale, viewer can sanity-check
//   (structure — beams, columns, walls — deliberately OUT: real now, but not spatial, and 1,970 beams
//    would flood a film whose rule is "capability not quantity")
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PORT = process.env.PORT || '8477';
(async () => {
  const b = await puppeteer.launch({ headless:'new', protocolTimeout:1800000,
    args:['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader'] });
  const p = await b.newPage(); await p.setViewport({ width: 1280, height: 720 });
  const logs=[]; p.on('console',m=>logs.push(m.text())); p.on('pageerror',e=>logs.push('PAGEERROR '+e.message));
  await p.goto(`http://localhost:${PORT}/viewer/viewer.html?db=/buildings/Hospital_silent_local.db`,{waitUntil:'domcontentloaded',timeout:90000});
  await p.waitForFunction(()=>window.APP&&window.APP.flythruFrameMap&&window.APP.flythruSchedule,{timeout:240000});
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
    const b1 = plan.beats.out;
    const q = (sql) => { try { return A.dbQuery(sql) || []; } catch (e) { return []; } };

    // DB -> scene frame, DERIVED (§FLYTHRU_FRAME_MAP). element_transforms is Z-up in its own datum.
    const sb = new T.Box3(), _tb = new T.Box3();
    A.scene.traverse(o => { if (o.isMesh && o !== A.ground) { try { _tb.setFromObject(o); if (isFinite(_tb.min.x)) sb.union(_tb); } catch(e){} } });
    const de = q('SELECT MIN(center_x-bbox_x/2),MAX(center_x+bbox_x/2),MIN(center_y-bbox_y/2),MAX(center_y+bbox_y/2),MIN(center_z-bbox_z/2),MAX(center_z+bbox_z/2) FROM element_transforms')[0];
    const dbEnv = { minx:+de[0], maxx:+de[1], miny:+de[2], maxy:+de[3], minz:+de[4], maxz:+de[5] };
    const map = A.flythruFrameMap(dbEnv, { min:sb.min, max:sb.max });
    const toScene = (x,y,z) => { const d=[x,y,z], o=[0,0,0];
      for (let i=0;i<3;i++) o[i] = d[map.axis[i]] + map.offset[i];
      return new T.Vector3(o[0],o[1],o[2]); };
    // extents map the same way (no offset)
    const extScene = (bx,by,bz) => { const d=[bx,by,bz]; return [d[map.axis[0]],d[map.axis[1]],d[map.axis[2]]]; };

    const cands = [];
    const AXS = [new T.Vector3(1,0,0), new T.Vector3(0,1,0), new T.Vector3(0,0,1)];
    const addSpan = (tier, label, mid, axisIdx, len, extra) => {
      if (!(len > 0.5)) return;
      cands.push(Object.assign({ tier, label, mid, dir: AXS[axisIdx].clone(), span: len }, extra||{}));
    };

    // T1 — building envelope (finished model, regardless of buildup visibility).
    {
      const c = toScene((dbEnv.minx+dbEnv.maxx)/2,(dbEnv.miny+dbEnv.maxy)/2,(dbEnv.minz+dbEnv.maxz)/2);
      const e = extScene(dbEnv.maxx-dbEnv.minx, dbEnv.maxy-dbEnv.miny, dbEnv.maxz-dbEnv.minz);
      addSpan(1,'Building length', c, 0, e[0]); addSpan(1,'Building width', c, 2, e[2]);
      addSpan(1,'Building height', c, 1, e[1]);
      R.envelope = e.map(v=>+v.toFixed(1));
    }
    // T1 — storey footprint (real union of real element boxes; area is sound, volume is NOT — the
    // height column is contaminated by risers/facade spanning many storeys, measured 43.9m on Level 1).
    q(`SELECT m.storey, MIN(t.center_x-t.bbox_x/2),MAX(t.center_x+t.bbox_x/2),MIN(t.center_y-t.bbox_y/2),MAX(t.center_y+t.bbox_y/2),MIN(t.center_z-t.bbox_z/2),MAX(t.center_z+t.bbox_z/2)
        FROM elements_meta m JOIN element_transforms t ON t.guid=m.guid
        WHERE m.storey NOT IN ('','Unknown') AND m.storey NOT LIKE '% Ceiling' AND m.storey NOT LIKE '% TOS'
        GROUP BY m.storey`).forEach(r => {
      const c = toScene((+r[1]+ +r[2])/2,(+r[3]+ +r[4])/2,(+r[5]+ +r[6])/2);
      const e = extScene(+r[2]-+r[1], +r[4]-+r[3], +r[6]-+r[5]);
      const areaM2 = Math.round((+r[2]-+r[1]) * (+r[4]-+r[3]));
      addSpan(1, r[0] + ' — ' + areaM2.toLocaleString() + ' m² floor area', c, 0, e[0], { areaM2 });
    });
    // T2 — rooms, REAL geometry via the Find-panel injector (§ROOM_INJECTOR_NEEDLE). Compiled rooms
    // carry §SYNTHETIC-HONESTY: they must read as derived, never as extracted IfcSpace.
    try {
      const vols = (typeof A._allRoomVolumes === 'function') ? A._allRoomVolumes() : null;
      if (vols && vols.length) {
        const byGuid = {};
        vols.forEach(v => { (byGuid[v.guid] = byGuid[v.guid] || []).push(v); });
        Object.keys(byGuid).forEach(g => {
          const rs = byGuid[g];
          let area = 0, vol = 0, cx=0, cy=0, cz=0;
          rs.forEach(v => { area += v.sx*v.sz; vol += v.sx*v.sy*v.sz; cx+=v.cx; cy+=v.cy; cz+=v.cz; });
          const n = rs.length, c = new T.Vector3(cx/n, cy/n, cz/n);
          const big = rs.slice().sort((x,y)=>y.sx-x.sx)[0];
          addSpan(2, 'Room ≈' + Math.round(area) + ' m² · ' + Math.round(vol) + ' m³', c, 0, big.sx,
                  { synthetic: /^RM_/.test(g), areaM2: area, volM3: vol });
        });
        R.rooms = Object.keys(byGuid).length;
      } else R.rooms = 0;
    } catch (e) { R.roomsErr = e.message; R.rooms = 0; }
    // T3/T4 — services and openings, TRUE per-element extents. Longest and the across-span.
    const CLS = { IfcDuctSegment:[3,'Duct'], IfcPipeSegment:[3,'Pipe'], IfcCableCarrierSegment:[3,'Cable tray'],
                  IfcDoor:[4,'Door'], IfcWindow:[4,'Window'], IfcOpeningElement:[4,'Opening'] };
    const inList = Object.keys(CLS).map(c=>"'"+c+"'").join(',');
    q(`SELECT m.ifc_class,t.center_x,t.center_y,t.center_z,t.bbox_x,t.bbox_y,t.bbox_z
       FROM elements_meta m JOIN element_transforms t ON t.guid=m.guid
       WHERE m.ifc_class IN (${inList}) AND t.bbox_x IS NOT NULL`).forEach(r => {
      const cls = CLS[r[0]]; if (!cls) return;
      const c = toScene(+r[1],+r[2],+r[3]);
      const e = extScene(+r[4],+r[5],+r[6]);
      const ord = [0,1,2].sort((u,v)=>e[v]-e[u]);
      for (const k of [ord[0], ord[1]]) {
        const vertical = (k === 1);
        addSpan(cls[0], cls[1] + (vertical ? ' height' : ' length'), c, k, e[k]);
      }
    });
    R.candidates = cands.length;

    // Path samples once, whole film up to the walk end.
    const path = [];
    for (let t = 0; t <= b1*DUR; t += 0.3) {
      const pq = plan.poseAt(t/DUR);
      const f = new T.Vector3(pq.tx-pq.x, pq.ty-pq.y, pq.tz-pq.z).normalize();
      path.push({ t, pos:{x:pq.x,y:pq.y,z:pq.z}, fwd:{x:f.x,y:f.y,z:f.z} });
    }
    R.samples = path.length;

    const t1 = performance.now();
    const passed = [];
    const TIER_W = { 1: 1.00, 2: 0.92, 3: 0.80, 4: 0.70 };
    for (const c of cands) {
      const wins = A.flythruPathWindows(path, c.mid, c.span);
      if (!wins.length) continue;
      const win = wins.sort((x,y)=>y.durSec-x.durSec)[0];
      const tm = (win.startSec + win.endSec)/2;
      const pq = plan.poseAt(tm/DUR);
      A.camera.position.set(pq.x,pq.y,pq.z); A.controls.target.set(pq.tx,pq.ty,pq.tz);
      A.controls.update(); A.camera.updateMatrixWorld();
      const half = c.dir.clone().multiplyScalar(c.span/2);
      const pa = c.mid.clone().sub(half).project(A.camera);
      const pb = c.mid.clone().add(half).project(A.camera);
      const fwd = new T.Vector3(); A.camera.getWorldDirection(fwd);
      const g = A.flythruGate({ a:{x:pa.x,y:pa.y,z:pa.z}, b:{x:pb.x,y:pb.y,z:pb.z}, lengthM:c.span,
        kind:'element', alignToView:c.dir.dot(fwd), occludedA:false, occludedB:false });
      if (!g.pass) continue;
      const ease = A.flythruEaseScore(path, win.startSec, win.endSec);
      passed.push({ label:c.label, tier:c.tier, span:c.span, mm:Math.round(c.span*1000),
        startSec:win.startSec, durSec:win.durSec, synthetic:!!c.synthetic,
        score: (g.score*0.6 + (ease?ease.ease:0)*0.2 + 0.2) * TIER_W[c.tier] });
    }
    R.gateMs = +(performance.now()-t1).toFixed(0);
    R.passedGate = passed.length;
    const uniq = A.flythruDedupe(passed);
    R.unique = uniq.length;
    const sch = A.flythruSchedule(uniq, { minCount: 20, maxCount: 35 });
    R.tuned = { gapSec:+(sch.gapSec||0).toFixed(2), count:sch.picked.length,
      picked: sch.picked.map(x=>({ at:+x.startSec.toFixed(1), hold:+x.durSec.toFixed(1),
        mm:x.mm, label:x.label, tier:x.tier, syn:x.synthetic })) };
    R.byTier = {}; uniq.forEach(x=>{ R.byTier[x.tier]=(R.byTier[x.tier]||0)+1; });
    R.totalMs = +(performance.now()-t00).toFixed(0);
    console.log('§BUILDPASS2 ' + JSON.stringify({c:R.candidates,g:R.passedGate,u:R.unique,ms:R.totalMs}));
    return R;
  });
  await b.close();
  console.log(JSON.stringify(out,null,1));
})();
