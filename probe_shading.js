// PROBE — is the "jagged / not fully rounded" look a SHADING fault (flat/split normals) or genuine
// low tessellation? These need opposite fixes, so guessing is expensive. Measures the REAL streamed
// geometry in the browser, per IFC class:
//   weldRatio      unique positions / total vertices. ~1.0 = welded; ~0.33 = every triangle owns its
//                  own 3 vertices, which forces FLAT shading no matter what flatShading:false says.
//   splitNormalPct of positions that appear more than once, the share carrying normals that differ
//                  by >5deg — the direct signature of hard, per-face normals.
//   distinctNormals how many distinct facet directions a shape has. A round duct wants dozens; an
//                  8-sided prism reports ~8, and that is tessellation, which normals cannot fix.
const puppeteer=require('/home/red1/bim-compiler/node_modules/puppeteer');
const PORT=process.env.PORT||8521, BLD=process.env.BLD||'Clinic';
process.on('unhandledRejection',e=>{console.error('UNHANDLED_REJECTION: '+(e&&e.stack||e));process.exit(1);});
(async()=>{
  const b=await puppeteer.launch({headless:'new',
    args:['--use-gl=angle','--use-angle=swiftshader','--no-sandbox','--enable-unsafe-swiftshader'],
    protocolTimeout:900000});
  const p=await b.newPage(); await p.setViewport({width:900,height:500});
  await p.goto(`http://localhost:${PORT}/viewer/viewer.html?db=/buildings/${BLD}_extracted.db`,
    {waitUntil:'domcontentloaded',timeout:120000});
  await p.waitForFunction(()=>window.APP&&window.APP.scene,{timeout:180000});
  await p.waitForFunction(()=>window.APP.streaming===true||(window.APP.streamQueue||[]).length>0,
    {timeout:120000,polling:250}).catch(()=>{});
  await p.waitForFunction(()=>!window.APP.streaming||(window.APP.streamIdx>=(window.APP.streamQueue||[]).length),
    {timeout:600000,polling:1000}).catch(()=>{});
  const r=await p.evaluate(()=>{
    const A=window.APP, byClass={}, seen=new Set(); let meshes=0;
    A.scene.traverse(o=>{
      if(!o.isMesh||!o.geometry||!o.geometry.attributes||!o.geometry.attributes.position) return;
      meshes++;
      const g=o.geometry; if(seen.has(g.uuid)) return; seen.add(g.uuid);
      const cls=(o.userData&&(o.userData.ifc_class||o.userData.ifcClass))||o.name||'(unknown)';
      const pos=g.attributes.position, nor=g.attributes.normal;
      const n=pos.count; if(n<12||n>60000) return;
      const key=v=>Math.round(v*1e4)/1e4;
      const map=new Map(); const normSet=new Set();
      for(let i=0;i<n;i++){
        const k=key(pos.getX(i))+','+key(pos.getY(i))+','+key(pos.getZ(i));
        let e=map.get(k); if(!e){e=[];map.set(k,e);}
        if(nor){ const nx=nor.getX(i),ny=nor.getY(i),nz=nor.getZ(i);
          e.push([nx,ny,nz]);
          normSet.add(Math.round(nx*20)+','+Math.round(ny*20)+','+Math.round(nz*20)); }
      }
      let dup=0, split=0;
      map.forEach(arr=>{ if(arr.length<2) return; dup++;
        for(let i=1;i<arr.length;i++){
          const d=arr[0][0]*arr[i][0]+arr[0][1]*arr[i][1]+arr[0][2]*arr[i][2];
          if(d<0.996){ split++; break; }   // >5deg apart
        }});
      const rec=byClass[cls]||(byClass[cls]={geoms:0,verts:0,uniq:0,dup:0,split:0,distinct:0,indexed:0,tris:0});
      rec.geoms++; rec.verts+=n; rec.uniq+=map.size; rec.dup+=dup; rec.split+=split;
      rec.distinct+=normSet.size; rec.indexed+=g.index?1:0;
      rec.tris+=(g.index?g.index.count:n)/3;
    });
    const out=Object.keys(byClass).map(k=>{const v=byClass[k];return {cls:k,geoms:v.geoms,
      weldRatio:+(v.uniq/v.verts).toFixed(3), splitPct:v.dup?+(100*v.split/v.dup).toFixed(1):0,
      avgDistinctNormals:+(v.distinct/v.geoms).toFixed(1), indexedPct:+(100*v.indexed/v.geoms).toFixed(0),
      avgTris:Math.round(v.tris/v.geoms)};})
      .sort((a,b)=>b.geoms-a.geoms).slice(0,12);
    return {meshes,uniqueGeoms:seen.size,rows:out};
  });
  console.log('='.repeat(96)+`\n§SHADE_PROBE — ${BLD}   meshes=${r.meshes} uniqueGeometries=${r.uniqueGeoms}\n`+'='.repeat(96));
  console.log('class'.padEnd(26)+'geoms'.padStart(6)+'weldRatio'.padStart(11)+'splitNorm%'.padStart(12)+
              'distinctN'.padStart(11)+'indexed%'.padStart(10)+'avgTris'.padStart(9));
  r.rows.forEach(x=>console.log(String(x.cls).slice(0,26).padEnd(26)+String(x.geoms).padStart(6)+
    String(x.weldRatio).padStart(11)+String(x.splitPct).padStart(12)+
    String(x.avgDistinctNormals).padStart(11)+String(x.indexedPct).padStart(10)+String(x.avgTris).padStart(9)));
  console.log('\nREADING: weldRatio near 0.33 + high splitNorm% = FLAT NORMALS (cheap to fix).');
  console.log('         weldRatio near 1.0 + low distinctN      = LOW TESSELLATION (normals cannot fix).');
  await b.close();
})();
