// PROBE — where the tab's memory actually goes, measured on the live scene, so the levers can be
// ranked by size instead of by plausibility. R6 (cache revalidation) is CLOSED; this looks for
// what is left. Reports: JS heap, three.js resource counts, real geometry attribute bytes broken
// down by attribute, the saving available from welding (the shading probe measured weldRatio
// 0.11-0.29, i.e. vertices duplicated 3.4-9.3x while the index is already present), texture bytes,
// and the sql.js WASM heap that holds each whole DB file.
const puppeteer=require('/home/red1/bim-compiler/node_modules/puppeteer');
const PORT=process.env.PORT||8521, BLD=process.env.BLD||'Terminal';
process.on('unhandledRejection',e=>{console.error('UNHANDLED_REJECTION: '+(e&&e.stack||e));process.exit(1);});
const MB=n=>(n/1048576).toFixed(1)+' MB';
(async()=>{
  const b=await puppeteer.launch({headless:'new',
    args:['--use-gl=angle','--use-angle=swiftshader','--no-sandbox','--enable-unsafe-swiftshader',
          '--js-flags=--expose-gc'],
    protocolTimeout:900000});
  const p=await b.newPage(); await p.setViewport({width:900,height:500});
  await p.goto(process.env.URL || `http://localhost:${PORT}/viewer/viewer.html?db=/buildings/${BLD}_extracted.db`,
    {waitUntil:'domcontentloaded',timeout:120000});
  await p.waitForFunction(()=>window.APP&&window.APP.scene,{timeout:180000});
  await p.waitForFunction(()=>window.APP.streaming===true||(window.APP.streamQueue||[]).length>0,
    {timeout:300000,polling:250}).catch(()=>{});
  await p.waitForFunction(()=>!window.APP.streaming||(window.APP.streamIdx>=(window.APP.streamQueue||[]).length),
    {timeout:900000,polling:1000}).catch(()=>{});
  const r=await p.evaluate(()=>{
    const A=window.APP, seen=new Set();
    let attrBytes={}, total=0, verts=0, idxBytes=0, weldableBytes=0, geoms=0;
    const curveClasses={IfcFlowFitting:1,IfcFlowTerminal:1,IfcFlowController:1,IfcFlowSegment:1,
                        IfcPipeSegment:1,IfcPipeFitting:1,IfcDuctSegment:1,IfcDuctFitting:1};
    let curveBytes=0, curveUniqRatioSum=0, curveGeoms=0;
    A.scene.traverse(o=>{
      if(!o.isMesh||!o.geometry) return;
      const g=o.geometry; if(seen.has(g.uuid)) return; seen.add(g.uuid); geoms++;
      const cls=(o.userData&&(o.userData.ifc_class||o.userData.ifcClass))||'';
      let gBytes=0;
      for(const k in g.attributes){
        const a=g.attributes[k]; const bytes=a.array.byteLength;
        attrBytes[k]=(attrBytes[k]||0)+bytes; total+=bytes; gBytes+=bytes;
        if(k==='position') verts+=a.count;
      }
      if(g.index){ idxBytes+=g.index.array.byteLength; total+=g.index.array.byteLength; }
      // welding saving estimate: unique positions / total, on a sampled basis for big meshes
      const pos=g.attributes.position; if(pos&&pos.count>=12&&pos.count<=60000){
        const key=v=>Math.round(v*1e4)/1e4; const set=new Set();
        for(let i=0;i<pos.count;i++) set.add(key(pos.getX(i))+','+key(pos.getY(i))+','+key(pos.getZ(i)));
        const ratio=set.size/pos.count;
        weldableBytes+=gBytes*(1-ratio);
        if(curveClasses[cls]){ curveBytes+=gBytes; curveUniqRatioSum+=ratio; curveGeoms++; }
      }
    });
    let texBytes=0, texN=0;
    const tseen=new Set();
    A.scene.traverse(o=>{ const m=o.material; if(!m) return;
      (Array.isArray(m)?m:[m]).forEach(mm=>{ for(const k in mm){ const t=mm[k];
        if(t&&t.isTexture&&t.image&&!tseen.has(t.uuid)){ tseen.add(t.uuid); texN++;
          const w=t.image.width||0,h=t.image.height||0; texBytes+=w*h*4*1.33; } } }); });
    const info=A.renderer?A.renderer.info:null;
    const pm=(performance&&performance.memory)?performance.memory:null;
    return { heapUsed:pm?pm.usedJSHeapSize:null, heapTotal:pm?pm.totalJSHeapSize:null,
             heapLimit:pm?pm.jsHeapSizeLimit:null,
             geoms, verts, attrBytes, idxBytes, total, weldableBytes,
             curveBytes, curveGeoms, curveAvgRatio:curveGeoms?curveUniqRatioSum/curveGeoms:null,
             texBytes, texN,
             rGeom:info?info.memory.geometries:null, rTex:info?info.memory.textures:null,
             meshes:(()=>{let n=0;A.scene.traverse(o=>{if(o.isMesh)n++;});return n;})() };
  });
  console.log('='.repeat(78)+`\n§MEM_PROBE — ${BLD}\n`+'='.repeat(78));
  console.log(`JS heap used        ${r.heapUsed?MB(r.heapUsed):'n/a'}   total ${r.heapTotal?MB(r.heapTotal):'n/a'}   limit ${r.heapLimit?MB(r.heapLimit):'n/a'}`);
  console.log(`meshes ${r.meshes}   uniqueGeometries ${r.geoms}   vertices ${r.verts.toLocaleString()}`);
  console.log(`three.js info: geometries=${r.rGeom} textures=${r.rTex}`);
  console.log('\ngeometry attribute bytes (GPU + JS copies):');
  Object.keys(r.attrBytes).sort((a,b)=>r.attrBytes[b]-r.attrBytes[a])
    .forEach(k=>console.log('   '+k.padEnd(12)+MB(r.attrBytes[k]).padStart(10)));
  console.log('   '+'index'.padEnd(12)+MB(r.idxBytes).padStart(10));
  console.log('   '+'TOTAL'.padEnd(12)+MB(r.total).padStart(10));
  console.log(`\nweldable waste (duplicated vertices, all classes): ${MB(r.weldableBytes)}  = ${(100*r.weldableBytes/r.total).toFixed(1)}% of geometry bytes`);
  console.log(`curve-class geometry: ${r.curveGeoms} geoms, ${MB(r.curveBytes)}, avg uniqueRatio ${r.curveAvgRatio?r.curveAvgRatio.toFixed(3):'n/a'}`);
  console.log(`textures: ${r.texN} → ~${MB(r.texBytes)} decoded`);
  await b.close();
})();
