// Is CURVE_MIN_DISTINCT=16 actually the right cut ON HOSPITAL? G-MEP-2 passed there, but the
// witness SHARES that threshold — so if 16 is too permissive on this building's geometry, code and
// witness would be wrong together and both still report green. This measures the threshold itself:
// distinct facet directions per span, grouped by IFC class, INDEPENDENT of any gate.
// The question it answers: do wall/slab spans really score below 16 on Hospital?
const puppeteer=require('/home/red1/bim-compiler/node_modules/puppeteer');
const PORT=process.env.PORT||8521, BLD=process.env.BLD||'Hospital';
process.on('unhandledRejection',e=>{console.error('UNHANDLED: '+(e&&e.stack||e));process.exit(1);});
(async()=>{
  const b=await puppeteer.launch({headless:'new',
    args:['--use-gl=angle','--use-angle=swiftshader','--no-sandbox','--enable-unsafe-swiftshader'],
    protocolTimeout:1800000});
  const p=await b.newPage(); await p.setViewport({width:800,height:450});
  await p.goto(`http://localhost:${PORT}/viewer/viewer.html?db=/buildings/${BLD}_extracted.db`,
    {waitUntil:'domcontentloaded',timeout:180000});
  await p.waitForFunction(()=>window.APP&&window.APP.scene,{timeout:240000});
  await p.waitForFunction(()=>window.APP.streaming===true||(window.APP.streamQueue||[]).length>0,
    {timeout:300000,polling:250}).catch(()=>{});
  await p.waitForFunction(()=>!window.APP.streaming||(window.APP.streamIdx>=(window.APP.streamQueue||[]).length),
    {timeout:1500000,polling:2000}).catch(()=>{});
  const r=await p.evaluate(()=>{
    const A=window.APP, byCls={};
    const meas=(g,st,ct)=>{ const seen=new Set(), n=g.attributes.normal, step=Math.max(1,Math.floor(ct/192));
      for(let i=st;i<st+ct;i+=step){ const v=g.index.getX(i);
        seen.add(Math.round(n.getX(v)*8)+','+Math.round(n.getY(v)*8)+','+Math.round(n.getZ(v)*8));
        if(seen.size>64) break; }
      return seen.size; };
    const add=(cls,d)=>{ const k=cls||'(none)'; (byCls[k]=byCls[k]||[]).push(d); };
    const seen=new Set();
    A.scene.traverse(o=>{
      if(!(o.isMesh||o.isBatchedMesh||o.isInstancedMesh)||!o.geometry) return;
      const g=o.geometry; if(!g.index||!g.attributes.normal) return;
      if(seen.has(g.uuid)&&!o.isBatchedMesh) return; seen.add(g.uuid);
      const cls=(o.userData&&(o.userData.ifc_class||o.userData.ifcClass))||'';
      const rngs=(A._mergedMeta&&A._mergedMeta[o.id])||null;
      if(rngs&&rngs.length){ rngs.forEach(rg=>add(rg.ifcClass, meas(g,rg.idxStart,rg.idxCount))); }
      else if(o.isBatchedMesh&&o._geometryInfo){
        o._geometryInfo.slice(0,4000).forEach(e=>{ const st=(e.start!=null)?e.start:e.indexStart,
          ct=(e.count!=null)?e.count:e.indexCount; if(st!=null&&ct>0) add(cls||'(batched)', meas(g,st,ct)); });
      } else add(cls||'(instanced/other)', meas(g,0,g.index.count));
    });
    return Object.keys(byCls).map(k=>{const v=byCls[k].sort((a,b)=>a-b);
      return {cls:k,n:v.length,p50:v[Math.floor(v.length*0.5)],p90:v[Math.floor(v.length*0.9)],
              max:v[v.length-1], pctGE16:+(100*v.filter(x=>x>=16).length/v.length).toFixed(1)};})
      .sort((a,b)=>b.n-a.n).slice(0,14);
  });
  console.log('='.repeat(86)+`\n§THRESHOLD_PROBE — ${BLD}: distinct facet directions per element span\n`+'='.repeat(86));
  console.log('class'.padEnd(28)+'spans'.padStart(7)+'p50'.padStart(6)+'p90'.padStart(6)+'max'.padStart(6)+'  %>=16 (would smooth)');
  r.forEach(x=>console.log(String(x.cls).slice(0,28).padEnd(28)+String(x.n).padStart(7)+
    String(x.p50).padStart(6)+String(x.p90).padStart(6)+String(x.max).padStart(6)+'   '+x.pctGE16+'%'));
  await b.close();
})();
