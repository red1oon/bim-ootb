// Is A.mepSmoothNormals actually reachable at staging time on the LIVE build? The log shows staging
// completing with no §MEP_SMOOTH_NORMALS line at all, which means the guard was false, not that the
// pass ran and found nothing (it logs unconditionally).
const puppeteer=require('/home/red1/bim-compiler/node_modules/puppeteer');
(async()=>{
  const b=await puppeteer.launch({headless:'new',
    args:['--use-gl=angle','--use-angle=swiftshader','--no-sandbox','--enable-unsafe-swiftshader'],
    protocolTimeout:600000});
  const p=await b.newPage(); await p.setViewport({width:800,height:450});
  p.on('pageerror',e=>console.log('  PAGEERROR '+e.message.slice(0,200)));
  p.on('console',m=>{const t=m.text(); if(/§MEP_SMOOTH|§PHOTO_STAGING|LOAD_FAIL|is not a function/.test(t)) console.log('  '+t.slice(0,160));});
  await p.goto('http://localhost:8521/viewer/viewer.html?db=/buildings/Clinic_extracted.db',
    {waitUntil:'domcontentloaded',timeout:120000});
  await p.waitForFunction(()=>window.APP&&window.APP.scene,{timeout:180000});
  const early = await p.evaluate(()=>({
    mep: typeof window.APP.mepSmoothNormals,
    sibling: typeof window.APP.drawBuildingBoxes,   // assigned 54 lines ABOVE it in the same scope
    setupFn: typeof window.setupStreaming,
    keys: Object.keys(window.APP).filter(k=>/^_?mep|drawBuilding|triplanarMaterials/i.test(k))
  }));
  console.log('at scene-ready :', JSON.stringify(early));
  await p.waitForFunction(()=>window.APP.streaming===true||(window.APP.streamQueue||[]).length>0,
    {timeout:300000,polling:250}).catch(()=>{});
  await p.waitForFunction(()=>!window.APP.streaming||(window.APP.streamIdx>=(window.APP.streamQueue||[]).length),
    {timeout:900000,polling:1000}).catch(()=>{});
  await p.evaluate(()=>window.APP.startStillRefine&&window.APP.startStillRefine());
  await new Promise(r=>setTimeout(r,25000));
  const late = await p.evaluate(()=>({
    mep: typeof window.APP.mepSmoothNormals,
    sibling: typeof window.APP.drawBuildingBoxes,
    triMats: (window.APP._triplanarMaterials||[]).length
  }));
  console.log('after streaming:', JSON.stringify(late));
  await b.close();
})();
