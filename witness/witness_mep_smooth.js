// WITNESS — §MEP_SMOOTH_NORMALS + §IDX16.
// ISSUE IT PROVES/DISPROVES: curved MEP renders faceted because the shipped normals are hard
// per-face on EVERY class (§SHADE_PROBE: weldRatio 0.11-0.29, splitNormal 96-100%). The fix must
// (a) actually smooth the curve classes, and (b) leave every non-curve surface BYTE-IDENTICAL —
// the user's explicit constraint: "it must not impact non curve intending surfaces".
// (b) is the load-bearing gate. A pass that rounds a wall corner is a regression, not a fix.
const puppeteer=require('/home/red1/bim-compiler/node_modules/puppeteer');
const PORT=process.env.PORT||8521, BLD=process.env.BLD||'Clinic';
process.on('unhandledRejection',e=>{console.error('UNHANDLED_REJECTION: '+(e&&e.stack||e));process.exit(1);});
(async()=>{
  const b=await puppeteer.launch({headless:'new',
    args:['--use-gl=angle','--use-angle=swiftshader','--no-sandbox','--enable-unsafe-swiftshader'],
    protocolTimeout:900000});
  const p=await b.newPage(); await p.setViewport({width:900,height:500});
  const errs=[]; p.on('pageerror',e=>errs.push(e.message.slice(0,160)));
  let idxLog=null; p.on('console',m=>{const t=m.text(); if(/§MEP_SMOOTH_NORMALS/.test(t)) idxLog=t;});
  await p.goto(`http://localhost:${PORT}/viewer/viewer.html?db=/buildings/${BLD}_extracted.db`,
    {waitUntil:'domcontentloaded',timeout:120000});
  await p.waitForFunction(()=>window.APP&&window.APP.scene&&typeof window.APP.mepSmoothNormals==='function',{timeout:180000});
  await p.waitForFunction(()=>window.APP.streaming===true||(window.APP.streamQueue||[]).length>0,{timeout:120000,polling:250}).catch(()=>{});
  await p.waitForFunction(()=>!window.APP.streaming||(window.APP.streamIdx>=(window.APP.streamQueue||[]).length),{timeout:900000,polling:1000}).catch(()=>{});

  const r=await p.evaluate(()=>{
    const A=window.APP;
    const CURVE={IfcFlowSegment:1,IfcFlowFitting:1,IfcFlowTerminal:1,IfcFlowController:1,
      IfcFlowMovingDevice:1,IfcFlowStorageDevice:1,IfcValve:1,IfcPipeSegment:1,IfcPipeFitting:1,
      IfcDuctSegment:1,IfcDuctFitting:1};
    // snapshot every normal, tagged by whether its vertex belongs to a curve-class range
    const snap=[]; const seen=new Set();
    A.scene.traverse(o=>{
      if(!(o.isMesh||o.isBatchedMesh||o.isInstancedMesh)||!o.geometry||!o.geometry.attributes.normal||!o.geometry.index) return;
      const g=o.geometry; if(seen.has(g.uuid)) return; seen.add(g.uuid);
      // MUST mirror the pass's gate EXACTLY, fallback included. The first run of this witness
      // read only merged ranges and reported curveVerts=0 while the pass smoothed 172,143 — so it
      // scored every smoothed vertex as "non-curve" and failed its own load-bearing gate on a
      // classification bug, not a code bug. A witness whose gate disagrees with the code it judges
      // is measuring itself.
      const rngs=(A._mergedMeta&&A._mergedMeta[o.id])||null;
      const curveVerts=new Set();
      // §MEP_SMOOTH_BATCHED — the witness must cover the paths the CODE covers or it cannot catch
      // this gap class again. Hospital is 100% batched+instanced (merged=0) and the previous
      // revision of this witness only understood merged ranges, so a total no-op there would have
      // scored a clean PASS. Curvature is still measured INDEPENDENTLY per span.
      const meas=(st,ct)=>{ const seen=new Set(), n=g.attributes.normal, step=Math.max(1,Math.floor(ct/1500));
        for(let i=st;i<st+ct;i+=step){ const v=g.index.getX(i);
          seen.add(Math.round(n.getX(v)*8)+','+Math.round(n.getY(v)*8)+','+Math.round(n.getZ(v)*8));
          if(seen.size>64) break; }
        return seen.size; };
      if(o.isBatchedMesh && o._geometryInfo && o._geometryInfo.length){
        o._geometryInfo.forEach(e=>{ const st=(e.start!=null)?e.start:e.indexStart,
                                     ct=(e.count!=null)?e.count:e.indexCount;
          if(st==null||!(ct>0)) return;
          if(meas(st,ct)>=16) for(let i=st;i<st+ct;i++) curveVerts.add(g.index.getX(i)); });
      } else if(o.isInstancedMesh){
        const icls=(o.userData&&(o.userData.ifc_class||o.userData.ifcClass))||'';
        if(CURVE[icls]||meas(0,g.index.count)>=16) for(let i=0;i<g.index.count;i++) curveVerts.add(g.index.getX(i));
      } else
      if(rngs&&rngs.length){ rngs.forEach(rg=>{ if(CURVE[rg.ifcClass]){
        for(let i=rg.idxStart;i<rg.idxStart+rg.idxCount;i++) curveVerts.add(g.index.getX(i)); }}); }
      else { const cls=(o.userData&&(o.userData.ifc_class||o.userData.ifcClass))||'';
        // INDEPENDENT check, deliberately not a mirror of the code's gate: measure this geometry's
        // own distinct facet directions here, in the witness. §SHADE_PROBE established the
        // separation — every box class is EXACTLY 7, curve-intending shapes are 36-189 — so a
        // geometry scoring >=16 is curve-intending as a matter of measurement, whatever class name
        // it carries. That is what lets this witness judge "did it touch a non-curve surface"
        // rather than merely "did it agree with itself".
        let distinct=0;
        if(cls||true){ const seen=new Set(), n=g.attributes.normal, step=Math.max(1,Math.floor(g.index.count/1500));
          for(let i=0;i<g.index.count;i+=step){ const v=g.index.getX(i);
            seen.add(Math.round(n.getX(v)*8)+','+Math.round(n.getY(v)*8)+','+Math.round(n.getZ(v)*8));
            if(seen.size>64) break; }
          distinct=seen.size; }
        if(CURVE[cls] || (cls && distinct>=16)) for(let i=0;i<g.index.count;i++) curveVerts.add(g.index.getX(i)); }
      snap.push({uuid:g.uuid, arr:Float32Array.from(g.attributes.normal.array), curveVerts,
                 idxType:g.index.array.constructor.name, idxLen:g.index.count,
                 vcount:g.attributes.position.count});
    });
    const before=snap.map(s=>({uuid:s.uuid,idxType:s.idxType,vcount:s.vcount,idxLen:s.idxLen}));
    const res=A.mepSmoothNormals();
    // compare
    let curveChanged=0, curveTotal=0, nonCurveChanged=0, nonCurveTotal=0, maxNonCurveDelta=0;
    const geos=new Map(); A.scene.traverse(o=>{ if(o.isMesh&&o.geometry) geos.set(o.geometry.uuid,o.geometry); });
    snap.forEach(s=>{
      const g=geos.get(s.uuid); if(!g) return;
      const now=g.attributes.normal.array;
      for(let v=0;v<s.vcount;v++){
        const d=Math.abs(now[v*3]-s.arr[v*3])+Math.abs(now[v*3+1]-s.arr[v*3+1])+Math.abs(now[v*3+2]-s.arr[v*3+2]);
        if(s.curveVerts.has(v)){ curveTotal++; if(d>1e-6) curveChanged++; }
        else { nonCurveTotal++; if(d>1e-6){ nonCurveChanged++; if(d>maxNonCurveDelta) maxNonCurveDelta=d; } }
      }
    });
    // §IDX16 tally
    let u16=0,u32=0,u32small=0;
    before.forEach(x=>{ if(x.idxType==='Uint16Array')u16++; else {u32++; if(x.vcount<65536)u32small++;} });
    return {res, curveChanged,curveTotal,nonCurveChanged,nonCurveTotal,maxNonCurveDelta,
            geoms:snap.length,u16,u32,u32small};
  });

  console.log('='.repeat(78)+`\n§MEP_SMOOTH_NORMALS witness — ${BLD}\n`+'='.repeat(78));
  if(idxLog) console.log('  log: '+idxLog);
  console.log(`  geometries=${r.geoms}  curveVerts=${r.curveTotal}  nonCurveVerts=${r.nonCurveTotal}`);
  console.log(`  index buffers: Uint16=${r.u16}  Uint32=${r.u32}  (of which <65536 verts: ${r.u32small})`);
  const G=[
    ['G-MEP-1  the pass actually smoothed curve-class normals', r.curveTotal>0 && r.curveChanged>0],
    [`G-MEP-2  NON-curve surfaces byte-identical (changed=${r.nonCurveChanged}, maxDelta=${r.maxNonCurveDelta})`,
      r.nonCurveChanged===0],
    [`G-MEP-3  a real population was judged (curveChanged=${r.curveChanged}/${r.curveTotal})`, r.curveTotal>0],
    [`G-MEP-4  §IDX16 left no small geometry on Uint32 (${r.u32small} remaining)`, r.u32small===0],
    ['G-MEP-5  no page errors', errs.length===0]
  ];
  let pass=0; G.forEach(([n,v])=>{console.log('  '+(v?'PASS':'FAIL')+'  '+n); if(v)pass++;});
  if(errs.length) console.log('  errors: '+errs.slice(0,3).join(' | '));
  if(r.curveTotal===0) console.log('\n  INCONCLUSIVE — no curve-class vertices existed; G-MEP-2 alone proves nothing.');
  else console.log(`\n  ${pass}/${G.length} — ${pass===G.length?'PASS':'FAIL'}`);
  await b.close();
})();
