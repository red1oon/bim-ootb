// Does Clinic actually RENDER its curtain walls? The §NOGEO_COMPOSE patch (PR #1267) is committed
// and served, but "shipped" and "applied" and "visible" are three different things.
const puppeteer=require('/home/red1/bim-compiler/node_modules/puppeteer');
const PORT=process.env.PORT||8521, BLD=process.env.BLD||'Clinic';
process.on('unhandledRejection',e=>{console.error('UNHANDLED: '+(e&&e.stack||e));process.exit(1);});
(async()=>{
  const b=await puppeteer.launch({headless:'new',
    args:['--use-gl=angle','--use-angle=swiftshader','--no-sandbox','--enable-unsafe-swiftshader'],
    protocolTimeout:900000});
  const p=await b.newPage(); await p.setViewport({width:900,height:500});
  const tags=[];
  p.on('console',m=>{const t=m.text(); if(/§PATCH_APPLY|§NOGEO_COMPOSE|§DB_404|rel_aggregates|§CONTRACT_CHECK/.test(t)) tags.push(t.slice(0,190));});
  await p.goto(`http://localhost:${PORT}/viewer/viewer.html?db=/buildings/${BLD}_extracted.db`,
    {waitUntil:'domcontentloaded',timeout:120000});
  await p.waitForFunction(()=>window.APP&&window.APP.scene,{timeout:180000});
  await p.waitForFunction(()=>!window.APP.streaming||(window.APP.streamIdx>=(window.APP.streamQueue||[]).length),
    {timeout:900000,polling:1000}).catch(()=>{});
  const r=await p.evaluate(async()=>{
    const A=window.APP, out={};
    function q(sql){ try{ const r=A.db.exec(sql); return r.length?r[0].values:[]; }catch(e){ return 'ERR:'+e.message; } }
    out.classCounts = q("SELECT ifc_class, COUNT(*) FROM elements_meta WHERE ifc_class IN ('IfcCurtainWall','IfcPlate','IfcMember','IfcWindow','IfcRoof','IfcStair','IfcRamp') GROUP BY 1");
    out.hasRelAgg = q("SELECT COUNT(*) FROM rel_aggregates");
    // how many of those elements have a real transform row (i.e. can be placed)?
    out.withTransform = q("SELECT m.ifc_class, COUNT(*) FROM elements_meta m JOIN element_transforms t ON t.guid=m.guid WHERE m.ifc_class IN ('IfcCurtainWall','IfcPlate','IfcMember','IfcWindow') GROUP BY 1");
    // and how many actually reached the SCENE?
    const inScene={};
    A.scene.traverse(o=>{ if(!o.isMesh) return;
      const c=(o.userData&&(o.userData.ifc_class||o.userData.ifcClass))||''; if(c) inScene[c]=(inScene[c]||0)+1; });
    out.meshesByClass = Object.keys(inScene).filter(k=>/CurtainWall|Plate|Member|Window/.test(k)).map(k=>k+':'+inScene[k]);
    out.guidMap = A._mergedIndex ? Object.keys(A._mergedIndex).length : null;
    return out;
  });
  console.log('='.repeat(72)+`\n§CLINIC_GLASS probe\n`+'='.repeat(72));
  tags.slice(0,8).forEach(t=>console.log('  '+t));
  console.log('  class counts (DB)   : '+JSON.stringify(r.classCounts));
  console.log('  rel_aggregates rows : '+JSON.stringify(r.hasRelAgg));
  console.log('  with transform row  : '+JSON.stringify(r.withTransform));
  console.log('  meshes in scene     : '+JSON.stringify(r.meshesByClass));
  await b.close();
})();
